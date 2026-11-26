import "server-only"
import { createHash, timingSafeEqual } from "node:crypto"
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm"
import { flats, listings, parseErrors, scrapeRuns } from "@/db/schema"
import { ensureSchema, getDb } from "@/lib/db"
import { normalizeDistrict } from "@/lib/districts"
import { stripPhoneNumbers } from "@/lib/privacy"
import { parsePrice } from "@/lib/rent-price"
import { MAX_IMAGES, canonicalListingUrl, isUneguiPhotoUrl } from "@/lib/unegui-parser"

// ---------------------------------------------------------------- auth

/**
 * Spec (Safety): the ingest secret lives only on the server and in n8n/scraper.
 * Callers send it as `x-ingest-secret`. Without INGEST_SECRET configured, ingest is closed.
 */
export function checkIngestSecret(request: Request): Response | null {
  const expected = process.env.INGEST_SECRET
  if (!expected) return Response.json({ error: "Ingest is disabled: INGEST_SECRET is not configured on the server" }, { status: 503 })
  const given = request.headers.get("x-ingest-secret") ?? ""
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  return null
}

// ---------------------------------------------------------------- input validation

/**
 * What a scraper may send. Spec N1/N3: no photos, no agent names, no phone numbers —
 * unknown fields (sellerName, phone …) are ignored, never stored. Photos: only the listing's own
 * cdn*.unegui.mn URLs are kept (shown by URL; files are never downloaded or stored).
 */
export interface IngestInput {
  sourceUrl: string
  title: string
  rawPrice: string | number | null
  rawDescription: string | null
  district: string | null
  rooms: number | null
  area: number | null
  address: string | null
  imageUrls: string[]
}

export type Validation = { ok: true; value: IngestInput } | { ok: false; error: string }

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

export function validateListing(input: unknown): Validation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, error: "Each listing must be a JSON object" }
  const record = input as Record<string, unknown>
  if (record.priceType !== undefined && record.priceType !== "rent") return { ok: false, error: "Only rent listings (priceType: \"rent\") are accepted" }
  if (typeof record.sourceUrl !== "string") return { ok: false, error: "sourceUrl is required" }
  const sourceUrl = canonicalListingUrl(record.sourceUrl)
  if (!sourceUrl) return { ok: false, error: "sourceUrl must be a unegui.mn /adv/<id>_… listing URL" }
  const title = optionalText(record.title)
  if (!title) return { ok: false, error: "title is required" }
  if (record.rawPrice !== undefined && record.rawPrice !== null && typeof record.rawPrice !== "string" && typeof record.rawPrice !== "number") {
    return { ok: false, error: "rawPrice must be a string, number or null" }
  }
  const rooms = optionalNumber(record.rooms)
  const area = optionalNumber(record.area)
  if (rooms !== null && (!Number.isInteger(rooms) || rooms < 0 || rooms > 20)) return { ok: false, error: "rooms must be an integer 0–20" }
  if (area !== null && (area <= 0 || area > 2000)) return { ok: false, error: "area must be between 0 and 2000 m²" }
  const description = optionalText(record.rawDescription)
  return {
    ok: true,
    value: {
      sourceUrl,
      title: stripPhoneNumbers(title),
      rawPrice: (record.rawPrice as string | number | null | undefined) ?? null,
      rawDescription: description ? stripPhoneNumbers(description) : null,
      district: optionalText(record.district),
      rooms,
      area,
      address: optionalText(record.address),
      imageUrls: Array.isArray(record.imageUrls) ? [...new Set(record.imageUrls.filter(isUneguiPhotoUrl))].slice(0, MAX_IMAGES) : [],
    },
  }
}

/** Short, irreversible reference to a photo URL (used only to spot the same photos re-posted). */
export function photoRef(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 20)
}

// ---------------------------------------------------------------- operations

/** /api/ingest/check — which of these listing URLs are not stored yet. */
export async function findNewUrls(urls: string[]): Promise<{ newUrls: string[]; existing: number; invalid: string[] }> {
  await ensureSchema()
  const canonical = new Map<string, string>()
  const invalid: string[] = []
  for (const url of urls) {
    const normalized = canonicalListingUrl(url)
    if (normalized) canonical.set(normalized, url)
    else invalid.push(url)
  }
  if (canonical.size === 0) return { newUrls: [], existing: 0, invalid }
  const stored = await getDb().select({ sourceUrl: listings.sourceUrl }).from(listings).where(inArray(listings.sourceUrl, [...canonical.keys()]))
  const storedSet = new Set(stored.map((row) => row.sourceUrl))
  const newUrls = [...canonical.keys()].filter((url) => !storedSet.has(url))
  return { newUrls, existing: storedSet.size, invalid }
}

export type IngestResult =
  | { index: number; status: "created" | "updated"; listingId: number; flatId: number; price: ReturnType<typeof parsePrice> }
  | { index: number; status: "rejected"; error: string }

/**
 * Save listings. A known sourceUrl updates its listing (FR-2: never saved twice) and keeps
 * its flat; a new one gets its own flat. Photo-vector duplicate matching (FR-8) links
 * listings to one flat later; it needs the HF/Pinecone keys, so it is not done here.
 */
export async function ingestListings(inputs: unknown[]): Promise<IngestResult[]> {
  await ensureSchema()
  const db = getDb()
  const results: IngestResult[] = []

  for (let index = 0; index < inputs.length; index += 1) {
    const validation = validateListing(inputs[index])
    if (!validation.ok) {
      results.push({ index, status: "rejected", error: validation.error })
      continue
    }
    const input = validation.value
    const price = parsePrice(input.rawPrice, "rent")
    const validAmount = price.status === "valid" ? price.amount : null // needs_review never becomes the flat price
    const district = normalizeDistrict(input.district) ?? normalizeDistrict(input.title) ?? normalizeDistrict(input.rawDescription)
    const area = input.area === null ? null : String(input.area)
    const status = price.status === "valid" ? "active" : "needs_review"
    const photoRefs = input.imageUrls.map(photoRef)
    const listingFields = {
      title: input.title,
      rawDescription: input.rawDescription,
      rawPrice: input.rawPrice === null ? null : String(input.rawPrice),
      cleanPrice: price.amount,
      district,
      rooms: input.rooms,
      area,
      address: input.address,
      // N1 + clean UI: the ad's own (watermarked) photos are never stored or shown — only hashes for FR-8.
      imageUrl: null,
      photoRefs: photoRefs.length ? photoRefs.join(",") : null,
      status,
      dealType: "rent",
      source: "unegui",
    }

    const [existing] = await db.select({ id: listings.id, flatId: listings.flatId, cleanPrice: listings.cleanPrice }).from(listings).where(eq(listings.sourceUrl, input.sourceUrl)).limit(1)
    if (existing?.flatId) {
      // Keep the flat's photos (imageUrl) on updates; remember the old price when it changes ("Үнэ буурсан").
      const { imageUrl: _keepPhotos, ...updateFields } = listingFields
      void _keepPhotos
      const priceChanged = existing.cleanPrice !== null && price.amount !== null && price.amount !== existing.cleanPrice
      await db.update(listings)
        .set({ ...updateFields, ...(priceChanged ? { previousPrice: existing.cleanPrice, priceChangedAt: new Date() } : {}) })
        .where(eq(listings.id, existing.id))
      results.push({ index, status: "updated", listingId: existing.id, flatId: existing.flatId, price })
      continue
    }

    // FR-8 (exact-match version): sharing ≥2 identical photo URLs with an existing listing means
    // the same flat posted again, so this listing joins that flat. Different flats therefore
    // never share photos. Vector similarity (CLIP/Pinecone) can replace this later.
    const sameFlatId = await findFlatBySharedPhotos(photoRefs)
    if (sameFlatId !== null) {
      const [listing] = await db.insert(listings).values({ ...listingFields, flatId: sameFlatId, sourceUrl: input.sourceUrl }).returning({ id: listings.id })
      results.push({ index, status: "created", listingId: listing.id, flatId: sameFlatId, price })
      continue
    }

    const [flat] = await db.insert(flats).values({
      district,
      rooms: input.rooms,
      area,
      address: input.address,
      dealType: "rent",
      lowestPrice: validAmount,
      pricePerM2: validAmount !== null && input.area ? String(Math.round(validAmount / input.area)) : null,
    }).returning({ id: flats.id })
    const [listing] = await db.insert(listings).values({ ...listingFields, flatId: flat.id, sourceUrl: input.sourceUrl }).returning({ id: listings.id })
    results.push({ index, status: "created", listingId: listing.id, flatId: flat.id, price })
  }
  return results
}

/** The flat whose listings share at least 2 photo URLs with these (1 if the listing has a single photo). */
async function findFlatBySharedPhotos(refs: string[]): Promise<number | null> {
  if (refs.length === 0) return null
  const needed = Math.min(2, refs.length)
  const candidates = await getDb()
    .select({ flatId: listings.flatId, photoRefs: listings.photoRefs })
    .from(listings)
    .where(and(isNotNull(listings.photoRefs), ne(listings.source, "seed"), sql`string_to_array(${listings.photoRefs}, ',') && string_to_array(${refs.join(",")}, ',')`))
  const wanted = new Set(refs)
  for (const candidate of candidates) {
    const shared = (candidate.photoRefs ?? "").split(",").filter((ref) => wanted.has(ref)).length
    if (candidate.flatId !== null && shared >= needed) return candidate.flatId
  }
  return null
}

export async function startScrapeRun(source: "live" | "fixtures"): Promise<number> {
  await ensureSchema()
  const [run] = await getDb().insert(scrapeRuns).values({ source, status: "running" }).returning({ id: scrapeRuns.id })
  return run.id
}

export interface ScrapeRunUpdate {
  status?: "running" | "ok" | "blocked" | "failed"
  source?: "live" | "fixtures"
  pagesRead?: number
  listingsSeen?: number
  newCount?: number
  failedCount?: number
  error?: string | null
  parseErrors?: Array<{ url: string; message: string }>
}

export async function updateScrapeRun(runId: number, update: ScrapeRunUpdate): Promise<boolean> {
  await ensureSchema()
  const db = getDb()
  const { parseErrors: errors, ...fields } = update
  const finished = fields.status && fields.status !== "running"
  const rows = await db.update(scrapeRuns)
    .set({ ...fields, error: fields.error?.slice(0, 2000), ...(finished ? { finishedAt: sql`now()` } : {}) })
    .where(eq(scrapeRuns.id, runId))
    .returning({ id: scrapeRuns.id })
  if (rows.length === 0) return false
  // FR-5: a selector that finds nothing writes a row and never stops the run.
  if (errors?.length) {
    await db.insert(parseErrors).values(errors.slice(0, 500).map((item) => ({ url: item.url.slice(0, 500), errorMessage: item.message.slice(0, 1000) })))
  }
  return true
}

/** Admin dashboard data: recent runs, and "stale" when the last run started over 45 minutes ago. */
export async function getScrapeStatus(limit = 10) {
  await ensureSchema()
  const runs = await getDb().select().from(scrapeRuns).orderBy(sql`${scrapeRuns.id} DESC`).limit(limit)
  const last = runs[0]
  const minutesSinceLastRun = last?.startedAt ? Math.round((Date.now() - new Date(last.startedAt).getTime()) / 60_000) : null
  return {
    lastRun: last ?? null,
    minutesSinceLastRun,
    stale: minutesSinceLastRun === null || minutesSinceLastRun > 45,
    runs,
  }
}

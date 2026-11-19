import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { cleanPrice } from "@/lib/price-cleaner"
import { flats, listings } from "@/db/schema"
import { eq, inArray, notInArray } from "drizzle-orm"

type IngestInput = {
  sourceUrl: string
  title: string
  rawPrice?: string | number | null
  rawDescription?: string | null
  district?: string | null
  rooms?: number | null
  area?: number | null
  imageUrl?: string | null
}

type ValidationResult = { ok: true; value: IngestInput } | { ok: false; error: string }

function optionalText(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== "string") throw new Error(`${field} must be a string or null`)
  return value.trim() || null
}

function optionalNumber(value: unknown, field: string): number | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a finite number or null`)
  return value
}

function validateListing(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Each listing must be a JSON object" }
  }

  const record = input as Record<string, unknown>
  if (typeof record.sourceUrl !== "string" || typeof record.title !== "string" || !record.title.trim()) {
    return { ok: false, error: "sourceUrl and a non-empty title are required" }
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(record.sourceUrl)
  } catch {
    return { ok: false, error: "sourceUrl must be an absolute URL" }
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { ok: false, error: "sourceUrl must use http or https" }
  }

  if (record.rawPrice !== undefined && record.rawPrice !== null && typeof record.rawPrice !== "string" && typeof record.rawPrice !== "number") {
    return { ok: false, error: "rawPrice must be a string, number, or null" }
  }

  try {
    const rooms = optionalNumber(record.rooms, "rooms")
    const area = optionalNumber(record.area, "area")
    if (rooms !== undefined && rooms !== null && (!Number.isInteger(rooms) || rooms < 0)) {
      return { ok: false, error: "rooms must be a non-negative integer or null" }
    }
    if (area !== undefined && area !== null && area < 0) {
      return { ok: false, error: "area must be non-negative or null" }
    }

    return {
      ok: true,
      value: {
        sourceUrl: parsedUrl.toString(),
        title: record.title.trim(),
        rawPrice: record.rawPrice as string | number | null | undefined,
        rawDescription: optionalText(record.rawDescription, "rawDescription"),
        district: optionalText(record.district, "district"),
        rooms,
        area,
        imageUrl: optionalText(record.imageUrl, "imageUrl"),
      },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid listing data" }
  }
}

let sqlClient: ReturnType<typeof postgres> | undefined

function getDatabase() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured")

  sqlClient ??= postgres(databaseUrl, { max: 1, prepare: false })
  return drizzle(sqlClient)
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 })
  }

  const inputs = Array.isArray(payload) ? payload : [payload]
  if (inputs.length === 0) return Response.json({ error: "At least one listing is required" }, { status: 400 })
  if (inputs.length > 100) return Response.json({ error: "A maximum of 100 listings can be ingested at once" }, { status: 400 })

  const validated = inputs.map(validateListing)
  const validationErrors = validated.flatMap((result, index) => result.ok ? [] : [{ index, error: result.error }])
  const validListings = validated.flatMap((result) => result.ok ? [result.value] : [])
  if (validListings.length === 0) return Response.json({ error: "No valid listings to ingest", validationErrors }, { status: 400 })

  try {
    const db = getDatabase()
    const results = []

    for (let index = 0; index < inputs.length; index += 1) {
      const result = validated[index]
      if (!result.ok) {
        results.push({ index, status: "rejected", error: result.error })
        continue
      }

      const listing = result.value
const cleaned = cleanPrice(listing.rawPrice, listing.area)
const area = listing.area === undefined || listing.area === null ? null : String(listing.area)
const priceMillion = cleaned.priceMillion === null ? null : Math.round(cleaned.priceMillion)
const pricePerM2 =
  priceMillion !== null && listing.area && listing.area > 0
    ? String(Math.round((priceMillion * 1_000_000) / listing.area))
    : null

const [createdFlat] = await db
  .insert(flats)
  .values({
    district: listing.district ?? null,
    rooms: listing.rooms ?? null,
    area,
    lowestPrice: priceMillion,
    pricePerM2,
  })
  .returning({ id: flats.id })

await db
  .insert(listings)
  .values({
    flatId: createdFlat.id,
    sourceUrl: listing.sourceUrl,
    title: listing.title,
    rawDescription: listing.rawDescription ?? null,
    rawPrice: listing.rawPrice == null ? null : String(listing.rawPrice),
    cleanPrice: priceMillion,
    district: listing.district ?? null,
    rooms: listing.rooms ?? null,
    area,
    imageUrl: listing.imageUrl ?? null,
    status: cleaned.status === "valid" ? "active" : "needs_review",
  })
  .onConflictDoUpdate({
    target: listings.sourceUrl,
    set: {
      flatId: createdFlat.id,
      title: listing.title,
      rawPrice: listing.rawPrice == null ? null : String(listing.rawPrice),
      cleanPrice: priceMillion,
      district: listing.district ?? null,
      rooms: listing.rooms ?? null,
      area,
      status: cleaned.status === "valid" ? "active" : "needs_review",
      imageUrl: listing.imageUrl ?? null,
    },
  })

      results.push({
        index,
        status: "ingested",
        price: cleaned,
      })
    }

    return Response.json({ received: inputs.length, ingested: validListings.length, results, validationErrors })
  } catch (error) {
    console.error("Listing ingestion failed", error)
    return Response.json({ error: "Failed to ingest listings" }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const db = getDatabase()
    await db.delete(listings)
    await db.delete(flats)

    return Response.json({ ok: true, clearedAll: true })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to clear all records" },
      { status: 500 }
    )
  }
}
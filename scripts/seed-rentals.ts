/**
 * Load the cleaned unegui.mn rent listings (data/cleaned-rentals.json) into the database.
 *
 *   npm run data:clean   # CSV export → data/cleaned-rentals.json (dedupe, prices, grouping)
 *   npm run db:seed      # data/cleaned-rentals.json → flats + listings (replaces what is there)
 *
 * The file already groups ads of the same flat, so each flat becomes one `flats` row with one
 * `listings` row per ad. Prices are re-checked with the same parser the ingest API uses.
 *
 * Photos: every ad shows its OWN photos, copied by `npm run data:photos` into public/flats/
 * (unegui's CDN shows its logo when another site embeds the URL). No photo is shared by two
 * flats; a flat without any photo gets the placeholder.
 *
 * Privacy (spec N3): the cleaned file has no agent names or phone numbers; titles are passed
 * through stripPhoneNumbers once more before they are stored.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"
import dotenv from "dotenv"
import { normalizeDistrict } from "../lib/districts.ts"
import { computeFairPrices, type PricedListing } from "../lib/fair-price.ts"
import { stripPhoneNumbers } from "../lib/privacy.ts"
import { parseRentPrice } from "../lib/rent-price.ts"
import { MIGRATION_SQL, N3_CLEANUP_SQL } from "../lib/schema-sync.ts"

dotenv.config({ path: ".env.local", quiet: true })

interface CleanListing {
  sourceUrl: string
  title: string
  rawPrice: string
  previousRawPrice: string | null
  district: string
  place: string | null
  rooms: number
  area: number | null
  postedAt: string
  photos: string[]
  photoRefs: string[]
}
interface CleanFlat { key: string; district: string; place: string | null; rooms: number; area: number | null; listings: CleanListing[] }

const DATA_FILE = join(process.cwd(), "data", "cleaned-rentals.json")
const data = JSON.parse(readFileSync(DATA_FILE, "utf8")) as { flats: CleanFlat[] }
const flats = data.flats
if (!flats.length) throw new Error(`${DATA_FILE} has no flats — run npm run data:clean first`)
const listingCount = flats.reduce((sum, flat) => sum + flat.listings.length, 0)

// ---------------------------------------------------------------- photos: each ad's OWN photos
// The ads' own photos, copied once by `npm run data:photos` to public/flats/<photoRef>.webp.
// An ad without photos borrows them from another ad of the same flat; a flat with none at all
// gets the placeholder. A photo never appears on two flats.
const PLACEHOLDER = "/apartment-placeholder.svg"
const localPhotos = (listing: CleanListing) => listing.photoRefs
  .filter((ref) => existsSync(join(process.cwd(), "public", "flats", `${ref}.webp`)))
  .map((ref) => `/flats/${ref}.webp`)
const photoOwner = new Map<string, string>()
const galleries = new Map<CleanListing, string[]>()
let placeholders = 0
for (const flat of flats) {
  const own = (photos: string[]) => photos.filter((url) => (photoOwner.get(url) ?? flat.key) === flat.key)
  const flatPhotos = own([...new Set(flat.listings.flatMap(localPhotos))])
  for (const url of flatPhotos) photoOwner.set(url, flat.key)
  for (const listing of flat.listings) {
    const photos = own(localPhotos(listing))
    const chosen = photos.length ? photos : flatPhotos
    if (!chosen.length) placeholders++
    galleries.set(listing, chosen.length ? chosen : [PLACEHOLDER])
  }
}
const gallery = (listing: CleanListing) => galleries.get(listing)!.join(",")

const khorooOf = (place: string | null) => (place && /хороо$/i.test(place) ? place : null)

// ---------------------------------------------------------------- write
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is not configured (.env.local)")
const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => undefined })

try {
  await sql.unsafe(MIGRATION_SQL)
  await sql.unsafe(N3_CLEANUP_SQL) // spec N3: drop any stored agent/poster names

  const summary = await sql.begin(async (tx) => {
    const removed = await tx`DELETE FROM listings RETURNING id`
    await tx`DELETE FROM flats`

    const priced: PricedListing[] = []
    const statuses: Record<string, number> = {}
    for (const flat of flats) {
      const district = normalizeDistrict(flat.district)
      if (!district) throw new Error(`Unknown district "${flat.district}" in ${flat.key}`)
      const ads = flat.listings.map((listing) => ({ listing, parsed: parseRentPrice(listing.rawPrice), postedAt: new Date(listing.postedAt) }))
      const validPrices = ads.flatMap((ad) => ad.parsed.status === "valid" ? [ad.parsed.amount!] : [])
      const lowestPrice = validPrices.length ? Math.min(...validPrices) : null
      const [{ id: flatId }] = await tx`
        INSERT INTO flats (district, khoroo, complex, rooms, area, address, deal_type, lowest_price, price_per_m2, badge, created_at)
        VALUES (${district}, ${khorooOf(flat.place)}, ${khorooOf(flat.place) ? null : flat.place}, ${flat.rooms}, ${flat.area}, ${flat.place}, 'rent',
                ${lowestPrice}, ${lowestPrice === null || flat.area === null ? null : Math.round(lowestPrice / flat.area)}, NULL,
                ${new Date(Math.min(...ads.map((ad) => ad.postedAt.getTime())))})
        RETURNING id`
      for (const { listing, parsed, postedAt } of ads) {
        if (parsed.status === "invalid" || parsed.status === "missing") throw new Error(`Unparseable price "${listing.rawPrice}" (${listing.sourceUrl})`)
        const status = parsed.status === "needs_review" ? "needs_review" : "active"
        statuses[status] = (statuses[status] ?? 0) + 1
        const area = listing.area ?? flat.area
        // The crossed-out old price on a discounted ad → "Үнэ буурсан" (only a real drop is kept).
        const before = listing.previousRawPrice ? parseRentPrice(listing.previousRawPrice).amount : null
        const previousPrice = before !== null && parsed.amount !== null && before > parsed.amount ? before : null
        const [{ id }] = await tx`
          INSERT INTO listings (flat_id, source_url, source, title, raw_description, raw_price, clean_price, previous_price, price_changed_at,
                                district, rooms, area, image_url, photo_refs, status, deal_type, address, created_at)
          VALUES (${flatId}, ${listing.sourceUrl}, 'unegui', ${stripPhoneNumbers(listing.title)}, NULL,
                  ${listing.rawPrice}, ${parsed.amount}, ${previousPrice}, ${previousPrice === null ? null : postedAt},
                  ${district}, ${listing.rooms}, ${area}, ${gallery(listing)},
                  ${listing.photoRefs.join(",") || null}, ${status}, 'rent', ${listing.place}, ${postedAt})
          RETURNING id`
        priced.push({ id, district, rooms: listing.rooms, priceType: "rent", price: status === "active" ? parsed.amount : null, area, createdAt: postedAt })
      }
    }
    return { removed: removed.length, statuses, badges: [...computeFairPrices(priced).byListing.values()].map((result) => result.badge) }
  })

  const badgeCounts = summary.badges.reduce<Record<string, number>>((counts, badge) => ({ ...counts, [badge]: (counts[badge] ?? 0) + 1 }), {})
  console.log(`Removed ${summary.removed} previous listings.`)
  console.log(`Inserted ${flats.length} flats, ${listingCount} rent listings (${flats.filter((flat) => flat.listings.length > 1).length} flats posted 2–3 times).`)
  console.log("Listing status:", summary.statuses)
  console.log(`Photos: ${photoOwner.size} real ad photos, none shared between flats; ${placeholders} listing(s) without any photo use the placeholder.`)
  console.log("Fair price badges per listing:", badgeCounts)
} finally {
  await sql.end({ timeout: 5 })
}

/**
 * Fill listings.previous_price from data/cleaned-rentals.json without re-seeding (ids, flats and
 * photos stay exactly as they are). On unegui a discounted ad shows the old price crossed out next
 * to the new one; the export keeps it as `previousRawPrice`. Only real drops (old > new) are stored.
 *
 *   npm run data:price-drops
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"
import dotenv from "dotenv"
import { parseRentPrice } from "../lib/rent-price.ts"
import { MIGRATION_SQL } from "../lib/schema-sync.ts"

dotenv.config({ path: ".env.local", quiet: true })

interface CleanListing { sourceUrl: string; rawPrice: string; previousRawPrice: string | null }
const data = JSON.parse(readFileSync(join(process.cwd(), "data", "cleaned-rentals.json"), "utf8")) as { flats: Array<{ listings: CleanListing[] }> }

const drops = data.flats.flatMap((flat) => flat.listings).flatMap((listing) => {
  if (!listing.previousRawPrice) return []
  const now = parseRentPrice(listing.rawPrice).amount
  const before = parseRentPrice(listing.previousRawPrice).amount
  return now !== null && before !== null && before > now ? [{ url: listing.sourceUrl, before }] : []
})

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is not configured (.env.local)")
const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => undefined })
try {
  await sql.unsafe(MIGRATION_SQL)
  let updated = 0
  for (const drop of drops) {
    const rows = await sql`
      UPDATE listings SET previous_price = ${drop.before}, price_changed_at = created_at
      WHERE source_url = ${drop.url} AND clean_price IS NOT NULL AND clean_price < ${drop.before}
      RETURNING id`
    updated += rows.length
  }
  console.log(`Price drops in the export: ${drops.length}; listings updated: ${updated}.`)
} finally {
  await sql.end({ timeout: 5 })
}

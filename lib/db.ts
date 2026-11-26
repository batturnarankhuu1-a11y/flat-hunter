import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { and, desc, eq, sql } from "drizzle-orm"
import * as schema from "@/db/schema"
import { flats, listings } from "@/db/schema"
import { findMissingColumns, syncSchema } from "@/lib/schema-sync"

const globalForDatabase = globalThis as typeof globalThis & {
  flatHunterSql?: ReturnType<typeof postgres>
  flatHunterSqlVersion?: string
  flatHunterSchemaCheck?: Promise<void>
}

const sqlClientVersion = "supabase-transaction-pooler-v1"

function getSqlClient() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured")

  if (!globalForDatabase.flatHunterSql || globalForDatabase.flatHunterSqlVersion !== sqlClientVersion) {
    const previousClient = globalForDatabase.flatHunterSql
    globalForDatabase.flatHunterSql = postgres(databaseUrl, {
      // Supabase's transaction pooler (port 6543) can stall responses when
      // Postgres.js pipelines multiple queries on a connection.
      max: 3,
      max_pipeline: 1,
      idle_timeout: 20,
      max_lifetime: 30 * 60,
      connect_timeout: 5,
      query_timeout: 8,
      queue_timeout: 5,
      cancel_timeout: 2,
      prepare: false,
    })
    globalForDatabase.flatHunterSqlVersion = sqlClientVersion
    if (previousClient) void previousClient.end({ timeout: 1 }).catch(() => undefined)
  }
  return globalForDatabase.flatHunterSql
}

export function getDb() {
  return drizzle(getSqlClient(), { schema })
}

/**
 * Make sure every column db/schema.ts declares exists before the first query
 * (adds missing ones idempotently). Runs once per server process; if it fails
 * it is retried on the next request instead of caching the failure.
 */
export function ensureSchema(): Promise<void> {
  globalForDatabase.flatHunterSchemaCheck ??= (async () => {
    const client = getSqlClient()
    const missing = await syncSchema(client)
    if (missing.length === 0) return
    console.warn(`[flat-hunter] added missing database columns: ${missing.join(", ")}`)
    const stillMissing = await findMissingColumns(client)
    if (stillMissing.length) {
      throw new Error(`Database is missing columns required by db/schema.ts: ${stillMissing.join(", ")}. Run npm run db:migrate.`)
    }
  })().catch((error) => {
    globalForDatabase.flatHunterSchemaCheck = undefined
    throw error
  })
  return globalForDatabase.flatHunterSchemaCheck
}

function logQueryError(label: string, startedAt: number, error: unknown) {
  const errorName = error instanceof Error ? error.name : "UnknownError"
  const errorMessage = (error instanceof Error ? error.message : String(error))
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[redacted]@")
    .slice(0, 500)
  console.error(`[flat-hunter] ${label} failed after ${Date.now() - startedAt}ms (${errorName}): ${errorMessage}`)
}

// Valid (reviewed) prices first, then needs_review, then "тохиролцоно"; cheapest within each.
/**
 * Listings shown to the public. needs_review ads with an out-of-range price ("120 сая",
 * "850,000₮") and inactive ads wait for the admin (spec: Admin → Review, "fix by hand or hide").
 * "Тохиролцоно" ads (no price) stay visible, as on any real listings site.
 */
const isPublicListing = sql`(${listings.status} = 'active' OR (${listings.status} = 'needs_review' AND ${listings.cleanPrice} IS NULL))`

const cheapestFirst = sql`(${listings.status} = 'active') DESC, ${listings.cleanPrice} ASC NULLS LAST, ${listings.createdAt} DESC NULLS LAST, ${listings.id} DESC`

/**
 * Every rent flat. Price and the cited listing id come only from `active`
 * listings, so needs_review prices ("120 сая", "850,000₮") never become a flat's price.
 */
export async function getRentalFlatRows() {
  const startedAt = Date.now()
  try {
    await ensureSchema()
    const rows = await getDb()
      .select({
        id: flats.id,
        district: flats.district,
        address: flats.address,
        complex: flats.complex,
        rooms: flats.rooms,
        area: flats.area,
        createdAt: flats.createdAt,
        lowestPrice: sql<number | null>`min(${listings.cleanPrice}) FILTER (WHERE ${listings.status} = 'active')`,
        cheapestListingId: sql<number | null>`(array_agg(${listings.id} ORDER BY ${listings.cleanPrice} ASC, ${listings.id} ASC) FILTER (WHERE ${listings.status} = 'active' AND ${listings.cleanPrice} IS NOT NULL))[1]`,
        title: sql<string | null>`(array_agg(${listings.title} ORDER BY ${cheapestFirst}))[1]`,
        imageUrl: sql<string | null>`(array_agg(${listings.imageUrl} ORDER BY ${cheapestFirst}))[1]`,
        latestListingAt: sql<Date | string | null>`max(${listings.createdAt})`,
        sourcesCount: sql<number>`count(${listings.id})::int`,
      })
      .from(flats)
      .innerJoin(listings, and(eq(listings.flatId, flats.id), eq(listings.dealType, "rent"), isPublicListing))
      .where(eq(flats.dealType, "rent"))
      .groupBy(flats.id)
      .orderBy(desc(sql`max(${listings.createdAt})`), desc(flats.id))

    console.info(`[flat-hunter] rental flats query loaded ${rows.length} flats in ${Date.now() - startedAt}ms`)
    return rows
  } catch (error) {
    logQueryError("rental flats query", startedAt, error)
    throw error
  }
}

/** Listing columns shown in the UI. Spec N3: no agent names or phone numbers are stored. */
const listingColumns = {
  id: listings.id,
  flatId: listings.flatId,
  title: listings.title,
  rawDescription: listings.rawDescription,
  rawPrice: listings.rawPrice,
  cleanPrice: listings.cleanPrice,
  previousPrice: listings.previousPrice,
  priceChangedAt: listings.priceChangedAt,
  district: listings.district,
  address: listings.address,
  rooms: listings.rooms,
  area: listings.area,
  imageUrl: listings.imageUrl,
  status: listings.status,
  source: listings.source,
  sourceUrl: listings.sourceUrl,
  createdAt: listings.createdAt,
}

export type ListingRow = Awaited<ReturnType<typeof getFlatListings>>[number]

/** All listings for one flat: valid prices cheapest first, then needs_review, then "тохиролцоно". */
export async function getFlatListings(flatId: number) {
  const startedAt = Date.now()
  try {
    await ensureSchema()
    return await getDb()
      .select(listingColumns)
      .from(listings)
      .where(and(eq(listings.flatId, flatId), eq(listings.dealType, "rent"), isPublicListing))
      .orderBy(cheapestFirst)
  } catch (error) {
    logQueryError(`listings query for flat ${flatId}`, startedAt, error)
    throw error
  }
}

/** One rent listing, or null. */
export async function getListing(listingId: number) {
  const startedAt = Date.now()
  try {
    await ensureSchema()
    const [row] = await getDb()
      .select(listingColumns)
      .from(listings)
      .where(and(eq(listings.id, listingId), eq(listings.dealType, "rent"), isPublicListing))
      .limit(1)
    return row ?? null
  } catch (error) {
    logQueryError(`listing query ${listingId}`, startedAt, error)
    throw error
  }
}

/**
 * Active rent listings with a valid price — the input of the Fair Price median.
 * Inactive and needs_review listings never enter the median (spec §14).
 */
export async function getPricedRentListings() {
  const startedAt = Date.now()
  try {
    await ensureSchema()
    return await getDb()
      .select({
        id: listings.id,
        flatId: listings.flatId,
        district: listings.district,
        rooms: listings.rooms,
        area: listings.area,
        cleanPrice: listings.cleanPrice,
        previousPrice: listings.previousPrice,
        priceChangedAt: listings.priceChangedAt,
        createdAt: listings.createdAt,
      })
      .from(listings)
      .where(and(eq(listings.dealType, "rent"), eq(listings.status, "active"), sql`${listings.cleanPrice} IS NOT NULL`))
  } catch (error) {
    logQueryError("priced listings query", startedAt, error)
    throw error
  }
}

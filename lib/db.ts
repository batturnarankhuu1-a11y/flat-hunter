import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { desc, eq, sql } from "drizzle-orm"
import * as schema from "@/db/schema"
import { flats, listings } from "@/db/schema"

const globalForDatabase = globalThis as typeof globalThis & {
  flatHunterSql?: ReturnType<typeof postgres>
  flatHunterSqlVersion?: string
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

export async function getHomepageFlatRows() {
  const queryStartedAt = Date.now()
  try {
    const rows = await getDb()
      .select({
        id: flats.id,
        district: flats.district,
        rooms: flats.rooms,
        area: flats.area,
        lowestPrice: flats.lowestPrice,
        pricePerM2: flats.pricePerM2,
        createdAt: flats.createdAt,
        title: sql<string | null>`(array_agg(${listings.title} ORDER BY ${listings.createdAt} DESC NULLS LAST, ${listings.id} DESC))[1]`,
        sourceUrl: sql<string | null>`(array_agg(${listings.sourceUrl} ORDER BY ${listings.createdAt} DESC NULLS LAST, ${listings.id} DESC))[1]`,
        imageUrl: sql<string | null>`(array_agg(${listings.imageUrl} ORDER BY ${listings.createdAt} DESC NULLS LAST, ${listings.id} DESC))[1]`,
        latestListingAt: sql<Date | null>`max(${listings.createdAt})`,
        sourcesCount: sql<number>`count(${listings.id})::int`,
      })
      .from(flats)
      .leftJoin(listings, eq(listings.flatId, flats.id))
      .groupBy(flats.id)
      .orderBy(desc(flats.createdAt), desc(flats.id))

    console.info(`[flat-hunter] homepage query loaded ${rows.length} flats in ${Date.now() - queryStartedAt}ms`)
    return rows
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError"
    const errorMessage = (error instanceof Error ? error.message : String(error))
      .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[redacted]@")
      .slice(0, 500)
    console.error(`[flat-hunter] homepage database query failed after ${Date.now() - queryStartedAt}ms (${errorName}): ${errorMessage}`)
    throw error
  }
}

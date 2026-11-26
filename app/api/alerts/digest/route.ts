import { timingSafeEqual } from "node:crypto"
import { eq, inArray } from "drizzle-orm"
import { savedSearches } from "@/db/schema"
import { alertsFor, describeSearch } from "@/lib/alerts"
import { ensureSchema, getDb } from "@/lib/db"
import { loadRentalFlats } from "@/lib/flats"

/**
 * POST /api/alerts/digest  (header x-cron-secret: CRON_SECRET)
 * Called by any scheduler at 09:00 Ulaanbaatar time ({"mode":"daily"}) or every few minutes
 * ({"mode":"instant"}, Pro searches). Returns the alerts per user for the mailer / push sender and
 * marks those searches as checked, so the same listing is not reported twice.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 })
  const given = Buffer.from(request.headers.get("x-cron-secret") ?? "")
  if (given.length !== Buffer.byteLength(secret) || !timingSafeEqual(given, Buffer.from(secret))) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { mode?: string }
  const mode = body.mode === "instant" ? "instant" : "daily"
  await ensureSchema()
  const db = getDb()
  const [searches, flats] = await Promise.all([
    db.select().from(savedSearches).where(eq(savedSearches.alertMode, mode)),
    loadRentalFlats(),
  ])
  const now = new Date()
  const digests = searches.map((search) => {
    const { items } = alertsFor(search, flats, now)
    return {
      userId: search.userId,
      searchId: search.id,
      search: describeSearch(search),
      items: items.map((item) => ({ kind: item.kind, flatId: item.flat.id, title: item.flat.title, price: item.flat.price, previousPrice: item.flat.previousPrice, at: item.at })),
    }
  }).filter((digest) => digest.items.length > 0)

  if (searches.length) await db.update(savedSearches).set({ lastCheckedAt: now }).where(inArray(savedSearches.id, searches.map((search) => search.id)))
  return Response.json({ mode, checkedSearches: searches.length, digests })
}

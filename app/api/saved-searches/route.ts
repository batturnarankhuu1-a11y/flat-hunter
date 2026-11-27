import { auth } from "@clerk/nextjs/server"
import { requestLocale, tr } from "@/lib/i18n"
import { desc, eq } from "drizzle-orm"
import { savedSearches } from "@/db/schema"
import { getPlanStatus } from "@/lib/billing"
import { ensureSchema, getDb } from "@/lib/db"
import { normalizeDistrict } from "@/lib/districts"

/** GET /api/saved-searches → the signed-in user's saved searches, newest first. */
export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: tr(requestLocale(request), "Нэвтэрнэ үү", "Please sign in") }, { status: 401 })
  await ensureSchema()
  const rows = await getDb().select().from(savedSearches).where(eq(savedSearches.userId, userId)).orderBy(desc(savedSearches.createdAt))
  return Response.json({ searches: rows })
}

/**
 * POST /api/saved-searches { district: "Хан-Уул" | "ALL", rooms: "3" | "ALL", maxPrice: "2.5" | "" }
 * Free plan: 1 saved search. More → 402 { needsPro: true } and the client opens the Wire.mn Pro modal.
 */
export async function POST(request: Request): Promise<Response> {
  const locale = requestLocale(request)
  const { userId } = await auth()
  if (!userId) return Response.json({ error: tr(locale, "Хайлт хадгалахын тулд нэвтэрнэ үү", "Sign in to save searches"), needsSignIn: true }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 })
  }
  const district = typeof body.district === "string" && body.district !== "ALL" ? normalizeDistrict(body.district) : null
  const rooms = typeof body.rooms === "string" && /^\d{1,2}$/.test(body.rooms) ? Number(body.rooms) : null
  const millions = typeof body.maxPrice === "string" && body.maxPrice.trim() ? Number(body.maxPrice) : NaN
  const maxPrice = Number.isFinite(millions) && millions > 0 && millions <= 100 ? Math.round(millions * 1_000_000) : null

  try {
    const status = await getPlanStatus(userId)
    if (status.savedSearchLimit !== null && status.savedSearches >= status.savedSearchLimit) {
      return Response.json({
        error: tr(locale, `Үнэгүй эрхээр ${status.savedSearchLimit} хайлт хадгална. Хязгааргүй хадгалахын тулд Pro эрх аваарай.`, `The free plan saves ${status.savedSearchLimit} search. Get Pro for unlimited saved searches.`),
        needsPro: true,
        ...status,
      }, { status: 402 })
    }
    const [saved] = await getDb().insert(savedSearches)
      .values({ userId, district, rooms, maxPrice, isPaidAlert: status.plan === "pro" })
      .returning()
    return Response.json({ saved, ...status, savedSearches: status.savedSearches + 1 }, { status: 201 })
  } catch {
    return Response.json({ error: tr(locale, "Хайлтыг хадгалж чадсангүй. Дахин оролдоно уу.", "Could not save the search. Please try again.") }, { status: 503 })
  }
}

import { auth } from "@clerk/nextjs/server"
import { and, count, eq } from "drizzle-orm"
import { listings } from "@/db/schema"
import { BADGE_LABELS } from "@/lib/fair-price"
import { ensureSchema, getDb } from "@/lib/db"
import { createOwnerListing, foreignPhotoIds, listOwnerListings, validateOwnerListing } from "@/lib/owner-listings"

const MAX_LISTINGS_PER_USER = 30

/** GET /api/my-listings → the signed-in owner's own listings. */
export async function GET(): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: "Нэвтэрнэ үү" }, { status: 401 })
  await ensureSchema()
  return Response.json({ listings: await listOwnerListings(getDb(), userId) })
}

/**
 * POST /api/my-listings  { title, district, location?, rooms, area, price, paymentTerms?, furnished?, description?, images[] }
 * → saves an "Эзэмшигчийн зар" and returns its Fair Price (₮/m², badge, comparison with similar listings).
 */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: "Зар нэмэхийн тулд нэвтэрнэ үү", needsSignIn: true }, { status: 401 })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 })
  }
  const validation = validateOwnerListing(body)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

  try {
    await ensureSchema()
    const db = getDb()
    const [{ value }] = await db.select({ value: count() }).from(listings).where(and(eq(listings.ownerUserId, userId), eq(listings.source, "user")))
    if (Number(value) >= MAX_LISTINGS_PER_USER) return Response.json({ error: `Нэг хэрэглэгч ${MAX_LISTINGS_PER_USER} хүртэл зар тавина` }, { status: 429 })
    if ((await foreignPhotoIds(db, userId, validation.value.images)).length) return Response.json({ error: "Зөвхөн өөрийн оруулсан зургийг ашиглана" }, { status: 400 })
    const result = await createOwnerListing(db, userId, validation.value)
    return Response.json({
      ...result,
      pricePerM2: Math.round(validation.value.price / validation.value.area),
      badgeLabel: result.fair ? BADGE_LABELS[result.fair.badge] : null,
    }, { status: 201 })
  } catch {
    return Response.json({ error: "Зарыг хадгалж чадсангүй. Дахин оролдоно уу." }, { status: 503 })
  }
}

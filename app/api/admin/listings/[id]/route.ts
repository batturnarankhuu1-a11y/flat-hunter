import { and, eq, sql } from "drizzle-orm"
import { flats, listings } from "@/db/schema"
import { adminAccess } from "@/lib/admin"
import { ensureSchema, getDb } from "@/lib/db"
import { parseId } from "@/lib/flats"
import { parseRentPrice } from "@/lib/rent-price"

/**
 * POST /api/admin/listings/:id
 *   { action: "approve", price?: "3.25 сая" }  needs_review → active (with a corrected price if given)
 *   { action: "hide" }                          → inactive (removed from every public page)
 *   { action: "restore" }                       inactive → active / needs_review by its price
 *   { action: "split" }                         move the listing out of a wrongly merged flat into its own flat
 */
export async function POST(request: Request, context: RouteContext<"/api/admin/listings/[id]">): Promise<Response> {
  const access = await adminAccess()
  if (!access.allowed) return Response.json({ error: access.reason }, { status: access.userId ? 403 : 401 })
  const id = parseId((await context.params).id)
  if (id === null) return Response.json({ error: "Not found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 })
  }
  await ensureSchema()
  const db = getDb()
  const [listing] = await db.select().from(listings).where(eq(listings.id, id)).limit(1)
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 })

  switch (body.action) {
    case "approve": {
      let price = listing.cleanPrice
      if (typeof body.price === "string" && body.price.trim()) {
        const parsed = parseRentPrice(body.price)
        if (parsed.status !== "valid") return Response.json({ error: `“${body.price}” — сарын түрээс 1–20 сая ₮ байх ёстой` }, { status: 400 })
        price = parsed.amount
      }
      if (price !== null && parseRentPrice(price).status !== "valid") return Response.json({ error: "Үнэ 1–20 сая ₮-ийн гадна байна — зөв үнийг оруулна уу" }, { status: 400 })
      const [updated] = await db.update(listings).set({ status: "active", cleanPrice: price }).where(eq(listings.id, id)).returning()
      return Response.json({ listing: updated })
    }
    case "hide": {
      const [updated] = await db.update(listings).set({ status: "inactive" }).where(eq(listings.id, id)).returning()
      return Response.json({ listing: updated })
    }
    case "restore": {
      const valid = listing.cleanPrice === null || parseRentPrice(listing.cleanPrice).status === "valid"
      const [updated] = await db.update(listings).set({ status: valid ? "active" : "needs_review" }).where(eq(listings.id, id)).returning()
      return Response.json({ listing: updated })
    }
    case "split": {
      if (listing.flatId === null) return Response.json({ error: "Listing has no flat" }, { status: 400 })
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(listings).where(eq(listings.flatId, listing.flatId))
      if (count < 2) return Response.json({ error: "Энэ байранд ганц зар байна" }, { status: 400 })
      const [flat] = await db.select().from(flats).where(eq(flats.id, listing.flatId)).limit(1)
      const newFlatId = await db.transaction(async (tx) => {
        const [created] = await tx.insert(flats).values({
          district: listing.district ?? flat?.district ?? null,
          khoroo: flat?.khoroo ?? null,
          complex: flat?.complex ?? null,
          rooms: listing.rooms ?? flat?.rooms ?? null,
          area: listing.area ?? flat?.area ?? null,
          address: listing.address ?? flat?.address ?? null,
          dealType: "rent",
          lowestPrice: listing.status === "active" ? listing.cleanPrice : null,
          createdAt: listing.createdAt ?? new Date(),
        }).returning({ id: flats.id })
        await tx.update(listings).set({ flatId: created.id }).where(and(eq(listings.id, id), eq(listings.flatId, listing.flatId!)))
        return created.id
      })
      return Response.json({ listingId: id, flatId: newFlatId })
    }
    default:
      return Response.json({ error: "action: approve | hide | restore | split" }, { status: 400 })
  }
}

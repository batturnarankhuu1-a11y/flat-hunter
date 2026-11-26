import "server-only"
import { auth, currentUser } from "@clerk/nextjs/server"
import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { flats, listings } from "@/db/schema"
import { ensureSchema, getDb } from "@/lib/db"

/**
 * Who may open /admin: Clerk users listed in ADMIN_USER_IDS or ADMIN_EMAILS (comma separated).
 * With neither set, any signed-in user is admin in development only (the page shows a warning);
 * in production the admin stays closed until one of them is configured.
 */
export async function adminAccess(): Promise<{ allowed: boolean; userId: string | null; reason?: string; devOpen?: boolean }> {
  const { userId } = await auth()
  if (!userId) return { allowed: false, userId: null, reason: "Нэвтэрнэ үү." }
  const ids = (process.env.ADMIN_USER_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean)
  const emails = (process.env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)
  if (ids.length === 0 && emails.length === 0) {
    return process.env.NODE_ENV === "production"
      ? { allowed: false, userId, reason: "Админ тохируулаагүй байна: ADMIN_EMAILS эсвэл ADMIN_USER_IDS-ийг тохируулна уу." }
      : { allowed: true, userId, devOpen: true }
  }
  if (ids.includes(userId)) return { allowed: true, userId }
  if (emails.length) {
    const user = await currentUser()
    if (user?.emailAddresses.some((address) => emails.includes(address.emailAddress.toLowerCase()))) return { allowed: true, userId }
  }
  return { allowed: false, userId, reason: "Энэ хуудас зөвхөн админд нээлттэй." }
}

const adminListingColumns = {
  id: listings.id,
  flatId: listings.flatId,
  title: listings.title,
  rawPrice: listings.rawPrice,
  cleanPrice: listings.cleanPrice,
  previousPrice: listings.previousPrice,
  status: listings.status,
  district: listings.district,
  rooms: listings.rooms,
  area: listings.area,
  imageUrl: listings.imageUrl,
  createdAt: listings.createdAt,
}
export type AdminListing = Awaited<ReturnType<typeof getAdminListings>>[number]

/** Listings by status ('needs_review', 'inactive'). */
export async function getAdminListings(statuses: string[]) {
  await ensureSchema()
  return getDb().select(adminListingColumns).from(listings)
    .where(and(eq(listings.dealType, "rent"), inArray(listings.status, statuses)))
    .orderBy(asc(listings.status), asc(listings.id))
}

/** Listings by id (for the outlier list). */
export async function getListingsById(ids: number[]) {
  if (ids.length === 0) return []
  await ensureSchema()
  return getDb().select(adminListingColumns).from(listings).where(inArray(listings.id, ids)).orderBy(asc(listings.id))
}

/** Flats with two or more listings (any status) — duplicates merged by FR-8, for checking the grouping. */
export async function getMultiListingFlats() {
  await ensureSchema()
  const db = getDb()
  const groups = await db.select({ flatId: listings.flatId, count: sql<number>`count(*)::int` })
    .from(listings).where(eq(listings.dealType, "rent")).groupBy(listings.flatId).having(sql`count(*) > 1`)
  const flatIds = groups.map((group) => group.flatId).filter((id): id is number => id !== null)
  if (flatIds.length === 0) return []
  const [flatRows, listingRows] = await Promise.all([
    db.select({ id: flats.id, district: flats.district, rooms: flats.rooms, area: flats.area, address: flats.address }).from(flats).where(inArray(flats.id, flatIds)),
    db.select(adminListingColumns).from(listings).where(inArray(listings.flatId, flatIds)).orderBy(asc(listings.cleanPrice)),
  ])
  return flatRows.map((flat) => ({ ...flat, listings: listingRows.filter((listing) => listing.flatId === flat.id) }))
    .sort((a, b) => b.listings.length - a.listings.length || a.id - b.id)
}

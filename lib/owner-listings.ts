/**
 * Listings posted by owners themselves ("Эзэмшигчийн зар", listings.source = 'user').
 *
 * Each post becomes its own flat + one listing. The price goes through the same parser as every
 * other ad (1–20 сая ₮ → active, outside → needs_review for the admin), and the Fair Price badge is
 * computed on save with the same median logic, against all active listings including this one.
 * Spec N3: phone numbers in the title/description are masked; no contact details are stored.
 *
 * Relative imports + an injected `db` so scripts can use it too (no "@/" alias, no server-only).
 */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import * as schema from "../db/schema.ts"
import { flats, listings, userPhotos } from "../db/schema.ts"
import { DISTRICTS, normalizeDistrict, type District } from "./districts.ts"
import { computeFairPrices, type FairPriceResult } from "./fair-price.ts"
import { stripPhoneNumbers } from "./privacy.ts"
import { formatMnt, parseRentPrice } from "./rent-price.ts"
import { tr, type Locale } from "./i18n.ts"

export type Db = PostgresJsDatabase<typeof schema>

/** Clean illustrations an owner can pick instead of uploading photos (clearly labelled "Жишээ зураг"). */
export const SAMPLE_IMAGES = ["/samples/living.svg", "/samples/bedroom.svg", "/samples/kitchen.svg", "/samples/building.svg"] as const
export const MAX_PHOTOS = 8
const PHOTO_URL = /^\/api\/photos\/(\d{1,9})$/

export interface OwnerListingInput {
  title: string
  district: District
  location: string | null
  rooms: number
  area: number
  price: number
  rawPrice: string
  paymentTerms: string | null
  furnished: boolean | null
  description: string | null
  images: string[]
  status: "active" | "needs_review"
}

type Validation = { ok: true; value: OwnerListingInput } | { ok: false; error: string }

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? stripPhoneNumbers(value.trim().replace(/\s+/g, " ")).slice(0, max) : null)

/** Error messages are in `locale` (Mongolian by default). */
export function validateOwnerListing(input: unknown, locale: Locale = "mn"): Validation {
  const fail = (mn: string, en: string): Validation => ({ ok: false, error: tr(locale, mn, en) })
  if (typeof input !== "object" || input === null) return fail("Мэдээлэл дутуу байна", "Some details are missing")
  const raw = input as Record<string, unknown>
  const title = text(raw.title, 120)
  if (!title || title.length < 5) return fail("Гарчиг 5-аас доошгүй тэмдэгт байна", "The title needs at least 5 characters")
  const district = typeof raw.district === "string" ? normalizeDistrict(raw.district) : null
  if (!district || !DISTRICTS.includes(district)) return fail("Дүүргээ сонгоно уу", "Please choose a district")
  const rooms = Number(raw.rooms)
  if (!Number.isInteger(rooms) || rooms < 1 || rooms > 8) return fail("Өрөөний тоо 1–8", "Rooms must be 1–8")
  const area = Number(raw.area)
  if (!Number.isFinite(area) || area < 10 || area > 600) return fail("Талбай 10–600 м²", "Area must be 10–600 m²")
  const parsed = parseRentPrice(typeof raw.price === "number" ? raw.price : typeof raw.price === "string" ? raw.price : null)
  if (parsed.amount === null || (parsed.status !== "valid" && parsed.status !== "needs_review")) return fail("Сарын түрээсээ ₮-өөр бичнэ үү (ж: 2500000 эсвэл 2.5 сая)", "Enter the monthly rent in ₮ (e.g. 2500000 or 2.5 сая)")
  const paymentTerms = text(raw.paymentTerms, 30)
  if (paymentTerms && !/^[\p{L}\p{N}+\-–.,/ ]+$/u.test(paymentTerms)) return fail("Төлбөрийн нөхцөл: жишээ нь 3+1", "Payment terms: for example 3+1")
  const images = Array.isArray(raw.images) ? raw.images.filter((item): item is string => typeof item === "string") : []
  if (images.length === 0) return fail("Дор хаяж нэг зураг оруулах эсвэл жишээ зураг сонгоно уу", "Upload at least one photo or pick a sample image")
  if (images.length > MAX_PHOTOS) return fail(`${MAX_PHOTOS}-аас ихгүй зураг`, `No more than ${MAX_PHOTOS} photos`)
  if (images.some((image) => !PHOTO_URL.test(image) && !(SAMPLE_IMAGES as readonly string[]).includes(image))) return fail("Зургийн холбоос буруу", "Invalid photo link")
  return {
    ok: true,
    value: {
      title,
      district,
      location: text(raw.location, 80),
      rooms,
      area: Math.round(area * 10) / 10,
      price: parsed.amount,
      rawPrice: formatMnt(parsed.amount),
      paymentTerms,
      furnished: typeof raw.furnished === "boolean" ? raw.furnished : null,
      description: text(raw.description, 2000),
      images: [...new Set(images)],
      status: parsed.status === "valid" ? "active" : "needs_review",
    },
  }
}

/** Uploaded photo ids in `images` that do not belong to the user (must be empty to save). */
export async function foreignPhotoIds(db: Db, userId: string, images: string[]): Promise<number[]> {
  const ids = images.flatMap((image) => { const match = image.match(PHOTO_URL); return match ? [Number(match[1])] : [] })
  if (ids.length === 0) return []
  const owned = await db.select({ id: userPhotos.id }).from(userPhotos).where(and(inArray(userPhotos.id, ids), eq(userPhotos.ownerUserId, userId)))
  const ownedIds = new Set(owned.map((row) => row.id))
  return ids.filter((id) => !ownedIds.has(id))
}

/** Fair Price of one listing among all active priced listings (spec FR-10, same median rules). */
async function fairPriceFor(db: Db, listingId: number): Promise<FairPriceResult | null> {
  const priced = await db.select({ id: listings.id, district: listings.district, rooms: listings.rooms, area: listings.area, cleanPrice: listings.cleanPrice, createdAt: listings.createdAt })
    .from(listings).where(and(eq(listings.dealType, "rent"), eq(listings.status, "active"), isNotNull(listings.cleanPrice)))
  const { byListing } = computeFairPrices(priced.map((row) => ({
    id: row.id, district: row.district, rooms: row.rooms, priceType: "rent" as const, price: row.cleanPrice,
    area: row.area === null ? null : Number(row.area), createdAt: row.createdAt ?? new Date(0),
  })))
  return byListing.get(listingId) ?? null
}

export async function createOwnerListing(db: Db, userId: string, value: OwnerListingInput) {
  const { flatId, listingId } = await db.transaction(async (tx) => {
    const [flat] = await tx.insert(flats).values({
      district: value.district,
      khoroo: value.location && /хороо$/i.test(value.location) ? value.location : null,
      complex: value.location && !/хороо$/i.test(value.location) ? value.location : null,
      rooms: value.rooms,
      area: String(value.area),
      address: value.location,
      dealType: "rent",
      lowestPrice: value.status === "active" ? value.price : null,
      pricePerM2: String(Math.round(value.price / value.area)),
    }).returning({ id: flats.id })
    const [listing] = await tx.insert(listings).values({
      flatId: flat.id,
      sourceUrl: null,
      source: "user",
      title: value.title,
      rawDescription: value.description,
      rawPrice: value.rawPrice,
      cleanPrice: value.price,
      dealType: "rent",
      address: value.location,
      district: value.district,
      rooms: value.rooms,
      area: String(value.area),
      imageUrl: value.images.join(","),
      status: value.status,
      ownerUserId: userId,
      paymentTerms: value.paymentTerms,
      furnished: value.furnished,
    }).returning({ id: listings.id })
    return { flatId: flat.id, listingId: listing.id }
  })
  const fair = value.status === "active" ? await fairPriceFor(db, listingId) : null
  if (fair) await db.update(flats).set({ badge: fair.badge }).where(eq(flats.id, flatId))
  return { flatId, listingId, status: value.status, fair }
}

export async function listOwnerListings(db: Db, userId: string) {
  return db.select({
    id: listings.id, flatId: listings.flatId, title: listings.title, cleanPrice: listings.cleanPrice, status: listings.status,
    district: listings.district, rooms: listings.rooms, area: listings.area, imageUrl: listings.imageUrl, createdAt: listings.createdAt,
  }).from(listings).where(and(eq(listings.ownerUserId, userId), eq(listings.source, "user"))).orderBy(desc(listings.createdAt))
}

/** Hide (inactive) or show again (active, or needs_review if the price is out of range). Only the owner's own listings. */
export async function setOwnerListingVisible(db: Db, userId: string, listingId: number, visible: boolean) {
  const [listing] = await db.select({ cleanPrice: listings.cleanPrice }).from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.ownerUserId, userId), eq(listings.source, "user"))).limit(1)
  if (!listing) return null
  const status = !visible ? "inactive" : listing.cleanPrice !== null && parseRentPrice(listing.cleanPrice).status === "valid" ? "active" : "needs_review"
  await db.update(listings).set({ status }).where(eq(listings.id, listingId))
  return status
}

/** Delete the owner's listing, its now-empty flat and the photos it used. */
export async function deleteOwnerListing(db: Db, userId: string, listingId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [listing] = await tx.delete(listings)
      .where(and(eq(listings.id, listingId), eq(listings.ownerUserId, userId), eq(listings.source, "user")))
      .returning({ flatId: listings.flatId, imageUrl: listings.imageUrl })
    if (!listing) return false
    if (listing.flatId !== null) {
      const [{ left }] = await tx.select({ left: sql<number>`count(*)::int` }).from(listings).where(eq(listings.flatId, listing.flatId))
      if (left === 0) await tx.delete(flats).where(eq(flats.id, listing.flatId))
    }
    const photoIds = (listing.imageUrl ?? "").split(",").flatMap((image) => { const match = image.trim().match(PHOTO_URL); return match ? [Number(match[1])] : [] })
    if (photoIds.length) await tx.delete(userPhotos).where(and(inArray(userPhotos.id, photoIds), eq(userPhotos.ownerUserId, userId)))
    return true
  })
}

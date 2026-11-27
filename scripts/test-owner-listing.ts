/**
 * End-to-end check of owner listings without a Clerk session (run against a started server):
 *   node scripts/test-owner-listing.ts http://localhost:3123
 * Creates a listing for a throw-away test user with the same functions the API uses, checks that
 * it shows up (home list first, flat/listing pages, photo, /api/ask, /api/chat, /market), then
 * hides it, deletes it and removes the test photo.
 */
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import dotenv from "dotenv"
import * as schema from "../db/schema.ts"
import { createOwnerListing, deleteOwnerListing, foreignPhotoIds, setOwnerListingVisible, validateOwnerListing } from "../lib/owner-listings.ts"

dotenv.config({ path: ".env.local", quiet: true })
const base = process.argv[2] ?? "http://localhost:3123"
const USER = "test_owner_flat_hunter"
const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, onnotice: () => undefined })
const db = drizzle(client, { schema })
const json = async (path: string, init?: RequestInit) => (await fetch(base + path, init)).json()
const post = (path: string, body: unknown) => json(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

let listingId: number | null = null
try {
  // validation
  assert.equal(validateOwnerListing({ title: "abc" }).ok, false)
  assert.equal(validateOwnerListing({ title: "Сайхан байр", district: "Хан-Уул", rooms: 2, area: 50, price: "2.5 сая", images: ["https://evil.example/x.jpg"] }).ok, false)
  const masked = validateOwnerListing({ title: "Сайхан байр 99112233", district: "Хан-Уул", rooms: 2, area: 50, price: "2.5 сая", images: ["/samples/living.svg"] })
  assert.ok(masked.ok && !masked.value.title.includes("99112233"), "phone masked")
  console.log("✓ validation: bad input rejected, foreign image URL rejected, phone number masked")

  // a real photo, stored as the API stores uploads
  const file = readdirSync("public/flats")[0]
  const [photo] = await db.insert(schema.userPhotos).values({ ownerUserId: USER, contentType: "image/webp", data: readFileSync(join("public/flats", file)) }).returning({ id: schema.userPhotos.id })
  assert.deepEqual(await foreignPhotoIds(db, "someone_else", [`/api/photos/${photo.id}`]), [photo.id])

  const input = validateOwnerListing({
    title: "Тест: Сонгинохайрхан, тавилгатай 2 өрөө байр", district: "Сонгинохайрхан", location: "Баруун салаа", rooms: 2, area: 56,
    price: "1.9 сая", paymentTerms: "3+1", furnished: true, description: "Тест зар — автоматаар устгагдана.", images: [`/api/photos/${photo.id}`, "/samples/kitchen.svg"],
  })
  assert.ok(input.ok)
  const created = await createOwnerListing(db, USER, input.value)
  listingId = created.listingId
  console.log(`✓ created listing ${created.listingId} (flat ${created.flatId}), status ${created.status}, fair badge ${created.fair?.badge}`)

  const home = await (await fetch(base + "/")).text()
  const firstFlat = home.match(/href="\/flats\/(\d+)"/)![1]
  assert.equal(Number(firstFlat), created.flatId, "new owner listing is first on the home page")
  assert.ok(home.includes("Эзэмшигчийн зар"))
  const listingPage = await (await fetch(`${base}/listings/${created.listingId}`)).text()
  assert.ok(listingPage.includes("Эзэмшигчийн зар") && listingPage.includes("3+1") && listingPage.includes("Тавилгатай"))
  const image = await fetch(`${base}/api/photos/${photo.id}`)
  assert.equal(image.status, 200); assert.equal(image.headers.get("content-type"), "image/webp")
  console.log("✓ home: first card + “Эзэмшигчийн зар”; listing page shows payment terms and furniture; photo served")

  const ask = await post("/api/ask", { query: "Сонгинохайрхан 2 өрөө" })
  assert.ok(ask.flats.some((flat: { id: string }) => Number(flat.id) === created.flatId), "found by /api/ask")
  const chat = await post("/api/chat", { message: "Сонгинохайрхан дүүрэгт тавилгатай 2 өрөө байна уу?" })
  assert.ok(chat.flats.some((flat: { id: string }) => Number(flat.id) === created.flatId), "found by chat")
  const market = (await (await fetch(`${base}/market?district=${encodeURIComponent("Сонгинохайрхан")}&rooms=2`)).text()).replace(/<!-- -->/g, "")
  assert.ok(market.includes("Цэг бүр нэг зарын ₮/м² (1 зар)"), `counted in /market: ${(market.match(/[^<>]{0,30}зар\)/g) ?? []).join(" | ")}`)
  console.log(`✓ found by search (${ask.status}) and chat (“${chat.reply.slice(0, 60)}…”); counted in /market`)

  assert.equal(await setOwnerListingVisible(db, "someone_else", created.listingId, false), null)
  assert.equal(await setOwnerListingVisible(db, USER, created.listingId, false), "inactive")
  // Streaming pages render notFound() as the 404 page (HTTP status already sent), so check the content.
  const hiddenPage = await (await fetch(`${base}/listings/${created.listingId}`)).text()
  assert.ok(hiddenPage.includes("could not be found") && !hiddenPage.includes("Flat Hunter-ийн дүн шинжилгээ"), "hidden listing shows the not-found page")
  assert.equal(await setOwnerListingVisible(db, USER, created.listingId, true), "active")
  console.log("✓ hide → listing page shows “not found”; show again → active; other users cannot touch it")

  assert.equal(await deleteOwnerListing(db, "someone_else", created.listingId), false)
  assert.equal(await deleteOwnerListing(db, USER, created.listingId), true)
  listingId = null
  assert.equal((await db.select().from(schema.userPhotos).where(eq(schema.userPhotos.id, photo.id))).length, 0)
  assert.equal((await db.select().from(schema.flats).where(eq(schema.flats.id, created.flatId))).length, 0)
  console.log("✓ delete removes the listing, its empty flat and its photo")
} finally {
  if (listingId !== null) await deleteOwnerListing(db, USER, listingId)
  await db.delete(schema.userPhotos).where(eq(schema.userPhotos.ownerUserId, USER))
  await client.end({ timeout: 5 })
}

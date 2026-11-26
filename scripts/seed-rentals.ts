/**
 * Seed RENT-only demo data: 85 listings for 55 flats in Ulaanbaatar.
 *
 *   npm run db:seed
 *
 * How the data is built
 * ---------------------
 * GROUPS below is the whole plan, one line per "similar listings" group
 * (district + rooms — the Fair Price comparison group, spec FR-10). Each token is
 * one flat: a letter for its price level and a digit for how many ads it has:
 *
 *   f = fair (±4% of the district rate)   c = cheap (−20%)   e = expensive (+25%)
 *   "f3 c1" → a fair flat posted 3 times + a cheap flat posted once
 *
 * Groups with ≥ 5 listings get real badges (Хямд / Бодит / Өндөр); the thin
 * groups (< 5) show "Мэдээлэл хангалтгүй". EXTRAS adds the data-quality cases:
 * "120 сая" and "850,000₮" (needs_review), "тохиролцоно" (null) and one bait
 * price below 30% of the district median (outlier).
 *
 * Price text is deliberately messy ("1.5 сая", "1,800,000₮", "Сард 1.9сая" …)
 * and district spellings are mixed (БЗД / Баянзүрх дүүрэг) — the seed cleans
 * them with the same functions the ingest API uses.
 *
 * Photos
 * ------
 * public/rentals/<nnn>-<living|kitchen|bedroom|room|building>.webp — CC0 /
 * public-domain photos (sources in public/rentals/CREDITS.json). Every photo is
 * given to exactly one flat; ads of the same flat reuse only that flat's photos.
 *
 * Privacy (spec N3): no agent names or phone numbers are stored.
 * Data is deterministic (seeded PRNG): re-running gives the same result.
 */
import { readdirSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"
import dotenv from "dotenv"
import { DISTRICT_ABBREVIATIONS, normalizeDistrict, type District } from "../lib/districts.ts"
import { parseRentPrice } from "../lib/rent-price.ts"
import { computeFairPrices, type PricedListing } from "../lib/fair-price.ts"
import { stripPhoneNumbers } from "../lib/privacy.ts"
import { MIGRATION_SQL, N3_CLEANUP_SQL } from "../lib/schema-sync.ts"

dotenv.config({ path: ".env.local", quiet: true })

// ---------------------------------------------------------------- PRNG
let seed = 20261127
function random() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (min: number, max: number) => min + random() * (max - min)
const int = (min: number, max: number) => Math.floor(between(min, max + 1))

// ---------------------------------------------------------------- places (real Ulaanbaatar areas)
const PLACES: Record<District, Array<{ khoroo: number; complex: string }>> = {
  "Баянзүрх": [
    { khoroo: 26, complex: "Нархан хотхон" }, { khoroo: 14, complex: "13-р хороолол" }, { khoroo: 4, complex: "Улаанхуаран" },
    { khoroo: 8, complex: "Хүнсний 4 буудлын ойролцоо" }, { khoroo: 1, complex: "Цайз захын ойролцоо" },
  ],
  "Сүхбаатар": [
    { khoroo: 6, complex: "МУИС-ийн 4-р байрны урд, Z64 хотхон" }, { khoroo: 8, complex: "Их тойруу орчмын хотхон" },
    { khoroo: 1, complex: "1-р хороолол" }, { khoroo: 3, complex: "Бага тойруу" }, { khoroo: 11, complex: "Зүүн 4 зам" },
  ],
  "Хан-Уул": [
    { khoroo: 4, complex: "Яармаг, Maxwell хотхон" }, { khoroo: 11, complex: "Зайсан, Энхжин хотхон" },
    { khoroo: 15, complex: "Буянт-Ухаа" }, { khoroo: 3, complex: "19-р хороолол" }, { khoroo: 2, complex: "Стадион Оргил" },
  ],
  "Чингэлтэй": [
    { khoroo: 17, complex: "Хайлааст хотхон" }, { khoroo: 4, complex: "Дэнжийн мянга" }, { khoroo: 6, complex: "40 мянгат" },
    { khoroo: 1, complex: "Ард кино театрын ар" },
  ],
  "Баянгол": [
    { khoroo: 24, complex: "Коёо таун хотхон" }, { khoroo: 7, complex: "Гэмтлийн эмнэлгийн зүүн хойд тал" },
    { khoroo: 3, complex: "10-р хороолол" }, { khoroo: 12, complex: "3, 4-р хороолол" }, { khoroo: 20, complex: "Баруун 4 зам" },
  ],
}

/** Typical monthly rent per m² (₮). */
const RENT_PER_M2: Record<District, number> = { "Сүхбаатар": 36_000, "Хан-Уул": 33_000, "Баянзүрх": 27_000, "Чингэлтэй": 26_000, "Баянгол": 25_000 }
/** Small flats rent for more per m². */
const ONE_ROOM_PREMIUM = 1.4
const AREA_BY_ROOMS: Record<number, [number, number]> = { 1: [38, 46], 2: [46, 62], 3: [66, 88], 4: [96, 125] }
const LEVEL_MULTIPLIER = { f: () => between(0.96, 1.04), c: () => 0.8, e: () => 1.25 } as const

const DISTRICT_CODE: Record<District, string> = { "Баянзүрх": "bzd", "Сүхбаатар": "sbd", "Хан-Уул": "khud", "Чингэлтэй": "chd", "Баянгол": "bgd" }

// ---------------------------------------------------------------- the plan (79 listings)
const GROUPS: Array<{ district: District; rooms: number; flats: string }> = [
  // ≥ 5 listings → real badges
  { district: "Баянзүрх", rooms: 2, flats: "f3 f1 c2 e1 f1" },
  { district: "Баянзүрх", rooms: 3, flats: "f3 f1 e2 c1" },
  { district: "Сүхбаатар", rooms: 1, flats: "f2 c1 f1 e1" },
  { district: "Сүхбаатар", rooms: 2, flats: "f3 f1 e1 c2 f1" },
  { district: "Хан-Уул", rooms: 2, flats: "f2 c1 f2 e1 f1" },
  { district: "Хан-Уул", rooms: 3, flats: "f3 e1 f1 c1" },
  { district: "Чингэлтэй", rooms: 2, flats: "f3 f1 c1 e2" },
  { district: "Баянгол", rooms: 1, flats: "f2 f1 c1 e1" },
  { district: "Баянгол", rooms: 2, flats: "f3 c1 f1 e1 f1" },
  // < 5 listings → "Мэдээлэл хангалтгүй"
  { district: "Баянзүрх", rooms: 1, flats: "f2 f1" },
  { district: "Сүхбаатар", rooms: 3, flats: "f2 f1" },
  { district: "Сүхбаатар", rooms: 4, flats: "f1" },
  { district: "Хан-Уул", rooms: 1, flats: "f1 f2" },
  { district: "Хан-Уул", rooms: 4, flats: "f2" },
  { district: "Чингэлтэй", rooms: 1, flats: "f1 f1" },
  { district: "Чингэлтэй", rooms: 3, flats: "f2 f1" },
  { district: "Баянгол", rooms: 3, flats: "f2" },
]

/** Data-quality cases (6 more listings → 85). `flat` is the generated key. */
const EXTRA_LISTINGS: Array<{ flat: string; price: string }> = [
  { flat: "bzd-2r-a", price: "120 сая" }, // sale price typed into a rent ad → needs_review
  { flat: "bgd-1r-a", price: "850,000₮" }, // below 1 сая → needs_review
  { flat: "sbd-2r-a", price: "тохиролцоно" }, // negotiable → null
  { flat: "bgd-2r-a", price: "Үнэ тохиролцоно" },
]
const EXTRA_FLATS: Array<{ key: string; district: District; rooms: number; area: number; prices: string[] }> = [
  { key: "khud-4r-z", district: "Хан-Уул", rooms: 4, area: 120, prices: ["1.1 сая"] }, // bait: < 30% of district median → outlier
  { key: "chd-2r-z", district: "Чингэлтэй", rooms: 2, area: 52, prices: ["Үнийг утсаар тохиролцоно"] }, // no price at all
]

// ---------------------------------------------------------------- dirty text
const withCommas = (amount: number) => amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
const millions = (amount: number) => String(Number((amount / 1_000_000).toFixed(2)))
const PRICE_FORMATS: Array<(amount: number) => string> = [
  (a) => `${millions(a)} сая`, (a) => `${withCommas(a)}₮`, (a) => `${millions(a)} сая ₮`,
  (a) => `${withCommas(a).replace(/,/g, " ")} төгрөг`, (a) => `Сард ${millions(a)}сая`, (a) => String(a),
  (a) => `${millions(a).replace(".", ",")} сая`, (a) => `₮${withCommas(a)}/сар`,
]
const FURNITURE = ["Бүрэн тавилгатай", "Хагас тавилгатай", "Тавилгагүй"] as const
const EXTRAS = ["Шинэ засвартай", "Лифттэй", "Халаалт, ус 24 цаг", "Ойролцоо сургууль, цэцэрлэгтэй", "Угаалгын машин, хөргөгчтэй", "Зогсоолтой", "Нарлаг, дулаан", "Хаалгач 24 цаг"]

const round50k = (value: number) => Math.round(value / 50_000) * 50_000

// ---------------------------------------------------------------- build flats
interface SeedFlat {
  key: string
  district: District
  khoroo: number
  complex: string
  building: number
  floor: number
  floors: number
  rooms: number
  area: number
  furniture: string
  extras: string[]
  prices: string[]
}

const flats: SeedFlat[] = []
let priceVariant = 0
const placeIndex: Record<string, number> = {}

function newFlat(key: string, district: District, rooms: number, area?: number): Omit<SeedFlat, "prices"> {
  const places = PLACES[district]
  placeIndex[district] = (placeIndex[district] ?? -1) + 1
  const place = places[placeIndex[district] % places.length]
  const [minArea, maxArea] = AREA_BY_ROOMS[rooms]
  const floors = int(5, 22)
  return {
    key, district, khoroo: place.khoroo, complex: place.complex, building: int(1, 60), floors, floor: int(2, floors), rooms,
    area: area ?? Math.round(between(minArea, maxArea) * 10) / 10,
    furniture: FURNITURE[int(0, 2)],
    extras: [...EXTRAS].sort(() => random() - 0.5).slice(0, 2),
  }
}

for (const group of GROUPS) {
  group.flats.split(" ").forEach((token, index) => {
    const level = token[0] as keyof typeof LEVEL_MULTIPLIER
    const count = Number(token.slice(1))
    const key = `${DISTRICT_CODE[group.district]}-${group.rooms}r-${String.fromCharCode(97 + index)}`
    const base = newFlat(key, group.district, group.rooms)
    const perM2 = RENT_PER_M2[group.district] * (group.rooms === 1 ? ONE_ROOM_PREMIUM : 1) * LEVEL_MULTIPLIER[level]()
    const firstPrice = Math.max(1_000_000, round50k(base.area * perM2))
    // Other people post the same flat a little higher (+3–8% each).
    const prices = Array.from({ length: count }, (_, slot) => {
      const amount = slot === 0 ? firstPrice : round50k(firstPrice * (1 + 0.03 * slot + between(0, 0.02)))
      return PRICE_FORMATS[priceVariant++ % PRICE_FORMATS.length](amount)
    })
    flats.push({ ...base, prices })
  })
}
for (const extra of EXTRA_LISTINGS) {
  const flat = flats.find((item) => item.key === extra.flat)
  if (!flat) throw new Error(`EXTRA_LISTINGS: unknown flat ${extra.flat}`)
  flat.prices.push(extra.price)
}
for (const extra of EXTRA_FLATS) flats.push({ ...newFlat(extra.key, extra.district, extra.rooms, extra.area), prices: extra.prices })

const listingCount = flats.reduce((sum, flat) => sum + flat.prices.length, 0)
if (listingCount !== 85) throw new Error(`Expected 85 listings, got ${listingCount}`)

// ---------------------------------------------------------------- photos (each used by exactly one flat)
const PHOTO_DIR = join(process.cwd(), "public", "rentals")
const pool: Record<string, string[]> = {}
for (const file of readdirSync(PHOTO_DIR).filter((name) => /^\d+-(living|kitchen|bedroom|room|building)\.webp$/.test(name)).sort()) {
  const kind = file.match(/-(\w+)\.webp$/)![1]
  ;(pool[kind] ??= []).push(`/rentals/${file}`)
}
const take = (kinds: string[]) => {
  for (const kind of kinds) if (pool[kind]?.length) return pool[kind].shift()!
  return null
}
const MAIN_ORDER = [["living", "room"], ["bedroom", "room"], ["kitchen", "living"], ["living", "bedroom"], ["room", "living"]]
const photosByFlat = new Map<string, string[]>()
flats.forEach((flat, index) => {
  const main = take([...MAIN_ORDER[index % MAIN_ORDER.length], "living", "bedroom", "kitchen", "room"])
  if (!main) throw new Error(`Not enough interior photos in public/rentals for ${flat.key}`)
  photosByFlat.set(flat.key, [main])
})
// Second interior photo of a different kind, then a building photo, while the pool lasts.
for (const flat of flats) {
  const photos = photosByFlat.get(flat.key)!
  const mainKind = photos[0].match(/-(\w+)\.webp$/)![1]
  const second = take(["kitchen", "bedroom", "living", "room"].filter((kind) => kind !== mainKind))
  if (second) photos.push(second)
}
for (const flat of flats) {
  const building = take(["building"])
  if (building) photosByFlat.get(flat.key)!.push(building)
}
const photoOwner = new Map<string, string>()
for (const [key, photos] of photosByFlat) for (const photo of photos) {
  if (photoOwner.has(photo)) throw new Error(`${photo} used by ${photoOwner.get(photo)} and ${key}`)
  photoOwner.set(photo, key)
}

// Ads of the same flat start their gallery from a different photo of that flat.
function gallery(flat: SeedFlat, slot: number) {
  const photos = photosByFlat.get(flat.key)!
  const start = slot % photos.length
  return [...photos.slice(start), ...photos.slice(0, start)].join(",")
}

// ---------------------------------------------------------------- listing text
function districtText(flat: SeedFlat, variant: number) {
  const abbreviation = DISTRICT_ABBREVIATIONS[flat.district]
  return [abbreviation, flat.district, `${flat.district} дүүрэг`, `${abbreviation} ${flat.khoroo}-р хороо`][variant % 4]
}

function listingTitle(flat: SeedFlat, variant: number) {
  const where = districtText(flat, variant)
  const short = flat.complex.split(",").at(-1)!.trim()
  switch (variant % 5) {
    case 0: return `${where} ${short} ${flat.rooms} өрөө байр түрээслүүлнэ`
    case 1: return `${short}-д ${flat.area}мкв ${flat.rooms} өрөө байр түрээслүүлнэ`
    case 2: return `Түрээс: ${flat.district} дүүрэг, ${flat.rooms} өрөө, ${flat.furniture.toLowerCase()}`
    case 3: return `${flat.rooms} өрөө ${flat.furniture.toLowerCase()} байр түрээслүүлнэ — ${short}`
    default: return `${where} ${short} ${flat.rooms}өрөө ${flat.area}м2 түрээс`
  }
}

function listingDescription(flat: SeedFlat, price: string, variant: number) {
  return stripPhoneNumbers([
    `Байршил: ${flat.district} дүүрэг, ${flat.khoroo}-р хороо, ${flat.complex}, ${flat.building}-р байр, ${flat.floor}/${flat.floors} давхар.`,
    `${flat.rooms} өрөө, ${flat.area} м². ${flat.furniture}. ${flat.extras.join(". ")}.`,
    `Урьдчилгаа ${variant % 3 === 2 ? 2 : 1} сар, барьцаа 1 сар. Үнэ: ${price}.`,
  ].join(" "))
}

// ---------------------------------------------------------------- write
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is not configured (.env.local)")
const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => undefined })
const now = Date.now()

try {
  await sql.unsafe(MIGRATION_SQL)
  await sql.unsafe(N3_CLEANUP_SQL) // spec N3: drop any stored agent/poster names

  const summary = await sql.begin(async (tx) => {
    const removed = await tx`DELETE FROM listings RETURNING id`
    await tx`DELETE FROM flats`

    let variant = 0
    const priced: PricedListing[] = []
    for (const flat of flats) {
      const ads = flat.prices.map((price, slot) => {
        const v = variant++
        const rawDistrict = districtText(flat, v)
        if (normalizeDistrict(rawDistrict) !== flat.district) throw new Error(`District "${rawDistrict}" did not normalize to ${flat.district}`)
        const parsed = parseRentPrice(price)
        if (parsed.status === "invalid" || parsed.status === "missing") throw new Error(`Unparseable price "${price}" in ${flat.key}`)
        return { price, slot, parsed, title: listingTitle(flat, v), description: listingDescription(flat, price, v), postedAt: new Date(now - int(0, 30) * 86_400_000 - slot * 3_600_000) }
      })
      const validPrices = ads.flatMap((ad) => ad.parsed.status === "valid" ? [ad.parsed.amount!] : [])
      const lowestPrice = validPrices.length ? Math.min(...validPrices) : null
      const address = `${flat.khoroo}-р хороо, ${flat.complex}, ${flat.building}-р байр, ${flat.floor}/${flat.floors} давхар`
      const [{ id: flatId }] = await tx`
        INSERT INTO flats (district, khoroo, complex, rooms, area, address, deal_type, lowest_price, price_per_m2, badge, created_at)
        VALUES (${flat.district}, ${`${flat.khoroo}-р хороо`}, ${flat.complex}, ${flat.rooms}, ${flat.area}, ${address}, 'rent',
                ${lowestPrice}, ${lowestPrice === null ? null : Math.round(lowestPrice / flat.area)}, NULL,
                ${new Date(Math.min(...ads.map((ad) => ad.postedAt.getTime())))})
        RETURNING id`
      for (const ad of ads) {
        const valid = ad.parsed.status === "valid"
        const [{ id }] = await tx`
          INSERT INTO listings (flat_id, source_url, source, title, raw_description, raw_price, clean_price,
                                district, rooms, area, image_url, status, deal_type, address, created_at)
          VALUES (${flatId}, NULL, 'seed', ${ad.title}, ${ad.description}, ${ad.price}, ${ad.parsed.amount},
                  ${flat.district}, ${flat.rooms}, ${flat.area}, ${gallery(flat, ad.slot)},
                  ${valid ? "active" : "needs_review"}, 'rent', ${address}, ${ad.postedAt})
          RETURNING id`
        priced.push({ id, district: flat.district, rooms: flat.rooms, priceType: "rent", price: valid ? ad.parsed.amount : null, area: flat.area, createdAt: ad.postedAt })
      }
    }
    return { removed: removed.length, badges: [...computeFairPrices(priced).byListing.values()].map((result) => result.badge) }
  })

  const badgeCounts = summary.badges.reduce<Record<string, number>>((counts, badge) => ({ ...counts, [badge]: (counts[badge] ?? 0) + 1 }), {})
  const unused = Object.values(pool).flat().length
  console.log(`Removed ${summary.removed} previous listings.`)
  console.log(`Inserted ${flats.length} flats, ${listingCount} rent listings (${flats.filter((flat) => flat.prices.length > 1).length} flats posted 2–4 times).`)
  console.log(`Photos: ${photoOwner.size} used (${unused} spare), every photo belongs to exactly one flat.`)
  console.log("Fair price badges per listing:", badgeCounts)
} finally {
  await sql.end({ timeout: 5 })
}

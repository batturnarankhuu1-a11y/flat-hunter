/**
 * Clean a browser-extension CSV export of unegui.mn rent listings into
 * data/cleaned-rentals.json, which `npm run db:seed` loads.
 *
 *   npm run data:clean                       # reads data/raw/unegui-rentals-export.csv
 *   npm run data:clean -- path/to/export.csv
 *
 * The export's columns are shifted row by row ("Text 1" … "Text 10"), so every cell is
 * classified by its content instead of its column: listing link, price, location,
 * "N өдрийн өмнө", photo URL, title. Everything else is dropped — badges ("VIP"),
 * photo counters and, per spec N3, agent names and author profile links.
 *
 * Steps
 *   1. parse         every row → one candidate listing
 *   2. filter        only flats for rent: needs a link, a title, a price and a room count;
 *                    shared rooms ("хажуу өрөө"), warehouses, offices and houses are dropped
 *   3. deduplicate   same link, or same title + price + location → kept once
 *   4. group         different ads of the same flat (same district + rooms + area, a shared
 *                    complex name and a similar price) → one flat, several listings (FR-8)
 *   5. prices        "1.6 сая ₮" → 1 600 000; "тохиролцоно" → null; < 1 сая or > 20 сая → needs_review
 *
 * Photos: each ad keeps its OWN photo URLs from cdn*.unegui.mn (shown straight from the CDN, never
 * downloaded), plus hashed photoRefs for duplicate matching. Agent logos — the same picture on ads
 * of different flats — are left out. A main photo is never shared by two flats.
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { normalizeDistrict, type District } from "../lib/districts.ts"
import { stripPhoneNumbers } from "../lib/privacy.ts"
import { parseRentPrice, type RentPriceStatus } from "../lib/rent-price.ts"
import { canonicalListingUrl } from "../lib/unegui-parser.ts"

const input = process.argv[2] ?? join("data", "raw", "unegui-rentals-export.csv")
const output = join("data", "cleaned-rentals.json")

// ---------------------------------------------------------------- CSV (RFC 4180)
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ",") { row.push(cell); cell = "" }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++
      row.push(cell); rows.push(row); row = []; cell = ""
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

// ---------------------------------------------------------------- cell classification
const PRICE_CELL = /^(\d[\d.,\s]*\s*сая\s*₮|\d{1,3}(?:[,\s]\d{3})+\s*₮|тохиролцоно)$/i
const LOCATION_CELL = /^Улаанбаатар\s+—/
const DATE_CELL = /өмнө$|^Өчигдөр$|^Өнөөдөр$/i
const PHOTO_CELL = /^https:\/\/cdn\d*\.unegui\.mn\/media\//
const NOISE_CELL = /^(\d{1,2}|\/|VIP\+?|Онцгой|.)$/i
/** Words that make a cell a listing title rather than an agent name. */
const TITLE_HINT = /өрөө|uruu|oroo|байр|bair|мкв|м\.?кв|м2|m2|м²|mkw|mkv|хотхон|хороол|residence|резиденс|apartment|апартмент|garden|гарден|tower|town|villa|вилла|сууц/i

interface RawListing {
  row: number
  sourceUrl: string
  title: string
  prices: string[]
  location: string | null
  postedText: string | null
  photos: string[]
}

function classifyRow(cells: string[], row: number): RawListing | null {
  let sourceUrl: string | null = null
  const prices: string[] = []
  const photos: string[] = []
  const texts: string[] = []
  let location: string | null = null
  let postedText: string | null = null
  let byAgent = false
  for (const raw of cells) {
    const cell = raw.trim()
    if (!cell) continue
    if (/unegui\.mn\/adv\//.test(cell)) sourceUrl ??= canonicalListingUrl(cell)
    else if (/unegui\.mn\/items\/author\//.test(cell)) { byAgent = true; continue } // agent profile — N3
    else if (PHOTO_CELL.test(cell)) { if (!photos.includes(cell)) photos.push(cell) }
    else if (PRICE_CELL.test(cell)) prices.push(cell)
    else if (LOCATION_CELL.test(cell)) location ??= cell
    else if (DATE_CELL.test(cell)) postedText ??= cell
    else if (!NOISE_CELL.test(cell)) texts.push(cell)
  }
  // The title is the longest text that reads like a listing; the rest (agent names …) is dropped.
  const title = texts.filter((text) => TITLE_HINT.test(text)).sort((a, b) => b.length - a.length)[0]
  if (!sourceUrl || !title) return null
  // An agent's card shows the ad photo plus the agent's avatar/logo as the second picture.
  if (byAgent && photos.length === 2) photos.pop()
  return { row, sourceUrl, title, prices, location, postedText, photos }
}

// ---------------------------------------------------------------- field parsing
const ROOMS = /(\d)\s*(?:-?н\s*)?(?:өрөө|uruu|oroo)/i
const AREA = /(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:мкв|м\.\s?кв|м\.?кв|мк|м2|m2|м²|mkw|mkv|мкв\.?)(?![а-яa-z])/i
const NOT_A_FLAT = /хажуу\s*өрөө|hajuu\s*uruu|агуулах|обьект|объект|сингл\s*хаус|оффис|үйлчилгээний\s*талбай/i

function parsePosted(text: string | null, exportedAt: Date): Date {
  const at = (ms: number) => new Date(exportedAt.getTime() - ms)
  if (!text) return exportedAt
  if (/өчигдөр/i.test(text)) return at(86_400_000)
  const match = text.match(/(\d+)\s*(минут|цаг|өдр|долоо\s*хоног|сар)/i)
  if (!match) return exportedAt
  const n = Number(match[1])
  const unit = match[2].toLowerCase()
  const ms = unit.startsWith("минут") ? 60_000 : unit.startsWith("цаг") ? 3_600_000 : unit.startsWith("өдр") ? 86_400_000 : unit.startsWith("сар") ? 30 * 86_400_000 : 7 * 86_400_000
  return at(n * ms)
}

const photoRef = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 20)

interface CleanListing {
  sourceUrl: string
  title: string
  rawPrice: string
  /** Old price shown crossed out on the ad, when there is one. */
  previousRawPrice: string | null
  cleanPrice: number | null
  priceStatus: RentPriceStatus
  status: "active" | "needs_review"
  district: District
  place: string | null
  rooms: number
  area: number | null
  postedAt: string
  /** The ad's own photos (cdn*.unegui.mn), agent logos removed, at most 8. */
  photos: string[]
  photoRefs: string[]
}

// ---------------------------------------------------------------- run
const exportedAt = statSync(input).mtime
const rows = parseCsv(readFileSync(input, "utf8").replace(/^﻿/, ""))
const dataRows = rows.slice(1).filter((cells) => cells.some((cell) => cell.trim()))

const dropped: Record<string, number> = {}
const drop = (reason: string) => { dropped[reason] = (dropped[reason] ?? 0) + 1 }

const candidates: Array<CleanListing & { normalizedTitle: string }> = []
dataRows.forEach((cells, index) => {
  const raw = classifyRow(cells, index + 2)
  if (!raw) return drop("линк эсвэл гарчиггүй мөр")
  if (NOT_A_FLAT.test(raw.title)) return drop("орон сууц биш (хажуу өрөө, агуулах …)")
  const rooms = raw.title.match(ROOMS)
  if (!rooms || Number(rooms[1]) < 1) return drop("өрөөний тоогүй (зогсоол, хаус …)")
  if (raw.prices.length === 0) return drop("үнэгүй")
  const district = normalizeDistrict(raw.location?.split("—")[1] ?? raw.title)
  if (!district) return drop("дүүрэг тодорхойгүй")
  const parsed = parseRentPrice(raw.prices[0])
  if (parsed.status === "invalid" || parsed.status === "missing") return drop("үнэ уншигдахгүй")
  const areaMatch = raw.title.match(AREA)
  const area = areaMatch ? Number(areaMatch[1].replace(",", ".")) : null
  const title = stripPhoneNumbers(raw.title.replace(/\s+/g, " ").trim())
  candidates.push({
    sourceUrl: raw.sourceUrl,
    title,
    normalizedTitle: title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(),
    rawPrice: raw.prices[0],
    previousRawPrice: raw.prices[1] ?? null,
    cleanPrice: parsed.amount,
    priceStatus: parsed.status,
    status: parsed.status === "valid" || parsed.status === "negotiable" ? "active" : "needs_review",
    district,
    place: raw.location?.split("—")[2]?.trim() || null,
    rooms: Number(rooms[1]),
    area: area !== null && area >= 10 && area <= 600 ? area : null,
    postedAt: parsePosted(raw.postedText, exportedAt).toISOString(),
    photos: raw.photos,
    photoRefs: [], // filled below, after agent logos are removed
  })
})

// 3. Deduplicate: same link, or same title + price + location.
const seenUrls = new Set<string>()
const seenContent = new Set<string>()
const unique = candidates.filter((listing) => {
  const contentKey = `${listing.normalizedTitle}|${listing.rawPrice}|${listing.district}|${listing.place}`
  if (seenUrls.has(listing.sourceUrl)) { drop("давхардсан линк"); return false }
  if (seenContent.has(contentKey)) { drop("ижил гарчиг + үнэ + байршил"); return false }
  seenUrls.add(listing.sourceUrl)
  seenContent.add(contentKey)
  return true
})

// Agent logos: one picture on ads of different flats (different rooms or area).
const photoUsers = new Map<string, Array<{ rooms: number; area: number | null }>>()
for (const listing of unique) for (const url of listing.photos) photoUsers.set(url, [...(photoUsers.get(url) ?? []), listing])
const isLogo = (url: string) => {
  const users = photoUsers.get(url)!
  return users.some((user) => user.rooms !== users[0].rooms || (user.area !== null && users[0].area !== null && Math.abs(user.area - users[0].area) > 2))
}
const logoCount = [...photoUsers.keys()].filter(isLogo).length
for (const listing of unique) {
  listing.photos = listing.photos.filter((url) => !isLogo(url)).slice(0, 8)
  listing.photoRefs = listing.photos.map(photoRef)
}

// 4. Group ads of the same flat.
const GENERIC = new Set(["өрөө", "байр", "байранд", "хотхон", "хотхонд", "хотхоны", "орон", "сууц", "бүрэн", "тавилгатай", "хагас", "шинэ", "мастертай", "хороо", "хороололд", "хороолол", "хотын", "төвд", "талд", "баруун", "зүүн", "хойно", "урд", "хажууд", "зам", "дагуу", "дулаан", "зогсоолтой", "граштай", "гражтай", "түрээслүүлнэ", "uruu", "bair", "зайсан", "зайсанд", "яармаг", "яармагт", "дэлгүүрийн", "сургуулийн", "residence", "garden", "town", "tower", "apartment", "хотгонд", "мкв", "гал", "тогоо", "тусдаа"])
const tokens = (title: string) => new Set(title.toLowerCase().split(/[^\p{L}]+/u).filter((word) => word.length >= 4 && !GENERIC.has(word)))

interface FlatGroup { listings: typeof unique; tokens: Set<string> }
const groups: FlatGroup[] = []
for (const listing of unique) {
  const own = tokens(listing.title)
  const match = groups.find((group) => {
    const first = group.listings[0]
    if (first.district !== listing.district || first.rooms !== listing.rooms) return false
    if (![...own].some((word) => group.tokens.has(word))) return false
    const prices = group.listings.map((item) => item.cleanPrice).filter((price): price is number => price !== null)
    const similarPrice = listing.cleanPrice === null || prices.length === 0 || prices.some((price) => Math.abs(price - listing.cleanPrice!) / price <= 0.2)
    const areas = group.listings.map((item) => item.area).filter((area): area is number => area !== null)
    if (listing.area !== null && areas.length) return similarPrice && areas.some((area) => Math.abs(area - listing.area!) <= 1)
    // Area missing on one side: only the same complex at exactly the same price.
    return prices.includes(listing.cleanPrice!)
  })
  if (match) { match.listings.push(listing); for (const word of own) match.tokens.add(word) }
  else groups.push({ listings: [listing], tokens: own })
}

// 5. Keep the ~100 cleanest listings: flats with several ads first (they show the price
// comparison), then the most complete single ads (area known, valid price), newest first.
const MAX_LISTINGS = 100
const completeness = (group: FlatGroup) => {
  const listing = group.listings[0]
  return (listing.area !== null ? 2 : 0) + (listing.status === "active" ? 1 : 0)
}
const ranked = [...groups].sort((a, b) =>
  Number(b.listings.length > 1) - Number(a.listings.length > 1)
  || completeness(b) - completeness(a)
  || b.listings[0].postedAt.localeCompare(a.listings[0].postedAt))
const selected: FlatGroup[] = []
let selectedListings = 0
for (const group of ranked) {
  // No area → no price per m² and no Fair Price badge: incomplete, left out.
  if (group.listings.every((item) => item.area === null)) continue
  if (selectedListings + group.listings.length > MAX_LISTINGS) continue
  selected.push(group)
  selectedListings += group.listings.length
}
// Data-quality cases stay in (shown to the admin, hidden from the public list).
for (const group of groups) if (!selected.includes(group) && group.listings.some((item) => item.status === "needs_review")) selected.push(group)
const leftOut = groups.filter((group) => !selected.includes(group))
groups.splice(0, groups.length, ...selected) // ranked order: flats with several ads first

const flats = groups.map((group, index) => {
  const listings = group.listings.map((item): CleanListing => {
    const listing: Partial<typeof item> = { ...item }
    delete listing.normalizedTitle
    return listing as CleanListing
  })
    .sort((a, b) => (a.cleanPrice ?? Infinity) - (b.cleanPrice ?? Infinity))
  const areas = listings.map((item) => item.area).filter((area): area is number => area !== null)
  return {
    key: `f${String(index + 1).padStart(3, "0")}`,
    district: listings[0].district,
    place: listings.find((item) => item.place)?.place ?? null,
    rooms: listings[0].rooms,
    area: areas.length ? Math.max(...areas) : null,
    listings,
  }
})

const listingCount = flats.reduce((sum, flat) => sum + flat.listings.length, 0)
const stats = {
  rows: dataRows.length,
  cleanListings: unique.length,
  cleanFlats: selected.length + leftOut.length,
  notSelected:  { flats: leftOut.length, listings: leftOut.reduce((sum, group) => sum + group.listings.length, 0) },
  listings: listingCount,
  flats: flats.length,
  flatsWithSeveralAds: flats.filter((flat) => flat.listings.length > 1).length,
  needsReview: flats.flatMap((flat) => flat.listings).filter((item) => item.status === "needs_review").length,
  agentLogosRemoved: logoCount,
  dropped,
}
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify({
  note: "unegui.mn rent listings from a CSV export, cleaned by scripts/clean-unegui-csv.ts. No agent names or phone numbers (spec N3); photos are the ads' own cdn.unegui.mn URLs.",
  exportedAt: exportedAt.toISOString(),
  stats,
  flats,
}, null, 2)}\n`)
console.log(`${input} → ${output}`)
console.log(stats)

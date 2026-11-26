/**
 * Pure parsing helpers for unegui.mn "Орон сууц түрээслүүлнэ" pages.
 * No network, no database — used by scripts/scrape-unegui.ts and unit checks.
 *
 * What we read (and nothing more):
 *   list page   → listing URLs from the JSON-LD ItemList
 *   detail page → title, description, price text, rooms, area, district
 *
 *   photos       → the listing's OWN photo URLs on cdn*.unegui.mn (shown by URL, never downloaded)
 *
 * What we deliberately do NOT read (spec N3):
 *   seller name / profile link, phone numbers.
 */
import { normalizeDistrict, type District } from "./districts.ts"
import { stripPhoneNumbers } from "./privacy.ts"

export const UNEGUI_ORIGIN = "https://www.unegui.mn"
/** Apartment-rent category ("Орон сууц түрээслүүлнэ"). */
export const UNEGUI_RENT_LIST_PATH = "/l-hdlh/l-hdlh-treesllne/oron-suuts/"

export function rentListUrl(page: number): string {
  return page <= 1 ? `${UNEGUI_ORIGIN}${UNEGUI_RENT_LIST_PATH}` : `${UNEGUI_ORIGIN}${UNEGUI_RENT_LIST_PATH}?page=${page}`
}

// ---------------------------------------------------------------- robots.txt

/** Disallow patterns for `User-agent: *` (supports `*` wildcards and `$`). */
export function parseRobots(text: string): string[] {
  const rules: string[] = []
  let applies = false
  let sawRuleInGroup = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim()
    const [key, ...rest] = line.split(":")
    const value = rest.join(":").trim()
    if (!key) continue
    if (/^user-agent$/i.test(key)) {
      if (sawRuleInGroup) { applies = false; sawRuleInGroup = false }
      if (value === "*") applies = true
    } else if (/^disallow$/i.test(key)) {
      sawRuleInGroup = true
      if (applies && value) rules.push(value)
    } else if (/^allow$/i.test(key)) {
      sawRuleInGroup = true
    }
  }
  return rules
}

export function isAllowedByRobots(url: string, disallow: string[]): boolean {
  const { pathname, search } = new URL(url)
  const path = pathname + search
  return !disallow.some((rule) => {
    const pattern = rule.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")
    const anchored = pattern.endsWith("\\$") ? `^${pattern.slice(0, -2)}$` : `^${pattern}`
    return new RegExp(anchored).test(path)
  })
}

// ---------------------------------------------------------------- block detection

export interface BlockCheck {
  blocked: boolean
  reason?: string
}

/**
 * Normal unegui pages also load /cdn-cgi/challenge-platform/scripts/jsd/main.js,
 * so that script alone is NOT a block. A block is a 403/429/503, a Cloudflare
 * interstitial, or a page without the JSON-LD every real page has.
 */
export function detectBlock(status: number, html: string): BlockCheck {
  if (status === 403 || status === 429 || status === 503) return { blocked: true, reason: `HTTP ${status}` }
  if (status >= 400) return { blocked: true, reason: `HTTP ${status}` }
  const title = html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? ""
  if (/just a moment|attention required|access denied|checking your browser/i.test(title)) return { blocked: true, reason: `challenge page: "${title.trim()}"` }
  if (/cf-chl-|cf_chl_opt|cf-turnstile|id="challenge-form"/i.test(html)) return { blocked: true, reason: "Cloudflare challenge markup" }
  if (!/application\/ld\+json/i.test(html)) return { blocked: true, reason: "page has no JSON-LD (unexpected/blocked page)" }
  return { blocked: false }
}

// ---------------------------------------------------------------- JSON-LD helpers

type JsonObject = Record<string, unknown>

function jsonLdNodes(html: string): JsonObject[] {
  const nodes: JsonObject[] = []
  for (const match of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]) as JsonObject | JsonObject[]
      for (const item of Array.isArray(data) ? data : [data]) {
        const graph = item["@graph"]
        nodes.push(...(Array.isArray(graph) ? (graph as JsonObject[]) : [item]))
      }
    } catch {
      // A broken JSON-LD block is reported by the caller as a parse error.
    }
  }
  return nodes
}

const hasType = (node: JsonObject, type: string) => ([] as unknown[]).concat(node["@type"]).includes(type)

/** Canonical listing URL, or null for anything that is not a /adv/<id>_slug/ page. */
export function canonicalListingUrl(href: string): string | null {
  try {
    const url = new URL(href, UNEGUI_ORIGIN)
    if (!/(^|\.)unegui\.mn$/.test(url.hostname)) return null
    const match = url.pathname.match(/^\/adv\/(\d+)_[^/]+\/?$/)
    if (!match) return null
    return `${UNEGUI_ORIGIN}${url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`}`
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- list page

export function parseListPage(html: string): string[] {
  const urls = new Set<string>()
  for (const node of jsonLdNodes(html)) {
    if (!hasType(node, "ItemList")) continue
    for (const item of (node.itemListElement as JsonObject[] | undefined) ?? []) {
      const url = typeof item.url === "string" ? canonicalListingUrl(item.url) : null
      if (url) urls.add(url)
    }
  }
  // Fallback when the ItemList is missing: plain /adv/ links.
  if (urls.size === 0) {
    for (const [, href] of html.matchAll(/href="(\/adv\/\d+_[^"?#]+)"/g)) {
      const url = canonicalListingUrl(href)
      if (url) urls.add(url)
    }
  }
  return [...urls]
}

// ---------------------------------------------------------------- detail page

export interface ParsedListing {
  sourceUrl: string
  title: string
  rawPrice: string | null
  rawDescription: string | null
  district: District | null
  rooms: number | null
  area: number | null
  /** This listing's own photos (URLs only — the files are never downloaded or stored, spec N1). */
  imageUrls: string[]
}

export const MAX_IMAGES = 6

/** Only https photo URLs on unegui's own CDN are accepted. */
export function isUneguiPhotoUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && /^cdn\d*\.unegui\.mn$/.test(url.hostname) && /\.(webp|jpe?g|png)$/i.test(url.pathname)
  } catch {
    return false
  }
}

export interface DetailParseResult {
  listing: ParsedListing | null
  /** One message per field whose selector found nothing (spec FR-5: logged, never fatal). */
  fieldErrors: string[]
}

/** Visible text with "|" between elements: "Талбай:|80 м²|Хэдэн давхарт:|13". */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "|")
    .replace(/&nbsp;/g, " ")
    .replace(/\s*\|[\s|]*/g, "|")
}

function decodeEntities(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
}

export function parseDetailPage(html: string, url: string): DetailParseResult {
  const fieldErrors: string[] = []
  const sourceUrl = canonicalListingUrl(url)
  const product = jsonLdNodes(html).find((node) => hasType(node, "Product"))
  if (!sourceUrl || !product) {
    return { listing: null, fieldErrors: [!sourceUrl ? "url: not a /adv/ listing URL" : "json-ld: Product not found"] }
  }

  const title = typeof product.name === "string" ? decodeEntities(product.name).trim() : ""
  if (!title) return { listing: null, fieldErrors: ["title: Product.name is empty"] }

  // Must be an apartment-rent ad.
  const category = typeof product.category === "string" ? product.category : ""
  if (category && !/түрээслүүлнэ/i.test(category)) {
    return { listing: null, fieldErrors: [`category: not a rent listing ("${category}")`] }
  }

  // Price: the visible text ("3 сая ₮") is kept raw; parsePrice cleans it later.
  const offers = (product.offers ?? {}) as JsonObject
  const microdataPrice = html.match(/itemProp="price"\s+content="([^"]+)"/i)?.[1]
  const rawPrice = microdataPrice ? decodeEntities(microdataPrice) : typeof offers.price === "string" || typeof offers.price === "number" ? String(offers.price) : null
  if (!rawPrice) fieldErrors.push("price: selector found nothing")

  const text = visibleText(html)

  const roomsMatch = category.match(/(\d+)\s*өрөө/) ?? title.match(/(\d+)\s*-?\s*өрөө/)
  const rooms = roomsMatch ? Number(roomsMatch[1]) : null
  if (rooms === null) fieldErrors.push("rooms: selector found nothing")

  const areaMatch = text.match(/Талбай:\|\s*([\d]+(?:[.,]\d+)?)\s*м/) ?? title.match(/(\d+(?:[.,]\d+)?)\s*(?:м2|m2|мкв|м²)/i)
  const area = areaMatch ? Number(areaMatch[1].replace(",", ".")) : null
  if (area === null) fieldErrors.push("area: selector found nothing")

  // District: "<title>… №123 in Баянгол - …" → listing location; then title/description text.
  const pageTitle = decodeEntities(html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "")
  const description = typeof product.description === "string" ? stripPhoneNumbers(decodeEntities(product.description)).trim() : null
  const district = normalizeDistrict(pageTitle.match(/\bin\s+([^-|]+)/)?.[1]) ?? normalizeDistrict(title) ?? normalizeDistrict(description)
  if (district === null) fieldErrors.push("district: selector found nothing (or outside the 5 central districts)")

  const imageUrls = [...new Set(([] as unknown[]).concat(product.image ?? []).filter(isUneguiPhotoUrl))].slice(0, MAX_IMAGES)
  if (imageUrls.length === 0) fieldErrors.push("images: no photo URLs found")

  return {
    listing: { sourceUrl, title, rawPrice, rawDescription: description || null, district, rooms, area, imageUrls },
    fieldErrors,
  }
}

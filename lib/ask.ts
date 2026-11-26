import type { Flat } from "@/components/types"
import type { District } from "@/lib/districts"
import { matchesFilters, parseSearchQuery, type QuestionLanguage, type SearchFilters } from "@/lib/query-parser"
import { formatMnt } from "@/lib/rent-price"

/**
 * OK         — at least one listing in the database matches
 * NOT_FOUND  — filters understood, but no listing in the database matches
 * UNCLEAR    — nothing in the question could be turned into a filter
 */
export type AskStatus = "OK" | "NOT_FOUND" | "UNCLEAR"

export interface AskResponse {
  status: AskStatus
  language: QuestionLanguage
  /** Step 1 output (spec §11): unmentioned fields are null. */
  filters: SearchFilters
  /** ≤ 4 sentences, in the question's language; every listing mentioned is followed by [id]. */
  answer: string
  /** Listing ids cited in `answer`, in order. */
  citedListingIds: number[]
  /** Every matching flat, cheapest first (built only from database rows). */
  flats: Flat[]
}

const DISTRICT_EN: Record<District, string> = {
  "Баянзүрх": "Bayanzurkh", "Сүхбаатар": "Sukhbaatar", "Хан-Уул": "Khan-Uul", "Чингэлтэй": "Chingeltei", "Баянгол": "Bayangol",
}

/** Max listings named in the answer; the rest are in `flats`. */
const MAX_CITED = 3

function criteria(filters: SearchFilters, language: QuestionLanguage): string {
  const parts: string[] = []
  if (language === "mn") {
    if (filters.district) parts.push(`${filters.district} дүүрэгт`)
    if (filters.rooms !== null) parts.push(`${filters.rooms} өрөө`)
    if (filters.min_area !== null) parts.push(`${filters.min_area} м²-аас том`)
    if (filters.max_price !== null) parts.push(`сард ${formatMnt(filters.max_price)}-өөс хэтрэхгүй`)
    return parts.join(", ")
  }
  parts.push("rental flat(s)")
  if (filters.rooms !== null) parts.push(`with ${filters.rooms} rooms`)
  if (filters.district) parts.push(`in ${DISTRICT_EN[filters.district]}`)
  if (filters.min_area !== null) parts.push(`of at least ${filters.min_area} m²`)
  if (filters.max_price !== null) parts.push(`up to ${formatMnt(filters.max_price)} a month`)
  return parts.join(" ")
}

function place(flat: Flat, language: QuestionLanguage): string {
  const district = language === "en" ? DISTRICT_EN[flat.district as District] ?? flat.district : flat.district
  return flat.complex ? `${district}, ${flat.complex}` : district
}

/** "Баянзүрх, Нархан хотхон, 2 өрөө 52.4 м², сард 1,300,000₮ [123]" */
function describe(flat: Flat, language: QuestionLanguage): string {
  const size = [flat.rooms !== null ? (language === "mn" ? `${flat.rooms} өрөө` : `${flat.rooms} rooms`) : null, flat.area !== null ? `${flat.area} м²` : null].filter(Boolean).join(" ")
  const price = language === "mn" ? `сард ${formatMnt(flat.price!)}` : `${formatMnt(flat.price!)}/month`
  return `${place(flat, language)}${size ? `, ${size}` : ""}, ${price} [${flat.listingId}]`
}

function badgeSentence(flat: Flat, language: QuestionLanguage): string | null {
  if (flat.priceDeviation === null || (flat.badge !== "cheap" && flat.badge !== "expensive")) return null
  const percent = Math.round(Math.abs(flat.priceDeviation) * 100)
  if (language === "mn") return `[${flat.listingId}] зарын м² үнэ ижил төстэй заруудын медианаас ${percent}% ${flat.badge === "cheap" ? "хямд" : "өндөр"} байна.`
  return `Listing [${flat.listingId}] is ${percent}% ${flat.badge === "cheap" ? "below" : "above"} the median price per m² of similar listings.`
}

/** Compose the answer only from matched database rows (no invented listings). */
export function composeAnswer(filters: SearchFilters, language: QuestionLanguage, matches: Flat[]): { answer: string; cited: number[] } {
  const what = criteria(filters, language)
  if (matches.length === 0) {
    if (filters.price_type === "sale") {
      return language === "mn"
        ? { answer: "Тохирох зар олдсонгүй. Манай санд зөвхөн түрээсийн байрны зар байдаг.", cited: [] }
        : { answer: "No matching listings found. We only list flats for rent.", cited: [] }
    }
    return language === "mn"
      ? { answer: `Тохирох зар олдсонгүй. ${what ? `Манай санд ${what} түрээсийн байр одоогоор алга.` : ""}`.trim(), cited: [] }
      : { answer: `No matching listings found. ${what ? `There are currently no ${what} in our database.` : ""}`.trim(), cited: [] }
  }

  const cited = matches.slice(0, MAX_CITED)
  const sentences: string[] = []
  sentences.push(language === "mn"
    ? `${what ? `${what} ` : ""}түрээсийн ${matches.length} байр олдлоо.`.replace(/^./, (c) => c.toUpperCase())
    : `Found ${matches.length} ${what}.`)
  sentences.push(language === "mn" ? `Хамгийн хямд нь ${describe(cited[0], language)}.` : `The cheapest is ${describe(cited[0], language)}.`)
  if (cited.length > 1) {
    const others = cited.slice(1).map((flat) => describe(flat, language)).join("; ")
    sentences.push(language === "mn" ? `Дараагийнх нь ${others}.` : `${cited.length > 2 ? "Next are" : "Next is"} ${others}.`)
  }
  const extra = matches.length > cited.length
    ? (language === "mn" ? `Үлдсэн ${matches.length - cited.length} байрыг доорх жагсаалтаас үзнэ үү.` : `See the list below for the other ${matches.length - cited.length}.`)
    : badgeSentence(cited[0], language)
  if (extra) sentences.push(extra)

  return { answer: sentences.slice(0, 4).join(" "), cited: cited.map((flat) => flat.listingId!) }
}

/** Full pipeline: question → filter JSON → database matches → grounded answer. */
export function answerQuestion(question: string, catalogue: Flat[]): AskResponse {
  const { filters, language, understood } = parseSearchQuery(question)
  if (!understood) {
    return {
      status: "UNCLEAR",
      language,
      filters,
      answer: language === "mn"
        ? "Асуултаас дүүрэг, өрөөний тоо, үнэ эсвэл талбайг танисангүй. Жишээ нь: “Хан-Уулд 2.5 сая хүртэл 3 өрөө байр”."
        : "I could not find a district, room count, price or size in the question. For example: “3-room flat in Khan-Uul under 2.5 million”.",
      citedListingIds: [],
      flats: [],
    }
  }
  const matches = catalogue
    .filter((flat) => flat.listingId !== null && matchesFilters(flat, filters))
    .sort((a, b) => a.price! - b.price!)
  const { answer, cited } = composeAnswer(filters, language, matches)
  return { status: matches.length ? "OK" : "NOT_FOUND", language, filters, answer, citedListingIds: cited, flats: matches }
}

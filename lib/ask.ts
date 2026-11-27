import type { Flat } from "@/components/types"
import { DISTRICT_EN } from "@/lib/i18n"
import { matchesFilters, parseSearchQuery, type QuestionLanguage, type SearchFilters } from "@/lib/query-parser"
import { formatMnt } from "@/lib/rent-price"
import type { SemanticResult } from "@/lib/semantic-search"

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
  /** Semantic part of the search: words beyond the filters ("тавилгатай", "River garden") and the engine used. */
  search: { engine: "pinecone" | "local"; terms: string[]; applied: boolean }
}

/** Free-text words used as an extra filter (relevance) or, without filters, as the whole search. */
type Semantic = Pick<SemanticResult, "engine" | "terms" | "scores" | "relevant">
const NO_SEMANTIC: Semantic = { engine: "local", terms: [], scores: new Map(), relevant: new Set() }

/** Max listings named in the answer; the rest are in `flats`. */
const MAX_CITED = 3

function criteria(filters: SearchFilters, language: QuestionLanguage, keywords: string[] = []): string {
  const parts: string[] = []
  const quoted = keywords.length ? `“${keywords.join(" ")}”` : null
  if (language === "mn") {
    if (filters.district) parts.push(`${filters.district} дүүрэгт`)
    if (filters.rooms !== null) parts.push(`${filters.rooms} өрөө`)
    if (filters.min_area !== null) parts.push(`${filters.min_area} м²-аас том`)
    if (filters.max_price !== null) parts.push(`сард ${formatMnt(filters.max_price)}-өөс хэтрэхгүй`)
    if (quoted) parts.push(`${quoted} хайлтад тохирох`)
    return parts.join(", ")
  }
  parts.push("rental flat(s)")
  if (filters.rooms !== null) parts.push(`with ${filters.rooms} rooms`)
  if (filters.district) parts.push(`in ${DISTRICT_EN[filters.district]}`)
  if (filters.min_area !== null) parts.push(`of at least ${filters.min_area} m²`)
  if (filters.max_price !== null) parts.push(`up to ${formatMnt(filters.max_price)} a month`)
  if (quoted) parts.push(`matching ${quoted}`)
  return parts.join(" ")
}

function place(flat: Flat, language: QuestionLanguage): string {
  const district = language === "en" ? DISTRICT_EN[flat.district as keyof typeof DISTRICT_EN] ?? flat.district : flat.district
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
export function composeAnswer(
  filters: SearchFilters, language: QuestionLanguage, matches: Flat[],
  options: { keywords?: string[]; order?: "price" | "relevance" } = {},
): { answer: string; cited: number[] } {
  const what = criteria(filters, language, options.keywords)
  const byRelevance = options.order === "relevance"
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
  sentences.push(byRelevance
    ? (language === "mn" ? `Хамгийн сайн тохирох нь ${describe(cited[0], language)}.` : `The best match is ${describe(cited[0], language)}.`)
    : (language === "mn" ? `Хамгийн хямд нь ${describe(cited[0], language)}.` : `The cheapest is ${describe(cited[0], language)}.`))
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

/**
 * Full pipeline: question → filter JSON (+ semantic words) → database matches → grounded answer.
 *
 *   filters understood, no extra words   → filter matches, cheapest first
 *   filters + words ("тавилгатай")       → filter matches that are also relevant to the words
 *                                          (if none are, the words are ignored), cheapest first
 *   only words ("River garden-д байр")   → relevant flats, best match first
 *   nothing usable ("Сайн байна уу")     → UNCLEAR
 *
 * The answer is in `answerLanguage` (the interface language) when given, otherwise in the question's language.
 */
export function answerQuestion(question: string, catalogue: Flat[], semantic: Semantic = NO_SEMANTIC, answerLanguage?: QuestionLanguage): AskResponse {
  const parsed = parseSearchQuery(question)
  const { filters, understood } = parsed
  const language = answerLanguage ?? parsed.language
  const listed = catalogue.filter((flat) => flat.listingId !== null && flat.price !== null)
  const relevance = (flat: Flat) => semantic.scores.get(flat.id) ?? 0
  const search = (applied: boolean) => ({ engine: semantic.engine, terms: semantic.terms, applied })

  if (!understood) {
    const relevant = filters.price_type === "sale" ? [] : listed
      .filter((flat) => semantic.relevant.has(flat.id))
      .sort((a, b) => relevance(b) - relevance(a) || a.price! - b.price!)
    if (relevant.length) {
      const { answer, cited } = composeAnswer(filters, language, relevant, { keywords: semantic.terms, order: "relevance" })
      return { status: "OK", language, filters, answer, citedListingIds: cited, flats: relevant, search: search(true) }
    }
    return {
      status: "UNCLEAR",
      language,
      filters,
      answer: language === "mn"
        ? "Асуултаас дүүрэг, өрөөний тоо, үнэ, талбай эсвэл хотхоны нэрийг танисангүй. Жишээ нь: “Хан-Уулд 2.5 сая хүртэл 3 өрөө байр”."
        : "I could not find a district, room count, price, size or complex name in the question. For example: “3-room flat in Khan-Uul under 2.5 million”.",
      citedListingIds: [],
      flats: [],
      search: search(false),
    }
  }

  let matches = listed.filter((flat) => matchesFilters(flat, filters))
  const keyed = semantic.terms.length ? matches.filter((flat) => semantic.relevant.has(flat.id)) : []
  const applied = keyed.length > 0
  if (applied) matches = keyed
  matches.sort((a, b) => a.price! - b.price!)
  const { answer, cited } = composeAnswer(filters, language, matches, { keywords: applied ? semantic.terms : [] })
  return { status: matches.length ? "OK" : "NOT_FOUND", language, filters, answer, citedListingIds: cited, flats: matches, search: search(applied) }
}

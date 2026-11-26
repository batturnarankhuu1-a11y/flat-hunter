/**
 * Friendly chat assistant for finding a rental flat — rule based, no external API.
 *
 * Each message is read for a district, room count, price limit, area and extra wishes
 * ("тавилгатай", "зогсоолтой", "River garden"). What the user said earlier in the chat is kept in
 * `context`, so "Хан-Уулд байр" → "3 өрөө" → "2.5 сая хүртэл" narrows the same search step by step.
 * Replies are short, casual Mongolian and mention only flats that are really in the database.
 */
import type { Flat } from "@/components/types"
import { matchesFilters, parseSearchQuery, type SearchFilters } from "@/lib/query-parser"
import { fold, localSemanticSearch, meaningfulTerms } from "@/lib/semantic-search"
import { formatMnt } from "@/lib/rent-price"

export interface ChatContext {
  filters: SearchFilters
  /** Extra wishes in the user's own words ("тавилгатай", "River garden"). */
  terms: string[]
  /** How many results were already shown (for "өөр байна уу?"). */
  shown: number
}

export interface ChatFlat {
  id: string
  listingId: number | null
  title: string
  district: string
  rooms: number | null
  area: number | null
  price: number | null
  previousPrice: number | null
  badge: Flat["badge"]
  image: string
}

export type ChatIntent = "greeting" | "smalltalk" | "help" | "thanks" | "bye" | "search" | "more" | "not_found" | "sale" | "reset" | "unknown"

export interface ChatReply {
  intent: ChatIntent
  reply: string
  flats: ChatFlat[]
  /** Matches in total (flats holds at most PAGE of them). */
  total: number
  context: ChatContext
  /** Quick replies to show as buttons. */
  suggestions: string[]
}

const PAGE = 3
const EMPTY_FILTERS: SearchFilters = { price_type: null, rooms: null, district: null, max_price: null, min_area: null }
export const EMPTY_CONTEXT: ChatContext = { filters: EMPTY_FILTERS, terms: [], shown: 0 }

const STARTERS = ["Баянзүрхэд 2 өрөө 1.5 сая хүртэл", "Хан-Уулд тавилгатай 3 өрөө", "Хамгийн хямд 1 өрөө"]

// Message shapes (checked on lowercase text).
const GREETING = /^(сайн\s*(уу|байна\s*уу|байнуу|бну|бна\s*уу)|сн\s*уу|snu|sain\s*(uu|bnuu|baina\s*uu)|мэнд|hi|hello|hey|хай)(?![\p{L}])/u
const SMALLTALK = /(юу|ю|yu|yuu)\s*(байна|байн|bna|baina|bn)|сонин\s*юу|яаж\s*байна|ямар\s*байна|how are you/
const HELP = /тусла|туслаа|туслаач|юу\s*хийж\s*чад|юу\s*чаддаг|яаж\s*ашигла|help/
const THANKS = /баярлалаа|баярлаа|баярла|гоё\s*байна|ok\s*thanks|thanks|thank you|thx|rahmat|рахмат/
const BYE = /баяртай|бай\s*бай|дараа\s*уулз|bye|see you/
const RESET = /шинээр\s*(хай|эхл)|дахиад\s*эхл|бүгдийг\s*(арилга|цэвэрлэ)|reset|start over/
const MORE = /^(өөр|бусад|дараагийн|дараагийнх|ахиад|дахиад|more|next)(\s|$)|өөр\s*(байна|байр|юу)|бусдыг|илүү\s*олон/
const CHEAPER = /илүү\s*хямд|хямдхан|арай\s*хямд|cheaper/

/** Conversational phrases removed before reading wishes from a message. */
const CONVERSATION_PHRASES = [GREETING, SMALLTALK, HELP, THANKS, BYE, MORE, CHEAPER]
  // Whole words: "туслаач" goes, not just "тусла".
  .map((pattern) => new RegExp(`(?:${pattern.source.replace(/^\^/, "")})\\p{L}*`, "gu"))

/** Chat words that are not wishes about the flat. */
const CHAT_FILLER = ["hai", "olo", "olj", "olood", "ugoo", "ugnu", "ogoo", "ognu", "hereg", "sanal", "bolgo", "tusla", "baina", "bnuu", "yuu", "yu", "uu", "chamd", "nadad", "nad", "bi", "minii", "sonir", "medee", "harah", "haruul", "uzuul", "uzeh", "zaa", "za", "ok", "ene", "tere", "ted", "bol", "gej", "baigaa", "boloh", "bolno", "huu", "bas", "deer", "ni", "saihan", "goy", "goe", "shig", "jaahan", "ilu", "iluu", "hyamd", "hyamdhan", "arai"]

function isFiller(word: string): boolean {
  const folded = fold(word)
  return CHAT_FILLER.some((filler) => folded === filler || (filler.length >= 4 && folded.startsWith(filler)))
}

function mergeFilters(base: SearchFilters, next: SearchFilters): SearchFilters {
  return {
    price_type: next.price_type ?? base.price_type,
    rooms: next.rooms ?? base.rooms,
    district: next.district ?? base.district,
    max_price: next.max_price ?? base.max_price,
    min_area: next.min_area ?? base.min_area,
  }
}

const millions = (amount: number) => `${Number((amount / 1_000_000).toFixed(2))} сая`

/** "Хан-Уулд, 3 өрөө, 2.5 сая хүртэл, “тавилгатай”" */
export function describeWish(context: ChatContext): string {
  const { filters, terms } = context
  const parts: string[] = []
  if (filters.district) parts.push(filters.district)
  if (filters.rooms !== null) parts.push(`${filters.rooms} өрөө`)
  if (filters.max_price !== null) parts.push(`${millions(filters.max_price)} хүртэл`)
  if (filters.min_area !== null) parts.push(`${filters.min_area} м²-аас том`)
  if (terms.length) parts.push(`“${terms.join(", ")}”`)
  return parts.join(", ")
}

function toChatFlat(flat: Flat): ChatFlat {
  return {
    id: flat.id, listingId: flat.listingId, title: flat.title, district: flat.district, rooms: flat.rooms, area: flat.area,
    price: flat.price, previousPrice: flat.previousPrice, badge: flat.badge, image: flat.image.split(",")[0]?.trim() || "/apartment-placeholder.svg",
  }
}

/** Flats that match the filters and (when given) the wishes; wishes that match nothing are reported, not silently used. */
function search(context: ChatContext, catalogue: Flat[]): { matches: Flat[]; unmatchedTerms: boolean } {
  const listed = catalogue.filter((flat) => flat.listingId !== null && flat.price !== null)
  const filters = { ...context.filters, price_type: null }
  let matches = listed.filter((flat) => matchesFilters(flat, filters))
  let unmatchedTerms = false
  if (context.terms.length) {
    const semantic = localSemanticSearch(context.terms.join(" "), listed)
    const keyed = matches.filter((flat) => semantic.relevant.has(flat.id))
    if (keyed.length) matches = keyed
    else unmatchedTerms = true
  }
  return { matches: matches.sort((a, b) => a.price! - b.price!), unmatchedTerms }
}

/** Pick one phrasing by message, so replies vary but tests stay stable. */
function pick<T>(options: T[], seed: string): T {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return options[hash % options.length]
}

function foundReply(context: ChatContext, matches: Flat[], page: Flat[], seed: string, unmatchedTerms: boolean): string {
  const wish = describeWish({ ...context, terms: unmatchedTerms ? [] : context.terms })
  const first = page[0]
  const sentences: string[] = []
  if (unmatchedTerms) sentences.push(`“${context.terms.join(", ")}” гэснийг яг тааруулж чадсангүй, гэхдээ бусад нөхцөлөөр нь харлаа.`)
  sentences.push(pick([
    `За, ${wish ? `${wish} — ` : ""}${matches.length} байр олдлоо 🙌`,
    `Олчихлоо! ${wish ? `${wish}: ` : ""}нийт ${matches.length} байр байна 😊`,
    `Хараад үзлээ — ${wish ? `${wish}: ` : ""}${matches.length} байр таарч байна 👍`,
  ], seed))
  if (first?.price) sentences.push(`Хамгийн хямд нь сард ${formatMnt(first.price)}${first.area ? `, ${first.area} м²` : ""}.`)
  const deal = page.find((flat) => flat.badge === "cheap" && flat.priceDeviation !== null)
  if (deal) sentences.push(`Нэг нь ижил төстэй байруудаас ${Math.round(Math.abs(deal.priceDeviation!) * 100)}% хямд байна шүү 👀`)
  const dropped = page.find((flat) => flat.previousPrice !== null)
  if (dropped && !deal) sentences.push("Нэг нь саяхан үнээ буулгасан байна ↓")
  if (matches.length > page.length) sentences.push(`Өөрийг нь харах бол “өөр” гэж бичээрэй.`)
  return sentences.join(" ")
}

/** Friendly advice when nothing matches: which single change would give results. */
function notFoundReply(context: ChatContext, catalogue: Flat[]): { reply: string; suggestions: string[] } {
  const wish = describeWish(context)
  const tips: Array<{ text: string; suggestion: string }> = []
  const { filters } = context
  if (filters.max_price !== null) {
    const withoutPrice = search({ ...context, filters: { ...filters, max_price: null } }, catalogue).matches
    if (withoutPrice.length) tips.push({ text: `үнээ ${millions(withoutPrice[0].price!)} хүртэл өсгөвөл ${withoutPrice.length} байр гарч байна`, suggestion: `${millions(withoutPrice[0].price!)} хүртэл` })
  }
  if (filters.rooms !== null) {
    const withoutRooms = search({ ...context, filters: { ...filters, rooms: null } }, catalogue).matches
    const counts = new Map<number, number>()
    for (const flat of withoutRooms) if (flat.rooms !== null) counts.set(flat.rooms, (counts.get(flat.rooms) ?? 0) + 1)
    const best = [...counts].sort((a, b) => b[1] - a[1])[0]
    if (best) tips.push({ text: `${best[0]} өрөөтэй ${best[1]} байр байна`, suggestion: `${best[0]} өрөө` })
  }
  if (filters.district !== null) {
    const withoutDistrict = search({ ...context, filters: { ...filters, district: null } }, catalogue).matches
    const counts = new Map<string, number>()
    for (const flat of withoutDistrict) counts.set(flat.district, (counts.get(flat.district) ?? 0) + 1)
    const best = [...counts].sort((a, b) => b[1] - a[1])[0]
    if (best) tips.push({ text: `${best[0]} дүүрэгт ${best[1]} байр байна`, suggestion: best[0] })
  }
  if (context.terms.length) tips.push({ text: `“${context.terms.join(", ")}” гэснийг хасаад үзэж болно`, suggestion: "Шинээр хайх" })
  if (tips.length === 0 && filters.district !== null) {
    // Nothing close: at least say what the district has.
    const inDistrict = search({ ...EMPTY_CONTEXT, filters: { ...EMPTY_FILTERS, district: filters.district } }, catalogue).matches
    if (inDistrict.length) tips.push({ text: `${filters.district} дүүрэгт нийт ${inDistrict.length} байр байгаагийн хамгийн хямд нь сард ${formatMnt(inDistrict[0].price!)}`, suggestion: filters.district })
  }
  const opening = pick([`Хмм, ${wish || "ийм"} байр одоохондоо алга байна 😕`, `Харамсалтай нь ${wish || "ийм"} байр одоогоор олдсонгүй 😔`], wish)
  if (tips.length === 0) return { reply: `${opening} Нөхцөлөө жаахан өөрчлөөд үзэх үү?`, suggestions: ["Шинээр хайх", ...STARTERS.slice(0, 2)] }
  return {
    reply: `${opening} Гэхдээ ${tips.slice(0, 2).map((tip) => tip.text).join(", эсвэл ")}. ${tips.length > 1 ? "Аль нь дээр вэ?" : "Үзэх үү?"}`,
    suggestions: [...tips.slice(0, 3).map((tip) => tip.suggestion), "Шинээр хайх"],
  }
}

export function chatReply(message: string, previous: ChatContext, catalogue: Flat[]): ChatReply {
  const text = message.trim().toLowerCase()
  const base = (intent: ChatIntent, reply: string, context: ChatContext, suggestions: string[], flats: Flat[] = [], total = 0): ChatReply =>
    ({ intent, reply, flats: flats.map(toChatFlat), total, context, suggestions })

  if (RESET.test(text) || text === "шинээр хайх") {
    return base("reset", "За, шинээр эхэлье 🙂 Ямар байр хайж байна? Дүүрэг, өрөө, үнээ хэлээрэй.", EMPTY_CONTEXT, STARTERS)
  }

  const parsed = parseSearchQuery(message)
  // Wishes come from the message without its greeting / thanks / help phrases.
  const wishText = CONVERSATION_PHRASES.reduce((current, pattern) => current.replace(pattern, " "), message.toLowerCase())
  const terms = meaningfulTerms(wishText).map((term) => term.original).filter((word) => !isFiller(word))
  const hasSearch = parsed.understood || terms.length > 0

  // "өөр" / "илүү хямд" continue the previous search.
  if (!parsed.understood && previous.shown > 0) {
    if (MORE.test(text) && previous.shown > 0) {
      const { matches } = search(previous, catalogue)
      const page = matches.slice(previous.shown, previous.shown + PAGE)
      if (page.length === 0) return base("more", "Энэ хайлтад тохирох байрыг бүгдийг нь харуулчихлаа 🙂 Нөхцөлөө өөрчилж үзэх үү?", previous, ["Шинээр хайх", "Илүү хямд"])
      const shown = previous.shown + page.length
      const left = matches.length - shown
      return base("more", `Дараагийн ${page.length} нь энэ байна 👇${left > 0 ? ` Дахиад ${left} үлдсэн.` : " Энэ сүүлийнх нь."}`, { ...previous, shown }, left > 0 ? ["Өөр", "Илүү хямд"] : ["Шинээр хайх"], page, matches.length)
    }
    if (CHEAPER.test(text) && previous.shown > 0) {
      const { matches } = search(previous, catalogue)
      if (matches.length > 1) {
        const cap = matches[Math.floor((matches.length - 1) / 2)].price!
        const cheaper = { ...previous, filters: { ...previous.filters, max_price: cap }, shown: 0 }
        return respondWithSearch(cheaper, catalogue, text)
      }
    }
  }

  if (!hasSearch) {
    if (GREETING.test(text)) {
      return base("greeting", pick([
        "Сайн уу! 😊 Би Flat Hunter-ийн туслах. Ямар байр хайж байна? Жишээ нь “Хан-Уулд 2 өрөө, 2 сая хүртэл” гэж бичээрэй.",
        "Сайн байна уу! 👋 Түрээсийн байр хайхад чинь туслая. Аль дүүрэгт, хэдэн өрөө байр сонирхож байна?",
      ], text), previous, STARTERS)
    }
    if (SMALLTALK.test(text)) {
      return base("smalltalk", "Юмгүй ээ, сайн байна 😄 Чамд байр олоход туслахад бэлэн байна. Аль дүүрэгт байр хайж байна?", previous, STARTERS)
    }
    if (THANKS.test(text)) return base("thanks", "Зүгээр ээ 🤗 Өөр юм хэрэгтэй бол хэзээ ч хэлээрэй.", previous, ["Өөр байр харах", "Шинээр хайх"])
    if (BYE.test(text)) return base("bye", "Баяртай! Таалагдсан байраа олоосой 🍀", previous, [])
    if (HELP.test(text)) {
      return base("help", "Мэдээж туслая! 🙌 Надад дүүрэг, өрөөний тоо, үнийн дээд хязгаар, хүсвэл “тавилгатай”, “зогсоолтой” гэх мэт хүслээ бичээрэй — би одоо байгаа байрнуудаас шүүгээд хамгийн хямдыг нь эхэлж харуулна. Алхам алхмаар ч бичиж болно: эхлээд дүүрэг, дараа нь өрөө гэх мэт.", previous, STARTERS)
    }
    return base("unknown", "Уучлаарай, сайн ойлгосонгүй 😅 Дүүрэг, өрөөний тоо эсвэл үнээ бичээд үзээрэй — жишээ нь “Баянзүрхэд 1.5 сая хүртэл 2 өрөө”.", previous, STARTERS)
  }

  // Only unknown words (typos, other topics): say so instead of silently ignoring them.
  if (!parsed.understood && terms.length && localSemanticSearch(terms.join(" "), catalogue.filter((flat) => flat.price !== null)).relevant.size === 0) {
    return base("unknown", `Уучлаарай, “${terms.join(" ")}” гэдгийг сайн ойлгосонгүй 😅 Дүүрэг, өрөө, үнэ эсвэл хотхоны нэрээ бичээд үзээрэй.`, previous, previous.shown > 0 ? ["Өөр", "Шинээр хайх"] : STARTERS)
  }

  if (parsed.filters.price_type === "sale") {
    return base("sale", "Аа, манайд одоохондоо зөвхөн түрээсийн байр байгаа шүү 🙏 Түрээсээр сонирхох уу?", previous, STARTERS)
  }

  // Refine the earlier search; a new district or new wishes replace the old wishes.
  const sameTopic = !parsed.filters.district || parsed.filters.district === previous.filters.district
  const context: ChatContext = {
    filters: mergeFilters(previous.filters, parsed.filters),
    terms: terms.length ? [...new Set([...(sameTopic ? previous.terms : []), ...terms])] : sameTopic ? previous.terms : [],
    shown: 0,
  }
  const result = respondWithSearch(context, catalogue, text)
  return GREETING.test(text) ? { ...result, reply: `Сайн уу! 😊 ${result.reply}` } : result
}

function respondWithSearch(context: ChatContext, catalogue: Flat[], seed: string): ChatReply {
  const { matches, unmatchedTerms } = search(context, catalogue)
  if (matches.length === 0) {
    const { reply, suggestions } = notFoundReply(context, catalogue)
    return { intent: "not_found", reply, flats: [], total: 0, context, suggestions }
  }
  const page = matches.slice(0, PAGE)
  const suggestions = [
    ...(matches.length > PAGE ? ["Өөр"] : []),
    ...(context.filters.rooms === null ? ["2 өрөө"] : []),
    ...(context.terms.length === 0 ? ["тавилгатай"] : []),
    "Шинээр хайх",
  ]
  return {
    intent: "search",
    reply: foundReply(context, matches, page, seed, unmatchedTerms),
    flats: page.map(toChatFlat),
    total: matches.length,
    context: { ...context, shown: page.length },
    suggestions,
  }
}

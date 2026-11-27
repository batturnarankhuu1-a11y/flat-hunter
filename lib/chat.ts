/**
 * Friendly chat assistant for finding a rental flat — rule based, no external API.
 *
 * Each message is read for a district, room count, price limit, area and extra wishes
 * ("тавилгатай", "зогсоолтой", "River garden", "furnished"). What the user said earlier in the chat
 * is kept in `context`, so "Хан-Уулд байр" → "3 өрөө" → "2.5 сая хүртэл" narrows the same search
 * step by step. Replies are short and casual — Mongolian or English, following the interface
 * language — and mention only flats that are really in the database. Input is understood in
 * both languages whatever the interface language is.
 */
import type { Flat } from "@/components/types"
import { districtName, formatMillionsIn, tr, type Locale } from "@/lib/i18n"
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

/** Example searches offered as quick replies. */
export const CHAT_STARTERS: Record<Locale, string[]> = {
  mn: ["Баянзүрхэд 2 өрөө 1.5 сая хүртэл", "Хан-Уулд тавилгатай 3 өрөө", "Хамгийн хямд 1 өрөө"],
  en: ["2 rooms in Bayanzurkh up to 1.5M", "Furnished 3 rooms in Khan-Uul", "Cheapest 1 room"],
}

/** Quick-reply labels; each one is understood again when it is sent back as a message. */
const QUICK = {
  more: { mn: "Өөр", en: "More" },
  cheaper: { mn: "Илүү хямд", en: "Cheaper" },
  reset: { mn: "Шинээр хайх", en: "New search" },
  seeMore: { mn: "Өөр байр харах", en: "Show more" },
  twoRooms: { mn: "2 өрөө", en: "2 rooms" },
  furnished: { mn: "тавилгатай", en: "furnished" },
}

// Message shapes (checked on lowercase text), Mongolian and English.
const GREETING = /^(сайн\s*(уу|байна\s*уу|байнуу|бну|бна\s*уу)|сн\s*уу|snu|sain\s*(uu|bnuu|baina\s*uu)|мэнд|hi|hello|hey|hiya|howdy|good\s*(morning|afternoon|evening)|хай)(?![\p{L}])/u
const SMALLTALK = /(юу|ю|yu|yuu)\s*(байна|байн|bna|baina|bn)|сонин\s*юу|яаж\s*байна|ямар\s*байна|how are you|how's it going|what'?s up/
const HELP = /тусла|туслаа|туслаач|юу\s*хийж\s*чад|юу\s*чаддаг|яаж\s*ашигла|help|what can you do|how does (this|it) work/
const THANKS = /баярлалаа|баярлаа|баярла|гоё\s*байна|ok\s*thanks|thanks|thank you|thx|cheers|rahmat|рахмат/
const BYE = /баяртай|бай\s*бай|дараа\s*уулз|bye|goodbye|see you/
const RESET = /шинээр\s*(хай|эхл)|дахиад\s*эхл|бүгдийг\s*(арилга|цэвэрлэ)|reset|start over|start again|new search|clear (it|all|everything)/
const MORE = /^(өөр|бусад|дараагийн|дараагийнх|ахиад|дахиад|more|next|others)(\s|$)|өөр\s*(байна|байр|юу)|бусдыг|илүү\s*олон|show\s*(me\s*)?more|any\s*(more|others)|other\s*(ones|flats|options)/
const CHEAPER = /илүү\s*хямд|хямдхан|арай\s*хямд|cheaper|less expensive|lower price/

/** Conversational phrases removed before reading wishes from a message. */
const CONVERSATION_PHRASES = [GREETING, SMALLTALK, HELP, THANKS, BYE, MORE, CHEAPER]
  // Whole words: "туслаач" goes, not just "тусла".
  .map((pattern) => new RegExp(`(?:${pattern.source.replace(/^\^/, "")})\\p{L}*`, "gu"))

/** Chat words that are not wishes about the flat. */
const CHAT_FILLER = ["hai", "olo", "olj", "olood", "ugoo", "ugnu", "ogoo", "ognu", "hereg", "sanal", "bolgo", "tusla", "baina", "bnuu", "yuu", "yu", "uu", "chamd", "nadad", "nad", "bi", "minii", "sonir", "medee", "harah", "haruul", "uzuul", "uzeh", "zaa", "za", "ok", "ene", "tere", "ted", "bol", "gej", "baigaa", "boloh", "bolno", "huu", "bas", "deer", "ni", "saihan", "goy", "goe", "shig", "jaahan", "ilu", "iluu", "hyamd", "hyamdhan", "arai",
  // English chat words
  "im", "okay", "yes", "sure", "just", "also", "too", "only", "now", "again", "really", "great", "cool", "something", "place", "places", "options", "option", "ones", "one", "got", "tell", "know", "thank", "lets", "let", "us", "am", "was", "will", "should", "get", "see", "check", "into", "from", "that", "them", "they", "it's", "is", "are"]

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

/** "2.5 сая" / "2.5M ₮" */
const millions = (amount: number, locale: Locale) =>
  locale === "en" ? formatMillionsIn(amount, "en") : `${Number((amount / 1_000_000).toFixed(2))} сая`

/** "Хан-Уулд, 3 өрөө, 2.5 сая хүртэл, “тавилгатай”" / "Khan-Uul, 3 rooms, up to 2.5M ₮, “furnished”" */
export function describeWish(context: ChatContext, locale: Locale = "mn"): string {
  const { filters, terms } = context
  const parts: string[] = []
  if (filters.district) parts.push(districtName(filters.district, locale))
  if (filters.rooms !== null) parts.push(tr(locale, `${filters.rooms} өрөө`, `${filters.rooms} room${filters.rooms === 1 ? "" : "s"}`))
  if (filters.max_price !== null) parts.push(tr(locale, `${millions(filters.max_price, locale)} хүртэл`, `up to ${millions(filters.max_price, locale)}`))
  if (filters.min_area !== null) parts.push(tr(locale, `${filters.min_area} м²-аас том`, `over ${filters.min_area} m²`))
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

function foundReply(context: ChatContext, matches: Flat[], page: Flat[], seed: string, unmatchedTerms: boolean, locale: Locale): string {
  const t = <V,>(mn: V, en: V) => tr(locale, mn, en)
  const wish = describeWish({ ...context, terms: unmatchedTerms ? [] : context.terms }, locale)
  const first = page[0]
  const sentences: string[] = []
  const terms = context.terms.join(", ")
  if (unmatchedTerms) sentences.push(t(`“${terms}” гэснийг яг тааруулж чадсангүй, гэхдээ бусад нөхцөлөөр нь харлаа.`, `I couldn't match “${terms}” exactly, so I searched with the rest.`))
  const count = matches.length
  sentences.push(pick(t([
    `За, ${wish ? `${wish} — ` : ""}${count} байр олдлоо 🙌`,
    `Олчихлоо! ${wish ? `${wish}: ` : ""}нийт ${count} байр байна 😊`,
    `Хараад үзлээ — ${wish ? `${wish}: ` : ""}${count} байр таарч байна 👍`,
  ], [
    `Nice, ${wish ? `${wish} — ` : ""}I found ${count} flat${count === 1 ? "" : "s"} 🙌`,
    `Got it! ${wish ? `${wish}: ` : ""}${count} flat${count === 1 ? "" : "s"} in total 😊`,
    `Had a look — ${wish ? `${wish}: ` : ""}${count} flat${count === 1 ? " matches" : "s match"} 👍`,
  ]), seed))
  if (first?.price) {
    sentences.push(t(
      `Хамгийн хямд нь сард ${formatMnt(first.price)}${first.area ? `, ${first.area} м²` : ""}.`,
      `The cheapest is ${formatMnt(first.price)} a month${first.area ? `, ${first.area} m²` : ""}.`,
    ))
  }
  const deal = page.find((flat) => flat.badge === "cheap" && flat.priceDeviation !== null)
  if (deal) {
    const percent = Math.round(Math.abs(deal.priceDeviation!) * 100)
    sentences.push(t(`Нэг нь ижил төстэй байруудаас ${percent}% хямд байна шүү 👀`, `One of them is ${percent}% cheaper than similar flats 👀`))
  }
  const dropped = page.find((flat) => flat.previousPrice !== null)
  if (dropped && !deal) sentences.push(t("Нэг нь саяхан үнээ буулгасан байна ↓", "One of them just dropped its price ↓"))
  if (matches.length > page.length) sentences.push(t(`Өөрийг нь харах бол “өөр” гэж бичээрэй.`, `Type “more” to see the others.`))
  return sentences.join(" ")
}

/** Friendly advice when nothing matches: which single change would give results. */
function notFoundReply(context: ChatContext, catalogue: Flat[], locale: Locale): { reply: string; suggestions: string[] } {
  const t = <V,>(mn: V, en: V) => tr(locale, mn, en)
  const wish = describeWish(context, locale)
  const tips: Array<{ text: string; suggestion: string }> = []
  const { filters } = context
  if (filters.max_price !== null) {
    const withoutPrice = search({ ...context, filters: { ...filters, max_price: null } }, catalogue).matches
    if (withoutPrice.length) {
      const cap = millions(withoutPrice[0].price!, locale)
      const n = withoutPrice.length
      tips.push({
        text: t(`үнээ ${cap} хүртэл өсгөвөл ${n} байр гарч байна`, `raising the budget to ${cap} gives ${n} flat${n === 1 ? "" : "s"}`),
        suggestion: t(`${cap} хүртэл`, `up to ${cap}`),
      })
    }
  }
  if (filters.rooms !== null) {
    const withoutRooms = search({ ...context, filters: { ...filters, rooms: null } }, catalogue).matches
    const counts = new Map<number, number>()
    for (const flat of withoutRooms) if (flat.rooms !== null) counts.set(flat.rooms, (counts.get(flat.rooms) ?? 0) + 1)
    const best = [...counts].sort((a, b) => b[1] - a[1])[0]
    if (best) {
      const rooms = t(`${best[0]} өрөө`, `${best[0]} room${best[0] === 1 ? "" : "s"}`)
      tips.push({ text: t(`${best[0]} өрөөтэй ${best[1]} байр байна`, `there ${best[1] === 1 ? "is" : "are"} ${best[1]} flat${best[1] === 1 ? "" : "s"} with ${rooms}`), suggestion: rooms })
    }
  }
  if (filters.district !== null) {
    const withoutDistrict = search({ ...context, filters: { ...filters, district: null } }, catalogue).matches
    const counts = new Map<string, number>()
    for (const flat of withoutDistrict) counts.set(flat.district, (counts.get(flat.district) ?? 0) + 1)
    const best = [...counts].sort((a, b) => b[1] - a[1])[0]
    if (best) {
      const name = districtName(best[0], locale)
      tips.push({ text: t(`${name} дүүрэгт ${best[1]} байр байна`, `${name} has ${best[1]} flat${best[1] === 1 ? "" : "s"}`), suggestion: name })
    }
  }
  if (context.terms.length) {
    const terms = context.terms.join(", ")
    tips.push({ text: t(`“${terms}” гэснийг хасаад үзэж болно`, `you could drop “${terms}”`), suggestion: QUICK.reset[locale] })
  }
  if (tips.length === 0 && filters.district !== null) {
    // Nothing close: at least say what the district has.
    const inDistrict = search({ ...EMPTY_CONTEXT, filters: { ...EMPTY_FILTERS, district: filters.district } }, catalogue).matches
    if (inDistrict.length) {
      const name = districtName(filters.district, locale)
      const cheapest = formatMnt(inDistrict[0].price!)
      tips.push({
        text: t(`${name} дүүрэгт нийт ${inDistrict.length} байр байгаагийн хамгийн хямд нь сард ${cheapest}`, `${name} has ${inDistrict.length} flat${inDistrict.length === 1 ? "" : "s"} in total, the cheapest at ${cheapest} a month`),
        suggestion: name,
      })
    }
  }
  const opening = pick(t(
    [`Хмм, ${wish || "ийм"} байр одоохондоо алга байна 😕`, `Харамсалтай нь ${wish || "ийм"} байр одоогоор олдсонгүй 😔`],
    [`Hmm, no flats for ${wish || "that"} right now 😕`, `Sorry, I couldn't find anything for ${wish || "that"} yet 😔`],
  ), wish)
  if (tips.length === 0) return { reply: `${opening} ${t("Нөхцөлөө жаахан өөрчлөөд үзэх үү?", "Want to tweak the search a little?")}`, suggestions: [QUICK.reset[locale], ...CHAT_STARTERS[locale].slice(0, 2)] }
  const joined = tips.slice(0, 2).map((tip) => tip.text).join(t(", эсвэл ", ", or "))
  return {
    reply: t(
      `${opening} Гэхдээ ${joined}. ${tips.length > 1 ? "Аль нь дээр вэ?" : "Үзэх үү?"}`,
      `${opening} But ${joined}. ${tips.length > 1 ? "Which sounds better?" : "Shall I show you?"}`,
    ),
    suggestions: [...new Set([...tips.slice(0, 3).map((tip) => tip.suggestion), QUICK.reset[locale]])],
  }
}

export function chatReply(message: string, previous: ChatContext, catalogue: Flat[], locale: Locale = "mn"): ChatReply {
  const t = <V,>(mn: V, en: V) => tr(locale, mn, en)
  const starters = CHAT_STARTERS[locale]
  const text = message.trim().toLowerCase()
  const base = (intent: ChatIntent, reply: string, context: ChatContext, suggestions: string[], flats: Flat[] = [], total = 0): ChatReply =>
    ({ intent, reply, flats: flats.map(toChatFlat), total, context, suggestions })

  if (RESET.test(text) || text === "шинээр хайх") {
    return base("reset", t("За, шинээр эхэлье 🙂 Ямар байр хайж байна? Дүүрэг, өрөө, үнээ хэлээрэй.", "Okay, fresh start 🙂 What are you looking for? Tell me the district, rooms and budget."), EMPTY_CONTEXT, starters)
  }

  const parsed = parseSearchQuery(message)
  // Wishes come from the message without its greeting / thanks / help phrases.
  const wishText = CONVERSATION_PHRASES.reduce((current, pattern) => current.replace(pattern, " "), message.toLowerCase())
  const terms = meaningfulTerms(wishText).map((term) => term.original).filter((word) => !isFiller(word))
  const hasSearch = parsed.understood || terms.length > 0

  // "өөр" / "илүү хямд" continue the previous search.
  if (!parsed.understood && previous.shown > 0) {
    if (MORE.test(text)) {
      const { matches } = search(previous, catalogue)
      const page = matches.slice(previous.shown, previous.shown + PAGE)
      if (page.length === 0) {
        return base("more", t("Энэ хайлтад тохирох байрыг бүгдийг нь харуулчихлаа 🙂 Нөхцөлөө өөрчилж үзэх үү?", "That's every flat for this search 🙂 Want to change something?"), previous, [QUICK.reset[locale], QUICK.cheaper[locale]])
      }
      const shown = previous.shown + page.length
      const left = matches.length - shown
      return base("more", t(
        `Дараагийн ${page.length} нь энэ байна 👇${left > 0 ? ` Дахиад ${left} үлдсэн.` : " Энэ сүүлийнх нь."}`,
        `Here are the next ${page.length} 👇${left > 0 ? ` ${left} more left.` : " That's the last of them."}`,
      ), { ...previous, shown }, left > 0 ? [QUICK.more[locale], QUICK.cheaper[locale]] : [QUICK.reset[locale]], page, matches.length)
    }
    if (CHEAPER.test(text)) {
      const { matches } = search(previous, catalogue)
      if (matches.length > 1) {
        const cap = matches[Math.floor((matches.length - 1) / 2)].price!
        const cheaper = { ...previous, filters: { ...previous.filters, max_price: cap }, shown: 0 }
        return respondWithSearch(cheaper, catalogue, text, locale)
      }
    }
  }

  if (!hasSearch) {
    if (GREETING.test(text)) {
      return base("greeting", pick(t([
        "Сайн уу! 😊 Би Flat Hunter-ийн туслах. Ямар байр хайж байна? Жишээ нь “Хан-Уулд 2 өрөө, 2 сая хүртэл” гэж бичээрэй.",
        "Сайн байна уу! 👋 Түрээсийн байр хайхад чинь туслая. Аль дүүрэгт, хэдэн өрөө байр сонирхож байна?",
      ], [
        "Hi there! 😊 I'm the Flat Hunter assistant. What kind of place are you after? Try something like “2 rooms in Khan-Uul up to 2M”.",
        "Hello! 👋 Happy to help you find a rental. Which district, and how many rooms?",
      ]), text), previous, starters)
    }
    if (SMALLTALK.test(text)) {
      return base("smalltalk", t("Юмгүй ээ, сайн байна 😄 Чамд байр олоход туслахад бэлэн байна. Аль дүүрэгт байр хайж байна?", "All good here, thanks 😄 Ready to help you find a flat. Which district are you looking in?"), previous, starters)
    }
    if (THANKS.test(text)) return base("thanks", t("Зүгээр ээ 🤗 Өөр юм хэрэгтэй бол хэзээ ч хэлээрэй.", "You're welcome 🤗 Just shout if you need anything else."), previous, [QUICK.seeMore[locale], QUICK.reset[locale]])
    if (BYE.test(text)) return base("bye", t("Баяртай! Таалагдсан байраа олоосой 🍀", "Bye! Hope you find a place you love 🍀"), previous, [])
    if (HELP.test(text)) {
      return base("help", t(
        "Мэдээж туслая! 🙌 Надад дүүрэг, өрөөний тоо, үнийн дээд хязгаар, хүсвэл “тавилгатай”, “зогсоолтой” гэх мэт хүслээ бичээрэй — би одоо байгаа байрнуудаас шүүгээд хамгийн хямдыг нь эхэлж харуулна. Алхам алхмаар ч бичиж болно: эхлээд дүүрэг, дараа нь өрөө гэх мэт.",
        "Sure thing! 🙌 Tell me a district, the number of rooms, your top budget and any wishes like “furnished” or “parking” — I'll filter the flats we have and show the cheapest first. You can also go step by step: district first, then rooms, and so on.",
      ), previous, starters)
    }
    return base("unknown", t(
      "Уучлаарай, сайн ойлгосонгүй 😅 Дүүрэг, өрөөний тоо эсвэл үнээ бичээд үзээрэй — жишээ нь “Баянзүрхэд 1.5 сая хүртэл 2 өрөө”.",
      "Sorry, I didn't quite get that 😅 Try a district, number of rooms or a budget — for example “2 rooms in Bayanzurkh up to 1.5M”.",
    ), previous, starters)
  }

  // Only unknown words (typos, other topics): say so instead of silently ignoring them.
  if (!parsed.understood && terms.length && localSemanticSearch(terms.join(" "), catalogue.filter((flat) => flat.price !== null)).relevant.size === 0) {
    const said = terms.join(" ")
    return base("unknown", t(
      `Уучлаарай, “${said}” гэдгийг сайн ойлгосонгүй 😅 Дүүрэг, өрөө, үнэ эсвэл хотхоны нэрээ бичээд үзээрэй.`,
      `Sorry, I didn't understand “${said}” 😅 Try a district, rooms, a budget or a complex name.`,
    ), previous, previous.shown > 0 ? [QUICK.more[locale], QUICK.reset[locale]] : starters)
  }

  if (parsed.filters.price_type === "sale") {
    return base("sale", t("Аа, манайд одоохондоо зөвхөн түрээсийн байр байгаа шүү 🙏 Түрээсээр сонирхох уу?", "Ah, we only have rentals for now 🙏 Would a rental work for you?"), previous, starters)
  }

  // Refine the earlier search; a new district or new wishes replace the old wishes.
  const sameTopic = !parsed.filters.district || parsed.filters.district === previous.filters.district
  const context: ChatContext = {
    filters: mergeFilters(previous.filters, parsed.filters),
    terms: terms.length ? [...new Set([...(sameTopic ? previous.terms : []), ...terms])] : sameTopic ? previous.terms : [],
    shown: 0,
  }
  const result = respondWithSearch(context, catalogue, text, locale)
  return GREETING.test(text) ? { ...result, reply: `${t("Сайн уу!", "Hi!")} 😊 ${result.reply}` } : result
}

function respondWithSearch(context: ChatContext, catalogue: Flat[], seed: string, locale: Locale): ChatReply {
  const { matches, unmatchedTerms } = search(context, catalogue)
  if (matches.length === 0) {
    const { reply, suggestions } = notFoundReply(context, catalogue, locale)
    return { intent: "not_found", reply, flats: [], total: 0, context, suggestions }
  }
  const page = matches.slice(0, PAGE)
  const suggestions = [
    ...(matches.length > PAGE ? [QUICK.more[locale]] : []),
    ...(context.filters.rooms === null ? [QUICK.twoRooms[locale]] : []),
    ...(context.terms.length === 0 ? [QUICK.furnished[locale]] : []),
    QUICK.reset[locale],
  ]
  return {
    intent: "search",
    reply: foundReply(context, matches, page, seed, unmatchedTerms, locale),
    flats: page.map(toChatFlat),
    total: matches.length,
    context: { ...context, shown: page.length },
    suggestions,
  }
}

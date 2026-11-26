import { findDistricts, type District } from "./districts.ts"

/**
 * Step 1 of AI search (spec §11): the question becomes this filter JSON.
 * Anything the user did not mention is null.
 */
export interface SearchFilters {
  price_type: "rent" | "sale" | null
  rooms: number | null
  district: District | null
  /** Monthly rent ceiling in MNT. */
  max_price: number | null
  /** m² */
  min_area: number | null
}

export type QuestionLanguage = "mn" | "en"

export interface ParsedQuery {
  filters: SearchFilters
  language: QuestionLanguage
  /** True when at least one filter was recognized. */
  understood: boolean
}

const MN_NUMBER_WORDS: Record<string, number> = {
  "нэг": 1, "хоёр": 2, "гурав": 3, "гурван": 3, "дөрөв": 4, "дөрвөн": 4, "тав": 5, "таван": 5,
}
const EN_NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, single: 1 }

/** Mongolian if the question is mostly Cyrillic, otherwise English. */
export function detectLanguage(text: string): QuestionLanguage {
  const cyrillic = (text.match(/[а-яөүё]/gi) ?? []).length
  const latin = (text.match(/[a-z]/gi) ?? []).length
  return cyrillic >= latin ? "mn" : "en"
}

type Bound = "upper" | "lower" | null

/** Words right after a number: "саяас доош", "-аас дээш", "or less", "max". */
function boundAfter(after: string): Bound {
  // Only the words up to the next number or clause break ("," ";" "and" "ба") belong to this number.
  const window = after.split(/\d|[,;]|\band\b|\sба\s/)[0].slice(0, 30)
  for (const [word] of window.matchAll(/[a-zа-яөүё]+/gi)) {
    const w = word.toLowerCase()
    if (/^(бага|доош)[а-яөү]*гүй$/.test(w)) return "lower"
    if (/^(их|илүү|хэтрэх|давах)[а-яөү]*гүй$/.test(w)) return "upper"
    if (/^(доош|бага|хүртэл|хямд|дотор|less|max|maximum|below|under)/.test(w)) return "upper"
    if (/^(дээш|их|илүү|өндөр|том|гаруй|more|plus|above|over|min|minimum|least)/.test(w)) return "lower"
  }
  return null
}

/** Words right before a number: "under 1.5m", "дээд тал нь 2 сая", "at least 50 m2". */
function boundBefore(before: string): Bound {
  const tail = before.split(/[,;]|\band\b|\sба\s/).pop()!.slice(-28).toLowerCase()
  if (/(under|below|max(imum)?|up to|less than|budget|дээд\s*тал(\s*нь)?|хамгийн\s*ихдээ|төсөв)[^\d]*$/.test(tail)) return "upper"
  if (/(at least|min(imum)?|more than|over|above|from|доод\s*тал(\s*нь)?|хамгийн\s*багадаа)[^\d]*$/.test(tail)) return "lower"
  return null
}

function toNumber(text: string): number {
  return Number(text.replace(/[\s,](?=\d{3}(?!\d))/g, "").replace(",", "."))
}

/** Number + unit → MNT, or null when it is not a money amount. */
function moneyValue(value: number, unit: string | undefined): number | null {
  const u = unit?.toLowerCase()
  if (u && /^(сая|million|mln|m)$/.test(u)) return value * 1_000_000
  if (u && /^(мянга|мян|k|к|thousand)$/.test(u)) return value * 1_000
  if (u && /^(₮|төг|төгрөг|tug|tugrik|mnt)/.test(u)) return value
  if (value >= 100_000) return value // bare "1500000"
  return null
}

/**
 * "Би Баянзүрх дүүрэгт 1.5 саяас доош 2 өрөө байр хайж байна"
 *   → { price_type: "rent", rooms: 2, district: "Баянзүрх", max_price: 1500000, min_area: null }
 * "2 bedroom flat for rent in Khan-Uul under 2.5 million, at least 60 m2"
 *   → { price_type: "rent", rooms: 2, district: "Хан-Уул", max_price: 2500000, min_area: 60 }
 */
export function parseSearchQuery(input: string): ParsedQuery {
  const language = detectLanguage(input)
  const text = ` ${input.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ")} `
  const filters: SearchFilters = { price_type: null, rooms: null, district: findDistricts(text)[0] ?? null, max_price: null, min_area: null }

  // --- price_type
  if (/түрээс|\brent(?:al|ing)?\b|\blease\b|сараар|сард/.test(text)) filters.price_type = "rent"
  if (/худалд|зарна|зарах|\bbuy(?:ing)?\b|\bpurchase\b|\bfor sale\b/.test(text)) filters.price_type = "sale"

  // --- rooms: "2 өрөө", "хоёр өрөө", "2 room", "2-bedroom", "2br", "two rooms"
  const mnDigit = text.match(/(\d)\s*-?\s*(?:ш\s*)?өрөө/)
  const mnWord = text.match(new RegExp(`(${Object.keys(MN_NUMBER_WORDS).join("|")})\\s*өрөө`))
  const enDigit = text.match(/(\d)\s*-?\s*(?:rooms?|bedrooms?|bed|br|bdr)\b/)
  const enWord = text.match(new RegExp(`\\b(${Object.keys(EN_NUMBER_WORDS).join("|")})[\\s-]*(?:rooms?|bedrooms?|bed)\\b`))
  if (mnDigit) filters.rooms = Number(mnDigit[1])
  else if (enDigit) filters.rooms = Number(enDigit[1])
  else if (mnWord) filters.rooms = MN_NUMBER_WORDS[mnWord[1]]
  else if (enWord) filters.rooms = EN_NUMBER_WORDS[enWord[1]]
  if (/студи|studio/.test(text) && filters.rooms === null) filters.rooms = 1
  // Blank out handled phrases so their numbers are not re-read as prices or areas.
  let rest = text.replace(/\d\s*-?\s*(?:ш\s*)?(?:өрөө|rooms?|bedrooms?|bed|br|bdr)\b/g, " ")

  // --- min_area: "60 м2-аас дээш", "at least 50 sqm", "50мкв"
  const areaPattern = /(\d+(?:[.,]\d+)?)\s*(?:м2|м²|мкв|м\.кв|кв\.?м|квадрат|m2|m²|sqm|sq\.?\s*m|square\s*met(?:er|re)s?)/g
  for (const match of rest.matchAll(areaPattern)) {
    const bound = boundBefore(rest.slice(0, match.index)) ?? boundAfter(rest.slice(match.index! + match[0].length))
    if (bound !== "upper") filters.min_area = toNumber(match[1]) // an area without "up to" is a minimum
  }
  rest = rest.replace(areaPattern, " ")

  // --- max_price: "1.5 саяас доош", "under 1.5 million", "1,500,000₮ хүртэл", "1-1.5 сая" (→ 1.5 сая)
  const range = rest.match(/(\d+(?:[.,]\d+)?)\s*(?:сая|million|m)?\s*(?:-|–|аас|ээс|оос|өөс|to)\s*(\d+(?:[.,]\d+)?)\s*(сая|мянга|million|m|k)\b/)
  if (range) {
    filters.max_price = moneyValue(toNumber(range[2]), range[3])
  } else {
    const moneyPattern = /(\d{1,3}(?:[ ,]\d{3})+|\d+(?:[.,]\d+)?)\s*(сая|мянга|мян|million|mln|thousand|k|к|m\b|₮|төгрөг|төг|tugriks?|tug|mnt)?/g
    for (const match of rest.matchAll(moneyPattern)) {
      const amount = moneyValue(toNumber(match[1]), match[2])
      if (amount === null) continue
      const bound = boundBefore(rest.slice(0, match.index)) ?? boundAfter(rest.slice(match.index! + match[0].length))
      // A budget with no direction is a ceiling; "саяас дээш" (a floor) is not part of the filter schema.
      if (bound !== "lower") filters.max_price = amount
    }
  }

  const understood = Object.values(filters).some((value) => value !== null)
  return { filters, language, understood }
}

export interface FilterableFlat {
  district: string
  rooms: number | null
  area: number | null
  /** Lowest valid rent; null when every listing needs review or is negotiable. */
  price: number | null
}

/** Only flats with a reviewed (valid) price can match — needs_review prices never reach answers. */
export function matchesFilters(flat: FilterableFlat, filters: SearchFilters): boolean {
  if (filters.price_type === "sale") return false // the catalogue is rent-only
  if (flat.price === null) return false
  if (filters.district !== null && flat.district !== filters.district) return false
  if (filters.rooms !== null && flat.rooms !== filters.rooms) return false
  if (filters.max_price !== null && flat.price > filters.max_price) return false
  if (filters.min_area !== null && (flat.area === null || flat.area < filters.min_area)) return false
  return true
}

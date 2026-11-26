/** Canonical Ulaanbaatar district names used across the app. */
export const DISTRICTS = ["Баянзүрх", "Сүхбаатар", "Хан-Уул", "Чингэлтэй", "Баянгол", "Сонгинохайрхан"] as const
export type District = (typeof DISTRICTS)[number]

export const DISTRICT_ABBREVIATIONS: Record<District, string> = {
  "Баянзүрх": "БЗД",
  "Сүхбаатар": "СБД",
  "Хан-Уул": "ХУД",
  "Чингэлтэй": "ЧД",
  "Баянгол": "БГД",
  "Сонгинохайрхан": "СХД",
}

// Patterns match the stem so inflected forms work too:
// "Баянзүрхэд", "Хан-Уулд", "хан уулын", "СБД-д", "bayanzurkh" …
const DISTRICT_PATTERNS: Array<[District, RegExp]> = [
  // Latin forms ("BGD 26r horoo", "bzd", "hud") are common in unegui descriptions.
  ["Баянзүрх", /баянзүрх|(?<![а-яөү])бзд(?![а-яөү])|bayanz[uü]r|bayanzurh|(?<![a-z])bzd(?![a-z])/i],
  ["Сүхбаатар", /сүхбаатар|(?<![а-яөү])сбд(?![а-яөү])|s[uü]k?hbaatar|(?<![a-z])sbd(?![a-z])/i],
  ["Хан-Уул", /хан[\s-]*уул|(?<![а-яөү])худ(?![а-яөү])|k?han[\s-]*uul|(?<![a-z])k?hud(?![a-z])/i],
  ["Чингэлтэй", /чингэлтэй|(?<![а-яөү])чгд(?![а-яөү])|(?<![а-яөү])чд(?![а-яөү])|chingelte[ij]|(?<![a-z])chd(?![a-z])/i],
  ["Баянгол", /баянгол|(?<![а-яөү])бгд(?![а-яөү])|bayangol|(?<![a-z])bgd(?![a-z])/i],
  ["Сонгинохайрхан", /сонгинохайрхан|сонгино|(?<![а-яөү])схд(?![а-яөү])|songino|(?<![a-z])s[kh]?hd(?![a-z])/i],
]

/** Every district mentioned in a free-text sentence, in canonical form. */
export function findDistricts(raw: string): District[] {
  const text = raw.toLowerCase()
  return DISTRICT_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([district]) => district)
}

/** Map any free-text district mention ("БЗД 26-р хороо", "Хан-Уул дүүрэг") to its canonical name. */
export function normalizeDistrict(raw: string | null | undefined): District | null {
  if (!raw) return null
  const text = raw.toLowerCase()
  for (const [district, pattern] of DISTRICT_PATTERNS) {
    if (pattern.test(text)) return district
  }
  return null
}

/**
 * Local semantic search — the fallback when Pinecone / Hugging Face keys are not configured.
 *
 * Every flat becomes a sparse vector built from its title, complex, khoroo and address:
 *   - Cyrillic and Latin spellings are folded to one form ("Ривер гарден" = "river garden",
 *     "Хүннү" = "khunnu" = "hunnu"), so Mongolian and English questions hit the same words;
 *   - common English words are mapped to the Mongolian words used in the ads
 *     ("furnished" → тавилгатай, "parking" → зогсоол, "downtown" → төв …);
 *   - words are cut to a 5-letter stem ("хотхонд" = "хотхон") and also split into letter
 *     trigrams, so small spelling differences still match;
 *   - features are weighted by TF-IDF over the 87 flats.
 * The question gets the same treatment, minus what the filter parser already understood
 * (district, rooms, price, area) and filler words. Ranking is cosine similarity; a flat counts as
 * relevant when it covers at least half of the question's remaining meaning (IDF-weighted).
 */
import type { Flat } from "@/components/types"

export interface SemanticResult {
  engine: "pinecone" | "local"
  /** The question's own words that carried meaning beyond the structured filters. */
  terms: string[]
  /** Relevance per flat id, 0–1. */
  scores: Map<string, number>
  /** Flat ids that match the terms well enough to be used as a filter. */
  relevant: Set<string>
}

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n",
  о: "o", ө: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ү: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
  ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
}

/** Lowercase, Cyrillic → Latin, and the usual Latin spelling variants folded together. */
export function fold(text: string): string {
  return text.toLowerCase()
    .replace(/[а-яёөү]/g, (char) => CYRILLIC[char] ?? char)
    .replace(/kh/g, "h").replace(/zh/g, "j").replace(/[uü]/g, "u").replace(/ö/g, "o")
}

/** English words → the Mongolian word stems the ads use. */
const SYNONYMS: Record<string, string[]> = {
  furnished: ["tavil"], furniture: ["tavil"], furnish: ["tavil"],
  parking: ["zogso", "graj", "garaj"], garage: ["graj", "garaj", "zogso"],
  center: ["tov"], centre: ["tov"], downtown: ["tov"], city: ["hotin", "tov"],
  new: ["shine"], brand: ["shine"], renovated: ["zasva", "shine"], renovation: ["zasva"],
  master: ["maste"], school: ["surgu"], kitchen: ["gal", "togoo"], separate: ["tusda"],
  warm: ["dulaa"], heated: ["dulaa"], elevator: ["lift"], lift: ["lift"],
  near: [], view: ["view"], duplex: ["duple"], luxury: ["tansa"], penthouse: ["tansa"],
}

/** Filler words, and what the structured filters already cover (rooms, price, area, rent …). */
const STOP_EXACT = new Set([
  "a", "an", "the", "i", "me", "my", "we", "in", "on", "at", "of", "for", "to", "and", "or", "with", "is", "are", "be", "it", "this",
  "what", "where", "which", "how", "who", "there", "have", "has", "do", "does", "you", "your", "good", "best", "nice", "thanks",
  "please", "hello", "hi", "hey", "want", "need", "looking", "look", "find", "search", "show", "give", "any", "some", "can", "could",
  "would", "like", "buy", "sell", "sale", "rent", "rental", "renting", "lease", "flat", "flats", "apartment", "apartments", "home", "house",
  "room", "rooms", "bedroom", "bedrooms", "bed", "bd", "br", "studio", "month", "monthly", "per", "price", "cheap", "cheapest", "budget",
  "under", "below", "less", "than", "more", "above", "over", "least", "max", "maximum", "min", "minimum", "up", "around", "about",
  "million", "mln", "thousand", "mnt", "tug", "tugrik", "sqm", "m", "mkv", "district", "near", "close", "by", "area", "size",
  "bi", "ba", "ni", "n", "uu", "yu", "ve", "be", "bol", "baina", "bain", "bna", "sain", "sn", "bai", "baigaa", "baih", "bolno", "boloh",
  "aas", "ees", "oos", "iin", "ii", "d", "t", "dee", "deer", "door", "doosh", "deesh", "hurtel", "hamgiin", "hyamd", "une", "unee",
  "ih", "baga", "ilu", "ilv", "tom", "jijig", "tal", "talbai", "ner", "oir", "oirolts", "hajuud",
])
const STOP_PREFIXES = [
  "bair", "oroo", "uruu", "turee", "tures", "haij", "hain", "haih", "hailt", "saya", "myang", "doosh", "deesh", "hurte", "hetre", "davah",
  "duure", "horoo", "horool", "sard", "sariin", "une", "tugr", "baina", "baigaa", "hereg", "avah", "avna", "zarna", "zarah",
  "oron", "suuts", "hotho",
]
/** District names: the filter parser handles them; long names match by prefix, short ones only with a short suffix. */
const DISTRICT_WORDS = ["bayanzurh", "suhbaatar", "chingeltei", "bayangol", "songinohairhan", "songino"]
const DISTRICT_SHORT = ["han", "uul", "bzd", "sbd", "hud", "chd", "bgd", "shd", "chgd", "skhd"]

function isDistrictWord(word: string): boolean {
  if (DISTRICT_WORDS.some((name) => word.startsWith(name.slice(0, 6)) || name.startsWith(word) && word.length >= 4)) return true
  return DISTRICT_SHORT.some((short) => word.startsWith(short) && word.length - short.length <= 3)
}

const stem = (word: string) => word.slice(0, 5)

interface Term { original: string; stems: string[] }

/** Words of the text that carry meaning, each with the stems it stands for. */
export function meaningfulTerms(text: string): Term[] {
  const terms: Term[] = []
  // Drop numbers with their units ("1.5 сая", "60 м2", "3 өрөө") — the filter parser owns them.
  const cleaned = text.replace(/\d+(?:[.,]\d+)?\s*(?:-?\s*(?:сая|мянга\S*|million|mln|m2|м2|мкв|m²|м²|sqm|өрөө\S*|room\S*|bed\S*|₮|төг\S*))?/gi, (match) => (/^\d{4}$/.test(match.trim()) ? match : " "))
  for (const original of cleaned.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const word = fold(original)
    if (/^\d+$/.test(word) && word.length !== 4) continue
    if (word.length < 3 && !/^\d{4}$/.test(word)) continue
    if (STOP_EXACT.has(word) || STOP_PREFIXES.some((prefix) => word.startsWith(prefix)) || isDistrictWord(word)) continue
    const mapped = SYNONYMS[word] ?? SYNONYMS[word.replace(/(ed|s|ing)$/, "")]
    if (mapped && mapped.length === 0) continue
    terms.push({ original, stems: mapped ?? [stem(word)] })
  }
  return terms
}

type Vector = Map<string, number>

function features(stems: string[]): Vector {
  const vector: Vector = new Map()
  const add = (key: string, weight: number) => vector.set(key, (vector.get(key) ?? 0) + weight)
  for (const s of stems) {
    add(`w:${s}`, 1)
    if (s.length >= 4) for (let i = 0; i + 3 <= s.length; i++) add(`t:${s.slice(i, i + 3)}`, 0.25)
  }
  return vector
}

/** All stems of a flat's own text (title, complex, khoroo, address). */
function documentStems(flat: Flat): string[] {
  const text = [flat.title, flat.complex, flat.address].filter(Boolean).join(" ")
  return text.split(/[^\p{L}\p{N}]+/u).map((word) => fold(word)).filter((word) => word.length >= 3 || /^\d{4}$/.test(word)).map(stem)
}

function normalize(vector: Vector): Vector {
  const length = Math.sqrt([...vector.values()].reduce((sum, value) => sum + value * value, 0)) || 1
  return new Map([...vector].map(([key, value]) => [key, value / length]))
}

function cosine(a: Vector, b: Vector): number {
  let sum = 0
  for (const [key, value] of a) sum += value * (b.get(key) ?? 0)
  return sum
}

/** Minimum share of the question's (IDF-weighted) terms a flat must contain to count as relevant. */
export const MIN_COVERAGE = 0.5

export function localSemanticSearch(question: string, flats: Flat[]): SemanticResult {
  const terms = meaningfulTerms(question)
  const empty: SemanticResult = { engine: "local", terms: terms.map((term) => term.original), scores: new Map(), relevant: new Set() }
  if (terms.length === 0 || flats.length === 0) return empty

  const docs = flats.map((flat) => ({ flat, stems: new Set(documentStems(flat)), vector: features(documentStems(flat)) }))
  const documentFrequency = new Map<string, number>()
  for (const doc of docs) for (const key of doc.vector.keys()) documentFrequency.set(key, (documentFrequency.get(key) ?? 0) + 1)
  const idf = (key: string) => Math.log(1 + flats.length / (1 + (documentFrequency.get(key) ?? 0)))
  const weigh = (vector: Vector) => normalize(new Map([...vector].map(([key, value]) => [key, value * idf(key)])))

  const query = weigh(features(terms.flatMap((term) => term.stems)))
  const termWeight = terms.map((term) => Math.max(...term.stems.map((s) => idf(`w:${s}`))))
  const totalWeight = termWeight.reduce((sum, weight) => sum + weight, 0)

  for (const doc of docs) {
    const score = cosine(query, weigh(doc.vector))
    // A term is covered when one of its stems is in the flat's text (prefix match for short stems).
    const covered = terms.reduce((sum, term, index) => sum + (term.stems.some((s) => [...doc.stems].some((d) => d === s || (s.length >= 3 && d.startsWith(s)))) ? termWeight[index] : 0), 0)
    const coverage = totalWeight ? covered / totalWeight : 0
    empty.scores.set(doc.flat.id, Math.round(Math.max(score, 0) * 1000) / 1000)
    if (coverage >= MIN_COVERAGE && score > 0) empty.relevant.add(doc.flat.id)
  }
  return empty
}

/** Text that represents a flat in a vector index (Pinecone) — same fields as the local search. */
export function flatDocument(flat: Flat): string {
  return [flat.title, flat.complex, flat.address, `${flat.district} дүүрэг`, flat.rooms !== null ? `${flat.rooms} өрөө` : null, flat.area !== null ? `${flat.area} м²` : null]
    .filter(Boolean).join(". ")
}

/**
 * valid        — parsed and within the plausible monthly-rent range
 * needs_review — parsed, but outside 1 сая – 20 сая ₮ (typo, sale price, per-day price …)
 * negotiable   — "тохиролцоно": no number given
 * invalid      — text we could not read as a price
 * missing      — empty
 */
export type RentPriceStatus = "valid" | "needs_review" | "negotiable" | "invalid" | "missing"

export interface RentPriceResult {
  /** Monthly rent in whole MNT (₮). Kept even when it needs review; null when unknown. */
  amount: number | null
  status: RentPriceStatus
}

export type PriceType = "rent" | "sale"

/** Rents outside this range are stored but flagged needs_review (spec §14; the lower bound is the team rule). */
export const MIN_MONTHLY_RENT = 1_000_000
export const MAX_MONTHLY_RENT = 20_000_000
/** Spec §14: a sale price under 1 сая is not a real sale price. */
export const MIN_SALE_PRICE = 1_000_000

const NEGOTIABLE = /тохиролц|үнэ\s*асуу|асууж\s*болно|холбогдо|залга|үнийн\s*санал|negotiable/i

/**
 * Normalize messy rent text into whole MNT.
 *
 *   "1.2 сая"       → 1 200 000   (valid)
 *   "1,5 сая"       → 1 500 000   (valid)
 *   "2.2 сая ₮"     → 2 200 000   (valid)
 *   "1 750 000 төг" → 1 750 000   (valid)
 *   "120 сая"       → 120 000 000 (needs_review: above 20 сая)
 *   "850,000₮"      → 850 000     (needs_review: below 1 сая)
 *   "тохиролцоно"   → null        (negotiable)
 */
export function parsePrice(raw: string | number | null | undefined, priceType: PriceType): RentPriceResult {
  const classify = (amount: number) => classifyAmount(amount, priceType)
  if (raw === null || raw === undefined) return { amount: null, status: "missing" }
  if (typeof raw === "number") return classify(raw)

  const text = raw.trim().toLowerCase()
  if (!text) return { amount: null, status: "missing" }
  if (NEGOTIABLE.test(text)) return { amount: null, status: "negotiable" }
  if (/(^|\s)-\s*\d/.test(text)) return { amount: null, status: "invalid" }

  // Grouped thousands ("1,800,000", "1 800 000", "1.800.000") first, then decimals ("1.5", "1,5").
  const match = text.match(/(\d{1,3}(?:[\s,.]\d{3})+|\d+(?:[.,]\d+)?)\s*(сая|мянга|мян|к|k|тэрбум)?/)
  if (!match) return { amount: null, status: "invalid" }

  const [, numberText, unit] = match
  const isGrouped = /^\d{1,3}(?:[\s,.]\d{3})+$/.test(numberText)
  const value = isGrouped ? Number(numberText.replace(/[\s,.]/g, "")) : Number(numberText.replace(",", "."))
  if (!Number.isFinite(value) || value <= 0) return { amount: null, status: "invalid" }

  if (unit === "сая") return classify(value * 1_000_000)
  if (unit === "тэрбум") return classify(value * 1_000_000_000)
  if (unit && /^(мянга|мян|к|k)$/.test(unit)) return classify(value * 1_000)
  // A bare small number ("1.6") is how people write millions.
  return classify(value < 100 ? value * 1_000_000 : value)
}

/** Monthly rent (FR-3: rent is per month). */
export function parseRentPrice(raw: string | number | null | undefined): RentPriceResult {
  return parsePrice(raw, "rent")
}

function classifyAmount(amount: number, priceType: PriceType): RentPriceResult {
  const rounded = Math.round(amount)
  if (!Number.isFinite(rounded) || rounded <= 0) return { amount: null, status: "invalid" }
  const outOfRange = priceType === "rent"
    ? rounded < MIN_MONTHLY_RENT || rounded > MAX_MONTHLY_RENT
    : rounded < MIN_SALE_PRICE
  return { amount: rounded, status: outOfRange ? "needs_review" : "valid" }
}

/** "1,500,000₮" */
export function formatMnt(amount: number): string {
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}₮`
}

/** "1.5 сая ₮" — compact form for chips. */
export function formatMillions(amount: number): string {
  return `${Number((amount / 1_000_000).toFixed(2))} сая ₮`
}

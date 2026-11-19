export type PriceStatus = "valid" | "invalid" | "missing"

export interface CleanedPriceResult {
  /** Price expressed in millions of MNT. */
  priceMillion: number | null
  /** Price per square metre, also expressed in millions of MNT. */
  pricePerM2Million: number | null
  status: PriceStatus
}

const PLACEHOLDER_TEXT = /тохиролц|хувь\s*лизинг|лизинг|үнэ\s*асуу|үнийн\s*санал|байхгүй|тодорхойгүй/i

function invalid(): CleanedPriceResult {
  return {
    priceMillion: null,
    pricePerM2Million: null,
    status: "invalid",
  }
}

function parseNumber(value: string): number | null {
  // Commas between three digit groups are thousands separators; a remaining
  // comma is treated as a decimal separator (common in local listings).
  const normalized = value
    .replace(/,(?=\d{3}(?:\D|$))/g, "")
    .replace(/,/g, ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/** Normalize common Ulaanbaatar listing prices to million MNT. */
export function cleanPrice(
  rawPrice: string | number | null | undefined,
  areaM2?: number | null,
): CleanedPriceResult {
  const emptyResult: CleanedPriceResult = {
    priceMillion: null,
    pricePerM2Million: null,
    status: "missing",
  }

  if (rawPrice === null || rawPrice === undefined || (typeof rawPrice === "string" && rawPrice.trim() === "")) {
    return emptyResult
  }

  const raw = String(rawPrice).trim().toLowerCase()
  if (PLACEHOLDER_TEXT.test(raw)) return invalid()

  // Reject explicitly negative prices instead of silently parsing their digits.
  if (/(^|\s)-\s*\d/.test(raw)) return invalid()

  // Collapse comma separated full MNT amounts (250,000,000) while preserving
  // decimal commas (120,5). Whitespace between digit groups is also supported.
  const compact = raw
    .replace(/,(?=\d{3}(?:\D|$))/g, "")
    .replace(/(?<=\d)\s+(?=\d{3}(?:\D|$))/g, "")

  const numberPattern = /\d+(?:[.,]\d+)?/g
  const matches = [...compact.matchAll(numberPattern)]
  if (matches.length === 0) return invalid()

  let priceMillion = 0
  let recognizedAmount = false

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const value = parseNumber(match[0])
    if (value === null || value < 0) return invalid()

    const nextStart = match.index! + match[0].length
    const nextEnd = matches[index + 1]?.index ?? compact.length
    const suffix = compact.slice(nextStart, nextEnd)

    if (/тэрбум/.test(suffix)) {
      priceMillion += value * 1_000
      recognizedAmount = true
    } else if (/сая/.test(suffix)) {
      priceMillion += value
      recognizedAmount = true
    } else if (/[₮]|төгрөг/.test(suffix)) {
      // A bare currency value is interpreted as MNT and converted below.
      priceMillion += value >= 10_000_000 ? value / 1_000_000 : value / 1_000_000
      recognizedAmount = true
    } else if (matches.length === 1 && !/\d/.test(suffix)) {
      // Numeric input and an unlabelled full amount use the same threshold.
      priceMillion += value >= 10_000_000 ? value / 1_000_000 : value
      recognizedAmount = true
    }
  }

  if (!recognizedAmount || !Number.isFinite(priceMillion) || priceMillion <= 0) return invalid()

  // Bare amounts below the full MNT threshold are not reliable prices. A
  // suffix such as “сая” or “тэрбум” is required to disambiguate them.
  const hasMagnitudeUnit = /сая|тэрбум/.test(compact)
  const hasCurrency = /[₮]|төгрөг/.test(compact)
  const isSingleBareAmount = matches.length === 1 && !hasMagnitudeUnit && !hasCurrency
  const originalNumericValue = matches.length === 1 ? parseNumber(matches[0][0]) : null
  if (isSingleBareAmount && originalNumericValue !== null && originalNumericValue < 10_000_000) {
    return invalid()
  }
  if (!hasMagnitudeUnit && priceMillion < 10 && (hasCurrency || typeof rawPrice === "number")) {
    return invalid()
  }

  const validArea = typeof areaM2 === "number" && Number.isFinite(areaM2) && areaM2 > 0
    ? areaM2
    : null

  return {
    priceMillion,
    pricePerM2Million: validArea === null ? null : priceMillion / validArea,
    status: "valid",
  }
}

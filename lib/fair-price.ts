/**
 * Fair Price Badge (spec G3, FR-10, FR-11, §14).
 *
 * Every priced listing with an area gets a price per m² and a badge, compared with the
 * median of SIMILAR listings: same district, same rooms, same price_type, last 60 days.
 *   - fewer than 5 similar listings     → "not_enough_data" (never guess)
 *   - price per m² below 30% of the
 *     district median                   → "outlier": skipped from every median, logged for the admin
 *   - otherwise                         → cheap (< −10%) / fair / expensive (> +12%)
 * The badge is a hint, not advice (N5).
 */
export type FairPriceBadge = "cheap" | "fair" | "expensive" | "not_enough_data" | "outlier" | "missing"

export interface PricedListing {
  id: number
  district: string | null
  rooms: number | null
  priceType: "rent" | "sale"
  /** Valid (reviewed) price in MNT; needs_review / negotiable listings must pass null. */
  price: number | null
  area: number | null
  createdAt: Date
}

export interface FairPriceResult {
  badge: FairPriceBadge
  pricePerM2: number | null
  /** Median price per m² of the similar-listings group (after removing outliers). */
  benchmarkPerM2: number | null
  /** pricePerM2 / benchmarkPerM2 − 1. */
  deviation: number | null
  /** Similar listings the median was computed from. */
  sampleSize: number
}

export const WINDOW_DAYS = 60
export const MIN_GROUP_SIZE = 5
export const OUTLIER_BELOW_MEDIAN_RATIO = 0.3
const CHEAP_BELOW = -0.1
const EXPENSIVE_ABOVE = 0.12

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function perM2(item: PricedListing): number | null {
  return item.price && item.area && item.area > 0 ? item.price / item.area : null
}

export interface FairPriceComputation {
  byListing: Map<number, FairPriceResult>
  /** Listings skipped as outliers (spec §14: log them so the admin can look). */
  skipped: Array<{ id: number; pricePerM2: number; districtMedian: number }>
}

export function computeFairPrices(items: PricedListing[], now: Date = new Date()): FairPriceComputation {
  const since = now.getTime() - WINDOW_DAYS * 86_400_000
  const recent = items.filter((item) => item.createdAt.getTime() >= since && perM2(item) !== null && item.district)

  // 1. District median (district + price_type, last 60 days) → outlier cutoff.
  const districtKey = (item: PricedListing) => `${item.priceType}|${item.district}`
  const districtValues = new Map<string, number[]>()
  for (const item of recent) districtValues.set(districtKey(item), [...(districtValues.get(districtKey(item)) ?? []), perM2(item)!])
  const cutoff = new Map([...districtValues].map(([key, values]) => [key, median(values)! * OUTLIER_BELOW_MEDIAN_RATIO]))
  const districtMedian = new Map([...districtValues].map(([key, values]) => [key, median(values)!]))
  const isOutlier = (item: PricedListing) => {
    const value = perM2(item)
    const limit = item.district ? cutoff.get(districtKey(item)) : undefined
    return value !== null && limit !== undefined && value < limit
  }

  // 2. Similar-listings groups (district + rooms + price_type, last 60 days), outliers removed.
  const groupKey = (item: PricedListing) => `${item.priceType}|${item.district}|${item.rooms}`
  const groups = new Map<string, number[]>()
  for (const item of recent) {
    if (item.rooms === null || isOutlier(item)) continue
    groups.set(groupKey(item), [...(groups.get(groupKey(item)) ?? []), perM2(item)!])
  }

  const byListing = new Map<number, FairPriceResult>()
  const skipped: FairPriceComputation["skipped"] = []
  for (const item of items) {
    const value = perM2(item)
    if (value === null || !item.district) {
      byListing.set(item.id, { badge: "missing", pricePerM2: value, benchmarkPerM2: null, deviation: null, sampleSize: 0 })
      continue
    }
    const group = item.rooms === null ? [] : groups.get(groupKey(item)) ?? []
    const benchmark = group.length >= MIN_GROUP_SIZE ? median(group) : null
    const base = { pricePerM2: value, benchmarkPerM2: benchmark, deviation: null, sampleSize: group.length }
    if (isOutlier(item)) {
      byListing.set(item.id, { ...base, badge: "outlier" })
      skipped.push({ id: item.id, pricePerM2: value, districtMedian: districtMedian.get(districtKey(item))! })
    } else if (benchmark === null) {
      byListing.set(item.id, { ...base, badge: "not_enough_data" })
    } else {
      const deviation = value / benchmark - 1
      byListing.set(item.id, { ...base, deviation, badge: deviation < CHEAP_BELOW ? "cheap" : deviation > EXPENSIVE_ABOVE ? "expensive" : "fair" })
    }
  }
  return { byListing, skipped }
}

export const BADGE_LABELS: Record<FairPriceBadge, string> = {
  cheap: "Хямд үнэ",
  fair: "Бодит үнэ",
  expensive: "Өндөр үнэ",
  not_enough_data: "Мэдээлэл хангалтгүй",
  outlier: "Хэт доогуур үнэ",
  missing: "Үнэ тохиролцоно",
}

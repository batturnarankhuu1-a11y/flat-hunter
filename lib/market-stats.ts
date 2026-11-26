/**
 * Market numbers from the listings in our own database (no external data):
 *   - median monthly rent and rent per m² by district × rooms (comparison table)
 *   - weekly median trend for a district / district + rooms
 *   - owner price check: a fair rent range for a district, room count and area
 * Input is active listings with a valid price and area, outliers already removed (spec §14).
 */
export interface MarketListing {
  id: number
  flatId: number | null
  district: string
  rooms: number | null
  area: number
  price: number
  perM2: number
  createdAt: Date
}

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const low = Math.floor(position)
  const high = Math.ceil(position)
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}
export const median = (values: number[]) => quantile(values, 0.5)

export interface GroupStats {
  district: string
  rooms: number | null
  count: number
  medianRent: number | null
  medianPerM2: number | null
}

/** District × rooms medians, plus a district total row (rooms = null). */
export function groupStats(listings: MarketListing[]): GroupStats[] {
  const groups = new Map<string, MarketListing[]>()
  for (const listing of listings) {
    for (const key of [`${listing.district}|${listing.rooms ?? "?"}`, `${listing.district}|*`]) groups.set(key, [...(groups.get(key) ?? []), listing])
  }
  return [...groups].map(([key, items]) => {
    const [district, rooms] = key.split("|")
    return {
      district,
      rooms: rooms === "*" || rooms === "?" ? null : Number(rooms),
      count: items.length,
      medianRent: median(items.map((item) => item.price)),
      medianPerM2: median(items.map((item) => item.perM2)),
    }
  }).filter((group) => !(group.rooms === null && group.count === 0))
}

export interface TrendPoint {
  /** First day of the bucket (ISO date). */
  start: string
  count: number
  medianRent: number | null
  medianPerM2: number | null
}

export type TrendUnit = "day" | "week"
const DAY = 86_400_000
const startOfDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
const mondayOf = (date: Date) => startOfDay(date) - ((new Date(startOfDay(date)).getUTCDay() + 6) % 7) * DAY

/** Days while the data covers less than 3 weeks, weeks after that. */
export function trendUnit(listings: MarketListing[], now = new Date()): TrendUnit {
  if (listings.length === 0) return "week"
  const earliest = Math.min(...listings.map((listing) => listing.createdAt.getTime()))
  return now.getTime() - earliest < 21 * DAY ? "day" : "week"
}

/** Median rent and ₮/m² per day (last 14 days) or per week (last 8 weeks); empty buckets have count 0. */
export function priceTrend(listings: MarketListing[], filter: { district?: string; rooms?: number | null }, unit: TrendUnit, now = new Date()): TrendPoint[] {
  const bucketOf = unit === "day" ? startOfDay : mondayOf
  const step = unit === "day" ? DAY : 7 * DAY
  const size = unit === "day" ? 14 : 8
  const last = bucketOf(now)
  const starts = Array.from({ length: size }, (_, index) => last - (size - 1 - index) * step)
  const selected = listings.filter((listing) =>
    (!filter.district || listing.district === filter.district) && (filter.rooms === undefined || filter.rooms === null || listing.rooms === filter.rooms))
  return starts.map((start) => {
    const items = selected.filter((listing) => bucketOf(listing.createdAt) === start)
    return {
      start: new Date(start).toISOString().slice(0, 10),
      count: items.length,
      medianRent: median(items.map((item) => item.price)),
      medianPerM2: median(items.map((item) => item.perM2)),
    }
  })
}

export const PRICE_CHECK_MIN_SAMPLE = 5

export interface PriceCheckResult {
  /** Which comparison group was used (the narrowest one with enough listings). */
  level: "district_rooms" | "district" | "city_rooms" | "city"
  label: string
  sampleSize: number
  perM2: { low: number; median: number; high: number }
  /** Monthly rent for the given area: 25th percentile – median – 75th percentile of ₮/m². */
  rent: { low: number; median: number; high: number }
  /** Listings in the group closest in size, for comparison. */
  comparables: Array<{ id: number; flatId: number | null; rooms: number | null; area: number; price: number; perM2: number }>
}

const round10k = (value: number) => Math.round(value / 10_000) * 10_000

/** Fair rent range for an owner's flat, from the narrowest group with ≥ 5 listings. */
export function priceCheck(listings: MarketListing[], input: { district: string; rooms: number; area: number }): PriceCheckResult | null {
  const levels: Array<{ level: PriceCheckResult["level"]; label: string; items: MarketListing[] }> = [
    { level: "district_rooms", label: `${input.district}, ${input.rooms} өрөө`, items: listings.filter((item) => item.district === input.district && item.rooms === input.rooms) },
    { level: "district", label: `${input.district}, бүх өрөө`, items: listings.filter((item) => item.district === input.district) },
    { level: "city_rooms", label: `Улаанбаатар, ${input.rooms} өрөө`, items: listings.filter((item) => item.rooms === input.rooms) },
    { level: "city", label: "Улаанбаатар, бүх байр", items: listings },
  ]
  const chosen = levels.find((level) => level.items.length >= PRICE_CHECK_MIN_SAMPLE)
  if (!chosen) return null
  const perM2 = chosen.items.map((item) => item.perM2)
  const low = quantile(perM2, 0.25)!, mid = median(perM2)!, high = quantile(perM2, 0.75)!
  return {
    level: chosen.level,
    label: chosen.label,
    sampleSize: chosen.items.length,
    perM2: { low: Math.round(low), median: Math.round(mid), high: Math.round(high) },
    rent: { low: round10k(low * input.area), median: round10k(mid * input.area), high: round10k(high * input.area) },
    comparables: [...chosen.items]
      .sort((a, b) => Math.abs(a.area - input.area) - Math.abs(b.area - input.area))
      .slice(0, 5)
      .map(({ id, flatId, rooms, area, price, perM2: value }) => ({ id, flatId, rooms, area, price, perM2: Math.round(value) })),
  }
}

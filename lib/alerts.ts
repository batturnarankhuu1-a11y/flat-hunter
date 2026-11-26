import type { Flat } from "@/components/types"

/**
 * Saved-search alerts, computed from the current catalogue:
 *   - "new"        a matching flat got a listing after the search was last checked
 *   - "price_drop" a matching flat's cheapest listing is cheaper than before (last 30 days)
 * Delivery: 'daily' = one digest at 09:00 Ulaanbaatar time (free), 'instant' = as soon as the
 * listing arrives (Pro), 'off' = nothing.
 */
export type AlertMode = "daily" | "instant" | "off"
export const ALERT_MODES: AlertMode[] = ["daily", "instant", "off"]

export interface SavedSearch {
  id: number
  district: string | null
  rooms: number | null
  maxPrice: number | null
  alertMode: string
  lastCheckedAt: Date | string | null
  createdAt: Date | string | null
}

export interface AlertItem {
  kind: "new" | "price_drop"
  searchId: number
  flat: Flat
  /** When it happened (ISO). */
  at: string
}

const PRICE_DROP_WINDOW_DAYS = 30

export function matchesSearch(flat: Flat, search: SavedSearch): boolean {
  if (search.district && flat.district !== search.district) return false
  if (search.rooms !== null && flat.rooms !== search.rooms) return false
  if (search.maxPrice !== null && (flat.price === null || flat.price > search.maxPrice)) return false
  return true
}

export function alertsFor(search: SavedSearch, flats: Flat[], now = new Date()): { matches: Flat[]; items: AlertItem[] } {
  const matches = flats.filter((flat) => matchesSearch(flat, search)).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
  const checked = search.lastCheckedAt ? new Date(search.lastCheckedAt).getTime() : 0
  const dropSince = now.getTime() - PRICE_DROP_WINDOW_DAYS * 86_400_000
  const items: AlertItem[] = []
  for (const flat of matches) {
    if (flat.latestAt && new Date(flat.latestAt).getTime() > checked) items.push({ kind: "new", searchId: search.id, flat, at: flat.latestAt })
    if (flat.previousPrice !== null && flat.priceChangedAt && new Date(flat.priceChangedAt).getTime() >= dropSince) {
      items.push({ kind: "price_drop", searchId: search.id, flat, at: flat.priceChangedAt })
    }
  }
  items.sort((a, b) => b.at.localeCompare(a.at))
  return { matches, items }
}

/** Next 09:00 in Ulaanbaatar (UTC+8, no daylight saving). */
export function nextDailyDigest(now = new Date()): Date {
  const UB_OFFSET = 8 * 3_600_000
  const local = new Date(now.getTime() + UB_OFFSET)
  const nine = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 9) - UB_OFFSET
  return new Date(nine > now.getTime() ? nine : nine + 86_400_000)
}

export function describeSearch(search: Pick<SavedSearch, "district" | "rooms" | "maxPrice">): string {
  const parts = [search.district ?? "Бүх дүүрэг", search.rooms !== null ? `${search.rooms} өрөө` : "бүх өрөө"]
  if (search.maxPrice !== null) parts.push(`${Number((search.maxPrice / 1_000_000).toFixed(2))} сая ₮ хүртэл`)
  return parts.join(", ")
}

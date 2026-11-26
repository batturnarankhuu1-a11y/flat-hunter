import "server-only"
import type { Flat } from "@/components/types"
import { getPricedRentListings, getRentalFlatRows } from "@/lib/db"
import { computeFairPrices, type FairPriceResult } from "@/lib/fair-price"

export const PLACEHOLDER_IMAGE = "/apartment-placeholder.svg"

function positiveNumber(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** Route param → positive integer id, or null for anything else ("abc", "-1", "1.5"). */
export function parseId(value: string): number | null {
  if (!/^\d{1,9}$/.test(value)) return null
  const id = Number(value)
  return id > 0 ? id : null
}

/** Accepts Date or the ISO string Postgres returns for raw `max(created_at)` aggregates. */
export function formatPostedAt(value: Date | string | null): string {
  const date = value === null ? null : new Date(value)
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("mn-MN", { dateStyle: "medium" }).format(date)
    : "Огноо тодорхойгүй"
}

const NO_PRICE: FairPriceResult = { badge: "missing", pricePerM2: null, benchmarkPerM2: null, deviation: null, sampleSize: 0 }
const loggedOutliers = new Set<number>()

export interface RentalCatalogue {
  flats: Flat[]
  /** Badge and price per m² for every priced listing (spec G3). */
  listingFairPrices: Map<number, FairPriceResult>
  /** Outlier listings (bait prices, spec §14) — kept for the admin, hidden from public pages. */
  hiddenListingIds: Set<number>
}

/**
 * Every rent flat plus per-listing Fair Price results. A flat shows the badge of its
 * cheapest valid listing — the listing AI answers cite as [id].
 */
export async function loadRentalCatalogue(): Promise<RentalCatalogue> {
  const [rows, priced] = await Promise.all([getRentalFlatRows(), getPricedRentListings()])
  const { byListing, skipped } = computeFairPrices(priced.map((listing) => ({
    id: listing.id,
    district: listing.district,
    rooms: listing.rooms,
    priceType: "rent" as const,
    price: listing.cleanPrice,
    area: positiveNumber(listing.area),
    createdAt: listing.createdAt ? new Date(listing.createdAt) : new Date(0),
  })))

  // Spec §14: log skipped (outlier) listings so the admin can look — once per server process.
  const fresh = skipped.filter((item) => !loggedOutliers.has(item.id))
  if (fresh.length) {
    fresh.forEach((item) => loggedOutliers.add(item.id))
    const details = fresh.map((item) => `#${item.id} (${Math.round(item.pricePerM2)}₮/м² vs median ${Math.round(item.districtMedian)}₮/м²)`).join(", ")
    console.info(`[flat-hunter] fair price: skipped ${fresh.length} outlier listing(s) below 30% of the district median: ${details}`)
  }

  // Outliers are hidden from the public: a flat's price comes from its other listings,
  // and a flat whose every public listing is an outlier is not shown at all.
  const hiddenListingIds = new Set(skipped.map((item) => item.id))
  const outliersByFlat = new Map<number, number>()
  const cheapestVisible = new Map<number, { id: number; price: number }>()
  for (const listing of priced) {
    if (listing.flatId === null || listing.cleanPrice === null) continue
    if (hiddenListingIds.has(listing.id)) {
      outliersByFlat.set(listing.flatId, (outliersByFlat.get(listing.flatId) ?? 0) + 1)
      continue
    }
    const best = cheapestVisible.get(listing.flatId)
    if (!best || listing.cleanPrice < best.price || (listing.cleanPrice === best.price && listing.id < best.id)) cheapestVisible.set(listing.flatId, { id: listing.id, price: listing.cleanPrice })
  }

  const visibleRows = rows.filter((row) => (outliersByFlat.get(row.id) ?? 0) < row.sourcesCount)
  const flats = visibleRows.map((row): Flat => {
    const district = row.district?.trim() || "Улаанбаатар"
    const cheapest = cheapestVisible.get(row.id) ?? null
    const listingId = cheapest?.id ?? null
    const fair = (listingId !== null ? byListing.get(listingId) : undefined) ?? NO_PRICE
    return {
      id: String(row.id),
      listingId,
      title: row.title ?? `${district}-д түрээсийн байр`,
      district,
      complex: row.complex,
      rooms: row.rooms,
      area: positiveNumber(row.area),
      price: cheapest?.price ?? null,
      pricePerM2: fair.pricePerM2,
      badge: fair.badge,
      priceDeviation: fair.deviation,
      benchmarkPerM2: fair.benchmarkPerM2,
      sampleSize: fair.sampleSize,
      image: row.imageUrl?.trim() || PLACEHOLDER_IMAGE,
      address: row.address ? `${district}, ${row.address}` : district,
      postedAt: formatPostedAt(row.latestListingAt ?? row.createdAt),
      sourcesCount: row.sourcesCount - (outliersByFlat.get(row.id) ?? 0),
    }
  })
  return { flats, listingFairPrices: byListing, hiddenListingIds }
}

export async function loadRentalFlats(): Promise<Flat[]> {
  return (await loadRentalCatalogue()).flats
}

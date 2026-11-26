import type { FairPriceBadge } from "@/lib/fair-price"

export type Flat = {
  id: string
  /** Cheapest listing with a valid (reviewed) price — the id cited by AI answers as [id]. */
  listingId: number | null
  title: string
  district: string
  complex: string | null
  rooms: number | null
  area: number | null
  /** Lowest valid monthly rent across listings, in MNT (₮). needs_review prices are excluded. */
  price: number | null
  /** Rent per m² in MNT. */
  pricePerM2: number | null
  badge: FairPriceBadge
  /** −0.12 = 12% cheaper than the district median per m². */
  priceDeviation: number | null
  /** District median rent per m² the badge was compared against. */
  benchmarkPerM2: number | null
  /** Usable flats in the district median. */
  sampleSize: number
  image: string
  address: string
  postedAt: string
  /** ISO date of the newest public listing (for "new since" alerts). */
  latestAt: string | null
  /** Price of the cheapest listing before its last change, when it was higher → "Үнэ буурсан". */
  previousPrice: number | null
  priceChangedAt: string | null
  sourcesCount: number
}

export type FlatFilters = {
  district: string
  rooms: string
  /** Max monthly rent in millions of MNT, as typed by the user (e.g. "1.5"). */
  maxPrice: string
}

import "server-only"
import { getPricedRentListings } from "@/lib/db"
import { computeFairPrices } from "@/lib/fair-price"
import type { MarketListing } from "@/lib/market-stats"

/** Active, priced rent listings with an area — outliers (spec §14) left out, like the Fair Price median. */
export async function loadMarketListings(): Promise<MarketListing[]> {
  const priced = await getPricedRentListings()
  const rows = priced.flatMap((row) => {
    const area = Number(row.area)
    if (row.cleanPrice === null || !row.district || !Number.isFinite(area) || area <= 0) return []
    return [{
      id: row.id,
      flatId: row.flatId,
      district: row.district,
      rooms: row.rooms,
      area,
      price: row.cleanPrice,
      perM2: row.cleanPrice / area,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(0),
    }]
  })
  const { skipped } = computeFairPrices(rows.map((row) => ({ id: row.id, district: row.district, rooms: row.rooms, priceType: "rent" as const, price: row.price, area: row.area, createdAt: row.createdAt })))
  const outliers = new Set(skipped.map((item) => item.id))
  return rows.filter((row) => !outliers.has(row.id))
}

export type Flat = {
  id: string
  title: string
  district: string
  rooms: number | null
  area: number | null
  price: number | null
  pricePerM2?: number | null
  image: string
  address: string
  postedAt: string
  sourcesCount?: number
  url: string
}

export type FlatFilters = {
  district: string
  rooms: string
  maxPrice: string
}

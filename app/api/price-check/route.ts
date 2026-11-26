import { normalizeDistrict } from "@/lib/districts"
import { loadMarketListings } from "@/lib/market"
import { priceCheck } from "@/lib/market-stats"

/**
 * GET /api/price-check?district=Хан-Уул&rooms=2&area=52
 * → fair monthly rent range (25th–75th percentile of ₮/m² × area) from our own listings.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const district = normalizeDistrict(params.get("district"))
  const rooms = Number(params.get("rooms"))
  const area = Number(params.get("area"))
  if (!district) return Response.json({ error: "Дүүргээ сонгоно уу" }, { status: 400 })
  if (!Number.isInteger(rooms) || rooms < 1 || rooms > 8) return Response.json({ error: "Өрөөний тоо 1–8" }, { status: 400 })
  if (!Number.isFinite(area) || area < 10 || area > 600) return Response.json({ error: "Талбай 10–600 м²" }, { status: 400 })
  try {
    const result = priceCheck(await loadMarketListings(), { district, rooms, area })
    if (!result) return Response.json({ error: "Харьцуулах хангалттай зар алга" }, { status: 404 })
    return Response.json({ input: { district, rooms, area }, ...result })
  } catch {
    return Response.json({ error: "Өгөгдөл ачаалж чадсангүй. Дахин оролдоно уу." }, { status: 503 })
  }
}

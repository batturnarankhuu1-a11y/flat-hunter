import { normalizeDistrict } from "@/lib/districts"
import { loadMarketListings } from "@/lib/market"
import { priceCheck } from "@/lib/market-stats"
import { requestLocale, tr } from "@/lib/i18n"

/**
 * GET /api/price-check?district=Хан-Уул&rooms=2&area=52
 * → fair monthly rent range (25th–75th percentile of ₮/m² × area) from our own listings.
 */
export async function GET(request: Request): Promise<Response> {
  const locale = requestLocale(request)
  const t = (mn: string, en: string) => tr(locale, mn, en)
  const params = new URL(request.url).searchParams
  const district = normalizeDistrict(params.get("district"))
  const rooms = Number(params.get("rooms"))
  const area = Number(params.get("area"))
  if (!district) return Response.json({ error: t("Дүүргээ сонгоно уу", "Choose a district") }, { status: 400 })
  if (!Number.isInteger(rooms) || rooms < 1 || rooms > 8) return Response.json({ error: t("Өрөөний тоо 1–8", "Rooms must be 1–8") }, { status: 400 })
  if (!Number.isFinite(area) || area < 10 || area > 600) return Response.json({ error: t("Талбай 10–600 м²", "Area must be 10–600 m²") }, { status: 400 })
  try {
    const result = priceCheck(await loadMarketListings(), { district, rooms, area })
    if (!result) return Response.json({ error: t("Харьцуулах хангалттай зар алга", "Not enough listings to compare") }, { status: 404 })
    return Response.json({ input: { district, rooms, area }, ...result })
  } catch {
    return Response.json({ error: t("Өгөгдөл ачаалж чадсангүй. Дахин оролдоно уу.", "Could not load the data. Please try again.") }, { status: 503 })
  }
}

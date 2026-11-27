import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import TrendChart from "@/components/TrendChart"
import { DISTRICTS } from "@/lib/districts"
import { loadMarketListings } from "@/lib/market"
import { groupStats, median, priceTrend, trendUnit, type GroupStats } from "@/lib/market-stats"
import PriceSpread from "@/components/PriceSpread"
import { formatMnt } from "@/lib/rent-price"
import T, { DistrictName } from "@/components/T"
import { districtName, formatMillionsIn, roomsLabel } from "@/lib/i18n"

export const metadata: Metadata = { title: "Зах зээлийн тойм — Flat Hunter" }

const ROOMS = [1, 2, 3, 4, 5]

export default function MarketPage({ searchParams }: PageProps<"/market">) {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"><T mn="Түрээсийн зах зээл" en="Rental market" /></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"><T mn="Дүүрэг, өрөөгөөр медиан үнэ ба тренд" en="Median rent and trends by district and rooms" /></h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600"><T mn="Манай баазын идэвхтэй түрээсийн заруудаас тооцсон. Хэт доогуур (хуурамч байж болзошгүй) үнийг хассан." en="Calculated from the active rental listings in our database. Suspiciously low (possibly fake) prices are excluded." /></p>
        <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-slate-200" />}>
          {searchParams.then((params) => <Market district={typeof params.district === "string" ? params.district : undefined} rooms={typeof params.rooms === "string" ? params.rooms : undefined} />)}
        </Suspense>
      </div>
    </main>
  )
}

async function Market({ district: districtParam, rooms: roomsParam }: { district?: string; rooms?: string }) {
  await connection()
  const listings = await loadMarketListings()
  const district = DISTRICTS.find((item) => item === districtParam) ?? "Хан-Уул"
  const rooms = roomsParam && /^[1-5]$/.test(roomsParam) ? Number(roomsParam) : null
  const stats = groupStats(listings)
  const cell = (d: string, r: number | null) => stats.find((group) => group.district === d && group.rooms === r)

  const unit = trendUnit(listings)
  const selection = priceTrend(listings, { district, rooms }, unit)
  const selected = listings.filter((item) => item.district === district && (rooms === null || item.rooms === rooms))
  const label = rooms ? `${district}, ${rooms} өрөө` : `${district}, бүх өрөө`
  const labelEn = `${districtName(district, "en")}, ${rooms ? roomsLabel(rooms, "en") : "all rooms"}`
  const series = [
    { label, labelEn, color: "#059669", points: selection },
    ...(rooms ? [{ label: `${district}, бүх өрөө`, labelEn: `${districtName(district, "en")}, all rooms`, color: "#64748b", points: priceTrend(listings, { district }, unit) }] : []),
    { label: "Улаанбаатар", labelEn: "Ulaanbaatar", color: "#94a3b8", points: priceTrend(listings, {}, unit) },
  ]
  const href = (d: string, r: number | null) => `/market?district=${encodeURIComponent(d)}${r ? `&rooms=${r}` : ""}`

  return (
    <>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {DISTRICTS.map((item) => (
            <Link key={item} href={href(item, rooms)} aria-current={item === district ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${item === district ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}><DistrictName name={item} /></Link>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[null, ...ROOMS].map((item) => (
            <Link key={item ?? "all"} href={href(district, item)} aria-current={item === rooms ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${item === rooms ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{item ? <T mn={`${item} өрөө`} en={roomsLabel(item, "en")} /> : <T mn="Бүх өрөө" en="All rooms" />}</Link>
          ))}
        </div>
        <h2 className="mt-5 text-lg font-bold text-slate-900"><T mn={`₮/м² тархалт: ${label}`} en={`₮/m² spread: ${labelEn}`} /></h2>
        <div className="mt-2"><PriceSpread title={`${label} заруудын ₮/м²`} values={selected.map((item) => ({ id: item.id, perM2: item.perM2 }))} median={median(selected.map((item) => item.perM2))} /></div>
        <h2 className="mt-6 text-lg font-bold text-slate-900"><T mn={`Медиан ₮/м² — ${unit === "day" ? "өдөр" : "7 хоног"} бүрээр`} en={`Median ₮/m² per ${unit === "day" ? "day" : "week"}`} /></h2>
        <p className="text-xs text-slate-500"><T mn={`${unit === "day" ? "Сүүлийн 14 хоног" : "Сүүлийн 8 долоо хоног"}; цэг бүр тухайн хугацаанд нийтлэгдсэн заруудын медиан.`} en={`${unit === "day" ? "Last 14 days" : "Last 8 weeks"}; each point is the median of listings posted in that period.`} /></p>
        <div className="mt-3"><TrendChart unit={unit} series={series} metric="medianPerM2" title={`${label}: медиан ₮/м²`} /></div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5 font-medium"><T mn={unit === "day" ? "Өдөр" : "7 хоног"} en={unit === "day" ? "Day" : "Week"} /></th><th className="font-medium"><T mn="Зар" en="Listings" /></th><th className="font-medium"><T mn="Медиан түрээс" en="Median rent" /></th><th className="font-medium"><T mn="Медиан ₮/м²" en="Median ₮/m²" /></th></tr></thead>
            <tbody>
              {selection.filter((point) => point.count > 0).map((point) => (
                <tr key={point.start} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-600">{point.start}</td>
                  <td className="text-slate-600">{point.count}</td>
                  <td className="font-semibold text-slate-900">{point.medianRent !== null ? formatMnt(point.medianRent) : "—"}</td>
                  <td className="text-slate-700">{point.medianPerM2 !== null ? formatMnt(point.medianPerM2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900"><T mn="Харьцуулалт: медиан сарын түрээс" en="Comparison: median monthly rent" /></h2>
        <p className="text-xs text-slate-500"><T mn="Нүд бүрт: медиан түрээс, ₮/м², зарын тоо. 5-аас цөөн зартай нүд бүдэг — чиглэл төдий." en="Each cell: median rent, ₮/m², number of listings. Cells with fewer than 5 listings are faded — a rough guide only." /></p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 font-medium"><T mn="Дүүрэг" en="District" /></th>
                {ROOMS.map((r) => <th key={r} className="font-medium"><T mn={`${r} өрөө`} en={roomsLabel(r, "en")} /></th>)}
                <th className="font-medium"><T mn="Бүгд" en="All" /></th>
              </tr>
            </thead>
            <tbody>
              {DISTRICTS.map((d) => (
                <tr key={d} className="border-t border-slate-100 align-top">
                  <td className="py-2 font-semibold text-slate-800"><Link href={href(d, rooms)} className="hover:text-emerald-800"><DistrictName name={d} /></Link></td>
                  {ROOMS.map((r) => <td key={r} className="py-2"><Cell stats={cell(d, r)} href={href(d, r)} /></td>)}
                  <td className="py-2"><Cell stats={cell(d, null)} href={href(d, null)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function Cell({ stats, href }: { stats?: GroupStats; href: string }) {
  if (!stats || stats.count === 0 || stats.medianRent === null) return <span className="text-slate-300">—</span>
  return (
    <Link href={href} className={`block rounded-lg px-1.5 py-1 hover:bg-emerald-50 ${stats.count < 5 ? "opacity-50" : ""}`}>
      <span className="block font-semibold text-slate-900"><T mn={formatMillionsIn(stats.medianRent, "mn")} en={formatMillionsIn(stats.medianRent, "en")} /></span>
      <span className="block text-[11px] text-slate-500">{formatMnt(stats.medianPerM2!)}/м² · <T mn={`${stats.count} зар`} en={`${stats.count} listing${stats.count === 1 ? "" : "s"}`} /></span>
    </Link>
  )
}

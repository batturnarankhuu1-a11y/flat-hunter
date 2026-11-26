import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import TrendChart from "@/components/TrendChart"
import { DISTRICTS } from "@/lib/districts"
import { loadMarketListings } from "@/lib/market"
import { groupStats, median, priceTrend, trendUnit, type GroupStats } from "@/lib/market-stats"
import PriceSpread from "@/components/PriceSpread"
import { formatMillions, formatMnt } from "@/lib/rent-price"

export const metadata: Metadata = { title: "Зах зээлийн тойм — Flat Hunter" }

const ROOMS = [1, 2, 3, 4, 5]

export default function MarketPage({ searchParams }: PageProps<"/market">) {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Түрээсийн зах зээл</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Дүүрэг, өрөөгөөр медиан үнэ ба тренд</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Манай баазын идэвхтэй түрээсийн заруудаас тооцсон. Хэт доогуур (хуурамч байж болзошгүй) үнийг хассан.</p>
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
  const series = [
    { label, color: "#059669", points: selection },
    ...(rooms ? [{ label: `${district}, бүх өрөө`, color: "#64748b", points: priceTrend(listings, { district }, unit) }] : []),
    { label: "Улаанбаатар", color: "#cbd5e1", points: priceTrend(listings, {}, unit) },
  ]
  const href = (d: string, r: number | null) => `/market?district=${encodeURIComponent(d)}${r ? `&rooms=${r}` : ""}`

  return (
    <>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {DISTRICTS.map((item) => (
            <Link key={item} href={href(item, rooms)} aria-current={item === district ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${item === district ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{item}</Link>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[null, ...ROOMS].map((item) => (
            <Link key={item ?? "all"} href={href(district, item)} aria-current={item === rooms ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${item === rooms ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{item ? `${item} өрөө` : "Бүх өрөө"}</Link>
          ))}
        </div>
        <h2 className="mt-5 text-lg font-bold text-slate-900">₮/м² тархалт: {label}</h2>
        <div className="mt-2"><PriceSpread title={`${label} заруудын ₮/м²`} values={selected.map((item) => ({ id: item.id, perM2: item.perM2 }))} median={median(selected.map((item) => item.perM2))} /></div>
        <h2 className="mt-6 text-lg font-bold text-slate-900">Медиан ₮/м² — {unit === "day" ? "өдөр" : "7 хоног"} бүрээр</h2>
        <p className="text-xs text-slate-500">{unit === "day" ? "Сүүлийн 14 хоног" : "Сүүлийн 8 долоо хоног"}; цэг бүр тухайн хугацаанд нийтлэгдсэн заруудын медиан.</p>
        <div className="mt-3"><TrendChart unit={unit} series={series} metric="medianPerM2" title={`${label}: медиан ₮/м²`} /></div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5 font-medium">{unit === "day" ? "Өдөр" : "7 хоног"}</th><th className="font-medium">Зар</th><th className="font-medium">Медиан түрээс</th><th className="font-medium">Медиан ₮/м²</th></tr></thead>
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
        <h2 className="text-lg font-bold text-slate-900">Харьцуулалт: медиан сарын түрээс</h2>
        <p className="text-xs text-slate-500">Нүд бүрт: медиан түрээс, ₮/м², зарын тоо. 5-аас цөөн зартай нүд бүдэг — чиглэл төдий.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 font-medium">Дүүрэг</th>
                {ROOMS.map((r) => <th key={r} className="font-medium">{r} өрөө</th>)}
                <th className="font-medium">Бүгд</th>
              </tr>
            </thead>
            <tbody>
              {DISTRICTS.map((d) => (
                <tr key={d} className="border-t border-slate-100 align-top">
                  <td className="py-2 font-semibold text-slate-800"><Link href={href(d, rooms)} className="hover:text-emerald-800">{d}</Link></td>
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
      <span className="block font-semibold text-slate-900">{formatMillions(stats.medianRent)}</span>
      <span className="block text-[11px] text-slate-500">{formatMnt(stats.medianPerM2!)}/м² · {stats.count} зар</span>
    </Link>
  )
}

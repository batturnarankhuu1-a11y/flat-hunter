"use client"

import { useState } from "react"
import Link from "next/link"
import T, { DistrictName } from "@/components/T"
import { useDistrictName, useT } from "@/components/preferences"
import { DISTRICTS } from "@/lib/districts"
import type { PriceCheckResult } from "@/lib/market-stats"
import { formatMnt } from "@/lib/rent-price"

type Result = PriceCheckResult & { input: { district: string; rooms: number; area: number } }

const LEVEL_NOTE: Record<PriceCheckResult["level"], { mn: string; en: string }> = {
  district_rooms: { mn: "Ижил дүүрэг, ижил өрөөтэй заруудаар тооцов.", en: "Based on listings in the same district with the same number of rooms." },
  district: { mn: "Ижил өрөөтэй зар цөөн тул дүүргийн бүх заруудаар тооцов.", en: "Few listings with the same rooms, so all listings in the district were used." },
  city_rooms: { mn: "Энэ дүүрэгт зар цөөн тул хот даяарх ижил өрөөтэй заруудаар тооцов.", en: "Few listings in this district, so same-size listings across the city were used." },
  city: { mn: "Зар цөөн тул хотын бүх заруудаар тооцов — чиглэл төдий.", en: "Few listings, so all listings in the city were used — a rough guide only." },
}

const roomsEn = (rooms: number | string) => `${rooms} room${Number(rooms) === 1 ? "" : "s"}`

/** Owner price check form + result (fair range, ₮/m², closest comparable listings). */
export default function PriceChecker() {
  const t = useT()
  const districtName = useDistrictName()
  const [district, setDistrict] = useState<string>(DISTRICTS[0])
  const [rooms, setRooms] = useState("2")
  const [area, setArea] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function check(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    const failed = t("Тооцоолж чадсангүй", "Could not calculate")
    try {
      const response = await fetch(`/api/price-check?${new URLSearchParams({ district, rooms, area })}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? failed)
      setResult(data as Result)
    } catch (caught) {
      setResult(null)
      setError(caught instanceof Error ? caught.message : failed)
    } finally {
      setLoading(false)
    }
  }

  const span = result ? result.rent.high - result.rent.low || 1 : 1
  return (
    <>
      <form onSubmit={check} className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_8rem_9rem_auto] sm:items-end">
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"><T mn="Дүүрэг" en="District" /></span>
          <select value={district} onChange={(event) => setDistrict(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
            {DISTRICTS.map((item) => <option key={item} value={item}>{districtName(item)}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"><T mn="Өрөө" en="Rooms" /></span>
          <select value={rooms} onChange={(event) => setRooms(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
            {[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{t(`${item} өрөө`, roomsEn(item))}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"><T mn="Талбай (м²)" en="Area (m²)" /></span>
          <input required type="number" min="10" max="600" step="0.1" inputMode="decimal" value={area} onChange={(event) => setArea(event.target.value)} placeholder={t("ж: 52", "e.g. 52")} className="h-10 w-full rounded-lg border border-slate-200 px-3" />
        </label>
        <button type="submit" disabled={loading} className="h-10 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
          {loading ? <T mn="Тооцоолж байна…" en="Calculating…" /> : <T mn="Үнэ шалгах" en="Check price" />}
        </button>
      </form>

      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}

      {result && (
        <section role="status" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            <DistrictName name={result.input.district} />, <T mn={`${result.input.rooms} өрөө, ${result.input.area} м² — боломжит сарын түрээс`} en={`${roomsEn(result.input.rooms)}, ${result.input.area} m² — likely monthly rent`} />
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{formatMnt(result.rent.low)} – {formatMnt(result.rent.high)}</p>
          <p className="mt-1 text-sm text-slate-700">
            <T mn="Медиан: " en="Median: " /><b>{formatMnt(result.rent.median)}</b> <T mn="сард" en="per month" /> ({formatMnt(result.perM2.median)}/м²)
          </p>

          <div className="mt-5" aria-hidden="true">
            <div className="relative h-3 rounded-full bg-gradient-to-r from-emerald-200 via-emerald-400 to-amber-300">
              <span className="absolute -top-1 h-5 w-1 rounded bg-slate-900" style={{ left: `calc(${((result.rent.median - result.rent.low) / span) * 100}% - 2px)` }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span><T mn="Хямд (25%)" en="Low (25%)" /></span><span><T mn="Медиан" en="Median" /></span><span><T mn="Өндөр (75%)" en="High (75%)" /></span>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <T
              mn={`${LEVEL_NOTE[result.level].mn} Бүлэг: ${result.label}, ${result.sampleSize} зар. Хүрээ = м² үнийн 25–75 хувь × таны талбай. Зөвлөгөө биш, зөвхөн чиглэл.`}
              en={`${LEVEL_NOTE[result.level].en} Group: ${result.labelEn ?? result.label}, ${result.sampleSize} listings. Range = 25th–75th percentile of ₮/m² × your area. A guide, not advice.`}
            />
          </p>

          <Link href={`/post?${new URLSearchParams({ district: result.input.district, rooms: String(result.input.rooms), area: String(result.input.area), price: String(result.rent.median) })}`}
            className="mt-4 inline-flex rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"><T mn="Энэ үнээр зар тавих →" en="Post a listing at this price →" /></Link>

          <h2 className="mt-5 text-sm font-semibold text-slate-900"><T mn="Хэмжээгээрээ хамгийн ойр зарууд" en="Closest listings by size" /></h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {result.comparables.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-slate-600">
                  <T mn={`${item.rooms ?? "?"} өрөө`} en={roomsEn(item.rooms ?? "?")} /> · {item.area} м² · {formatMnt(item.perM2)}/м²
                </span>
                <span className="flex items-center gap-3">
                  <b className="text-slate-900">{formatMnt(item.price)}</b>
                  <Link href={`/listings/${item.id}`} className="text-xs font-semibold text-emerald-800 hover:text-emerald-950"><T mn={`Зар [${item.id}] →`} en={`Listing [${item.id}] →`} /></Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

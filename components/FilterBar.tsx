"use client"

import { useState } from "react"
import { DISTRICTS } from "@/lib/districts"
import type { FlatFilters } from "./types"

type FilterBarProps = {
  filters: FlatFilters
  onChange: (filters: FlatFilters) => void
}

const districts = ["ALL", ...DISTRICTS]
const roomOptions = ["ALL", "1", "2", "3", "4"]

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const [saved, setSaved] = useState(false)

  function update(field: keyof FlatFilters, value: string) {
    onChange({ ...filters, [field]: value })
  }

  return (
    <section aria-label="Түрээсийн байр шүүх" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {/* Districts get a full row; rooms, price and save share the second row on wide screens. */}
      <div className="grid gap-4 lg:grid-cols-[auto_minmax(11rem,15rem)_auto] lg:items-end lg:justify-between">
        <fieldset className="lg:col-span-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Дүүрэг</legend>
          <div className="flex flex-wrap gap-1.5">
            {districts.map((district) => (
              <button key={district} type="button" onClick={() => update("district", district)} aria-pressed={filters.district === district}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${filters.district === district ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {district === "ALL" ? "Бүгд" : district}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Өрөөний тоо</legend>
          <div className="flex flex-wrap gap-1.5">
            {roomOptions.map((rooms) => (
              <button key={rooms} type="button" onClick={() => update("rooms", rooms)} aria-pressed={filters.rooms === rooms}
                className={`min-w-10 rounded-lg px-3 py-2 text-sm font-semibold transition ${filters.rooms === rooms ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {rooms === "ALL" ? "Бүгд" : `${rooms} өрөө`}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Сарын түрээс дээд тал</span>
          <span className="flex h-10 items-center rounded-lg border border-slate-200 px-3 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
            <input type="number" min="0" step="0.1" inputMode="decimal" value={filters.maxPrice} onChange={(event) => update("maxPrice", event.target.value)} placeholder="ж: 1.5" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" aria-label="Сарын түрээсийн дээд хязгаар, сая төгрөгөөр" />
            <span className="whitespace-nowrap text-sm text-slate-400">сая ₮</span>
          </span>
        </label>
        <button type="button" onClick={() => { setSaved(true); window.setTimeout(() => setSaved(false), 3200) }} className="h-10 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100">
          ♡ <span className="ml-1">Энэ хайлтыг хадгалах</span>
        </button>
      </div>
      {saved && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ Хайлтыг хадгаллаа. Шинэ зар нэмэгдэхэд танд мэдэгдэнэ.</p>}
    </section>
  )
}

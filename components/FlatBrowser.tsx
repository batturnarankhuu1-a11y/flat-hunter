"use client"

import { useMemo, useState } from "react"
import FilterBar from "@/components/FilterBar"
import FlatGrid from "@/components/FlatGrid"
import type { Flat, FlatFilters } from "@/components/types"

export default function FlatBrowser({ flats, loadError }: { flats: Flat[]; loadError?: string }) {
  const [filters, setFilters] = useState<FlatFilters>({ district: "ALL", rooms: "ALL", maxPrice: "" })
  const filteredFlats = useMemo(() => flats.filter((flat) => {
    if (filters.district !== "ALL" && flat.district !== filters.district) return false
    if (filters.rooms !== "ALL" && flat.rooms !== Number(filters.rooms)) return false
    if (filters.maxPrice && flat.price !== null && flat.price > Number(filters.maxPrice)) return false
    return true
  }), [flats, filters])

  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <section className="relative overflow-hidden bg-[#102c27] text-white">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 82% 25%, #7ce1b1 0, transparent 27%), radial-gradient(circle at 14% 100%, #3a806b 0, transparent 34%)" }} />
        <div className="relative mx-auto max-w-7xl px-5 py-11 sm:px-8 sm:py-14">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-emerald-100"><span className="h-2 w-2 rounded-full bg-emerald-300" />Улаанбаатар хотын үл хөдлөхийн хайлт</div>
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div><h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">Танд тохирох байраа <span className="text-emerald-300">олоорой.</span></h1><p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50/75 sm:text-base">Олон зарын сайтын мэдээллийг нэг дороос харьцуулж, үнийн бодит байдлыг хялбархан шалгаарай.</p></div>
            <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-emerald-50"><span className="block text-xl font-bold text-white">{flats.length}</span>орон сууц</div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <div className="relative -mt-5"><FilterBar filters={filters} onChange={setFilters} /></div>
        <div className="mb-5 mt-9 flex items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Танд зориулсан</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Орон сууцны зарууд</h2></div>
          <p className="text-sm text-slate-500"><span className="font-semibold text-slate-800">{filteredFlats.length}</span> зар олдлоо</p>
        </div>
        {loadError ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
            {loadError}
          </div>
        ) : <FlatGrid flats={filteredFlats} />}
      </div>
    </main>
  )
}

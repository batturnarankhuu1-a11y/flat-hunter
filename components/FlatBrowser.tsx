"use client"

import { Fragment, useMemo, useState } from "react"
import Link from "next/link"
import AskBox from "@/components/AskBox"
import FilterBar from "@/components/FilterBar"
import FlatGrid from "@/components/FlatGrid"
import type { Flat, FlatFilters } from "@/components/types"
import type { AskResponse } from "@/lib/ask"
import type { SearchFilters } from "@/lib/query-parser"

const DEFAULT_FILTERS: FlatFilters = { district: "ALL", rooms: "ALL", maxPrice: "" }

/** Reflect what the AI search understood in the manual filter bar. */
function toFilterBar(filters: SearchFilters): FlatFilters {
  return {
    district: filters.district ?? "ALL",
    rooms: filters.rooms !== null && filters.rooms <= 4 ? String(filters.rooms) : "ALL",
    maxPrice: filters.max_price !== null ? String(filters.max_price / 1_000_000) : "",
  }
}

/** Turn every "[123]" in the answer into a link to that listing. */
function AnswerText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[\d+\])/).map((part, index) => {
        const id = part.match(/^\[(\d+)\]$/)?.[1]
        return id
          ? <Link key={index} href={`/listings/${id}`} className="font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-950">[{id}]</Link>
          : <Fragment key={index}>{part}</Fragment>
      })}
    </>
  )
}

const STATUS_STYLES: Record<AskResponse["status"], string> = {
  OK: "border-emerald-200 bg-emerald-50 text-emerald-950",
  NOT_FOUND: "border-amber-200 bg-amber-50 text-amber-950",
  UNCLEAR: "border-slate-200 bg-white text-slate-800",
}

export default function FlatBrowser({ flats, loadError }: { flats: Flat[]; loadError?: string }) {
  const [filters, setFilters] = useState<FlatFilters>(DEFAULT_FILTERS)
  const [askResult, setAskResult] = useState<AskResponse | null>(null)
  const [askError, setAskError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const filteredFlats = useMemo(() => flats.filter((flat) => {
    if (filters.district !== "ALL" && flat.district !== filters.district) return false
    if (filters.rooms !== "ALL" && flat.rooms !== Number(filters.rooms)) return false
    const maxPrice = Number(filters.maxPrice) * 1_000_000
    if (filters.maxPrice && maxPrice > 0 && (flat.price === null || flat.price > maxPrice)) return false
    return true
  }), [flats, filters])

  // OK / NOT_FOUND show exactly what the API matched (NOT_FOUND → empty); UNCLEAR keeps the normal list.
  const showAskResults = askResult !== null && askResult.status !== "UNCLEAR"
  const visibleFlats = showAskResults ? askResult.flats : filteredFlats

  async function ask(query: string) {
    setAsking(true)
    setAskError(null)
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Хайлт амжилтгүй боллоо")
      setAskResult(data as AskResponse)
      if (data.status !== "UNCLEAR") setFilters(toFilterBar(data.filters))
    } catch (error) {
      setAskError(error instanceof Error ? error.message : "Хайлт амжилтгүй боллоо")
    } finally {
      setAsking(false)
    }
  }

  function changeFilters(next: FlatFilters) {
    // Manual filtering takes over from the AI result.
    setAskResult(null)
    setFilters(next)
  }

  function clearAsk() {
    setAskResult(null)
    setAskError(null)
    setFilters(DEFAULT_FILTERS)
  }

  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <section className="relative overflow-hidden bg-[#102c27] text-white">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 82% 25%, #7ce1b1 0, transparent 27%), radial-gradient(circle at 14% 100%, #3a806b 0, transparent 34%)" }} />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-11 sm:px-8 sm:pb-14 sm:pt-14">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-emerald-100"><span className="h-2 w-2 rounded-full bg-emerald-300" />Улаанбаатар хотын түрээсийн байр</div>
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div><h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">Түрээсийн байраа <span className="text-emerald-300">хямд олоорой.</span></h1><p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50/75 sm:text-base">Нэг байрыг олон зараар өөр өөр үнээр тавьдаг. Бид бүгдийг нь нэгтгэж, хамгийн хямдыг нь болон үнэ бодит эсэхийг харуулна.</p></div>
            <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-emerald-50"><span className="block text-xl font-bold text-white">{flats.length}</span>түрээсийн байр</div>
          </div>
          <div className="mt-8"><AskBox loading={asking} onAsk={ask} /></div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <div className="relative -mt-5"><FilterBar filters={filters} onChange={changeFilters} /></div>
        {askError && (
          <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {askError}
            <button type="button" onClick={clearAsk} className="ml-auto text-xs font-semibold underline underline-offset-2">Хаах</button>
          </div>
        )}
        {askResult && (
          <section role="status" aria-label="AI хайлтын хариулт" className={`mt-4 rounded-xl border px-4 py-4 text-sm ${STATUS_STYLES[askResult.status]}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">✦ AI хариулт</span>
              <span className="rounded-md bg-white/80 px-2 py-0.5 font-mono text-[11px] font-semibold shadow-sm">{askResult.status}</span>
              <button type="button" onClick={clearAsk} className="ml-auto text-xs font-semibold underline underline-offset-2">Цэвэрлэх</button>
            </div>
            <p className="mt-2 leading-6"><AnswerText text={askResult.answer} /></p>
            <details className="mt-2 text-xs opacity-80">
              <summary className="cursor-pointer font-semibold">Задалсан шүүлтүүр (JSON)</summary>
              <pre className="mt-1 overflow-x-auto rounded-md bg-white/70 p-2 font-mono text-[11px]">{JSON.stringify(askResult.filters, null, 2)}</pre>
            </details>
          </section>
        )}
        <div className="mb-5 mt-9 flex items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{showAskResults ? "AI хайлтын үр дүн" : "Танд зориулсан"}</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Түрээсийн байрууд</h2></div>
          <p className="shrink-0 whitespace-nowrap text-sm text-slate-500"><span className="font-semibold text-slate-800">{visibleFlats.length}</span> байр олдлоо</p>
        </div>
        {loadError ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
            {loadError}
          </div>
        ) : <FlatGrid flats={visibleFlats} />}
      </div>
    </main>
  )
}

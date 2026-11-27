"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { DISTRICTS } from "@/lib/districts"
import ProModal from "./ProModal"
import type { FlatFilters } from "./types"
import T from "./T"
import { districtName } from "@/lib/i18n"
import { useT } from "./preferences"

type FilterBarProps = {
  filters: FlatFilters
  onChange: (filters: FlatFilters) => void
}

const districts = ["ALL", ...DISTRICTS]
const roomOptions = ["ALL", "1", "2", "3", "4"]

type SaveMessage = { tone: "ok" | "info" | "error"; text: string; signIn?: boolean }

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const [message, setMessage] = useState<SaveMessage | null>(null)
  const [saving, setSaving] = useState(false)
  const [proOpen, setProOpen] = useState(false)
  const closePro = useCallback(() => setProOpen(false), [])
  const t = useT()

  function update(field: keyof FlatFilters, value: string) {
    onChange({ ...filters, [field]: value })
  }

  /** Save the current filters; the free plan's limit opens the Wire.mn Pro checkout. */
  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      })
      const data = await response.json()
      if (response.status === 401) setMessage({ tone: "info", text: data.error, signIn: true })
      else if (response.status === 402) { setMessage({ tone: "info", text: data.error }); setProOpen(true) }
      else if (!response.ok) setMessage({ tone: "error", text: data.error ?? t("Хайлтыг хадгалж чадсангүй", "Could not save the search") })
      else {
        const usage = data.savedSearchLimit === null ? t("Pro: хязгааргүй", "Pro: unlimited") : t(`${data.savedSearches}/${data.savedSearchLimit} үнэгүй`, `${data.savedSearches}/${data.savedSearchLimit} free`)
        setMessage({ tone: "ok", text: t(`✓ Хайлтыг хадгаллаа (${usage}). Шинэ зар нэмэгдэхэд танд мэдэгдэнэ.`, `✓ Search saved (${usage}). We will let you know when new listings appear.`) })
      }
    } catch {
      setMessage({ tone: "error", text: t("Сүлжээний алдаа. Дахин оролдоно уу.", "Network error. Please try again.") })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label={t("Түрээсийн байр шүүх", "Filter rental flats")} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {/* Districts get a full row; rooms, price and save share the second row on wide screens. */}
      <div className="grid gap-4 lg:grid-cols-[auto_minmax(11rem,15rem)_auto] lg:items-end lg:justify-between">
        <fieldset className="lg:col-span-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><T mn="Дүүрэг" en="District" /></legend>
          <div className="flex flex-wrap gap-1.5">
            {districts.map((district) => (
              <button key={district} type="button" onClick={() => update("district", district)} aria-pressed={filters.district === district}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${filters.district === district ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {district === "ALL" ? <T mn="Бүгд" en="All" /> : <T mn={district} en={districtName(district, "en")} />}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><T mn="Өрөөний тоо" en="Rooms" /></legend>
          <div className="flex flex-wrap gap-1.5">
            {roomOptions.map((rooms) => (
              <button key={rooms} type="button" onClick={() => update("rooms", rooms)} aria-pressed={filters.rooms === rooms}
                className={`min-w-10 rounded-lg px-3 py-2 text-sm font-semibold transition ${filters.rooms === rooms ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {rooms === "ALL" ? <T mn="Бүгд" en="All" /> : <T mn={`${rooms} өрөө`} en={`${rooms} room${rooms === "1" ? "" : "s"}`} />}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"><T mn="Сарын түрээс дээд тал" en="Max monthly rent" /></span>
          <span className="flex h-10 items-center rounded-lg border border-slate-200 px-3 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
            <input type="number" min="0" step="0.1" inputMode="decimal" value={filters.maxPrice} onChange={(event) => update("maxPrice", event.target.value)} placeholder={t("ж: 1.5", "e.g. 1.5")} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" aria-label={t("Сарын түрээсийн дээд хязгаар, сая төгрөгөөр", "Maximum monthly rent, in millions of MNT")} />
            <span className="whitespace-nowrap text-sm text-slate-400"><T mn="сая ₮" en="M ₮" /></span>
          </span>
        </label>
        <button type="button" onClick={save} disabled={saving} className="h-10 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60">
          ♡ <span className="ml-1">{saving ? <T mn="Хадгалж байна…" en="Saving…" /> : <T mn="Энэ хайлтыг хадгалах" en="Save this search" />}</span>
        </button>
      </div>
      {message && (
        <p role="status" className={`mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-sm ${message.tone === "ok" ? "bg-emerald-50 text-emerald-800" : message.tone === "info" ? "bg-amber-50 text-amber-900" : "bg-rose-50 text-rose-900"}`}>
          {message.text}
          {message.signIn && <Link href="/sign-in" className="font-semibold underline underline-offset-2"><T mn="Нэвтрэх" en="Sign in" /></Link>}
        </p>
      )}
      {proOpen && <ProModal onClose={closePro} onActivated={() => setMessage({ tone: "ok", text: t("✓ Pro эрх идэвхжлээ. Одоо хайлтаа дахин хадгална уу — хязгааргүй.", "✓ Pro is active. Save your search again — no limit now.") })} />}
    </section>
  )
}

"use client"

import { useState } from "react"
import T from "@/components/T"
import { useLocale, useT } from "@/components/preferences"

const EXAMPLES_EN = [
  "2 rooms in Bayanzurkh under 1.5M",
  "Furnished 3-room flat in Khan-Uul",
  "River garden",
  "Хан-Уулд 2 өрөө 2.5 сая хүртэл",
]

const EXAMPLES = [
  "Баянзүрхэд 2 өрөө 1.5 сая хүртэл",
  "Хан-Уулд тавилгатай 3 өрөө",
  "River garden",
  "2-room flat in Khan-Uul under 2.5 million",
]

type AskBoxProps = {
  loading: boolean
  onAsk: (query: string) => void
}

export default function AskBox({ loading, onAsk }: AskBoxProps) {
  const [query, setQuery] = useState("")
  const t = useT()
  const examples = useLocale() === "en" ? EXAMPLES_EN : EXAMPLES

  function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setQuery(trimmed)
    onAsk(trimmed)
  }

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); submit(query) }}
      className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur sm:p-4"
      aria-label={t("Ухаалаг хайлт", "Smart search")}
    >
      <label htmlFor="ask-input" className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-100">
        <span aria-hidden="true">⌕</span> <T mn="Хайлт — дүүрэг, өрөө, үнэ эсвэл хотхоноо энгийнээр бичээрэй" en="Search — just type a district, rooms, price or building name" />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="ask-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={300}
          placeholder={t("ж: Баянзүрхэд 2 өрөө 1.5 сая хүртэл", "e.g. 2 rooms in Bayanzurkh under 1.5M")}
          className="h-12 w-full min-w-0 shrink-0 rounded-xl sm:w-auto sm:flex-1 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-emerald-300/40"
        />
        <button type="submit" disabled={loading || !query.trim()} className="h-12 shrink-0 rounded-xl bg-emerald-400 px-5 text-sm font-bold text-[#022c22] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? <T mn="Хайж байна…" en="Searching…" /> : <T mn="Хайх" en="Search" />}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {examples.map((example) => (
          <button key={example} type="button" onClick={() => submit(example)} disabled={loading} className="max-w-full truncate rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-emerald-50/80 transition hover:bg-white/10 disabled:opacity-60">
            {example}
          </button>
        ))}
      </div>
    </form>
  )
}

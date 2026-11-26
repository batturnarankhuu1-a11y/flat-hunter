"use client"

import { useState } from "react"

const EXAMPLES = [
  "Би Баянзүрх дүүрэгт 1.5 саяас доош 2 өрөө байр хайж байна",
  "Хан-Уулд 3 өрөө, 60 м2-аас дээш, 2.5 сая хүртэл",
  "2-room flat for rent in Khan-Uul under 2.5 million",
]

type AskBoxProps = {
  loading: boolean
  onAsk: (query: string) => void
}

export default function AskBox({ loading, onAsk }: AskBoxProps) {
  const [query, setQuery] = useState("")

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
      aria-label="Ухаалаг хайлт"
    >
      <label htmlFor="ask-input" className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-100">
        <span aria-hidden="true">✦</span> AI хайлт — хүссэн байраа өгүүлбэрээр бичээрэй (Монгол эсвэл English)
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="ask-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={300}
          placeholder="Би яг тийм байр хайж байна… (ж: Баянзүрхэд 1.5 саяас доош 2 өрөө)"
          className="h-12 w-full min-w-0 shrink-0 rounded-xl sm:w-auto sm:flex-1 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-emerald-300/40"
        />
        <button type="submit" disabled={loading || !query.trim()} className="h-12 shrink-0 rounded-xl bg-emerald-400 px-5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? "Хайж байна…" : "Хайх"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" onClick={() => submit(example)} disabled={loading} className="max-w-full truncate rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-emerald-50/80 transition hover:bg-white/10 disabled:opacity-60">
            {example}
          </button>
        ))}
      </div>
    </form>
  )
}

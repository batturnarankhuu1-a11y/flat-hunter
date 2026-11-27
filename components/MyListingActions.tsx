"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

/** Hide / show / delete one of the owner's own listings. */
export default function MyListingActions({ id, hidden }: { id: number; hidden: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()

  async function call(method: "PATCH" | "DELETE") {
    if (method === "DELETE" && !window.confirm("Зарыг бүр мөсөн устгах уу?")) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/my-listings/${id}`, {
        method,
        headers: method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
        body: method === "PATCH" ? JSON.stringify({ visible: hidden }) : undefined,
      })
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Алдаа гарлаа")
      startTransition(() => router.refresh())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Алдаа гарлаа")
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || pending
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button type="button" disabled={disabled} onClick={() => call("PATCH")} className="h-8 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50">{hidden ? "Нийтлэх" : "Нуух"}</button>
        <button type="button" disabled={disabled} onClick={() => call("DELETE")} className="h-8 rounded-lg px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Устгах</button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  )
}

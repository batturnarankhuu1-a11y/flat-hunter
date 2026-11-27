"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import T from "@/components/T"
import { useT } from "@/components/preferences"

/** Hide / show / delete one of the owner's own listings. */
export default function MyListingActions({ id, hidden }: { id: number; hidden: boolean }) {
  const router = useRouter()
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()

  async function call(method: "PATCH" | "DELETE") {
    if (method === "DELETE" && !window.confirm(t("Зарыг бүр мөсөн устгах уу?", "Delete this listing permanently?"))) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/my-listings/${id}`, {
        method,
        headers: method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
        body: method === "PATCH" ? JSON.stringify({ visible: hidden }) : undefined,
      })
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? t("Алдаа гарлаа", "Something went wrong"))
      startTransition(() => router.refresh())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Алдаа гарлаа", "Something went wrong"))
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || pending
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button type="button" disabled={disabled} onClick={() => call("PATCH")} className="h-8 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50">{hidden ? <T mn="Нийтлэх" en="Publish" /> : <T mn="Нуух" en="Hide" />}</button>
        <button type="button" disabled={disabled} onClick={() => call("DELETE")} className="h-8 rounded-lg px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><T mn="Устгах" en="Delete" /></button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  )
}

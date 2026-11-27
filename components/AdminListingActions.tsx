"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import T from "@/components/T"
import { useT } from "@/components/preferences"

type Action = "approve" | "hide" | "restore" | "split"

/** Approve (optionally with a corrected price), hide, restore or split one listing. */
export default function AdminListingActions({ id, status, canSplit = false, needsPrice = false }: { id: number; status: string; canSplit?: boolean; needsPrice?: boolean }) {
  const router = useRouter()
  const t = useT()
  const [price, setPrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()

  async function run(action: Action) {
    if (action === "split" && !window.confirm(t("Энэ зарыг тусдаа байр болгох уу?", "Move this listing into a separate flat?"))) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/listings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "approve" && price.trim() ? { price } : {}) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? t("Алдаа гарлаа", "Something went wrong"))
      setPrice("")
      startTransition(() => router.refresh())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Алдаа гарлаа", "Something went wrong"))
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || pending
  const button = "h-8 rounded-lg px-2.5 text-xs font-semibold transition disabled:opacity-50"
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {status === "needs_review" && (
          <>
            <input value={price} onChange={(event) => setPrice(event.target.value)} placeholder={needsPrice ? t("Зөв үнэ: 3.25 сая", "Correct price: 3.25 сая") : t("Үнэ (заавал биш)", "Price (optional)")} aria-label={t("Засах үнэ", "Corrected price")}
              className="h-8 w-36 rounded-lg border border-slate-200 px-2 text-xs" />
            <button type="button" disabled={disabled || (needsPrice && !price.trim())} onClick={() => run("approve")} className={`${button} bg-emerald-700 text-white hover:bg-emerald-800`}><T mn="Батлах" en="Approve" /></button>
          </>
        )}
        {status === "inactive"
          ? <button type="button" disabled={disabled} onClick={() => run("restore")} className={`${button} bg-slate-900 text-white hover:bg-slate-700`}><T mn="Сэргээх" en="Restore" /></button>
          : <button type="button" disabled={disabled} onClick={() => run("hide")} className={`${button} bg-rose-50 text-rose-800 hover:bg-rose-100`}><T mn="Нуух" en="Hide" /></button>}
        {canSplit && <button type="button" disabled={disabled} onClick={() => run("split")} className={`${button} bg-slate-100 text-slate-700 hover:bg-slate-200`}><T mn="Тусдаа байр болгох" en="Split into own flat" /></button>}
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  )
}

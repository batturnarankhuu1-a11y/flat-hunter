"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type Action = "approve" | "hide" | "restore" | "split"

/** Approve (optionally with a corrected price), hide, restore or split one listing. */
export default function AdminListingActions({ id, status, canSplit = false, needsPrice = false }: { id: number; status: string; canSplit?: boolean; needsPrice?: boolean }) {
  const router = useRouter()
  const [price, setPrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()

  async function run(action: Action) {
    if (action === "split" && !window.confirm("Энэ зарыг тусдаа байр болгох уу?")) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/listings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "approve" && price.trim() ? { price } : {}) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? "Алдаа гарлаа")
      setPrice("")
      startTransition(() => router.refresh())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Алдаа гарлаа")
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
            <input value={price} onChange={(event) => setPrice(event.target.value)} placeholder={needsPrice ? "Зөв үнэ: 3.25 сая" : "Үнэ (заавал биш)"} aria-label="Засах үнэ"
              className="h-8 w-36 rounded-lg border border-slate-200 px-2 text-xs" />
            <button type="button" disabled={disabled || (needsPrice && !price.trim())} onClick={() => run("approve")} className={`${button} bg-emerald-700 text-white hover:bg-emerald-800`}>Батлах</button>
          </>
        )}
        {status === "inactive"
          ? <button type="button" disabled={disabled} onClick={() => run("restore")} className={`${button} bg-slate-900 text-white hover:bg-slate-700`}>Сэргээх</button>
          : <button type="button" disabled={disabled} onClick={() => run("hide")} className={`${button} bg-rose-50 text-rose-800 hover:bg-rose-100`}>Нуух</button>}
        {canSplit && <button type="button" disabled={disabled} onClick={() => run("split")} className={`${button} bg-slate-100 text-slate-700 hover:bg-slate-200`}>Тусдаа байр болгох</button>}
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  )
}

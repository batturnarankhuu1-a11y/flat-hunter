"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { FREE_SAVED_SEARCHES, PRO_DAYS, PRO_PRICE_MNT } from "@/lib/plans"
import { formatMnt } from "@/lib/rent-price"

/** Fired on window when the plan changes, so every Pro button / save button refreshes. */
export const BILLING_EVENT = "flat-hunter:billing"

type Invoice = { invoiceId: string; amount: number; days: number; provider: "demo" | "wire"; qrSvg: string }
type State =
  | { step: "loading" }
  | { step: "signin"; message: string }
  | { step: "error"; message: string }
  | { step: "invoice"; invoice: Invoice; confirming: boolean; error?: string }
  | { step: "paid"; invoice: Invoice; proUntil: string }

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("mn-MN", { year: "numeric", month: "2-digit", day: "2-digit" })

/**
 * Wire.mn checkout for Flat Hunter Pro: creates an invoice, shows its QR code and waits for the
 * webhook. In demo mode the "Төлбөр баталгаажуулах (Demo Webhook)" button calls /api/wire/webhook
 * itself, so the whole flow can be shown without moving money.
 */
export default function ProModal({ onClose, onActivated }: { onClose: () => void; onActivated?: (proUntil: string) => void }) {
  const [state, setState] = useState<State>({ step: "loading" })
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/wire/invoice", { method: "POST" })
      .then(async (response) => {
        const data = await response.json()
        if (cancelled) return
        if (response.status === 401) setState({ step: "signin", message: data.error })
        else if (!response.ok) setState({ step: "error", message: data.error ?? "Нэхэмжлэх үүсгэж чадсангүй" })
        else setState({ step: "invoice", invoice: data as Invoice, confirming: false })
      })
      .catch(() => !cancelled && setState({ step: "error", message: "Сүлжээний алдаа. Дахин оролдоно уу." }))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    dialog.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function confirmDemo(invoice: Invoice) {
    setState({ step: "invoice", invoice, confirming: true })
    try {
      const response = await fetch("/api/wire/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoice.invoiceId, status: "paid", demo: true }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Төлбөр баталгаажсангүй")
      setState({ step: "paid", invoice, proUntil: data.proUntil })
      window.dispatchEvent(new CustomEvent(BILLING_EVENT))
      onActivated?.(data.proUntil)
    } catch (error) {
      setState({ step: "invoice", invoice, confirming: false, error: error instanceof Error ? error.message : "Төлбөр баталгаажсангүй" })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="pro-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Wire.mn төлбөр</p>
            <h2 id="pro-title" className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">Flat Hunter Pro</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Хаах" className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
        </div>

        <div className="px-5 py-5">
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3">
            <span className="text-sm font-semibold text-emerald-900">Сарын эрх</span>
            <span className="text-2xl font-bold tracking-tight text-emerald-900">{formatMnt(PRO_PRICE_MNT)}<span className="text-sm font-medium text-emerald-700"> /сар</span></span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
            <li>✓ Хязгааргүй хайлт хадгалах (үнэгүй эрхээр {FREE_SAVED_SEARCHES})</li>
            <li>✓ Хадгалсан хайлтад шинэ зар нэмэгдэхэд мэдэгдэл</li>
            <li>✓ {PRO_DAYS} хоногийн эрх, автоматаар сунгагдахгүй</li>
          </ul>

          {state.step === "loading" && <div className="mt-5 h-56 animate-pulse rounded-xl bg-slate-100" aria-label="Нэхэмжлэх үүсгэж байна" />}

          {state.step === "signin" && (
            <div className="mt-5 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              <p>{state.message}</p>
              <Link href="/sign-in" className="mt-3 inline-block rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800">Нэвтрэх</Link>
            </div>
          )}

          {state.step === "error" && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{state.message}</p>}

          {state.step === "invoice" && (
            <div className="mt-5">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-start">
                <div className="h-40 w-40 shrink-0 [&_svg]:h-full [&_svg]:w-full" role="img" aria-label="Wire.mn төлбөрийн QR код" dangerouslySetInnerHTML={{ __html: state.invoice.qrSvg }} />
                <dl className="w-full space-y-2 text-sm">
                  <div><dt className="text-xs text-slate-500">Нэхэмжлэх</dt><dd className="font-mono text-[13px] font-semibold text-slate-900">{state.invoice.invoiceId}</dd></div>
                  <div><dt className="text-xs text-slate-500">Дүн</dt><dd className="font-semibold text-slate-900">{formatMnt(state.invoice.amount)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Хугацаа</dt><dd className="font-semibold text-slate-900">{state.invoice.days} хоног</dd></div>
                </dl>
              </div>
              <p className="mt-3 text-sm text-slate-600">Банкны аппаараа QR кодыг уншуулж төлнө үү. Төлбөр орж ирмэгц Wire.mn webhook-оор Pro эрх автоматаар идэвхжинэ.</p>
              {state.error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{state.error}</p>}
              {state.invoice.provider === "demo" && (
                <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3">
                  <p className="text-xs text-amber-900">Демо горим: бодит мөнгө шилжихгүй. Доорх товч Wire.mn-ийн webhook-ийг дуудаж төлбөрийг баталгаажуулна.</p>
                  <button type="button" disabled={state.confirming} onClick={() => confirmDemo(state.invoice)}
                    className="mt-2 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60">
                    {state.confirming ? "Баталгаажуулж байна…" : "Төлбөр баталгаажуулах (Demo Webhook)"}
                  </button>
                </div>
              )}
            </div>
          )}

          {state.step === "paid" && (
            <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <p className="text-lg font-bold">✓ Pro эрх идэвхжлээ</p>
              <p className="mt-1 text-sm">{formatDate(state.proUntil)} хүртэл хязгааргүй хайлт хадгална. Нэхэмжлэх {state.invoice.invoiceId} төлөгдсөн.</p>
              <button type="button" onClick={onClose} className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Үргэлжлүүлэх</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

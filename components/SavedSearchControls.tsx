"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import ProModal from "./ProModal"
import T from "./T"
import { useT } from "./preferences"

const MODES = [
  { value: "daily", label: "Өдөр бүр 09:00", labelEn: "Daily at 09:00" },
  { value: "instant", label: "Шуурхай (Pro)", labelEn: "Instant (Pro)" },
  { value: "off", label: "Унтраах", labelEn: "Off" },
] as const

/** Alert setting, "mark as seen" and delete for one saved search. */
export default function SavedSearchControls({ id, alertMode, isPro }: { id: number; alertMode: string; isPro: boolean }) {
  const router = useRouter()
  const t = useT()
  const [mode, setMode] = useState(alertMode)
  const [error, setError] = useState<string | null>(null)
  const [proOpen, setProOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const closePro = useCallback(() => setProOpen(false), [])

  async function send(method: "PATCH" | "DELETE", body?: object) {
    setError(null)
    const response = await fetch(`/api/saved-searches/${id}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await response.json().catch(() => ({}))
    if (response.status === 402) { setProOpen(true); return false }
    if (!response.ok) { setError(data.error ?? t("Алдаа гарлаа", "Something went wrong")); return false }
    startTransition(() => router.refresh())
    return true
  }

  async function changeMode(next: string) {
    const previous = mode
    setMode(next)
    if (!(await send("PATCH", { alertMode: next }))) setMode(previous)
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <label className="sr-only" htmlFor={`alert-${id}`}><T mn="Мэдэгдэл" en="Alerts" /></label>
        <select id={`alert-${id}`} value={mode} disabled={pending} onChange={(event) => changeMode(event.target.value)}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
          {MODES.map((item) => <option key={item.value} value={item.value}>{t(item.label, item.labelEn)}{item.value === "instant" && !isPro ? " 🔒" : ""}</option>)}
        </select>
        <button type="button" disabled={pending} onClick={() => send("PATCH", { markChecked: true })} className="h-8 rounded-lg bg-slate-100 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"><T mn="Үзсэн" en="Mark seen" /></button>
        <button type="button" disabled={pending} onClick={() => send("DELETE")} className="h-8 rounded-lg px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"><T mn="Устгах" en="Delete" /></button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {proOpen && <ProModal onClose={closePro} onActivated={() => { setProOpen(false); void changeMode("instant") }} />}
    </div>
  )
}

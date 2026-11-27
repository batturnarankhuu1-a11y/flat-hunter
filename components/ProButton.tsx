"use client"

import { useCallback, useEffect, useState } from "react"
import ProModal, { BILLING_EVENT } from "./ProModal"
import T from "./T"
import { useLocale } from "./preferences"
import { intlLocale } from "@/lib/i18n"

/** Header button: "Pro авах" opens the Wire.mn checkout; shows "★ Pro" while the plan is active. */
export default function ProButton() {
  const locale = useLocale()
  const [proUntil, setProUntil] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const refresh = useCallback(() => {
    fetch("/api/billing")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setProUntil(data?.plan === "pro" ? data.proUntil : null))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener(BILLING_EVENT, refresh)
    return () => window.removeEventListener(BILLING_EVENT, refresh)
  }, [refresh])

  const close = useCallback(() => setOpen(false), [])

  if (proUntil) {
    return (
      <span title={locale === "en" ? `Until ${new Date(proUntil).toLocaleDateString(intlLocale("en"))}` : `${new Date(proUntil).toLocaleDateString(intlLocale("mn"))} хүртэл`} className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">★ Pro</span>
    )
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-900 transition hover:bg-amber-100">
        <T mn="★ Pro авах" en="★ Get Pro" />
      </button>
      {open && <ProModal onClose={close} />}
    </>
  )
}

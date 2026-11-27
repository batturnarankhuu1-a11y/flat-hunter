import type { ReactNode } from "react"
import { DISTRICT_EN } from "@/lib/i18n"
import type { District } from "@/lib/districts"

/**
 * Bilingual text for Server and Client Components alike. Both languages are rendered and CSS shows
 * the one matching <html lang> (see globals.css), so switching is instant and nothing flashes.
 * Use the useLocale()/useT() hooks instead where a plain string is required (attributes, <option>).
 */
export default function T({ mn, en }: { mn: ReactNode; en: ReactNode }) {
  if (typeof mn === "string" && mn === en) return <>{mn}</>
  return (
    <>
      <span data-lang="mn">{mn}</span>
      <span data-lang="en">{en}</span>
    </>
  )
}

/** SVG flavour: <tspan> instead of <span>, for chart labels inside <text>. */
export function SvgT({ mn, en }: { mn: string; en: string }) {
  return (
    <>
      <tspan data-lang="mn">{mn}</tspan>
      <tspan data-lang="en">{en}</tspan>
    </>
  )
}

/** A district name in both languages (unknown names are shown as they are). */
export function DistrictName({ name }: { name: string | null | undefined }) {
  if (!name) return null
  return <T mn={name} en={DISTRICT_EN[name as District] ?? name} />
}

import { BADGE_LABELS, MIN_GROUP_SIZE, WINDOW_DAYS, type FairPriceBadge as Badge } from "@/lib/fair-price"

const STYLES: Record<Badge, string> = {
  cheap: "bg-emerald-600 text-white",
  fair: "bg-emerald-100 text-emerald-800",
  expensive: "bg-amber-100 text-amber-800",
  not_enough_data: "bg-slate-100 text-slate-600",
  outlier: "bg-rose-100 text-rose-800",
  missing: "bg-slate-100 text-slate-600",
}

const ICONS: Record<Badge, string> = { cheap: "↓", fair: "✓", expensive: "↑", not_enough_data: "…", outlier: "!", missing: "₮" }

/** One-line explanation of a badge, in Mongolian. */
export function describeBadge(badge: Badge, deviation: number | null, sampleSize: number): string | null {
  switch (badge) {
    case "cheap":
    case "expensive":
    case "fair": {
      if (deviation === null) return null
      const percent = Math.round(Math.abs(deviation) * 100)
      return percent === 0 ? "ижил төстэй заруудын медиантай ижил" : `ижил төстэй заруудын медианаас ${percent}% ${deviation < 0 ? "хямд" : "үнэтэй"}`
    }
    case "not_enough_data":
      return `ижил дүүрэг, өрөөний сүүлийн ${WINDOW_DAYS} хоногийн ${sampleSize} зар бий — харьцуулахад ${MIN_GROUP_SIZE}-аас доошгүй хэрэгтэй`
    case "outlier":
      return "м² үнэ дүүргийн медианаас хэт доогуур тул харьцуулалтад оруулаагүй"
    default:
      return null
  }
}

export default function FairPriceBadge({ badge, size = "sm" }: { badge: Badge; size?: "sm" | "lg" }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md font-bold ${STYLES[badge]} ${size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-[11px] leading-5"}`}>
      <span aria-hidden="true">{ICONS[badge]}</span>
      {BADGE_LABELS[badge]}
    </span>
  )
}

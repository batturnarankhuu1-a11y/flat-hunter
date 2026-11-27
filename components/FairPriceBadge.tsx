import T from "@/components/T"
import { BADGE_LABELS, BADGE_LABELS_EN, MIN_GROUP_SIZE, WINDOW_DAYS, type FairPriceBadge as Badge } from "@/lib/fair-price"
import type { Locale } from "@/lib/i18n"

const STYLES: Record<Badge, string> = {
  cheap: "bg-emerald-600 text-white",
  fair: "bg-emerald-100 text-emerald-800",
  expensive: "bg-amber-100 text-amber-800",
  not_enough_data: "bg-slate-100 text-slate-600",
  outlier: "bg-rose-100 text-rose-800",
  missing: "bg-slate-100 text-slate-600",
}

const ICONS: Record<Badge, string> = { cheap: "↓", fair: "✓", expensive: "↑", not_enough_data: "…", outlier: "!", missing: "₮" }

/** One-line explanation of a badge (Mongolian by default). */
export function describeBadge(badge: Badge, deviation: number | null, sampleSize: number, locale: Locale = "mn"): string | null {
  const en = locale === "en"
  switch (badge) {
    case "cheap":
    case "expensive":
    case "fair": {
      if (deviation === null) return null
      const percent = Math.round(Math.abs(deviation) * 100)
      if (en) return percent === 0 ? "same as the median of similar listings" : `${percent}% ${deviation < 0 ? "below" : "above"} the median of similar listings`
      return percent === 0 ? "ижил төстэй заруудын медиантай ижил" : `ижил төстэй заруудын медианаас ${percent}% ${deviation < 0 ? "хямд" : "үнэтэй"}`
    }
    case "not_enough_data":
      return en
        ? `${sampleSize} listings with the same district and rooms in the last ${WINDOW_DAYS} days — at least ${MIN_GROUP_SIZE} are needed to compare`
        : `ижил дүүрэг, өрөөний сүүлийн ${WINDOW_DAYS} хоногийн ${sampleSize} зар бий — харьцуулахад ${MIN_GROUP_SIZE}-аас доошгүй хэрэгтэй`
    case "outlier":
      return en
        ? "price per m² is far below the district median, so it is left out of comparisons"
        : "м² үнэ дүүргийн медианаас хэт доогуур тул харьцуулалтад оруулаагүй"
    default:
      return null
  }
}

/** Both languages of describeBadge as <T>, for Server Components. */
export function BadgeDescription({ badge, deviation, sampleSize }: { badge: Badge; deviation: number | null; sampleSize: number }) {
  const mn = describeBadge(badge, deviation, sampleSize, "mn")
  if (mn === null) return null
  return <T mn={mn} en={describeBadge(badge, deviation, sampleSize, "en")} />
}

export default function FairPriceBadge({ badge, size = "sm" }: { badge: Badge; size?: "sm" | "lg" }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md font-bold ${STYLES[badge]} ${size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-[11px] leading-5"}`}>
      <span aria-hidden="true">{ICONS[badge]}</span>
      <T mn={BADGE_LABELS[badge]} en={BADGE_LABELS_EN[badge]} />
    </span>
  )
}

/** "Энэ байр ижил төстэй заруудын медианаас 12% хямд." in both languages; nothing when there is no explanation. */
export function BadgeExplanation({ badge, deviation, sampleSize, subject = "flat" }: { badge: Badge; deviation: number | null; sampleSize: number; subject?: "flat" | "ad" }) {
  if (describeBadge(badge, deviation, sampleSize) === null) return null
  return (
    <p className="mt-3 text-sm text-slate-600">
      {subject === "flat" ? <T mn="Энэ байр " en="This flat: " /> : <T mn="Энэ зар " en="This ad: " />}
      <BadgeDescription badge={badge} deviation={deviation} sampleSize={sampleSize} />.
    </p>
  )
}

/** How the Fair Price badge is computed. */
export function FairPriceMethod() {
  return (
    <T
      mn={`Ижил дүүрэг, өрөөний тоотой, сүүлийн ${WINDOW_DAYS} хоногийн түрээсийн заруудын м² үнийн медиантай харьцуулна. Дүүргийн медианы 30%-иас доош м² үнэтэй зарыг хасна; ${MIN_GROUP_SIZE}-аас цөөн зар байвал “Мэдээлэл хангалтгүй”. Badge нь зөвлөгөө биш, зөвхөн чиглэл.`}
      en={`Compared with the median price per m² of rentals with the same district and number of rooms over the last ${WINDOW_DAYS} days. Ads below 30% of the district median per m² are left out; with fewer than ${MIN_GROUP_SIZE} listings the badge says “Not enough data”. The badge is a hint, not advice.`}
    />
  )
}

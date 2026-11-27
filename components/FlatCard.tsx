"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import FairPriceBadge, { describeBadge } from "./FairPriceBadge"
import { formatMnt } from "@/lib/rent-price"
import T, { DistrictName } from "@/components/T"
import { useT } from "@/components/preferences"
import type { Flat } from "./types"

export default function FlatCard({ flat }: { flat: Flat }) {
  const gallery = (flat.image || "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean)
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const safeActiveIndex = Math.min(activeIndex, Math.max(gallery.length - 1, 0))
  const activeImage = gallery[safeActiveIndex] ?? "/apartment-placeholder.svg"
  const showImageFallback = failedImage === activeImage
  const t = useT()
  const detailHref = `/flats/${flat.id}`
  const hasDeviation = flat.badge === "cheap" || flat.badge === "expensive" || flat.badge === "fair"
  const deviationMn = hasDeviation ? describeBadge(flat.badge, flat.priceDeviation, flat.sampleSize, "mn") : null
  const deviationEn = hasDeviation ? describeBadge(flat.badge, flat.priceDeviation, flat.sampleSize, "en") : null

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative h-52 overflow-hidden bg-slate-100">
        <Link href={detailHref} aria-label={flat.title} className="block h-full">
          {!showImageFallback ? <Image src={activeImage} alt={flat.title} width={1000} height={700} unoptimized referrerPolicy="no-referrer" onError={() => setFailedImage(activeImage)} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> :
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-emerald-50 to-slate-100 text-slate-400"><span className="text-4xl">⌂</span><span className="text-xs font-medium"><T mn="Зургийг харуулах боломжгүй" en="Photo unavailable" /></span></div>}
        </Link>
        <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-white/95 px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm"><DistrictName name={flat.district} /></span>
        <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1">
          {flat.ownerListing && <span className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">★ <T mn="Эзэмшигчийн зар" en="Owner listing" /></span>}
          {flat.previousPrice !== null && <span className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">↓ <T mn="Үнэ буурсан" en="Price dropped" /></span>}
          {flat.sourcesCount > 1 && <span className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm"><T mn={`${flat.sourcesCount} зар нэгтгэсэн`} en={`${flat.sourcesCount} ads merged`} /></span>}
        </div>
        {gallery.length > 1 && <>
          <button type="button" aria-label={t("Өмнөх зураг", "Previous photo")} onClick={() => setActiveIndex((safeActiveIndex - 1 + gallery.length) % gallery.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-2.5 py-1.5 text-lg font-semibold leading-none text-slate-800 shadow transition hover:bg-white">←</button>
          <button type="button" aria-label={t("Дараагийн зураг", "Next photo")} onClick={() => setActiveIndex((safeActiveIndex + 1) % gallery.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-2.5 py-1.5 text-lg font-semibold leading-none text-slate-800 shadow transition hover:bg-white">→</button>
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-slate-950/70 px-2 py-1 text-[11px] font-semibold text-white">{safeActiveIndex + 1}/{gallery.length}</span>
        </>}
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 min-h-12 text-[15px] font-semibold leading-6 text-slate-900"><Link href={detailHref} className="hover:text-emerald-800">{flat.title}</Link></h3>
        <p className="mt-1 line-clamp-1 text-xs text-slate-500">{flat.address}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-600">
          <span>{flat.rooms !== null ? <T mn={`${flat.rooms} өрөө`} en={`${flat.rooms} room${flat.rooms === 1 ? "" : "s"}`} /> : <T mn="Өрөө тодорхойгүй" en="Rooms unknown" />}</span><span aria-hidden="true" className="h-1 w-1 rounded-full bg-slate-300" />
          <span>{flat.area !== null ? <T mn={`${flat.area} м²`} en={`${flat.area} m²`} /> : <T mn="Талбай тодорхойгүй" en="Area unknown" />}</span>
          {flat.pricePerM2 !== null && <><span aria-hidden="true" className="h-1 w-1 rounded-full bg-slate-300" /><span>{formatMnt(flat.pricePerM2)}/<T mn="м²" en="m²" /></span></>}
        </div>
        {/* Badge on its own line so it never squeezes the title */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-100 pb-3">
          <FairPriceBadge badge={flat.badge} />
          {deviationMn && <span className="text-xs leading-5 text-slate-500"><T mn={deviationMn} en={deviationEn} /></span>}
        </div>
        <div className="flex items-end justify-between gap-3 pt-3">
          <div className="min-w-0">
            {flat.price !== null && flat.previousPrice !== null
              ? <p className="text-[11px] font-medium text-rose-700"><s>{formatMnt(flat.previousPrice)}</s> → {Math.round((1 - flat.price / flat.previousPrice) * 100)}% <T mn="хямдарсан" en="cheaper" /></p>
              : flat.price !== null && flat.sourcesCount > 1 && <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400"><T mn="хамгийн хямд" en="lowest price" /></p>}
            <p className="whitespace-nowrap text-lg font-bold tracking-tight text-slate-900">
              {flat.price !== null ? <>{formatMnt(flat.price)}<span className="text-xs font-medium text-slate-500"> /<T mn="сар" en="mo" /></span></> : <span className="text-base text-slate-500"><T mn="Үнэ тохиролцоно" en="Price on request" /></span>}
            </p>
          </div>
          <Link href={detailHref} className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"><T mn="Зар үзэх →" en="View →" /></Link>
        </div>
      </div>
    </article>
  )
}

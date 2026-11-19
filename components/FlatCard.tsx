"use client"

import { useState } from "react"
import Image from "next/image"
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
  const hasPriceAndArea = flat.price !== null && flat.area !== null && flat.area > 0
  const pricePerM2 = flat.pricePerM2 != null && flat.pricePerM2 > 0
    ? flat.pricePerM2
    : hasPriceAndArea ? flat.price! / flat.area! : null
  const isFairPrice = pricePerM2 !== null && pricePerM2 <= 3.8

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative h-52 overflow-hidden bg-slate-100">
        {!showImageFallback ? <Image src={activeImage} alt={flat.title} width={1000} height={700} unoptimized onError={() => setFailedImage(activeImage)} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> :
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-emerald-50 to-slate-100 text-slate-400"><span className="text-4xl">⌂</span><span className="text-xs font-medium">Зургийг харуулах боломжгүй</span></div>}
        <span className="absolute left-3 top-3 rounded-md bg-white/95 px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm">{flat.district}</span>
        {flat.sourcesCount && flat.sourcesCount > 1 && <span className="absolute right-3 top-3 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">{flat.sourcesCount} зар нэгтгэсэн</span>}
        {gallery.length > 1 && <>
          <button type="button" aria-label="Өмнөх зураг" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveIndex((safeActiveIndex - 1 + gallery.length) % gallery.length) }} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-2.5 py-1.5 text-lg font-semibold leading-none text-slate-800 shadow transition hover:bg-white">←</button>
          <button type="button" aria-label="Дараагийн зураг" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveIndex((safeActiveIndex + 1) % gallery.length) }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-2.5 py-1.5 text-lg font-semibold leading-none text-slate-800 shadow transition hover:bg-white">→</button>
          <span className="absolute bottom-2 right-2 rounded-md bg-slate-950/70 px-2 py-1 text-[11px] font-semibold text-white">{safeActiveIndex + 1}/{gallery.length}</span>
        </>}
      </div>
      {gallery.length > 1 && <div className="flex gap-2 overflow-x-auto border-b border-slate-100 bg-white px-3 py-2" aria-label="Зургийн цомог">
        {gallery.map((image, index) => <button key={`${image}-${index}`} type="button" aria-label={`${index + 1}-р зураг`} aria-pressed={index === safeActiveIndex} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveIndex(index) }} className={`h-12 w-[4.5rem] shrink-0 overflow-hidden rounded-md border-2 transition ${index === safeActiveIndex ? "border-emerald-600" : "border-transparent opacity-70 hover:opacity-100"}`}>
          <Image src={image} alt="" width={144} height={96} unoptimized onError={() => setFailedImage(image)} className="h-full w-full object-cover" />
        </button>)}
      </div>}
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 min-h-12 text-[15px] font-semibold leading-6 text-slate-900">{flat.title}</h3>
          {pricePerM2 !== null ? <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${isFairPrice ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{isFairPrice ? "Бодит үнэ" : "Өндөр үнэ"}</span> : <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">Мэдээлэл дутуу</span>}
        </div>
        <p className="mb-3 text-xs text-slate-500">{flat.address}</p>
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3 text-xs font-medium text-slate-600">
          <span>{flat.rooms !== null ? `${flat.rooms} өрөө` : "Өрөө тодорхойгүй"}</span><span className="h-1 w-1 rounded-full bg-slate-300" />
          <span>{flat.area !== null ? `${flat.area} м²` : "Талбай тодорхойгүй"}</span>
          {pricePerM2 !== null && <><span className="h-1 w-1 rounded-full bg-slate-300" /><span>{pricePerM2.toFixed(1)} сая/м²</span></>}
        </div>
        <div className="flex items-end justify-between gap-2 pt-3">
          <div><p className="text-lg font-bold tracking-tight text-slate-900">{flat.price !== null ? `${flat.price.toLocaleString("mn-MN")} сая ₮` : "Үнэ тохирно"}</p><p className="mt-0.5 text-[11px] text-slate-400">{flat.postedAt}</p></div>
          <a href={flat.url} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700">Зар үзэх ↗</a>
        </div>
      </div>
    </article>
  )
}

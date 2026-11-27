"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { DISTRICTS } from "@/lib/districts"
import { formatMnt } from "@/lib/rent-price"

const SAMPLES = [
  { src: "/samples/living.svg", label: "Зочны өрөө" },
  { src: "/samples/bedroom.svg", label: "Унтлагын өрөө" },
  { src: "/samples/kitchen.svg", label: "Гал тогоо" },
  { src: "/samples/building.svg", label: "Барилга" },
]
const MAX_PHOTOS = 8

type Saved = { listingId: number; flatId: number; status: string; pricePerM2: number; badgeLabel: string | null; fair: { deviation: number | null; sampleSize: number; benchmarkPerM2: number | null } | null }
type Range = { rent: { low: number; median: number; high: number }; label: string; sampleSize: number }

/** Shrink a photo in the browser (≤ 1600px, JPEG) so uploads stay small and fast. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Зургийг уншиж чадсангүй"))), "image/jpeg", 0.82))
}

const input = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"

export default function PostListingForm({ initial }: { initial: { district: string; rooms: string; area: string; price: string } }) {
  const [form, setForm] = useState({
    title: "",
    district: DISTRICTS.find((item) => item === initial.district) ?? "",
    location: "",
    rooms: /^[1-8]$/.test(initial.rooms) ? initial.rooms : "",
    area: initial.area,
    price: initial.price,
    paymentTerms: "",
    furnished: "",
    description: "",
  })
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [range, setRange] = useState<Range | null>(null)
  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [field]: event.target.value })

  // Live comparison while typing: the fair range for this district / rooms / area.
  useEffect(() => {
    const area = Number(form.area)
    if (!form.district || !form.rooms || !(area >= 10)) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(`/api/price-check?${new URLSearchParams({ district: form.district, rooms: form.rooms, area: form.area })}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => setRange(data))
        .catch(() => undefined)
    }, 400)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [form.district, form.rooms, form.area])

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      const added: string[] = []
      for (const file of [...files].slice(0, MAX_PHOTOS - images.filter((image) => !image.startsWith("/samples/")).length)) {
        if (!file.type.startsWith("image/")) continue
        const response = await fetch("/api/photos", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: await shrink(file) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? "Зураг оруулж чадсангүй")
        added.push(data.url)
      }
      // Real photos replace a chosen sample illustration.
      setImages((current) => [...current.filter((image) => !image.startsWith("/samples/")), ...added].slice(0, MAX_PHOTOS))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Зураг оруулж чадсангүй")
    } finally {
      setUploading(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/my-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, rooms: Number(form.rooms), area: Number(form.area), furnished: form.furnished === "" ? null : form.furnished === "yes", images }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Хадгалж чадсангүй")
      setSaved(data as Saved)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Хадгалж чадсангүй")
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    const deviation = saved.fair?.deviation
    return (
      <section role="status" className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-bold text-emerald-900">✓ Зар нэмэгдлээ{saved.status === "needs_review" ? " — үнийг админ шалгана" : ""}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">м² үнэ</dt><dd className="mt-1 font-bold text-slate-900">{formatMnt(saved.pricePerM2)}/м²</dd></div>
          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Fair Price</dt><dd className="mt-1 font-bold text-slate-900">{saved.badgeLabel ?? "Шалгагдаж байна"}</dd></div>
          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Медиантай харьцуулахад</dt><dd className="mt-1 font-bold text-slate-900">{deviation !== null && deviation !== undefined ? `${Math.round(Math.abs(deviation) * 100)}% ${deviation < 0 ? "хямд" : "өндөр"}` : `харьцуулах зар цөөн (${saved.fair?.sampleSize ?? 0})`}</dd></div>
        </dl>
        {saved.status === "needs_review" && <p className="mt-3 text-sm text-amber-800">Сарын түрээс 1–20 сая ₮-ийн гадна байгаа тул админ шалгасны дараа нийтэд харагдана.</p>}
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          {saved.status === "active" && <Link href={`/listings/${saved.listingId}`} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800">Зараа харах</Link>}
          <Link href="/my-listings" className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50">Миний зарууд</Link>
          <button type="button" onClick={() => { setSaved(null); setImages([]); setForm({ ...form, title: "", description: "" }) }} className="rounded-lg px-4 py-2 font-semibold text-emerald-800 hover:bg-emerald-50">Өөр зар нэмэх</button>
        </div>
      </section>
    )
  }

  const price = Number(form.price)
  const position = range && price > 0 ? (price < range.rent.low ? "хямд талдаа" : price > range.rent.high ? "өндөр талдаа" : "боломжийн хүрээнд") : null
  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className={label}>Гарчиг *</span>
          <input required minLength={5} maxLength={120} value={form.title} onChange={set("title")} placeholder="ж: Хан-Уул, 19-р хороолол, тавилгатай 2 өрөө байр" className={input} />
        </label>
        <label className="block"><span className={label}>Дүүрэг *</span>
          <select required value={form.district} onChange={set("district")} className={input}>
            <option value="">Сонгох</option>
            {DISTRICTS.map((district) => <option key={district}>{district}</option>)}
          </select>
        </label>
        <label className="block"><span className={label}>Байршил / хороо</span>
          <input maxLength={80} value={form.location} onChange={set("location")} placeholder="ж: 15-р хороо эсвэл Хүннү 2222" className={input} />
        </label>
        <label className="block"><span className={label}>Өрөөний тоо *</span>
          <select required value={form.rooms} onChange={set("rooms")} className={input}>
            <option value="">Сонгох</option>
            {[1, 2, 3, 4, 5, 6].map((rooms) => <option key={rooms} value={rooms}>{rooms} өрөө</option>)}
          </select>
        </label>
        <label className="block"><span className={label}>Талбай (м²) *</span>
          <input required type="number" min="10" max="600" step="0.1" inputMode="decimal" value={form.area} onChange={set("area")} placeholder="ж: 52" className={input} />
        </label>
        <label className="block"><span className={label}>Сарын түрээс (₮) *</span>
          <input required type="number" min="100000" step="10000" inputMode="numeric" value={form.price} onChange={set("price")} placeholder="ж: 2300000" className={input} />
          {price > 0 && <span className="mt-1 block text-xs text-slate-500">{formatMnt(price)} сард</span>}
        </label>
        <label className="block"><span className={label}>Төлбөрийн нөхцөл</span>
          <input maxLength={30} value={form.paymentTerms} onChange={set("paymentTerms")} placeholder="ж: 3+1" className={input} />
        </label>
        <label className="block"><span className={label}>Тавилга</span>
          <select value={form.furnished} onChange={set("furnished")} className={input}>
            <option value="">Заахгүй</option>
            <option value="yes">Тавилгатай</option>
            <option value="no">Тавилгагүй</option>
          </select>
        </label>
        <label className="block sm:col-span-2"><span className={label}>Тайлбар</span>
          <textarea maxLength={2000} rows={4} value={form.description} onChange={set("description")} placeholder="Давхар, засвар, ойролцоох сургууль, зогсоол… (утасны дугаар бичихгүй — автоматаар нуугдана)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
        </label>
        {range && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:col-span-2">
            Ижил төстэй байр ({range.label}, {range.sampleSize} зар): <b>{formatMnt(range.rent.low)} – {formatMnt(range.rent.high)}</b>, медиан {formatMnt(range.rent.median)}.
            {position && <> Таны үнэ <b>{position}</b> байна.</>}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Зураг * <span className="font-normal text-slate-500">({images.length}/{MAX_PHOTOS})</span></h2>
        <p className="text-xs text-slate-500">Өөрийн байрны зургийг оруулна уу (JPG/PNG, автоматаар жижгэрнэ). Зураггүй бол доороос жишээ зураг сонгож болно — “Жишээ зураг” гэж тэмдэглэгдэнэ.</p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {images.map((src) => (
            <div key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview of the user's own upload */}
              <img src={src} alt="" className="h-24 w-full rounded-lg bg-slate-100 object-cover" />
              <button type="button" onClick={() => setImages(images.filter((image) => image !== src))} aria-label="Зураг хасах" className="absolute right-1 top-1 rounded-full bg-slate-900/70 px-2 text-sm text-white">×</button>
            </div>
          ))}
          {images.filter((image) => !image.startsWith("/samples/")).length < MAX_PHOTOS && (
            <label className={`flex h-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:border-emerald-500 hover:text-emerald-700 ${uploading ? "opacity-60" : ""}`}>
              <span className="text-xl">＋</span>{uploading ? "Оруулж байна…" : "Зураг оруулах"}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading} onChange={(event) => { void upload(event.target.files); event.target.value = "" }} className="sr-only" />
            </label>
          )}
        </div>
        {!images.some((image) => image.startsWith("/api/photos/")) && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-600">Эсвэл жишээ зураг:</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SAMPLES.map((sample) => (
                <button key={sample.src} type="button" onClick={() => setImages([sample.src])} aria-pressed={images.includes(sample.src)}
                  className={`overflow-hidden rounded-lg border-2 text-left text-xs ${images.includes(sample.src) ? "border-emerald-600" : "border-transparent hover:border-slate-300"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- static illustration */}
                  <img src={sample.src} alt="" className="h-20 w-full object-cover" />
                  <span className="block px-1.5 py-1 text-slate-600">{sample.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || uploading || images.length === 0} className="h-11 rounded-xl bg-emerald-700 px-6 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? "Хадгалж байна…" : "Зар нийтлэх"}</button>
        <p className="text-xs text-slate-500">Холбоо барих утас, нэр хадгалахгүй (N3). Зарыг “Миний зарууд”-аас нууж, устгаж болно.</p>
      </div>
    </form>
  )
}

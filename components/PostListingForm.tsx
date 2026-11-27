"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { DISTRICTS } from "@/lib/districts"
import { formatMnt } from "@/lib/rent-price"
import T from "@/components/T"
import { useDistrictName, useT } from "@/components/preferences"

const SAMPLES = [
  { src: "/samples/living.svg", label: "Зочны өрөө", labelEn: "Living room" },
  { src: "/samples/bedroom.svg", label: "Унтлагын өрөө", labelEn: "Bedroom" },
  { src: "/samples/kitchen.svg", label: "Гал тогоо", labelEn: "Kitchen" },
  { src: "/samples/building.svg", label: "Барилга", labelEn: "Building" },
]
const MAX_PHOTOS = 8
// English Fair Price labels for the saved summary (the API returns the badge key and the Mongolian label).
const BADGE_EN: Record<string, string> = { cheap: "Good price", fair: "Fair price", expensive: "High price", not_enough_data: "Not enough data", outlier: "Unusually low", missing: "Price negotiable" }

type Saved = { listingId: number; flatId: number; status: string; pricePerM2: number; badgeLabel: string | null; badge?: string | null; fair: { deviation: number | null; sampleSize: number; benchmarkPerM2: number | null } | null }
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
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Зургийг уншиж чадсангүй / Could not read the image"))), "image/jpeg", 0.82))
}

const input = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"

export default function PostListingForm({ initial }: { initial: { district: string; rooms: string; area: string; price: string } }) {
  const t = useT()
  const districtName = useDistrictName()
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
        if (!response.ok) throw new Error(data.error ?? t("Зураг оруулж чадсангүй", "Could not upload the photo"))
        added.push(data.url)
      }
      // Real photos replace a chosen sample illustration.
      setImages((current) => [...current.filter((image) => !image.startsWith("/samples/")), ...added].slice(0, MAX_PHOTOS))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Зураг оруулж чадсангүй", "Could not upload the photo"))
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
      if (!response.ok) throw new Error(data.error ?? t("Хадгалж чадсангүй", "Could not save"))
      setSaved(data as Saved)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Хадгалж чадсангүй", "Could not save"))
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    const deviation = saved.fair?.deviation
    return (
      <section role="status" className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-bold text-emerald-900">✓ <T mn="Зар нэмэгдлээ" en="Listing posted" />{saved.status === "needs_review" && <T mn=" — үнийг админ шалгана" en=" — an admin will check the price" />}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500"><T mn="м² үнэ" en="Price per m²" /></dt><dd className="mt-1 font-bold text-slate-900">{formatMnt(saved.pricePerM2)}/<T mn="м²" en="m²" /></dd></div>
          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Fair Price</dt><dd className="mt-1 font-bold text-slate-900">{saved.badgeLabel ? <T mn={saved.badgeLabel} en={BADGE_EN[saved.badge ?? ""] ?? saved.badgeLabel} /> : <T mn="Шалгагдаж байна" en="Being checked" />}</dd></div>
          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500"><T mn="Медиантай харьцуулахад" en="Compared with the median" /></dt><dd className="mt-1 font-bold text-slate-900">{deviation !== null && deviation !== undefined
            ? <T mn={`${Math.round(Math.abs(deviation) * 100)}% ${deviation < 0 ? "хямд" : "өндөр"}`} en={`${Math.round(Math.abs(deviation) * 100)}% ${deviation < 0 ? "cheaper" : "higher"}`} />
            : <T mn={`харьцуулах зар цөөн (${saved.fair?.sampleSize ?? 0})`} en={`too few similar listings (${saved.fair?.sampleSize ?? 0})`} />}</dd></div>
        </dl>
        {saved.status === "needs_review" && <p className="mt-3 text-sm text-amber-800"><T mn="Сарын түрээс 1–20 сая ₮-ийн гадна байгаа тул админ шалгасны дараа нийтэд харагдана." en="The monthly rent is outside 1–20M ₮, so the listing becomes public after an admin checks it." /></p>}
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          {saved.status === "active" && <Link href={`/listings/${saved.listingId}`} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800"><T mn="Зараа харах" en="View listing" /></Link>}
          <Link href="/my-listings" className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"><T mn="Миний зарууд" en="My listings" /></Link>
          <button type="button" onClick={() => { setSaved(null); setImages([]); setForm({ ...form, title: "", description: "" }) }} className="rounded-lg px-4 py-2 font-semibold text-emerald-800 hover:bg-emerald-50"><T mn="Өөр зар нэмэх" en="Post another" /></button>
        </div>
      </section>
    )
  }

  const price = Number(form.price)
  const position = range && price > 0 ? (price < range.rent.low ? { mn: "хямд талдаа", en: "on the cheap side" } : price > range.rent.high ? { mn: "өндөр талдаа", en: "on the high side" } : { mn: "боломжийн хүрээнд", en: "within the fair range" }) : null
  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className={label}><T mn="Гарчиг *" en="Title *" /></span>
          <input required minLength={5} maxLength={120} value={form.title} onChange={set("title")} placeholder={t("ж: Хан-Уул, 19-р хороолол, тавилгатай 2 өрөө байр", "e.g. Khan-Uul, 19th district, furnished 2-room flat")} className={input} />
        </label>
        <label className="block"><span className={label}><T mn="Дүүрэг *" en="District *" /></span>
          <select required value={form.district} onChange={set("district")} className={input}>
            <option value=""><T mn="Сонгох" en="Choose" /></option>
            {DISTRICTS.map((district) => <option key={district} value={district}>{districtName(district)}</option>)}
          </select>
        </label>
        <label className="block"><span className={label}><T mn="Байршил / хороо" en="Location / khoroo" /></span>
          <input maxLength={80} value={form.location} onChange={set("location")} placeholder={t("ж: 15-р хороо эсвэл Хүннү 2222", "e.g. 15th khoroo or Khunnu 2222")} className={input} />
        </label>
        <label className="block"><span className={label}><T mn="Өрөөний тоо *" en="Rooms *" /></span>
          <select required value={form.rooms} onChange={set("rooms")} className={input}>
            <option value=""><T mn="Сонгох" en="Choose" /></option>
            {[1, 2, 3, 4, 5, 6].map((rooms) => <option key={rooms} value={rooms}>{t(`${rooms} өрөө`, `${rooms} room${rooms === 1 ? "" : "s"}`)}</option>)}
          </select>
        </label>
        <label className="block"><span className={label}><T mn="Талбай (м²) *" en="Area (m²) *" /></span>
          <input required type="number" min="10" max="600" step="0.1" inputMode="decimal" value={form.area} onChange={set("area")} placeholder={t("ж: 52", "e.g. 52")} className={input} />
        </label>
        <label className="block"><span className={label}><T mn="Сарын түрээс (₮) *" en="Monthly rent (₮) *" /></span>
          <input required type="number" min="100000" step="10000" inputMode="numeric" value={form.price} onChange={set("price")} placeholder={t("ж: 2300000", "e.g. 2300000")} className={input} />
          {price > 0 && <span className="mt-1 block text-xs text-slate-500">{formatMnt(price)} <T mn="сард" en="per month" /></span>}
        </label>
        <label className="block"><span className={label}><T mn="Төлбөрийн нөхцөл" en="Payment terms" /></span>
          <input maxLength={30} value={form.paymentTerms} onChange={set("paymentTerms")} placeholder={t("ж: 3+1", "e.g. 3+1")} className={input} />
        </label>
        <label className="block"><span className={label}><T mn="Тавилга" en="Furniture" /></span>
          <select value={form.furnished} onChange={set("furnished")} className={input}>
            <option value=""><T mn="Заахгүй" en="Not specified" /></option>
            <option value="yes"><T mn="Тавилгатай" en="Furnished" /></option>
            <option value="no"><T mn="Тавилгагүй" en="Unfurnished" /></option>
          </select>
        </label>
        <label className="block sm:col-span-2"><span className={label}><T mn="Тайлбар" en="Description" /></span>
          <textarea maxLength={2000} rows={4} value={form.description} onChange={set("description")} placeholder={t("Давхар, засвар, ойролцоох сургууль, зогсоол… (утасны дугаар бичихгүй — автоматаар нуугдана)", "Floor, renovation, nearby schools, parking… (no phone numbers — they are hidden automatically)")} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
        </label>
        {range && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:col-span-2">
            <T mn="Ижил төстэй байр" en="Similar flats" /> ({range.label}, {range.sampleSize} <T mn="зар" en="listings" />): <b>{formatMnt(range.rent.low)} – {formatMnt(range.rent.high)}</b>, <T mn="медиан" en="median" /> {formatMnt(range.rent.median)}.
            {position && <> <T mn={<>Таны үнэ <b>{position.mn}</b> байна.</>} en={<>Your price is <b>{position.en}</b>.</>} /></>}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900"><T mn="Зураг *" en="Photos *" /> <span className="font-normal text-slate-500">({images.length}/{MAX_PHOTOS})</span></h2>
        <p className="text-xs text-slate-500"><T mn="Өөрийн байрны зургийг оруулна уу (JPG/PNG, автоматаар жижгэрнэ). Зураггүй бол доороос жишээ зураг сонгож болно — “Жишээ зураг” гэж тэмдэглэгдэнэ." en="Upload photos of your flat (JPG/PNG, resized automatically). No photos? Pick a sample image below — it will be marked as a “Sample image”." /></p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {images.map((src) => (
            <div key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview of the user's own upload */}
              <img src={src} alt="" className="h-24 w-full rounded-lg bg-slate-100 object-cover" />
              <button type="button" onClick={() => setImages(images.filter((image) => image !== src))} aria-label={t("Зураг хасах", "Remove photo")} className="absolute right-1 top-1 rounded-full bg-slate-900/70 px-2 text-sm text-white">×</button>
            </div>
          ))}
          {images.filter((image) => !image.startsWith("/samples/")).length < MAX_PHOTOS && (
            <label className={`flex h-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:border-emerald-500 hover:text-emerald-700 ${uploading ? "opacity-60" : ""}`}>
              <span className="text-xl">＋</span>{uploading ? <T mn="Оруулж байна…" en="Uploading…" /> : <T mn="Зураг оруулах" en="Upload photo" />}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading} onChange={(event) => { void upload(event.target.files); event.target.value = "" }} className="sr-only" />
            </label>
          )}
        </div>
        {!images.some((image) => image.startsWith("/api/photos/")) && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-600"><T mn="Эсвэл жишээ зураг:" en="Or a sample image:" /></p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SAMPLES.map((sample) => (
                <button key={sample.src} type="button" onClick={() => setImages([sample.src])} aria-pressed={images.includes(sample.src)}
                  className={`overflow-hidden rounded-lg border-2 text-left text-xs ${images.includes(sample.src) ? "border-emerald-600" : "border-transparent hover:border-slate-300"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- static illustration */}
                  <img src={sample.src} alt="" className="h-20 w-full object-cover" />
                  <span className="block px-1.5 py-1 text-slate-600"><T mn={sample.label} en={sample.labelEn} /></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || uploading || images.length === 0} className="h-11 rounded-xl bg-emerald-700 px-6 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? <T mn="Хадгалж байна…" en="Saving…" /> : <T mn="Зар нийтлэх" en="Publish listing" />}</button>
        <p className="text-xs text-slate-500"><T mn="Холбоо барих утас, нэр хадгалахгүй (N3). Зарыг “Миний зарууд”-аас нууж, устгаж болно." en="No contact phone numbers or names are stored (N3). You can hide or delete the listing from “My listings”." /></p>
      </div>
    </form>
  )
}

import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import type { Flat } from "@/components/types"
import FairPriceBadge, { describeBadge } from "@/components/FairPriceBadge"
import { Gallery, splitGallery } from "@/components/ListingParts"
import { getFlatListings } from "@/lib/db"
import { MIN_GROUP_SIZE, WINDOW_DAYS } from "@/lib/fair-price"
import { formatPostedAt, loadRentalCatalogue, parseId } from "@/lib/flats"
import { formatMnt } from "@/lib/rent-price"

export default function FlatPage({ params }: PageProps<"/flats/[id]">) {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <Link href="/" className="text-sm font-semibold text-emerald-800 hover:text-emerald-950">← Бүх түрээсийн байр</Link>
        <Suspense fallback={<DetailSkeleton />}>
          {params.then(({ id }) => <FlatDetail id={id} />)}
        </Suspense>
      </div>
    </main>
  )
}

async function FlatDetail({ id }: { id: string }) {
  const flatId = parseId(id)
  if (flatId === null) notFound()
  // Listings change as they are ingested; always read them at request time.
  await connection()

  const [{ flats, listingFairPrices, hiddenListingIds }, allListings] = await Promise.all([loadRentalCatalogue(), getFlatListings(flatId)])
  const listings = allListings.filter((listing) => !hiddenListingIds.has(listing.id))
  const flat = flats.find((item) => item.id === String(flatId))
  if (!flat) notFound()

  const images = splitGallery(listings[0]?.imageUrl ?? flat.image)
  // Only reviewed (active) prices are compared; needs_review prices are shown but not used.
  const validPrices = listings.flatMap((listing) => listing.status === "active" && listing.cleanPrice !== null ? [listing.cleanPrice] : [])
  const cheapest = validPrices.length ? Math.min(...validPrices) : null
  const priciest = validPrices.length ? Math.max(...validPrices) : null

  return (
    <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0">
        <Gallery images={images} title={flat.title} />

        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-700">{flat.district} дүүрэг · Түрээс</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{flat.title}</h1>
            <p className="mt-2 text-sm text-slate-500">{flat.address}</p>
          </div>
          <FairPriceBadge badge={flat.badge} size="lg" />
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-center">
          <div><dt className="text-xs text-slate-500">Өрөө</dt><dd className="mt-1 font-bold text-slate-900">{flat.rooms ?? "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Талбай</dt><dd className="mt-1 font-bold text-slate-900">{flat.area !== null ? `${flat.area} м²` : "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">м² үнэ</dt><dd className="mt-1 font-bold text-slate-900">{flat.pricePerM2 !== null ? formatMnt(flat.pricePerM2) : "Тохиролцоно"}</dd></div>
        </dl>

        <section className="mt-8" aria-labelledby="listings-heading">
          <h2 id="listings-heading" className="text-xl font-bold tracking-tight text-slate-900">Энэ байрны {listings.length} зар</h2>
          <p className="mt-1 text-sm text-slate-500">Нэг байрыг өөр өөр зараар, өөр үнээр тавьсан байна. Хамгийн хямд нь эхэндээ.</p>
          <ol className="mt-4 space-y-3">
            {listings.map((listing) => {
              const isValid = listing.status === "active" && listing.cleanPrice !== null
              const isCheapest = isValid && listing.cleanPrice === cheapest
              const difference = isValid && cheapest !== null ? listing.cleanPrice! - cheapest : null
              const fair = listingFairPrices.get(listing.id)
              return (
                <li key={listing.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${isCheapest ? "border-emerald-300 ring-1 ring-emerald-200" : "border-slate-200"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">Зар [{listing.id}]</span>
                        <span className="text-xs text-slate-500">{formatPostedAt(listing.createdAt)}</span>
                        {isCheapest && <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">Хамгийн хямд</span>}
                        {fair && <FairPriceBadge badge={fair.badge} />}
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{listing.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Зарын үнэ (эх бичвэр): “{listing.rawPrice ?? "—"}”{fair?.pricePerM2 ? ` · ${formatMnt(fair.pricePerM2)}/м²` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${isValid ? "text-slate-900" : "text-slate-400"}`}>{listing.cleanPrice !== null ? <>{formatMnt(listing.cleanPrice)}<span className="text-xs font-medium text-slate-500"> /сар</span></> : "Тохиролцоно"}</p>
                      {difference !== null && difference > 0 && <p className="text-xs font-semibold text-amber-700">+{formatMnt(difference)} илүү</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <Link href={`/listings/${listing.id}`} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700">
                      Зарын дэлгэрэнгүй →
                    </Link>
                  </div>
                </li>
              )
            })}
          </ol>
          
        </section>
      </div>

      <aside className="h-fit space-y-4 lg:sticky lg:top-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Хамгийн хямд үнэ</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{cheapest !== null ? formatMnt(cheapest) : "Тохиролцоно"}</p>
          {cheapest !== null ? <p className="text-sm text-slate-500">сард</p> : <p className="mt-1 text-sm text-slate-500">Үнийг зар тавигчтай тохиролцоно.</p>}
          {cheapest !== null && priciest !== null && priciest > cheapest && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Зарын үнэ {formatMnt(cheapest)} – {formatMnt(priciest)}. Хамгийн хямдыг сонговол сард <b>{formatMnt(priciest - cheapest)}</b> хэмнэнэ.
            </p>
          )}
        </div>
        <FairPriceCard flat={flat} />
      </aside>
    </div>
  )
}

function FairPriceCard({ flat }: { flat: Flat }) {
  const explanation = describeBadge(flat.badge, flat.priceDeviation, flat.sampleSize)
  if (flat.price === null) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Fair Price үнэлгээ</p>
        <p className="mt-2 text-sm text-slate-600">Үнэ нь тохиролцоно тул бусад байртай харьцуулаагүй.</p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Fair Price үнэлгээ</p>
        <FairPriceBadge badge={flat.badge} />
      </div>
      {explanation && <p className="mt-3 text-sm text-slate-600">Энэ байр {explanation}.</p>}
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        Медиан: {flat.district}, {flat.rooms} өрөө, түрээс, сүүлийн {WINDOW_DAYS} хоног:{" "}
        <b>{flat.benchmarkPerM2 !== null ? `${formatMnt(flat.benchmarkPerM2)}/м²` : `мэдээлэл хангалтгүй (${flat.sampleSize} зар)`}</b>
      </p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Энэ байр (хамгийн хямд зар)</dt><dd className="font-semibold text-slate-900">{flat.pricePerM2 !== null ? `${formatMnt(flat.pricePerM2)}/м²` : "Тохиролцоно"}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Харьцуулсан зар</dt><dd className="font-semibold text-slate-900">{flat.sampleSize}</dd></div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-slate-400">
        Ижил дүүрэг, өрөөний тоотой, сүүлийн {WINDOW_DAYS} хоногийн түрээсийн заруудын м² үнийн медиантай харьцуулна. Дүүргийн медианы 30%-иас доош м² үнэтэй зарыг хасна; {MIN_GROUP_SIZE}-аас цөөн зар байвал “Мэдээлэл хангалтгүй”. Badge нь зөвлөгөө биш, зөвхөн чиглэл.
      </p>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div aria-hidden="true" className="mt-5 grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200 sm:h-96" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
      </div>
      <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />
    </div>
  )
}

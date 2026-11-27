import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import type { Flat } from "@/components/types"
import FairPriceBadge, { BadgeExplanation, FairPriceMethod } from "@/components/FairPriceBadge"
import T from "@/components/T"
import { districtName } from "@/lib/i18n"
import { Gallery, splitGallery } from "@/components/ListingParts"
import { getFlatListings } from "@/lib/db"
import { WINDOW_DAYS } from "@/lib/fair-price"
import { formatPostedAt, loadRentalCatalogue, parseId } from "@/lib/flats"
import { formatMnt } from "@/lib/rent-price"
import TrendChart from "@/components/TrendChart"
import { loadMarketListings } from "@/lib/market"
import type { MarketListing } from "@/lib/market-stats"
import { median, priceTrend, trendUnit } from "@/lib/market-stats"
import PriceSpread from "@/components/PriceSpread"

export default function FlatPage({ params }: PageProps<"/flats/[id]">) {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <Link href="/" className="text-sm font-semibold text-emerald-800 hover:text-emerald-950">← <T mn="Бүх түрээсийн байр" en="All rental flats" /></Link>
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

  const [{ flats, listingFairPrices, hiddenListingIds }, allListings, market] = await Promise.all([loadRentalCatalogue(), getFlatListings(flatId), loadMarketListings()])
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
            <p className="text-sm font-semibold text-emerald-700"><T mn={`${flat.district} дүүрэг · Түрээс`} en={`${districtName(flat.district, "en")} district · For rent`} />{flat.ownerListing && <span className="ml-2 rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">★ <T mn="Эзэмшигчийн зар" en="Owner listing" /></span>}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{flat.title}</h1>
            <p className="mt-2 text-sm text-slate-500">{flat.address}</p>
          </div>
          <FairPriceBadge badge={flat.badge} size="lg" />
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-center">
          <div><dt className="text-xs text-slate-500"><T mn="Өрөө" en="Rooms" /></dt><dd className="mt-1 font-bold text-slate-900">{flat.rooms ?? "—"}</dd></div>
          <div><dt className="text-xs text-slate-500"><T mn="Талбай" en="Area" /></dt><dd className="mt-1 font-bold text-slate-900">{flat.area !== null ? `${flat.area} м²` : "—"}</dd></div>
          <div><dt className="text-xs text-slate-500"><T mn="м² үнэ" en="Price per m²" /></dt><dd className="mt-1 font-bold text-slate-900">{flat.pricePerM2 !== null ? formatMnt(flat.pricePerM2) : <T mn="Тохиролцоно" en="On request" />}</dd></div>
        </dl>

        <section className="mt-8" aria-labelledby="listings-heading">
          <h2 id="listings-heading" className="text-xl font-bold tracking-tight text-slate-900"><T mn={`Энэ байрны ${listings.length} зар`} en={`${listings.length} listing${listings.length === 1 ? "" : "s"} for this flat`} /></h2>
          {listings.length > 1 && <p className="mt-1 text-sm text-slate-500"><T mn="Нэг байрыг өөр өөр зараар, өөр үнээр тавьсан байна. Хамгийн хямд нь эхэндээ." en="This flat is listed in several ads at different prices. The cheapest comes first." /></p>}
          <ol className="mt-4 space-y-3">
            {listings.map((listing) => {
              const isValid = listing.status === "active" && listing.cleanPrice !== null
              const isCheapest = listings.length > 1 && isValid && listing.cleanPrice === cheapest
              const difference = isValid && cheapest !== null ? listing.cleanPrice! - cheapest : null
              const fair = listingFairPrices.get(listing.id)
              return (
                <li key={listing.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${isCheapest ? "border-emerald-300 ring-1 ring-emerald-200" : "border-slate-200"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold text-white"><T mn="Зар" en="Ad" /> [{listing.id}]</span>
                        <span className="text-xs text-slate-500"><T mn={formatPostedAt(listing.createdAt)} en={formatPostedAt(listing.createdAt, "en")} /></span>
                        {isCheapest && <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white"><T mn="Хамгийн хямд" en="Cheapest" /></span>}
                        {fair && <FairPriceBadge badge={fair.badge} />}
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{listing.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        <T mn="Зарын үнэ (эх бичвэр):" en="Price as written:" /> “{listing.rawPrice ?? "—"}”{fair?.pricePerM2 ? ` · ${formatMnt(fair.pricePerM2)}/м²` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${isValid ? "text-slate-900" : "text-slate-400"}`}>{listing.cleanPrice !== null ? <>{formatMnt(listing.cleanPrice)}<span className="text-xs font-medium text-slate-500"> /<T mn="сар" en="mo" /></span></> : <T mn="Тохиролцоно" en="On request" />}</p>
                      {listing.previousPrice !== null && listing.cleanPrice !== null && listing.previousPrice > listing.cleanPrice && (
                        <p className="text-xs font-semibold text-rose-700">↓ <T mn="Үнэ буурсан" en="Price dropped" /> · <s className="font-normal">{formatMnt(listing.previousPrice)}</s></p>
                      )}
                      {difference !== null && difference > 0 && <p className="text-xs font-semibold text-amber-700">+{formatMnt(difference)} <T mn="илүү" en="more" /></p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <Link href={`/listings/${listing.id}`} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700">
                      <T mn="Зарын дэлгэрэнгүй →" en="Ad details →" />
                    </Link>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        <MarketComparison flat={flat} market={market} />
      </div>

      <aside className="h-fit space-y-4 lg:sticky lg:top-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500"><T mn="Хамгийн хямд үнэ" en="Lowest price" /></p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{cheapest !== null ? formatMnt(cheapest) : <T mn="Тохиролцоно" en="On request" />}</p>
          {cheapest !== null ? <p className="text-sm text-slate-500"><T mn="сард" en="per month" /></p> : <p className="mt-1 text-sm text-slate-500"><T mn="Үнийг зар тавигчтай тохиролцоно." en="Agree the price with the advertiser." /></p>}
          {flat.previousPrice !== null && flat.price !== null && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
              <b>↓ <T mn="Үнэ буурсан:" en="Price dropped:" /></b> <s>{formatMnt(flat.previousPrice)}</s> → {formatMnt(flat.price)} ({Math.round((1 - flat.price / flat.previousPrice) * 100)}% <T mn="хямдарсан" en="cheaper" />)
            </p>
          )}
          {cheapest !== null && priciest !== null && priciest > cheapest && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <T mn={<>Зарын үнэ {formatMnt(cheapest)} – {formatMnt(priciest)}. Хамгийн хямдыг сонговол сард <b>{formatMnt(priciest - cheapest)}</b> хэмнэнэ.</>} en={<>Ad prices {formatMnt(cheapest)} – {formatMnt(priciest)}. Picking the cheapest saves <b>{formatMnt(priciest - cheapest)}</b> a month.</>} />
            </p>
          )}
        </div>
        <FairPriceCard flat={flat} />
      </aside>
    </div>
  )
}

/** This flat against comparable listings: ₮/m² spread now, and the median over time. */
function MarketComparison({ flat, market }: { flat: Flat; market: MarketListing[] }) {
  const sameRooms = market.filter((item) => item.district === flat.district && item.rooms === flat.rooms)
  const group = sameRooms.length >= 5 || flat.rooms === null ? sameRooms : market.filter((item) => item.district === flat.district)
  const byRooms = group === sameRooms && flat.rooms !== null
  const groupLabel = byRooms ? `${flat.district}, ${flat.rooms} өрөө` : `${flat.district}, бүх өрөө`
  const groupLabelEn = byRooms ? `${districtName(flat.district, "en")}, ${flat.rooms} room${flat.rooms === 1 ? "" : "s"}` : `${districtName(flat.district, "en")}, all rooms`
  const unit = trendUnit(market)
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="trend-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="trend-heading" className="text-lg font-bold tracking-tight text-slate-900"><T mn="Зах зээлтэй харьцуулахад" en="Compared with the market" /></h2>
        <Link href={`/market?district=${encodeURIComponent(flat.district)}${flat.rooms ? `&rooms=${flat.rooms}` : ""}`} className="text-sm font-semibold text-emerald-800 hover:text-emerald-950"><T mn="Зах зээлийн тойм →" en="Market overview →" /></Link>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-800"><T mn={`₮/м² тархалт: ${groupLabel}`} en={`₮/m² spread: ${groupLabelEn}`} /></h3>
      <div className="mt-2">
        <PriceSpread
          title={`${groupLabel} заруудын ₮/м²`}
          values={group.map((item) => ({ id: item.id, perM2: item.perM2 }))}
          median={median(group.map((item) => item.perM2))}
          highlight={flat.pricePerM2 !== null ? { label: `Энэ байр ${Math.round(flat.pricePerM2 / 1000)}k`, labelEn: `This flat ${Math.round(flat.pricePerM2 / 1000)}k`, perM2: flat.pricePerM2 } : undefined}
        />
      </div>
      <h3 className="mt-5 text-sm font-semibold text-slate-800"><T mn={`Медиан ₮/м² — ${unit === "day" ? "өдөр" : "7 хоног"} бүрээр`} en={`Median ₮/m² — by ${unit === "day" ? "day" : "week"}`} /></h3>
      <div className="mt-2">
        <TrendChart
          unit={unit}
          metric="medianPerM2"
          title={`${flat.district} дүүргийн медиан ₮/м²`}
          series={[
            { label: groupLabel, labelEn: groupLabelEn, color: "#059669", points: priceTrend(group, {}, unit) },
            ...(group === sameRooms && flat.rooms !== null
              ? [{ label: `${flat.district}, бүх өрөө`, labelEn: `${districtName(flat.district, "en")}, all rooms`, color: "#94a3b8", points: priceTrend(market, { district: flat.district }, unit) }]
              : [{ label: "Улаанбаатар", labelEn: "Ulaanbaatar", color: "#cbd5e1", points: priceTrend(market, {}, unit) }]),
          ]}
          reference={flat.pricePerM2 !== null ? { label: `Энэ байр ${formatMnt(flat.pricePerM2)}/м²`, labelEn: `This flat ${formatMnt(flat.pricePerM2)}/m²`, value: flat.pricePerM2 } : undefined}
        />
      </div>
    </section>
  )
}

function FairPriceCard({ flat }: { flat: Flat }) {
  if (flat.price === null) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900"><T mn="Fair Price үнэлгээ" en="Fair Price check" /></p>
        <p className="mt-2 text-sm text-slate-600"><T mn="Үнэ нь тохиролцоно тул бусад байртай харьцуулаагүй." en="The price is on request, so it was not compared with other flats." /></p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900"><T mn="Fair Price үнэлгээ" en="Fair Price check" /></p>
        <FairPriceBadge badge={flat.badge} />
      </div>
      <BadgeExplanation badge={flat.badge} deviation={flat.priceDeviation} sampleSize={flat.sampleSize} />
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <T mn={`Медиан: ${flat.district}, ${flat.rooms} өрөө, түрээс, сүүлийн ${WINDOW_DAYS} хоног:`} en={`Median: ${districtName(flat.district, "en")}, ${flat.rooms} rooms, rent, last ${WINDOW_DAYS} days:`} />{" "}
        <b>{flat.benchmarkPerM2 !== null ? `${formatMnt(flat.benchmarkPerM2)}/м²` : <T mn={`мэдээлэл хангалтгүй (${flat.sampleSize} зар)`} en={`not enough data (${flat.sampleSize} listings)`} />}</b>
      </p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-slate-500"><T mn="Энэ байр (хамгийн хямд зар)" en="This flat (cheapest ad)" /></dt><dd className="font-semibold text-slate-900">{flat.pricePerM2 !== null ? `${formatMnt(flat.pricePerM2)}/м²` : <T mn="Тохиролцоно" en="On request" />}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500"><T mn="Харьцуулсан зар" en="Listings compared" /></dt><dd className="font-semibold text-slate-900">{flat.sampleSize}</dd></div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-slate-400">
        <FairPriceMethod />
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

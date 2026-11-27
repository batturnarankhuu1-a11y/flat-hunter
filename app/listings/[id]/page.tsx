import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import FairPriceBadge, { BadgeDescription } from "@/components/FairPriceBadge"
import T from "@/components/T"
import { districtName } from "@/lib/i18n"
import { Gallery, splitGallery } from "@/components/ListingParts"
import { getFlatListings, getListing } from "@/lib/db"
import { WINDOW_DAYS } from "@/lib/fair-price"
import { formatPostedAt, loadRentalCatalogue, parseId } from "@/lib/flats"
import { stripPhoneNumbers } from "@/lib/privacy"
import { formatMnt } from "@/lib/rent-price"

export default function ListingPage({ params }: PageProps<"/listings/[id]">) {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <Suspense fallback={<div aria-hidden="true" className="mt-5 h-96 animate-pulse rounded-2xl bg-slate-200" />}>
          {params.then(({ id }) => <ListingDetail id={id} />)}
        </Suspense>
      </div>
    </main>
  )
}

async function ListingDetail({ id }: { id: string }) {
  const listingId = parseId(id)
  if (listingId === null) notFound()
  await connection()

  const listing = await getListing(listingId)
  if (!listing) notFound()

  const [{ flats, listingFairPrices, hiddenListingIds }, allSiblings] = await Promise.all([
    loadRentalCatalogue(),
    listing.flatId !== null ? getFlatListings(listing.flatId) : Promise.resolve([]),
  ])
  // Outlier (bait-price) ads are kept for the admin only.
  if (hiddenListingIds.has(listing.id)) notFound()
  const siblings = allSiblings.filter((sibling) => !hiddenListingIds.has(sibling.id))
  const flat = flats.find((item) => item.id === String(listing.flatId))
  const comparison = siblings.length ? siblings : [listing]
  const isValid = listing.status === "active" && listing.cleanPrice !== null
  const fair = listingFairPrices.get(listing.id)
  const validPrices = comparison.flatMap((item) => item.status === "active" && item.cleanPrice !== null ? [item.cleanPrice] : [])
  const cheapest = validPrices.length ? Math.min(...validPrices) : null
  const priciest = validPrices.length ? Math.max(...validPrices) : null

  return (
    <>
      <nav className="flex flex-wrap gap-x-2 text-sm font-semibold text-emerald-800">
        <Link href="/" className="hover:text-emerald-950"><T mn="Бүх түрээсийн байр" en="All rental flats" /></Link>
        {flat && <><span className="text-slate-300">/</span><Link href={`/flats/${flat.id}`} className="hover:text-emerald-950"><T mn="Байрны бүх зар" en="All ads for this flat" /></Link></>}
      </nav>
      <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <Gallery images={splitGallery(listing.imageUrl)} title={listing.title} />
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold text-white"><T mn="Зар" en="Ad" /> [{listing.id}]</span>
            <span className="text-sm font-semibold text-emerald-700"><T mn={`${listing.district ?? ""} дүүрэг · Түрээс`} en={`${districtName(listing.district, "en")} district · For rent`} /></span>
            {listing.source === "user" && <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">★ <T mn="Эзэмшигчийн зар" en="Owner listing" /></span>}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{listing.title}</h1>
          {listing.address && <p className="mt-2 text-sm text-slate-500">{listing.address}</p>}
          {(listing.paymentTerms || listing.furnished !== null) && (
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {listing.paymentTerms && <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700"><T mn="Төлбөрийн нөхцөл:" en="Payment terms:" /> <b>{listing.paymentTerms}</b></span>}
              {listing.furnished !== null && <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700">{listing.furnished ? <T mn="Тавилгатай" en="Furnished" /> : <T mn="Тавилгагүй" en="Unfurnished" />}</span>}
            </div>
          )}

          {/* What Flat Hunter adds on top of the original ad */}
          <section aria-labelledby="analysis-heading" className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
            <h2 id="analysis-heading" className="font-semibold text-emerald-950">✦ <T mn="Flat Hunter-ийн дүн шинжилгээ" en="Flat Hunter analysis" /></h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800/80"><T mn="Цэвэрлэсэн үнэ" en="Cleaned price" /></dt>
                <dd className="mt-1 text-sm text-slate-700">
                  “{listing.rawPrice ?? "—"}” →{" "}
                  <b className={`text-lg ${isValid ? "text-slate-900" : "text-slate-400"}`}>{listing.cleanPrice !== null ? <>{formatMnt(listing.cleanPrice)}/<T mn="сар" en="mo" /></> : <T mn="тохиролцоно" en="on request" />}</b>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800/80"><T mn="1 м²-ийн үнэ" en="Price per m²" /></dt>
                <dd className="mt-1 text-lg font-bold text-slate-900">
                  {fair?.pricePerM2 ? `${formatMnt(fair.pricePerM2)}/м²` : <T mn="тохиролцоно" en="on request" />}
                  <span className="ml-2 text-xs font-normal text-slate-500">{listing.rooms ?? "?"} <T mn="өрөө" en={listing.rooms === 1 ? "room" : "rooms"} /> · {listing.area ?? "?"} м²</span>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800/80">Fair Price</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <FairPriceBadge badge={fair?.badge ?? "missing"} size="lg" />
                  {fair && <span><BadgeDescription badge={fair.badge} deviation={fair.deviation} sampleSize={fair.sampleSize} /></span>}
                </dd>
                <dd className="mt-1 text-xs text-slate-500">
                  <T mn={`Медиан: ${listing.district ?? ""}, ${listing.rooms ?? "?"} өрөө, түрээс, сүүлийн ${WINDOW_DAYS} хоног:`} en={`Median: ${districtName(listing.district, "en")}, ${listing.rooms ?? "?"} rooms, rent, last ${WINDOW_DAYS} days:`} />{" "}
                  {fair?.benchmarkPerM2 ? `${formatMnt(fair.benchmarkPerM2)}/м²` : <T mn={`мэдээлэл хангалтгүй (${fair?.sampleSize ?? 0} зар)`} en={`not enough data (${fair?.sampleSize ?? 0} listings)`} />}
                </dd>
              </div>
              {comparison.length > 1 && cheapest !== null && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800/80"><T mn="Давхардсан зар" en="Duplicate ads" /></dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    <T mn={<>Энэ байрыг <b>{comparison.length}</b> өөр зараар тавьсныг нэг байр болгон нэгтгэлээ.</>} en={<>This flat was listed in <b>{comparison.length}</b> different ads; we merged them into one flat.</>} />{" "}
                    {isValid && listing.cleanPrice === cheapest
                      ? <T mn="Энэ зар хамгийн хямд нь." en="This ad is the cheapest." />
                      : <T
                          mn={<>Хамгийн хямд нь <b>{formatMnt(cheapest)}</b>/сар{isValid && listing.cleanPrice! > cheapest ? <> — энэ зараас сард <b>{formatMnt(listing.cleanPrice! - cheapest)}</b> хямд</> : null}.</>}
                          en={<>The cheapest is <b>{formatMnt(cheapest)}</b>/mo{isValid && listing.cleanPrice! > cheapest ? <> — <b>{formatMnt(listing.cleanPrice! - cheapest)}</b> a month less than this ad</> : null}.</>} />}
                    {priciest !== null && priciest > cheapest && <> <T mn="Үнийн зөрүү:" en="Price range:" /> {formatMnt(cheapest)} – {formatMnt(priciest)}.</>}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Every ad of the same flat, side by side */}
          {comparison.length > 1 && (
            <section aria-labelledby="compare-heading" className="mt-6">
              <h2 id="compare-heading" className="font-semibold text-slate-900"><T mn="Энэ байрны өөр зар — харьцуулалт" en="Other ads for this flat — comparison" /></h2>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold"><T mn="Зар" en="Ad" /></th>
                      <th className="px-4 py-2 font-semibold"><T mn="Зарын үнэ (эх бичвэр)" en="Price as written" /></th>
                      <th className="px-4 py-2 font-semibold"><T mn="Цэвэрлэсэн үнэ" en="Cleaned price" /></th>
                      <th className="px-4 py-2 font-semibold">1 м²</th>
                      <th className="px-4 py-2 font-semibold">Fair Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {comparison.map((item) => {
                      const itemFair = listingFairPrices.get(item.id)
                      const current = item.id === listing.id
                      const valid = item.status === "active" && item.cleanPrice !== null
                      return (
                        <tr key={item.id} className={current ? "bg-emerald-50/70" : undefined}>
                          <td className="px-4 py-2 font-semibold">
                            {current
                              ? <span>[{item.id}] <span className="text-xs font-normal text-emerald-700"><T mn="энэ зар" en="this ad" /></span></span>
                              : <Link href={`/listings/${item.id}`} className="text-emerald-800 underline-offset-2 hover:underline">[{item.id}]</Link>}
                          </td>
                          <td className="px-4 py-2 text-slate-500">“{item.rawPrice ?? "—"}”</td>
                          <td className={`px-4 py-2 font-semibold ${valid ? "text-slate-900" : "text-slate-400"}`}>
                            {item.cleanPrice !== null ? formatMnt(item.cleanPrice) : <T mn="тохиролцоно" en="on request" />}
                            {valid && item.cleanPrice === cheapest && <span className="ml-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white"><T mn="хямд" en="cheapest" /></span>}
                          </td>
                          <td className="px-4 py-2 text-slate-700">{itemFair?.pricePerM2 ? formatMnt(itemFair.pricePerM2) : <T mn="тохиролцоно" en="on request" />}</td>
                          <td className="px-4 py-2">{itemFair ? <FairPriceBadge badge={itemFair.badge} /> : <span className="text-xs text-slate-400">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {listing.rawDescription && (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900"><T mn="Зарын тайлбар" en="Description" /></h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{stripPhoneNumbers(listing.rawDescription)}</p>
            </section>
          )}

        </div>

        <aside className="h-fit space-y-4 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500"><T mn="Сарын түрээс" en="Monthly rent" /></p>
            <p className={`mt-1 text-3xl font-bold tracking-tight ${isValid ? "text-slate-900" : "text-slate-400"}`}>{listing.cleanPrice !== null ? formatMnt(listing.cleanPrice) : <T mn="Тохиролцоно" en="On request" />}</p>
            <p className="mt-1 text-xs text-slate-500"><T mn={`Нийтэлсэн: ${formatPostedAt(listing.createdAt)}`} en={`Posted: ${formatPostedAt(listing.createdAt, "en")}`} /></p>
            <div className="mt-4 flex flex-col gap-2">
              {flat && (
                <Link href={`/flats/${flat.id}`} className="rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-emerald-700">
                  <T mn={`Байрны бүх ${comparison.length} зарыг харах →`} en={`See all ${comparison.length} ads for this flat →`} />
                </Link>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

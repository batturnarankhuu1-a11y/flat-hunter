import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import AdminListingActions from "@/components/AdminListingActions"
import T, { DistrictName } from "@/components/T"
import { adminAccess, getAdminListings, getListingsById, getMultiListingFlats, getOwnerListings, type AdminListing } from "@/lib/admin"
import { loadRentalCatalogue } from "@/lib/flats"
import { formatMnt, parseRentPrice } from "@/lib/rent-price"

export const metadata: Metadata = { title: "Админ — Flat Hunter" }

export default function AdminPage() {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"><T mn="Хяналт" en="Moderation" /></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"><T mn="Админ: шалгах зар ба давхардал" en="Admin: listings to review and duplicates" /></h1>
        <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-slate-200" />}>
          <Admin />
        </Suspense>
      </div>
    </main>
  )
}

const STATUS_LABEL: Record<string, string> = { active: "Идэвхтэй", needs_review: "Шалгах", inactive: "Нуусан" }
const STATUS_LABEL_EN: Record<string, string> = { active: "Active", needs_review: "Review", inactive: "Hidden" }
const STATUS_STYLE: Record<string, string> = { active: "bg-emerald-100 text-emerald-800", needs_review: "bg-amber-100 text-amber-900", inactive: "bg-slate-200 text-slate-700" }

async function Admin() {
  await connection()
  const access = await adminAccess()
  if (!access.allowed) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        <T mn={access.reason} en={access.reasonEn} /> {!access.userId && <Link href="/sign-in" className="font-semibold text-emerald-800 underline"><T mn="Нэвтрэх" en="Sign in" /></Link>}
      </div>
    )
  }
  const [review, catalogue, multi, owners] = await Promise.all([getAdminListings(["needs_review", "inactive"]), loadRentalCatalogue(), getMultiListingFlats(), getOwnerListings()])
  const outliers = await getListingsById([...catalogue.hiddenListingIds])
  const needsReview = review.filter((listing) => listing.status === "needs_review")
  const hidden = review.filter((listing) => listing.status === "inactive")

  return (
    <>
      {access.devOpen && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <T mn="Хөгжүүлэлтийн горим: ADMIN_EMAILS / ADMIN_USER_IDS тохируулаагүй тул нэвтэрсэн хэн ч админ. Production-д заавал тохируулна уу." en="Development mode: ADMIN_EMAILS / ADMIN_USER_IDS are not set, so any signed-in user is an admin. Be sure to set them in production." />
        </p>
      )}
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["Нийтэд харагдах байр", "Public flats", catalogue.flats.length],
          ["Шалгах (needs_review)", "To review (needs_review)", needsReview.length],
          ["Хэт доогуур үнэ (outlier)", "Unusually low price (outlier)", outliers.length],
          ["Олон зартай байр", "Flats with several listings", multi.length],
        ] as const).map(([label, labelEn, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <dt className="text-xs text-slate-500"><T mn={label} en={labelEn} /></dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      <Section title={<T mn="Шалгах зарууд (needs_review)" en="Listings to review (needs_review)" />} note={<T mn="Үнэ 1–20 сая ₮-ийн гадна. Зөв үнийг оруулж батлах, эсвэл нуух." en="Price outside 1–20M ₮. Enter the correct price and approve, or hide." />}>
        {needsReview.length === 0 ? <Empty /> : needsReview.map((listing) => (
          <Row key={listing.id} listing={listing}>
            <AdminListingActions id={listing.id} status={listing.status ?? "needs_review"} needsPrice={listing.cleanPrice !== null && parseRentPrice(listing.cleanPrice).status !== "valid"} />
          </Row>
        ))}
      </Section>

      <Section title={<T mn="Эзэмшигчийн зарууд" en="Owner listings" />} note={<T mn="Хэрэглэгчид өөрсдөө нэмсэн зарууд (сүүлийн 50). Зохисгүй бол нуух." en="Listings posted by users themselves (latest 50). Hide anything inappropriate." />}>
        {owners.length === 0 ? <Empty /> : owners.map((listing) => (
          <Row key={listing.id} listing={listing}>
            <AdminListingActions id={listing.id} status={listing.status ?? "active"} needsPrice={listing.cleanPrice !== null && parseRentPrice(listing.cleanPrice).status !== "valid"} />
          </Row>
        ))}
      </Section>

      <Section title={<T mn="Хэт доогуур үнэтэй зарууд (outlier)" en="Unusually low prices (outlier)" />} note={<T mn="м² үнэ нь дүүргийн медианы 30%-иас доош — нийтэд автоматаар нуугдсан. Шалгаад нуух." en="Price per m² is below 30% of the district median — hidden from the public automatically. Check and hide." />}>
        {outliers.length === 0 ? <Empty /> : outliers.map((listing) => (
          <Row key={listing.id} listing={listing}>
            <AdminListingActions id={listing.id} status={listing.status ?? "active"} />
          </Row>
        ))}
      </Section>

      <Section title={<T mn="Давхардал: олон зартай байрууд" en="Duplicates: flats with several listings" />} note={<T mn="Нэг байрыг олон удаа тавьсан зарууд нэгтгэгдсэн. Буруу нэгтгэсэн бол “Тусдаа байр болгох”, давхар зарыг “Нуух”." en="Listings posting the same flat several times are merged. If merged wrongly use “Split into own flat”; hide duplicate listings with “Hide”." />}>
        {multi.length === 0 ? <Empty /> : multi.map((flat) => (
          <div key={flat.id} className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">
              <Link href={`/flats/${flat.id}`} className="hover:text-emerald-800"><T mn="Байр" en="Flat" /> #{flat.id}</Link>
              <span className="font-normal text-slate-500"> · <DistrictName name={flat.district} />, {flat.rooms ?? "?"} <T mn="өрөө" en="rooms" />{flat.area ? `, ${Number(flat.area)} m²` : ""}{flat.address ? ` · ${flat.address}` : ""} · {flat.listings.length} <T mn="зар" en="listings" /></span>
            </p>
            <div className="mt-2 divide-y divide-slate-100">
              {flat.listings.map((listing) => (
                <Row key={listing.id} listing={listing} compact>
                  <AdminListingActions id={listing.id} status={listing.status ?? "active"} canSplit={flat.listings.length > 1} />
                </Row>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title={<T mn="Нуусан зарууд" en="Hidden listings" />} note={<T mn="Нийтэд харагдахгүй. Сэргээвэл үнээрээ идэвхтэй эсвэл шалгах төлөвт орно." en="Not shown to the public. Restoring sets it to active or review depending on its price." />}>
        {hidden.length === 0 ? <Empty /> : hidden.map((listing) => (
          <Row key={listing.id} listing={listing}>
            <AdminListingActions id={listing.id} status="inactive" />
          </Row>
        ))}
      </Section>
    </>
  )
}

function Section({ title, note, children }: { title: React.ReactNode; note: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-500">{note}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

const Empty = () => <p className="text-sm text-slate-500"><T mn="Одоогоор алга." en="Nothing here right now." /></p>

function Row({ listing, compact = false, children }: { listing: AdminListing; compact?: boolean; children: React.ReactNode }) {
  const status = listing.status ?? "active"
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${compact ? "py-2" : "rounded-xl bg-slate-50 p-3"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-slate-900 px-1.5 py-0.5 font-bold text-white"><T mn="Зар" en="Listing" /> [{listing.id}]</span>
          <span className={`rounded px-1.5 py-0.5 font-semibold ${STATUS_STYLE[status] ?? "bg-slate-100"}`}><T mn={STATUS_LABEL[status] ?? status} en={STATUS_LABEL_EN[status] ?? status} /></span>
          {listing.flatId && <Link href={`/flats/${listing.flatId}`} className="text-slate-500 hover:text-emerald-800"><T mn="байр" en="flat" /> #{listing.flatId}</Link>}
        </div>
        <p className="mt-1 truncate text-sm text-slate-800">{listing.title}</p>
        <p className="text-xs text-slate-500">
          <T mn="Эх үнэ" en="Original price" />: “{listing.rawPrice ?? "—"}” → {listing.cleanPrice !== null ? formatMnt(listing.cleanPrice) : <T mn="тохиролцоно" en="negotiable" />}
          {listing.area ? ` · ${Number(listing.area)} m²` : ""}{listing.rooms ? <> · {listing.rooms} <T mn="өрөө" en="rooms" /></> : ""}
        </p>
      </div>
      {children}
    </div>
  )
}

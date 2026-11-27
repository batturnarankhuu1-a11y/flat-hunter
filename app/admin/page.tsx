import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import AdminListingActions from "@/components/AdminListingActions"
import { adminAccess, getAdminListings, getListingsById, getMultiListingFlats, getOwnerListings, type AdminListing } from "@/lib/admin"
import { loadRentalCatalogue } from "@/lib/flats"
import { formatMnt, parseRentPrice } from "@/lib/rent-price"

export const metadata: Metadata = { title: "Админ — Flat Hunter" }

export default function AdminPage() {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Хяналт</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Админ: шалгах зар ба давхардал</h1>
        <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-slate-200" />}>
          <Admin />
        </Suspense>
      </div>
    </main>
  )
}

const STATUS_LABEL: Record<string, string> = { active: "Идэвхтэй", needs_review: "Шалгах", inactive: "Нуусан" }
const STATUS_STYLE: Record<string, string> = { active: "bg-emerald-100 text-emerald-800", needs_review: "bg-amber-100 text-amber-900", inactive: "bg-slate-200 text-slate-700" }

async function Admin() {
  await connection()
  const access = await adminAccess()
  if (!access.allowed) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        {access.reason} {!access.userId && <Link href="/sign-in" className="font-semibold text-emerald-800 underline">Нэвтрэх</Link>}
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
          Хөгжүүлэлтийн горим: ADMIN_EMAILS / ADMIN_USER_IDS тохируулаагүй тул нэвтэрсэн хэн ч админ. Production-д заавал тохируулна уу.
        </p>
      )}
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Нийтэд харагдах байр", catalogue.flats.length],
          ["Шалгах (needs_review)", needsReview.length],
          ["Хэт доогуур үнэ (outlier)", outliers.length],
          ["Олон зартай байр", multi.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      <Section title="Шалгах зарууд (needs_review)" note="Үнэ 1–20 сая ₮-ийн гадна. Зөв үнийг оруулж батлах, эсвэл нуух.">
        {needsReview.length === 0 ? <Empty /> : needsReview.map((listing) => (
          <Row key={listing.id} listing={listing}>
            <AdminListingActions id={listing.id} status={listing.status ?? "needs_review"} needsPrice={listing.cleanPrice !== null && parseRentPrice(listing.cleanPrice).status !== "valid"} />
          </Row>
        ))}
      </Section>

      <Section title="Эзэмшигчийн зарууд" note="Хэрэглэгчид өөрсдөө нэмсэн зарууд (сүүлийн 50). Зохисгүй бол нуух.">
        {owners.length === 0 ? <Empty /> : owners.map((listing) => (
          <Row key={listing.id} listing={listing}>
            <AdminListingActions id={listing.id} status={listing.status ?? "active"} needsPrice={listing.cleanPrice !== null && parseRentPrice(listing.cleanPrice).status !== "valid"} />
          </Row>
        ))}
      </Section>

      <Section title="Хэт доогуур үнэтэй зарууд (outlier)" note="м² үнэ нь дүүргийн медианы 30%-иас доош — нийтэд автоматаар нуугдсан. Шалгаад нуух.">
        {outliers.length === 0 ? <Empty /> : outliers.map((listing) => (
          <Row key={listing.id} listing={listing}>
            <AdminListingActions id={listing.id} status={listing.status ?? "active"} />
          </Row>
        ))}
      </Section>

      <Section title="Давхардал: олон зартай байрууд" note="Нэг байрыг олон удаа тавьсан зарууд нэгтгэгдсэн. Буруу нэгтгэсэн бол “Тусдаа байр болгох”, давхар зарыг “Нуух”.">
        {multi.length === 0 ? <Empty /> : multi.map((flat) => (
          <div key={flat.id} className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">
              <Link href={`/flats/${flat.id}`} className="hover:text-emerald-800">Байр #{flat.id}</Link>
              <span className="font-normal text-slate-500"> · {flat.district}, {flat.rooms ?? "?"} өрөө{flat.area ? `, ${Number(flat.area)} м²` : ""}{flat.address ? ` · ${flat.address}` : ""} · {flat.listings.length} зар</span>
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

      <Section title="Нуусан зарууд" note="Нийтэд харагдахгүй. Сэргээвэл үнээрээ идэвхтэй эсвэл шалгах төлөвт орно.">
        {hidden.length === 0 ? <Empty /> : hidden.map((listing) => (
          <Row key={listing.id} listing={listing}>
            <AdminListingActions id={listing.id} status="inactive" />
          </Row>
        ))}
      </Section>
    </>
  )
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-500">{note}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

const Empty = () => <p className="text-sm text-slate-500">Одоогоор алга.</p>

function Row({ listing, compact = false, children }: { listing: AdminListing; compact?: boolean; children: React.ReactNode }) {
  const status = listing.status ?? "active"
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${compact ? "py-2" : "rounded-xl bg-slate-50 p-3"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-slate-900 px-1.5 py-0.5 font-bold text-white">Зар [{listing.id}]</span>
          <span className={`rounded px-1.5 py-0.5 font-semibold ${STATUS_STYLE[status] ?? "bg-slate-100"}`}>{STATUS_LABEL[status] ?? status}</span>
          {listing.flatId && <Link href={`/flats/${listing.flatId}`} className="text-slate-500 hover:text-emerald-800">байр #{listing.flatId}</Link>}
        </div>
        <p className="mt-1 truncate text-sm text-slate-800">{listing.title}</p>
        <p className="text-xs text-slate-500">
          Эх үнэ: “{listing.rawPrice ?? "—"}” → {listing.cleanPrice !== null ? formatMnt(listing.cleanPrice) : "тохиролцоно"}
          {listing.area ? ` · ${Number(listing.area)} м²` : ""}{listing.rooms ? ` · ${listing.rooms} өрөө` : ""}
        </p>
      </div>
      {children}
    </div>
  )
}

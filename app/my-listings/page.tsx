import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { auth } from "@clerk/nextjs/server"
import MyListingActions from "@/components/MyListingActions"
import T, { DistrictName } from "@/components/T"
import { ensureSchema, getDb } from "@/lib/db"
import { formatPostedAt } from "@/lib/flats"
import { listOwnerListings } from "@/lib/owner-listings"
import { formatMnt } from "@/lib/rent-price"

export const metadata: Metadata = { title: "Миний зарууд — Flat Hunter" }

const STATUS: Record<string, { label: string; labelEn: string; style: string }> = {
  active: { label: "Нийтлэгдсэн", labelEn: "Published", style: "bg-emerald-100 text-emerald-800" },
  needs_review: { label: "Админ шалгаж байна", labelEn: "Admin is reviewing", style: "bg-amber-100 text-amber-900" },
  inactive: { label: "Нуусан", labelEn: "Hidden", style: "bg-slate-200 text-slate-700" },
}
const dateEn = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" })

export default function MyListingsPage() {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"><T mn="Эзэмшигчдэд" en="For owners" /></p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"><T mn="Миний зарууд" en="My listings" /></h1>
          </div>
          <Link href="/post" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"><T mn="＋ Зар нэмэх" en="＋ Post a listing" /></Link>
        </div>
        <Suspense fallback={<div className="mt-6 h-48 animate-pulse rounded-2xl bg-slate-200" />}>
          <Mine />
        </Suspense>
      </div>
    </main>
  )
}

async function Mine() {
  // Per-user data from the database: always render at request time, never prerender.
  await connection()
  const { userId } = await auth()
  if (!userId) {
    return <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700"><T mn="Зараа харахын тулд нэвтэрнэ үү." en="Please sign in to see your listings." /> <Link href="/sign-in?redirect_url=/my-listings" className="font-semibold text-emerald-800 underline"><T mn="Нэвтрэх" en="Sign in" /></Link></div>
  }
  await ensureSchema()
  const mine = await listOwnerListings(getDb(), userId)
  if (mine.length === 0) {
    return <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700"><T mn="Одоогоор зар алга." en="No listings yet." /> <Link href="/post" className="font-semibold text-emerald-800 underline"><T mn="Эхний зараа нэмээрэй" en="Post your first listing" /></Link>.</div>
  }
  return (
    <ul className="mt-6 space-y-3">
      {mine.map((listing) => {
        const status = STATUS[listing.status ?? "active"] ?? STATUS.active
        const cover = (listing.imageUrl ?? "").split(",")[0]?.trim() || "/apartment-placeholder.svg"
        return (
          <li key={listing.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail */}
            <img src={cover} alt="" className="h-20 w-28 shrink-0 rounded-lg bg-slate-100 object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded px-1.5 py-0.5 font-semibold ${status.style}`}><T mn={status.label} en={status.labelEn} /></span>
                <span className="text-slate-500"><T mn="Зар" en="Listing" /> [{listing.id}] · <T mn={formatPostedAt(listing.createdAt)} en={listing.createdAt ? dateEn.format(new Date(listing.createdAt)) : "Date unknown"} /></span>
              </div>
              {listing.status === "active"
                ? <Link href={`/listings/${listing.id}`} className="mt-1 block truncate font-semibold text-slate-900 hover:text-emerald-800">{listing.title}</Link>
                : <p className="mt-1 truncate font-semibold text-slate-900">{listing.title}</p>}
              <p className="text-sm text-slate-500"><DistrictName name={listing.district} />, {listing.rooms} <T mn="өрөө" en={listing.rooms === 1 ? "room" : "rooms"} />, {Number(listing.area)} <T mn="м²" en="m²" /> · <b className="text-slate-800">{listing.cleanPrice !== null ? formatMnt(listing.cleanPrice) : "—"}</b>/<T mn="сар" en="month" /></p>
            </div>
            <MyListingActions id={listing.id} hidden={listing.status === "inactive"} />
          </li>
        )
      })}
    </ul>
  )
}

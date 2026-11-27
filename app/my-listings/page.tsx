import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import MyListingActions from "@/components/MyListingActions"
import { ensureSchema, getDb } from "@/lib/db"
import { formatPostedAt } from "@/lib/flats"
import { listOwnerListings } from "@/lib/owner-listings"
import { formatMnt } from "@/lib/rent-price"

export const metadata: Metadata = { title: "Миний зарууд — Flat Hunter" }

const STATUS: Record<string, { label: string; style: string }> = {
  active: { label: "Нийтлэгдсэн", style: "bg-emerald-100 text-emerald-800" },
  needs_review: { label: "Админ шалгаж байна", style: "bg-amber-100 text-amber-900" },
  inactive: { label: "Нуусан", style: "bg-slate-200 text-slate-700" },
}

export default function MyListingsPage() {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Эзэмшигчдэд</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Миний зарууд</h1>
          </div>
          <Link href="/post" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">＋ Зар нэмэх</Link>
        </div>
        <Suspense fallback={<div className="mt-6 h-48 animate-pulse rounded-2xl bg-slate-200" />}>
          <Mine />
        </Suspense>
      </div>
    </main>
  )
}

async function Mine() {
  const { userId } = await auth()
  if (!userId) {
    return <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">Зараа харахын тулд нэвтэрнэ үү. <Link href="/sign-in?redirect_url=/my-listings" className="font-semibold text-emerald-800 underline">Нэвтрэх</Link></div>
  }
  await ensureSchema()
  const mine = await listOwnerListings(getDb(), userId)
  if (mine.length === 0) {
    return <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">Одоогоор зар алга. <Link href="/post" className="font-semibold text-emerald-800 underline">Эхний зараа нэмээрэй</Link>.</div>
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
                <span className={`rounded px-1.5 py-0.5 font-semibold ${status.style}`}>{status.label}</span>
                <span className="text-slate-500">Зар [{listing.id}] · {formatPostedAt(listing.createdAt)}</span>
              </div>
              {listing.status === "active"
                ? <Link href={`/listings/${listing.id}`} className="mt-1 block truncate font-semibold text-slate-900 hover:text-emerald-800">{listing.title}</Link>
                : <p className="mt-1 truncate font-semibold text-slate-900">{listing.title}</p>}
              <p className="text-sm text-slate-500">{listing.district}, {listing.rooms} өрөө, {Number(listing.area)} м² · <b className="text-slate-800">{listing.cleanPrice !== null ? formatMnt(listing.cleanPrice) : "—"}</b>/сар</p>
            </div>
            <MyListingActions id={listing.id} hidden={listing.status === "inactive"} />
          </li>
        )
      })}
    </ul>
  )
}

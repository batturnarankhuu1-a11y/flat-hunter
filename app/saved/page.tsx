import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { desc, eq } from "drizzle-orm"
import { savedSearches } from "@/db/schema"
import SavedSearchControls from "@/components/SavedSearchControls"
import { alertsFor, describeSearch, nextDailyDigest, type AlertItem } from "@/lib/alerts"
import { getPlanStatus } from "@/lib/billing"
import { ensureSchema, getDb } from "@/lib/db"
import { loadRentalFlats } from "@/lib/flats"
import { formatMnt } from "@/lib/rent-price"

export const metadata: Metadata = { title: "Хадгалсан хайлт — Flat Hunter" }

export default function SavedPage() {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Миний хайлт</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Хадгалсан хайлт ба мэдэгдэл</h1>
        <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-slate-200" />}>
          <Saved />
        </Suspense>
      </div>
    </main>
  )
}

const timeFormat = new Intl.DateTimeFormat("mn-MN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ulaanbaatar" })

async function Saved() {
  const { userId } = await auth()
  if (!userId) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        Хадгалсан хайлтаа харахын тулд нэвтэрнэ үү. <Link href="/sign-in" className="font-semibold text-emerald-800 underline">Нэвтрэх</Link>
      </div>
    )
  }
  await ensureSchema()
  const [searches, flats, plan] = await Promise.all([
    getDb().select().from(savedSearches).where(eq(savedSearches.userId, userId)).orderBy(desc(savedSearches.createdAt)),
    loadRentalFlats(),
    getPlanStatus(userId),
  ])
  const now = new Date()
  const results = searches.map((search) => ({ search, ...alertsFor(search, flats, now) }))
  const feed: Array<AlertItem & { label: string; mode: string }> = results
    .flatMap(({ search, items }) => search.alertMode === "off" ? [] : items.map((item) => ({ ...item, label: describeSearch(search), mode: search.alertMode })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20)

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${plan.plan === "pro" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{plan.plan === "pro" ? "★ Pro" : "Үнэгүй"}</span>
        <span>{plan.savedSearchLimit === null ? `${plan.savedSearches} хайлт (хязгааргүй)` : `${plan.savedSearches}/${plan.savedSearchLimit} хайлт`}</span>
        <span>· Өдөр тутмын дараагийн мэдэгдэл: <b>{timeFormat.format(nextDailyDigest(now))}</b></span>
      </div>

      {searches.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          Хадгалсан хайлт алга. <Link href="/" className="font-semibold text-emerald-800 underline">Нүүр хуудаснаас</Link> шүүлтүүрээ сонгоод “Энэ хайлтыг хадгалах” дарна уу.
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <ul className="space-y-4">
            {results.map(({ search, matches, items }) => (
              <li key={search.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{describeSearch(search)}</h2>
                    <p className="text-sm text-slate-500">
                      Тохирох {matches.length} байр · {items.filter((item) => item.kind === "new").length} шинэ · {items.filter((item) => item.kind === "price_drop").length} үнэ буурсан
                    </p>
                  </div>
                  <SavedSearchControls id={search.id} alertMode={search.alertMode} isPro={plan.plan === "pro"} />
                </div>
                {matches.length > 0 && (
                  <ul className="mt-3 divide-y divide-slate-100 text-sm">
                    {matches.slice(0, 4).map((flat) => (
                      <li key={flat.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <Link href={`/flats/${flat.id}`} className="min-w-0 flex-1 truncate text-slate-700 hover:text-emerald-800">{flat.title}</Link>
                        <span className="flex items-center gap-2">
                          {flat.previousPrice !== null && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-800">↓ Үнэ буурсан</span>}
                          <b className="text-slate-900">{flat.price !== null ? formatMnt(flat.price) : "Тохиролцоно"}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {matches.length > 4 && <p className="mt-1 text-xs text-slate-500">…болон өөр {matches.length - 4} байр</p>}
              </li>
            ))}
          </ul>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Мэдэгдлийн жагсаалт (preview)</h2>
            <p className="mt-1 text-xs text-slate-500">Танд очих мэдэгдлүүд: шинэ зар болон үнэ буурсан байр. “Off” хайлтын мэдэгдэл орохгүй.</p>
            {feed.length === 0 ? <p className="mt-4 text-sm text-slate-500">Одоогоор шинэ мэдэгдэл алга.</p> : (
              <ol className="mt-3 space-y-3">
                {feed.map((item) => (
                  <li key={`${item.searchId}-${item.kind}-${item.flat.id}`} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className={`text-[11px] font-bold uppercase tracking-wide ${item.kind === "price_drop" ? "text-rose-700" : "text-emerald-700"}`}>
                      {item.kind === "price_drop" ? "↓ Үнэ буурсан" : "★ Шинэ зар"} · {item.mode === "instant" ? "шуурхай" : "09:00-д"}
                    </p>
                    <Link href={`/flats/${item.flat.id}`} className="mt-0.5 block font-medium text-slate-800 hover:text-emerald-800">{item.flat.title}</Link>
                    <p className="text-xs text-slate-500">
                      {item.kind === "price_drop" && item.flat.previousPrice !== null && item.flat.price !== null
                        ? <><s>{formatMnt(item.flat.previousPrice)}</s> → <b className="text-slate-800">{formatMnt(item.flat.price)}</b></>
                        : item.flat.price !== null ? formatMnt(item.flat.price) : "Тохиролцоно"}
                      {" · "}{item.label}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      )}
    </>
  )
}

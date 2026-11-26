import { Suspense } from "react"
import { connection } from "next/server"
import FlatBrowser from "@/components/FlatBrowser"
import type { Flat } from "@/components/types"
import { loadRentalFlats } from "@/lib/flats"

async function LiveFlats() {
  // Cache Components requires request-time database reads to be below a
  // Suspense boundary so refreshes see newly seeded rows.
  await connection()

  let flats: Flat[] = []
  let loadError: string | undefined
  try {
    flats = await loadRentalFlats()
  } catch {
    loadError = "Түрээсийн байрны мэдээллийг одоогоор ачаалж чадсангүй. Түр хүлээгээд хуудсыг дахин ачаална уу."
  }

  return <FlatBrowser flats={flats} loadError={loadError} />
}

function LoadingState() {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <section className="bg-[#102c27] text-white">
        <div className="mx-auto max-w-7xl px-5 py-11 sm:px-8 sm:py-14">
          <p className="text-xs font-medium text-emerald-200">Улаанбаатар хотын түрээсийн байр</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Түрээсийн байраа <span className="text-emerald-300">хямд олоорой.</span></h1>
          <p className="mt-3 max-w-xl text-sm text-emerald-50/75">Түрээсийн байрны мэдээлэл ачаалж байна…</p>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div aria-hidden="true" className="-mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3">
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <div className="py-10 text-sm text-slate-500">Шинэ заруудыг хайж байна…</div>
      </div>
    </main>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LiveFlats />
    </Suspense>
  )
}

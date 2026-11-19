import { Suspense } from "react"
import { connection } from "next/server"
import FlatBrowser from "@/components/FlatBrowser"
import type { Flat } from "@/components/types"
import { getHomepageFlatRows } from "@/lib/db"

const placeholderImage = "/apartment-placeholder.svg"

function positiveNumber(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function formatPostedAt(date: Date | null): string {
  return date ? new Intl.DateTimeFormat("mn-MN", { dateStyle: "medium" }).format(date) : "Огноо тодорхойгүй"
}

async function LiveFlats() {
  // Cache Components requires request-time database reads to be below a
  // Suspense boundary so refreshes see newly ingested rows.
  await connection()

  let rows: Awaited<ReturnType<typeof getHomepageFlatRows>> | null = null
  let loadError: string | undefined
  try {
    rows = await getHomepageFlatRows()
  } catch {
    loadError = "Орон сууцны мэдээллийг одоогоор ачаалж чадсангүй. Түр хүлээгээд хуудсыг дахин ачаална уу."
  }

  const flatItems: Flat[] = (rows ?? []).map((flat) => {
    const district = flat.district?.trim() || "Улаанбаатар"
    return {
      id: String(flat.id),
      title: flat.title ?? `${district}-д орон сууц`,
      district,
      rooms: flat.rooms,
      area: positiveNumber(flat.area),
      price: positiveNumber(flat.lowestPrice),
      pricePerM2: positiveNumber(flat.pricePerM2),
      image: flat.imageUrl?.trim() || placeholderImage,
      address: district,
      postedAt: formatPostedAt(flat.createdAt ?? flat.latestListingAt),
      ...(flat.sourcesCount > 0 ? { sourcesCount: flat.sourcesCount } : {}),
      url: flat.sourceUrl ?? "https://www.unegui.mn/",
    }
  })

  return <FlatBrowser flats={flatItems} loadError={loadError} />
}

function LoadingState() {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <section className="bg-[#102c27] text-white">
        <div className="mx-auto max-w-7xl px-5 py-11 sm:px-8 sm:py-14">
          <p className="text-xs font-medium text-emerald-200">Улаанбаатар хотын үл хөдлөхийн хайлт</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Танд тохирох байраа <span className="text-emerald-300">олоорой.</span></h1>
          <p className="mt-3 max-w-xl text-sm text-emerald-50/75">Орон сууцны мэдээлэл ачаалж байна…</p>
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

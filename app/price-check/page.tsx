import type { Metadata } from "next"
import PriceChecker from "@/components/PriceChecker"

export const metadata: Metadata = { title: "Үнэ шалгагч — Flat Hunter" }

export default function PriceCheckPage() {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Эзэмшигчдэд</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Байраа хэдээр түрээслэх вэ?</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Дүүрэг, өрөөний тоо, талбайгаа оруулбал манай баазын ижил төстэй идэвхтэй заруудын м² үнэд тулгуурлан боломжит сарын түрээсийн хүрээг тооцно.</p>
        <PriceChecker />
      </div>
    </main>
  )
}

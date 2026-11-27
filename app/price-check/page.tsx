import type { Metadata } from "next"
import PriceChecker from "@/components/PriceChecker"
import T from "@/components/T"

export const metadata: Metadata = { title: "Үнэ шалгагч — Flat Hunter" }

export default function PriceCheckPage() {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"><T mn="Эзэмшигчдэд" en="For owners" /></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"><T mn="Байраа хэдээр түрээслэх вэ?" en="How much should you rent your flat for?" /></h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          <T
            mn="Дүүрэг, өрөөний тоо, талбайгаа оруулбал манай баазын ижил төстэй идэвхтэй заруудын м² үнэд тулгуурлан боломжит сарын түрээсийн хүрээг тооцно."
            en="Enter the district, number of rooms and area, and we estimate a likely monthly rent range from the price per m² of similar active listings in our database."
          />
        </p>
        <PriceChecker />
      </div>
    </main>
  )
}

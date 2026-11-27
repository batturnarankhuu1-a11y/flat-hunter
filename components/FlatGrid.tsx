import FlatCard from "./FlatCard"
import T from "./T"
import type { Flat } from "./types"

export default function FlatGrid({ flats }: { flats: Flat[] }) {
  if (flats.length === 0) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><span className="text-4xl">⌕</span><h3 className="mt-3 font-semibold text-slate-900"><T mn="Тохирох зар олдсонгүй" en="No matching listings" /></h3><p className="mt-1 text-sm text-slate-500"><T mn="Шүүлтүүрээ өөрчлөөд дахин хайна уу." en="Change the filters and try again." /></p></div>
  return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{flats.map((flat) => <FlatCard key={flat.id} flat={flat} />)}</div>
}

import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { auth } from "@clerk/nextjs/server"
import PostListingForm from "@/components/PostListingForm"
import T from "@/components/T"

export const metadata: Metadata = { title: "Зар нэмэх — Flat Hunter" }

export default function PostPage({ searchParams }: PageProps<"/post">) {
  return (
    <main className="min-h-screen flex-1 bg-[#f6f8f7]">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"><T mn="Эзэмшигчдэд" en="For owners" /></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"><T mn="Түрээсийн зар нэмэх" en="Post a rental listing" /></h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600"><T mn="Зар тань нүүр хуудсанд “Эзэмшигчийн зар” тэмдэгтэйгээр гарна. Хадгалмагц үнийг тань ижил төстэй байруудын медиантай харьцуулж Fair Price үнэлгээ өгнө." en="Your listing appears on the home page with an “Owner listing” badge. When you save it, your price is compared with the median of similar flats and gets a Fair Price rating." /></p>
        <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-slate-200" />}>
          {searchParams.then((params) => <Post params={params} />)}
        </Suspense>
      </div>
    </main>
  )
}

async function Post({ params }: { params: Record<string, string | string[] | undefined> }) {
  await connection()
  const { userId } = await auth()
  if (!userId) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        <p><T mn="Зар нэмэхийн тулд нэвтэрнэ үү. Нэвтэрсний дараа энэ хуудас руу буцаж ирнэ." en="Please sign in to post a listing. You will come back to this page after signing in." /></p>
        <div className="mt-4 flex gap-2">
          <Link href="/sign-in?redirect_url=/post" className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800"><T mn="Нэвтрэх" en="Sign in" /></Link>
          <Link href="/sign-up?redirect_url=/post" className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"><T mn="Бүртгүүлэх" en="Sign up" /></Link>
        </div>
      </div>
    )
  }
  const value = (key: string) => (typeof params[key] === "string" ? params[key] : "")
  return <PostListingForm initial={{ district: value("district"), rooms: value("rooms"), area: value("area"), price: value("price") }} />
}

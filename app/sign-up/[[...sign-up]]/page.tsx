import { Suspense } from "react"
import Link from "next/link"
import { SignUp } from "@clerk/nextjs"
import T from "@/components/T"

export default function SignUpPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center bg-[#f6f8f7] px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-5 inline-flex items-center rounded-lg px-2 py-1.5 text-sm font-semibold text-[#102c27] transition hover:bg-emerald-50 hover:text-emerald-700">
          ← <T mn="Нүүр хуудас руу буцах" en="Back to home" />
        </Link>
        <p className="mb-5 text-center text-sm font-medium text-slate-500">Flat <span className="font-bold text-emerald-700">Hunter</span> · <T mn="Улаанбаатарын орон сууцны хайлт" en="Ulaanbaatar flat search" /></p>
        <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm"><T mn="Бүртгэлийн хэсэг ачаалж байна…" en="Loading sign-up…" /></div>}>
          <SignUp fallbackRedirectUrl="/" />
        </Suspense>
      </div>
    </main>
  )
}

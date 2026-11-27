"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import T from "@/components/T"
import { useT } from "@/components/preferences"

/** Header links; "Хадгалсан" for signed-in users, "Админ" only for admins. */
export default function SiteNav() {
  const pathname = usePathname()
  const t = useT()
  const { isSignedIn } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    fetch("/api/admin/me").then((response) => response.json()).then((data) => !cancelled && setIsAdmin(Boolean(data.admin))).catch(() => undefined)
    return () => { cancelled = true }
  }, [isSignedIn])

  const links = [
    { href: "/market", mn: "Зах зээл", en: "Market" },
    { href: "/price-check", mn: "Үнэ шалгах", en: "Price check" },
    ...(isSignedIn ? [{ href: "/saved", mn: "Хадгалсан", en: "Saved" }, { href: "/my-listings", mn: "Миний зарууд", en: "My listings" }] : []),
    ...(isSignedIn && isAdmin ? [{ href: "/admin", mn: "Админ", en: "Admin" }] : []),
  ]
  return (
    <nav aria-label={t("Үндсэн цэс", "Main menu")} className="flex items-center gap-1 overflow-x-auto text-sm">
      {links.map((link) => (
        <Link key={link.href} href={link.href} aria-current={pathname.startsWith(link.href) ? "page" : undefined}
          className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 font-semibold transition ${pathname.startsWith(link.href) ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
          <T mn={link.mn} en={link.en} />
        </Link>
      ))}
      <Link href="/post" aria-current={pathname.startsWith("/post") ? "page" : undefined}
        className="ml-1 whitespace-nowrap rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white transition hover:bg-emerald-800"><T mn="＋ Зар нэмэх" en="＋ Post a listing" /></Link>
    </nav>
  )
}

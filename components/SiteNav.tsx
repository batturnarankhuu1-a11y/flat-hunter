"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@clerk/nextjs"

/** Header links; "Хадгалсан" for signed-in users, "Админ" only for admins. */
export default function SiteNav() {
  const pathname = usePathname()
  const { isSignedIn } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    fetch("/api/admin/me").then((response) => response.json()).then((data) => !cancelled && setIsAdmin(Boolean(data.admin))).catch(() => undefined)
    return () => { cancelled = true }
  }, [isSignedIn])

  const links = [
    { href: "/market", label: "Зах зээл" },
    { href: "/price-check", label: "Үнэ шалгах" },
    ...(isSignedIn ? [{ href: "/saved", label: "Хадгалсан" }, { href: "/my-listings", label: "Миний зарууд" }] : []),
    ...(isSignedIn && isAdmin ? [{ href: "/admin", label: "Админ" }] : []),
  ]
  return (
    <nav aria-label="Үндсэн цэс" className="flex items-center gap-1 overflow-x-auto text-sm">
      {links.map((link) => (
        <Link key={link.href} href={link.href} aria-current={pathname.startsWith(link.href) ? "page" : undefined}
          className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 font-semibold transition ${pathname.startsWith(link.href) ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
          {link.label}
        </Link>
      ))}
      <Link href="/post" aria-current={pathname.startsWith("/post") ? "page" : undefined}
        className="ml-1 whitespace-nowrap rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white transition hover:bg-emerald-800">＋ Зар нэмэх</Link>
    </nav>
  )
}

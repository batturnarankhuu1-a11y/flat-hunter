"use client"

import { setLocale, setTheme, useLocale, useTheme } from "@/components/preferences"

/** Header controls: "MN | EN" language switch and a sun/moon theme switch, both saved in localStorage. */
export default function PreferenceToggles() {
  const locale = useLocale()
  const theme = useTheme()
  const dark = theme === "dark"

  return (
    <div className="flex items-center gap-1.5">
      <div role="group" aria-label={locale === "en" ? "Language" : "Хэл"} className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs font-bold">
        {(["mn", "en"] as const).map((item) => (
          <button key={item} type="button" onClick={() => setLocale(item)} aria-pressed={locale === item}
            className={`rounded-md px-2 py-1 transition ${locale === item ? "bg-emerald-700 text-white" : "text-slate-500 hover:text-slate-900"}`}>
            {item.toUpperCase()}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} aria-pressed={dark}
        aria-label={locale === "en" ? (dark ? "Switch to light mode" : "Switch to dark mode") : (dark ? "Гэрэлтэй горим" : "Харанхуй горим")}
        title={locale === "en" ? (dark ? "Light mode" : "Dark mode") : (dark ? "Гэрэлтэй горим" : "Харанхуй горим")}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
        {dark ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
    </div>
  )
}

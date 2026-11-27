/**
 * MN / EN interface language.
 *
 * The choice lives in localStorage ("fh-lang") and is mirrored to a cookie of the same name so API
 * routes (chat, ask, form errors) can answer in the same language. Pages never read the cookie:
 * static text is rendered in both languages with <T mn en /> and CSS hides the inactive one based
 * on <html lang>, which an inline script in the root layout sets before the first paint. That keeps
 * pages prerenderable and avoids a flash of the wrong language.
 *
 * Relative imports only (no "@/" alias, no server-only) so scripts can import it too.
 */
import type { District } from "./districts.ts"

export type Locale = "mn" | "en"
export const LOCALES: readonly Locale[] = ["mn", "en"]
export const LOCALE_KEY = "fh-lang"
export const THEME_KEY = "fh-theme"

export function parseLocale(value: unknown): Locale {
  return value === "en" ? "en" : "mn"
}

/** Pick the string for a locale: tr(locale, "Зах зээл", "Market"). */
export function tr<T>(locale: Locale, mn: T, en: T): T {
  return locale === "en" ? en : mn
}

/** Locale from a request's cookie header (API routes). */
export function requestLocale(request: Request): Locale {
  const match = (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)fh-lang=(en|mn)(?:;|$)/)
  return parseLocale(match?.[1])
}

export const DISTRICT_EN: Record<District, string> = {
  "Баянзүрх": "Bayanzurkh",
  "Сүхбаатар": "Sukhbaatar",
  "Хан-Уул": "Khan-Uul",
  "Чингэлтэй": "Chingeltei",
  "Баянгол": "Bayangol",
  "Сонгинохайрхан": "Songinokhairkhan",
}

/** Canonical district name in the given language; anything unknown is returned unchanged. */
export function districtName(name: string | null | undefined, locale: Locale): string {
  if (!name) return ""
  return locale === "en" ? DISTRICT_EN[name as District] ?? name : name
}

/** Intl locale tag for dates and numbers. */
export function intlLocale(locale: Locale): string {
  return locale === "en" ? "en-GB" : "mn-MN"
}

/** "1.5 сая ₮" / "1.5M ₮" */
export function formatMillionsIn(amount: number, locale: Locale): string {
  const value = Number((amount / 1_000_000).toFixed(2))
  return locale === "en" ? `${value}M ₮` : `${value} сая ₮`
}

/** "2 өрөө" / "2 rooms" */
export function roomsLabel(rooms: number | string, locale: Locale): string {
  return locale === "en" ? `${rooms} room${Number(rooms) === 1 ? "" : "s"}` : `${rooms} өрөө`
}

/**
 * Runs in <head> before the first paint: applies the saved language and theme to <html>
 * (theme falls back to the OS preference) and keeps the language cookie in sync for API routes.
 */
export const PREFERENCES_SCRIPT = `(function(){try{var d=document.documentElement,l=localStorage.getItem("${LOCALE_KEY}");if(l!=="en"&&l!=="mn"){var m=document.cookie.match(/(?:^|; )${LOCALE_KEY}=(en|mn)/);l=m?m[1]:"mn"}d.lang=l;if(document.cookie.indexOf("${LOCALE_KEY}="+l)<0)document.cookie="${LOCALE_KEY}="+l+"; path=/; max-age=31536000; samesite=lax";var t=localStorage.getItem("${THEME_KEY}");if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.setAttribute("data-theme",t);d.style.colorScheme=t}catch(e){}})()`

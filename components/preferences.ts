"use client"

import { useCallback, useSyncExternalStore } from "react"
import { LOCALE_KEY, THEME_KEY, districtName, parseLocale, tr, type Locale } from "@/lib/i18n"

export type Theme = "light" | "dark"
const CHANGE_EVENT = "fh-preferences"

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

const readLocale = (): Locale => parseLocale(document.documentElement.lang)
const readTheme = (): Theme => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light")

function store(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode: the choice lasts for this page only */ }
}

/**
 * Current interface language. The server snapshot is "mn" (pages are not rendered per language),
 * so Client Components re-render with the saved language right after hydration.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, readLocale, () => "mn")
}

/** `t("Хадгалах", "Save")` — for plain strings (placeholders, aria-labels, <option>, alerts). */
export function useT() {
  const locale = useLocale()
  return useCallback(<V,>(mn: V, en: V): V => tr(locale, mn, en), [locale])
}

/** District name in the current language. */
export function useDistrictName() {
  const locale = useLocale()
  return useCallback((name: string | null | undefined) => districtName(name, locale), [locale])
}

export function setLocale(locale: Locale) {
  store(LOCALE_KEY, locale)
  document.cookie = `${LOCALE_KEY}=${locale}; path=/; max-age=31536000; samesite=lax`
  document.documentElement.lang = locale
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "light")
}

export function setTheme(theme: Theme) {
  store(THEME_KEY, theme)
  document.documentElement.setAttribute("data-theme", theme)
  document.documentElement.style.colorScheme = theme
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

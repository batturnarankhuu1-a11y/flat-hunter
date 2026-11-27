/**
 * Mongolian mobile/landline numbers: 8 digits starting with 6–9, optionally
 * prefixed with +976 and split as "9911 2233" / "9911-2233".
 * 8-digit amounts that start with 6–9 would be ≥ 60 сая ₮ — never a monthly rent.
 */
const PHONE_PATTERN = /(?:\+?976[\s-]?)?(?<!\d)[6-9]\d{3}[\s-]?\d{4}(?!\d)/g

/** Spec N3: we never store or show phone numbers; replace them before saving/rendering. */
export function stripPhoneNumbers(text: string): string {
  return text.replace(PHONE_PATTERN, "[утас нуусан]")
}

/** Only real http(s) links are rendered as external buttons. */
export function isExternalUrl(url: string | null | undefined): url is string {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    return false
  }
}

const PHOTO_LABELS: Record<string, [string, string]> = {
  living: ["Зочны өрөө", "Living room"],
  kitchen: ["Гал тогоо", "Kitchen"],
  bedroom: ["Унтлагын өрөө", "Bedroom"],
  room: ["Өрөө", "Room"],
  building: ["Барилга", "Building"],
}

/** "/rentals/bzd-narkhan-a-1-living.webp" → "Зочны өрөө" ("Living room" in English). */
export function photoLabel(src: string, locale: "mn" | "en" = "mn"): string {
  const index = locale === "en" ? 1 : 0
  if (src.startsWith("/samples/")) return ["Жишээ зураг", "Sample photo"][index]
  const kind = src.match(/-([a-z]+)\.webp$/)?.[1]
  return (kind && PHOTO_LABELS[kind]?.[index]) || ["Зураг", "Photo"][index]
}

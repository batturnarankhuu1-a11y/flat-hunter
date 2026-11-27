import { chatReply, EMPTY_CONTEXT, type ChatContext } from "@/lib/chat"
import { DISTRICTS, type District } from "@/lib/districts"
import { loadRentalFlats } from "@/lib/flats"
import { parseLocale, requestLocale, tr } from "@/lib/i18n"

const MAX_MESSAGE_LENGTH = 300

/** Accept only the shape we send back ourselves; anything else starts a fresh conversation. */
function readContext(value: unknown): ChatContext {
  if (typeof value !== "object" || value === null) return EMPTY_CONTEXT
  const raw = value as Record<string, unknown>
  const filters = (typeof raw.filters === "object" && raw.filters !== null ? raw.filters : {}) as Record<string, unknown>
  const number = (input: unknown, max: number) => (typeof input === "number" && Number.isFinite(input) && input > 0 && input <= max ? input : null)
  return {
    filters: {
      price_type: null,
      district: DISTRICTS.includes(filters.district as District) ? (filters.district as District) : null,
      rooms: number(filters.rooms, 10),
      max_price: number(filters.max_price, 100_000_000),
      min_area: number(filters.min_area, 1000),
    },
    terms: Array.isArray(raw.terms) ? raw.terms.filter((term): term is string => typeof term === "string" && term.length <= 40).slice(0, 5) : [],
    shown: number(raw.shown, 500) ?? 0,
  }
}

/**
 * POST /api/chat  { "message": "Хан-Уулд тавилгатай 3 өрөө байна уу?", "context": <context from the last reply>, "locale"?: "mn" | "en" }
 * → { intent, reply, flats (≤ 3), total, context, suggestions } — friendly Mongolian or English (body locale,
 * else the fh-lang cookie), from our own listings only.
 */
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: tr(requestLocale(request), "JSON бие шаардлагатай", "JSON body required") }, { status: 400 })
  }
  const locale = body.locale === "en" || body.locale === "mn" ? parseLocale(body.locale) : requestLocale(request)
  const message = typeof body.message === "string" ? body.message.trim() : ""
  if (!message) return Response.json({ error: tr(locale, "Мессежээ бичнэ үү", "Please type a message") }, { status: 400 })
  if (message.length > MAX_MESSAGE_LENGTH) return Response.json({ error: tr(locale, `${MAX_MESSAGE_LENGTH} тэмдэгтээс ихгүй бичнэ үү`, `Please keep it under ${MAX_MESSAGE_LENGTH} characters`) }, { status: 400 })
  try {
    return Response.json(chatReply(message, readContext(body.context), await loadRentalFlats(), locale))
  } catch {
    return Response.json({ error: tr(locale, "Байрны мэдээллийг ачаалж чадсангүй. Түр хүлээгээд дахин бичээрэй.", "Couldn't load the listings. Please wait a moment and try again.") }, { status: 503 })
  }
}

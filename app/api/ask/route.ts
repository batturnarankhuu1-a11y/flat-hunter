import { answerQuestion } from "@/lib/ask"
import { requestLocale, tr } from "@/lib/i18n"
import { loadRentalFlats } from "@/lib/flats"
import { semanticSearch } from "@/lib/semantic-engine"

const MAX_QUERY_LENGTH = 300 // spec FR-14

/**
 * POST /api/ask  { "query": "Би Баянзүрх дүүрэгт 1.5 саяас доош 2 өрөө байр хайж байна" }
 *
 * 1. The question is parsed into filter JSON
 *    { price_type, rooms, district, max_price, min_area } (unmentioned → null).
 * 2. Only listings in the database that match are used to build the answer.
 * 3. The answer is in the interface language (fh-lang cookie: mn/en), at most 4 sentences,
 *    and every listing it mentions is followed by its id, e.g. [101].
 *
 * status: "OK" | "NOT_FOUND" (no matching listing) | "UNCLEAR" (no filter recognized)
 *
 * Words beyond the filters ("тавилгатай", "River garden", "near the center") go to the semantic
 * search: Pinecone when PINECONE_API_KEY + HUGGINGFACE_API_KEY are set, otherwise the local vector
 * search (lib/semantic-search.ts). `search.engine` in the response says which one answered.
 */
export async function POST(request: Request): Promise<Response> {
  const locale = requestLocale(request)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Request body must be JSON: { \"query\": \"…\" }" }, { status: 400 })
  }

  const query = typeof body === "object" && body !== null ? (body as Record<string, unknown>).query : undefined
  if (typeof query !== "string" || !query.trim()) {
    return Response.json({ error: tr(locale, "Хайх өгүүлбэрээ бичнэ үү", "Please enter a question") }, { status: 400 })
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json({ error: tr(locale, `Хамгийн ихдээ ${MAX_QUERY_LENGTH} тэмдэгт`, `Max ${MAX_QUERY_LENGTH} characters`) }, { status: 400 })
  }

  try {
    const flats = await loadRentalFlats()
    return Response.json({ query, ...answerQuestion(query, flats, await semanticSearch(query, flats), locale) })
  } catch {
    return Response.json({ error: tr(locale, "Байрны мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу.", "Could not load the listings. Please try again.") }, { status: 503 })
  }
}

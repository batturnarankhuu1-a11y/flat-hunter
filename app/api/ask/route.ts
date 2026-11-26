import { answerQuestion } from "@/lib/ask"
import { loadRentalFlats } from "@/lib/flats"

const MAX_QUERY_LENGTH = 300 // spec FR-14

/**
 * POST /api/ask  { "query": "Би Баянзүрх дүүрэгт 1.5 саяас доош 2 өрөө байр хайж байна" }
 *
 * 1. The question is parsed into filter JSON
 *    { price_type, rooms, district, max_price, min_area } (unmentioned → null).
 * 2. Only listings in the database that match are used to build the answer.
 * 3. The answer is in the question's language (mn/en), at most 4 sentences,
 *    and every listing it mentions is followed by its id, e.g. [101].
 *
 * status: "OK" | "NOT_FOUND" (no matching listing) | "UNCLEAR" (no filter recognized)
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Request body must be JSON: { \"query\": \"…\" }" }, { status: 400 })
  }

  const query = typeof body === "object" && body !== null ? (body as Record<string, unknown>).query : undefined
  if (typeof query !== "string" || !query.trim()) {
    return Response.json({ error: "Хайх өгүүлбэрээ бичнэ үү / Please enter a question" }, { status: 400 })
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json({ error: `Max ${MAX_QUERY_LENGTH} characters` }, { status: 400 })
  }

  try {
    return Response.json({ query, ...answerQuestion(query, await loadRentalFlats()) })
  } catch {
    return Response.json({ error: "Байрны мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу." }, { status: 503 })
  }
}

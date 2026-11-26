import { checkIngestSecret, ingestListings } from "@/lib/ingest"

const MAX_BATCH = 100

/**
 * POST /api/ingest   (header: x-ingest-secret)
 * Body: one listing or an array of up to 100:
 *   { sourceUrl, title, rawPrice, rawDescription?, district?, rooms?, area?, address?, priceType?: "rent" }
 * Photos, agent names and phone numbers are never stored (spec N1, N3).
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkIngestSecret(request)
  if (denied) return denied

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 })
  }
  const inputs = Array.isArray(payload) ? payload : [payload]
  if (inputs.length === 0) return Response.json({ error: "At least one listing is required" }, { status: 400 })
  if (inputs.length > MAX_BATCH) return Response.json({ error: `A maximum of ${MAX_BATCH} listings can be ingested at once` }, { status: 400 })

  try {
    const results = await ingestListings(inputs)
    const count = (status: string) => results.filter((result) => result.status === status).length
    return Response.json({ received: inputs.length, created: count("created"), updated: count("updated"), rejected: count("rejected"), results })
  } catch (error) {
    console.error("[flat-hunter] ingest failed", error instanceof Error ? error.message : error)
    return Response.json({ error: "Failed to ingest listings" }, { status: 500 })
  }
}

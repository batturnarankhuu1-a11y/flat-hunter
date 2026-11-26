import { checkIngestSecret, findNewUrls } from "@/lib/ingest"

const MAX_URLS = 500

/**
 * POST /api/ingest/check   (header: x-ingest-secret)
 * Body: { "urls": ["https://www.unegui.mn/adv/…", …] }
 * Returns only the URLs that are not stored yet, so the scraper fetches detail pages for new listings only.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkIngestSecret(request)
  if (denied) return denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 })
  }
  const urls = typeof body === "object" && body !== null ? (body as Record<string, unknown>).urls : undefined
  if (!Array.isArray(urls) || urls.some((url) => typeof url !== "string")) return Response.json({ error: "urls must be an array of strings" }, { status: 400 })
  if (urls.length > MAX_URLS) return Response.json({ error: `At most ${MAX_URLS} urls per request` }, { status: 400 })

  try {
    return Response.json(await findNewUrls(urls as string[]))
  } catch (error) {
    console.error("[flat-hunter] ingest check failed", error instanceof Error ? error.message : error)
    return Response.json({ error: "Failed to check urls" }, { status: 500 })
  }
}

import { checkIngestSecret, getScrapeStatus, startScrapeRun, updateScrapeRun, type ScrapeRunUpdate } from "@/lib/ingest"

const STATUSES = new Set(["running", "ok", "blocked", "failed"])
const SOURCES = new Set(["live", "fixtures"])

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return typeof body === "object" && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** POST /api/ingest/runs { "source": "live" | "fixtures" } → { runId } */
export async function POST(request: Request): Promise<Response> {
  const denied = checkIngestSecret(request)
  if (denied) return denied
  const body = await readJson(request)
  const source = body?.source ?? "live"
  if (!SOURCES.has(source as string)) return Response.json({ error: "source must be live or fixtures" }, { status: 400 })
  try {
    return Response.json({ runId: await startScrapeRun(source as "live" | "fixtures") })
  } catch (error) {
    console.error("[flat-hunter] start scrape run failed", error instanceof Error ? error.message : error)
    return Response.json({ error: "Failed to start run" }, { status: 500 })
  }
}

/**
 * PATCH /api/ingest/runs
 * { runId, status?, source?, pagesRead?, listingsSeen?, newCount?, failedCount?, error?, parseErrors?: [{ url, message }] }
 */
export async function PATCH(request: Request): Promise<Response> {
  const denied = checkIngestSecret(request)
  if (denied) return denied
  const body = await readJson(request)
  const runId = Number(body?.runId)
  if (!body || !Number.isInteger(runId) || runId <= 0) return Response.json({ error: "runId is required" }, { status: 400 })
  if (body.status !== undefined && !STATUSES.has(body.status as string)) return Response.json({ error: "invalid status" }, { status: 400 })
  if (body.source !== undefined && !SOURCES.has(body.source as string)) return Response.json({ error: "invalid source" }, { status: 400 })

  const counter = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined)
  const parseErrors = Array.isArray(body.parseErrors)
    ? (body.parseErrors as unknown[]).flatMap((item) => {
        const record = item as Record<string, unknown>
        return typeof record?.url === "string" && typeof record?.message === "string" ? [{ url: record.url, message: record.message }] : []
      })
    : undefined
  const update: ScrapeRunUpdate = {
    status: body.status as ScrapeRunUpdate["status"],
    source: body.source as ScrapeRunUpdate["source"],
    pagesRead: counter(body.pagesRead),
    listingsSeen: counter(body.listingsSeen),
    newCount: counter(body.newCount),
    failedCount: counter(body.failedCount),
    error: typeof body.error === "string" ? body.error : undefined,
    parseErrors,
  }
  try {
    const found = await updateScrapeRun(runId, update)
    return found ? Response.json({ ok: true }) : Response.json({ error: "run not found" }, { status: 404 })
  } catch (error) {
    console.error("[flat-hunter] update scrape run failed", error instanceof Error ? error.message : error)
    return Response.json({ error: "Failed to update run" }, { status: 500 })
  }
}

/** GET /api/ingest/runs → { lastRun, minutesSinceLastRun, stale (> 45 min), runs } for the admin dashboard. */
export async function GET(request: Request): Promise<Response> {
  const denied = checkIngestSecret(request)
  if (denied) return denied
  try {
    return Response.json(await getScrapeStatus())
  } catch (error) {
    console.error("[flat-hunter] scrape status failed", error instanceof Error ? error.message : error)
    return Response.json({ error: "Failed to load scrape status" }, { status: 500 })
  }
}

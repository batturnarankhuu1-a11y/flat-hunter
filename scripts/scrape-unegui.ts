/**
 * Polite unegui.mn scraper for apartment RENT listings ("Орон сууц түрээслүүлнэ").
 * Mirrors the n8n flow in the spec:
 *
 *   list page(s) → POST /api/ingest/check → fetch only NEW detail pages → POST /api/ingest
 *
 *   npm run scrape                       # 1 list page, up to 10 new listings
 *   npm run scrape -- --pages=2 --max-new=20
 *   npm run scrape -- --offline          # no network: ingest local fixtures only
 *   npm run scrape -- --save-fixtures    # also save parsed listings to data/unegui-fixtures/listings.json
 *   npm run scrape -- --dry-run          # fetch + parse + /api/ingest/check only; writes nothing
 *
 * Politeness (spec: Non-functional, §14 "Being blocked by the site"):
 *   - honest User-Agent that names the project (no browser impersonation)
 *   - obeys robots.txt
 *   - one request at a time, 3–6 s random delay before every request
 *   - 403 / 429 / 503 / Cloudflare challenge → STOP the run, record it in scrape_runs.error,
 *     never retry or try to get around the block
 *
 * When the live site is unavailable or blocks us the run stops, is logged in
 * scrape_runs, and NOTHING else changes: the app keeps serving the data it already
 * has (the 55 seeded flats / 85 listings stay untouched). Local fixtures are only
 * ingested when asked for explicitly:
 *   --offline            ingest data/unegui-fixtures/ (listings.json and *.html) instead of the site
 *   --fallback-fixtures  after a block, ingest those fixtures
 *
 * Scraped ads never bring their (watermarked) photos into the UI: only hashes of the
 * photo URLs are kept, to recognise the same flat re-posted (FR-8).
 *
 * Requires the app running (npm run dev) and INGEST_SECRET in .env.local.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import dotenv from "dotenv"
import {
  UNEGUI_ORIGIN, detectBlock, isAllowedByRobots, parseDetailPage, parseListPage, parseRobots, rentListUrl,
  type ParsedListing,
} from "../lib/unegui-parser.ts"

dotenv.config({ path: ".env.local", quiet: true })

// ---------------------------------------------------------------- options
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=")
  return [key, value ?? "true"] as const
}))
const PAGES = Math.min(Math.max(Number(args.get("pages") ?? 1), 1), 10)
const MAX_NEW = Math.min(Math.max(Number(args.get("max-new") ?? 10), 0), 100)
const OFFLINE = args.get("offline") === "true"
const SAVE_FIXTURES = args.get("save-fixtures") === "true"
const DRY_RUN = args.get("dry-run") === "true"
const FALLBACK_FIXTURES = args.get("fallback-fixtures") === "true"
/** Test hook: point the scraper at a local mock server (e.g. one that answers 403) instead of unegui.mn. */
const ORIGIN = (args.get("origin") ?? UNEGUI_ORIGIN).replace(/\/$/, "")
const BASE_URL = (args.get("base") ?? process.env.FLAT_HUNTER_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")
const FIXTURE_DIR = join(process.cwd(), "data", "unegui-fixtures")
const USER_AGENT = "FlatHunterBot/0.1 (student rental-price project; 1 request per 3-6s; respects robots.txt)"
const MIN_DELAY_MS = 3_000
const MAX_DELAY_MS = 6_000

const secret = process.env.INGEST_SECRET
if (!secret) {
  console.error("INGEST_SECRET is missing in .env.local — the ingest API refuses requests without it.")
  process.exit(1)
}

// ---------------------------------------------------------------- helpers
class BlockedError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const politeDelay = () => sleep(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS))

let robotsRules: string[] = []

async function fetchPage(url: string): Promise<string> {
  if (!isAllowedByRobots(url, robotsRules)) throw new Error(`robots.txt disallows ${url}`)
  await politeDelay()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "mn,en;q=0.7" },
      signal: controller.signal,
      redirect: "follow",
    })
    const html = await response.text()
    const block = detectBlock(response.status, html)
    if (block.blocked) throw new BlockedError(`${url}: ${block.reason}`)
    return html
  } finally {
    clearTimeout(timer)
  }
}

async function api<T>(method: string, path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-ingest-secret": secret! },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(`Cannot reach the app at ${BASE_URL} — start it with "npm run dev" (or pass --base=…).`)
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${(data as { error?: string }).error ?? "unknown error"}`)
  return data as T
}

type ParseError = { url: string; message: string }
type IngestResponse = { created: number; updated: number; rejected: number; results: Array<{ status: string; error?: string }> }

async function ingestInBatches(items: ParsedListing[]): Promise<{ created: number; updated: number; rejected: number }> {
  const totals = { created: 0, updated: 0, rejected: 0 }
  for (let start = 0; start < items.length; start += 50) {
    const batch = items.slice(start, start + 50).map((item) => ({ ...item, priceType: "rent" }))
    const result = await api<IngestResponse>("POST", "/api/ingest", batch)
    totals.created += result.created
    totals.updated += result.updated
    totals.rejected += result.rejected
  }
  return totals
}

function saveFixtures(items: ParsedListing[]) {
  mkdirSync(FIXTURE_DIR, { recursive: true })
  const file = join(FIXTURE_DIR, "listings.json")
  const previous: ParsedListing[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : []
  const merged = new Map(previous.map((item) => [item.sourceUrl, item]))
  for (const item of items) merged.set(item.sourceUrl, item)
  writeFileSync(file, JSON.stringify([...merged.values()], null, 2))
  console.log(`Saved ${merged.size} parsed listings to ${file} (no photos, names or phones).`)
}

function loadFixtures(): { items: ParsedListing[]; errors: ParseError[] } {
  const items: ParsedListing[] = []
  const errors: ParseError[] = []
  if (!existsSync(FIXTURE_DIR)) return { items, errors }
  const json = join(FIXTURE_DIR, "listings.json")
  if (existsSync(json)) {
    try {
      items.push(...(JSON.parse(readFileSync(json, "utf8")) as ParsedListing[]))
    } catch (error) {
      errors.push({ url: json, message: `fixture JSON unreadable: ${(error as Error).message}` })
    }
  }
  for (const file of readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".html"))) {
    const html = readFileSync(join(FIXTURE_DIR, file), "utf8")
    const canonical = html.match(/"url":"(https:\/\/www\.unegui\.mn\/adv\/[^"]+)"/)?.[1] ?? `${UNEGUI_ORIGIN}/adv/0_${file}/`
    const parsed = parseDetailPage(html, canonical)
    errors.push(...parsed.fieldErrors.map((message) => ({ url: `fixture:${file}`, message })))
    if (parsed.listing) items.push(parsed.listing)
  }
  return { items, errors }
}

// ---------------------------------------------------------------- run
async function runLive(runId: number) {
  const parseErrors: ParseError[] = []
  const collected: ParsedListing[] = []
  let pagesRead = 0
  let listingsSeen = 0
  let detailFailures = 0

  try {
    // robots.txt first; if we cannot read it we do not crawl.
    await politeDelay()
    const robotsResponse = await fetch(`${ORIGIN}/robots.txt`, { headers: { "User-Agent": USER_AGENT } })
    if (robotsResponse.status === 403 || robotsResponse.status === 429 || robotsResponse.status >= 500) throw new BlockedError(`robots.txt: HTTP ${robotsResponse.status}`)
    robotsRules = parseRobots(await robotsResponse.text())

    for (let page = 1; page <= PAGES && collected.length < MAX_NEW; page += 1) {
      const listUrl = rentListUrl(page).replace(UNEGUI_ORIGIN, ORIGIN)
      const urls = parseListPage(await fetchPage(listUrl))
      pagesRead += 1
      listingsSeen += urls.length
      if (urls.length === 0) {
        parseErrors.push({ url: listUrl, message: "list: no listing URLs found (ItemList selector found nothing)" })
        break
      }
      const { newUrls } = await api<{ newUrls: string[] }>("POST", "/api/ingest/check", { urls })
      console.log(`page ${page}: ${urls.length} listings, ${newUrls.length} new`)

      for (const url of newUrls) {
        if (collected.length >= MAX_NEW) break
        const parsed = parseDetailPage(await fetchPage(url), url)
        parseErrors.push(...parsed.fieldErrors.map((message) => ({ url, message })))
        if (parsed.listing) collected.push(parsed.listing)
        else detailFailures += 1
        console.log(`  ${parsed.listing ? "✓" : "✗"} ${url}${parsed.fieldErrors.length ? `  (${parsed.fieldErrors.join("; ")})` : ""}`)
      }
    }
  } finally {
    if (DRY_RUN) {
      console.log(`dry run: ${pagesRead} page(s), ${listingsSeen} seen, ${collected.length} new parsed, ${parseErrors.length} parse errors — nothing written`)
      return
    }
    // Whatever was parsed before a block/failure is still good data — save it.
    const totals = collected.length ? await ingestInBatches(collected) : { created: 0, updated: 0, rejected: 0 }
    if (SAVE_FIXTURES && collected.length) saveFixtures(collected)
    await api("PATCH", "/api/ingest/runs", {
      runId, pagesRead, listingsSeen, newCount: totals.created,
      failedCount: totals.rejected + detailFailures,
      parseErrors,
    })
    console.log(`live: ${pagesRead} page(s), ${listingsSeen} seen, ${totals.created} new, ${totals.updated} updated, ${totals.rejected} rejected, ${parseErrors.length} parse errors`)
  }
}

async function runFixtures(reason: string): Promise<boolean> {
  const { items, errors } = loadFixtures()
  if (items.length === 0) {
    console.log(`No local fixtures in ${FIXTURE_DIR}. The app keeps serving the data it already has.`)
    return false
  }
  if (DRY_RUN) {
    console.log(`dry run: ${items.length} fixture listing(s) parsed, ${errors.length} parse errors — nothing written`)
    for (const item of items) console.log(`  ${item.district ?? "?"} · ${item.rooms ?? "?"} өрөө · ${item.area ?? "?"} м² · "${item.rawPrice}" · ${item.imageUrls.length} photo refs · ${item.title}`)
    return true
  }
  const { runId } = await api<{ runId: number }>("POST", "/api/ingest/runs", { source: "fixtures" })
  try {
    const totals = await ingestInBatches(items)
    await api("PATCH", "/api/ingest/runs", { runId, status: "ok", listingsSeen: items.length, newCount: totals.created, failedCount: totals.rejected, parseErrors: errors, error: `fallback after: ${reason}` })
    console.log(`fixtures: ${items.length} listings → ${totals.created} new, ${totals.updated} updated, ${totals.rejected} rejected`)
  } catch (error) {
    await api("PATCH", "/api/ingest/runs", { runId, status: "failed", error: (error as Error).message })
    throw error
  }
  return true
}

async function main() {
  if (OFFLINE) {
    await runFixtures("--offline")
    return
  }

  const { runId } = DRY_RUN ? { runId: 0 } : await api<{ runId: number }>("POST", "/api/ingest/runs", { source: "live" })
  try {
    await runLive(runId)
    if (!DRY_RUN) await api("PATCH", "/api/ingest/runs", { runId, status: "ok" })
    console.log(`run #${runId}: ok`)
  } catch (error) {
    const blocked = error instanceof BlockedError
    const message = (error as Error).message
    if (!DRY_RUN) await api("PATCH", "/api/ingest/runs", { runId, status: blocked ? "blocked" : "failed", error: message }).catch(() => undefined)
    console.warn(`run #${runId}: ${blocked ? "BLOCKED — stopped, not retrying" : "failed"}: ${message}`)
    if (FALLBACK_FIXTURES) await runFixtures(message)
    else console.log("Existing data is unchanged and keeps being served. (Use --fallback-fixtures to ingest local fixtures.)")
  }
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exit(1)
})

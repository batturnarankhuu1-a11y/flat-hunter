/**
 * Download each listing's own photos (cdn*.unegui.mn URLs in data/cleaned-rentals.json) once into
 * public/flats/<photoRef>.webp, so the site serves them itself. unegui's CDN shows its logo instead
 * of the photo when another site embeds it, so the URLs cannot be shown directly.
 *
 *   npm run data:photos        # skips files that are already there
 *
 * Polite: one request at a time with a pause, a plain project User-Agent, and only the photo
 * URLs listed in the cleaned file. A file is kept only if it is a real WebP/JPEG/PNG image.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

const DATA_FILE = join("data", "cleaned-rentals.json")
const OUT_DIR = join("public", "flats")
const USER_AGENT = "FlatHunterBot/0.1 (student project; one-time photo copy)"

const photoRef = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 20)
const isImage = (bytes: Buffer) =>
  (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP")
  || (bytes[0] === 0xff && bytes[1] === 0xd8) // JPEG
  || bytes.subarray(1, 4).toString("latin1") === "PNG"

const data = JSON.parse(readFileSync(DATA_FILE, "utf8")) as { flats: Array<{ listings: Array<{ photos: string[] }> }> }
const urls = [...new Set(data.flats.flatMap((flat) => flat.listings.flatMap((listing) => listing.photos)))]
mkdirSync(OUT_DIR, { recursive: true })

let saved = 0, skipped = 0
const failed: string[] = []
for (const url of urls) {
  const file = join(OUT_DIR, `${photoRef(url)}.webp`)
  if (existsSync(file)) { skipped++; continue }
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!response.ok || !isImage(bytes)) throw new Error(`HTTP ${response.status}, ${bytes.length} bytes`)
    writeFileSync(file, bytes)
    saved++
  } catch (error) {
    failed.push(`${url}: ${(error as Error).message}`)
  }
  await sleep(300 + Math.random() * 400)
}
console.log(`${urls.length} photos: ${saved} downloaded, ${skipped} already there, ${failed.length} failed`)
for (const line of failed) console.log("  failed", line)

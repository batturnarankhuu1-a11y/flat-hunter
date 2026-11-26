// Second batch: real (non-render) apartment photos, CC0 / public domain only.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs"
import sharp from "sharp"

const [OUT, PREV] = process.argv.slice(2)
mkdirSync(`${OUT}/thumbs`, { recursive: true })
const UA = "FlatHunter-dev/0.1 (one-off image curation; CC0/PDM only)"
const previous = new Set(JSON.parse(readFileSync(PREV, "utf8")).map((c) => c.id))
const QUERIES = [
  ["bedroom", "apartment bedroom"], ["bedroom", "small bedroom"], ["bedroom", "bedroom bed window"],
  ["living", "apartment living room"], ["living", "small living room"], ["living", "living room couch"],
  ["kitchen", "small kitchen"], ["room", "studio apartment"], ["room", "flat interior"],
  ["room", "apartment for rent"], ["building", "apartment buildings city"], ["building", "residential towers"],
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const seen = new Map()
for (const [kind, q] of QUERIES) {
  for (const page of [1, 2]) {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&page_size=20&page=${page}&mature=false&aspect_ratio=wide`
    const res = await fetch(url, { headers: { "User-Agent": UA } })
    if (!res.ok) { console.log("query", q, page, res.status); await sleep(15000); continue }
    for (const r of (await res.json()).results) {
      if (previous.has(r.id) || seen.has(r.id) || !r.width || r.width < 800 || r.width <= r.height) continue
      seen.set(r.id, { id: r.id, kind, query: q, url: r.url, thumbnail: r.thumbnail, title: r.title, creator: r.creator, license: r.license, license_url: r.license_url, foreign_landing_url: r.foreign_landing_url, width: r.width, height: r.height })
    }
    await sleep(4000)
  }
}
let n = 1000
const ok = []
for (const c of seen.values()) {
  try {
    const res = await fetch(c.thumbnail, { headers: { "User-Agent": UA } })
    if (!res.ok) continue
    await sharp(Buffer.from(await res.arrayBuffer())).resize(300, 200, { fit: "cover" }).jpeg({ quality: 70 }).toFile(`${OUT}/thumbs/${n}.jpg`)
    ok.push({ n, ...c }); n++
  } catch { /* skip */ }
  await sleep(300)
}
writeFileSync(`${OUT}/candidates.json`, JSON.stringify(ok, null, 1))
console.log("thumbs:", ok.length)

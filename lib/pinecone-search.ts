import "server-only"
import { createHash } from "node:crypto"
import type { Flat } from "@/components/types"
import { flatDocument } from "@/lib/semantic-search"

/**
 * Pinecone vector search, used by /api/ask when BOTH keys are set in .env.local:
 *   PINECONE_API_KEY      Pinecone project key
 *   HUGGINGFACE_API_KEY   Hugging Face token for the embedding model
 * Optional: PINECONE_INDEX (default "flat-hunter"), HUGGINGFACE_EMBED_MODEL,
 * PINECONE_CLOUD / PINECONE_REGION (default aws / us-east-1 — used only to create the index).
 *
 * The index is created on first use (serverless, cosine) and the flats are upserted whenever the
 * catalogue changes (ids + titles + prices hash). Any failure throws; the caller falls back to the
 * local search, so a missing key or an outage never breaks /api/ask.
 */
const PINECONE_API = "https://api.pinecone.io"
const PINECONE_VERSION = "2025-04"
const DEFAULT_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2" // 384 dims, Mongolian + English
const NAMESPACE = "rent"

export function pineconeConfigured(): boolean {
  return Boolean(process.env.PINECONE_API_KEY?.trim() && process.env.HUGGINGFACE_API_KEY?.trim())
}

async function fetchJson(url: string, init: RequestInit, what: string): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
  const text = await response.text()
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

/** Sentence embeddings from the Hugging Face Inference API (mean-pooled if the model returns tokens). */
async function embed(texts: string[]): Promise<number[][]> {
  const model = process.env.HUGGINGFACE_EMBED_MODEL?.trim() || DEFAULT_MODEL
  const url = process.env.HUGGINGFACE_EMBED_URL?.trim() || `https://router.huggingface.co/hf-inference/models/${model}/pipeline/feature-extraction`
  const result = await fetchJson(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
  }, "Hugging Face embeddings") as number[][] | number[][][]
  return result.map((item) => {
    if (typeof item[0] === "number") return item as number[]
    const tokens = item as number[][]
    return tokens[0].map((_, dim) => tokens.reduce((sum, token) => sum + token[dim], 0) / tokens.length)
  })
}

const pineconeHeaders = () => ({ "Api-Key": process.env.PINECONE_API_KEY!, "Content-Type": "application/json", "X-Pinecone-API-Version": PINECONE_VERSION })

type Memo = { host?: string; indexedSignature?: string }
const memo = ((globalThis as { __flatHunterPinecone?: Memo }).__flatHunterPinecone ??= {})

/** Data-plane host of the index; creates the index (dimension = embedding size) if it does not exist. */
async function indexHost(dimension: number): Promise<string> {
  if (memo.host) return memo.host
  const name = process.env.PINECONE_INDEX?.trim() || "flat-hunter"
  const describe = await fetch(`${PINECONE_API}/indexes/${name}`, { headers: pineconeHeaders(), signal: AbortSignal.timeout(15_000) })
  if (describe.status === 404) {
    await fetchJson(`${PINECONE_API}/indexes`, {
      method: "POST",
      headers: pineconeHeaders(),
      body: JSON.stringify({
        name, dimension, metric: "cosine",
        spec: { serverless: { cloud: process.env.PINECONE_CLOUD?.trim() || "aws", region: process.env.PINECONE_REGION?.trim() || "us-east-1" } },
      }),
    }, "Pinecone create index")
    throw new Error(`Pinecone index "${name}" was just created and is not ready yet`)
  }
  if (!describe.ok) throw new Error(`Pinecone describe index: HTTP ${describe.status}`)
  const index = await describe.json() as { host: string; dimension: number; status?: { ready?: boolean } }
  if (index.dimension !== dimension) throw new Error(`Pinecone index "${name}" has dimension ${index.dimension}, the model gives ${dimension}`)
  if (index.status?.ready === false) throw new Error(`Pinecone index "${name}" is not ready yet`)
  memo.host = `https://${index.host}`
  return memo.host
}

function signature(flats: Flat[]): string {
  return createHash("sha256").update(flats.map((flat) => `${flat.id}|${flat.title}|${flat.price}`).join("\n")).digest("hex")
}

/** Upsert every flat (id = flat id) once per catalogue version. */
async function ensureIndexed(host: string, flats: Flat[]): Promise<void> {
  const current = signature(flats)
  if (memo.indexedSignature === current) return
  for (let start = 0; start < flats.length; start += 48) {
    const batch = flats.slice(start, start + 48)
    const vectors = await embed(batch.map(flatDocument))
    await fetchJson(`${host}/vectors/upsert`, {
      method: "POST",
      headers: pineconeHeaders(),
      body: JSON.stringify({
        namespace: NAMESPACE,
        vectors: batch.map((flat, index) => ({
          id: flat.id,
          values: vectors[index],
          metadata: { title: flat.title, district: flat.district, rooms: flat.rooms ?? -1, price: flat.price ?? -1 },
        })),
      }),
    }, "Pinecone upsert")
  }
  memo.indexedSignature = current
}

/** Cosine similarity (0–1) of the question to each flat, from Pinecone. */
export async function pineconeScores(question: string, flats: Flat[]): Promise<Map<string, number>> {
  const [queryVector] = await embed([question])
  const host = await indexHost(queryVector.length)
  await ensureIndexed(host, flats)
  const result = await fetchJson(`${host}/query`, {
    method: "POST",
    headers: pineconeHeaders(),
    body: JSON.stringify({ namespace: NAMESPACE, vector: queryVector, topK: Math.min(flats.length, 100), includeMetadata: false }),
  }, "Pinecone query") as { matches?: Array<{ id: string; score: number }> }
  return new Map((result.matches ?? []).map((match) => [match.id, Math.round(match.score * 1000) / 1000]))
}

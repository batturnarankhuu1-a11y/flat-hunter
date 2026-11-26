import "server-only"
import type { Flat } from "@/components/types"
import { pineconeConfigured, pineconeScores } from "@/lib/pinecone-search"
import { localSemanticSearch, type SemanticResult } from "@/lib/semantic-search"

/** Pinecone similarity at which a flat counts as relevant on its own. */
const PINECONE_RELEVANT = 0.6

/**
 * Pinecone when PINECONE_API_KEY + HUGGINGFACE_API_KEY are set, otherwise (or on any error) the
 * local vector search. The local search always decides which words carry meaning, so greetings
 * and filter-only questions behave the same with either engine.
 */
export async function semanticSearch(question: string, flats: Flat[]): Promise<SemanticResult> {
  const local = localSemanticSearch(question, flats)
  if (!pineconeConfigured() || local.terms.length === 0) return local
  try {
    const scores = await pineconeScores(question, flats)
    const relevant = new Set([...local.relevant, ...[...scores].filter(([, score]) => score >= PINECONE_RELEVANT).map(([id]) => id)])
    return { engine: "pinecone", terms: local.terms, scores, relevant }
  } catch (error) {
    console.warn(`[ask] Pinecone unavailable, using the local search: ${error instanceof Error ? error.message : error}`)
    return local
  }
}

/**
 * PetClaw Scalable Memory Retrieval (GBrain-style full recall)
 * ───────────────────────────────────────────────────────────
 * The persistent-memory ledger (pet.personality_modifiers.persistent_memories)
 * is a CAPPED corpus — consolidateMemories() trims it to MAX_MEMORY_ENTRIES (40).
 * That keeps the MEMORY.md block small, but it means anything older/lower-value
 * is gone from recall even though the raw row still sits in `pet_memories`.
 *
 * This module adds retrieval over the FULL `pet_memories` corpus — every
 * conversation / milestone / training / birth / generation row a pet ever
 * accumulated — and ranks the top-K most relevant for a given query. Unlike the
 * capped JSON ledger, this table grows unbounded (thousands of rows per pet),
 * which is the GBrain "large corpus" case.
 *
 * RANKING (shippable now — real, no provider needed):
 *   score = TF-IDF cosine(query, doc)              // lexical relevance
 *         + importance bonus                        // curated weight
 *         + recency decay bonus                     // exp half-life
 *   IDF is computed over the candidate window so common words ("the", "pet")
 *   contribute ~0 and rare query terms dominate — this is the meaningful
 *   improvement over the ledger's flat token-overlap counter.
 *
 * CANDIDATE FETCH (scale):
 *   For small corpora we score every row. For large ones we first narrow with a
 *   Postgres full-text prefilter (websearch_to_tsquery over a GIN index added in
 *   the 20260615..._memory_fts migration) so we only TF-IDF-rank a bounded
 *   candidate set. If the FTS index/extension isn't present (older DB, SQLite in
 *   tests), we transparently fall back to a bounded recency window — same API,
 *   no crash.
 *
 * UPGRADE PATH (NOT done — honest):
 *   Swapping TF-IDF cosine for embedding cosine is a drop-in at scoreCandidates().
 *   That needs (a) an embedding provider — none is wired today; every LLM call in
 *   this repo hits xAI Grok directly and xAI exposes no embeddings endpoint, so
 *   this would be the FIRST non-Grok dependency — and (b) a vector column. The
 *   recommended store is pgvector (`vector(1536)` col on pet_memories + ivfflat
 *   index); pgvector is NOT installed in this DB today. See EMBEDDING_UPGRADE below.
 */

import { prisma } from "@/lib/prisma";

// ── Tunables ──
const CANDIDATE_LIMIT = 400; // max rows pulled into memory for in-process ranking
const RECENCY_HALFLIFE_DAYS = 45; // softer than the ledger's 30d — long-tail recall
const MIN_TOKEN_LEN = 2; // drop 1-char tokens
const DEFAULT_K = 6;

// Stopwords kept tiny on purpose: TF-IDF already down-weights common terms, this
// just avoids them ever being the ONLY match.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been",
  "to", "of", "in", "on", "at", "for", "with", "you", "your", "i", "me", "my",
  "it", "this", "that", "we", "they", "he", "she", "do", "did", "does", "so",
]);

export interface RetrievedMemory {
  id: number;
  content: string;
  memoryType: string;
  emotion: string;
  importance: number;
  createdAt: Date;
  score: number;
}

interface CandidateRow {
  id: number;
  content: string;
  memory_type: string;
  emotion: string;
  importance: number;
  created_at: Date;
}

// ── Text helpers ──
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[(user(?::[^\]]+)?|pet)\]\s*/g, "") // strip session role tags
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((w) => w.length >= MIN_TOKEN_LEN && !STOPWORDS.has(w));
}

function recencyBonus(createdAt: Date): number {
  const ageDays = Math.max(0, (Date.now() - createdAt.getTime()) / 86_400_000);
  return Math.exp(-ageDays / RECENCY_HALFLIFE_DAYS); // 1.0 (now) → ~0 (old)
}

/**
 * Pull a bounded candidate set for ranking.
 *
 * Strategy:
 *   1. Try a Postgres FTS prefilter (websearch_to_tsquery) — only ranks rows
 *      that lexically match, so this scales to large corpora. Requires the GIN
 *      index from the memory_fts migration.
 *   2. On ANY failure (no FTS column, SQLite, syntax) fall back to a plain
 *      recency-ordered window via the Prisma client — always works.
 *
 * `excludeSessionLog` defaults true: raw turn-by-turn "[user] hi" rows are noisy
 * for fact recall; we rank durable memory rows (conversation/milestone/etc).
 */
async function fetchCandidates(
  petId: number,
  query: string,
  excludeSessionLog: boolean
): Promise<CandidateRow[]> {
  const qTokens = tokenize(query);
  // No usable query terms → recency window only (e.g. greeting-only message)
  if (qTokens.length > 0) {
    try {
      // websearch_to_tsquery is forgiving of arbitrary user text (won't throw on
      // punctuation the way to_tsquery does). content_tsv is the generated column
      // + GIN index created in the memory_fts migration.
      const sessionClause = excludeSessionLog
        ? "AND memory_type NOT LIKE 'session_%'"
        : "";
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT id, content, memory_type, emotion, importance, created_at
         FROM pet_memories
         WHERE pet_id = $1
           ${sessionClause}
           AND content_tsv @@ websearch_to_tsquery('simple', $2)
         ORDER BY created_at DESC
         LIMIT $3`,
        petId,
        qTokens.join(" "),
        CANDIDATE_LIMIT
      )) as CandidateRow[];
      if (rows.length > 0) return rows;
      // FTS matched nothing — fall through to recency window so we still return
      // *something* to TF-IDF rank (handles paraphrase / morphology misses).
    } catch {
      // content_tsv column or FTS not present → graceful fallback below.
    }
  }

  // Fallback / no-query path: bounded recency window via Prisma client.
  const rows = await prisma.petMemory.findMany({
    where: {
      pet_id: petId,
      ...(excludeSessionLog ? { NOT: { memory_type: { startsWith: "session_" } } } : {}),
    },
    orderBy: { created_at: "desc" },
    take: CANDIDATE_LIMIT,
    select: {
      id: true,
      content: true,
      memory_type: true,
      emotion: true,
      importance: true,
      created_at: true,
    },
  });
  return rows as unknown as CandidateRow[];
}

/**
 * TF-IDF cosine ranking over the candidate set. IDF is computed across the
 * candidates so within-window discriminative terms win. This is the REAL ranker
 * shipping today — pure CPU, no provider.
 */
function scoreCandidates(
  candidates: CandidateRow[],
  query: string,
  k: number
): RetrievedMemory[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0 || candidates.length === 0) {
    // No query signal: degrade to importance × recency (still useful — surfaces
    // the pet's most salient memories rather than nothing).
    return candidates
      .map((c) => ({
        id: c.id,
        content: c.content,
        memoryType: c.memory_type,
        emotion: c.emotion,
        importance: c.importance,
        createdAt: c.created_at,
        score: c.importance * recencyBonus(c.created_at),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  // Document frequency over candidates → IDF
  const docTokens = candidates.map((c) => tokenize(c.content));
  const df = new Map<string, number>();
  for (const toks of docTokens) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = candidates.length;
  const idf = (t: string) => Math.log(1 + N / (1 + (df.get(t) || 0)));

  // Query vector (TF-IDF). Repeated query terms count once — queries are short.
  const qVec = new Map<string, number>();
  for (const t of new Set(qTokens)) qVec.set(t, idf(t));
  const qNorm = Math.sqrt([...qVec.values()].reduce((s, w) => s + w * w, 0)) || 1;

  const scored = candidates.map((c, i) => {
    const toks = docTokens[i];
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);

    // Cosine over the intersection (only query terms can contribute to dot product)
    let dot = 0;
    let dNormSq = 0;
    for (const [t, freq] of tf) {
      const w = (freq / toks.length) * idf(t);
      dNormSq += w * w;
      if (qVec.has(t)) dot += w * qVec.get(t)!;
    }
    const dNorm = Math.sqrt(dNormSq) || 1;
    const cosine = dot / (qNorm * dNorm);

    // Blend: lexical relevance is primary; importance + recency are tie-breakers
    // that also let a slightly-less-matchy but critical/fresh memory edge ahead.
    const score =
      cosine * 1.0 +
      (c.importance / 5) * 0.25 +
      recencyBonus(c.created_at) * 0.2;

    return {
      id: c.id,
      content: c.content,
      memoryType: c.memory_type,
      emotion: c.emotion,
      importance: c.importance,
      createdAt: c.created_at,
      score,
    };
  });

  return scored
    .filter((s) => s.score > 0.02) // drop near-zero (no real lexical overlap)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * getRelevantMemories — GBrain-style top-K recall over the full pet_memories
 * corpus. This is the public entry point used by the chat route.
 *
 * @param petId  pet to recall for
 * @param query  the user's current message (or any retrieval query)
 * @param k      how many memories to return (default 6)
 * @param opts.includeSessionLog  also rank raw turn rows (default false)
 */
export async function getRelevantMemories(
  petId: number,
  query: string,
  k: number = DEFAULT_K,
  opts: { includeSessionLog?: boolean } = {}
): Promise<RetrievedMemory[]> {
  const excludeSessionLog = !opts.includeSessionLog;
  const candidates = await fetchCandidates(petId, query, excludeSessionLog);
  return scoreCandidates(candidates, query, k);
}

/**
 * Convenience formatter for prompt injection.
 */
export function formatRetrievedMemories(mems: RetrievedMemory[]): string {
  if (mems.length === 0) return "";
  return mems.map((m) => `- ${m.content}`).join("\n");
}

/* ────────────────────────────────────────────────────────────────────────────
 * EMBEDDING_UPGRADE (NOT IMPLEMENTED — the marked next step, do not claim done)
 * ────────────────────────────────────────────────────────────────────────────
 * To go from lexical TF-IDF to semantic recall:
 *
 * 1. DB: add pgvector + a column on pet_memories:
 *      CREATE EXTENSION IF NOT EXISTS vector;
 *      ALTER TABLE pet_memories ADD COLUMN embedding vector(1536);
 *      CREATE INDEX ON pet_memories USING ivfflat (embedding vector_cosine_ops);
 *    (pgvector is NOT installed in this database today.)
 *
 * 2. Provider: embed content on write + embed the query on read. There is NO
 *    embedding provider wired in this repo — every LLM call goes to xAI Grok,
 *    which has no embeddings endpoint. This would introduce the first non-Grok
 *    dependency (e.g. OpenAI text-embedding-3-small or a local model).
 *
 * 3. Swap fetchCandidates → vector ANN query:
 *      ORDER BY embedding <=> $queryEmbedding LIMIT CANDIDATE_LIMIT
 *    and replace cosine in scoreCandidates with the returned vector distance.
 *    The importance + recency blend below stays identical.
 * ──────────────────────────────────────────────────────────────────────────── */

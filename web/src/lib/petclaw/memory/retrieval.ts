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
import { callEmbedding } from "@/lib/llm/router";

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
  embedding?: unknown; // JSON float array when an embedding has been stored, else null
}

/** Coerce a stored embedding (JSONB → array, or a JSON string) to number[] | null. */
function asVec(v: unknown): number[] | null {
  let a = v;
  if (typeof a === "string") { try { a = JSON.parse(a); } catch { return null; } }
  return Array.isArray(a) && a.length > 0 && typeof a[0] === "number" ? (a as number[]) : null;
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 0 ? dot / d : 0;
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
        `SELECT id, content, memory_type, emotion, importance, created_at, embedding
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
      embedding: true,
    },
  });
  return rows as unknown as CandidateRow[];
}

// Reciprocal Rank Fusion constant. 60 is the standard default (Cormack et al.;
// also GBrain's). Larger k flattens the contribution of top ranks.
const RRF_K = 60;

// Source-tier boost (GBrain "source-tier"): durable memory types outrank chatty
// session turns when their other ranks are close.
function tierWeight(memoryType: string | null | undefined): number {
  switch (memoryType) {
    case "milestone":
    case "insight":
    case "core":
      return 1.5;
    case "fact":
    case "preference":
      return 1.2;
    default:
      return 1.0; // conversation / misc
  }
}

/**
 * Rank candidates with RECIPROCAL RANK FUSION (RRF) — GBrain's hybrid-search
 * approach (github.com/garrytan/gbrain: "vector + BM25 + reciprocal-rank fusion
 * + source-tier boost"). We fuse three independent rankers, each contributing
 * w/(k + rank):
 *   1. lexical relevance (TF-IDF cosine) — primary signal, weighted highest
 *   2. recency (created_at)
 *   3. source-tier × importance
 * RRF fuses RANKS not raw scores, so it's robust without hand-tuned score
 * blending. When an embedding provider lands, vector-ANN becomes a 4th RRF input
 * (see EMBEDDING_UPGRADE) — a drop-in addition, not a rewrite.
 *
 * Still the REAL ranker shipping today — pure CPU, no provider needed.
 */
function scoreCandidates(
  candidates: CandidateRow[],
  query: string,
  k: number,
  queryEmbedding?: number[] | null
): RetrievedMemory[] {
  if (candidates.length === 0) return [];
  const qTokens = tokenize(query);

  // ── Ranker 1: lexical TF-IDF cosine over the candidate set ──
  const lex = new Map<number, number>(); // candidate id -> cosine in [0,1]
  if (qTokens.length > 0) {
    const docTokens = candidates.map((c) => tokenize(c.content));
    const df = new Map<string, number>();
    for (const toks of docTokens) for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
    const N = candidates.length;
    const idf = (t: string) => Math.log(1 + N / (1 + (df.get(t) || 0)));
    const qVec = new Map<string, number>();
    for (const t of new Set(qTokens)) qVec.set(t, idf(t));
    const qNorm = Math.sqrt([...qVec.values()].reduce((s, w) => s + w * w, 0)) || 1;
    candidates.forEach((c, i) => {
      const toks = docTokens[i];
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      let dot = 0;
      let dNormSq = 0;
      for (const [t, freq] of tf) {
        const w = (freq / toks.length) * idf(t);
        dNormSq += w * w;
        if (qVec.has(t)) dot += w * qVec.get(t)!;
      }
      const dNorm = Math.sqrt(dNormSq) || 1;
      lex.set(c.id, dot / (qNorm * dNorm));
    });
  }

  // ── Ranker 4 (optional): semantic cosine vs the query embedding (GBrain's
  // vector signal). Populated only when memories carry stored embeddings AND a
  // query embedding was provided; otherwise this ranker is simply absent and
  // retrieval stays lexical — zero behavior change for non-embedding pets. ──
  const vec = new Map<number, number>();
  if (queryEmbedding && queryEmbedding.length) {
    for (const c of candidates) {
      const e = asVec(c.embedding);
      if (e) vec.set(c.id, Math.max(0, cosine(queryEmbedding, e)));
    }
  }
  const hasVec = vec.size > 0;

  // With a query, keep candidates with real lexical overlap OR a strong semantic
  // match (embeddings surface paraphrases that lexical scoring misses). No query
  // → RRF of recency + source-tier returns the pet's most salient memories.
  const pool = qTokens.length > 0
    ? candidates.filter((c) => (lex.get(c.id) || 0) > 0 || (vec.get(c.id) || 0) >= 0.75)
    : candidates;
  if (pool.length === 0) return [];

  // 1-based rank of each candidate under a given signal (descending).
  const rankBy = (scoreFn: (c: CandidateRow) => number) => {
    const order = [...pool].sort((a, b) => scoreFn(b) - scoreFn(a));
    const m = new Map<number, number>();
    order.forEach((c, i) => m.set(c.id, i + 1));
    return m;
  };
  const rLex = rankBy((c) => lex.get(c.id) || 0);
  const rRec = rankBy((c) => c.created_at.getTime());
  const rImp = rankBy((c) => c.importance * tierWeight(c.memory_type));
  const rVec = hasVec ? rankBy((c) => vec.get(c.id) || 0) : null;

  // RRF + source-tier/recency boost. Lexical + semantic weighted highest.
  const W_LEX = 1.0;
  const W_REC = 0.5;
  const W_IMP = 0.5;
  const W_VEC = 1.0;
  const fused = pool.map((c) => ({
    id: c.id,
    content: c.content,
    memoryType: c.memory_type,
    emotion: c.emotion,
    importance: c.importance,
    createdAt: c.created_at,
    score:
      W_LEX / (RRF_K + (rLex.get(c.id) || pool.length)) +
      W_REC / (RRF_K + (rRec.get(c.id) || pool.length)) +
      W_IMP / (RRF_K + (rImp.get(c.id) || pool.length)) +
      (rVec ? W_VEC / (RRF_K + (rVec.get(c.id) || pool.length)) : 0),
  }));

  return fused.sort((a, b) => b.score - a.score).slice(0, k);
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
  // Semantic ranking only if some candidates already carry stored embeddings
  // (i.e. the backfill has run for this pet) — this keeps the common, non-
  // embedding case free of any embedding-API call. callEmbedding itself returns
  // null unless the owner connected an OpenAI/Google key.
  let queryEmbedding: number[] | null = null;
  if (query.trim() && candidates.some((c) => asVec(c.embedding))) {
    const out = await callEmbedding([query.trim()], petId).catch(() => null);
    queryEmbedding = out && out[0] ? out[0] : null;
  }
  return scoreCandidates(candidates, query, k, queryEmbedding);
}

/**
 * Convenience formatter for prompt injection.
 */
export function formatRetrievedMemories(mems: RetrievedMemory[]): string {
  if (mems.length === 0) return "";
  return mems.map((m) => `- ${m.content}`).join("\n");
}

/* ────────────────────────────────────────────────────────────────────────────
 * SEMANTIC RECALL — IMPLEMENTED (no pgvector needed at this scale)
 * ────────────────────────────────────────────────────────────────────────────
 * Embeddings are stored as a plain JSONB float array on pet_memories.embedding
 * (migration 20260615000200) and fused into the RRF above as a 4th ranker via
 * app-side cosine. Because per-pet retrieval is candidate-limited (~400 rows),
 * exact app-side cosine is fast and pgvector is unnecessary here.
 *
 * Activation requires only an embedding key (Grok has none): the owner connects
 * an OpenAI/Google model on the PetClaw screen (or via the CLI), then scripts/embed-memories.mjs backfills
 * pet_memories.embedding. The query is embedded lazily on read (only when stored
 * embeddings exist). Until then, retrieval is the lexical RRF — no behavior change.
 *
 * SCALE UPGRADE (only if a pet ever exceeds tens of thousands of memories): swap
 * the JSONB column for pgvector `vector(1536)` + HNSW and push the ANN into the
 * candidate query. The RRF fusion above stays identical.
 * ──────────────────────────────────────────────────────────────────────────── */

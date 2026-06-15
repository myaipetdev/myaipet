-- Scalable memory retrieval: Postgres full-text prefilter over pet_memories.
--
-- Adds a generated tsvector column + GIN index so getRelevantMemories() can
-- narrow a large per-pet corpus to a bounded lexical-match candidate set BEFORE
-- TF-IDF ranking in app code. This is the scale path; the app still works
-- without it (retrieval.ts falls back to a recency window).
--
-- Additive only: no existing column is altered, no data is rewritten. The
-- generated column backfills automatically for existing rows.

-- 'simple' config = no stemming/language assumptions; matches the app-side
-- tokenizer which also does plain lowercase splitting. Generated + STORED so it
-- stays in sync on every INSERT/UPDATE with zero app changes.
ALTER TABLE "pet_memories"
  ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("content", ''))) STORED;

CREATE INDEX IF NOT EXISTS "pet_memories_content_tsv_idx"
  ON "pet_memories" USING GIN ("content_tsv");

-- Composite index to keep the per-pet candidate scan + recency ORDER BY fast
-- once a pet accumulates thousands of rows.
CREATE INDEX IF NOT EXISTS "pet_memories_pet_id_created_at_idx"
  ON "pet_memories" ("pet_id", "created_at" DESC);

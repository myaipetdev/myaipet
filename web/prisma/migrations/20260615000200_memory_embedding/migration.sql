-- Optional embedding column for GBrain-style vector recall. Additive only — a
-- nullable JSONB column (NULL-default add is metadata-only in PG11+, no rewrite).
-- Stored as a JSON float array; cosine is computed app-side over the bounded
-- candidate set (no pgvector needed at per-pet scale). Populated only once an
-- owner connects an embedding-capable key.
ALTER TABLE "pet_memories" ADD COLUMN IF NOT EXISTS "embedding" JSONB;

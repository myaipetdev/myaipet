-- Preserve real session boundaries and participants instead of encoding all
-- metadata into memory_type/content. Columns stay nullable so pre-migration
-- non-session memories and legacy rows remain valid.
ALTER TABLE "pet_memories"
  ADD COLUMN "session_id" VARCHAR(128),
  ADD COLUMN "platform" VARCHAR(20),
  ADD COLUMN "speaker_id" VARCHAR(100),
  ADD COLUMN "role" VARCHAR(10);

-- Expand-only production migration: do not scan/rewrite every historic memory
-- or take a write-blocking CREATE INDEX lock in the release transaction.
-- Reads retain the legacy memory_type/content fallback. Any historic backfill
-- and concurrent index build must run later as a measured, resumable operation
-- after production table size and lock impact have been inspected.

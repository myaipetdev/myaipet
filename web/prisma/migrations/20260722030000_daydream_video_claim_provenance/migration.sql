-- Expand-only durable claim/provenance fence for memory-derived videos.
--
-- Existing Generation rows are deliberately classified as "unclassified".
-- The generic public paths allowlist only an explicit "user" source, so the
-- release is private-by-default without running an unbounded historical UPDATE
-- inside `prisma migrate deploy`. A measured, resumable, off-release backfill
-- can later classify rows whose provenance is independently provable.
--
-- No index is built inline on the release path; candidate volume is bounded,
-- and any measured production index will be added CONCURRENTLY later.
ALTER TABLE "generations"
  ADD COLUMN "source_kind" VARCHAR(32) NOT NULL DEFAULT 'unclassified';

ALTER TABLE "pet_insights"
  ADD COLUMN "conversion_status" VARCHAR(20) NOT NULL DEFAULT 'ready',
  ADD COLUMN "conversion_memory_epoch" INTEGER,
  ADD COLUMN "conversion_claimed_at" TIMESTAMP(3),
  ADD COLUMN "conversion_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "conversion_retry_at" TIMESTAMP(3),
  ADD COLUMN "conversion_error" TEXT;

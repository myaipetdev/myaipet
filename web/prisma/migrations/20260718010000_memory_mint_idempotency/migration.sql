-- A memory mint claim is idempotent only if memory_id has one authoritative
-- row. Lock both participating tables so the validation and index creation are
-- one race-free operation. Existing data is never guessed at or deleted: any
-- ambiguity aborts the migration with an actionable error.
BEGIN;

LOCK TABLE "memory_nfts", "pet_memories" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "memory_nfts"
     WHERE "memory_id" IS NOT NULL
     GROUP BY "memory_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'MEMORY_ID_DUPLICATES: resolve duplicate memory_nfts.memory_id rows before retrying';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "memory_nfts" AS mn
      LEFT JOIN "pet_memories" AS pm ON pm."id" = mn."memory_id"
     WHERE mn."memory_id" IS NOT NULL
       AND (pm."id" IS NULL OR pm."pet_id" <> mn."pet_id")
  ) THEN
    RAISE EXCEPTION 'MEMORY_ID_OWNERSHIP_MISMATCH: resolve orphaned or cross-pet memory links before retrying';
  END IF;
END
$$;

ALTER TABLE "memory_nfts"
  ADD COLUMN "mint_status" VARCHAR(20) NOT NULL DEFAULT 'recorded',
  ADD COLUMN "mint_claim_token" VARCHAR(36),
  ADD COLUMN "mint_claimed_at" TIMESTAMP(3),
  ADD COLUMN "mint_attempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "memory_nfts"
   SET "mint_status" = 'submitted'
 WHERE "mint_tx_hash" IS NOT NULL;

CREATE UNIQUE INDEX "memory_nfts_memory_id_key"
  ON "memory_nfts"("memory_id");

COMMIT;

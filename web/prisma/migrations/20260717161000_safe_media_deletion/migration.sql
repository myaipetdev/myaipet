-- Pet dates are shared records. Removing one pet must detach that participant,
-- not destroy the other owner's history.
ALTER TABLE "pet_dates"
  ALTER COLUMN "pet_a_id" DROP NOT NULL,
  ALTER COLUMN "pet_b_id" DROP NOT NULL;

-- Historical releases had no pet foreign keys, so a hard-deleted pet may
-- already have left an orphan participant id. Detach those rows before the
-- validated constraints are added or migrate deploy would fail mid-release.
UPDATE "pet_dates" AS pd
SET "pet_a_id" = NULL
WHERE pd."pet_a_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "pets" AS p WHERE p."id" = pd."pet_a_id");

UPDATE "pet_dates" AS pd
SET "pet_b_id" = NULL
WHERE pd."pet_b_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "pets" AS p WHERE p."id" = pd."pet_b_id");

-- The FK closes the create-vs-delete race. A date committed before deletion is
-- detached by ON DELETE SET NULL; one attempted after deletion is rejected and
-- its credit debit rolls back in the same transaction.
ALTER TABLE "pet_dates"
  ADD CONSTRAINT "pet_dates_pet_a_id_fkey"
    FOREIGN KEY ("pet_a_id") REFERENCES "pets"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "pet_dates_pet_b_id_fkey"
    FOREIGN KEY ("pet_b_id") REFERENCES "pets"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Durable outbox for physical media deletion. Rows are inserted in the same
-- transaction that removes DB ownership and retried until storage cleanup
-- succeeds; object_ref is canonical and globally idempotent.
CREATE TABLE "media_deletion_tasks" (
    "id" SERIAL NOT NULL,
    "object_ref" VARCHAR(700) NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "source_pet_id" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_deletion_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_deletion_tasks_object_ref_key"
    ON "media_deletion_tasks"("object_ref");
CREATE INDEX "media_deletion_tasks_source_pet_id_idx"
    ON "media_deletion_tasks"("source_pet_id");
CREATE INDEX "media_deletion_tasks_created_at_idx"
    ON "media_deletion_tasks"("created_at");

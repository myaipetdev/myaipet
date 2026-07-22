-- Revoke in-flight inference/retention work after any owner memory correction
-- or deletion, preventing stale session, ledger, reflection, or pattern writes.
ALTER TABLE "pets"
  ADD COLUMN "memory_epoch" INTEGER NOT NULL DEFAULT 0;

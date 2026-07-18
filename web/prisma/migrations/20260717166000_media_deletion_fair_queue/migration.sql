-- The cleanup worker reschedules retained/shared references by updated_at.
-- This index keeps the oldest-reservation scan fair and bounded as the outbox
-- grows, with id as a deterministic tie-breaker.
CREATE INDEX "media_deletion_tasks_updated_at_id_idx"
  ON "media_deletion_tasks"("updated_at", "id");

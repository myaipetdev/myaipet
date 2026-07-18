-- Persist the owner-protected training ZIP so normal pet deletion can enqueue
-- physical cleanup. Legacy rows remain NULL and are inventoried by their
-- server-issued `lora-train/pet-<id>-` prefix during deletion.
ALTER TABLE "pet_loras"
  ADD COLUMN "training_archive_ref" VARCHAR(700);

-- Remove historical battle rows whose player no longer exists. A replay has
-- no surviving owner in that case and cannot be served safely.
DELETE FROM "battle_history" AS bh
WHERE NOT EXISTS (
  SELECT 1 FROM "pets" AS p WHERE p."id" = bh."player_pet_id"
);

-- Redact already-orphaned human-opponent snapshots before adding the FK. PvE
-- rows intentionally keep their NPC presentation data.
UPDATE "battle_history" AS bh
SET "opponent_pet_id" = NULL,
    "opponent_name" = 'Deleted Pet',
    "opponent_avatar" = NULL,
    "battle_log" = NULL,
    "seed" = NULL
WHERE (
    bh."opponent_pet_id" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "pets" AS p WHERE p."id" = bh."opponent_pet_id")
  )
  OR (bh."battle_type" = 'pvp' AND bh."opponent_pet_id" IS NULL);

CREATE INDEX "battle_history_opponent_pet_id_idx"
  ON "battle_history"("opponent_pet_id");

-- Close create-vs-delete races at the database boundary. The BEFORE trigger
-- redacts snapshots in the same transaction as pet deletion; the FKs ensure a
-- battle cannot commit a dangling player/opponent id after that trigger runs.
ALTER TABLE "battle_history"
  ADD CONSTRAINT "battle_history_player_pet_id_fkey"
    FOREIGN KEY ("player_pet_id") REFERENCES "pets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "battle_history_opponent_pet_id_fkey"
    FOREIGN KEY ("opponent_pet_id") REFERENCES "pets"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "redact_deleted_pet_battle_snapshots"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "battle_history"
  SET "opponent_pet_id" = NULL,
      "opponent_name" = 'Deleted Pet',
      "opponent_avatar" = NULL,
      "battle_log" = NULL,
      "seed" = NULL
  WHERE "opponent_pet_id" = OLD."id";
  RETURN OLD;
END;
$$;

CREATE TRIGGER "redact_battle_snapshots_before_pet_delete"
BEFORE DELETE ON "pets"
FOR EACH ROW
EXECUTE FUNCTION "redact_deleted_pet_battle_snapshots"();

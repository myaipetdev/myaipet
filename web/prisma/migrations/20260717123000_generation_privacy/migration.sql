-- Privacy boundary for generated media.
-- Existing rows deliberately remain private: completion was never an explicit
-- publication action. Pet links are backfilled only from exact provenance;
-- owner/species similarity is never enough to claim or cascade-delete media.
ALTER TABLE "generations"
  ADD COLUMN "pet_id" INTEGER,
  ADD COLUMN "visibility" VARCHAR(12) NOT NULL DEFAULT 'private';

UPDATE "generations" AS g
SET "pet_id" = pi."pet_id"
FROM "pet_insights" AS pi
JOIN "pets" AS p ON p."id" = pi."pet_id"
WHERE pi."video_generation_id" = g."id"
  AND p."user_id" = g."user_id";

UPDATE "generations" AS g
SET "pet_id" = paa."pet_id"
FROM "pet_autonomous_actions" AS paa
JOIN "pets" AS p ON p."id" = paa."pet_id"
WHERE paa."generation_id" = g."id"
  AND p."user_id" = g."user_id"
  AND g."pet_id" IS NULL;

-- Never turn a historical cross-owner provenance bug into a cascade-delete
-- ownership claim. Mismatched links deliberately remain unassigned/private.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "generations" AS g
    JOIN "pets" AS p ON p."id" = g."pet_id"
    WHERE p."user_id" <> g."user_id"
  ) THEN
    RAISE EXCEPTION 'generation privacy backfill produced a cross-owner pet link';
  END IF;
END
$$;

CREATE INDEX "generations_pet_id_idx" ON "generations"("pet_id");
CREATE INDEX "generations_visibility_status_created_at_idx"
  ON "generations"("visibility", "status", "created_at");

ALTER TABLE "generations"
  ADD CONSTRAINT "generations_pet_id_fkey"
  FOREIGN KEY ("pet_id") REFERENCES "pets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

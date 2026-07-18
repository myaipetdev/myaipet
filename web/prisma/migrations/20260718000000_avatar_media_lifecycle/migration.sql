-- Short-lived avatar previews need durable ownership before bytes are exposed.
-- Pending rows are claimed by Pet create/PATCH or atomically moved into the
-- existing media-deletion outbox after their TTL.
CREATE TABLE "avatar_media_objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "object_ref" VARCHAR(700) NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "pet_id" INTEGER,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avatar_media_objects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "avatar_media_objects_claim_state_check" CHECK (
      ("pet_id" IS NULL AND "claimed_at" IS NULL)
      OR ("pet_id" IS NOT NULL AND "claimed_at" IS NOT NULL)
    ),
    CONSTRAINT "avatar_media_objects_owner_path_check" CHECK (
      "object_ref" ~ (
        '^/uploads/avatars/' || "owner_user_id"::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif)$'
      )
    )
);

CREATE UNIQUE INDEX "avatar_media_objects_object_ref_key"
  ON "avatar_media_objects"("object_ref");
CREATE INDEX "avatar_media_objects_owner_user_id_expires_at_idx"
  ON "avatar_media_objects"("owner_user_id", "expires_at");
CREATE INDEX "avatar_media_objects_expires_at_id_idx"
  ON "avatar_media_objects"("expires_at", "id");
CREATE INDEX "avatar_media_objects_pet_id_idx"
  ON "avatar_media_objects"("pet_id");

ALTER TABLE "avatar_media_objects"
  ADD CONSTRAINT "avatar_media_objects_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "avatar_media_objects_pet_id_fkey"
    FOREIGN KEY ("pet_id") REFERENCES "pets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- A preview may only be claimed by one of its owner's pets. Keeping this at
-- the database boundary closes direct-SQL and future-call-site bypasses.
CREATE FUNCTION "enforce_avatar_media_pet_owner"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "owner_matches" BOOLEAN;
BEGIN
  IF NEW."pet_id" IS NOT NULL THEN
    -- Resolve pets in the trigger table's own schema, not the caller-controlled
    -- search_path. format(%I) keeps the dynamic identifier injection-safe.
    EXECUTE format(
      'SELECT EXISTS (
         SELECT 1 FROM %I."pets" AS p
         WHERE p."id" = $1 AND p."user_id" = $2
       )',
      TG_TABLE_SCHEMA
    ) INTO "owner_matches" USING NEW."pet_id", NEW."owner_user_id";
    IF NOT "owner_matches" THEN
      RAISE EXCEPTION 'avatar media pet owner mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "avatar_media_pet_owner_guard"
BEFORE INSERT OR UPDATE OF "pet_id", "owner_user_id"
ON "avatar_media_objects"
FOR EACH ROW
EXECUTE FUNCTION "enforce_avatar_media_pet_owner"();

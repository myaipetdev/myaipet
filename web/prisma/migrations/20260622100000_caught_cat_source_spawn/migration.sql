-- Wild Encounters: tag each catch with its source + dedup wild spawns per user.
-- Additive; existing rows default to 'camera'.
ALTER TABLE "caught_cats" ADD COLUMN IF NOT EXISTS "source" VARCHAR(10) NOT NULL DEFAULT 'camera';
ALTER TABLE "caught_cats" ADD COLUMN IF NOT EXISTS "spawn_key" VARCHAR(64);
-- Per-user uniqueness on spawn_key (NULLs are distinct in Postgres → many
-- camera catches per user remain allowed; each wild spawn catchable once).
CREATE UNIQUE INDEX IF NOT EXISTS "caught_cats_owner_spawn_key" ON "caught_cats" ("owner_user_id", "spawn_key");

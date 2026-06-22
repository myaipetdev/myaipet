-- Cat Catch collectibles. Additive only — new table, no existing column altered.
-- A caught cat is a lightweight creature (capture photo + game stats rolled by
-- rarity at catch time); lat/lng power the nearby-catches map.

CREATE TABLE IF NOT EXISTS "caught_cats" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "breed" VARCHAR(40) NOT NULL,
    "rarity" VARCHAR(12) NOT NULL,
    "element" VARCHAR(10) NOT NULL,
    "hp" INTEGER NOT NULL,
    "atk" INTEGER NOT NULL,
    "def" INTEGER NOT NULL,
    "spd" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "photo_path" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "caught_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "caught_cats_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "caught_cats_owner_user_id_idx" ON "caught_cats" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "caught_cats_lat_lng_idx" ON "caught_cats" ("lat", "lng");

-- P0 exchange-DD remediation: community-map consent + exact-duplicate guard.
-- Additive only: existing catches remain private and no row is deleted.
-- Production currently has 15 rows, but fail instead of waiting indefinitely
-- if an unexpected long transaction holds a conflicting table lock.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE "caught_cats" ADD COLUMN "map_public" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "caught_cats" ADD COLUMN "photo_hash" VARCHAR(64);

CREATE INDEX "caught_cats_map_public_lat_lng_idx"
  ON "caught_cats"("map_public", "lat", "lng");

CREATE INDEX "caught_cats_owner_user_id_photo_hash_idx"
  ON "caught_cats"("owner_user_id", "photo_hash");

CREATE TABLE "catch_photo_reservations" (
  "owner_user_id" INTEGER NOT NULL,
  "photo_hash" VARCHAR(64) NOT NULL,
  "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catch_photo_reservations_pkey" PRIMARY KEY ("owner_user_id", "photo_hash"),
  CONSTRAINT "catch_photo_reservations_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "catch_photo_reservations_reserved_at_idx"
  ON "catch_photo_reservations"("reserved_at");

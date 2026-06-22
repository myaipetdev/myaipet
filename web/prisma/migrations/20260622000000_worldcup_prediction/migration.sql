-- World Cup 2026 champion predictions. Additive only.
CREATE TABLE IF NOT EXISTS "world_cup_predictions" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "country_code" VARCHAR(4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "world_cup_predictions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "world_cup_predictions_owner_user_id_key" ON "world_cup_predictions" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "world_cup_predictions_country_code_idx" ON "world_cup_predictions" ("country_code");

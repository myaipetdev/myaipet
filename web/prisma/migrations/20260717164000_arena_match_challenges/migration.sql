-- Ranked Arena rewards require a short-lived, server-selected opponent pair.
-- Store only a hash of the bearer challenge and atomically stamp consumed_at
-- in the same transaction as the daily claim and every reward.
CREATE TABLE "arena_match_challenges" (
    "id" SERIAL NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "player_pet_id" INTEGER NOT NULL,
    "opponent_pet_id" INTEGER NOT NULL,
    "player_level" INTEGER NOT NULL,
    "opponent_level" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arena_match_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "arena_match_challenges_token_hash_key"
    ON "arena_match_challenges"("token_hash");

CREATE INDEX "arena_match_challenges_user_id_player_pet_id_expires_at_idx"
    ON "arena_match_challenges"("user_id", "player_pet_id", "expires_at");

CREATE INDEX "arena_match_challenges_expires_at_idx"
    ON "arena_match_challenges"("expires_at");

ALTER TABLE "arena_match_challenges"
    ADD CONSTRAINT "arena_match_challenges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "arena_match_challenges"
    ADD CONSTRAINT "arena_match_challenges_player_pet_id_fkey"
    FOREIGN KEY ("player_pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "arena_match_challenges"
    ADD CONSTRAINT "arena_match_challenges_opponent_pet_id_fkey"
    FOREIGN KEY ("opponent_pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

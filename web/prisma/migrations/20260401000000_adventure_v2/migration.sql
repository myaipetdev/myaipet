-- Adventure V2: ADD ONLY migration (safe for shared DB)
-- Does NOT drop any existing tables

-- 1. Add 'element' column to pets
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "element" VARCHAR(10) NOT NULL DEFAULT 'normal';

-- 2. Add 'slot' column to pet_skills
ALTER TABLE "pet_skills" ADD COLUMN IF NOT EXISTS "slot" INTEGER;
CREATE INDEX IF NOT EXISTS "pet_skills_pet_id_slot_idx" ON "pet_skills"("pet_id", "slot");

-- 3. Create battle_history table
CREATE TABLE IF NOT EXISTS "battle_history" (
    "id" SERIAL PRIMARY KEY,
    "player_pet_id" INTEGER NOT NULL,
    "opponent_pet_id" INTEGER,
    "opponent_name" VARCHAR(50) NOT NULL,
    "won" BOOLEAN NOT NULL,
    "turns" INTEGER NOT NULL,
    "player_hp_left" INTEGER NOT NULL DEFAULT 0,
    "exp_gained" INTEGER NOT NULL DEFAULT 0,
    "points_earned" INTEGER NOT NULL DEFAULT 0,
    "skill_drop_key" VARCHAR(30),
    "tx_hash" VARCHAR(66),
    "battle_type" VARCHAR(20) NOT NULL DEFAULT 'pvp',
    "stage_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "battle_history_player_pet_id_idx" ON "battle_history"("player_pet_id");

-- 4. Create play_sessions table
CREATE TABLE IF NOT EXISTS "play_sessions" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "play_sessions_user_id_date_key" ON "play_sessions"("user_id", "date");

-- 5. Create daily_training_logs table
CREATE TABLE IF NOT EXISTS "daily_training_logs" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "battles" INTEGER NOT NULL DEFAULT 0,
    "exp_earned" INTEGER NOT NULL DEFAULT 0,
    "credits_spent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "daily_training_logs_user_id_pet_id_date_key" ON "daily_training_logs"("user_id", "pet_id", "date");

-- 6. Create reward_redemptions table (was in schema but never migrated)
CREATE TABLE IF NOT EXISTS "reward_redemptions" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "reward_id" INTEGER NOT NULL,
    "reward_name" VARCHAR(60) NOT NULL,
    "points_spent" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "delivery_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "reward_redemptions_user_id_idx" ON "reward_redemptions"("user_id");

-- 7. Create pve_progress table (PvE boss stage tracking)
CREATE TABLE IF NOT EXISTS "pve_progress" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "stage_id" INTEGER NOT NULL DEFAULT 1,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "best_turns" INTEGER,
    "best_hp_left" INTEGER,
    "cleared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "pve_progress_user_id_pet_id_stage_id_key" ON "pve_progress"("user_id", "pet_id", "stage_id");
CREATE INDEX IF NOT EXISTS "pve_progress_user_id_idx" ON "pve_progress"("user_id");

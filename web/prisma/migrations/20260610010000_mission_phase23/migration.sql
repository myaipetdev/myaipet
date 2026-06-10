-- Mission system Phase 2 + 3
-- hourly_drops, periodic_missions, streak_buddies, streak_sos, pet_dates
-- + adds user FK to existing user_subscriptions

-- ── hourly_drops ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "hourly_drops" (
  "id"           SERIAL           NOT NULL,
  "kind"         VARCHAR(30)      NOT NULL,
  "label"        VARCHAR(80)      NOT NULL,
  "emoji"        VARCHAR(8)       NOT NULL,
  "multiplier_x" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  "applies_to"   VARCHAR(20)      NOT NULL,
  "starts_at"    TIMESTAMP(3)     NOT NULL,
  "ends_at"      TIMESTAMP(3)     NOT NULL,
  "created_at"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hourly_drops_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "hourly_drops_window_idx" ON "hourly_drops"("starts_at","ends_at");

-- ── periodic_missions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "periodic_missions" (
  "id"           SERIAL        NOT NULL,
  "user_id"      INTEGER       NOT NULL,
  "period"       VARCHAR(8)    NOT NULL,
  "period_key"   VARCHAR(10)   NOT NULL,
  "mission_id"   VARCHAR(60)   NOT NULL,
  "category"     VARCHAR(20)   NOT NULL,
  "title"        VARCHAR(160)  NOT NULL,
  "target"       INTEGER       NOT NULL,
  "progress"     INTEGER       NOT NULL DEFAULT 0,
  "points"       INTEGER       NOT NULL,
  "status"       VARCHAR(20)   NOT NULL DEFAULT 'pending',
  "completed_at" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "periodic_missions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "periodic_missions_user_period_key"
  ON "periodic_missions"("user_id","period","period_key","mission_id");
CREATE INDEX IF NOT EXISTS "periodic_missions_user_period_idx"
  ON "periodic_missions"("user_id","period_key");
ALTER TABLE "periodic_missions" ADD CONSTRAINT "periodic_missions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- ── streak_buddies ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "streak_buddies" (
  "id"             SERIAL        NOT NULL,
  "user_a_id"      INTEGER       NOT NULL,
  "user_b_id"      INTEGER       NOT NULL,
  "status"         VARCHAR(12)   NOT NULL DEFAULT 'pending',
  "shared_streak"  INTEGER       NOT NULL DEFAULT 0,
  "last_active_a"  VARCHAR(10),
  "last_active_b"  VARCHAR(10),
  "created_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_at"    TIMESTAMP(3),
  "ended_at"       TIMESTAMP(3),
  CONSTRAINT "streak_buddies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "streak_buddies_pair_key" ON "streak_buddies"("user_a_id","user_b_id");
CREATE INDEX IF NOT EXISTS "streak_buddies_a_idx" ON "streak_buddies"("user_a_id");
CREATE INDEX IF NOT EXISTS "streak_buddies_b_idx" ON "streak_buddies"("user_b_id");
ALTER TABLE "streak_buddies" ADD CONSTRAINT "streak_buddies_a_fkey"
  FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "streak_buddies" ADD CONSTRAINT "streak_buddies_b_fkey"
  FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- ── streak_sos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "streak_sos" (
  "id"             SERIAL        NOT NULL,
  "sender_id"      INTEGER       NOT NULL,
  "sender_streak"  INTEGER       NOT NULL,
  "expires_at"     TIMESTAMP(3)  NOT NULL,
  "helped_by_id"   INTEGER,
  "helped_at"      TIMESTAMP(3),
  "credits_paid"   INTEGER       NOT NULL DEFAULT 0,
  "message"        VARCHAR(280),
  "created_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "streak_sos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "streak_sos_expires_idx" ON "streak_sos"("expires_at");
CREATE INDEX IF NOT EXISTS "streak_sos_sender_idx" ON "streak_sos"("sender_id","created_at");
ALTER TABLE "streak_sos" ADD CONSTRAINT "streak_sos_sender_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "streak_sos" ADD CONSTRAINT "streak_sos_helper_fkey"
  FOREIGN KEY ("helped_by_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- ── pet_dates ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pet_dates" (
  "id"           SERIAL        NOT NULL,
  "pet_a_id"     INTEGER       NOT NULL,
  "pet_b_id"     INTEGER       NOT NULL,
  "initiator_id" INTEGER       NOT NULL,
  "log"          TEXT          NOT NULL,
  "vibe"         VARCHAR(40)   NOT NULL,
  "friendship"   INTEGER       NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pet_dates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pet_dates_a_idx" ON "pet_dates"("pet_a_id");
CREATE INDEX IF NOT EXISTS "pet_dates_b_idx" ON "pet_dates"("pet_b_id");
CREATE INDEX IF NOT EXISTS "pet_dates_initiator_idx" ON "pet_dates"("initiator_id","created_at");
ALTER TABLE "pet_dates" ADD CONSTRAINT "pet_dates_initiator_fkey"
  FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE CASCADE;

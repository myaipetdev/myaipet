-- Mission system (Phase 1) — daily missions + mission-streak + paid streak items
-- See web/src/lib/missions/* for the logic that drives these tables.

-- ── daily_missions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "daily_missions" (
  "id"           SERIAL        NOT NULL,
  "user_id"      INTEGER       NOT NULL,
  "date"         VARCHAR(10)   NOT NULL,
  "mission_id"   VARCHAR(60)   NOT NULL,
  "category"     VARCHAR(20)   NOT NULL,
  "title"        VARCHAR(120)  NOT NULL,
  "points"       INTEGER       NOT NULL,
  "status"       VARCHAR(20)   NOT NULL DEFAULT 'pending',
  "completed_at" TIMESTAMP(3),
  "bonus_x"      DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "created_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_missions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "daily_missions_user_date_mission_key"
  ON "daily_missions"("user_id","date","mission_id");
CREATE INDEX IF NOT EXISTS "daily_missions_user_date_idx" ON "daily_missions"("user_id","date");
CREATE INDEX IF NOT EXISTS "daily_missions_date_idx" ON "daily_missions"("date");
ALTER TABLE "daily_missions" ADD CONSTRAINT "daily_missions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- ── user_streaks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_streaks" (
  "user_id"              INTEGER       NOT NULL,
  "current_streak"       INTEGER       NOT NULL DEFAULT 0,
  "longest_streak"       INTEGER       NOT NULL DEFAULT 0,
  "last_completed_date"  VARCHAR(10),
  "shields_owned"        INTEGER       NOT NULL DEFAULT 0,
  "shields_used"         INTEGER       NOT NULL DEFAULT 0,
  "last_shield_used_at"  TIMESTAMP(3),
  "total_missions_done"  INTEGER       NOT NULL DEFAULT 0,
  "total_points_earned"  INTEGER       NOT NULL DEFAULT 0,
  "pending_apology"      BOOLEAN       NOT NULL DEFAULT false,
  "pending_apology_days" INTEGER       NOT NULL DEFAULT 0,
  "updated_at"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("user_id")
);
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- ── streak_purchases ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "streak_purchases" (
  "id"             SERIAL           NOT NULL,
  "user_id"        INTEGER          NOT NULL,
  "kind"           VARCHAR(30)      NOT NULL,
  "price_usd"      DOUBLE PRECISION NOT NULL,
  "paid_via"       VARCHAR(20)      NOT NULL,
  "paid_credits"   INTEGER,
  "tx_hash"        VARCHAR(66),
  "streak_before"  INTEGER          NOT NULL,
  "streak_after"   INTEGER          NOT NULL,
  "created_at"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "streak_purchases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "streak_purchases_user_id_created_at_idx"
  ON "streak_purchases"("user_id","created_at");
ALTER TABLE "streak_purchases" ADD CONSTRAINT "streak_purchases_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

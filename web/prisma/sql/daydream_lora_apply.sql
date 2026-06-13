-- ════════════════════════════════════════════════════════════════════════
-- Daydream(+video) + Pet-LoRA schema — self-contained, idempotent applier.
--
-- For the AWS RDS (production) database. Safe to run anywhere with the RDS
-- connection string and no other dependencies:
--
--   On the EC2 box (has VPC access to RDS + the Secrets Manager secret):
--     RDS_URL="$(aws secretsmanager get-secret-value \
--       --region ap-northeast-2 --secret-id petclaw/database-url \
--       --query SecretString --output text)"
--     psql "$RDS_URL" -f web/prisma/sql/daydream_lora_apply.sql
--
--   Or via Prisma (from the repo, with DATABASE_URL set to RDS):
--     npx prisma db execute --file prisma/sql/daydream_lora_apply.sql --schema prisma/schema.prisma
--
-- Every statement is IF-NOT-EXISTS / catalog-guarded → purely additive, no
-- drops, no data loss, safe to re-run. Creates pet_insights too because the
-- source DB (restored from the old Neon dump) was found to lack it.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── pet_insights (Pet Daydream) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pet_insights" (
  "id"          SERIAL        NOT NULL,
  "pet_id"      INTEGER       NOT NULL,
  "insight"     TEXT          NOT NULL,
  "rationale"   TEXT,
  "mood"        VARCHAR(20)   NOT NULL,
  "score"       INTEGER       NOT NULL DEFAULT 5,
  "source_keys" JSONB,
  "seen"        BOOLEAN       NOT NULL DEFAULT false,
  "reacted"     BOOLEAN       NOT NULL DEFAULT false,
  "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pet_insights_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pet_insights_pet_created_idx"
  ON "pet_insights"("pet_id","created_at");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_insights_pet_fkey') THEN
    ALTER TABLE "pet_insights" ADD CONSTRAINT "pet_insights_pet_fkey"
      FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ── daydream → video link column ─────────────────────────────────────────
ALTER TABLE "pet_insights" ADD COLUMN IF NOT EXISTS "video_generation_id" INTEGER;

-- ── pet_loras (fal.ai fine-tune checkpoints) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "pet_loras" (
  "id"             SERIAL        NOT NULL,
  "pet_id"         INTEGER       NOT NULL,
  "status"         VARCHAR(20)   NOT NULL DEFAULT 'training',
  "fal_request_id" VARCHAR(128),
  "lora_url"       VARCHAR(512),
  "trigger_word"   VARCHAR(40)   NOT NULL,
  "images_used"    JSONB,
  "error_message"  TEXT,
  "created_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at"   TIMESTAMP(3),
  CONSTRAINT "pet_loras_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pet_loras_pet_created_idx"
  ON "pet_loras"("pet_id","created_at");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_loras_pet_fkey') THEN
    ALTER TABLE "pet_loras" ADD CONSTRAINT "pet_loras_pet_fkey"
      FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;

-- ── verification (runs after COMMIT; prints the new objects) ─────────────
\echo '--- verification ---'
SELECT to_regclass('public.pet_insights')  AS pet_insights_table,
       to_regclass('public.pet_loras')     AS pet_loras_table;
SELECT column_name, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'pet_insights' AND column_name = 'video_generation_id';
SELECT count(*) AS pet_loras_column_count
  FROM information_schema.columns WHERE table_name = 'pet_loras';

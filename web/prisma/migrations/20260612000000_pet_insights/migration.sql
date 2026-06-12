-- Pet Daydream insights (see lib/petclaw/memory/daydream.ts)
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
CREATE INDEX IF NOT EXISTS "pet_insights_pet_created_idx" ON "pet_insights"("pet_id","created_at");
ALTER TABLE "pet_insights" ADD CONSTRAINT "pet_insights_pet_fkey"
  FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE;

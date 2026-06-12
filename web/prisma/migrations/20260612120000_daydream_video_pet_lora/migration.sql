-- Daydream → video: link an insight to the auto-generated video it seeded
-- (NULL = not yet converted; the cron uses this as its work queue marker).
ALTER TABLE "pet_insights" ADD COLUMN IF NOT EXISTS "video_generation_id" INTEGER;

-- Per-pet LoRA fine-tune checkpoints (fal.ai flux-lora-fast-training).
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
CREATE INDEX IF NOT EXISTS "pet_loras_pet_created_idx" ON "pet_loras"("pet_id","created_at");
ALTER TABLE "pet_loras" ADD CONSTRAINT "pet_loras_pet_fkey"
  FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE;

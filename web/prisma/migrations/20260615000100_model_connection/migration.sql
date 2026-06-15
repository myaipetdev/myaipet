-- BYO model connections (FEATURE 1). Additive only — new table, no existing
-- column altered, no data rewritten. Owner-scoped; encrypted_key holds the
-- AES-256-GCM ciphertext (src/lib/crypto.ts). task_scopes is a Postgres TEXT[]
-- of LLM task names the connection may serve (empty = all tasks).

CREATE TABLE IF NOT EXISTS "model_connections" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "task_scopes" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "model_connections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "model_connections_owner_user_id_idx"
  ON "model_connections" ("owner_user_id");

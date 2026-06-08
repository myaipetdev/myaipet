-- Security hardening migration (see docs/SECURITY_AUDIT_2026-06.md)
-- Adds the global consumed-payment ledger (C3), payment/like uniqueness
-- (H14/M9) and missing FK indexes (L16). Dedupe steps run first so the new
-- UNIQUE constraints cannot fail on pre-existing duplicate rows.

-- ── C3: global consumed-payment ledger ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "consumed_payments" (
    "id"         SERIAL           NOT NULL,
    "tx_hash"    VARCHAR(66)      NOT NULL,
    "user_id"    INTEGER          NOT NULL,
    "purpose"    VARCHAR(40)      NOT NULL,
    "amount_usd" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consumed_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "consumed_payments_tx_hash_key" ON "consumed_payments"("tx_hash");
CREATE INDEX IF NOT EXISTS "consumed_payments_user_id_idx" ON "consumed_payments"("user_id");

-- ── H14: credit_purchases.payment_tx_hash UNIQUE ────────────────────────────
-- Null out duplicate hashes (keep the earliest row) so the unique index holds.
UPDATE "credit_purchases" a
   SET "payment_tx_hash" = NULL
  FROM "credit_purchases" b
 WHERE a."payment_tx_hash" = b."payment_tx_hash"
   AND a."payment_tx_hash" IS NOT NULL
   AND a."id" > b."id";
CREATE UNIQUE INDEX IF NOT EXISTS "credit_purchases_payment_tx_hash_key" ON "credit_purchases"("payment_tx_hash");
CREATE INDEX IF NOT EXISTS "credit_purchases_user_id_idx" ON "credit_purchases"("user_id");

-- ── M9: one like per (user, generation) ─────────────────────────────────────
DELETE FROM "likes" a
 USING "likes" b
 WHERE a."user_id" = b."user_id"
   AND a."generation_id" = b."generation_id"
   AND a."id" > b."id";
CREATE UNIQUE INDEX IF NOT EXISTS "likes_user_id_generation_id_key" ON "likes"("user_id", "generation_id");
CREATE INDEX IF NOT EXISTS "likes_generation_id_idx" ON "likes"("generation_id");

-- ── L16: missing FK indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "generations_user_id_idx" ON "generations"("user_id");
CREATE INDEX IF NOT EXISTS "transactions_user_id_idx" ON "transactions"("user_id");
CREATE INDEX IF NOT EXISTS "transactions_tx_hash_idx" ON "transactions"("tx_hash");

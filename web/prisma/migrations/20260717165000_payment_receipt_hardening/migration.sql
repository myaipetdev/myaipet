BEGIN;

-- Freeze financial receipt writes while case-insensitive collision checks and
-- normalization run. The migration fails before changing any row if two
-- historical values would collapse to the same canonical hash.
LOCK TABLE "consumed_payments", "credit_purchases", "paid_actions",
  "user_subscriptions", "transactions", "battle_history", "streak_purchases"
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT lower("tx_hash")
    FROM "consumed_payments"
    GROUP BY lower("tx_hash")
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'payment hash canonicalization aborted: consumed_payments contains case-insensitive collisions';
  END IF;

  IF EXISTS (
    SELECT lower("payment_tx_hash")
    FROM "credit_purchases"
    WHERE "payment_tx_hash" IS NOT NULL
    GROUP BY lower("payment_tx_hash")
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'payment hash canonicalization aborted: credit_purchases contains case-insensitive collisions';
  END IF;

  IF EXISTS (
    SELECT lower("tx_hash")
    FROM "paid_actions"
    GROUP BY lower("tx_hash")
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'payment hash canonicalization aborted: paid_actions contains case-insensitive collisions';
  END IF;

  IF EXISTS (
    SELECT lower("last_payment_tx")
    FROM "user_subscriptions"
    WHERE "last_payment_tx" IS NOT NULL
    GROUP BY lower("last_payment_tx")
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'payment hash canonicalization aborted: user_subscriptions contains case-insensitive collisions';
  END IF;

  -- paid_actions existed before the global consumed_payments ledger. A hash
  -- already assigned to another product/user (or a different amount) cannot be
  -- safely repaired: abort before changing any row rather than blessing a
  -- cross-product replay as an action receipt.
  IF EXISTS (
    SELECT 1
    FROM "paid_actions" AS action
    INNER JOIN "consumed_payments" AS ledger
      ON lower(ledger."tx_hash") = lower(action."tx_hash")
    WHERE ledger."purpose" <> 'action'
       OR ledger."user_id" <> action."user_id"
       OR ledger."amount_usd" <> action."amount_usd"
  ) THEN
    RAISE EXCEPTION 'payment receipt hardening aborted: paid_actions conflicts with global consumed_payments ledger';
  END IF;

  -- A legacy product receipt may also predate the global ledger. Compare the
  -- source receipt tables directly before backfilling paid_actions; otherwise a
  -- hash that already granted credits/subscription/premium could be incorrectly
  -- blessed as a new action claim simply because neither path had a ledger row.
  IF EXISTS (
    SELECT 1
    FROM "paid_actions" AS action
    WHERE EXISTS (
      SELECT 1 FROM "credit_purchases" AS credits
      WHERE credits."payment_tx_hash" IS NOT NULL
        AND lower(credits."payment_tx_hash") = lower(action."tx_hash")
    ) OR EXISTS (
      SELECT 1 FROM "user_subscriptions" AS subscription
      WHERE subscription."last_payment_tx" IS NOT NULL
        AND lower(subscription."last_payment_tx") = lower(action."tx_hash")
    ) OR EXISTS (
      SELECT 1 FROM "transactions" AS premium
      WHERE premium."type" = 'premium_buy'
        AND lower(premium."tx_hash") = lower(action."tx_hash")
    )
  ) THEN
    RAISE EXCEPTION 'payment receipt hardening aborted: paid_actions conflicts with a legacy product receipt';
  END IF;
END $$;

UPDATE "consumed_payments" SET "tx_hash" = lower("tx_hash");
UPDATE "credit_purchases"
SET
  "payment_tx_hash" = lower("payment_tx_hash"),
  "recording_tx_hash" = lower("recording_tx_hash");
UPDATE "paid_actions"
SET
  "tx_hash" = lower("tx_hash"),
  "burned_tx" = lower("burned_tx");
UPDATE "user_subscriptions" SET "last_payment_tx" = lower("last_payment_tx");
UPDATE "transactions" SET "tx_hash" = lower("tx_hash");
UPDATE "battle_history" SET "tx_hash" = lower("tx_hash");
UPDATE "streak_purchases" SET "tx_hash" = lower("tx_hash");

-- Backfill only receipts proven not to conflict above. Runtime action claims
-- require this matching global row, so legacy orphan receipts fail closed if a
-- future/manual import bypasses this migration.
INSERT INTO "consumed_payments" ("tx_hash", "user_id", "purpose", "amount_usd")
SELECT action."tx_hash", action."user_id", 'action', action."amount_usd"
FROM "paid_actions" AS action
LEFT JOIN "consumed_payments" AS ledger
  ON ledger."tx_hash" = action."tx_hash"
WHERE ledger."tx_hash" IS NULL;

ALTER TABLE "consumed_payments"
  ADD CONSTRAINT "consumed_payments_tx_hash_lower_check"
  CHECK ("tx_hash" = lower("tx_hash"));
ALTER TABLE "credit_purchases"
  ADD CONSTRAINT "credit_purchases_payment_tx_hash_lower_check"
  CHECK ("payment_tx_hash" = lower("payment_tx_hash")),
  ADD CONSTRAINT "credit_purchases_recording_tx_hash_lower_check"
  CHECK ("recording_tx_hash" = lower("recording_tx_hash"));
ALTER TABLE "paid_actions"
  ADD CONSTRAINT "paid_actions_tx_hash_lower_check"
  CHECK ("tx_hash" = lower("tx_hash")),
  ADD CONSTRAINT "paid_actions_burned_tx_lower_check"
  CHECK ("burned_tx" = lower("burned_tx"));
ALTER TABLE "user_subscriptions"
  ADD CONSTRAINT "user_subscriptions_last_payment_tx_lower_check"
  CHECK ("last_payment_tx" = lower("last_payment_tx"));
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_tx_hash_lower_check"
  CHECK ("tx_hash" = lower("tx_hash"));
ALTER TABLE "battle_history"
  ADD CONSTRAINT "battle_history_tx_hash_lower_check"
  CHECK ("tx_hash" = lower("tx_hash"));
ALTER TABLE "streak_purchases"
  ADD CONSTRAINT "streak_purchases_tx_hash_lower_check"
  CHECK ("tx_hash" = lower("tx_hash"));

-- Preserve receipts when a pet is deleted and repair historical invalid or
-- cross-owner bindings before installing the FK. New cross-owner bindings are
-- rejected by the trigger below; ON DELETE SET NULL retains the receipt.
UPDATE "paid_actions" AS receipt
SET "pet_id" = NULL
WHERE receipt."pet_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "pets" AS pet
    WHERE pet."id" = receipt."pet_id"
      AND pet."user_id" = receipt."user_id"
  );

ALTER TABLE "paid_actions"
  ADD CONSTRAINT "paid_actions_pet_id_fkey"
  FOREIGN KEY ("pet_id") REFERENCES "pets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "paid_actions_pet_id_idx" ON "paid_actions"("pet_id");

CREATE FUNCTION "enforce_paid_action_pet_owner"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."pet_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "pets" AS pet
    WHERE pet."id" = NEW."pet_id"
      AND pet."user_id" = NEW."user_id"
  ) THEN
    RAISE EXCEPTION 'paid action pet must be owned by the receipt user'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "paid_actions_pet_owner_guard"
BEFORE INSERT OR UPDATE OF "pet_id", "user_id" ON "paid_actions"
FOR EACH ROW
EXECUTE FUNCTION "enforce_paid_action_pet_owner"();

COMMIT;

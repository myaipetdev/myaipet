BEGIN;

LOCK TABLE "agent_credit_reservations" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "pet_agent_messages" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "pet_agent_schedules" IN ACCESS EXCLUSIVE MODE;

ALTER TABLE "agent_credit_reservations"
  ADD COLUMN "expires_at" TIMESTAMP(3);

UPDATE "agent_credit_reservations"
SET "expires_at" = "created_at" + INTERVAL '5 minutes'
WHERE "expires_at" IS NULL;

ALTER TABLE "agent_credit_reservations"
  ALTER COLUMN "expires_at" SET NOT NULL;

ALTER TABLE "agent_credit_reservations"
  ADD CONSTRAINT "agent_credit_reservations_expiry_valid"
  CHECK ("expires_at" > "created_at");

-- A pre-FK crash could have left an invalid reservation. Refund a still-live
-- owner exactly once before deleting any row that cannot satisfy both FKs or
-- whose pet belongs to a different owner.
WITH invalid AS (
  SELECT reservation."id"
  FROM "agent_credit_reservations" AS reservation
  LEFT JOIN "users" AS owner ON owner."id" = reservation."user_id"
  LEFT JOIN "pets" AS pet ON pet."id" = reservation."pet_id"
  WHERE owner."id" IS NULL OR pet."id" IS NULL OR pet."user_id" <> reservation."user_id"
), claimed AS (
  UPDATE "agent_credit_reservations" AS reservation
  SET "status" = 'refunded', "settled_at" = CURRENT_TIMESTAMP
  FROM invalid
  WHERE reservation."id" = invalid."id" AND reservation."status" = 'reserved'
  RETURNING reservation."user_id", reservation."amount"
), totals AS (
  SELECT "user_id", SUM("amount")::integer AS "amount"
  FROM claimed
  GROUP BY "user_id"
)
UPDATE "users" AS owner
SET "credits" = owner."credits" + totals."amount"
FROM totals
WHERE owner."id" = totals."user_id";

DELETE FROM "agent_credit_reservations" AS reservation
WHERE NOT EXISTS (
  SELECT 1
  FROM "users" AS owner
  JOIN "pets" AS pet
    ON pet."id" = reservation."pet_id" AND pet."user_id" = owner."id"
  WHERE owner."id" = reservation."user_id"
);

ALTER TABLE "agent_credit_reservations"
  ADD CONSTRAINT "agent_credit_reservations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_credit_reservations"
  ADD CONSTRAINT "agent_credit_reservations_pet_id_fkey"
  FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "agent_credit_reservations_status_expires_at_idx"
  ON "agent_credit_reservations"("status", "expires_at");

CREATE OR REPLACE FUNCTION "agent_credit_reservation_owner_guard"()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "pets"
    WHERE "id" = NEW."pet_id" AND "user_id" = NEW."user_id" AND "is_active" = true
  ) THEN
    RAISE EXCEPTION 'agent reservation pet/owner mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "agent_credit_reservation_owner_guard_trigger"
BEFORE INSERT OR UPDATE OF "user_id", "pet_id" ON "agent_credit_reservations"
FOR EACH ROW EXECUTE FUNCTION "agent_credit_reservation_owner_guard"();

-- Keep one canonical inbound receipt for any historical duplicate. Message ids
-- are unique only within a Telegram chat, hence chat_id is part of the key.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "pet_id", "platform", "chat_id", "platform_msg_id"
           ORDER BY "id"
         ) AS duplicate_rank
  FROM "pet_agent_messages"
  WHERE "direction" = 'inbound'
    AND "chat_id" IS NOT NULL
    AND "platform_msg_id" IS NOT NULL
)
UPDATE "pet_agent_messages" AS message
SET "platform_msg_id" = NULL
FROM ranked
WHERE message."id" = ranked."id" AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX "pet_agent_messages_inbound_delivery_key"
  ON "pet_agent_messages"("pet_id", "platform", "chat_id", "platform_msg_id")
  WHERE "direction" = 'inbound'
    AND "chat_id" IS NOT NULL
    AND "platform_msg_id" IS NOT NULL;

-- Repair legacy out-of-range counters before adding the authoritative bound.
UPDATE "pet_agent_schedules"
SET
  "daily_credit_limit" = GREATEST(1, "daily_credit_limit"),
  "credits_used_today" = GREATEST(0, LEAST("credits_used_today", GREATEST(1, "daily_credit_limit")));

ALTER TABLE "pet_agent_schedules"
  ADD CONSTRAINT "pet_agent_schedules_daily_credit_bounds"
  CHECK (
    "daily_credit_limit" > 0
    AND "credits_used_today" >= 0
    AND "credits_used_today" <= "daily_credit_limit"
  );

COMMIT;

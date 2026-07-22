-- Expand-only: durable, owner-scoped idempotency and receipt ledger for paid
-- PetClaw agent runs. Existing reservation and product data are untouched;
-- active runs block full pet-data deletion; terminal rows are retained only
-- after the application scrubs private pet/run content.
CREATE TABLE "pet_agent_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL,
  "pet_id" INTEGER NOT NULL,
  "pet_name" VARCHAR(50) NOT NULL,
  "goal" TEXT NOT NULL,
  "max_steps" INTEGER NOT NULL,
  "state" VARCHAR(20) NOT NULL DEFAULT 'reserved',
  "reservation_id" UUID,
  "completed" BOOLEAN,
  "answer" TEXT,
  "steps" JSONB,
  "stopped_reason" VARCHAR(40),
  "billing" JSONB,
  "credits_remaining" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "terminal_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pet_agent_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pet_agent_runs_state_check" CHECK ("state" IN ('reserved', 'running', 'terminal')),
  CONSTRAINT "pet_agent_runs_max_steps_check" CHECK ("max_steps" BETWEEN 1 AND 6),
  CONSTRAINT "pet_agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pet_agent_runs_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "agent_credit_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pet_agent_runs_reservation_id_key" ON "pet_agent_runs"("reservation_id");
CREATE UNIQUE INDEX "pet_agent_runs_user_id_pet_id_run_id_key" ON "pet_agent_runs"("user_id", "pet_id", "run_id");
CREATE INDEX "pet_agent_runs_user_id_created_at_idx" ON "pet_agent_runs"("user_id", "created_at" DESC);
CREATE INDEX "pet_agent_runs_user_id_state_updated_at_idx" ON "pet_agent_runs"("user_id", "state", "updated_at");
CREATE INDEX "pet_agent_runs_pet_id_created_at_idx" ON "pet_agent_runs"("pet_id", "created_at" DESC);

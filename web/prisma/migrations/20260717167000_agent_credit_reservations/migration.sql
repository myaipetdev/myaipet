CREATE TABLE "agent_credit_reservations" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'reserved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),

    CONSTRAINT "agent_credit_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_credit_reservations_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "agent_credit_reservations_status_valid" CHECK ("status" IN ('reserved', 'committed', 'refunded'))
);

CREATE INDEX "agent_credit_reservations_user_id_status_idx"
    ON "agent_credit_reservations"("user_id", "status");

CREATE INDEX "agent_credit_reservations_created_at_idx"
    ON "agent_credit_reservations"("created_at");

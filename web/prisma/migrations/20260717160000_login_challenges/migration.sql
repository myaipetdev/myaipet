-- Login challenges are intentionally separate from users.nonce. Merely
-- requesting an unauthenticated SIWE challenge must never create a user or
-- invalidate an already authenticated browser/CLI session.
CREATE TABLE "login_challenges" (
    "id" SERIAL NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "wallet_address" VARCHAR(42) NOT NULL,
    "message_hash" CHAR(64) NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "uri" VARCHAR(512) NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "login_challenges_nonce_key"
    ON "login_challenges"("nonce");

CREATE INDEX "login_challenges_wallet_address_expires_at_idx"
    ON "login_challenges"("wallet_address", "expires_at");

CREATE INDEX "login_challenges_expires_at_idx"
    ON "login_challenges"("expires_at");

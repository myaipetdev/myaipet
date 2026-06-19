-- CLI personal access tokens. Additive only — new table, no existing column
-- altered, no data rewritten. Owner-scoped, revocable, long-lived credentials
-- the CLI/SDK use instead of the short-lived web JWT. Only the sha256 hash of
-- the token is stored (token_hash); the plaintext is shown once at mint time.
-- Auth resolves a `pck_`-prefixed Bearer token here (src/lib/auth.ts getUser).

CREATE TABLE IF NOT EXISTS "cli_tokens" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    CONSTRAINT "cli_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cli_tokens_token_hash_key"
  ON "cli_tokens" ("token_hash");

CREATE INDEX IF NOT EXISTS "cli_tokens_owner_user_id_idx"
  ON "cli_tokens" ("owner_user_id");

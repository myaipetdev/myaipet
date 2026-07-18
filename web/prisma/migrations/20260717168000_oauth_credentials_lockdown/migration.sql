-- Channel-subscription credentials historically shared this column with
-- encrypted agent bot credentials. OAuth wrote raw JSON while the agent path
-- wrote AES-256-GCM ciphertext. Fail closed: remove every non-ciphertext value
-- and prevent plaintext from being written again. No credential value is
-- selected, returned, or logged by this migration.
BEGIN;

LOCK TABLE "pet_platform_connections" IN ACCESS EXCLUSIVE MODE;

UPDATE "pet_platform_connections"
SET
  "credentials" = NULL,
  "is_active" = false,
  "last_active_at" = CURRENT_TIMESTAMP
WHERE "credentials" IS NOT NULL
  AND "credentials" !~ '^[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]+={0,2}$';

-- Existing opt-ins must not silently survive the launch kill switches. A
-- future re-enable requires an explicit reconnect under the new codec and an
-- explicit autonomous-mode opt-in.
UPDATE "pet_platform_connections"
SET "is_active" = false,
    "last_active_at" = CURRENT_TIMESTAMP
WHERE "is_active" = true;

UPDATE "pet_agent_schedules"
SET "is_enabled" = false
WHERE "is_enabled" = true;

ALTER TABLE "pet_platform_connections"
  ADD CONSTRAINT "pet_platform_connections_credentials_ciphertext_check"
  CHECK (
    "credentials" IS NULL
    OR "credentials" ~ '^[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]+={0,2}$'
  );

COMMENT ON CONSTRAINT "pet_platform_connections_credentials_ciphertext_check"
  ON "pet_platform_connections"
  IS 'Credentials must be an AGENT_ENCRYPTION_KEY AES-256-GCM ciphertext, never raw JSON/plaintext';

COMMIT;

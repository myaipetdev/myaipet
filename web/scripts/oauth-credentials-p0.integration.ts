import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { decodeOAuthCredentials, encodeOAuthCredentials } from "../src/lib/oauth/credentials";

const root = new URL("../", import.meta.url);

async function source(relative: string) {
  return readFile(new URL(relative, root), "utf8");
}

async function contractChecks() {
  const [start, callback, telegramCallback, connections, dashboard, onboarding, widget, migration, smoke, checklist, env] = await Promise.all([
    source("src/app/api/auth/oauth/[provider]/route.ts"),
    source("src/app/api/auth/oauth/[provider]/callback/route.ts"),
    source("src/app/api/auth/oauth/telegram/callback/route.ts"),
    source("src/app/api/petclaw/connections/route.ts"),
    source("src/components/SovereigntyDashboard.tsx"),
    source("src/components/EnhancedOnboarding.tsx"),
    source("src/app/oauth/telegram/widget/page.tsx"),
    source("prisma/migrations/20260717168000_oauth_credentials_lockdown/migration.sql"),
    readFile(new URL("../../deploy/release-smoke.sh", import.meta.url), "utf8"),
    readFile(new URL("../../deploy/ENV-CHECKLIST.md", import.meta.url), "utf8"),
    source(".env.production.example"),
  ]);

  for (const [name, text, sensitiveOperation] of [
    ["start", start, "getUser(req)"],
    ["callback", callback, "verifyState(stateToken)"],
    ["telegram callback", telegramCallback, "verifyState(stateToken)"],
  ] as const) {
    const gate = text.indexOf("if (!oauthConnectionsEnabled()) return oauthUnavailableResponse()")
    assert.ok(gate >= 0, `${name} must have the launch gate`);
    assert.ok(gate < text.indexOf(sensitiveOperation), `${name} gate must precede ${sensitiveOperation}`);
  }
  assert.match(connections, /if \(!oauthConnectionsEnabled\(\)\) return oauthUnavailableResponse\(\)/);
  assert.match(dashboard, /Channel subscriptions are unavailable for launch/);
  assert.match(onboarding, /Channel subscriptions are unavailable for launch/);
  assert.match(widget, /oauth_connections_enabled !== true/);
  assert.match(migration, /credentials_ciphertext_check/);
  assert.match(migration, /"credentials" = NULL/);
  assert.match(checklist, /`OAUTH_CONNECTIONS_ENABLED=false`/);
  assert.match(env, /^OAUTH_CONNECTIONS_ENABLED=false$/m);
  assert.match(env, /^AGENT_CHANNELS_ENABLED=false$/m);
  assert.match(smoke, /oauth_connections_enabled/);
  assert.match(smoke, /agent_channels_enabled/);
}

async function cryptoChecks() {
  const previous = process.env.AGENT_ENCRYPTION_KEY;
  process.env.AGENT_ENCRYPTION_KEY = "11".repeat(32);
  try {
    const encoded = encodeOAuthCredentials({
      access_token: "synthetic-test-token",
      refresh_token: "synthetic-refresh-token",
      profile: { id: "test-profile", username: "test-user" },
    });
    assert.ok(!encoded.includes("synthetic-test-token"));
    assert.deepEqual(decodeOAuthCredentials(encoded), {
      access_token: "synthetic-test-token",
      refresh_token: "synthetic-refresh-token",
      profile: { id: "test-profile", username: "test-user" },
    });
    assert.equal(decodeOAuthCredentials('{"access_token":"plaintext"}'), null);
  } finally {
    if (previous === undefined) delete process.env.AGENT_ENCRYPTION_KEY;
    else process.env.AGENT_ENCRYPTION_KEY = previous;
  }
}

async function postgresChecks(connectionString: string) {
  const url = new URL(connectionString);
  if (!url.pathname.slice(1).includes("oauth_credential_test")) {
    throw new Error("Refusing PG test: database name must contain oauth_credential_test");
  }

  const schema = `oauth_p0_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString, max: 1 });
  const scoped = new Pool({ connectionString, max: 4, options: `-c search_path=${schema}` });
  const previous = process.env.AGENT_ENCRYPTION_KEY;
  process.env.AGENT_ENCRYPTION_KEY = "22".repeat(32);
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await scoped.query(`
      CREATE TABLE "pet_platform_connections" (
        "id" SERIAL PRIMARY KEY,
        "credentials" TEXT,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "last_active_at" TIMESTAMP(3)
      );
      CREATE TABLE "pet_agent_schedules" (
        "id" SERIAL PRIMARY KEY,
        "is_enabled" BOOLEAN NOT NULL DEFAULT false
      );
      INSERT INTO "pet_agent_schedules" ("is_enabled") VALUES (true)
    `);
    const encryptedAgent = (await import("../src/lib/crypto")).encrypt(JSON.stringify({ bot_token: "synthetic-agent-token" }));
    await scoped.query(
      'INSERT INTO "pet_platform_connections" ("credentials") VALUES ($1), ($2), ($3), ($4)',
      ['{"access_token":"synthetic-legacy-oauth"}', "not-a-ciphertext", encryptedAgent, null],
    );

    const migration = await source("prisma/migrations/20260717168000_oauth_credentials_lockdown/migration.sql");
    await scoped.query(migration);

    const rows = await scoped.query<{ id: number; credentials: string | null; is_active: boolean }>(
      'SELECT "id", "credentials", "is_active" FROM "pet_platform_connections" ORDER BY "id"',
    );
    assert.deepEqual(rows.rows.map(row => [row.credentials === encryptedAgent, row.is_active]), [
      [false, false],
      [false, false],
      [true, false],
      [false, false],
    ]);
    const schedules = await scoped.query<{ is_enabled: boolean }>('SELECT "is_enabled" FROM "pet_agent_schedules"');
    assert.equal(schedules.rows[0]?.is_enabled, false);

    await assert.rejects(
      scoped.query('INSERT INTO "pet_platform_connections" ("credentials") VALUES ($1)', ['{"access_token":"blocked"}']),
      /credentials_ciphertext_check/,
    );
    const encryptedOAuth = encodeOAuthCredentials({ access_token: "synthetic-new-oauth" });
    await scoped.query('INSERT INTO "pet_platform_connections" ("credentials") VALUES ($1)', [encryptedOAuth]);
  } finally {
    if (previous === undefined) delete process.env.AGENT_ENCRYPTION_KEY;
    else process.env.AGENT_ENCRYPTION_KEY = previous;
    await scoped.end().catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await admin.end().catch(() => {});
  }
}

async function main() {
  await contractChecks();
  await cryptoChecks();

  const databaseUrl = process.env.OAUTH_CREDENTIAL_TEST_DATABASE_URL;
  if (databaseUrl) {
    await postgresChecks(databaseUrl);
    process.stdout.write("PASS OAuth P0 contract, encryption, and PostgreSQL plaintext purge/constraint\n");
  } else {
    process.stdout.write("PASS OAuth P0 contract and encryption (PG skipped; set OAUTH_CREDENTIAL_TEST_DATABASE_URL)\n");
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "OAuth P0 test failed"}\n`);
  process.exitCode = 1;
});

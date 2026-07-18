import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

async function verifyContract() {
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
  const [availability, connect, webhook, centralTelegram, credits, reservations,
    migration, env, smoke, cron] = await Promise.all([
    read("../src/lib/oauth/availability.ts"),
    read("../src/app/api/pets/[petId]/agent/connect/route.ts"),
    read("../src/app/api/agent/webhook/telegram/[petId]/route.ts"),
    read("../src/app/api/bots/telegram/webhook/route.ts"),
    read("../src/lib/agentCredits.ts"),
    read("../src/lib/agentCreditReservation.ts"),
    read("../prisma/migrations/20260717169000_agent_channel_credit_hardening/migration.sql"),
    read("../.env.production.example"),
    read("../../deploy/release-smoke.sh"),
    read("../src/app/api/cron/agent-credit-reservations/route.ts"),
  ]);

  assert.match(availability, /process\.env\.AGENT_CHANNELS_ENABLED === "true"/);
  assert.ok(connect.indexOf("if (!agentChannelsEnabled())") < connect.indexOf("getUser(req)"));
  assert.ok(webhook.indexOf("if (!agentChannelsEnabled())") < webhook.indexOf("await params"));
  assert.match(webhook, /decodeTelegramAgentBotToken/);
  assert.doesNotMatch(webhook, /botToken = decrypt/);
  assert.match(webhook, /claimTelegramInboundMessageWithDb/);
  assert.ok(webhook.indexOf("claimTelegramInboundMessageWithDb") < webhook.indexOf("consumeAgentCredits(petIdNum, 1)"));
  assert.match(centralTelegram, /decodeOAuthCredentials/);
  assert.match(centralTelegram, /claimTelegramInboundMessageWithDb/);
  assert.match(centralTelegram, /consumeAgentCredits/);
  assert.match(credits, /FOR UPDATE/);
  assert.match(credits, /credits: \{ gte: amount \}/);
  assert.match(reservations, /FOR UPDATE SKIP LOCKED/);
  assert.match(reservations, /"status" = 'reserved' AND "expires_at" <=/);
  assert.match(migration, /pet_agent_messages_inbound_delivery_key/);
  assert.match(migration, /pet_agent_schedules_daily_credit_bounds/);
  assert.match(migration, /agent_credit_reservation_owner_guard/);
  assert.match(env, /^AGENT_CHANNELS_ENABLED=false$/m);
  assert.match(smoke, /agent_channels_enabled/);
  assert.match(cron, /verifyCron\(req\)/);
}

async function main() {
  await verifyContract();

  const connectionString = process.env.AGENT_CREDIT_TEST_DATABASE_URL;
  if (!connectionString) {
    process.stdout.write("PASS agent channel/credit contract (PG skipped; set AGENT_CREDIT_TEST_DATABASE_URL)\n");
    return;
  }
  const databaseName = new URL(connectionString).pathname.slice(1);
  if (!databaseName.includes("agent_credit_test")) {
    throw new Error("Refusing agent credit integration outside an agent_credit_test database");
  }

  const schema = `agent_credit_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString, max: 80 });
  const scoped = new Pool({ connectionString, max: 4, options: `-c search_path=${schema}` });
  let appPrisma: any;
  let defaultPrisma: any;
  let created = false;
  const previousKey = process.env.AGENT_ENCRYPTION_KEY;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await scoped.query(`
      CREATE TABLE "users" (
        "id" integer PRIMARY KEY,
        "credits" integer NOT NULL DEFAULT 0,
        "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "pets" (
        "id" integer PRIMARY KEY,
        "user_id" integer NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true
      );
      CREATE TABLE "pet_agent_schedules" (
        "id" serial PRIMARY KEY,
        "pet_id" integer NOT NULL UNIQUE,
        "is_enabled" boolean NOT NULL DEFAULT false,
        "daily_credit_limit" integer NOT NULL DEFAULT 50,
        "credits_used_today" integer NOT NULL DEFAULT 0,
        "last_reset_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "posting_frequency" varchar(20) NOT NULL DEFAULT 'medium',
        "action_cooldown_minutes" integer NOT NULL DEFAULT 30,
        "preferred_platform" varchar(20) NOT NULL DEFAULT 'web',
        "quiet_hours_start" integer,
        "quiet_hours_end" integer,
        "last_action_at" timestamp(3)
      );
      CREATE TABLE "pet_agent_messages" (
        "id" serial PRIMARY KEY,
        "pet_id" integer NOT NULL,
        "platform" varchar(20) NOT NULL,
        "direction" varchar(10) NOT NULL,
        "message_type" varchar(20) NOT NULL DEFAULT 'text',
        "content" text NOT NULL,
        "platform_msg_id" varchar(100),
        "chat_id" varchar(100),
        "credits_used" integer NOT NULL DEFAULT 0,
        "metadata" jsonb,
        "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "agent_credit_reservations" (
        "id" uuid PRIMARY KEY,
        "user_id" integer NOT NULL,
        "pet_id" integer NOT NULL,
        "purpose" varchar(40) NOT NULL,
        "amount" integer NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'reserved',
        "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "settled_at" timestamp(3),
        CONSTRAINT "agent_credit_reservations_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "agent_credit_reservations_status_valid" CHECK ("status" IN ('reserved','committed','refunded'))
      );
      CREATE INDEX "agent_credit_reservations_user_id_status_idx"
        ON "agent_credit_reservations"("user_id", "status");
      CREATE INDEX "agent_credit_reservations_created_at_idx"
        ON "agent_credit_reservations"("created_at");
    `);
    await scoped.query(`
      INSERT INTO "users" ("id", "credits") VALUES (1, 100), (2, 100);
      INSERT INTO "pets" ("id", "user_id", "is_active")
        VALUES (1, 1, true), (2, 2, true), (3, 1, false), (4, 1, true);
      INSERT INTO "pet_agent_schedules"
        ("pet_id", "daily_credit_limit", "credits_used_today", "last_reset_at")
        VALUES (1, 7, 99, CURRENT_TIMESTAMP - INTERVAL '1 day');
      INSERT INTO "agent_credit_reservations"
        ("id", "user_id", "pet_id", "purpose", "amount", "status")
        VALUES ('00000000-0000-4000-8000-000000000001', 1, 1, 'pet_agent_loop', 5, 'reserved');
      INSERT INTO "pet_agent_messages"
        ("pet_id", "platform", "direction", "content", "chat_id", "platform_msg_id")
        VALUES (1, 'telegram', 'inbound', 'old-1', 'chat-a', '7'),
               (1, 'telegram', 'inbound', 'old-2', 'chat-a', '7');
    `);

    const migration = await readFile(
      new URL("../prisma/migrations/20260717169000_agent_channel_credit_hardening/migration.sql", import.meta.url),
      "utf8",
    );
    await scoped.query(migration);
    const repaired = await scoped.query<{ used: number; ids: number }>(`
      SELECT
        (SELECT "credits_used_today" FROM "pet_agent_schedules" WHERE "pet_id"=1)::int AS "used",
        (SELECT count(DISTINCT "platform_msg_id") FROM "pet_agent_messages" WHERE "platform_msg_id" IS NOT NULL)::int AS "ids"
    `);
    assert.deepEqual(repaired.rows[0], { used: 7, ids: 1 });

    await scoped.query('DELETE FROM "agent_credit_reservations"; DELETE FROM "pet_agent_messages"; DELETE FROM "pet_agent_schedules";');
    process.env.DATABASE_URL = connectionString;
    process.env.AGENT_ENCRYPTION_KEY = "33".repeat(32);
    const [reservationModule, creditModule, claimModule, credentialsModule, oauthCredentialsModule] = await Promise.all([
      import("../src/lib/agentCreditReservation"),
      import("../src/lib/agentCredits"),
      import("../src/lib/agentWebhookDelivery"),
      import("../src/lib/agentCredentials"),
      import("../src/lib/oauth/credentials"),
    ]);
    ({ prisma: defaultPrisma } = await import("../src/lib/prisma"));
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
      import("../src/generated/prisma/client"),
      import("@prisma/adapter-pg"),
    ]);
    appPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}` }, { schema }),
    } as any);

    const syntheticBotToken = `12345678:${"A".repeat(32)}`;
    const encodedBot = credentialsModule.encodeTelegramAgentCredentials(syntheticBotToken);
    assert.ok(!encodedBot.includes(syntheticBotToken));
    assert.equal(credentialsModule.decodeTelegramAgentBotToken(encodedBot), syntheticBotToken);
    const legacyBot = (await import("../src/lib/crypto")).encrypt(JSON.stringify({ bot_token: syntheticBotToken }));
    assert.equal(credentialsModule.decodeTelegramAgentBotToken(legacyBot), syntheticBotToken);
    const oauth = oauthCredentialsModule.encodeOAuthCredentials({ access_token: syntheticBotToken });
    assert.equal(credentialsModule.decodeTelegramAgentBotToken(oauth), null);
    assert.equal(credentialsModule.decodeTelegramAgentBotToken(JSON.stringify({ bot_token: syntheticBotToken })), null);

    assert.equal(await reservationModule.reserveAgentCreditsWithDb(appPrisma, 1, 2, 5), null);
    let wallet = await scoped.query<{ credits: number }>('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.equal(wallet.rows[0]?.credits, 100, "foreign pet reservation must not debit");

    const reservations = await Promise.all(Array.from({ length: 64 }, () =>
      reservationModule.reserveAgentCreditsWithDb(appPrisma, 1, 1, 5),
    ));
    const accepted = reservations.filter((value): value is NonNullable<typeof value> => Boolean(value));
    assert.equal(accepted.length, 20, "64 reservations may consume only the available wallet");
    wallet = await scoped.query('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.equal(wallet.rows[0]?.credits, 0);

    await Promise.all(accepted.flatMap(reservation => [
      reservationModule.refundAgentCreditsOnceWithDb(appPrisma, reservation),
      reservationModule.refundAgentCreditsOnceWithDb(appPrisma, reservation),
    ]));
    wallet = await scoped.query('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.equal(wallet.rows[0]?.credits, 100, "duplicate refund calls must credit exactly once");

    await scoped.query('DELETE FROM "agent_credit_reservations"');
    const oldNow = new Date("2026-07-17T00:00:00.000Z");
    const stale = await reservationModule.reserveAgentCreditsWithDb(appPrisma, 1, 1, 10, oldNow);
    assert.ok(stale);
    const staleRuns = await Promise.all(Array.from({ length: 32 }, () =>
      reservationModule.refundStaleAgentCreditReservationsWithDb(
        appPrisma,
        new Date("2026-07-17T00:06:00.000Z"),
        100,
      ),
    ));
    assert.equal(staleRuns.reduce((sum, result) => sum + result.refundedReservations, 0), 1);
    wallet = await scoped.query('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.equal(wallet.rows[0]?.credits, 100, "stale crash reservation must refund once");

    await scoped.query('DELETE FROM "agent_credit_reservations"');
    const raced = await reservationModule.reserveAgentCreditsWithDb(appPrisma, 1, 1, 10, oldNow);
    assert.ok(raced);
    await Promise.all([
      ...Array.from({ length: 24 }, () => reservationModule.commitAgentCreditsWithDb(appPrisma, raced!)),
      ...Array.from({ length: 24 }, () => reservationModule.refundStaleAgentCreditReservationsWithDb(
        appPrisma,
        new Date("2026-07-17T00:06:00.000Z"),
        100,
      )),
    ]);
    const terminal = await scoped.query<{ status: string }>('SELECT "status" FROM "agent_credit_reservations" WHERE "id"=$1', [raced!.id]);
    wallet = await scoped.query('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.ok(terminal.rows[0]?.status === "committed" || terminal.rows[0]?.status === "refunded");
    assert.equal(wallet.rows[0]?.credits, terminal.rows[0]?.status === "committed" ? 90 : 100);

    await scoped.query(`
      DELETE FROM "pet_agent_schedules";
      UPDATE "users" SET "credits"=100 WHERE "id"=1;
      INSERT INTO "pet_agent_schedules" ("pet_id", "daily_credit_limit", "credits_used_today", "last_reset_at")
        VALUES (1, 7, 0, '2026-07-18T00:00:00Z');
    `);
    const dailyAttempts = await Promise.all(Array.from({ length: 64 }, () =>
      creditModule.consumeAgentCreditsWithDb(appPrisma, 1, 1, new Date("2026-07-18T01:00:00Z")),
    ));
    assert.equal(dailyAttempts.filter(Boolean).length, 7);
    const budget = await scoped.query<{ credits: number; used: number }>(`
      SELECT (SELECT "credits" FROM "users" WHERE "id"=1)::int AS "credits",
             (SELECT "credits_used_today" FROM "pet_agent_schedules" WHERE "pet_id"=1)::int AS "used"
    `);
    assert.deepEqual(budget.rows[0], { credits: 93, used: 7 });

    await scoped.query(`
      DELETE FROM "pet_agent_schedules";
      UPDATE "users" SET "credits"=3 WHERE "id"=1;
      INSERT INTO "pet_agent_schedules" ("pet_id", "daily_credit_limit", "credits_used_today", "last_reset_at")
        VALUES (1, 100, 0, CURRENT_TIMESTAMP), (4, 100, 0, CURRENT_TIMESTAMP);
    `);
    const sharedWallet = await Promise.all(Array.from({ length: 64 }, (_, index) =>
      creditModule.consumeAgentCreditsWithDb(appPrisma, index % 2 === 0 ? 1 : 4, 1),
    ));
    assert.equal(sharedWallet.filter(Boolean).length, 3, "two pets must share one guarded owner wallet");
    wallet = await scoped.query('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.equal(wallet.rows[0]?.credits, 0);

    const claims = await Promise.all(Array.from({ length: 64 }, () =>
      claimModule.claimTelegramInboundMessageWithDb(appPrisma, {
        petId: 1,
        chatId: "chat-one",
        messageId: "message-9",
        text: "synthetic hello",
        metadata: { synthetic: true },
      }),
    ));
    assert.equal(claims.filter(Boolean).length, 1, "duplicate Telegram delivery must be claimed once");
    assert.equal(await claimModule.claimTelegramInboundMessageWithDb(appPrisma, {
      petId: 1,
      chatId: "chat-two",
      messageId: "message-9",
      text: "same id, different chat",
      metadata: { synthetic: true },
    }), true, "message ids are scoped to chat");

    process.stdout.write("PASS agent channel codec/idempotency + credit reservation/consume/stale-refund PG races\n");
  } finally {
    if (previousKey === undefined) delete process.env.AGENT_ENCRYPTION_KEY;
    else process.env.AGENT_ENCRYPTION_KEY = previousKey;
    if (appPrisma) await appPrisma.$disconnect().catch(() => {});
    if (defaultPrisma) await defaultPrisma.$disconnect().catch(() => {});
    await scoped.end().catch(() => {});
    if (created) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await admin.end().catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Agent credit integration failed"}\n`);
  process.exitCode = 1;
});

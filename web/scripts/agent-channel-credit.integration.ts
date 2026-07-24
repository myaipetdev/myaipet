import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

async function verifyContract() {
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
  const [availability, connect, webhook, centralTelegram, credits, reservations,
    runLedger, migration, env, smoke, cron] = await Promise.all([
    read("../src/lib/oauth/availability.ts"),
    read("../src/app/api/pets/[petId]/agent/connect/route.ts"),
    read("../src/app/api/agent/webhook/telegram/[petId]/route.ts"),
    read("../src/app/api/bots/telegram/webhook/route.ts"),
    read("../src/lib/agentCredits.ts"),
    read("../src/lib/agentCreditReservation.ts"),
    read("../src/lib/petclaw/agent/run-ledger.ts"),
    read("../prisma/migrations/20260717169000_agent_channel_credit_hardening/migration.sql"),
    read("../config/production.env.example"),
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
  assert.match(reservations, /commitAndReadReceipt/);
  assert.match(reservations, /typeof db\.\$transaction === "function"/);
  assert.ok(
    reservations.indexOf("agentCreditReservation.updateMany") < reservations.indexOf("Charged wallet receipt is unavailable"),
    "charge transition and required receipt must execute in one atomic callback",
  );
  const settlement = runLedger.slice(
    runLedger.indexOf("export async function settlePetAgentRunWithDb"),
    runLedger.indexOf("export function settlePetAgentRun"),
  );
  const reservationLock = settlement.indexOf('SELECT "id" FROM "agent_credit_reservations"');
  const ownerLock = settlement.indexOf('SELECT "id" FROM "users"');
  const runLock = settlement.indexOf('SELECT "id" FROM "pet_agent_runs"', ownerLock);
  assert.ok(
    reservationLock >= 0 && reservationLock < ownerLock && ownerLock < runLock,
    "terminal settlement must lock reservation → owner wallet → run, matching stale-refund order",
  );
  assert.ok(
    runLock < settlement.indexOf("const row = await tx.petAgentRun.findUnique"),
    "terminal settlement must re-read the run after acquiring the ordered locks",
  );
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
      CREATE TABLE "pet_agent_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "run_id" uuid NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "pet_id" integer NOT NULL,
        "pet_name" varchar(50) NOT NULL,
        "goal" text NOT NULL,
        "max_steps" integer NOT NULL,
        "execution_contract" varchar(120) NOT NULL DEFAULT 'freeform:v1',
        "private_content_scrubbed" boolean NOT NULL DEFAULT false,
        "state" varchar(20) NOT NULL DEFAULT 'reserved',
        "reservation_id" uuid UNIQUE REFERENCES "agent_credit_reservations"("id") ON DELETE SET NULL,
        "completed" boolean,
        "answer" text,
        "steps" jsonb,
        "stopped_reason" varchar(40),
        "billing" jsonb,
        "credits_remaining" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "started_at" timestamptz,
        "terminal_at" timestamptz,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("user_id", "pet_id", "run_id")
      );
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
    const [reservationModule, runLedgerModule, creditModule, claimModule, credentialsModule, oauthCredentialsModule] = await Promise.all([
      import("../src/lib/agentCreditReservation"),
      import("../src/lib/petclaw/agent/run-ledger"),
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

    // A charge transition and its balance receipt are one transaction. If the
    // receipt read fails, the transition must roll back to `reserved` so the
    // caller can safely retry instead of charging without a response receipt.
    await scoped.query('DELETE FROM "agent_credit_reservations"');
    const receiptReservation = await reservationModule.reserveAgentCreditsWithDb(appPrisma, 1, 1, 5);
    assert.ok(receiptReservation);
    const receiptFailureDb = {
      $transaction: (fn: (tx: any) => Promise<unknown>) => appPrisma.$transaction(async (tx: any) => fn({
        agentCreditReservation: {
          updateMany: (args: unknown) => tx.agentCreditReservation.updateMany(args),
          findUnique: (args: unknown) => tx.agentCreditReservation.findUnique(args),
        },
        user: {
          findUnique: async () => { throw new Error("synthetic receipt read failure"); },
        },
      })),
    };
    await assert.rejects(
      reservationModule.commitAgentCreditsWithDb(receiptFailureDb, receiptReservation!),
      /synthetic receipt read failure/,
    );
    let receiptStatus = await scoped.query<{ status: string }>(
      'SELECT "status" FROM "agent_credit_reservations" WHERE "id"=$1',
      [receiptReservation!.id],
    );
    assert.equal(receiptStatus.rows[0]?.status, "reserved", "missing receipt must roll back charge transition");
    assert.equal(
      await reservationModule.commitAgentCreditsWithDb(appPrisma, receiptReservation!),
      95,
      "a retry returns the atomic charged balance receipt",
    );
    receiptStatus = await scoped.query('SELECT "status" FROM "agent_credit_reservations" WHERE "id"=$1', [receiptReservation!.id]);
    assert.equal(receiptStatus.rows[0]?.status, "committed");
    await scoped.query('UPDATE "users" SET "credits"=100 WHERE "id"=1');

    await scoped.query('DELETE FROM "agent_credit_reservations"');
    const outerTransactionReservation = await reservationModule.reserveAgentCreditsWithDb(appPrisma, 1, 1, 5);
    assert.ok(outerTransactionReservation);
    assert.equal(
      await appPrisma.$transaction((tx: any) =>
        reservationModule.commitAgentCreditsWithDb(tx, outerTransactionReservation!),
      ),
      95,
      "an existing caller transaction remains the atomic receipt boundary",
    );
    await scoped.query('UPDATE "users" SET "credits"=100 WHERE "id"=1');

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
    const commitRefundRace = await Promise.allSettled([
      ...Array.from({ length: 24 }, () => reservationModule.commitAgentCreditsWithDb(appPrisma, raced!)),
      ...Array.from({ length: 24 }, () => reservationModule.refundStaleAgentCreditReservationsWithDb(
        appPrisma,
        new Date("2026-07-17T00:06:00.000Z"),
        100,
      )),
    ]);
    for (const result of commitRefundRace) {
      if (result.status === "rejected") {
        assert.match(
          String(result.reason instanceof Error ? result.reason.message : result.reason),
          /no longer chargeable/,
          "only a stale-refund win may reject a competing commit",
        );
      }
    }
    const terminal = await scoped.query<{ status: string }>('SELECT "status" FROM "agent_credit_reservations" WHERE "id"=$1', [raced!.id]);
    wallet = await scoped.query('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.ok(terminal.rows[0]?.status === "committed" || terminal.rows[0]?.status === "refunded");
    assert.equal(wallet.rows[0]?.credits, terminal.rows[0]?.status === "committed" ? 90 : 100);

    // One client-generated runId may be submitted concurrently, but exactly
    // one request owns the wallet reservation/provider slot. Every duplicate
    // observes the same durable run and concurrent terminal settlement replays
    // one owner receipt without another charge.
    await scoped.query('DELETE FROM "pet_agent_runs"; DELETE FROM "agent_credit_reservations"; UPDATE "users" SET "credits"=100 WHERE "id"=1');
    const runId = randomUUID();
    const runAttempts = await Promise.all(Array.from({ length: 48 }, () =>
      runLedgerModule.reservePetAgentRunWithDb(appPrisma, {
        runId, userId: 1, petId: 1, petName: "Audit Pet", goal: "reconcile this run", maxSteps: 4, amount: 5,
      }),
    ));
    assert.equal(runAttempts.filter((result) => result.kind === "created").length, 1);
    assert.equal(runAttempts.filter((result) => result.kind === "existing").length, 47);
    wallet = await scoped.query('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.equal(wallet.rows[0]?.credits, 95, "idempotent run concurrency reserves five credits once");
    await runLedgerModule.markPetAgentRunRunningWithDb(appPrisma, 1, 1, runId);
    const billing = {
      outcome: "charged" as const, creditsCharged: 5, reason: "completed_with_direct_answer",
      successfulToolCalls: 0, failedToolCalls: 0, committedSideEffects: 0,
      usageKnown: true,
      modelCalls: 1, orchestratorModelCalls: 1, skillModelCalls: 0,
    };
    const receipts = await Promise.all(Array.from({ length: 24 }, () =>
      runLedgerModule.settlePetAgentRunWithDb(appPrisma, {
        userId: 1, petId: 1, runId, outcome: "charged", completed: true,
        answer: "done", steps: [], stoppedReason: "completed", billing,
      }),
    ));
    assert.ok(receipts.every((receipt) => receipt.runId === runId && receipt.state === "terminal"));
    wallet = await scoped.query('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.equal(wallet.rows[0]?.credits, 95, "concurrent receipt settlement charges exactly once");
    assert.equal(await runLedgerModule.getPetAgentRunWithDb(appPrisma, 2, 1, runId), null, "another owner cannot read the receipt");

    // One idempotency key can never be rebound to a different task. Gate the
    // first reservation insert after it owns the Pet lock, then prove the
    // conflicting request is waiting on that exact transaction before release.
    await scoped.query('DELETE FROM "pet_agent_runs"; DELETE FROM "agent_credit_reservations"; UPDATE "users" SET "credits"=100 WHERE "id"=1');
    const conflictingInputGate = 72_420_725;
    await scoped.query(`
      CREATE OR REPLACE FUNCTION "gate_conflicting_agent_run_input"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."purpose" = 'pet_agent_loop' THEN
          PERFORM pg_advisory_xact_lock(${conflictingInputGate});
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "gate_conflicting_agent_run_input"
      BEFORE INSERT ON "agent_credit_reservations"
      FOR EACH ROW EXECUTE FUNCTION "gate_conflicting_agent_run_input"();
    `);
    const conflictingGateClient = await scoped.connect();
    let conflictingGateHeld = false;
    try {
      await conflictingGateClient.query("SELECT pg_advisory_lock($1)", [conflictingInputGate]);
      conflictingGateHeld = true;
      const conflictingRunId = randomUUID();
      const firstInput = runLedgerModule.reservePetAgentRunWithDb(appPrisma, {
        runId: conflictingRunId,
        userId: 1,
        petId: 1,
        petName: "Audit Pet",
        goal: "review this exact owner text",
        maxSteps: 1,
        executionContract: "office:review:v1:office-review",
        amount: 5,
      });
      let firstPid: number | undefined;
      for (let attempt = 0; attempt < 250 && firstPid === undefined; attempt += 1) {
        const observed = await scoped.query<{ pid: number }>(`
          SELECT "pid"::int AS "pid"
          FROM pg_locks
          WHERE "locktype" = 'advisory'
            AND "granted" = FALSE
            AND "objid" = $1::oid
          LIMIT 1
        `, [conflictingInputGate]);
        firstPid = observed.rows[0]?.pid;
        if (firstPid === undefined) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(firstPid !== undefined, "first conflicting input must reach the reservation gate");

      const secondInput = runLedgerModule.reservePetAgentRunWithDb(appPrisma, {
        runId: conflictingRunId,
        userId: 1,
        petId: 1,
        petName: "Audit Pet",
        goal: "draft a different owner brief",
        maxSteps: 1,
        executionContract: "office:draft:v1:office-draft",
        amount: 5,
      });
      let secondBlocked = false;
      for (let attempt = 0; attempt < 250 && !secondBlocked; attempt += 1) {
        const observed = await scoped.query(`
          SELECT waiting."pid"::int AS "pid"
          FROM pg_locks AS waiting
          JOIN pg_locks AS holding
            ON holding."locktype" = 'transactionid'
           AND holding."transactionid" = waiting."transactionid"
           AND holding."granted" = TRUE
          WHERE waiting."locktype" = 'transactionid'
            AND waiting."granted" = FALSE
            AND holding."pid" = $1
          LIMIT 1
        `, [firstPid]);
        secondBlocked = Boolean(observed.rows[0]);
        if (!secondBlocked) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(secondBlocked, true, "second conflicting input must wait on the first Pet lock");

      await conflictingGateClient.query("SELECT pg_advisory_unlock($1)", [conflictingInputGate]);
      conflictingGateHeld = false;
      const [firstResult, secondResult] = await Promise.all([firstInput, secondInput]);
      assert.equal(firstResult.kind, "created");
      assert.equal(secondResult.kind, "existing");
      assert.equal(secondResult.kind === "existing" && secondResult.inputMatches, false);
      assert.equal(secondResult.kind === "existing" && secondResult.run.goal, "review this exact owner text");
      assert.equal(
        secondResult.kind === "existing" && secondResult.run.executionContract,
        "office:review:v1:office-review",
      );
      assert.equal(secondResult.kind === "existing" && secondResult.run.taskKind, "review");
      const conflictingRows = await scoped.query<{ runs: number; reservations: number; credits: number }>(`
        SELECT
          (SELECT COUNT(*) FROM "pet_agent_runs" WHERE "run_id" = $1)::int AS "runs",
          (SELECT COUNT(*) FROM "agent_credit_reservations" WHERE "status" = 'reserved')::int AS "reservations",
          (SELECT "credits" FROM "users" WHERE "id" = 1)::int AS "credits"
      `, [conflictingRunId]);
      assert.deepEqual(conflictingRows.rows[0], { runs: 1, reservations: 1, credits: 95 });
    } finally {
      if (conflictingGateHeld) {
        await conflictingGateClient.query("SELECT pg_advisory_unlock($1)", [conflictingInputGate]).catch(() => {});
      }
      conflictingGateClient.release();
      await scoped.query('DROP TRIGGER IF EXISTS "gate_conflicting_agent_run_input" ON "agent_credit_reservations"');
      await scoped.query('DROP FUNCTION IF EXISTS "gate_conflicting_agent_run_input"()');
    }

    // A pet deleted or deactivated between route authorization and reservation
    // is not a wallet failure. It must be surfaced as unavailable, never 402.
    const missingRun = await runLedgerModule.reservePetAgentRunWithDb(appPrisma, {
      runId: randomUUID(), userId: 1, petId: 999_999, petName: "Gone", goal: "must not debit", maxSteps: 1, amount: 5,
    });
    const inactiveRun = await runLedgerModule.reservePetAgentRunWithDb(appPrisma, {
      runId: randomUUID(), userId: 1, petId: 3, petName: "Inactive", goal: "must not debit", maxSteps: 1, amount: 5,
    });
    assert.equal(missingRun.kind, "unavailable");
    assert.equal(inactiveRun.kind, "unavailable");
    wallet = await scoped.query('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.equal(wallet.rows[0]?.credits, 95, "unavailable pets cannot consume wallet credits");

    // Different idempotency keys racing for one pet serialize on the Pet row:
    // exactly one reserves funds and the other receives the active run receipt.
    await scoped.query('DELETE FROM "pet_agent_runs"; DELETE FROM "agent_credit_reservations"; UPDATE "users" SET "credits"=100 WHERE "id"=1');
    const competingIds = [randomUUID(), randomUUID()];
    const competingRuns = await Promise.all(competingIds.map((competingRunId) =>
      runLedgerModule.reservePetAgentRunWithDb(appPrisma, {
        runId: competingRunId, userId: 1, petId: 1, petName: "Audit Pet", goal: "one active run", maxSteps: 4, amount: 5,
      }),
    ));
    const createdCompeting = competingRuns.find((result) => result.kind === "created");
    const blockedCompeting = competingRuns.find((result) => result.kind === "blocked");
    assert.ok(createdCompeting && createdCompeting.kind === "created");
    assert.ok(blockedCompeting && blockedCompeting.kind === "blocked");
    assert.equal(blockedCompeting.run.runId, createdCompeting.run.runId);
    const activeRows = await scoped.query<{ runs: number; reservations: number }>(`
      SELECT
        (SELECT COUNT(*) FROM "pet_agent_runs" WHERE "state" IN ('reserved','running'))::int AS "runs",
        (SELECT COUNT(*) FROM "agent_credit_reservations" WHERE "status"='reserved')::int AS "reservations"
    `);
    assert.deepEqual(activeRows.rows[0], { runs: 1, reservations: 1 });
    wallet = await scoped.query('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.equal(wallet.rows[0]?.credits, 95, "different run IDs reserve one paid slot only");

    // Stale recovery's terminal receipt must read the post-refund balance from
    // wallet_refunds RETURNING, and must explicitly preserve unknown usage.
    await scoped.query('DELETE FROM "pet_agent_runs"; DELETE FROM "agent_credit_reservations"; UPDATE "users" SET "credits"=73 WHERE "id"=1');
    const staleRunId = randomUUID();
    const staleLedger = await runLedgerModule.reservePetAgentRunWithDb(appPrisma, {
      runId: staleRunId,
      userId: 1,
      petId: 1,
      petName: "Audit Pet",
      goal: "recover an unknown process outcome",
      maxSteps: 4,
      amount: 10,
      now: oldNow,
    });
    assert.equal(staleLedger.kind, "created");
    await runLedgerModule.markPetAgentRunRunningWithDb(appPrisma, 1, 1, staleRunId, oldNow);
    const staleLedgerRefund = await reservationModule.refundStaleAgentCreditReservationsWithDb(
      appPrisma,
      new Date("2026-07-17T00:06:00.000Z"),
      100,
    );
    assert.deepEqual(staleLedgerRefund, { refundedReservations: 1, refundedCredits: 10 });
    const recovered = await runLedgerModule.getPetAgentRunWithDb(appPrisma, 1, 1, staleRunId);
    assert.equal(recovered?.state, "terminal");
    assert.equal(recovered?.creditsRemaining, 73, "stale receipt must expose the post-refund wallet balance");
    assert.equal(recovered?.billing?.outcome, "refunded");
    assert.equal(recovered?.billing?.reason, "outcome_unknown_timeout");
    assert.equal(recovered?.billing?.usageKnown, false);
    assert.equal(recovered?.billing?.modelCalls, null);
    assert.equal(recovered?.billing?.orchestratorModelCalls, null);
    assert.equal(recovered?.billing?.skillModelCalls, null);
    wallet = await scoped.query('SELECT "credits" FROM "users" WHERE "id"=1');
    assert.equal(wallet.rows[0]?.credits, 73);

    // Regression: stale recovery owns reservation → wallet → run. Settlement
    // must use the same lock order. An advisory gate holds the stale worker in
    // its wallet trigger after it owns the reservation; pg_locks then proves
    // settlement is waiting on that exact transaction before the gate opens.
    // The former run-first order formed a deterministic deadlock at that point.
    const staleRefundGate = 72_420_724;
    await scoped.query(`
      CREATE OR REPLACE FUNCTION "delay_stale_wallet_refund"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."credits" > OLD."credits" THEN
          PERFORM pg_advisory_xact_lock(${staleRefundGate});
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "delay_stale_wallet_refund"
      BEFORE UPDATE OF "credits" ON "users"
      FOR EACH ROW EXECUTE FUNCTION "delay_stale_wallet_refund"();
    `);
    const gateClient = await scoped.connect();
    const waitForLock = async <T extends Record<string, unknown>>(
      sql: string,
      params: unknown[],
      label: string,
    ): Promise<T> => {
      for (let attempt = 0; attempt < 250; attempt += 1) {
        const observed = await scoped.query<T>(sql, params);
        if (observed.rows[0]) return observed.rows[0];
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    try {
      for (let round = 0; round < 4; round += 1) {
        await scoped.query(`
          DELETE FROM "pet_agent_runs";
          DELETE FROM "agent_credit_reservations";
          UPDATE "users" SET "credits"=100 WHERE "id"=1;
        `);
        const raceRunId = randomUUID();
        const racedRun = await runLedgerModule.reservePetAgentRunWithDb(appPrisma, {
          runId: raceRunId,
          userId: 1,
          petId: 1,
          petName: "Audit Pet",
          goal: "settle without a lock inversion",
          maxSteps: 4,
          amount: 5,
          now: oldNow,
        });
        assert.equal(racedRun.kind, "created");
        await runLedgerModule.markPetAgentRunRunningWithDb(appPrisma, 1, 1, raceRunId, oldNow);

        await gateClient.query("SELECT pg_advisory_lock($1)", [staleRefundGate]);
        let gateHeld = true;
        let staleRefund: Promise<{ refundedReservations: number; refundedCredits: number }> | undefined;
        let chargedSettlement: Promise<any> | undefined;
        let results:
          | [{ refundedReservations: number; refundedCredits: number }, any]
          | undefined;
        try {
          staleRefund = reservationModule.refundStaleAgentCreditReservationsWithDb(
            appPrisma,
            new Date("2026-07-17T00:06:00.000Z"),
            100,
          );
          const staleWait = await waitForLock<{ pid: number }>(`
            SELECT "pid"::int AS "pid"
            FROM pg_locks
            WHERE "locktype" = 'advisory'
              AND "granted" = FALSE
              AND "objid" = $1::oid
            LIMIT 1
          `, [staleRefundGate], "stale refund advisory gate");

          chargedSettlement = runLedgerModule.settlePetAgentRunWithDb(appPrisma, {
            userId: 1,
            petId: 1,
            runId: raceRunId,
            outcome: "charged",
            completed: true,
            answer: "settled",
            steps: [],
            stoppedReason: "completed",
            billing,
          });
          await waitForLock(`
            SELECT waiting."pid"::int AS "pid"
            FROM pg_locks AS waiting
            JOIN pg_locks AS holding
              ON holding."locktype" = 'transactionid'
             AND holding."transactionid" = waiting."transactionid"
             AND holding."granted" = TRUE
            WHERE waiting."locktype" = 'transactionid'
              AND waiting."granted" = FALSE
              AND holding."pid" = $1
            LIMIT 1
          `, [staleWait.pid], "settlement waiting on stale reservation");

          await gateClient.query("SELECT pg_advisory_unlock($1)", [staleRefundGate]);
          gateHeld = false;
          results = await Promise.all([staleRefund, chargedSettlement]);
        } finally {
          if (gateHeld) {
            await gateClient.query("SELECT pg_advisory_unlock($1)", [staleRefundGate]).catch(() => {});
          }
        }
        assert.ok(results, "race must return both stale-refund and settlement receipts");
        const [refundResult, settlementReceipt] = results;
        assert.equal(refundResult.refundedReservations, 1);
        assert.equal(settlementReceipt.runId, raceRunId);
        assert.equal(settlementReceipt.state, "terminal");
        assert.equal(settlementReceipt.billing?.outcome, "refunded");
        assert.equal(settlementReceipt.billing?.reason, "outcome_unknown_timeout");
        assert.equal(settlementReceipt.creditsRemaining, 100);

        const exactOnce = await scoped.query<{
          credits: number;
          run_state: string;
          reservation_status: string;
          run_outcome: string;
          receipt_credits: number;
        }>(`
          SELECT owner."credits"::int AS "credits",
                 run."state" AS "run_state",
                 reservation."status" AS "reservation_status",
                 run."billing"->>'outcome' AS "run_outcome",
                 run."credits_remaining"::int AS "receipt_credits"
          FROM "pet_agent_runs" AS run
          JOIN "agent_credit_reservations" AS reservation
            ON reservation."id" = run."reservation_id"
          JOIN "users" AS owner ON owner."id" = run."user_id"
          WHERE run."run_id" = $1
        `, [raceRunId]);
        assert.deepEqual(exactOnce.rows, [{
          credits: 100,
          run_state: "terminal",
          reservation_status: "refunded",
          run_outcome: "refunded",
          receipt_credits: 100,
        }], `round ${round + 1}: stale refund must win once and persist one matching terminal receipt`);
      }
    } finally {
      gateClient.release();
      await scoped.query('DROP TRIGGER IF EXISTS "delay_stale_wallet_refund" ON "users"');
      await scoped.query('DROP FUNCTION IF EXISTS "delay_stale_wallet_refund"()');
    }

    await scoped.query(`
      DELETE FROM "pet_agent_runs";
      DELETE FROM "agent_credit_reservations";
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

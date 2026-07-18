import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const TEST_NOW = new Date("2026-07-18T12:00:00.000Z");
const hash = (byte: string) => `0x${byte.repeat(64).slice(0, 64)}`;

async function verifyContract(): Promise<void> {
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
  const [paywall, stats, interact, onchain, recovery, actionPay, modal, statsPanel, editorial, profile] = await Promise.all([
    read("../src/lib/paywall.ts"),
    read("../src/app/api/pets/[petId]/stats/upgrade/route.ts"),
    read("../src/app/api/pets/[petId]/interact/route.ts"),
    read("../src/lib/onchain.ts"),
    read("../src/lib/actionReceiptRecovery.ts"),
    read("../src/app/api/payments/action-pay/route.ts"),
    read("../src/components/PaywallModal.tsx"),
    read("../src/components/StatUpgradePanel.tsx"),
    read("../src/components/editorial/MyPetEditorial.tsx"),
    read("../src/components/PetProfile.tsx"),
  ]);

  assert.match(paywall, /FROM "pets"[\s\S]*FOR UPDATE/);
  assert.match(paywall, /hooks\.validate[\s\S]*paidAction\.updateMany[\s\S]*hooks\.apply/);
  assert.match(paywall, /dailyActionCount\.updateMany[\s\S]*hooks\.apply/);
  assert.match(paywall, /consumed_at: null/);
  assert.doesNotMatch(paywall, /export async function enforcePaywall/);
  for (const route of [stats, interact]) {
    assert.match(route, /executePetActionWithPaywall/);
    assert.doesNotMatch(route, /enforcePaywall/);
  }
  assert.match(stats, /validate:[\s\S]*STAT_CEILING[\s\S]*apply:[\s\S]*tx\.pet\.update[\s\S]*tx\.petMemory\.create/);
  assert.match(interact, /validate:[\s\S]*INTERACT_COOLDOWN_MS[\s\S]*gateInteraction/);
  assert.match(interact, /apply:[\s\S]*tx\.pet\.update[\s\S]*tx\.petInteraction\.create[\s\S]*tx\.petMemory\.create/);
  assert.match(onchain, /process\.env\.PAYMENTS_ENABLED === "true"/);
  assert.match(recovery, /FROM "pets"[\s\S]*FOR UPDATE[\s\S]*FROM "paid_actions"[\s\S]*FOR UPDATE/);
  assert.match(recovery, /receipt\.consumed_at[\s\S]*receipt\.pet_id !== null/);
  assert.match(actionPay, /recoverActionReceiptWithDb/);
  assert.match(modal, /localStorage\.setItem[\s\S]*receiptRegistered/);
  assert.match(modal, /await info\.onPaid\(txHash\)[\s\S]*clearPending\(\)[\s\S]*onClose\(\)/);
  for (const callsite of [statsPanel, editorial, profile]) {
    assert.doesNotMatch(callsite, /onPaid:\s*async[\s\S]{0,240}setPaywall\(null\)/);
  }
}

async function createFixture(admin: Pool, schema: string): Promise<void> {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`
    CREATE TABLE "${schema}"."pets" (
      "id" integer PRIMARY KEY,
      "user_id" integer NOT NULL,
      "name" varchar(50) NOT NULL,
      "species" integer NOT NULL DEFAULT 0,
      "personality_type" varchar(20) NOT NULL DEFAULT 'friendly',
      "level" integer NOT NULL DEFAULT 1,
      "experience" integer NOT NULL DEFAULT 0,
      "happiness" integer NOT NULL DEFAULT 70,
      "energy" integer NOT NULL DEFAULT 100,
      "hunger" integer NOT NULL DEFAULT 30,
      "bond_level" integer NOT NULL DEFAULT 0,
      "total_interactions" integer NOT NULL DEFAULT 0,
      "personality_modifiers" jsonb DEFAULT '{}',
      "last_interaction_at" timestamptz,
      "atk" integer NOT NULL DEFAULT 10,
      "def" integer NOT NULL DEFAULT 10,
      "spd" integer NOT NULL DEFAULT 10,
      "is_active" boolean NOT NULL DEFAULT true,
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE "${schema}"."paid_actions" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL,
      "pet_id" integer,
      "action_key" varchar(40) NOT NULL,
      "amount_usd" double precision NOT NULL,
      "tx_hash" varchar(66) NOT NULL UNIQUE,
      "burn_amount" double precision NOT NULL DEFAULT 0,
      "burned_tx" varchar(66),
      "consumed_at" timestamptz,
      "metadata" jsonb DEFAULT '{}',
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE "${schema}"."consumed_payments" (
      "id" serial PRIMARY KEY,
      "tx_hash" varchar(66) NOT NULL UNIQUE,
      "user_id" integer NOT NULL,
      "purpose" varchar(40) NOT NULL,
      "amount_usd" double precision NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE "${schema}"."daily_action_counts" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL,
      "action_key" varchar(40) NOT NULL,
      "day" varchar(10) NOT NULL,
      "count" integer NOT NULL DEFAULT 0,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("user_id", "action_key", "day")
    );
    CREATE TABLE "${schema}"."pet_memories" (
      "id" serial PRIMARY KEY,
      "pet_id" integer NOT NULL,
      "memory_type" varchar(20) NOT NULL,
      "content" text NOT NULL,
      "emotion" varchar(20) NOT NULL DEFAULT 'calm',
      "importance" integer NOT NULL DEFAULT 1,
      "is_minted" boolean NOT NULL DEFAULT false,
      "memory_nft_id" integer,
      "embedding" jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
  `);
  await admin.query(`
    INSERT INTO "${schema}"."pets"
      ("id", "user_id", "name", "atk", "total_interactions")
    VALUES
      (1, 1, 'PaidRace', 495, 0),
      (2, 1, 'Paused', 10, 0),
      (3, 1, 'RollbackPaid', 10, 0),
      (4, 2, 'RollbackFree', 10, 0),
      (5, 3, 'FreeRaceA', 10, 0),
      (6, 3, 'FreeRaceB', 10, 0);
  `);
  await admin.query(
    `INSERT INTO "${schema}"."paid_actions"
      ("user_id", "pet_id", "action_key", "amount_usd", "tx_hash")
     VALUES
      (1, 1, 'stat_upgrade_atk', 1, $1),
      (1, 2, 'stat_upgrade_atk', 1, $2),
      (1, 3, 'stat_upgrade_atk', 1, $3),
      (1, 1, 'stat_upgrade_atk', 1, $4),
      (1, NULL, 'stat_upgrade_atk', 1, $5)`,
    [hash("a1"), hash("b2"), hash("c3"), hash("d4"), hash("e5")],
  );
  // b2 intentionally remains an orphan to exercise the runtime fail-closed
  // ledger assertion. The other historical receipts have valid action claims.
  await admin.query(
    `INSERT INTO "${schema}"."consumed_payments"
      ("tx_hash", "user_id", "purpose", "amount_usd")
     VALUES
      ($1, 1, 'action', 1),
      ($2, 1, 'action', 1),
      ($3, 1, 'action', 1),
      ($4, 1, 'action', 1)`,
    [hash("a1"), hash("c3"), hash("d4"), hash("e5")],
  );
}

async function main(): Promise<void> {
  await verifyContract();

  const connectionString = process.env.PAYWALL_EFFECT_TEST_DATABASE_URL;
  if (!connectionString) {
    console.log("SKIP paywall-effect PG integration: set PAYWALL_EFFECT_TEST_DATABASE_URL");
    return;
  }
  const databaseName = (() => {
    try { return new URL(connectionString).pathname.slice(1); } catch { return ""; }
  })();
  if (!databaseName.includes("paywall_effect_test")) {
    throw new Error("Refusing paywall-effect integration outside a paywall_effect_test database");
  }

  const oldDatabaseUrl = process.env.DATABASE_URL;
  const oldPayments = process.env.PAYMENTS_ENABLED;
  process.env.DATABASE_URL = connectionString;
  process.env.PAYMENTS_ENABLED = "false";

  const schema = `paywall_effect_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  const admin = new Pool({ connectionString, max: 70 });
  let appPrisma: any;
  let defaultPrisma: any;
  let created = false;
  try {
    await createFixture(admin, schema);
    created = true;

    const [
      { executePetActionWithPaywall },
      { recoverActionReceiptWithDb },
      { prisma },
      { PrismaClient },
      { PrismaPg },
    ] = await Promise.all([
      import("../src/lib/paywall"),
      import("../src/lib/actionReceiptRecovery"),
      import("../src/lib/prisma"),
      import("../src/generated/prisma/client"),
      import("@prisma/adapter-pg"),
    ]);
    defaultPrisma = prisma;
    appPrisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, options: `-c search_path=${schema}` },
        { schema },
      ),
    } as any);

    const rebound = await recoverActionReceiptWithDb(appPrisma, {
      userId: 1,
      petId: 2,
      actionKey: "stat_upgrade_atk",
      txHash: hash("e5"),
    });
    assert.equal(rebound.kind, "rebound");
    const reboundAudit = await admin.query<{ pet_id: number | null; consumed: boolean }>(
      `SELECT "pet_id", "consumed_at" IS NOT NULL AS "consumed"
       FROM "${schema}"."paid_actions" WHERE "tx_hash" = $1`,
      [hash("e5")],
    );
    assert.deepEqual(reboundAudit.rows[0], { pet_id: 2, consumed: false });
    const activeBoundConflict = await recoverActionReceiptWithDb(appPrisma, {
      userId: 1,
      petId: 3,
      actionKey: "stat_upgrade_atk",
      txHash: hash("e5"),
    });
    assert.equal(activeBoundConflict.kind, "conflict");
    await admin.query(
      `UPDATE "${schema}"."paid_actions"
       SET "pet_id" = NULL, "consumed_at" = $2 WHERE "tx_hash" = $1`,
      [hash("e5"), TEST_NOW],
    );
    const consumedDetachedConflict = await recoverActionReceiptWithDb(appPrisma, {
      userId: 1,
      petId: 3,
      actionKey: "stat_upgrade_atk",
      txHash: hash("e5"),
    });
    assert.equal(consumedDetachedConflict.kind, "conflict");

    const statHooks = (fail = false) => ({
      validate: (pet: { atk: number }) => pet.atk >= 500
        ? { kind: "ceiling" as const, current: pet.atk }
        : null,
      apply: async (tx: any, pet: { id: number; atk: number }) => {
        const updated = await tx.pet.update({
          where: { id: pet.id },
          data: { atk: pet.atk + 5 },
          select: { atk: true },
        });
        await tx.petMemory.create({
          data: {
            pet_id: pet.id,
            memory_type: "training",
            content: `ATK ${updated.atk}`,
            emotion: "proud",
            importance: 2,
          },
          select: { id: true },
        });
        if (fail) throw new Error("synthetic effect failure");
        return updated.atk;
      },
    });

    // 32 callers race one receipt and one 495→500 ceiling transition.
    const paidRace = await Promise.all(
      Array.from({ length: 32 }, () => executePetActionWithPaywall(
        appPrisma,
        {
          userId: 1,
          petId: 1,
          actionKey: "stat_upgrade_atk",
          txHash: hash("a1").toUpperCase(),
          now: TEST_NOW,
          paymentsAreEnabled: () => true,
        },
        statHooks(),
      )),
    );
    assert.equal(paidRace.filter((result) => result.ok === true).length, 32);
    assert.equal(
      paidRace.filter((result) => result.ok === true
        && result.access?.paid === true
        && result.access.replayed === false).length,
      1,
    );
    assert.equal(
      paidRace.filter((result) => result.ok === true
        && result.access?.paid === true
        && result.access.replayed === true).length,
      31,
    );
    assert.ok(paidRace.every((result) => result.ok !== true || result.value === 500));
    const paidAudit = await admin.query<{ atk: number; memories: number; consumed: boolean }>(`
      SELECT
        (SELECT "atk" FROM "${schema}"."pets" WHERE "id" = 1)::int AS "atk",
        (SELECT count(*) FROM "${schema}"."pet_memories" WHERE "pet_id" = 1)::int AS "memories",
        (SELECT "consumed_at" IS NOT NULL FROM "${schema}"."paid_actions" WHERE "tx_hash" = '${hash("a1")}') AS "consumed"
    `);
    assert.deepEqual(paidAudit.rows[0], { atk: 500, memories: 1, consumed: true });

    // Locked ceiling validation precedes receipt claim.
    const ceiling = await executePetActionWithPaywall(
      appPrisma,
      {
        userId: 1,
        petId: 1,
        actionKey: "stat_upgrade_atk",
        txHash: hash("d4"),
        now: TEST_NOW,
        paymentsAreEnabled: () => true,
      },
      statHooks(),
    );
    assert.equal(ceiling.ok, false);
    assert.equal(ceiling.ok === false ? ceiling.kind : "", "domain");
    const ceilingReceipt = await admin.query<{ consumed: boolean }>(
      `SELECT "consumed_at" IS NOT NULL AS "consumed"
       FROM "${schema}"."paid_actions" WHERE "tx_hash" = $1`,
      [hash("d4")],
    );
    assert.equal(ceilingReceipt.rows[0]?.consumed, false);

    // A pre-hardening consumed receipt has no durable outcome. It returns an
    // explicit non-payment recovery state, never a 402 that could prompt again.
    await admin.query(
      `UPDATE "${schema}"."paid_actions" SET "consumed_at" = $2 WHERE "tx_hash" = $1`,
      [hash("d4"), TEST_NOW],
    );
    const legacyConsumed = await executePetActionWithPaywall(
      appPrisma,
      {
        userId: 1,
        petId: 1,
        actionKey: "stat_upgrade_atk",
        txHash: hash("d4"),
        now: TEST_NOW,
        paymentsAreEnabled: () => true,
      },
      statHooks(),
    );
    assert.equal(legacyConsumed.ok, false);
    if (legacyConsumed.ok === false) {
      assert.equal(legacyConsumed.kind, "receipt_already_consumed");
    }

    // Exact production gate remains fail-closed; paused attempts mutate nothing.
    const paused = await executePetActionWithPaywall(
      appPrisma,
      { userId: 1, petId: 2, actionKey: "stat_upgrade_atk", txHash: hash("b2"), now: TEST_NOW },
      statHooks(),
    );
    assert.equal(paused.ok, false);
    if (paused.ok === false) {
      assert.equal(paused.kind, "paywall");
      if (paused.kind === "paywall") assert.equal(paused.paywall.reason, "payments_paused");
    }
    let receipt = await admin.query<{ consumed: boolean }>(
      `SELECT "consumed_at" IS NOT NULL AS "consumed"
       FROM "${schema}"."paid_actions" WHERE "tx_hash" = $1`,
      [hash("b2")],
    );
    assert.equal(receipt.rows[0]?.consumed, false);

    const orphan = await executePetActionWithPaywall(
      appPrisma,
      {
        userId: 1,
        petId: 2,
        actionKey: "stat_upgrade_atk",
        txHash: hash("b2"),
        now: TEST_NOW,
        paymentsAreEnabled: () => true,
      },
      statHooks(),
    );
    assert.equal(orphan.ok, false);
    if (orphan.ok === false) assert.equal(orphan.kind, "paywall");
    receipt = await admin.query<{ consumed: boolean }>(
      `SELECT "consumed_at" IS NOT NULL AS "consumed"
       FROM "${schema}"."paid_actions" WHERE "tx_hash" = $1`,
      [hash("b2")],
    );
    assert.equal(receipt.rows[0]?.consumed, false, "orphan receipt must remain unusable and unconsumed");

    // A downstream effect failure rolls back both pet writes and receipt claim.
    await assert.rejects(
      executePetActionWithPaywall(
        appPrisma,
        {
          userId: 1,
          petId: 3,
          actionKey: "stat_upgrade_atk",
          txHash: hash("c3"),
          now: TEST_NOW,
          paymentsAreEnabled: () => true,
        },
        statHooks(true),
      ),
      /synthetic effect failure/,
    );
    const rollbackAudit = await admin.query<{ atk: number; memories: number; consumed: boolean }>(`
      SELECT
        (SELECT "atk" FROM "${schema}"."pets" WHERE "id" = 3)::int AS "atk",
        (SELECT count(*) FROM "${schema}"."pet_memories" WHERE "pet_id" = 3)::int AS "memories",
        (SELECT "consumed_at" IS NOT NULL FROM "${schema}"."paid_actions" WHERE "tx_hash" = '${hash("c3")}') AS "consumed"
    `);
    assert.deepEqual(rollbackAudit.rows[0], { atk: 10, memories: 0, consumed: false });
    const paidRetry = await executePetActionWithPaywall(
      appPrisma,
      {
        userId: 1,
        petId: 3,
        actionKey: "stat_upgrade_atk",
        txHash: hash("c3"),
        now: TEST_NOW,
        paymentsAreEnabled: () => true,
      },
      statHooks(),
    );
    assert.equal(paidRetry.ok, true);

    const freeHooks = (fail = false) => ({
      apply: async (tx: any, pet: { id: number }) => {
        const updated = await tx.pet.update({
          where: { id: pet.id },
          data: { total_interactions: { increment: 1 } },
          select: { total_interactions: true },
        });
        await tx.petMemory.create({
          data: {
            pet_id: pet.id,
            memory_type: "interaction",
            content: "free effect",
            emotion: "happy",
            importance: 1,
          },
          select: { id: true },
        });
        if (fail) throw new Error("synthetic free effect failure");
        return updated.total_interactions;
      },
    });

    // Free counter and effect share rollback fate.
    await assert.rejects(
      executePetActionWithPaywall(
        appPrisma,
        { userId: 2, petId: 4, actionKey: "feed_extra", now: TEST_NOW },
        freeHooks(true),
      ),
      /synthetic free effect failure/,
    );
    const freeRollback = await admin.query<{ interactions: number; counters: number; memories: number }>(`
      SELECT
        (SELECT "total_interactions" FROM "${schema}"."pets" WHERE "id" = 4)::int AS "interactions",
        (SELECT count(*) FROM "${schema}"."daily_action_counts" WHERE "user_id" = 2)::int AS "counters",
        (SELECT count(*) FROM "${schema}"."pet_memories" WHERE "pet_id" = 4)::int AS "memories"
    `);
    assert.deepEqual(freeRollback.rows[0], { interactions: 0, counters: 0, memories: 0 });
    const freeRetry = await executePetActionWithPaywall(
      appPrisma,
      { userId: 2, petId: 4, actionKey: "feed_extra", now: TEST_NOW },
      freeHooks(),
    );
    assert.equal(freeRetry.ok, true);

    // 64 calls across two pets share one user/action/day cap: exactly five effects.
    const freeRace = await Promise.all(
      Array.from({ length: 64 }, (_, index) => executePetActionWithPaywall(
        appPrisma,
        { userId: 3, petId: index % 2 === 0 ? 5 : 6, actionKey: "play_extra", now: TEST_NOW },
        freeHooks(),
      )),
    );
    assert.equal(freeRace.filter((result) => result.ok === true).length, 5);
    const freeAudit = await admin.query<{ interactions: number; memories: number; count: number }>(`
      SELECT
        (SELECT sum("total_interactions") FROM "${schema}"."pets" WHERE "id" IN (5, 6))::int AS "interactions",
        (SELECT count(*) FROM "${schema}"."pet_memories" WHERE "pet_id" IN (5, 6))::int AS "memories",
        (SELECT "count" FROM "${schema}"."daily_action_counts"
          WHERE "user_id" = 3 AND "action_key" = 'play_extra' AND "day" = '2026-07-18')::int AS "count"
    `);
    assert.deepEqual(freeAudit.rows[0], { interactions: 5, memories: 5, count: 5 });

    console.log("PASS paywall/effect atomicity PG integration (paused/rollback/32-way receipt+ceiling/64-way free cap)");
  } finally {
    if (appPrisma) await appPrisma.$disconnect();
    if (defaultPrisma) await defaultPrisma.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDatabaseUrl;
    if (oldPayments === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = oldPayments;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

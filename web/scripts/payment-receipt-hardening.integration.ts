import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const LOWER_HASH = `0x${"ab".repeat(32)}`;
const UPPER_HASH = `0X${"AB".repeat(32)}`;

async function verifyContract(): Promise<void> {
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
  const [onchain, payments, paywall, credits, actionPay, premiumRoute,
    subscription, premiumCatalog, battleCreate, migration, envExample,
    checklist, smoke, sovereignty, paymentHook] = await Promise.all([
    read("../src/lib/onchain.ts"),
    read("../src/lib/payments.ts"),
    read("../src/lib/paywall.ts"),
    read("../src/app/api/credits/purchase/route.ts"),
    read("../src/app/api/payments/action-pay/route.ts"),
    read("../src/app/api/shop/premium/route.ts"),
    read("../src/app/api/studio/subscription/route.ts"),
    read("../src/lib/premium.ts"),
    read("../src/app/api/battle/create/route.ts"),
    read("../prisma/migrations/20260717165000_payment_receipt_hardening/migration.sql"),
    read("../config/production.env.example"),
    read("../../deploy/ENV-CHECKLIST.md"),
    read("../../deploy/release-smoke.sh"),
    read("../src/lib/petclaw/data-sovereignty.ts"),
    read("../src/hooks/useDirectUsdtPay.ts"),
  ]);

  assert.match(onchain, /process\.env\.PAYMENTS_ENABLED === "true"/);
  assert.match(onchain, /PAYMENT_MIN_CONFIRMATIONS, 3/);
  assert.match(onchain, /method: "eth_blockNumber"/);
  assert.match(onchain, /confirmations < BigInt\(ONCHAIN\.paymentMinConfirmations\)/);
  assert.doesNotMatch(onchain, /PAYMENTS_ENABLED === "false"/);
  assert.match(onchain, /canonicalizePaymentTxHash\(txHash\)/);
  assert.match(payments, /canonicalizePaymentTxHash\(args\.txHash\)/);
  assert.match(payments, /if \(!paymentsEnabled\(\)\) throw new PaymentsPausedError/);

  for (const [name, route] of [
    ["credits", credits], ["action-pay", actionPay], ["premium", premiumRoute],
    ["subscription", subscription],
  ] as const) {
    assert.match(route, /canonicalizePaymentTxHash\(/, `${name} must canonicalize receipt hashes`);
    assert.match(route, /treasuryConfigured\(\)/, `${name} must use the fail-closed gate`);
  }
  assert.match(paywall, /canonicalizePaymentTxHash\(input\.txHash\)/);
  assert.match(paywall, /pet_id: input\.petId/);
  assert.match(paywall, /consumedPayment\.findUnique/);
  assert.match(paywall, /ledger\.purpose !== "action"/);
  assert.match(actionPay, /Number\.isSafeInteger\(parsedPetId\)/);
  assert.match(actionPay, /user_id: user\.id, is_active: true/);
  assert.match(actionPay, /recoverActionReceiptWithDb\(prisma/);
  assert.match(actionPay, /alreadyApplied: recovery\.alreadyApplied/);

  for (const effect of ["exp_2x", "unlimited_battles", "battle_revive", "type_shield"]) {
    const start = premiumCatalog.indexOf(`effect: "${effect}"`);
    assert.notEqual(start, -1, `${effect} must remain explicitly documented`);
    const next = premiumCatalog.indexOf("\n  {", start + 1);
    const block = premiumCatalog.slice(start, next === -1 ? undefined : next);
    assert.match(block, /saleEnabled: false/);
    assert.match(block, /unavailableReason:/);
  }
  assert.ok(
    premiumRoute.indexOf("if (!item.saleEnabled)") < premiumRoute.indexOf("verifyUsdtTransfer("),
    "unimplemented SKU must be rejected before transfer verification",
  );
  assert.match(premiumRoute, /code: "ITEM_NOT_FOR_SALE"/);
  const premiumItemGuard = premiumRoute.indexOf("if (!item.saleEnabled)");
  const premiumPauseGuard = premiumRoute.indexOf("if (!treasuryConfigured())", premiumItemGuard);
  assert.ok(
    premiumPauseGuard > premiumItemGuard && premiumPauseGuard < premiumRoute.indexOf("const creditPrice"),
    "premium credit and USDT purchase paths must both honor the pause gate",
  );
  assert.doesNotMatch(battleCreate, /enforcePaywall/);
  assert.doesNotMatch(battleCreate, /searchParams\.get\("tx_hash"\)/);
  assert.match(battleCreate, /const BATTLE_ENABLED = false/);

  assert.match(migration, /HAVING count\(\*\) > 1/);
  assert.match(migration, /paid_actions conflicts with global consumed_payments ledger/);
  assert.match(migration, /paid_actions conflicts with a legacy product receipt/);
  assert.match(migration, /credit_purchases[\s\S]*user_subscriptions[\s\S]*premium_buy/);
  assert.match(migration, /INSERT INTO "consumed_payments"[\s\S]*FROM "paid_actions"/);
  assert.match(migration, /CHECK \("tx_hash" = lower\("tx_hash"\)\)/);
  assert.match(migration, /ON DELETE SET NULL/);
  assert.match(migration, /paid_actions_pet_owner_guard/);
  assert.match(envExample, /^PAYMENTS_ENABLED=false$/m);
  assert.match(envExample, /^PAYMENT_MIN_CONFIRMATIONS=3$/m);
  assert.match(checklist, /PAYMENTS_ENABLED=false/);
  assert.match(checklist, /PAYMENT_MIN_CONFIRMATIONS/);
  assert.match(smoke, /payments_enabled!==false/);
  assert.doesNotMatch(sovereignty, /paidAction\.deleteMany/);
  assert.match(sovereignty, /paidAction\.updateMany/);
  assert.match(paymentHook, /d\?\.payments_enabled === true/);
  assert.match(paymentHook, /fetch\("\/api\/config", \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(paymentHook, /useState<`0x\$\{string\}` \| "">\(\s*\(\(process\.env\.NEXT_PUBLIC_TREASURY_WALLET/);
}

async function createFixture(client: PoolClient, schema: string): Promise<void> {
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  await client.query(`
    CREATE TABLE "pets" ("id" integer PRIMARY KEY, "user_id" integer NOT NULL);
    CREATE TABLE "consumed_payments" (
      "id" bigserial PRIMARY KEY, "tx_hash" varchar(66) NOT NULL UNIQUE,
      "user_id" integer NOT NULL, "purpose" varchar(40) NOT NULL,
      "amount_usd" double precision NOT NULL
    );
    CREATE TABLE "credit_purchases" (
      "id" bigserial PRIMARY KEY, "payment_tx_hash" varchar(66) UNIQUE,
      "recording_tx_hash" varchar(66)
    );
    CREATE TABLE "paid_actions" (
      "id" bigserial PRIMARY KEY, "user_id" integer NOT NULL, "pet_id" integer,
      "action_key" varchar(40) NOT NULL DEFAULT 'feed_extra',
      "amount_usd" double precision NOT NULL DEFAULT 1,
      "tx_hash" varchar(66) NOT NULL UNIQUE, "burned_tx" varchar(66),
      "consumed_at" timestamptz
    );
    CREATE TABLE "user_subscriptions" (
      "id" bigserial PRIMARY KEY, "last_payment_tx" varchar(66) UNIQUE
    );
    CREATE TABLE "transactions" (
      "id" bigserial PRIMARY KEY,
      "type" varchar(20) NOT NULL DEFAULT 'legacy',
      "tx_hash" varchar(66) NOT NULL
    );
    CREATE TABLE "battle_history" ("id" bigserial PRIMARY KEY, "tx_hash" varchar(66));
    CREATE TABLE "streak_purchases" ("id" bigserial PRIMARY KEY, "tx_hash" varchar(66));
    CREATE TABLE "reward_ledger" (
      "id" bigserial PRIMARY KEY, "tx_hash" varchar(66) NOT NULL UNIQUE,
      "purpose" varchar(40) NOT NULL
    );
  `);
  await client.query(`INSERT INTO "pets" ("id", "user_id") VALUES (1, 1), (2, 2)`);
}

async function crossProductCollisionMustRollback(
  pool: Pool,
  migration: string,
  schema: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await createFixture(client, schema);
    await client.query(
      `INSERT INTO "consumed_payments" ("tx_hash", "user_id", "purpose", "amount_usd")
       VALUES ($1, 1, 'credits', 1)`,
      [LOWER_HASH],
    );
    await client.query(
      `INSERT INTO "paid_actions" ("user_id", "pet_id", "action_key", "amount_usd", "tx_hash")
       VALUES (1, 1, 'feed_extra', 1, $1)`,
      [UPPER_HASH],
    );
    await assert.rejects(client.query(migration), /conflicts with global consumed_payments ledger/);
    await client.query("ROLLBACK");
    await client.query(`SET search_path TO "${schema}"`);
    const values = await client.query<{ ledger_hash: string; action_hash: string }>(`
      SELECT
        (SELECT "tx_hash" FROM "consumed_payments") AS "ledger_hash",
        (SELECT "tx_hash" FROM "paid_actions") AS "action_hash"
    `);
    assert.deepEqual(values.rows[0], { ledger_hash: LOWER_HASH, action_hash: UPPER_HASH });
  } finally {
    client.release();
  }
}

async function legacySourceCollisionMustRollback(
  pool: Pool,
  migration: string,
  schema: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await createFixture(client, schema);
    await client.query(
      `INSERT INTO "credit_purchases" ("payment_tx_hash") VALUES ($1)`,
      [LOWER_HASH],
    );
    await client.query(
      `INSERT INTO "paid_actions" ("user_id", "pet_id", "action_key", "amount_usd", "tx_hash")
       VALUES (1, 1, 'feed_extra', 1, $1)`,
      [UPPER_HASH],
    );
    await assert.rejects(client.query(migration), /conflicts with a legacy product receipt/);
    await client.query("ROLLBACK");
    await client.query(`SET search_path TO "${schema}"`);
    const ledger = await client.query<{ count: number }>(
      `SELECT count(*)::int AS "count" FROM "consumed_payments"`,
    );
    assert.equal(ledger.rows[0]?.count, 0, "direct legacy conflict must abort before action-ledger backfill");
  } finally {
    client.release();
  }
}

async function collisionMustRollback(pool: Pool, migration: string, schema: string): Promise<void> {
  const client = await pool.connect();
  try {
    await createFixture(client, schema);
    await client.query(
      `INSERT INTO "consumed_payments" ("tx_hash", "user_id", "purpose", "amount_usd")
       VALUES ($1, 1, 'credits', 5), ($2, 1, 'action', 5)`,
      [LOWER_HASH, UPPER_HASH],
    );
    await assert.rejects(client.query(migration), /case-insensitive collisions/);
    await client.query("ROLLBACK");
    await client.query(`SET search_path TO "${schema}"`);
    const values = await client.query<{ tx_hash: string }>(
      `SELECT "tx_hash" FROM "consumed_payments" ORDER BY "id"`,
    );
    assert.deepEqual(values.rows.map((row) => row.tx_hash), [LOWER_HASH, UPPER_HASH]);
    const checks = await client.query<{ count: number }>(
      `SELECT count(*)::int AS "count" FROM pg_constraint
       WHERE conrelid = 'consumed_payments'::regclass
         AND conname = 'consumed_payments_tx_hash_lower_check'`,
    );
    assert.equal(checks.rows[0]?.count, 0, "failure must leave no partial constraint");
  } finally {
    client.release();
  }
}

type PaymentModule = typeof import("../src/lib/payments");

function paymentClient(client: PoolClient) {
  return {
    consumedPayment: {
      async create(args: { data: Record<string, unknown> }) {
        const data = args.data;
        try {
          const result = await client.query(
            `INSERT INTO "consumed_payments" ("tx_hash", "user_id", "purpose", "amount_usd")
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [data.tx_hash, data.user_id, data.purpose, data.amount_usd],
          );
          return result.rows[0];
        } catch (error) {
          if (error && typeof error === "object" && (error as { code?: string }).code === "23505") {
            throw Object.assign(new Error("unique violation"), { code: "P2002" });
          }
          throw error;
        }
      },
    },
  };
}

async function attemptConsume(
  pool: Pool, schema: string, payment: PaymentModule, attempt: number,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    const suppliedHash = attempt % 2 === 0 ? LOWER_HASH : UPPER_HASH;
    const purpose = attempt % 2 === 0 ? "credits" : "action";
    const canonical = await payment.consumePaymentTx(paymentClient(client), {
      txHash: suppliedHash, userId: 1, purpose, amountUsd: 5,
    });
    await client.query(
      `INSERT INTO "reward_ledger" ("tx_hash", "purpose") VALUES ($1, $2)`,
      [canonical, purpose],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof payment.PaymentAlreadyConsumed) return false;
    throw error;
  } finally {
    client.release();
  }
}

async function cleanMigrationAndRace(
  pool: Pool, migration: string, schema: string, payment: PaymentModule,
): Promise<void> {
  const client = await pool.connect();
  try {
    await createFixture(client, schema);
    const hashes = Array.from({ length: 9 }, (_, index) =>
      `0X${index.toString(16).toUpperCase()}${"CD".repeat(32)}`.slice(0, 66),
    );
    await client.query(
      `INSERT INTO "consumed_payments" ("tx_hash", "user_id", "purpose", "amount_usd")
       VALUES ($1, 1, 'old', 1)`, [hashes[0]],
    );
    await client.query(
      `INSERT INTO "credit_purchases" ("payment_tx_hash", "recording_tx_hash") VALUES ($1, $2)`,
      [hashes[1], hashes[2]],
    );
    await client.query(
      `INSERT INTO "paid_actions" ("user_id", "pet_id", "tx_hash", "burned_tx")
       VALUES (1, 1, $1, $2), (1, 2, $3, NULL)`,
      [hashes[3], hashes[4], hashes[5]],
    );
    await client.query(`INSERT INTO "user_subscriptions" ("last_payment_tx") VALUES ($1)`, [hashes[6]]);
    await client.query(`INSERT INTO "transactions" ("tx_hash") VALUES ($1)`, [hashes[7]]);
    await client.query(`INSERT INTO "battle_history" ("tx_hash") VALUES ($1)`, [hashes[8]]);
    await client.query(`INSERT INTO "streak_purchases" ("tx_hash") VALUES ($1)`, [UPPER_HASH]);
    await client.query(migration);
    await client.query(`SET search_path TO "${schema}"`);

    for (const [table, column] of [
      ["consumed_payments", "tx_hash"], ["credit_purchases", "payment_tx_hash"],
      ["credit_purchases", "recording_tx_hash"], ["paid_actions", "tx_hash"],
      ["paid_actions", "burned_tx"], ["user_subscriptions", "last_payment_tx"],
      ["transactions", "tx_hash"], ["battle_history", "tx_hash"],
      ["streak_purchases", "tx_hash"],
    ] as const) {
      const result = await client.query<{ valid: boolean }>(
        `SELECT bool_and("${column}" IS NULL OR "${column}" = lower("${column}")) AS "valid"
         FROM "${table}"`,
      );
      assert.equal(result.rows[0]?.valid, true, `${table}.${column} must be normalized`);
    }

    const repaired = await client.query<{ pet_id: number | null }>(
      `SELECT "pet_id" FROM "paid_actions" WHERE "tx_hash" = lower($1)`, [hashes[5]],
    );
    assert.equal(repaired.rows[0]?.pet_id, null, "historical cross-owner binding must detach");
    const actionLedgers = await client.query<{ count: number }>(
      `SELECT count(*)::int AS "count" FROM "consumed_payments" WHERE "purpose" = 'action'`,
    );
    assert.equal(actionLedgers.rows[0]?.count, 2, "legacy paid actions must be backfilled into the global ledger");
    await assert.rejects(
      client.query(
        `INSERT INTO "consumed_payments" ("tx_hash", "user_id", "purpose", "amount_usd")
         VALUES ($1, 1, 'uppercase-direct', 1)`, [UPPER_HASH],
      ),
      (error: unknown) => Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23514"),
    );
    await assert.rejects(
      client.query(
        `INSERT INTO "paid_actions" ("user_id", "pet_id", "tx_hash") VALUES (1, 2, $1)`,
        [`0x${"ef".repeat(32)}`],
      ),
      (error: unknown) => Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23503"),
    );
    await client.query(`DELETE FROM "pets" WHERE "id" = 1`);
    const retained = await client.query<{ count: number; pet_id: number | null }>(
      `SELECT count(*)::int AS "count", max("pet_id") AS "pet_id"
       FROM "paid_actions" WHERE "tx_hash" = lower($1)`, [hashes[3]],
    );
    assert.equal(retained.rows[0]?.count, 1);
    assert.equal(retained.rows[0]?.pet_id, null, "pet deletion must retain and detach receipt");
  } finally {
    client.release();
  }

  await pool.query(`DELETE FROM "${schema}"."consumed_payments"`);
  const results = await Promise.all(
    Array.from({ length: 32 }, (_, attempt) => attemptConsume(pool, schema, payment, attempt)),
  );
  assert.equal(results.filter(Boolean).length, 1, "mixed-case replay must grant exactly once");
  const ledger = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS "count" FROM "${schema}"."reward_ledger"`,
  );
  assert.equal(ledger.rows[0]?.count, 1);
  const stored = await pool.query<{ tx_hash: string }>(
    `SELECT "tx_hash" FROM "${schema}"."consumed_payments"`,
  );
  assert.equal(stored.rows[0]?.tx_hash, LOWER_HASH);
}

async function main(): Promise<void> {
  await verifyContract();

  const oldEnabled = process.env.PAYMENTS_ENABLED;
  const oldTreasury = process.env.TREASURY_WALLET;
  process.env.PAYMENTS_ENABLED = "false";
  process.env.TREASURY_WALLET = `0x${"11".repeat(20)}`;
  const payment = await import("../src/lib/payments");

  assert.equal(payment.canonicalizePaymentTxHash(UPPER_HASH), LOWER_HASH);
  assert.equal(payment.paymentsEnabled(), false);
  process.env.PAYMENTS_ENABLED = "TRUE";
  assert.equal(payment.paymentsEnabled(), false, "only exact lowercase true may enable");
  process.env.PAYMENTS_ENABLED = "true";
  assert.equal(payment.paymentsEnabled(), true);
  process.env.PAYMENTS_ENABLED = "false";
  await assert.rejects(
    payment.consumePaymentTx(paymentClient({} as PoolClient), {
      txHash: LOWER_HASH, userId: 1, purpose: "paused", amountUsd: 1,
    }),
    payment.PaymentsPausedError,
  );
  const paused = await payment.verifyUsdtTransfer(LOWER_HASH, `0x${"22".repeat(20)}`, 1);
  assert.equal(paused.ok, false);

  // Receipt inclusion is not finality. Two blocks must be rejected at the safe
  // default of three, while the same exact transfer succeeds at depth three.
  const originalFetch = globalThis.fetch;
  const sender = `0x${"22".repeat(20)}`;
  const topicAddress = (address: string) => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const transferData = `0x${(BigInt(10) ** BigInt(18)).toString(16).padStart(64, "0")}`;
  let tip = "0x65";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    if (body.method === "eth_getTransactionReceipt") {
      return new Response(JSON.stringify({
        result: {
          status: "0x1",
          blockNumber: "0x64",
          logs: [{
            address: payment.ONCHAIN.usdt.address,
            topics: [transferTopic, topicAddress(sender), topicAddress(payment.ONCHAIN.treasuryWallet)],
            data: transferData,
          }],
        },
      }));
    }
    if (body.method === "eth_blockNumber") {
      return new Response(JSON.stringify({ result: tip }));
    }
    throw new Error(`Unexpected RPC method: ${body.method}`);
  }) as typeof fetch;
  try {
    process.env.PAYMENTS_ENABLED = "true";
    const shallow = await payment.verifyUsdtTransfer(LOWER_HASH, sender, 1);
    assert.equal(shallow.ok, false);
    if (shallow.ok === false) assert.match(shallow.error, /2\/3 confirmations/);
    tip = "0x66";
    const final = await payment.verifyUsdtTransfer(LOWER_HASH, sender, 1);
    assert.equal(final.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.PAYMENTS_ENABLED = "false";
  }

  const connectionString = process.env.PAYMENT_HASH_TEST_DATABASE_URL;
  if (!connectionString) {
    console.log("SKIP payment receipt PG integration: set PAYMENT_HASH_TEST_DATABASE_URL");
    return;
  }

  process.env.PAYMENTS_ENABLED = "true";
  const collisionSchema = `payment_collision_${randomUUID().replaceAll("-", "")}`;
  const crossCollisionSchema = `payment_cross_collision_${randomUUID().replaceAll("-", "")}`;
  const legacyCollisionSchema = `payment_legacy_collision_${randomUUID().replaceAll("-", "")}`;
  const cleanSchema = `payment_clean_${randomUUID().replaceAll("-", "")}`;
  const migration = await readFile(
    new URL("../prisma/migrations/20260717165000_payment_receipt_hardening/migration.sql", import.meta.url),
    "utf8",
  );
  const pool = new Pool({ connectionString, max: 40 });
  try {
    await collisionMustRollback(pool, migration, collisionSchema);
    await crossProductCollisionMustRollback(pool, migration, crossCollisionSchema);
    await legacySourceCollisionMustRollback(pool, migration, legacyCollisionSchema);
    await cleanMigrationAndRace(pool, migration, cleanSchema, payment);
    console.log("PASS payment receipt PG integration (collision rollback/global-ledger backfill+conflict/lower CHECK/pet FK/32-way replay)");
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${collisionSchema}" CASCADE`);
    await pool.query(`DROP SCHEMA IF EXISTS "${crossCollisionSchema}" CASCADE`);
    await pool.query(`DROP SCHEMA IF EXISTS "${legacyCollisionSchema}" CASCADE`);
    await pool.query(`DROP SCHEMA IF EXISTS "${cleanSchema}" CASCADE`);
    await pool.end();
    if (oldEnabled === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = oldEnabled;
    if (oldTreasury === undefined) delete process.env.TREASURY_WALLET;
    else process.env.TREASURY_WALLET = oldTreasury;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

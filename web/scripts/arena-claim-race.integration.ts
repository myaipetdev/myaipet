import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";
import type { Prisma } from "../src/generated/prisma/client";
import {
  claimArenaBattle,
  recordArenaLevelUpRecognition,
  ArenaDailyBattleCapError,
} from "../src/lib/arenaBattleClaim";

config({ path: ".env.local" });
config({ path: ".env" });

function renderTaggedQuery(strings: TemplateStringsArray, values: unknown[]): string {
  return strings.reduce(
    (query, part, index) => query + part + (index < values.length ? `$${index + 1}` : ""),
    "",
  );
}

function pgTransaction(client: PoolClient): Prisma.TransactionClient {
  const transaction = {
    async $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
      const result = await client.query(renderTaggedQuery(strings, values), values);
      return result.rows as T;
    },
    dailyTrainingLog: {
      async upsert(args: {
        where: { user_id_pet_id_date: { user_id: number; pet_id: number; date: Date } };
      }) {
        const key = args.where.user_id_pet_id_date;
        const result = await client.query(
          `INSERT INTO "daily_training_logs"
             ("user_id", "pet_id", "date", "battles", "exp_earned", "credits_spent")
           VALUES ($1, $2, $3, 0, 0, 0)
           ON CONFLICT ("user_id", "pet_id", "date")
           DO UPDATE SET "updated_at" = "daily_training_logs"."updated_at"
           RETURNING *`,
          [key.user_id, key.pet_id, key.date],
        );
        return result.rows[0];
      },
      async updateMany(args: {
        where: { id: number; battles: { lt: number } };
        data: { exp_earned: { increment: number } };
      }) {
        const result = await client.query(
          `UPDATE "daily_training_logs"
              SET "battles" = "battles" + 1,
                  "exp_earned" = "exp_earned" + $3,
                  "updated_at" = now()
            WHERE "id" = $1 AND "battles" < $2
           RETURNING "id"`,
          [args.where.id, args.where.battles.lt, args.data.exp_earned.increment],
        );
        return { count: result.rowCount ?? 0 };
      },
    },
    pet: {
      async update(args: {
        where: { id: number };
        data: {
          level: { set: number };
          experience: { set: number };
        };
      }) {
        const result = await client.query(
          `UPDATE "pets"
              SET "level" = $2,
                  "experience" = $3,
                  "total_interactions" = "total_interactions" + 1
            WHERE "id" = $1
           RETURNING *`,
          [args.where.id, args.data.level.set, args.data.experience.set],
        );
        return result.rows[0];
      },
    },
  };
  return transaction as unknown as Prisma.TransactionClient;
}

type AttemptResult = {
  claimed: boolean;
  source: "pve" | "result";
  points: number;
  exp: number;
};

async function verifyNonRankingLevelUpContract(): Promise<void> {
  const calls: Array<Record<string, unknown>> = [];
  const transaction = {
    userStreak: {
      async upsert(args: Record<string, unknown>) {
        calls.push(args);
        return args;
      },
    },
  } as unknown as Prisma.TransactionClient;

  await recordArenaLevelUpRecognition(transaction, 7, false);
  assert.equal(calls.length, 0, "no level-up must not write recognition");
  await recordArenaLevelUpRecognition(transaction, 7, true);
  assert.equal(calls.length, 1, "a level-up must write exactly one non-ranking ledger entry");
  assert.deepEqual(calls[0], {
    where: { user_id: 7 },
    create: { user_id: 7, total_points_earned: 50 },
    update: { total_points_earned: { increment: 50 } },
  });

  const pveRoute = await readFile(
    new URL("../src/app/api/arena/pve/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(pveRoute, /recordArenaLevelUpRecognition\(tx, user\.id, claim\.leveledUp\)/);
  assert.doesNotMatch(
    pveRoute,
    /seasonGain\s*\+\s*\(claim\.leveledUp/,
    "paid-growth level-ups must never return to season_points",
  );
}

async function attemptReward(
  pool: Pool,
  schema: string,
  attempt: number,
  date: Date,
): Promise<AttemptResult> {
  const source = attempt % 2 === 0 ? "pve" : "result";
  const points = source === "pve" ? 7 : 11;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    const claim = await claimArenaBattle(pgTransaction(client), {
      userId: 1,
      petId: 1,
      date,
      requestedExp: 100,
    });

    // These stand in for each route's points/history operations and deliberately
    // run in the same transaction after the common claim succeeds.
    await client.query(
      `UPDATE "users" SET "season_points" = "season_points" + $2 WHERE "id" = $1`,
      [1, points],
    );
    await client.query(
      `INSERT INTO "reward_ledger" ("source", "points", "exp_gained") VALUES ($1, $2, $3)`,
      [source, points, claim.expGain],
    );
    await client.query("COMMIT");
    return { claimed: true, source, points, exp: claim.expGain };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof ArenaDailyBattleCapError) {
      return { claimed: false, source, points: 0, exp: 0 };
    }
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  await verifyNonRankingLevelUpContract();

  // Deliberately no DATABASE_URL fallback: integration tests must never touch a
  // developer, staging, or production database by accident.
  const connectionString = process.env.ARENA_CLAIM_TEST_DATABASE_URL;
  if (!connectionString) {
    console.log("SKIP Arena claim race integration: set ARENA_CLAIM_TEST_DATABASE_URL");
    return;
  }

  const schema = `arena_claim_race_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  const pool = new Pool({ connectionString, max: 70 });
  let schemaCreated = false;

  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await pool.query(`
      CREATE TABLE "${schema}"."users" (
        "id" integer PRIMARY KEY,
        "season_points" integer NOT NULL DEFAULT 0
      )
    `);
    await pool.query(`
      CREATE TABLE "${schema}"."pets" (
        "id" integer PRIMARY KEY,
        "user_id" integer NOT NULL,
        "level" integer NOT NULL DEFAULT 1,
        "experience" integer NOT NULL DEFAULT 0,
        "element" text NOT NULL DEFAULT 'normal',
        "total_interactions" integer NOT NULL DEFAULT 0
      )
    `);
    await pool.query(`
      CREATE TABLE "${schema}"."daily_training_logs" (
        "id" bigserial PRIMARY KEY,
        "user_id" integer NOT NULL,
        "pet_id" integer NOT NULL,
        "date" date NOT NULL,
        "battles" integer NOT NULL DEFAULT 0,
        "exp_earned" integer NOT NULL DEFAULT 0,
        "credits_spent" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("user_id", "pet_id", "date")
      )
    `);
    await pool.query(`
      CREATE TABLE "${schema}"."reward_ledger" (
        "id" bigserial PRIMARY KEY,
        "source" text NOT NULL,
        "points" integer NOT NULL,
        "exp_gained" integer NOT NULL
      )
    `);
    await pool.query(`INSERT INTO "${schema}"."users" ("id") VALUES (1)`);
    await pool.query(`INSERT INTO "${schema}"."pets" ("id", "user_id") VALUES (1, 1)`);

    const date = new Date("2026-07-17T00:00:00.000Z");
    const results = await Promise.all(
      Array.from({ length: 64 }, (_, attempt) => attemptReward(pool, schema, attempt, date)),
    );
    const accepted = results.filter((result) => result.claimed);
    const expectedPoints = accepted.reduce((sum, result) => sum + result.points, 0);
    const expectedExp = accepted.reduce((sum, result) => sum + result.exp, 0);

    const log = await pool.query<{ battles: number; exp_earned: number }>(
      `SELECT "battles", "exp_earned" FROM "${schema}"."daily_training_logs"`,
    );
    const pet = await pool.query<{ level: number; experience: number; total_interactions: number }>(
      `SELECT "level", "experience", "total_interactions" FROM "${schema}"."pets" WHERE "id" = 1`,
    );
    const user = await pool.query<{ season_points: number }>(
      `SELECT "season_points" FROM "${schema}"."users" WHERE "id" = 1`,
    );
    const ledger = await pool.query<{ rewards: number; points: number; exp_gained: number }>(
      `SELECT COUNT(*)::int AS "rewards",
              COALESCE(SUM("points"), 0)::int AS "points",
              COALESCE(SUM("exp_gained"), 0)::int AS "exp_gained"
         FROM "${schema}"."reward_ledger"`,
    );

    assert.equal(accepted.length, 30, "only 30 of 64 mixed-route claims may succeed");
    assert.equal(log.rows[0]?.battles, 30, "daily battle counter must stop at 30");
    assert.equal(log.rows[0]?.exp_earned, 1_500, "daily EXP must stop at its atomic cap");
    assert.equal(expectedExp, 1_500, "accepted responses must report only persisted EXP");
    assert.equal(pet.rows[0]?.total_interactions, 30, "pet reward mutation must run exactly 30 times");
    assert.equal(pet.rows[0]?.level, 6, "serialized level progression must be deterministic");
    assert.equal(pet.rows[0]?.experience, 0, "serialized level remainder must be consistent");
    assert.equal(ledger.rows[0]?.rewards, 30, "reward ledger must contain exactly 30 rows");
    assert.equal(ledger.rows[0]?.points, expectedPoints, "no season points may be minted by rejected claims");
    assert.equal(ledger.rows[0]?.exp_gained, expectedExp, "history EXP must match the claimed EXP");
    assert.equal(user.rows[0]?.season_points, expectedPoints, "user points must match accepted claims only");

    console.log("PASS Arena PostgreSQL race integration (64 mixed claims -> 30 rewards)");
  } finally {
    if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

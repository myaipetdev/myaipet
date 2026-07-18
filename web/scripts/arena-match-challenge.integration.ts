import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { Pool, type PoolClient, type QueryResult } from "pg";
import type { Prisma } from "../src/generated/prisma/client";
import {
  consumeArenaMatchChallenge,
  hashArenaMatchChallengeToken,
  issueArenaMatchChallenge,
  InvalidArenaMatchChallengeError,
} from "../src/lib/arenaMatchChallenge";

config({ path: ".env.local" });
config({ path: ".env" });

type Queryable = {
  query: PoolClient["query"];
};

function challengeClient(client: Queryable): Prisma.TransactionClient {
  const arenaMatchChallenge = {
    async create(args: { data: Record<string, unknown> }) {
      const data = args.data;
      const result = await client.query(
        `INSERT INTO "arena_match_challenges"
          ("token_hash", "user_id", "player_pet_id", "opponent_pet_id",
           "player_level", "opponent_level", "issued_at", "expires_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          data.token_hash, data.user_id, data.player_pet_id, data.opponent_pet_id,
          data.player_level, data.opponent_level, data.issued_at, data.expires_at,
        ],
      );
      return result.rows[0];
    },
    async findUnique(args: { where: { token_hash: string } }) {
      const result = await client.query(
        `SELECT * FROM "arena_match_challenges" WHERE "token_hash" = $1`,
        [args.where.token_hash],
      );
      return result.rows[0] || null;
    },
    async updateMany(args: {
      where: {
        id: number;
        token_hash: string;
        user_id: number;
        player_pet_id: number;
        opponent_pet_id: number;
        expires_at: { gt: Date };
      };
      data: { consumed_at: Date };
    }) {
      const where = args.where;
      const result: QueryResult = await client.query(
        `UPDATE "arena_match_challenges"
            SET "consumed_at" = $7
          WHERE "id" = $1
            AND "token_hash" = $2
            AND "user_id" = $3
            AND "player_pet_id" = $4
            AND "opponent_pet_id" = $5
            AND "consumed_at" IS NULL
            AND "expires_at" > $6
         RETURNING "id"`,
        [
          where.id, where.token_hash, where.user_id, where.player_pet_id,
          where.opponent_pet_id, where.expires_at.gt, args.data.consumed_at,
        ],
      );
      return { count: result.rowCount ?? 0 };
    },
  };
  return { arenaMatchChallenge } as unknown as Prisma.TransactionClient;
}

async function verifyRouteContract(): Promise<void> {
  const opponentRoute = await readFile(
    new URL("../src/app/api/arena/opponent/route.ts", import.meta.url),
    "utf8",
  );
  const resultRoute = await readFile(
    new URL("../src/app/api/arena/result/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(opponentRoute, /interactablePetWhere\(/);
  assert.match(opponentRoute, /user_id:\s*\{\s*not:\s*user\.id\s*\}/);
  assert.match(opponentRoute, /playerPet\.level\s*-\s*3/);
  assert.match(opponentRoute, /playerPet\.level\s*\+\s*3/);
  assert.match(opponentRoute, /searchParams\.get\("pet_id"\)/);
  assert.doesNotMatch(opponentRoute, /searchParams\.get\("level"\)/);
  assert.doesNotMatch(opponentRoute, /expand search/i);

  assert.match(resultRoute, /consumeArenaMatchChallenge\(tx,/);
  assert.match(resultRoute, /interactablePetWhere\(/);
  assert.match(resultRoute, /opponentPet\.id/);
  assert.doesNotMatch(resultRoute, /Wild Challenger/);
  assert.doesNotMatch(resultRoute, /opponent_name\s*}\s*=\s*await req\.json/);
}

async function issue(
  pool: Pool,
  input: {
    userId?: number;
    playerPetId?: number;
    opponentPetId?: number;
    playerLevel?: number;
    opponentLevel?: number;
    now?: Date;
  } = {},
) {
  return issueArenaMatchChallenge(challengeClient(pool as unknown as Queryable), {
    userId: input.userId ?? 1,
    playerPetId: input.playerPetId ?? 1,
    opponentPetId: input.opponentPetId ?? 2,
    playerLevel: input.playerLevel ?? 10,
    opponentLevel: input.opponentLevel ?? 12,
    now: input.now,
  });
}

async function attemptConsume(
  pool: Pool,
  schema: string,
  input: {
    token: string;
    userId?: number;
    playerPetId?: number;
    opponentPetId?: number;
    now?: Date;
    reward?: boolean;
  },
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    const challenge = await consumeArenaMatchChallenge(challengeClient(client), {
      token: input.token,
      userId: input.userId ?? 1,
      playerPetId: input.playerPetId ?? 1,
      opponentPetId: input.opponentPetId ?? 2,
      now: input.now,
    });
    if (input.reward !== false) {
      await client.query(
        `INSERT INTO "reward_ledger" ("challenge_id") VALUES ($1)`,
        [challenge.id],
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof InvalidArenaMatchChallengeError) return false;
    throw error;
  } finally {
    client.release();
  }
}

async function consumeThenRollback(pool: Pool, schema: string, token: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await consumeArenaMatchChallenge(challengeClient(client), {
      token,
      userId: 1,
      playerPetId: 1,
      opponentPetId: 2,
    });
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  await verifyRouteContract();

  // Deliberately no DATABASE_URL fallback. This test may run only against a
  // database explicitly designated for destructive integration fixtures.
  const connectionString = process.env.ARENA_MATCH_TEST_DATABASE_URL;
  if (!connectionString) {
    console.log("SKIP Arena match PG integration: set ARENA_MATCH_TEST_DATABASE_URL");
    return;
  }

  const schema = `arena_match_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  const pool = new Pool({
    connectionString,
    max: 40,
    options: `-c search_path=${schema}`,
  });
  let schemaCreated = false;

  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await pool.query(`
      CREATE TABLE "users" (
        "id" integer PRIMARY KEY
      )
    `);
    await pool.query(`
      CREATE TABLE "pets" (
        "id" integer PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id")
      )
    `);
    await pool.query(`
      CREATE TABLE "arena_match_challenges" (
        "id" bigserial PRIMARY KEY,
        "token_hash" char(64) NOT NULL UNIQUE,
        "user_id" integer NOT NULL REFERENCES "users"("id"),
        "player_pet_id" integer NOT NULL REFERENCES "pets"("id"),
        "opponent_pet_id" integer NOT NULL REFERENCES "pets"("id"),
        "player_level" integer NOT NULL,
        "opponent_level" integer NOT NULL,
        "issued_at" timestamptz NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE "reward_ledger" (
        "id" bigserial PRIMARY KEY,
        "challenge_id" bigint NOT NULL UNIQUE
      )
    `);
    await pool.query(`INSERT INTO "users" ("id") VALUES (1), (2), (3)`);
    await pool.query(`INSERT INTO "pets" ("id", "user_id") VALUES (1, 1), (2, 2), (3, 3)`);

    const binding = await issue(pool);
    const stored = await pool.query<{ token_hash: string; consumed_at: Date | null }>(
      `SELECT "token_hash", "consumed_at" FROM "arena_match_challenges" WHERE "token_hash" = $1`,
      [hashArenaMatchChallengeToken(binding.token)],
    );
    assert.equal(stored.rows[0]?.token_hash, hashArenaMatchChallengeToken(binding.token));
    assert.notEqual(stored.rows[0]?.token_hash, binding.token, "raw bearer token must never be stored");

    const last = binding.token.at(-1);
    const tamperedToken = `${binding.token.slice(0, -1)}${last === "a" ? "b" : "a"}`;
    assert.equal(await attemptConsume(pool, schema, { token: tamperedToken }), false, "tampered token must fail");
    assert.equal(await attemptConsume(pool, schema, { token: binding.token, userId: 2 }), false, "wrong owner must fail");
    assert.equal(await attemptConsume(pool, schema, { token: binding.token, playerPetId: 3 }), false, "wrong player must fail");
    assert.equal(await attemptConsume(pool, schema, { token: binding.token, opponentPetId: 3 }), false, "wrong opponent must fail");
    assert.equal(await attemptConsume(pool, schema, { token: binding.token, reward: false }), true, "valid binding must remain usable after tamper attempts");

    await assert.rejects(
      issue(pool, { playerLevel: 1, opponentLevel: 5 }),
      InvalidArenaMatchChallengeError,
      "issuer must reject opponents outside ±3 levels",
    );

    const rolledBack = await issue(pool);
    await consumeThenRollback(pool, schema, rolledBack.token);
    assert.equal(
      await attemptConsume(pool, schema, { token: rolledBack.token, reward: false }),
      true,
      "reward rollback must roll challenge consumption back too",
    );

    const expired = await issue(pool, { now: new Date(Date.now() - 31 * 60_000) });
    assert.equal(await attemptConsume(pool, schema, { token: expired.token }), false, "expired token must fail");

    const concurrent = await issue(pool);
    const results = await Promise.all(
      Array.from({ length: 32 }, () => attemptConsume(pool, schema, { token: concurrent.token })),
    );
    assert.equal(results.filter(Boolean).length, 1, "32 concurrent consumes must yield one winner");
    assert.equal(await attemptConsume(pool, schema, { token: concurrent.token }), false, "replay must fail");

    const rewards = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS "count" FROM "reward_ledger"`,
    );
    assert.equal(rewards.rows[0]?.count, 1, "only the one concurrent winner may create a reward");
    console.log("PASS Arena match challenge PG integration (tamper/expiry/replay/32-way consume)");
  } finally {
    if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

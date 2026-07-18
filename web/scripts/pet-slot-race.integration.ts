import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";
import type { Prisma } from "../src/generated/prisma/client";
import { lockAvailablePetSlot, PetSlotLimitError } from "../src/lib/petSlots";

config({ path: ".env.local" });
config({ path: ".env" });

function resolveTestDatabaseUrl(): string | null {
  const explicitUrl = process.env.PET_SLOT_TEST_DATABASE_URL;
  if (explicitUrl) return explicitUrl;
  return null;
}

function pgTransaction(client: PoolClient): Prisma.TransactionClient {
  const transaction = {
    async $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
      const text = strings.reduce(
        (query, part, index) => query + part + (index < values.length ? `$${index + 1}` : ""),
        "",
      );
      const result = await client.query(text, values);
      return result.rows as T;
    },
    pet: {
      async count(args: { where: { user_id: number; is_active: boolean } }): Promise<number> {
        const result = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS "count"
             FROM "pets"
            WHERE "user_id" = $1 AND "is_active" = $2`,
          [args.where.user_id, args.where.is_active],
        );
        return result.rows[0]?.count ?? 0;
      },
    },
  };
  return transaction as unknown as Prisma.TransactionClient;
}

async function tryCreatePet(
  pool: Pool,
  schema: string,
  userId: number,
  attempt: number,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await lockAvailablePetSlot(pgTransaction(client), userId);

    // Keep the winning row lock briefly so the other attempts definitely
    // overlap it instead of accidentally executing as a sequential smoke test.
    await new Promise((resolve) => setTimeout(resolve, 15));
    await client.query(
      `INSERT INTO "pets" ("user_id", "name", "is_active") VALUES ($1, $2, true)`,
      [userId, `parallel-${attempt}`],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof PetSlotLimitError) return false;
    throw error;
  } finally {
    client.release();
  }
}

async function runWave(
  pool: Pool,
  schema: string,
  userId: number,
  petSlots: number,
  attempts: number,
): Promise<void> {
  await pool.query(`DELETE FROM "${schema}"."pets" WHERE "user_id" = $1`, [userId]);
  await pool.query(`UPDATE "${schema}"."users" SET "pet_slots" = $1 WHERE "id" = $2`, [petSlots, userId]);

  const results = await Promise.all(
    Array.from({ length: attempts }, (_, attempt) => tryCreatePet(pool, schema, userId, attempt)),
  );
  const successfulCreates = results.filter(Boolean).length;
  const persisted = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS "count"
       FROM "${schema}"."pets"
      WHERE "user_id" = $1 AND "is_active" = true`,
    [userId],
  );

  assert.equal(successfulCreates, petSlots, `expected exactly ${petSlots} successful concurrent creates`);
  assert.equal(persisted.rows[0]?.count, petSlots, `expected exactly ${petSlots} persisted active pets`);
}

async function main(): Promise<void> {
  const connectionString = resolveTestDatabaseUrl();
  if (!connectionString) {
    console.log("SKIP pet-slot race integration: set PET_SLOT_TEST_DATABASE_URL explicitly");
    return;
  }

  const schema = `pet_slot_race_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  const pool = new Pool({ connectionString, max: 24 });
  let schemaCreated = false;

  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await pool.query(`
      CREATE TABLE "${schema}"."users" (
        "id" integer PRIMARY KEY,
        "pet_slots" integer NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE "${schema}"."pets" (
        "id" bigserial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "${schema}"."users"("id"),
        "name" text NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true
      )
    `);
    await pool.query(
      `INSERT INTO "${schema}"."users" ("id", "pet_slots") VALUES ($1, $2)`,
      [1, 1],
    );

    await runWave(pool, schema, 1, 1, 16);
    await runWave(pool, schema, 1, 3, 20);
    console.log("PASS pet-slot PostgreSQL race integration (slots=1 and slots=3)");
  } finally {
    if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

interface SqlClient {
  $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

function taggedSqlClient(client: PoolClient): SqlClient {
  const compile = (strings: TemplateStringsArray, values: unknown[]) => ({
    text: strings.reduce(
      (sql, part, index) => sql + part + (index < values.length ? `$${index + 1}` : ""),
      "",
    ),
    values,
  });
  return {
    async $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
      const result = await client.query(compile(strings, values));
      return result.rows as T;
    },
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> {
      const result = await client.query(compile(strings, values));
      return result.rowCount || 0;
    },
  };
}

async function withTransaction<T>(
  pool: Pool,
  schema: string,
  run: (db: SqlClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    const result = await run(taggedSqlClient(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.AVATAR_STORAGE_TEST_DATABASE_URL;
  if (!connectionString) {
    console.log("SKIP avatar storage P0 integration: set AVATAR_STORAGE_TEST_DATABASE_URL explicitly");
    return;
  }

  const schema = `avatar_storage_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  const uploadRoot = await mkdtemp(join(tmpdir(), "petclaw-avatar-storage-"));
  process.env.DATABASE_URL = connectionString;
  process.env.STORAGE_PROVIDER = "local";
  process.env.LOCAL_UPLOAD_DIR = uploadRoot;
  process.env.LOCAL_UPLOAD_URL = "/uploads";
  process.env.LOCAL_STORAGE_MIN_FREE_BYTES = String(64 * 1024 * 1024);

  const pool = new Pool({ connectionString, max: 30 });
  let schemaCreated = false;
  try {
    const setup = await pool.connect();
    try {
      await setup.query(`CREATE SCHEMA "${schema}"`);
      schemaCreated = true;
      await setup.query(`SET search_path TO "${schema}"`);
      await setup.query(`
        CREATE TABLE "users" (
          "id" integer PRIMARY KEY,
          "user_id" integer,
          "wallet_address" text,
          "nonce" text
        );
        CREATE TABLE "pets" (
          "id" integer PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id")
        );
        CREATE TABLE "media_deletion_tasks" (
          "id" serial PRIMARY KEY,
          "object_ref" varchar(700) NOT NULL UNIQUE,
          "owner_user_id" integer NOT NULL,
          "source_pet_id" integer NOT NULL,
          "attempts" integer NOT NULL DEFAULT 0,
          "last_error" varchar(500),
          "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE "llm_platform_usage" (
          "usage_date" date NOT NULL,
          "scope_key" varchar(64) NOT NULL,
          "attempts" integer NOT NULL DEFAULT 0,
          "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY ("usage_date", "scope_key")
        );
      `);
      const migration = await readFile(
        new URL("../prisma/migrations/20260718000000_avatar_media_lifecycle/migration.sql", import.meta.url),
        "utf8",
      );
      await setup.query(migration);
      await setup.query(`
        INSERT INTO "users" ("id") VALUES (1), (2);
        INSERT INTO "pets" ("id", "user_id") VALUES (11, 1), (12, 1), (21, 2);
      `);
    } finally {
      setup.release();
    }

    const quota = await import("../src/lib/avatarUploadQuota");
    const avatarMedia = await import("../src/lib/avatarMedia");
    const storage = await import("../src/lib/storage");
    const visionBudget = await import("../src/lib/llm/router");

    // Two owners race a five-slot global budget. Each owner is independently
    // capped at three, while the transaction rolls back the global increment
    // for attempts rejected by the user bucket.
    const usageDate = "2099-01-02";
    const quotaAttempts = Array.from({ length: 40 }, (_, index) => {
      const userId = index % 2 === 0 ? 1 : 2;
      return (async () => {
        try {
          return await withTransaction(pool, schema, async (db) => {
          await quota.reserveAvatarUploadQuotaInTransaction(db, {
            usageDate,
            userId,
            userCap: 3,
            globalCap: 5,
          });
          return userId;
          });
        } catch (error) {
          if (error instanceof quota.AvatarUploadQuotaExceededError) return 0;
          throw error;
        }
      })();
    });
    const quotaResults = await Promise.all(quotaAttempts);
    const successes = quotaResults.filter((userId) => userId !== 0);
    assert.equal(successes.length, 5, "global quota must admit exactly five concurrent attempts");
    assert.ok(successes.filter((userId) => userId === 1).length <= 3);
    assert.ok(successes.filter((userId) => userId === 2).length <= 3);
    const counters = await pool.query<{ scope_key: string; attempts: number }>(
      `SELECT "scope_key", "attempts"
       FROM "${schema}"."llm_platform_usage"
       WHERE "usage_date" = $1
       ORDER BY "scope_key"`,
      [usageDate],
    );
    const counterMap = new Map(counters.rows.map((row) => [row.scope_key, Number(row.attempts)]));
    assert.equal(counterMap.get("avatar-upload:global"), 5);
    assert.equal(
      (counterMap.get("avatar-upload:user:1") || 0) + (counterMap.get("avatar-upload:user:2") || 0),
      5,
      "rejected user reservations must not leak global quota",
    );

    // Vision fallbacks use the same row-lock pattern but separate scopes. This
    // wave proves an authenticated owner cannot exceed its cap or leak a global
    // increment when its user bucket rejects the transaction.
    const visionDate = "2099-01-03";
    const visionResults = await Promise.all(Array.from({ length: 40 }, (_, index) => {
      const userId = index % 2 === 0 ? 1 : 2;
      return (async () => {
        try {
          return await withTransaction(pool, schema, async (db) => {
            await visionBudget.reserveVisionBudgetInTransaction(db, visionDate, userId, 5, 3);
            return userId;
          });
        } catch (error) {
          if (error instanceof visionBudget.LLMBudgetError) return 0;
          throw error;
        }
      })();
    }));
    const visionSuccesses = visionResults.filter((userId) => userId !== 0);
    assert.equal(visionSuccesses.length, 5);
    assert.ok(visionSuccesses.filter((userId) => userId === 1).length <= 3);
    assert.ok(visionSuccesses.filter((userId) => userId === 2).length <= 3);
    const visionCounters = await pool.query<{ scope_key: string; attempts: number }>(
      `SELECT "scope_key", "attempts"
       FROM "${schema}"."llm_platform_usage"
       WHERE "usage_date" = $1`,
      [visionDate],
    );
    const visionCounterMap = new Map(
      visionCounters.rows.map((row) => [row.scope_key, Number(row.attempts)]),
    );
    assert.equal(visionCounterMap.get("vision:global"), 5);
    assert.equal(
      (visionCounterMap.get("vision:user:1") || 0) + (visionCounterMap.get("vision:user:2") || 0),
      5,
    );

    // One pending preview cannot be claimed by two pets, even when both PATCH
    // transactions overlap on different Pet rows.
    const claimUuid = randomUUID();
    const claimRef = `/uploads/avatars/1/${claimUuid}.jpg`;
    await withTransaction(pool, schema, (db) => db.$executeRaw`
      INSERT INTO "avatar_media_objects"
        ("id", "object_ref", "owner_user_id", "expires_at")
      VALUES
        (CAST(${claimUuid} AS uuid), ${claimRef}, 1, CURRENT_TIMESTAMP + INTERVAL '1 hour')
    `);
    const claims = await Promise.all([11, 12].map((petId) =>
      withTransaction(pool, schema, async (db) => {
        try {
          return await avatarMedia.claimRegisteredAvatarMedia(db, 1, petId, claimRef)
            ? { petId, error: "" }
            : { petId: 0, error: "preview row was not found" };
        } catch (error) {
          if (error instanceof avatarMedia.AvatarMediaAssignmentError) {
            return { petId: 0, error: error.message };
          }
          throw error;
        }
      }),
    ));
    const winningClaims = claims.map((claim) => claim.petId).filter((petId) => petId !== 0);
    assert.equal(
      winningClaims.length,
      1,
      `exactly one competing pet may claim a preview: ${claims.map((claim) => claim.error).join(" | ")}`,
    );
    const claimedRow = await pool.query<{ pet_id: number }>(
      `SELECT "pet_id" FROM "${schema}"."avatar_media_objects" WHERE "object_ref" = $1`,
      [claimRef],
    );
    assert.equal(Number(claimedRow.rows[0]?.pet_id), winningClaims[0]);

    // A different account can neither preview nor claim the registered object.
    const ownerClient = await pool.connect();
    try {
      await ownerClient.query(`SET search_path TO "${schema}"`);
      assert.equal(
        await avatarMedia.ownerHasRegisteredAvatarMedia(2, claimRef, taggedSqlClient(ownerClient)),
        false,
      );
    } finally {
      ownerClient.release();
    }
    await assert.rejects(
      withTransaction(pool, schema, (db) =>
        avatarMedia.claimRegisteredAvatarMedia(db, 2, 21, claimRef)),
      avatarMedia.AvatarMediaAssignmentError,
    );

    // An expired pending row is removed only after its canonical object has
    // been durably inserted into the existing deletion outbox.
    const orphanFilename = avatarMedia.newAvatarFilename(1, "jpg");
    const orphanUuid = orphanFilename.split("/").pop()!.replace(/\.jpg$/, "");
    const orphan = await storage.uploadFile(orphanFilename, Buffer.from("expired avatar preview"), "image/jpeg");
    await withTransaction(pool, schema, (db) => db.$executeRaw`
      INSERT INTO "avatar_media_objects"
        ("id", "object_ref", "owner_user_id", "expires_at")
      VALUES
        (CAST(${orphanUuid} AS uuid), ${orphan.url}, 1, CURRENT_TIMESTAMP - INTERVAL '1 minute')
    `);
    const cleanupClient = await pool.connect();
    try {
      await cleanupClient.query(`SET search_path TO "${schema}"`);
      assert.equal(
        await avatarMedia.enqueueExpiredAvatarMediaObjects(20, taggedSqlClient(cleanupClient)),
        1,
      );
    } finally {
      cleanupClient.release();
    }
    assert.equal(
      Number((await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS "count" FROM "${schema}"."avatar_media_objects" WHERE "object_ref" = $1`,
        [orphan.url],
      )).rows[0]?.count),
      0,
    );
    assert.equal(
      Number((await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS "count" FROM "${schema}"."media_deletion_tasks" WHERE "object_ref" = $1`,
        [orphan.url],
      )).rows[0]?.count),
      1,
    );
    assert.equal(await storage.storedFileExists(orphan.url), true, "outbox commit precedes physical deletion");
    await storage.deleteStoredFile(orphan.url);
    assert.equal(await storage.storedFileExists(orphan.url), false);

    // A storage call that throws after the provider may have committed bytes
    // must likewise retain durable deletion intent (the S3 timeout case).
    const ambiguousFilename = avatarMedia.newAvatarFilename(2, "png");
    const ambiguousUuid = ambiguousFilename.split("/").pop()!.replace(/\.png$/, "");
    const ambiguous = await storage.uploadFile(
      ambiguousFilename,
      Buffer.from("provider committed before response timeout"),
      "image/png",
    );
    await withTransaction(pool, schema, (db) => db.$executeRaw`
      INSERT INTO "avatar_media_objects"
        ("id", "object_ref", "owner_user_id", "expires_at")
      VALUES
        (CAST(${ambiguousUuid} AS uuid), ${ambiguous.url}, 2, CURRENT_TIMESTAMP + INTERVAL '1 day')
    `);
    const ambiguousClient = await pool.connect();
    try {
      await ambiguousClient.query(`SET search_path TO "${schema}"`);
      await avatarMedia.enqueueFailedPendingAvatarMedia(
        ambiguousUuid,
        ambiguous.url,
        2,
        taggedSqlClient(ambiguousClient),
      );
    } finally {
      ambiguousClient.release();
    }
    assert.equal(
      Number((await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS "count" FROM "${schema}"."avatar_media_objects" WHERE "object_ref" = $1`,
        [ambiguous.url],
      )).rows[0]?.count),
      0,
    );
    assert.equal(
      Number((await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS "count" FROM "${schema}"."media_deletion_tasks" WHERE "object_ref" = $1`,
        [ambiguous.url],
      )).rows[0]?.count),
      1,
    );
    await storage.deleteStoredFile(ambiguous.url);

    assert.equal(
      storage.localUploadPreservesFreeSpaceFloor(BigInt(100), 20, 80),
      true,
    );
    assert.equal(
      storage.localUploadPreservesFreeSpaceFloor(BigInt(99), 20, 80),
      false,
    );

    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
    console.log("PASS avatar storage P0 PostgreSQL concurrency + ownership + orphan cleanup integration");
  } finally {
    if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
    await rm(uploadRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

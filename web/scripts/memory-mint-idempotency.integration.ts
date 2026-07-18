import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  claimMemoryMintRecord,
  markMemoryMintSubmissionFailed,
  markMemoryMintSubmitted,
  MemoryClaimNotFoundError,
} from "../src/lib/memoryMintClaim";

config({ path: ".env.local" });
config({ path: ".env" });

const ownerWallet = `0x${"1".repeat(40)}`;
const submittedTxHash = `0x${"a".repeat(64)}`;

async function verifyContract(): Promise<void> {
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
  const [
    onchain,
    blockchain,
    soul,
    route,
    schema,
    migration,
    milestones,
    dashboard,
    analytics,
    collection,
    interact,
    evolve,
    like,
    clientContracts,
    activityHook,
    petGenerate,
    runtimeConfig,
    nextConfig,
  ] = await Promise.all([
    read("../src/lib/onchain.ts"),
    read("../src/lib/blockchain.ts"),
    read("../src/lib/services/soul.ts"),
    read("../src/app/api/pets/[petId]/memories/mint/route.ts"),
    read("../prisma/schema.prisma"),
    read("../prisma/migrations/20260718010000_memory_mint_idempotency/migration.sql"),
    read("../src/lib/petclaw/nft-mint.ts"),
    read("../src/components/SovereigntyDashboard.tsx"),
    read("../src/app/api/analytics/protocol/route.ts"),
    read("../src/app/api/pets/[petId]/memories/collection/route.ts"),
    read("../src/app/api/pets/[petId]/interact/route.ts"),
    read("../src/app/api/pets/[petId]/evolve/route.ts"),
    read("../src/app/api/social/like/[generationId]/route.ts"),
    read("../src/lib/contracts/index.ts"),
    read("../src/hooks/usePETActivity.ts"),
    read("../src/components/PetGenerate.tsx"),
    read("../src/app/api/config/route.ts"),
    read("../next.config.ts"),
  ]);

  assert.match(onchain, /process\.env\.BLOCKCHAIN_ENABLED === "true"/);
  assert.match(blockchain, /if \(!blockchainEnabled\(\)\)\s*\{\s*return null/);
  assert.match(soul, /function getSoulContract[\s\S]*if \(!blockchainEnabled\(\)\) return null/);
  assert.match(soul, /claimMemoryMintRecord/);
  assert.match(route, /if \(!blockchainEnabled\(\)\)[\s\S]*status: 503/);
  assert.match(route, /Number\.isSafeInteger\(memory_id\)/);
  assert.doesNotMatch(route, /prisma\.petMemory\.findFirst/);

  assert.match(schema, /memory_id\s+Int\?\s+@unique/);
  assert.match(schema, /mint_claim_token\s+String\?/);
  assert.match(migration, /MEMORY_ID_DUPLICATES/);
  assert.match(migration, /MEMORY_ID_OWNERSHIP_MISMATCH/);
  assert.match(migration, /CREATE UNIQUE INDEX "memory_nfts_memory_id_key"/);

  assert.match(milestones, /recorded:\s*boolean/);
  assert.match(milestones, /onChain:\s*boolean/);
  assert.match(milestones, /if \(!blockchainEnabled\(\)\)/);
  assert.doesNotMatch(milestones, /Auto-minted/);
  assert.match(dashboard, /Memory milestones/);
  assert.match(dashboard, /off-chain history/);
  assert.doesNotMatch(dashboard, />\s*Memory NFTs\s*</);
  assert.match(analytics, /memoryNft\.count\(\{ where: \{ memory_token_id: \{ not: null \} \} \}\)/);
  assert.match(analytics, /off_chain_memory_milestones/);
  assert.match(analytics, /off_chain_pet_soul_identity_records/);
  assert.match(collection, /status: record\.memory_token_id != null/);
  assert.match(collection, /: "off_chain_history"/);
  assert.doesNotMatch(interact, /mintedNft/);
  assert.doesNotMatch(evolve, /evolution_nft/);
  assert.doesNotMatch(like, /autoMintTopContent/);
  assert.match(clientContracts, /process\.env\.NEXT_PUBLIC_BLOCKCHAIN_ENABLED === "true"/);
  assert.match(activityHook, /return CONTRACTS\.blockchainEnabled && Boolean\(CONTRACTS\.petActivity\)/);
  assert.match(petGenerate, /const recordOnChain[\s\S]*if \(!isPETActivityEnabled\(\)\) return/);
  assert.match(runtimeConfig, /blockchain_enabled: blockchainEnabled\(\)/);
  assert.match(nextConfig, /NEXT_PUBLIC_BLOCKCHAIN_ENABLED:[\s\S]*process\.env\.BLOCKCHAIN_ENABLED === "true" \? "true" : "false"/);
}

async function createFixture(admin: Pool, schema: string): Promise<void> {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`
    CREATE TABLE "${schema}"."pets" (
      "id" integer PRIMARY KEY,
      "user_id" integer NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true
    );
    CREATE TABLE "${schema}"."pet_memories" (
      "id" serial PRIMARY KEY,
      "pet_id" integer NOT NULL,
      "memory_type" varchar(20) NOT NULL,
      "content" text NOT NULL,
      "importance" integer NOT NULL DEFAULT 1,
      "is_minted" boolean NOT NULL DEFAULT false,
      "memory_nft_id" integer,
      "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "${schema}"."pet_soul_nfts" (
      "id" serial PRIMARY KEY,
      "pet_id" integer NOT NULL UNIQUE,
      "token_id" integer,
      "owner_wallet" varchar(42) NOT NULL
    );
    CREATE TABLE "${schema}"."memory_nfts" (
      "id" serial PRIMARY KEY,
      "pet_id" integer NOT NULL,
      "memory_id" integer,
      "soul_token_id" integer,
      "memory_token_id" integer,
      "content_hash" varchar(66) NOT NULL UNIQUE,
      "memory_type" integer NOT NULL,
      "importance" integer NOT NULL DEFAULT 1,
      "title" varchar(200),
      "description" text,
      "mint_tx_hash" varchar(66),
      "chain" varchar(10) NOT NULL DEFAULT 'bsc',
      "owner_wallet" varchar(42) NOT NULL,
      "minted_at" timestamp(3),
      "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function applyMigration(
  admin: Pool,
  schema: string,
  migration: string,
): Promise<void> {
  const client = await admin.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(migration);
  } finally {
    await client.query("RESET search_path").catch(() => undefined);
    client.release();
  }
}

async function expectDuplicateMigrationFailure(
  admin: Pool,
  migration: string,
): Promise<void> {
  const schema = `memory_mint_duplicate_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  await createFixture(admin, schema);
  const client: PoolClient = await admin.connect();
  try {
    await client.query(`INSERT INTO "${schema}"."pets" ("id", "user_id") VALUES (1, 1)`);
    await client.query(
      `INSERT INTO "${schema}"."pet_memories"
         ("id", "pet_id", "memory_type", "content")
       VALUES (1, 1, 'milestone', 'duplicate guard')`,
    );
    await client.query(
      `INSERT INTO "${schema}"."memory_nfts"
         ("pet_id", "memory_id", "content_hash", "memory_type", "owner_wallet")
       VALUES
         (1, 1, $1, 1, $3),
         (1, 1, $2, 1, $3)`,
      [`0x${"b".repeat(64)}`, `0x${"c".repeat(64)}`, ownerWallet],
    );
    await client.query(`SET search_path TO "${schema}"`);
    await assert.rejects(
      client.query(migration),
      /MEMORY_ID_DUPLICATES/,
    );
    await client.query("ROLLBACK");
    const audit = await client.query<{ rows: number; index_exists: boolean }>(
      `SELECT
         (SELECT COUNT(*)::int FROM "${schema}"."memory_nfts") AS "rows",
         to_regclass($1) IS NOT NULL AS "index_exists"`,
      [`${schema}.memory_nfts_memory_id_key`],
    );
    assert.deepEqual(audit.rows[0], { rows: 2, index_exists: false });
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
}

async function main(): Promise<void> {
  await verifyContract();

  const connectionString = process.env.MEMORY_MINT_TEST_DATABASE_URL
    || process.env.MEMORY_MILESTONE_TEST_DATABASE_URL;
  if (!connectionString) {
    console.log("SKIP memory-mint PG integration: set MEMORY_MINT_TEST_DATABASE_URL");
    return;
  }
  const databaseName = (() => {
    try { return new URL(connectionString).pathname.slice(1); } catch { return ""; }
  })();
  if (!databaseName.includes("memory_mint_test") && !databaseName.includes("memory_milestone_test")) {
    throw new Error("Refusing memory-mint integration outside a dedicated memory_mint_test database");
  }

  const migration = await readFile(
    new URL("../prisma/migrations/20260718010000_memory_mint_idempotency/migration.sql", import.meta.url),
    "utf8",
  );
  const schema = `memory_mint_race_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  const admin = new Pool({ connectionString, max: 8 });
  let appPrisma: PrismaClient | undefined;
  let created = false;

  try {
    await expectDuplicateMigrationFailure(admin, migration);
    await createFixture(admin, schema);
    created = true;
    await applyMigration(admin, schema, migration);

    await admin.query(
      `INSERT INTO "${schema}"."pets" ("id", "user_id", "is_active")
       VALUES (1, 1, true), (2, 2, true)`,
    );
    await admin.query(
      `INSERT INTO "${schema}"."pet_memories"
         ("id", "pet_id", "memory_type", "content", "importance", "created_at")
       VALUES (1, 1, 'milestone', 'Reached level ten', 5, '2026-07-18T00:00:00.000Z')`,
    );
    await admin.query(
      `INSERT INTO "${schema}"."pet_soul_nfts"
         ("id", "pet_id", "token_id", "owner_wallet")
       VALUES (1, 1, 101, $1)`,
      [ownerWallet],
    );

    appPrisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, max: 48, options: `-c search_path=${schema}` },
        { schema },
      ),
    } as never);

    const input = {
      userId: 1,
      petId: 1,
      memoryId: 1,
      title: "Level 10",
      description: "Reached level ten",
      fallbackMemoryType: 1 as const,
    };
    const wave = await Promise.all(
      Array.from({ length: 32 }, () => appPrisma!.$transaction(
        (tx) => claimMemoryMintRecord(tx, input),
        { maxWait: 15_000, timeout: 20_000 },
      )),
    );
    const submitters = wave.filter((claim) => claim.shouldSubmit);
    assert.equal(wave.filter((claim) => claim.created).length, 1);
    assert.equal(submitters.length, 1, "only one relayer lease may be issued");
    assert.equal(new Set(wave.map((claim) => claim.memoryNftId)).size, 1);
    assert.equal(new Set(wave.map((claim) => claim.contentHash)).size, 1);

    const first = submitters[0];
    assert.ok(first?.claimToken);
    const released = await appPrisma.$transaction((tx) =>
      markMemoryMintSubmissionFailed(tx, first.memoryNftId, first.claimToken!),
    );
    assert.equal(released, true, "pre-tx relayer failure must release its lease");

    const retry = await appPrisma.$transaction((tx) => claimMemoryMintRecord(tx, input));
    assert.equal(retry.created, false);
    assert.equal(retry.shouldSubmit, true, "failed submission must be retryable");
    assert.ok(retry.claimToken);
    assert.notEqual(retry.claimToken, first.claimToken);

    const staleSuccess = await appPrisma.$transaction((tx) =>
      markMemoryMintSubmitted(tx, first.memoryNftId, first.claimToken!, submittedTxHash),
    );
    assert.equal(staleSuccess, false, "a stale relayer token cannot claim a later attempt");
    const submitted = await appPrisma.$transaction((tx) =>
      markMemoryMintSubmitted(tx, retry.memoryNftId, retry.claimToken!, submittedTxHash),
    );
    assert.equal(submitted, true);

    const replayWave = await Promise.all(
      Array.from({ length: 16 }, () => appPrisma!.$transaction(
        (tx) => claimMemoryMintRecord(tx, input),
      )),
    );
    assert.ok(replayWave.every((claim) => claim.created === false));
    assert.ok(replayWave.every((claim) => claim.shouldSubmit === false));
    assert.ok(replayWave.every((claim) => claim.mintTxHash === submittedTxHash));

    await assert.rejects(
      appPrisma.$transaction((tx) => claimMemoryMintRecord(tx, { ...input, userId: 2 })),
      MemoryClaimNotFoundError,
    );

    const audit = await admin.query<{
      rows: number;
      linked: boolean;
      attempts: number;
      status: string;
      tx_hash: string | null;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM "${schema}"."memory_nfts" WHERE "memory_id" = 1) AS "rows",
         (SELECT "is_minted" AND "memory_nft_id" IS NOT NULL
            FROM "${schema}"."pet_memories" WHERE "id" = 1) AS "linked",
         "mint_attempts" AS "attempts",
         "mint_status" AS "status",
         "mint_tx_hash" AS "tx_hash"
       FROM "${schema}"."memory_nfts" WHERE "memory_id" = 1`,
    );
    assert.deepEqual(audit.rows[0], {
      rows: 1,
      linked: true,
      attempts: 2,
      status: "submitted",
      tx_hash: submittedTxHash,
    });

    await assert.rejects(
      admin.query(
        `INSERT INTO "${schema}"."memory_nfts"
          ("pet_id", "memory_id", "content_hash", "memory_type", "owner_wallet")
         VALUES (1, 1, $1, 1, $2)`,
        [`0x${"d".repeat(64)}`, ownerWallet],
      ),
      (error: unknown) => Boolean(
        error && typeof error === "object" && "code" in error && error.code === "23505",
      ),
    );

    console.log("PASS memory mint PostgreSQL idempotency (32-way claim, failure retry, success replay)");
  } finally {
    if (appPrisma) await appPrisma.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

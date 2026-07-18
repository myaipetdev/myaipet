import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

async function verifyContract() {
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
  const [helper, legacyStatus, studioStatus, studioCreate] = await Promise.all([
    read("../src/lib/generationSettlement.ts"),
    read("../src/app/api/generate/[id]/status/route.ts"),
    read("../src/app/api/studio/generate/[jobId]/route.ts"),
    read("../src/app/api/studio/generate/route.ts"),
  ]);
  assert.match(helper, /status: \{ in: fromStatuses \}/);
  assert.match(helper, /credits: \{ increment: refund \}/);
  assert.match(helper, /return db\.\$transaction/);
  assert.equal((legacyStatus.match(/failGenerationAndRefund\(\{/g) || []).length, 2,
    "timeout and upstream failure must use the shared refund settlement");
  assert.doesNotMatch(legacyStatus, /data:\s*\{\s*status:\s*"failed"/);
  assert.equal((studioStatus.match(/failGenerationAndRefund\(\{/g) || []).length, 2);
  assert.match(studioCreate, /const failAndRefund[\s\S]*failGenerationAndRefund\(\{/);
}

async function main() {
  await verifyContract();
  const connectionString = process.env.GENERATION_SETTLEMENT_TEST_DATABASE_URL;
  if (!connectionString) {
    process.stdout.write("PASS generation settlement contract (PG skipped; set GENERATION_SETTLEMENT_TEST_DATABASE_URL)\n");
    return;
  }
  const databaseName = new URL(connectionString).pathname.slice(1);
  if (!databaseName.includes("generation_settlement_test")) {
    throw new Error("Refusing generation settlement test outside a generation_settlement_test database");
  }

  const schema = `generation_settlement_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString, max: 100 });
  let appPrisma: any;
  let defaultPrisma: any;
  let created = false;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await pool.query(`
      CREATE TABLE "${schema}"."users" (
        "id" integer PRIMARY KEY,
        "credits" integer NOT NULL,
        "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "${schema}"."generations" (
        "id" serial PRIMARY KEY,
        "user_id" integer,
        "status" varchar(20) NOT NULL,
        "error_message" text,
        "completed_at" timestamp(3),
        "credits_charged" integer NOT NULL
      );
      INSERT INTO "${schema}"."users" ("id", "credits") VALUES (1, 90), (2, 90);
    `);

    process.env.DATABASE_URL = connectionString;
    const settlement = await import("../src/lib/generationSettlement");
    ({ prisma: defaultPrisma } = await import("../src/lib/prisma"));
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
      import("../src/generated/prisma/client"),
      import("@prisma/adapter-pg"),
    ]);
    appPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}` }, { schema }),
    } as any);

    const raceOnce = async (initialStatus: "processing" | "persisting") => {
      await pool.query(`UPDATE "${schema}"."users" SET "credits"=90 WHERE "id"=1`);
      const inserted = await pool.query<{ id: number }>(
        `INSERT INTO "${schema}"."generations" ("user_id", "status", "credits_charged")
         VALUES (1, $1, 10) RETURNING "id"`,
        [initialStatus],
      );
      const generationId = inserted.rows[0]!.id;
      const failureAttempts = Array.from({ length: 48 }, () =>
        settlement.failGenerationAndRefundWithDb(appPrisma, {
          generationId,
          ownerUserId: 1,
          fromStatuses: ["processing", "persisting"],
          errorMessage: "synthetic upstream failure",
        }),
      );
      const completionAttempts = Array.from({ length: 48 }, () =>
        appPrisma.generation.updateMany({
          where: { id: generationId, user_id: 1, status: { in: ["processing", "persisting"] } },
          data: { status: "completed", completed_at: new Date(), error_message: null },
        }),
      );
      const [failures, completions] = await Promise.all([
        Promise.all(failureAttempts),
        Promise.all(completionAttempts),
      ]);
      const row = await pool.query<{ status: string; credits: number }>(`
        SELECT generation."status", owner."credits"
        FROM "${schema}"."generations" generation
        JOIN "${schema}"."users" owner ON owner."id"=generation."user_id"
        WHERE generation."id"=$1
      `, [generationId]);
      const failureWins = failures.filter(result => result.transitioned).length;
      const completionWins = completions.reduce((sum: number, result: { count: number }) => sum + result.count, 0);
      assert.equal(failureWins + completionWins, 1, "exactly one terminal CAS may win");
      assert.equal(row.rows[0]?.credits, row.rows[0]?.status === "failed" ? 100 : 90);

      const duplicate = await settlement.failGenerationAndRefundWithDb(appPrisma, {
        generationId,
        ownerUserId: 1,
        fromStatuses: ["processing", "persisting"],
        errorMessage: "duplicate failure",
      });
      assert.deepEqual(duplicate, { transitioned: false, refundedCredits: 0 });
      return row.rows[0]?.status;
    };

    for (let index = 0; index < 8; index += 1) {
      await raceOnce(index % 2 === 0 ? "processing" : "persisting");
    }

    const rollbackRow = await pool.query<{ id: number }>(`
      INSERT INTO "${schema}"."generations" ("user_id", "status", "credits_charged")
      VALUES (2, 'processing', 10) RETURNING "id"
    `);
    await pool.query(`
      CREATE FUNCTION "${schema}"."reject_credit_refund"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."credits" > OLD."credits" THEN RAISE EXCEPTION 'synthetic refund failure'; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "reject_credit_refund"
      BEFORE UPDATE ON "${schema}"."users"
      FOR EACH ROW WHEN (OLD."id"=2) EXECUTE FUNCTION "${schema}"."reject_credit_refund"();
    `);
    await assert.rejects(
      settlement.failGenerationAndRefundWithDb(appPrisma, {
        generationId: rollbackRow.rows[0]!.id,
        ownerUserId: 2,
        fromStatuses: ["processing"],
        errorMessage: "must roll back",
      }),
      /synthetic refund failure/,
    );
    let rollbackAudit = await pool.query<{ status: string; credits: number }>(`
      SELECT generation."status", owner."credits"
      FROM "${schema}"."generations" generation
      JOIN "${schema}"."users" owner ON owner."id"=generation."user_id"
      WHERE generation."id"=$1
    `, [rollbackRow.rows[0]!.id]);
    assert.deepEqual(rollbackAudit.rows[0], { status: "processing", credits: 90 },
      "refund failure must roll back the failed status too");
    await pool.query(`DROP TRIGGER "reject_credit_refund" ON "${schema}"."users"`);
    const retried = await settlement.failGenerationAndRefundWithDb(appPrisma, {
      generationId: rollbackRow.rows[0]!.id,
      ownerUserId: 2,
      fromStatuses: ["processing"],
      errorMessage: "retry succeeds",
    });
    assert.deepEqual(retried, { transitioned: true, refundedCredits: 10 });
    rollbackAudit = await pool.query(`
      SELECT generation."status", owner."credits"
      FROM "${schema}"."generations" generation
      JOIN "${schema}"."users" owner ON owner."id"=generation."user_id"
      WHERE generation."id"=$1
    `, [rollbackRow.rows[0]!.id]);
    assert.deepEqual(rollbackAudit.rows[0], { status: "failed", credits: 100 });

    process.stdout.write("PASS generation failure refund exact-once + completion/failure PG races\n");
  } finally {
    if (appPrisma) await appPrisma.$disconnect().catch(() => {});
    if (defaultPrisma) await defaultPrisma.$disconnect().catch(() => {});
    if (created) await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Generation settlement integration failed"}\n`);
  process.exitCode = 1;
});

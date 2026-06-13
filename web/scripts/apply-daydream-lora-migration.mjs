/**
 * Idempotent applier for daydream(+video) + pet-lora schema.
 *
 * This Neon instance is db-push-managed (no _prisma_migrations) and was found
 * to be MISSING pet_insights entirely, so we create it here too. Every
 * statement is IF-NOT-EXISTS / catalog-guarded — purely additive, no drops,
 * safe to re-run. (Surgical instead of `prisma db push` to avoid db push
 * dropping any drifted columns elsewhere.)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readDatabaseUrl() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = readFileSync(path.join(__dirname, "..", f), "utf8");
      const m = txt.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
      if (m) return m[1].trim();
    } catch {}
  }
  throw new Error("DATABASE_URL not found");
}

const fkGuard = (name, sql) =>
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
       ${sql}
     END IF;
   END $$`;

const STATEMENTS = [
  // ── pet_insights (daydream) — missing on this DB ──
  `CREATE TABLE IF NOT EXISTS "pet_insights" (
     "id"          SERIAL        NOT NULL,
     "pet_id"      INTEGER       NOT NULL,
     "insight"     TEXT          NOT NULL,
     "rationale"   TEXT,
     "mood"        VARCHAR(20)   NOT NULL,
     "score"       INTEGER       NOT NULL DEFAULT 5,
     "source_keys" JSONB,
     "seen"        BOOLEAN       NOT NULL DEFAULT false,
     "reacted"     BOOLEAN       NOT NULL DEFAULT false,
     "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "pet_insights_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "pet_insights_pet_created_idx" ON "pet_insights"("pet_id","created_at")`,
  fkGuard("pet_insights_pet_fkey",
    `ALTER TABLE "pet_insights" ADD CONSTRAINT "pet_insights_pet_fkey"
       FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE;`),

  // ── daydream → video link column ──
  `ALTER TABLE "pet_insights" ADD COLUMN IF NOT EXISTS "video_generation_id" INTEGER`,

  // ── pet_loras (fine-tune checkpoints) ──
  `CREATE TABLE IF NOT EXISTS "pet_loras" (
     "id"             SERIAL        NOT NULL,
     "pet_id"         INTEGER       NOT NULL,
     "status"         VARCHAR(20)   NOT NULL DEFAULT 'training',
     "fal_request_id" VARCHAR(128),
     "lora_url"       VARCHAR(512),
     "trigger_word"   VARCHAR(40)   NOT NULL,
     "images_used"    JSONB,
     "error_message"  TEXT,
     "created_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "completed_at"   TIMESTAMP(3),
     CONSTRAINT "pet_loras_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "pet_loras_pet_created_idx" ON "pet_loras"("pet_id","created_at")`,
  fkGuard("pet_loras_pet_fkey",
    `ALTER TABLE "pet_loras" ADD CONSTRAINT "pet_loras_pet_fkey"
       FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE;`),
];

const client = new pg.Client({
  connectionString: readDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  for (const sql of STATEMENTS) {
    await client.query(sql);
    console.log("✓", sql.trim().split("\n")[0].slice(0, 64));
  }

  const col = await client.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_name='pet_insights' AND column_name='video_generation_id'`);
  const ins = await client.query(
    `SELECT count(*)::int n FROM information_schema.columns WHERE table_name='pet_insights'`);
  const lora = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='pet_loras' ORDER BY ordinal_position`);
  const fks = await client.query(
    `SELECT conname FROM pg_constraint WHERE conname IN ('pet_insights_pet_fkey','pet_loras_pet_fkey')`);

  console.log("\n── verification ──");
  console.log("pet_insights columns:", ins.rows[0].n, "| video_generation_id nullable:", col.rows[0]?.is_nullable || "MISSING");
  console.log("pet_loras columns:", lora.rows.map(r => r.column_name).join(", "));
  console.log("FKs present:", fks.rows.map(r => r.conname).join(", "));

  const ok = col.rows.length === 1 && lora.rows.length === 10 && fks.rows.length === 2;
  console.log("\nRESULT:", ok ? "✅ applied & verified" : "❌ verification failed");
  process.exit(ok ? 0 : 1);
} finally {
  await client.end();
}

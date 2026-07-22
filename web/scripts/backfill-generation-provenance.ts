/**
 * Measured, resumable OFF-RELEASE classifier for Generation.source_kind.
 *
 * The release migration intentionally leaves every historical row
 * "unclassified" so `prisma migrate deploy` performs no table-wide data
 * update. Public reads allowlist only "user", making that temporary state
 * fail closed. This script classifies only independently provable buckets in
 * bounded SQL batches; it never loads generation ids into JavaScript.
 *
 * Preview (read-only):
 *   PROVENANCE_BACKFILL_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/backfill-generation-provenance.ts
 *
 * Apply (operator-only, bounded and resumable):
 *   PROVENANCE_BACKFILL_DATABASE_URL=postgresql://... \
 *   PETCLAW_PROVENANCE_BACKFILL_APPLY=CLASSIFY_SAFE_LEGACY_ROWS_V1 \
 *   PETCLAW_PROVENANCE_BACKFILL_BATCH_SIZE=250 \
 *   PETCLAW_PROVENANCE_BACKFILL_MAX_BATCHES=20 \
 *     npx tsx scripts/backfill-generation-provenance.ts
 */
import { pathToFileURL } from "node:url";
import { Pool, type PoolClient } from "pg";

const APPLY_CONFIRMATION = "CLASSIFY_SAFE_LEGACY_ROWS_V1";
const UNCLASSIFIED = "unclassified";

export interface ProvenanceCounts {
  unclassified: number;
  linkedDaydream: number;
  linkedAutonomous: number;
  provableUser: number;
  ambiguous: number;
}

export interface BackfillResult {
  applied: boolean;
  statements: number;
  rows: {
    memoryDaydream: number;
    insightState: number;
    agentAutonomous: number;
    user: number;
  };
  before: ProvenanceCounts;
  after: ProvenanceCounts;
}

type Phase = keyof BackfillResult["rows"];

async function assertBackfillSchema(pool: Pool): Promise<void> {
  const result = await pool.query<{
    source_nullable: string | null;
    source_default: string | null;
    conversion_columns: string;
  }>(`
    SELECT
      MAX(is_nullable) FILTER (
        WHERE table_name = 'generations' AND column_name = 'source_kind'
      ) AS source_nullable,
      MAX(column_default) FILTER (
        WHERE table_name = 'generations' AND column_name = 'source_kind'
      ) AS source_default,
      COUNT(*) FILTER (
        WHERE table_name = 'pet_insights'
          AND column_name IN (
            'conversion_status', 'conversion_memory_epoch',
            'conversion_claimed_at', 'conversion_attempts',
            'conversion_retry_at', 'conversion_error'
          )
      )::text AS conversion_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('generations', 'pet_insights')
  `);
  const row = result.rows[0];
  if (
    !row
    || row.source_nullable !== "NO"
    || !row.source_default?.includes("unclassified")
    || asCount(row.conversion_columns) !== 6
  ) {
    throw new Error("Generation provenance schema is not the reviewed release shape");
  }
}

function boundedInteger(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`Backfill bound must be an integer between 1 and ${max}`);
  }
  return parsed;
}

function asCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Provenance aggregate exceeded the safe integer range");
  }
  return parsed;
}

export async function readProvenanceCounts(pool: Pool): Promise<ProvenanceCounts> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const result = await client.query<{
      unclassified: string;
      linked_daydream: string;
      linked_autonomous: string;
      provable_user: string;
      ambiguous: string;
    }>(`
      WITH classified AS (
        SELECT
          g.id,
          EXISTS (
            SELECT 1 FROM pet_insights pi
            WHERE pi.video_generation_id = g.id
          ) AS linked_daydream,
          EXISTS (
            SELECT 1 FROM pet_autonomous_actions paa
            WHERE paa.generation_id = g.id
          ) AS linked_autonomous,
          g.user_id,
          g.pet_id,
          g.duration,
          g.credits_charged
        FROM generations g
        WHERE g.source_kind = 'unclassified'
      )
      SELECT
        COUNT(*)::text AS unclassified,
        COUNT(*) FILTER (WHERE linked_daydream)::text AS linked_daydream,
        COUNT(*) FILTER (
          WHERE NOT linked_daydream AND linked_autonomous
        )::text AS linked_autonomous,
        COUNT(*) FILTER (
          WHERE NOT linked_daydream
            AND NOT linked_autonomous
            AND user_id IS NOT NULL
            AND (credits_charged > 0 OR pet_id IS NULL OR duration = 0)
        )::text AS provable_user,
        COUNT(*) FILTER (
          WHERE NOT linked_daydream
            AND NOT linked_autonomous
            AND NOT (
              user_id IS NOT NULL
              AND (credits_charged > 0 OR pet_id IS NULL OR duration = 0)
            )
        )::text AS ambiguous
      FROM classified
    `);
    await client.query("COMMIT");
    const row = result.rows[0];
    if (!row) throw new Error("Provenance aggregate returned no row");
    return {
      unclassified: asCount(row.unclassified),
      linkedDaydream: asCount(row.linked_daydream),
      linkedAutonomous: asCount(row.linked_autonomous),
      provableUser: asCount(row.provable_user),
      ambiguous: asCount(row.ambiguous),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const PHASE_SQL: Record<Phase, string> = {
  memoryDaydream: `
    WITH batch AS (
      SELECT g.id
      FROM generations g
      WHERE g.source_kind = 'unclassified'
        AND EXISTS (
          SELECT 1 FROM pet_insights pi
          WHERE pi.video_generation_id = g.id
        )
      ORDER BY g.id
      LIMIT $1
      FOR UPDATE OF g SKIP LOCKED
    )
    UPDATE generations g
    SET source_kind = 'memory_daydream'
    FROM batch
    WHERE g.id = batch.id
  `,
  insightState: `
    WITH batch AS (
      SELECT pi.id
      FROM pet_insights pi
      JOIN generations g ON g.id = pi.video_generation_id
      WHERE g.source_kind = 'memory_daydream'
        AND pi.conversion_status = 'ready'
      ORDER BY pi.id
      LIMIT $1
      FOR UPDATE OF pi SKIP LOCKED
    )
    UPDATE pet_insights pi
    SET conversion_status = CASE
      WHEN g.status IN ('reserved', 'pending', 'processing', 'persisting') THEN 'submitted'
      WHEN g.status = 'failed' THEN 'failed'
      ELSE 'converted'
    END
    FROM batch, generations g
    WHERE pi.id = batch.id
      AND g.id = pi.video_generation_id
      AND g.source_kind = 'memory_daydream'
  `,
  agentAutonomous: `
    WITH batch AS (
      SELECT g.id
      FROM generations g
      WHERE g.source_kind = 'unclassified'
        AND EXISTS (
          SELECT 1 FROM pet_autonomous_actions paa
          WHERE paa.generation_id = g.id
        )
      ORDER BY g.id
      LIMIT $1
      FOR UPDATE OF g SKIP LOCKED
    )
    UPDATE generations g
    SET source_kind = 'agent_autonomous'
    FROM batch
    WHERE g.id = batch.id
  `,
  user: `
    WITH batch AS (
      SELECT g.id
      FROM generations g
      WHERE g.source_kind = 'unclassified'
        AND NOT EXISTS (
          SELECT 1 FROM pet_insights pi
          WHERE pi.video_generation_id = g.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM pet_autonomous_actions paa
          WHERE paa.generation_id = g.id
        )
        AND g.user_id IS NOT NULL
        AND (g.credits_charged > 0 OR g.pet_id IS NULL OR g.duration = 0)
      ORDER BY g.id
      LIMIT $1
      FOR UPDATE OF g SKIP LOCKED
    )
    UPDATE generations g
    SET source_kind = 'user'
    FROM batch
    WHERE g.id = batch.id
  `,
};

async function runPhase(client: PoolClient, phase: Phase, batchSize: number): Promise<number> {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const result = await client.query(PHASE_SQL[phase], [batchSize]);
    await client.query("COMMIT");
    return result.rowCount || 0;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

export async function runProvenanceBackfill(
  pool: Pool,
  options: { apply: boolean; batchSize: number; maxBatches: number },
): Promise<BackfillResult> {
  await assertBackfillSchema(pool);
  const before = await readProvenanceCounts(pool);
  const rows: BackfillResult["rows"] = {
    memoryDaydream: 0,
    insightState: 0,
    agentAutonomous: 0,
    user: 0,
  };
  if (!options.apply) {
    return { applied: false, statements: 0, rows, before, after: before };
  }

  const batchSize = Math.max(1, Math.min(1_000, Math.trunc(options.batchSize)));
  const maxBatches = Math.max(1, Math.min(1_000, Math.trunc(options.maxBatches)));
  const phases = Object.keys(PHASE_SQL) as Phase[];
  const drained = new Set<Phase>();
  let statements = 0;
  const client = await pool.connect();
  try {
    while (statements < maxBatches && drained.size < phases.length) {
      for (const phase of phases) {
        if (drained.has(phase) || statements >= maxBatches) continue;
        const changed = await runPhase(client, phase, batchSize);
        statements += 1;
        rows[phase] += changed;
        if (changed < batchSize) drained.add(phase);
      }
    }
  } finally {
    client.release();
  }

  const after = await readProvenanceCounts(pool);
  return { applied: true, statements, rows, before, after };
}

async function main(): Promise<void> {
  const connectionString = process.env.PROVENANCE_BACKFILL_DATABASE_URL;
  if (!connectionString) {
    throw new Error("PROVENANCE_BACKFILL_DATABASE_URL is required");
  }
  const applyValue = process.env.PETCLAW_PROVENANCE_BACKFILL_APPLY;
  if (applyValue && applyValue !== APPLY_CONFIRMATION) {
    throw new Error("Invalid PETCLAW_PROVENANCE_BACKFILL_APPLY confirmation");
  }
  const apply = applyValue === APPLY_CONFIRMATION;
  const batchSize = boundedInteger(
    process.env.PETCLAW_PROVENANCE_BACKFILL_BATCH_SIZE,
    250,
    1_000,
  );
  const maxBatches = boundedInteger(
    process.env.PETCLAW_PROVENANCE_BACKFILL_MAX_BATCHES,
    20,
    1_000,
  );
  const pool = new Pool({ connectionString, max: 2 });
  try {
    const result = await runProvenanceBackfill(pool, { apply, batchSize, maxBatches });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch(() => {
    // Driver errors may include credentials or host details. Keep stderr generic.
    process.stderr.write("Generation provenance backfill failed.\n");
    process.exitCode = 1;
  });
}

export { APPLY_CONFIRMATION, UNCLASSIFIED };

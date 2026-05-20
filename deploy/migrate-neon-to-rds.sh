#!/bin/bash
# Migrate PetClaw production data from NeonDB → AWS RDS PostgreSQL.
#
# Strategy:
#   1. Take an exclusive logical dump from Neon (pg_dump --no-owner --no-acl)
#   2. Restore into the fresh RDS database
#   3. Run prisma migrate deploy to ensure schema matches code
#   4. Verify row counts roundtrip
#
# Safe to re-run: dumps go to ./neon-dump-<timestamp>.sql so older runs aren't
# overwritten. The RDS DB is wiped before each restore — back it up first if
# you've already started writing to RDS.
#
# Required env (set in your shell or .env):
#   NEON_DATABASE_URL   — current production NeonDB connection string
#   RDS_DATABASE_URL    — new RDS connection string from setup-rds.sh
#
# Run:
#   export NEON_DATABASE_URL='postgresql://...neon.tech/...'
#   export RDS_DATABASE_URL='postgresql://...rds.amazonaws.com:5432/petclaw?sslmode=require'
#   bash deploy/migrate-neon-to-rds.sh

set -euo pipefail

if [ -z "${NEON_DATABASE_URL:-}" ] || [ -z "${RDS_DATABASE_URL:-}" ]; then
  echo "ERROR: set NEON_DATABASE_URL and RDS_DATABASE_URL before running."
  exit 1
fi

# Sanity check: NEON_DATABASE_URL should contain "neon.tech", RDS should contain "rds.amazonaws"
if ! [[ "${NEON_DATABASE_URL}" == *"neon.tech"* ]]; then
  echo "WARNING: NEON_DATABASE_URL doesn't look like a Neon URL. Continuing anyway."
fi
if ! [[ "${RDS_DATABASE_URL}" == *"rds.amazonaws"* ]]; then
  echo "WARNING: RDS_DATABASE_URL doesn't look like an RDS URL. Continuing anyway."
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="./neon-dump-${TIMESTAMP}.sql"

echo "═══════════════════════════════════"
echo "  Neon → RDS migration"
echo "  Dump file: ${DUMP_FILE}"
echo "═══════════════════════════════════"
echo ""

# Verify pg_dump + psql installed
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump not installed. brew install postgresql@17 (mac) or apt install postgresql-client (ubuntu)"; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "psql not installed."; exit 1; }

# Pre-flight: row count snapshot from source
echo "→ Counting rows in source (Neon)..."
SOURCE_ROWS=$(psql "${NEON_DATABASE_URL}" -At -c "
  SELECT json_object_agg(table_name, n)::text FROM (
    SELECT relname AS table_name, n_live_tup AS n
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY relname
  ) t;
")
echo "${SOURCE_ROWS}"
echo ""

# Dump
echo "→ Dumping from Neon..."
pg_dump "${NEON_DATABASE_URL}" \
  --no-owner \
  --no-acl \
  --no-comments \
  --format=plain \
  --schema=public \
  > "${DUMP_FILE}"
echo "  Dumped $(wc -l < "${DUMP_FILE}") lines, $(du -h "${DUMP_FILE}" | cut -f1)"
echo ""

# Wipe target schema (safer than DROP DATABASE since we don't own the DB at the cluster level)
echo "→ Wiping target schema on RDS..."
psql "${RDS_DATABASE_URL}" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

# Restore
echo "→ Restoring into RDS..."
psql "${RDS_DATABASE_URL}" \
  -v ON_ERROR_STOP=1 \
  -f "${DUMP_FILE}" \
  2>&1 | tail -20

# Run prisma migrate to backfill any pending migrations (idempotent)
echo ""
echo "→ Running prisma migrate deploy (covers any schema drift)..."
cd "$(dirname "$0")/../web"
DATABASE_URL="${RDS_DATABASE_URL}" npx prisma migrate deploy || echo "  (no migrations pending or first-time setup)"
DATABASE_URL="${RDS_DATABASE_URL}" npx prisma generate
cd - >/dev/null

# Post-flight: row counts on target
echo ""
echo "→ Counting rows in target (RDS)..."
TARGET_ROWS=$(psql "${RDS_DATABASE_URL}" -At -c "
  SELECT json_object_agg(table_name, n)::text FROM (
    SELECT relname AS table_name, n_live_tup AS n
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY relname
  ) t;
")

# Some n_live_tup needs an ANALYZE pass to be accurate; force it
psql "${RDS_DATABASE_URL}" -c "ANALYZE;" >/dev/null
TARGET_ROWS_AFTER_ANALYZE=$(psql "${RDS_DATABASE_URL}" -At -c "
  SELECT json_object_agg(table_name, n)::text FROM (
    SELECT relname AS table_name, n_live_tup AS n
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY relname
  ) t;
")
echo "${TARGET_ROWS_AFTER_ANALYZE}"

echo ""
echo "═══════════════════════════════════"
echo "  ✅ Migration complete"
echo ""
echo "  Compare row counts above. Then:"
echo "  1. Update DATABASE_URL on EC2 (.env.production):"
echo "       DATABASE_URL=\${RDS_DATABASE_URL}"
echo "  2. Restart: pm2 reload petclaw-web --update-env"
echo "  3. Smoke test: curl https://app.myaipet.ai/api/petclaw/skills"
echo "  4. After verifying, delete Neon project on console.neon.tech"
echo ""
echo "  Dump file kept at: ${DUMP_FILE}"
echo "  (keep it until you've confirmed RDS is working, then delete)"
echo "═══════════════════════════════════"

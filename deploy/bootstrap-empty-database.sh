#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$REPO_DIR/web"
BASELINE_DIR="$WEB_DIR/prisma/baseline"
BASELINE_SQL="$BASELINE_DIR/20260717_production.sql"
MIGRATION_MANIFEST="$BASELINE_DIR/20260717_migrations.txt"

for required in "$BASELINE_SQL" "$MIGRATION_MANIFEST"; do
  if [[ ! -f "$required" ]]; then
    echo "Missing baseline file: $required" >&2
    exit 2
  fi
done

existing_tables="$(psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations'")"
if [[ "$existing_tables" != "0" ]]; then
  echo "Refusing baseline: target database is not empty ($existing_tables application tables)" >&2
  exit 3
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$BASELINE_SQL"

cd "$WEB_DIR"
while IFS= read -r migration_name; do
  [[ -z "$migration_name" ]] && continue
  npx prisma migrate resolve --applied "$migration_name"
done < "$MIGRATION_MANIFEST"

# Migrations created after the baseline snapshot are applied normally.
npx prisma migrate deploy
npx prisma migrate status

# The baseline manifest resolves the historical memory-FTS migration as already
# applied. Prove the snapshot actually contains its generated column and both
# usable indexes; otherwise a disaster-recovery bootstrap can report "up to
# date" while shipping a materially incomplete schema.
memory_fts_state="$(psql "${DATABASE_URL}" -X -qAt -v ON_ERROR_STOP=1 -c \
  "SELECT CASE
     WHEN to_regclass('public.pet_memories') IS NULL THEN 'missing_table'
     WHEN NOT EXISTS (
       SELECT 1
       FROM pg_attribute AS attribute
       JOIN pg_attrdef AS definition
         ON definition.adrelid = attribute.attrelid
        AND definition.adnum = attribute.attnum
       WHERE attribute.attrelid = to_regclass('public.pet_memories')
         AND attribute.attname = 'content_tsv'
         AND NOT attribute.attisdropped
         AND attribute.attgenerated = 's'
         AND format_type(attribute.atttypid, attribute.atttypmod) = 'tsvector'
         AND pg_get_expr(definition.adbin, definition.adrelid)
           = 'to_tsvector(''simple''::regconfig, COALESCE(content, ''''::text))'
     ) THEN 'invalid_column'
     WHEN NOT EXISTS (
       SELECT 1
       FROM pg_class AS index_class
       JOIN pg_index AS index_state ON index_state.indexrelid = index_class.oid
       JOIN pg_am AS access_method ON access_method.oid = index_class.relam
       WHERE index_class.oid = to_regclass('public.pet_memories_content_tsv_idx')
         AND index_state.indrelid = to_regclass('public.pet_memories')
         AND index_state.indisvalid
         AND index_state.indisready
         AND access_method.amname = 'gin'
         AND pg_get_indexdef(index_class.oid) LIKE '% USING gin (content_tsv)'
     ) THEN 'invalid_gin_index'
     WHEN NOT EXISTS (
       SELECT 1
       FROM pg_class AS index_class
       JOIN pg_index AS index_state ON index_state.indexrelid = index_class.oid
       JOIN pg_am AS access_method ON access_method.oid = index_class.relam
       WHERE index_class.oid = to_regclass('public.pet_memories_pet_id_created_at_idx')
         AND index_state.indrelid = to_regclass('public.pet_memories')
         AND index_state.indisvalid
         AND index_state.indisready
         AND access_method.amname = 'btree'
         AND pg_get_indexdef(index_class.oid)
           LIKE '% USING btree (pet_id, created_at DESC)'
     ) THEN 'invalid_compound_index'
     ELSE 'ready'
   END")"
if [[ "${memory_fts_state}" != "ready" ]]; then
  echo "Baseline memory-FTS verification failed: ${memory_fts_state}" >&2
  exit 4
fi

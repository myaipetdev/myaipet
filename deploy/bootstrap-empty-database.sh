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

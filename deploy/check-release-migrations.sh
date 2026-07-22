#!/usr/bin/env bash
# Reject destructive or release-path data-mutating Prisma SQL unless its exact
# bytes were explicitly approved. Large backfills belong outside migrate deploy.
set -euo pipefail
umask 077

PETCLAW_MIGRATION_ROOT="${1:-}"
PETCLAW_MIGRATION_ALLOWLIST="${2:-}"

petclaw_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

if [[ -z "${PETCLAW_MIGRATION_ROOT}" || ! -d "${PETCLAW_MIGRATION_ROOT}" \
  || -L "${PETCLAW_MIGRATION_ROOT}" ]]; then
  echo "ERROR: migration gate needs a real release root." >&2
  exit 2
fi
PETCLAW_MIGRATION_ROOT="$(cd -- "${PETCLAW_MIGRATION_ROOT}" && pwd -P)"
PETCLAW_MIGRATION_ALLOWLIST="${PETCLAW_MIGRATION_ALLOWLIST:-${PETCLAW_MIGRATION_ROOT}/deploy/destructive-migrations.allowlist}"
PETCLAW_MIGRATION_DIR="${PETCLAW_MIGRATION_ROOT}/web/prisma/migrations"
PETCLAW_EXPECTED_ALLOWLIST="${PETCLAW_MIGRATION_ROOT}/deploy/destructive-migrations.allowlist"
PETCLAW_BASELINE_SQL="${PETCLAW_MIGRATION_ROOT}/web/prisma/baseline/20260717_production.sql"
PETCLAW_BASELINE_MANIFEST="${PETCLAW_MIGRATION_ROOT}/web/prisma/baseline/20260717_migrations.txt"
PETCLAW_PRISMA_SCHEMA="${PETCLAW_MIGRATION_ROOT}/web/prisma/schema.prisma"
if [[ ! -d "${PETCLAW_MIGRATION_DIR}" || -L "${PETCLAW_MIGRATION_DIR}" \
  || ! -f "${PETCLAW_MIGRATION_ALLOWLIST}" || -L "${PETCLAW_MIGRATION_ALLOWLIST}" \
  || ! -f "${PETCLAW_BASELINE_SQL}" || -L "${PETCLAW_BASELINE_SQL}" \
  || ! -f "${PETCLAW_BASELINE_MANIFEST}" || -L "${PETCLAW_BASELINE_MANIFEST}" \
  || ! -f "${PETCLAW_PRISMA_SCHEMA}" || -L "${PETCLAW_PRISMA_SCHEMA}" \
  || "$(cd -- "$(dirname -- "${PETCLAW_MIGRATION_ALLOWLIST}")" 2>/dev/null && pwd -P)/$(basename -- "${PETCLAW_MIGRATION_ALLOWLIST}")" \
    != "${PETCLAW_EXPECTED_ALLOWLIST}" ]]; then
  echo "ERROR: migration mutation approval allowlist is missing or unsafe." >&2
  exit 2
fi

# Baseline manifests are executable migration state: once a historical
# migration is resolved as applied, Prisma will never create an object omitted
# from the snapshot. Keep this high-impact invariant in the signed migration
# gate, not only in an optional test suite.
if [[ "$(grep -Fxc '20260615000000_memory_fts' "${PETCLAW_BASELINE_MANIFEST}" || true)" != "1" \
  || ! -f "${PETCLAW_MIGRATION_DIR}/20260615000000_memory_fts/migration.sql" \
  || -L "${PETCLAW_MIGRATION_DIR}/20260615000000_memory_fts/migration.sql" \
  || "$(grep -Fxc '    "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('\''simple'\''::regconfig, COALESCE("content", '\'''\''::text))) STORED,' "${PETCLAW_BASELINE_SQL}" || true)" != "1" \
  || "$(grep -Fxc 'CREATE INDEX "pet_memories_content_tsv_idx" ON "pet_memories" USING GIN ("content_tsv");' "${PETCLAW_BASELINE_SQL}" || true)" != "1" \
  || "$(grep -Fxc 'CREATE INDEX "pet_memories_pet_id_created_at_idx" ON "pet_memories"("pet_id", "created_at" DESC);' "${PETCLAW_BASELINE_SQL}" || true)" != "1" \
  || "$(grep -Fxc '  @@index([content_tsv], type: Gin)' "${PETCLAW_PRISMA_SCHEMA}" || true)" != "1" \
  || "$(grep -Fxc '  @@index([pet_id, created_at(sort: Desc)])' "${PETCLAW_PRISMA_SCHEMA}" || true)" != "1" ]]; then
  echo "ERROR: production baseline falsely resolves the required memory-FTS schema." >&2
  exit 1
fi

PETCLAW_APPROVALS_NORMALIZED="$(mktemp)"
trap 'rm -f -- "${PETCLAW_APPROVALS_NORMALIZED}"' EXIT HUP INT TERM
while IFS='|' read -r PETCLAW_ALLOW_HASH PETCLAW_ALLOW_PATH PETCLAW_ALLOW_REASON; do
  [[ -z "${PETCLAW_ALLOW_HASH}" || "${PETCLAW_ALLOW_HASH}" == \#* ]] && continue
  if [[ ! "${PETCLAW_ALLOW_HASH}" =~ ^[0-9a-f]{64}$ \
    || ! "${PETCLAW_ALLOW_PATH}" =~ ^web/prisma/migrations/[0-9A-Za-z._-]+/migration\.sql$ \
    || -z "${PETCLAW_ALLOW_REASON}" \
    || "$(awk -F'|' -v path="${PETCLAW_ALLOW_PATH}" '$2 == path { count += 1 } END { print count + 0 }' \
      "${PETCLAW_APPROVALS_NORMALIZED}")" != "0" ]]; then
    echo "ERROR: malformed or duplicate migration mutation approval." >&2
    exit 2
  fi
  printf '%s|%s|%s\n' "${PETCLAW_ALLOW_HASH}" "${PETCLAW_ALLOW_PATH}" \
    "${PETCLAW_ALLOW_REASON}" >> "${PETCLAW_APPROVALS_NORMALIZED}"
done < "${PETCLAW_MIGRATION_ALLOWLIST}"

PETCLAW_DESTRUCTIVE_PATTERN='\b(DROP[[:space:]]+(TABLE|COLUMN|CONSTRAINT|INDEX|SCHEMA|DATABASE|VIEW|MATERIALIZED[[:space:]]+VIEW|TYPE|FUNCTION|PROCEDURE|TRIGGER|POLICY|SEQUENCE|EXTENSION)|TRUNCATE([[:space:]]+TABLE)?|DELETE[[:space:]]+FROM|RENAME[[:space:]]+(TO|COLUMN)|ALTER[[:space:]]+COLUMN[^;]*(SET[[:space:]]+NOT[[:space:]]+NULL|TYPE))\b'
# Anchor data statements at the start of a SQL line so `ON UPDATE CASCADE` and
# comments are not mistaken for a backfill. INSERT is included: INSERT..SELECT
# and catalog seeding both mutate live rows and need the same byte-level review.
PETCLAW_DATA_MUTATION_PATTERN='^[[:space:]]*(WITH([[:space:]]|$)|UPDATE[[:space:]]|INSERT[[:space:]]+INTO[[:space:]]|MERGE[[:space:]]+INTO[[:space:]]|COPY[[:space:]])'
PETCLAW_REVIEWED_COUNT=0

while IFS= read -r -d '' PETCLAW_MIGRATION_FILE; do
  if ! LC_ALL=C grep -Eiq "${PETCLAW_DESTRUCTIVE_PATTERN}" "${PETCLAW_MIGRATION_FILE}" \
    && ! LC_ALL=C grep -Eiq "${PETCLAW_DATA_MUTATION_PATTERN}" "${PETCLAW_MIGRATION_FILE}"; then
    continue
  fi
  PETCLAW_MIGRATION_REL="${PETCLAW_MIGRATION_FILE#"${PETCLAW_MIGRATION_ROOT}"/}"
  PETCLAW_MIGRATION_SHA="$(petclaw_sha256 "${PETCLAW_MIGRATION_FILE}")"
  PETCLAW_APPROVED_SHA="$(awk -F'|' -v path="${PETCLAW_MIGRATION_REL}" \
    '$2 == path { print $1 }' "${PETCLAW_APPROVALS_NORMALIZED}")"
  if [[ "${PETCLAW_APPROVED_SHA}" != "${PETCLAW_MIGRATION_SHA}" ]]; then
    echo "ERROR: destructive or data-mutating migration lacks an exact checksum approval: ${PETCLAW_MIGRATION_REL}" >&2
    exit 1
  fi
  PETCLAW_REVIEWED_COUNT="$((PETCLAW_REVIEWED_COUNT + 1))"
done < <(find "${PETCLAW_MIGRATION_DIR}" \
  -mindepth 2 -maxdepth 2 -type f -name migration.sql -print0)

while IFS='|' read -r PETCLAW_APPROVED_HASH PETCLAW_APPROVED_PATH _; do
  PETCLAW_APPROVED_FILE="${PETCLAW_MIGRATION_ROOT}/${PETCLAW_APPROVED_PATH}"
  if [[ ! -f "${PETCLAW_APPROVED_FILE}" || -L "${PETCLAW_APPROVED_FILE}" \
    || "$(petclaw_sha256 "${PETCLAW_APPROVED_FILE}")" != "${PETCLAW_APPROVED_HASH}" ]]; then
    echo "ERROR: approved migration mutation is absent or its bytes changed: ${PETCLAW_APPROVED_PATH}" >&2
    exit 1
  fi
done < "${PETCLAW_APPROVALS_NORMALIZED}"

echo "Migration mutation gate passed (${PETCLAW_REVIEWED_COUNT} exact approvals)."

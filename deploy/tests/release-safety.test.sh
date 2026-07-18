#!/usr/bin/env bash
# Contract probes intentionally search literal shell source.
# shellcheck disable=SC2016
set -euo pipefail
umask 077

PETCLAW_TEST_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
PETCLAW_TEST_TMP="$(mktemp -d)"
PETCLAW_TEST_PASSED=0

petclaw_test_cleanup() {
  if [[ -n "${PETCLAW_TEST_TMP}" && -d "${PETCLAW_TEST_TMP}" \
    && ! -L "${PETCLAW_TEST_TMP}" ]]; then
    find "${PETCLAW_TEST_TMP}" -depth -delete
  fi
}
trap petclaw_test_cleanup EXIT HUP INT TERM

petclaw_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

petclaw_expect_success() {
  local PETCLAW_TEST_NAME="$1"
  shift
  if ! "$@" >"${PETCLAW_TEST_TMP}/stdout" 2>"${PETCLAW_TEST_TMP}/stderr"; then
    echo "FAIL: ${PETCLAW_TEST_NAME} unexpectedly failed" >&2
    sed -n '1,20p' "${PETCLAW_TEST_TMP}/stderr" >&2
    exit 1
  fi
  PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"
}

petclaw_expect_failure() {
  local PETCLAW_TEST_NAME="$1"
  shift
  if "$@" >"${PETCLAW_TEST_TMP}/stdout" 2>"${PETCLAW_TEST_TMP}/stderr"; then
    echo "FAIL: ${PETCLAW_TEST_NAME} unexpectedly passed" >&2
    exit 1
  fi
  PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"
}

PETCLAW_FIXTURE="${PETCLAW_TEST_TMP}/release"
mkdir -p "${PETCLAW_FIXTURE}/web/prisma/migrations/20260101000000_safe" \
  "${PETCLAW_FIXTURE}/deploy"
printf '%s\n' 'CREATE TABLE "safe_table" ("id" INTEGER PRIMARY KEY);' \
  > "${PETCLAW_FIXTURE}/web/prisma/migrations/20260101000000_safe/migration.sql"
printf '%s\n' '# sha256|repository-relative migration path|operator-reviewed reason' \
  > "${PETCLAW_FIXTURE}/deploy/destructive-migrations.allowlist"
petclaw_expect_success "safe migration passes" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/check-release-migrations.sh" "${PETCLAW_FIXTURE}"

mkdir -p "${PETCLAW_FIXTURE}/web/prisma/migrations/20260102000000_delete"
printf '%s\n' 'DELETE FROM "users" WHERE "id" < 0;' \
  > "${PETCLAW_FIXTURE}/web/prisma/migrations/20260102000000_delete/migration.sql"
petclaw_expect_failure "unapproved destructive migration fails" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/check-release-migrations.sh" "${PETCLAW_FIXTURE}"
printf '%064d|%s|%s\n' 0 \
  'web/prisma/migrations/20260102000000_delete/migration.sql' 'intentionally wrong checksum' \
  >> "${PETCLAW_FIXTURE}/deploy/destructive-migrations.allowlist"
petclaw_expect_failure "wrong destructive checksum fails" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/check-release-migrations.sh" "${PETCLAW_FIXTURE}"
PETCLAW_DELETE_SHA="$(petclaw_sha256 \
  "${PETCLAW_FIXTURE}/web/prisma/migrations/20260102000000_delete/migration.sql")"
printf '%s\n' '# sha256|repository-relative migration path|operator-reviewed reason' \
  > "${PETCLAW_FIXTURE}/deploy/destructive-migrations.allowlist"
printf '%s|%s|%s\n' "${PETCLAW_DELETE_SHA}" \
  'web/prisma/migrations/20260102000000_delete/migration.sql' 'fixture approval' \
  >> "${PETCLAW_FIXTURE}/deploy/destructive-migrations.allowlist"
petclaw_expect_success "exact destructive checksum passes" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/check-release-migrations.sh" "${PETCLAW_FIXTURE}"
mkdir -p "${PETCLAW_FIXTURE}/web/prisma/migrations/20260103000000_drop_index"
printf '%s\n' 'DROP INDEX "safe_table_id_idx";' \
  > "${PETCLAW_FIXTURE}/web/prisma/migrations/20260103000000_drop_index/migration.sql"
petclaw_expect_failure "unapproved destructive object drop fails" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/check-release-migrations.sh" "${PETCLAW_FIXTURE}"
rm -f "${PETCLAW_FIXTURE}/web/prisma/migrations/20260103000000_drop_index/migration.sql"
rmdir "${PETCLAW_FIXTURE}/web/prisma/migrations/20260103000000_drop_index"

PETCLAW_SCAN_FIXTURE="${PETCLAW_TEST_TMP}/scan"
mkdir -p "${PETCLAW_SCAN_FIXTURE}"
printf '%s\n' 'const harmless = "placeholder";' > "${PETCLAW_SCAN_FIXTURE}/safe.js"
petclaw_expect_success "safe source scan passes" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/scan-release-secrets.sh" "${PETCLAW_SCAN_FIXTURE}"
printf '%s\n' 'JWT_SECRET=synthetic' > "${PETCLAW_SCAN_FIXTURE}/.env.production"
petclaw_expect_failure "dotenv is forbidden" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/scan-release-secrets.sh" "${PETCLAW_SCAN_FIXTURE}"
rm -f "${PETCLAW_SCAN_FIXTURE}/.env.production"
printf '%s%s\n' '-----BEGIN ENCRYPTED ' 'PRIVATE KEY-----' > "${PETCLAW_SCAN_FIXTURE}/hidden.txt"
petclaw_expect_failure "encrypted private key is detected" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/scan-release-secrets.sh" "${PETCLAW_SCAN_FIXTURE}"
rm -f "${PETCLAW_SCAN_FIXTURE}/hidden.txt"
mkdir -p "${PETCLAW_TEST_TMP}/zip"
printf 'xai-%s%s\n' 'abcdefghijklmnop' 'qrstuvwxyz123456' \
  > "${PETCLAW_TEST_TMP}/zip/token.txt"
(cd "${PETCLAW_TEST_TMP}/zip" && zip -q "${PETCLAW_SCAN_FIXTURE}/public.zip" token.txt)
petclaw_expect_failure "compressed public credential is detected" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/scan-release-secrets.sh" "${PETCLAW_SCAN_FIXTURE}"
rm -f "${PETCLAW_SCAN_FIXTURE}/public.zip"
printf '\0xai-%s%s\0' 'abcdefghijklmnop' 'qrstuvwxyz123456' \
  > "${PETCLAW_SCAN_FIXTURE}/binary.bin"
petclaw_expect_failure "raw binary credential is detected without strings" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/scan-release-secrets.sh" "${PETCLAW_SCAN_FIXTURE}"
if grep -Eq '(^|[|[:space:]])strings[[:space:]]' \
  "${PETCLAW_TEST_ROOT}/deploy/scan-release-secrets.sh"; then
  echo "FAIL: secret scan still depends on the optional strings utility" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

petclaw_expect_success "all release scripts parse" /bin/bash -n \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/release-rollback-watchdog.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/release-boot-guard.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/backup-production.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/pull-production-backup.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/verify-backup-snapshot.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/build-release-artifact.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/verify-release-artifact.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/check-release-migrations.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/scan-release-secrets.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh"

for PETCLAW_CONTRACT in \
  'ec2-release.sh:PETCLAW_ROLLBACK_WATCHDOG_BIN' \
  'ec2-release.sh:PETCLAW_EXPECTED_RELEASE_ID' \
  'ec2-release.sh:PETCLAW_POSTMIGRATION_MIN_FREE_BYTES' \
  'ec2-release.sh:PETCLAW_RUNTIME_CACHE' \
  'ec2-release.sh:PETCLAW_SUBSCRIPTION_ORPHANS' \
  'ec2-release.sh:PETCLAW_VERIFIED_DIR="/opt/petclaw/verified"' \
  'ec2-release.sh:exec 9<>"${PETCLAW_RELEASE_LOCK}"' \
  'ec2-release.sh:diff --no-dereference -qr' \
  'ec2-release.sh:PETCLAW_NGINX_SITE}.next-${PETCLAW_RELEASE_ID}' \
  'ec2-release.sh:| sudo tee "${PETCLAW_NGINX_RENDERED}"' \
  'ec2-release.sh:export PGDATABASE="${PETCLAW_PSQL_DATABASE_URL}"' \
  'ec2-release.sh:default_transaction_read_only=on' \
  'ec2-release.sh:previous nginx configuration could not be restored' \
  'ec2-release.sh:restored PM2 state could not be persisted' \
  'ec2-release.sh:--no-preserve=ownership' \
  'ec2-release.sh:REFERRALS_ENABLED' \
  'release-rollback-watchdog.sh:flock -w 900' \
  'release-rollback-watchdog.sh:exec 9<>"${PETCLAW_RELEASE_LOCK}"' \
  'release-rollback-watchdog.sh:stale watchdog generation refused' \
  'release-boot-guard.sh:--ensure-lock' \
  'release-boot-guard.sh:stale boot rollback intent refused' \
  'build-release-artifact.sh:--detach-sign' \
  'build-release-artifact.sh::(exclude)deploy/setup-rds.sh' \
  'verify-release-artifact.sh:PETCLAW_TRUSTED_VERIFIER' \
  'verify-release-artifact.sh:PETCLAW_VERIFIED_DIR="/opt/petclaw/verified"' \
  'backup-production.sh:exec 8<>"${PETCLAW_RELEASE_LOCK}"' \
  'backup-production.sh:PETCLAW_EXPECTED_ENV_STAT=root:ubuntu:640' \
  'pull-production-backup.sh:exec 9<>"${PETCLAW_RELEASE_LOCK}"' \
  'pull-production-backup.sh:PETCLAW_REMOTE_STAGE_ROOT=/opt/petclaw/backup-staging' \
  'pull-production-backup.sh:PETCLAW_EXPECTED_ENV_STAT=root:ubuntu:640' \
  'verify-backup-snapshot.sh:exec 8<>"${PETCLAW_VERIFY_LOCK}"' \
  'release-smoke.sh:x-petclaw-release:'; do
  PETCLAW_CONTRACT_FILE="${PETCLAW_CONTRACT%%:*}"
  PETCLAW_CONTRACT_TEXT="${PETCLAW_CONTRACT#*:}"
  if ! grep -Fq -- "${PETCLAW_CONTRACT_TEXT}" \
    "${PETCLAW_TEST_ROOT}/deploy/${PETCLAW_CONTRACT_FILE}"; then
    echo "FAIL: missing release safety contract ${PETCLAW_CONTRACT}" >&2
    exit 1
  fi
  PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"
done

if grep -Fq '/bin/bash "${PETCLAW_RELEASE_DIR}/deploy/release-rollback-watchdog.sh"' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh"; then
  echo "FAIL: mutable release watchdog is still scheduled as root" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

PETCLAW_BOOT_LOCK_LINE="$(grep -nF 'petclaw_ensure_lock' \
  "${PETCLAW_TEST_ROOT}/deploy/release-boot-guard.sh" | tail -n 1 | cut -d: -f1)"
PETCLAW_BOOT_CASE_LINE="$(grep -nF 'case "${1:-}" in' \
  "${PETCLAW_TEST_ROOT}/deploy/release-boot-guard.sh" | cut -d: -f1)"
if [[ ! "${PETCLAW_BOOT_LOCK_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_BOOT_CASE_LINE}" =~ ^[0-9]+$ \
  || "${PETCLAW_BOOT_LOCK_LINE}" -ge "${PETCLAW_BOOT_CASE_LINE}" ]]; then
  echo "FAIL: boot guard does not recreate the /run locks before intent handling" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

PETCLAW_SWITCH_ARM_LINE="$(grep -nF 'PETCLAW_SWITCH_STARTED=1' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | tail -n 1 | cut -d: -f1)"
PETCLAW_NGINX_MUTATION_LINE="$(grep -nF 'sudo install -o root -g root -m 644 "${PETCLAW_NGINX_RENDERED}"' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
if [[ ! "${PETCLAW_SWITCH_ARM_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_NGINX_MUTATION_LINE}" =~ ^[0-9]+$ \
  || "${PETCLAW_SWITCH_ARM_LINE}" -ge "${PETCLAW_NGINX_MUTATION_LINE}" ]]; then
  echo "FAIL: rollback state is not armed before nginx mutation" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

for PETCLAW_FORBIDDEN_CONTRACT in \
  'ec2-release.sh:exec 9>/opt/petclaw/.release.lock' \
  'release-rollback-watchdog.sh:exec 9>"${PETCLAW_RELEASE_LOCK}"' \
  'ec2-release.sh:PETCLAW_PSQL_ENV=(' \
  'ec2-release.sh:env -i' \
  'ec2-release.sh:PETCLAW_NGINX_RENDERED="$(mktemp)"' \
  'verify-release-artifact.sh:mktemp -d "${PETCLAW_INCOMING_DIR}/.verify-'; do
  PETCLAW_CONTRACT_FILE="${PETCLAW_FORBIDDEN_CONTRACT%%:*}"
  PETCLAW_CONTRACT_TEXT="${PETCLAW_FORBIDDEN_CONTRACT#*:}"
  if grep -Fq -- "${PETCLAW_CONTRACT_TEXT}" \
    "${PETCLAW_TEST_ROOT}/deploy/${PETCLAW_CONTRACT_FILE}"; then
    echo "FAIL: forbidden release safety contract remains ${PETCLAW_FORBIDDEN_CONTRACT}" >&2
    exit 1
  fi
  PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"
done

if grep -En \
    'exec [0-9]+>/opt/petclaw/\.(release|backup-verify)\.lock|chmod 600 /opt/petclaw/\.(release|backup-verify)\.lock' \
    "${PETCLAW_TEST_ROOT}"/deploy/*.sh >/dev/null; then
  echo "FAIL: an ubuntu-controlled/truncating legacy release lock remains" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

PETCLAW_SEAL_LINE="$(grep -nF 'sudo chown -R root:root "${PETCLAW_RELEASE_DIR}"' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | head -n 1 | cut -d: -f1)"
PETCLAW_MIGRATION_GATE_LINE="$(grep -nF '/bin/bash "${PETCLAW_TRUSTED_MIGRATION_GATE}"' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | tail -n 1 | cut -d: -f1)"
PETCLAW_MIGRATE_LINE="$(grep -nF 'npx prisma migrate deploy' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
if [[ ! "${PETCLAW_SEAL_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_MIGRATION_GATE_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_MIGRATE_LINE}" =~ ^[0-9]+$ \
  || "${PETCLAW_SEAL_LINE}" -ge "${PETCLAW_MIGRATION_GATE_LINE}" \
  || "${PETCLAW_MIGRATION_GATE_LINE}" -ge "${PETCLAW_MIGRATE_LINE}" ]]; then
  echo "FAIL: candidate is not sealed and checked after sealing before migration" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

echo "PASS release safety adversarial harness (${PETCLAW_TEST_PASSED} assertions)"

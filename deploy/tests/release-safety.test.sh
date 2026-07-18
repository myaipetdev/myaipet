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
  'ec2-release.sh:PETCLAW_REQUIRED_NODE_MAJOR=24' \
  'ec2-release.sh:PETCLAW_REQUIRED_NODE_MIN_MINOR=18' \
  'ec2-release.sh:PETCLAW_REQUIRED_NPM_VERSION="11.16.0"' \
  'ec2-release.sh:PETCLAW_REQUIRED_PM2_VERSION="6.0.14"' \
  'ec2-release.sh:PETCLAW_PM2_EFFECTIVE_ENV' \
  'ec2-release.sh:PETCLAW_PM2_EFFECTIVE_PIDFILE' \
  'ec2-release.sh:PETCLAW_PM2_EFFECTIVE_EXECSTART' \
  'ec2-release.sh:PETCLAW_PM2_EFFECTIVE_MAINPID' \
  'ec2-release.sh:PETCLAW_PM2_EXPECTED_EXECUTABLE="/usr/lib/node_modules/pm2/bin/pm2"' \
  'ec2-release.sh:PETCLAW_PM2_DAEMON_NODE' \
  'ec2-release.sh:PETCLAW_CANDIDATE_NODE' \
  'ec2-release.sh:[[ "${PETCLAW_CANDIDATE_NODE}" != "${PETCLAW_NODE_BIN}" ]]' \
  'ec2-release.sh:npm_config_engine_strict=true npm ci --ignore-scripts --no-audit --no-fund' \
  'ec2-release.sh:PETCLAW_VERIFIED_DIR="/opt/petclaw/verified"' \
  'ec2-release.sh:exec 9<>"${PETCLAW_RELEASE_LOCK}"' \
  'ec2-release.sh:diff --no-dereference -qr' \
  'ec2-release.sh:PETCLAW_NGINX_SITE}.next-${PETCLAW_RELEASE_ID}' \
  'ec2-release.sh:| sudo tee "${PETCLAW_NGINX_RENDERED}"' \
  'ec2-release.sh:export PGHOST="${PETCLAW_PSQL_HOST}"' \
  'ec2-release.sh:export PGPORT="${PETCLAW_PSQL_PORT}"' \
  'ec2-release.sh:export PGUSER="${PETCLAW_PSQL_USER}"' \
  'ec2-release.sh:export PGPASSWORD="${PETCLAW_PSQL_PASSWORD}"' \
  'ec2-release.sh:export PGDATABASE="${PETCLAW_PSQL_DATABASE}"' \
  'ec2-release.sh:export PGSSLMODE="${PETCLAW_PSQL_SSLMODE}"' \
  'ec2-release.sh:default_transaction_read_only=on' \
  'ec2-release.sh:PETCLAW_PSQL_COMMAND="$(type -P psql' \
  'ec2-release.sh:PETCLAW_PSQL_COMMAND}" != "/usr/bin/psql"' \
  'ec2-release.sh:exec "${PETCLAW_PSQL_COMMAND}" "$@"' \
  'ec2-release.sh:previous nginx configuration could not be restored' \
  'ec2-release.sh:restored PM2 state could not be persisted' \
  'ec2-release.sh:--no-preserve=ownership' \
  'ec2-release.sh:chmod u+rw,go+rX,go-w' \
  'ec2-release.sh:PETCLAW_PRISMA_CLI' \
  'ec2-release.sh:! -perm -004' \
  'ec2-release.sh:REFERRALS_ENABLED' \
  'ec2-release.sh:/bin/bash "${PETCLAW_RELEASE_SOURCE}/deploy/release-smoke.sh"' \
  'ec2-release.sh:"${PETCLAW_RELEASE_SOURCE}/deploy/release-boot-guard.sh"' \
  'ec2-release.sh:"${PETCLAW_RELEASE_SOURCE}/deploy/petclaw-release-boot-guard.service"' \
  'ec2-release.sh:"${PETCLAW_RELEASE_SOURCE}/deploy/release-rollback-watchdog.sh"' \
  'ec2-release.sh:"${PETCLAW_RELEASE_SOURCE}/deploy/petclaw-logrotate.conf"' \
  'release-rollback-watchdog.sh:flock -w 900' \
  'release-rollback-watchdog.sh:exec 9<>"${PETCLAW_RELEASE_LOCK}"' \
  'release-rollback-watchdog.sh:stale watchdog generation refused' \
  'release-boot-guard.sh:--ensure-lock' \
  'release-boot-guard.sh:stale boot rollback intent refused' \
  'build-release-artifact.sh:--detach-sign' \
  'build-release-artifact.sh:PETCLAW_REQUIRED_NODE_MIN_MINOR=18' \
  'build-release-artifact.sh:npm_config_engine_strict=true' \
  'build-release-artifact.sh:npm ci --dry-run --ignore-scripts --no-audit --no-fund' \
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

PETCLAW_HEADER_FUNCTION="${PETCLAW_TEST_TMP}/release-header-function.sh"
awk '/^petclaw_exact_release_header\(\) \{/{copy=1} copy{print} copy && /^\}$/{exit}' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" > "${PETCLAW_HEADER_FUNCTION}"
# shellcheck source=/dev/null
source "${PETCLAW_HEADER_FUNCTION}"
PETCLAW_EXPECTED_RELEASE_ID=20260718T184721-synthetic
printf '%s\r\n' \
  'HTTP/1.1 200 OK' \
  'X-Petclaw-Release: 20260718T184721-synthetic' \
  > "${PETCLAW_TEST_TMP}/release-headers"
if ! petclaw_exact_release_header "${PETCLAW_TEST_TMP}/release-headers"; then
  echo "FAIL: exact release identity header is rejected" >&2
  exit 1
fi
printf '%s\r\n' \
  'X-Petclaw-Release: 20260718T184721-synthetic' \
  >> "${PETCLAW_TEST_TMP}/release-headers"
if petclaw_exact_release_header "${PETCLAW_TEST_TMP}/release-headers"; then
  echo "FAIL: duplicate release identity headers are accepted" >&2
  exit 1
fi
printf '%s\r\n' \
  'HTTP/1.1 200 OK' \
  'X-Petclaw-Release: wrong-generation' \
  > "${PETCLAW_TEST_TMP}/release-headers"
if petclaw_exact_release_header "${PETCLAW_TEST_TMP}/release-headers"; then
  echo "FAIL: wrong release identity header is accepted" >&2
  exit 1
fi
printf '%s\r\n' \
  'HTTP/1.1 200 OK' \
  'X-Petclaw-Release: 20260718T184721-synthetic' \
  'X-Petclaw-Release: wrong-generation' \
  > "${PETCLAW_TEST_TMP}/release-headers"
if petclaw_exact_release_header "${PETCLAW_TEST_TMP}/release-headers"; then
  echo "FAIL: mixed exact and wrong release identity headers are accepted" >&2
  exit 1
fi
printf '%s\r\n' \
  'HTTP/1.1 200 OK' \
  'X-Petclaw-Release: 20260718T184721-synthetic trailing-data' \
  > "${PETCLAW_TEST_TMP}/release-headers"
if petclaw_exact_release_header "${PETCLAW_TEST_TMP}/release-headers"; then
  echo "FAIL: release identity with trailing data is accepted" >&2
  exit 1
fi
if ! grep -Fq 'for PETCLAW_IDENTITY_ATTEMPT in {1..20}; do' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh"; then
  echo "FAIL: release identity does not tolerate asynchronous nginx worker retirement" >&2
  exit 1
fi
if ! grep -Fq -- "--noproxy '*'" "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" \
  || ! grep -Fq -- "-H 'Connection: close'" \
    "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" \
  || [[ "$(grep -Fc 'curl --disable' "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh")" -lt 3 ]]; then
  echo "FAIL: local release identity probe can be reused or diverted through a proxy" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 7))"

PETCLAW_LANDING_FUNCTION="${PETCLAW_TEST_TMP}/landing-body-function.sh"
awk '/^petclaw_verify_landing_body\(\) \{/{copy=1} copy{print} copy && /^\}$/{exit}' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" > "${PETCLAW_LANDING_FUNCTION}"
# shellcheck source=/dev/null
source "${PETCLAW_LANDING_FUNCTION}"
if ! {
  printf '%s' '/api/petclaw/demo-chat'
  awk 'BEGIN { for (i = 0; i < 200000; i += 1) printf "x" }'
} | petclaw_verify_landing_body; then
  echo "FAIL: landing verifier cannot stream a body above Linux single-argument limits" >&2
  exit 1
fi
if printf '%s' '/api/petclaw/demo-chat Hangul: 한' | petclaw_verify_landing_body; then
  echo "FAIL: streaming landing verifier accepts Hangul" >&2
  exit 1
fi
if printf '%s' 'English landing without the demo endpoint' | petclaw_verify_landing_body; then
  echo "FAIL: streaming landing verifier accepts a missing demo endpoint" >&2
  exit 1
fi
if grep -Fq '"${LANDING_BODY}"' "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh"; then
  echo "FAIL: landing smoke still passes the full HTML body through argv" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 4))"

if grep -Fq '/bin/bash "${PETCLAW_RELEASE_DIR}/deploy/release-rollback-watchdog.sh"' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh"; then
  echo "FAIL: mutable release watchdog is still scheduled as root" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

if grep -Fq '|| "${PETCLAW_CANDIDATE_NODE}" != "${PETCLAW_NODE_BIN}"' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh"; then
  echo "FAIL: candidate Node identity comparison can execute the Node binary as a shell command" >&2
  exit 1
fi
if grep -Fq '"${PETCLAW_RELEASE_DIR}/deploy/release-smoke.sh"; then' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh"; then
  echo "FAIL: sealed candidate smoke still relies on an executable bit" >&2
  exit 1
fi
for PETCLAW_ROOT_INSTALL_INPUT in \
  release-boot-guard.sh \
  petclaw-release-boot-guard.service \
  release-rollback-watchdog.sh \
  petclaw-logrotate.conf; do
  if grep -Fq '"${PETCLAW_RELEASE_DIR}/deploy/'"${PETCLAW_ROOT_INSTALL_INPUT}"'"' \
    "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh"; then
    echo "FAIL: root install still trusts build-writable candidate input ${PETCLAW_ROOT_INSTALL_INPUT}" >&2
    exit 1
  fi
done
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 6))"

PETCLAW_RUNTIME_MODE_LINE="$(grep -nF 'chmod u+rw,go+rX,go-w' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
PETCLAW_RUNTIME_OWNER_LINE="$(grep -nF 'sudo chown -R root:root "${PETCLAW_RELEASE_DIR}"' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | head -n 1 | cut -d: -f1)"
PETCLAW_RUNTIME_READ_LINE="$(grep -nF 'PETCLAW_PRISMA_CLI="$(realpath -e' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
PETCLAW_DOTENV_PARSE_LINE="$(grep -nF 'const dotenv = require("dotenv");' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
if [[ ! "${PETCLAW_RUNTIME_MODE_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_RUNTIME_OWNER_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_RUNTIME_READ_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_DOTENV_PARSE_LINE}" =~ ^[0-9]+$ \
  || "${PETCLAW_RUNTIME_OWNER_LINE}" -ge "${PETCLAW_RUNTIME_MODE_LINE}" \
  || "${PETCLAW_RUNTIME_MODE_LINE}" -ge "${PETCLAW_RUNTIME_READ_LINE}" \
  || "${PETCLAW_RUNTIME_READ_LINE}" -ge "${PETCLAW_DOTENV_PARSE_LINE}" ]]; then
  echo "FAIL: sealed candidate is not normalized and checked before runtime dotenv parsing" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

for PETCLAW_RUNTIME_POLICY_SCRIPT in ec2-release.sh build-release-artifact.sh; do
  PETCLAW_RUNTIME_POLICY_FILE="${PETCLAW_TEST_TMP}/${PETCLAW_RUNTIME_POLICY_SCRIPT}.runtime-policy"
  awk '/^petclaw_runtime_versions_supported\(\) \{/{copy=1} copy{print} copy && /^\}$/{exit}' \
    "${PETCLAW_TEST_ROOT}/deploy/${PETCLAW_RUNTIME_POLICY_SCRIPT}" \
    > "${PETCLAW_RUNTIME_POLICY_FILE}"
  PETCLAW_REQUIRED_NODE_MAJOR=24
  PETCLAW_REQUIRED_NODE_MIN_MINOR=18
  PETCLAW_REQUIRED_NPM_VERSION="11.16.0"
  # shellcheck source=/dev/null
  source "${PETCLAW_RUNTIME_POLICY_FILE}"
  if ! petclaw_runtime_versions_supported v24.18.0 11.16.0 \
    || ! petclaw_runtime_versions_supported v24.99.4 11.16.0; then
    echo "FAIL: ${PETCLAW_RUNTIME_POLICY_SCRIPT} rejects a supported pinned runtime" >&2
    exit 1
  fi
  for PETCLAW_BAD_RUNTIME in \
    'v24.17.9|11.16.0' \
    'v25.0.0|11.16.0' \
    'v24.18.0|11.15.9' \
    'v24.18.0|11.16.1' \
    'v24.18.0|12.0.0' \
    'v24.18.0-rc.1|11.16.0' \
    'v024.18.0|11.16.0'; do
    if petclaw_runtime_versions_supported \
      "${PETCLAW_BAD_RUNTIME%%|*}" "${PETCLAW_BAD_RUNTIME#*|}"; then
      echo "FAIL: ${PETCLAW_RUNTIME_POLICY_SCRIPT} accepts unsupported runtime ${PETCLAW_BAD_RUNTIME}" >&2
      exit 1
    fi
  done
  PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 9))"
done

if ! node -e '
  const fs = require("node:fs");
  const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const lock = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const root = lock.packages?.[""];
  if (JSON.stringify(pkg.engines) !== JSON.stringify(root?.engines)) process.exit(1);
  if (pkg.packageManager !== "npm@11.16.0") process.exit(1);
  if (pkg.devDependencies?.["@types/node"] !== "^24") process.exit(1);
  if (root?.devDependencies?.["@types/node"] !== "^24") process.exit(1);
' "${PETCLAW_TEST_ROOT}/web/package.json" "${PETCLAW_TEST_ROOT}/web/package-lock.json"; then
  echo "FAIL: package runtime policy is not mirrored exactly in the lockfile" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

PETCLAW_RUNTIME_GATE_LINE="$(grep -nF 'PETCLAW_NODE_VERSION="$("${PETCLAW_NODE_BIN}" --version' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
PETCLAW_PREFLIGHT_EXIT_LINE="$(grep -nF 'if [[ "${PETCLAW_RELEASE_PREFLIGHT_ONLY}" == "1" ]]' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
if [[ ! "${PETCLAW_RUNTIME_GATE_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_PREFLIGHT_EXIT_LINE}" =~ ^[0-9]+$ \
  || "${PETCLAW_RUNTIME_GATE_LINE}" -ge "${PETCLAW_PREFLIGHT_EXIT_LINE}" ]]; then
  echo "FAIL: production runtime gate does not precede preflight-only success" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

PETCLAW_CLEAN_INSTALL_LINE="$(grep -nF 'npm ci --dry-run --ignore-scripts --no-audit --no-fund' \
  "${PETCLAW_TEST_ROOT}/deploy/build-release-artifact.sh" | cut -d: -f1)"
PETCLAW_ARTIFACT_WRITE_LINE="$(grep -nF 'gzip -n -c "${PETCLAW_STAGE}/release.tar"' \
  "${PETCLAW_TEST_ROOT}/deploy/build-release-artifact.sh" | cut -d: -f1)"
if [[ ! "${PETCLAW_CLEAN_INSTALL_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_ARTIFACT_WRITE_LINE}" =~ ^[0-9]+$ \
  || "${PETCLAW_CLEAN_INSTALL_LINE}" -ge "${PETCLAW_ARTIFACT_WRITE_LINE}" ]]; then
  echo "FAIL: committed clean-install validation does not precede artifact creation" >&2
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
  'ec2-release.sh:export PGDATABASE="${PETCLAW_PSQL_DATABASE_URL}"' \
  'ec2-release.sh:exec "${PETCLAW_PSQL_BIN}" "$@"' \
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

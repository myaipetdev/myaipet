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

petclaw_mode() {
  local PETCLAW_MODE_VALUE
  if PETCLAW_MODE_VALUE="$(stat -c '%a' "$1" 2>/dev/null)"; then
    printf '%s' "${PETCLAW_MODE_VALUE}"
  else
    stat -f '%OLp' "$1"
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
  "${PETCLAW_FIXTURE}/web/prisma/migrations/20260615000000_memory_fts" \
  "${PETCLAW_FIXTURE}/web/prisma/baseline" \
  "${PETCLAW_FIXTURE}/deploy"
printf '%s\n' 'CREATE TABLE "safe_table" ("id" INTEGER PRIMARY KEY);' \
  > "${PETCLAW_FIXTURE}/web/prisma/migrations/20260101000000_safe/migration.sql"
printf '%s\n' 'ALTER TABLE "pet_memories" ADD COLUMN "content_tsv" tsvector;' \
  > "${PETCLAW_FIXTURE}/web/prisma/migrations/20260615000000_memory_fts/migration.sql"
printf '%s\n' '20260615000000_memory_fts' \
  > "${PETCLAW_FIXTURE}/web/prisma/baseline/20260717_migrations.txt"
printf '%s\n' \
  '    "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('\''simple'\''::regconfig, COALESCE("content", '\'''\''::text))) STORED,' \
  'CREATE INDEX "pet_memories_content_tsv_idx" ON "pet_memories" USING GIN ("content_tsv");' \
  'CREATE INDEX "pet_memories_pet_id_created_at_idx" ON "pet_memories"("pet_id", "created_at" DESC);' \
  > "${PETCLAW_FIXTURE}/web/prisma/baseline/20260717_production.sql"
printf '%s\n' \
  '  @@index([content_tsv], type: Gin)' \
  '  @@index([pet_id, created_at(sort: Desc)])' \
  > "${PETCLAW_FIXTURE}/web/prisma/schema.prisma"
printf '%s\n' '# sha256|repository-relative migration path|operator-reviewed reason' \
  > "${PETCLAW_FIXTURE}/deploy/destructive-migrations.allowlist"
petclaw_expect_success "safe migration passes" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/check-release-migrations.sh" "${PETCLAW_FIXTURE}"
cp "${PETCLAW_FIXTURE}/web/prisma/baseline/20260717_production.sql" \
  "${PETCLAW_FIXTURE}/web/prisma/baseline/20260717_production.sql.good"
printf '%s\n' \
  '    "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('\''simple'\''::regconfig, COALESCE("content", '\'''\''::text))) STORED,' \
  'CREATE INDEX "pet_memories_content_tsv_idx" ON "pet_memories" USING GIN ("content_tsv");' \
  > "${PETCLAW_FIXTURE}/web/prisma/baseline/20260717_production.sql"
petclaw_expect_failure "falsely resolved baseline object fails" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/check-release-migrations.sh" "${PETCLAW_FIXTURE}"
mv "${PETCLAW_FIXTURE}/web/prisma/baseline/20260717_production.sql.good" \
  "${PETCLAW_FIXTURE}/web/prisma/baseline/20260717_production.sql"

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
mkdir -p "${PETCLAW_FIXTURE}/web/prisma/migrations/20260102500000_update_backfill"
printf '%s\n' 'UPDATE "safe_table" SET "id" = "id" WHERE "id" < 0;' \
  > "${PETCLAW_FIXTURE}/web/prisma/migrations/20260102500000_update_backfill/migration.sql"
petclaw_expect_failure "unapproved release-path UPDATE fails" /bin/bash \
  "${PETCLAW_TEST_ROOT}/deploy/check-release-migrations.sh" "${PETCLAW_FIXTURE}"
PETCLAW_UPDATE_SHA="$(petclaw_sha256 \
  "${PETCLAW_FIXTURE}/web/prisma/migrations/20260102500000_update_backfill/migration.sql")"
printf '%s|%s|%s\n' "${PETCLAW_UPDATE_SHA}" \
  'web/prisma/migrations/20260102500000_update_backfill/migration.sql' \
  'fixture data-mutation approval' \
  >> "${PETCLAW_FIXTURE}/deploy/destructive-migrations.allowlist"
petclaw_expect_success "exact release-path UPDATE checksum passes" /bin/bash \
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

PETCLAW_LANGUAGE_FIXTURE="${PETCLAW_TEST_TMP}/language-release"
mkdir -p "${PETCLAW_LANGUAGE_FIXTURE}/landing-assets" \
  "${PETCLAW_LANGUAGE_FIXTURE}/web/src" \
  "${PETCLAW_LANGUAGE_FIXTURE}/web/public"
printf '%s\n' '<html lang="en">English landing</html>' \
  > "${PETCLAW_LANGUAGE_FIXTURE}/landing-assets/index.html"
printf '%s\n' 'export const greeting = "hello";' \
  > "${PETCLAW_LANGUAGE_FIXTURE}/web/src/greeting.ts"
printf '%s\n' 'English public documentation' \
  > "${PETCLAW_LANGUAGE_FIXTURE}/web/public/readme.txt"
# This real JPEG contains byte sequences that lossy UTF-8 decoding can mistake
# for a Hangul code point. Binary media must not create a false deployment stop.
cp "${PETCLAW_TEST_ROOT}/landing-assets/hero-mascot.jpg" \
  "${PETCLAW_LANGUAGE_FIXTURE}/landing-assets/hero-mascot.jpg"
petclaw_expect_success "English source and binary media pass language scan" \
  node "${PETCLAW_TEST_ROOT}/deploy/scan-release-language.mjs" \
    source "${PETCLAW_LANGUAGE_FIXTURE}"
node -e 'require("node:fs").writeFileSync(process.argv[1], "\uAC00")' \
  "${PETCLAW_LANGUAGE_FIXTURE}/web/src/hangul.ts"
petclaw_expect_failure "Hangul syllable in app source fails language scan" \
  node "${PETCLAW_TEST_ROOT}/deploy/scan-release-language.mjs" \
    source "${PETCLAW_LANGUAGE_FIXTURE}"
rm -f "${PETCLAW_LANGUAGE_FIXTURE}/web/src/hangul.ts"
node -e 'require("node:fs").writeFileSync(process.argv[1], "\u1100")' \
  "${PETCLAW_LANGUAGE_FIXTURE}/web/public/jamo.txt"
petclaw_expect_failure "Hangul Jamo in public text fails language scan" \
  node "${PETCLAW_TEST_ROOT}/deploy/scan-release-language.mjs" \
    source "${PETCLAW_LANGUAGE_FIXTURE}"
rm -f "${PETCLAW_LANGUAGE_FIXTURE}/web/public/jamo.txt"
mkdir -p "${PETCLAW_TEST_TMP}/language-zip"
node -e 'require("node:fs").writeFileSync(process.argv[1], "archive \uD7B0")' \
  "${PETCLAW_TEST_TMP}/language-zip/content.txt"
(cd "${PETCLAW_TEST_TMP}/language-zip" \
  && zip -q "${PETCLAW_LANGUAGE_FIXTURE}/web/public/language.zip" content.txt)
petclaw_expect_failure "Hangul Jamo inside public ZIP fails language scan" \
  node "${PETCLAW_TEST_ROOT}/deploy/scan-release-language.mjs" \
    source "${PETCLAW_LANGUAGE_FIXTURE}"
rm -f "${PETCLAW_LANGUAGE_FIXTURE}/web/public/language.zip"
petclaw_expect_failure "missing build trees fail built language scan" \
  node "${PETCLAW_TEST_ROOT}/deploy/scan-release-language.mjs" \
    built "${PETCLAW_LANGUAGE_FIXTURE}"
mkdir -p "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/static" \
  "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/server" \
  "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/standalone"
printf '%s\n' 'console.log("English static bundle")' \
  > "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/static/app.js"
printf '%s\n' 'module.exports = "English server bundle";' \
  > "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/server/app.js"
printf '%s\n' 'require("./server/app.js")' \
  > "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/standalone/server.js"
petclaw_expect_success "English source, static, and server bundles pass language scan" \
  node "${PETCLAW_TEST_ROOT}/deploy/scan-release-language.mjs" \
    built "${PETCLAW_LANGUAGE_FIXTURE}"
node -e 'require("node:fs").writeFileSync(process.argv[1], "\u3131")' \
  "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/static/bad.js"
petclaw_expect_failure "compatibility Jamo in static bundle fails language scan" \
  node "${PETCLAW_TEST_ROOT}/deploy/scan-release-language.mjs" \
    built "${PETCLAW_LANGUAGE_FIXTURE}"
rm -f "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/static/bad.js"
node -e 'require("node:fs").writeFileSync(process.argv[1], "\uA960")' \
  "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/server/bad.js"
petclaw_expect_failure "extended Jamo in server bundle fails language scan" \
  node "${PETCLAW_TEST_ROOT}/deploy/scan-release-language.mjs" \
    built "${PETCLAW_LANGUAGE_FIXTURE}"
rm -f "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/server/bad.js"
mkdir -p "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/standalone/node_modules/example" \
  "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/standalone/.next/node_modules"
printf '%s\n' 'module.exports = "English package";' \
  > "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/standalone/node_modules/example/index.js"
ln -s ../../node_modules/example \
  "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/standalone/.next/node_modules/example-build-id"
petclaw_expect_success "in-artifact Next.js package symlink passes language scan" \
  node "${PETCLAW_TEST_ROOT}/deploy/scan-release-language.mjs" \
    built "${PETCLAW_LANGUAGE_FIXTURE}"
rm -f "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/standalone/.next/node_modules/example-build-id"
mkdir -p "${PETCLAW_TEST_TMP}/outside-standalone"
printf '%s\n' 'outside' > "${PETCLAW_TEST_TMP}/outside-standalone/file.txt"
ln -s "${PETCLAW_TEST_TMP}/outside-standalone" \
  "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/standalone/.next/node_modules/escape"
petclaw_expect_failure "standalone symlink escape fails language scan" \
  node "${PETCLAW_TEST_ROOT}/deploy/scan-release-language.mjs" \
    built "${PETCLAW_LANGUAGE_FIXTURE}"
rm -f "${PETCLAW_LANGUAGE_FIXTURE}/web/.next/standalone/.next/node_modules/escape"

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
  "${PETCLAW_TEST_ROOT}/deploy/install-crontab.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/ratelimit-guard.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/server-ops/archive-logs.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/server-ops/db-backup.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/server-ops/health-monitor.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/server-ops/hourly-digest.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/server-ops/llm-cost-watch.sh" \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh"

petclaw_expect_success "crontab merge installer rejects loss and converges" \
  /bin/bash "${PETCLAW_TEST_ROOT}/deploy/tests/crontab-installer.test.sh"

petclaw_expect_success "production crontab metadata accepts root crontab-group setgid binary" \
  node - "${PETCLAW_TEST_ROOT}/deploy/install-crontab.sh" <<'NODE'
const fs = require("node:fs");
const source = fs.readFileSync(process.argv[2], "utf8");
if (!source.includes(`stat -c '%U' "\${CRONTAB_CMD}"`)
  || !source.includes(`(8#\${CRONTAB_MODE} & 8#022) != 0`)
  || source.includes(`stat -c '%U:%G' "\${CRONTAB_CMD}"`)) {
  process.exit(1);
}
NODE

petclaw_expect_success "database URL parser boundaries pass" \
  node "${PETCLAW_TEST_ROOT}/deploy/tests/database-url-parser.test.mjs"

petclaw_expect_success "UI, release-readiness, and community fallback contracts run before build, migration, and traffic switch" \
  node - "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" <<'NODE'
const fs = require("node:fs");
const source = fs.readFileSync(process.argv[2], "utf8");
const ordered = [
  "npm_config_engine_strict=true npm ci --ignore-scripts --no-audit --no-fund",
  "npx prisma generate",
  "npm run test:ui-contract",
  "npm run test:release-readiness",
  "npm run test:community-fallback",
  "npm run build",
  "npx prisma migrate deploy",
  'sudo install -o root -g root -m 644 "${PETCLAW_NGINX_RENDERED}" "${PETCLAW_NGINX_SITE}"',
].map((needle) => source.indexOf(needle));
if (ordered.some((index) => index < 0)
  || ordered.some((index, position) => position > 0 && index <= ordered[position - 1])) {
  process.exit(1);
}
NODE

petclaw_expect_success "cron preservation is dry-run gated and committed before release completion" \
  node - "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" <<'NODE'
const fs = require("node:fs");
const source = fs.readFileSync(process.argv[2], "utf8");
const installerCall = '/bin/bash "${PETCLAW_RELEASE_SOURCE}/deploy/install-crontab.sh"';
const dry = source.indexOf(installerCall);
const preflightExit = source.indexOf('if [[ "${PETCLAW_RELEASE_PREFLIGHT_ONLY}" == "1" ]]');
const smoke = source.indexOf('/bin/bash "${PETCLAW_RELEASE_SOURCE}/deploy/release-smoke.sh"');
const live = source.indexOf(installerCall, dry + installerCall.length);
const committed = source.indexOf('"${PETCLAW_RELEASE_DIR}/RELEASE_COMMITTED"');
if (dry < 0 || !source.slice(dry, preflightExit).includes("--dry-run >/dev/null")
  || preflightExit < dry
  || smoke < preflightExit || live < smoke || committed < live) {
  process.exit(1);
}
NODE

petclaw_expect_success "runtime release gates survive the production artifact test exclusion" \
  node - "${PETCLAW_TEST_ROOT}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(path.join(root, "web/package.json"), "utf8"));
for (const name of [
  "test:ui-contract",
  "test:release-readiness",
  "test:community-fallback",
  "verify:artifact",
  "test:llm-router-live",
]) {
  const script = pkg.scripts[name];
  const match = script?.match(/scripts\/([^\s]+)/);
  if (!match || match[1].includes(".test.")
    || !fs.existsSync(path.join(root, "web/scripts", match[1]))) {
    process.exit(1);
  }
}
NODE

petclaw_expect_success "nginx frame, cache, language, and release-header trust boundaries pass" \
  node - "${PETCLAW_TEST_ROOT}/deploy/nginx-petclaw.conf.template" <<'NODE'
const fs = require("node:fs");
const source = fs.readFileSync(process.argv[2], "utf8");
const locationBlocks = [...source.matchAll(/location\s+(?:=\s+\/product-demo\.html|\/_next\/static\/|\/uploads\/|\/api\/|\/)\s*\{([^{}]*)\}/g)]
  .map((match) => ({ declaration: match[0].slice(0, match[0].indexOf("{")).trim(), body: match[1] }));
const demo = locationBlocks.filter(({ declaration }) => declaration === "location = /product-demo.html");
const staticAssets = locationBlocks.filter(({ declaration }) => declaration === "location /_next/static/");
const api = locationBlocks.filter(({ declaration }) => declaration === "location /api/");
const proxied = locationBlocks.filter(({ body }) => body.includes("proxy_pass "));
const exactBlock = (uri) => [...source.matchAll(new RegExp(`location\\s+=\\s+${uri}\\s*\\{([^{}]*)\\}`, "g"))]
  .map((match) => match[1]);
const prefixBlock = (uri) => [...source.matchAll(new RegExp(`location\\s+${uri}\\s*\\{([^{}]*)\\}`, "g"))]
  .map((match) => match[1]);
const compatLanding = exactBlock("\\/landing\\/");
const compatIndex = exactBlock("\\/landing\\/index\\.html");
const compatDemo = exactBlock("\\/landing\\/product-demo\\.html");
const compatMedia = prefixBlock("\\/landing\\/");
const marketingStart = source.indexOf("server_name myaipet.ai www.myaipet.ai;");
const appStart = source.indexOf("server_name app.myaipet.ai;");
const marketing = source.slice(marketingStart, appStart);
const exactDemoContracts = [
  'alias __CURRENT_ROOT__/landing-assets/product-demo.html;',
  'add_header X-Petclaw-Release "__RELEASE_ID__" always;',
  'add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;',
  'add_header X-Content-Type-Options "nosniff" always;',
  'add_header X-Frame-Options "SAMEORIGIN" always;',
  'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
  'add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;',
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
];
const count = (needle) => source.split(needle).length - 1;
if (demo.length !== 1 || exactDemoContracts.some((needle) => !demo[0].body.includes(needle))) process.exit(1);
if (count('add_header X-Frame-Options "DENY" always;') !== 1
  || count('add_header X-Frame-Options "SAMEORIGIN" always;') !== 1
  || count("frame-ancestors 'none'") !== 1
  || count("frame-ancestors 'self'") !== 1) process.exit(1);
if (proxied.length !== 3
  || proxied.some(({ body }) => countIn(body, 'proxy_hide_header X-Petclaw-Release;') !== 1)) process.exit(1);
if (api.length !== 1
  || countIn(api[0].body, "limit_req zone=abuse burst=15 nodelay;") !== 1
  || countIn(api[0].body, "proxy_pass http://127.0.0.1:__APP_PORT__;") !== 1
  || count("limit_req_zone ") !== 0) process.exit(1);
if (staticAssets.length !== 1
  || countIn(staticAssets[0].body, 'add_header X-Petclaw-Release "__RELEASE_ID__" always;') !== 1
  || marketingStart < 0 || appStart <= marketingStart
  || countIn(marketing, 'add_header X-Petclaw-Release "__RELEASE_ID__" always;') !== 2
  || count('add_header X-Petclaw-Release "__RELEASE_ID__" always;') !== 4) process.exit(1);
if (compatLanding.length !== 1
  || !compatLanding[0].includes("alias __CURRENT_ROOT__/landing-assets/;")
  || !compatLanding[0].includes("index index.html;")
  || !compatLanding[0].includes("expires -1;")
  || compatLanding[0].includes("landing-assets/index.html")) process.exit(1);
if (compatIndex.length !== 1
  || !compatIndex[0].includes("alias __CURRENT_ROOT__/landing-assets/index.html;")
  || !compatIndex[0].includes("expires -1;")) process.exit(1);
if (compatDemo.length !== 1
  || !compatDemo[0].includes("alias __CURRENT_ROOT__/landing-assets/product-demo.html;")
  || !compatDemo[0].includes("expires -1;")) process.exit(1);
if (compatMedia.length !== 1
  || !compatMedia[0].includes("alias __CURRENT_ROOT__/landing-assets/;")
  || !compatMedia[0].includes("expires 7d;")) process.exit(1);
if (!source.includes("map $sent_http_content_type $petclaw_content_language")
  || count("add_header Content-Language $petclaw_content_language always;") !== 3) process.exit(1);
function countIn(haystack, needle) {
  return haystack.split(needle).length - 1;
}
NODE

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
  'ec2-release.sh:PETCLAW_NGINX_RATE_LIMIT_CONF="/etc/nginx/conf.d/ratelimit.conf"' \
  'ec2-release.sh:PETCLAW_EXPECTED_RATE_LIMIT_ACTIVE=' \
  'ec2-release.sh:${PETCLAW_RELEASE_SOURCE}/deploy/nginx-conf.d-ratelimit.conf' \
  'ec2-release.sh:${PETCLAW_RELEASE_SOURCE}/deploy/install-crontab.sh' \
  'ec2-release.sh:--dry-run >/dev/null' \
  'ec2-release.sh:export PGHOST="${PETCLAW_PSQL_HOST}"' \
  'ec2-release.sh:export PGPORT="${PETCLAW_PSQL_PORT}"' \
  'ec2-release.sh:export PGUSER="${PETCLAW_PSQL_USER}"' \
  'ec2-release.sh:export PGPASSWORD="${PETCLAW_PSQL_PASSWORD}"' \
  'ec2-release.sh:export PGDATABASE="${PETCLAW_PSQL_DATABASE}"' \
  'ec2-release.sh:export PGSSLMODE="${PETCLAW_PSQL_SSLMODE}"' \
  'ec2-release.sh:default_transaction_read_only=on' \
  'ec2-release.sh:PETCLAW_PSQL_COMMAND="$(type -P psql' \
  'ec2-release.sh:${PETCLAW_RELEASE_SOURCE}/deploy/parse-database-url.mjs' \
  'ec2-release.sh:PETCLAW_PSQL_COMMAND}" != "/usr/bin/psql"' \
  'ec2-release.sh:exec "${PETCLAW_PSQL_COMMAND}" "$@"' \
  'ec2-release.sh:previous nginx configuration could not be restored' \
  'ec2-release.sh:restored PM2 state could not be persisted' \
  'ec2-release.sh:--no-preserve=ownership' \
  'ec2-release.sh:petclaw_seal_release_tree "${PETCLAW_RELEASE_DIR}" "${PETCLAW_WEB}"' \
  'ec2-release.sh:sudo chown -R root:ubuntu "${PETCLAW_SEAL_RELEASE_DIR}"' \
  'ec2-release.sh:PETCLAW_PRISMA_CLI' \
  'ec2-release.sh:! -perm -040' \
  'ec2-release.sh:-perm /007' \
  'ec2-release.sh:REFERRALS_ENABLED' \
  'ec2-release.sh:petclaw_require_launch_assignment_absent' \
  'ec2-release.sh:NEXT_PUBLIC_SEASON1_START_MS' \
  'ec2-release.sh:NEXT_PUBLIC_SEASON1_END_MS' \
  'ec2-release.sh:npm run test:ui-contract' \
  'ec2-release.sh:npm run test:release-readiness' \
  'ec2-release.sh:npm run test:community-fallback' \
  'ec2-release.sh:node "${PETCLAW_RELEASE_SOURCE}/deploy/scan-release-language.mjs"' \
  'ec2-release.sh:/bin/bash "${PETCLAW_RELEASE_SOURCE}/deploy/release-smoke.sh"' \
  'ec2-release.sh:"${PETCLAW_RELEASE_SOURCE}/deploy/release-boot-guard.sh"' \
  'ec2-release.sh:"${PETCLAW_RELEASE_SOURCE}/deploy/petclaw-release-boot-guard.service"' \
  'ec2-release.sh:"${PETCLAW_RELEASE_SOURCE}/deploy/release-rollback-watchdog.sh"' \
  'ec2-release.sh:"${PETCLAW_RELEASE_SOURCE}/deploy/petclaw-logrotate.conf"' \
  'ec2-release.sh:petclaw_harden_pm2_logs' \
  'ec2-release.sh:-perm /077' \
  'release-rollback-watchdog.sh:flock -w 900' \
  'release-rollback-watchdog.sh:exec 9<>"${PETCLAW_RELEASE_LOCK}"' \
  'release-rollback-watchdog.sh:stale watchdog generation refused' \
  'release-smoke.sh:expect_env_exact PAYMENTS_ENABLED false' \
  'release-smoke.sh:expect_env_exact OAUTH_CONNECTIONS_ENABLED false' \
  'release-smoke.sh:expect_env_exact AGENT_CHANNELS_ENABLED false' \
  'release-smoke.sh:expect_env_exact PET_LORA_ENABLED false' \
  'release-smoke.sh:expect_env_exact BLOCKCHAIN_ENABLED false' \
  'release-smoke.sh:PETCLAW_EXPECTED_EXTENSION_VERSION="2.4.1"' \
  'release-smoke.sh:built "${PETCLAW_RELEASE_ROOT}"' \
  'release-smoke.sh:petclaw_verify_release_source_contracts' \
  'release-smoke.sh:expect_code 200 GET "/account"' \
  'release-smoke.sh:expect_code 200 GET "/studio"' \
  'release-smoke.sh:expect_code 404 GET "/stats"' \
  'release-smoke.sh:expect_code 401 PATCH "/api/catch/1"' \
  'release-boot-guard.sh:--ensure-lock' \
  'release-boot-guard.sh:stale boot rollback intent refused' \
  'build-release-artifact.sh:--detach-sign' \
  'build-release-artifact.sh:PETCLAW_REQUIRED_NODE_MIN_MINOR=18' \
  'build-release-artifact.sh:npm_config_engine_strict=true' \
  'build-release-artifact.sh:npm ci --dry-run --ignore-scripts --no-audit --no-fund' \
  'build-release-artifact.sh:source "${PETCLAW_STAGE}/tree"' \
  'build-release-artifact.sh::(exclude)deploy/setup-rds.sh' \
  'build-release-artifact.sh:deploy/install-crontab.sh' \
  'build-release-artifact.sh:deploy/tests/crontab-installer.test.sh' \
  'build-release-artifact.sh:deploy/nginx-conf.d-ratelimit.conf' \
  'build-release-artifact.sh:deploy/ratelimit-guard.sh' \
  'build-release-artifact.sh:deploy/server-ops/db-backup.sh' \
  'verify-release-artifact.sh:PETCLAW_TRUSTED_VERIFIER' \
  'verify-release-artifact.sh:PETCLAW_VERIFIED_DIR="/opt/petclaw/verified"' \
  'verify-release-artifact.sh:deploy/install-crontab.sh' \
  'verify-release-artifact.sh:deploy/tests/crontab-installer.test.sh' \
  'verify-release-artifact.sh:deploy/nginx-conf.d-ratelimit.conf' \
  'backup-production.sh:exec 8<>"${PETCLAW_RELEASE_LOCK}"' \
  'backup-production.sh:PETCLAW_EXPECTED_ENV_STAT=root:ubuntu:640' \
  'pull-production-backup.sh:exec 9<>"${PETCLAW_RELEASE_LOCK}"' \
  'pull-production-backup.sh:PETCLAW_REMOTE_STAGE_ROOT=/opt/petclaw/backup-staging' \
  'pull-production-backup.sh:PETCLAW_EXPECTED_ENV_STAT=root:ubuntu:640' \
  'pull-production-backup.sh:PGPASSWORD="${PGPASSWORD}" PGDATABASE="${PGDATABASE}" PGSSLMODE="${PGSSLMODE}"' \
  'pull-production-backup.sh:unset DATABASE_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE' \
  'pull-production-backup.sh:PETCLAW_PG_DUMP_BIN="${PETCLAW_PG_BIN_DIR}/pg_dump"' \
  'pull-production-backup.sh:"${PETCLAW_PG_RESTORE_BIN}" --list' \
  'verify-backup-snapshot.sh:exec 8<>"${PETCLAW_VERIFY_LOCK}"' \
  'verify-backup-snapshot.sh:PETCLAW_PG_RESTORE_BIN="/usr/lib/postgresql/16/bin/pg_restore"' \
  'verify-backup-snapshot.sh:sudo -n -u postgres "${PETCLAW_PG_RESTORE_BIN}"' \
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
PETCLAW_STATUS_FUNCTION="${PETCLAW_TEST_TMP}/release-status-functions.sh"
awk '/^petclaw_curl\(\) \{/{copy=1} /^expect_env_exact\(\) \{/{exit} copy{print}' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" > "${PETCLAW_STATUS_FUNCTION}"
# shellcheck source=/dev/null
source "${PETCLAW_STATUS_FUNCTION}"
PETCLAW_SMOKE_BASE=https://app.myaipet.ai
PETCLAW_SMOKE_HOST=""
PETCLAW_SMOKE_BODY="${PETCLAW_TEST_TMP}/transport-body"
curl() {
  printf '%s' '200'
  return 18
}
if expect_code 200 GET "/api/health" 2>/dev/null; then
  echo "FAIL: expected HTTP code masks a partial curl transport" >&2
  exit 1
fi
unset -f curl
if grep -Fq '"${PETCLAW_SMOKE_BASE}/api/health" || true)' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh"; then
  echo "FAIL: release identity still erases curl transport status" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 9))"

PETCLAW_LANDING_FUNCTION="${PETCLAW_TEST_TMP}/landing-body-function.sh"
awk '/^petclaw_verify_landing_body\(\) \{/{copy=1} copy{print} copy && /^\}$/{exit}' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" > "${PETCLAW_LANDING_FUNCTION}"
# shellcheck source=/dev/null
source "${PETCLAW_LANDING_FUNCTION}"
petclaw_valid_landing_fixture() {
  printf '%s' '<html lang="en" translate="no" class="notranslate"><meta name="google" content="notranslate" /api/petclaw/demo-chat 19-CONNECTOR REGISTRY · 3 LIVE · 18 SKILLS Supported MCP clients like Claude, Cursor, and OpenClaw connect through published SDK 1.6.2. +47 Play Points today SAMPLE Two legacy BNB Smart Chain contracts are deployed. Live app integration is off. Both contracts returned <code>paused() = false</code> class="footer-disclosure" product-demo.html?v=20260720-en-only launch reel — starts as you scroll animation: heroGlowBreathe Dordor priority: footer/journey beats CTA overlap. href="https://app.myaipet.ai/contracts"'
}
if ! {
  petclaw_valid_landing_fixture
  awk 'BEGIN { for (i = 0; i < 200000; i += 1) printf "x" }'
} | petclaw_verify_landing_body; then
  echo "FAIL: landing verifier cannot stream a body above Linux single-argument limits" >&2
  exit 1
fi
if { petclaw_valid_landing_fixture; printf '%b' ' Hangul: \355\225\234'; } | petclaw_verify_landing_body; then
  echo "FAIL: streaming landing verifier accepts Hangul" >&2
  exit 1
fi
if printf '%s' '<html lang="en" translate="no" class="notranslate"><meta name="google" content="notranslate" 19-CONNECTOR REGISTRY · 3 LIVE · 18 SKILLS Supported MCP clients like Claude, Cursor, and OpenClaw connect through published SDK 1.6.2. +47 Play Points today SAMPLE Two legacy BNB Smart Chain contracts are deployed. Live app integration is off. Both contracts returned <code>paused() = false</code> class="footer-disclosure" product-demo.html?v=20260720-en-only launch reel — starts as you scroll animation: heroGlowBreathe Dordor priority: footer/journey beats CTA overlap. href="https://app.myaipet.ai/contracts"' | petclaw_verify_landing_body; then
  echo "FAIL: streaming landing verifier accepts a missing demo endpoint" >&2
  exit 1
fi
if grep -Fq '"${LANDING_BODY}"' "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh"; then
  echo "FAIL: landing smoke still passes the full HTML body through argv" >&2
  exit 1
fi
if ! grep -Fq '|| "${PETCLAW_LANDING_CODE}" != "200" \' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" \
  || ! grep -Fq '|| "${PETCLAW_LANDING_RELEASE_OK}" != "1" ]]' \
    "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" \
  || ! grep -Fq 'if ! PETCLAW_LANDING_CODE="$(petclaw_fetch_landing /)"; then' \
    "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" \
  || ! grep -Fq 'PETCLAW_LANDING_CURL_OK=0' \
    "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" \
  || ! grep -Fq 'petclaw_verify_landing_body < "${PETCLAW_SMOKE_BODY}"' \
    "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh"; then
  echo "FAIL: landing body verification is not preceded by an exact HTTP 200 gate" >&2
  exit 1
fi

PETCLAW_APP_LANGUAGE_FUNCTION="${PETCLAW_TEST_TMP}/app-language-function.sh"
awk '/^petclaw_verify_no_hangul_body\(\) \{/{copy=1} copy{print} copy && /^\}$/{exit}' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" > "${PETCLAW_APP_LANGUAGE_FUNCTION}"
# shellcheck source=/dev/null
source "${PETCLAW_APP_LANGUAGE_FUNCTION}"
if ! printf '%s' '<html lang="en">English app</html>' | petclaw_verify_no_hangul_body; then
  echo "FAIL: app language verifier rejects English HTML" >&2
  exit 1
fi
if node -e 'process.stdout.write("app \u1100")' | petclaw_verify_no_hangul_body; then
  echo "FAIL: app language verifier accepts Hangul Jamo" >&2
  exit 1
fi
if ! grep -Fq 'petclaw_verify_no_hangul_body < "${PETCLAW_SMOKE_BODY}"' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh"; then
  echo "FAIL: release smoke does not scan served app HTML" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 3))"

PETCLAW_PRODUCT_DEMO_FUNCTION="${PETCLAW_TEST_TMP}/product-demo-body-function.sh"
awk '/^petclaw_verify_product_demo_body\(\) \{/{copy=1} copy{print} copy && /^\}$/{exit}' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" > "${PETCLAW_PRODUCT_DEMO_FUNCTION}"
# shellcheck source=/dev/null
source "${PETCLAW_PRODUCT_DEMO_FUNCTION}"
PETCLAW_GOOD_PRODUCT_DEMO='<html lang="en" translate="no" class="notranslate"><meta name="google" content="notranslate" id="playBtn" id="replayBtn" position:absolute; left:50%; top:50%; width:1280px; height:720px transform:translate(-50%,-50%) scale(var(--s,1)) <a class="cta" href="https://app.myaipet.ai" target="_top"> 7-tool MCP path is published in SDK 1.6.2 · messaging launch-paused.'
if ! printf '%s' "${PETCLAW_GOOD_PRODUCT_DEMO}" | petclaw_verify_product_demo_body; then
  echo "FAIL: centered mobile product demo fixture is rejected" >&2
  exit 1
fi
if printf '%s' '<html lang="en" translate="no" class="notranslate"><meta name="google" content="notranslate" id="playBtn" id="replayBtn" transform:scale(var(--s,1)) <a class="cta" href="https://app.myaipet.ai" target="_top"> 7-tool MCP path is published in SDK 1.6.2 · messaging launch-paused.' \
  | petclaw_verify_product_demo_body; then
  echo "FAIL: off-canvas mobile product demo fixture is accepted" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 2))"

PETCLAW_CONTRACT_DISCLOSURE_FUNCTION="${PETCLAW_TEST_TMP}/contract-disclosure-function.sh"
awk '/^petclaw_verify_contract_disclosure\(\) \{/{copy=1} copy{print} copy && /^\}$/{exit}' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" \
  > "${PETCLAW_CONTRACT_DISCLOSURE_FUNCTION}"
# shellcheck source=/dev/null
source "${PETCLAW_CONTRACT_DISCLOSURE_FUNCTION}"
PETCLAW_GOOD_CONTRACT_DISCLOSURE='all blockchain integration disabled paused() = false BLOCKCHAIN_ENABLED=false owner relayer/minter authorization remains active PETContent (NFT) 0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c On-chain paused() was false and totalSupply() = 0 PetaGenTracker 0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a On-chain paused() was false, totalUsers() = 0, and totalGenerations() = 0 DEPLOYED (INTEGRATION OFF)'
if ! printf '%s' "${PETCLAW_GOOD_CONTRACT_DISCLOSURE}" \
  | petclaw_verify_contract_disclosure; then
  echo "FAIL: exact public contract disclosure is rejected" >&2
  exit 1
fi
if printf '%s' 'all blockchain integration disabled paused() = false BLOCKCHAIN_ENABLED=false owner relayer/minter authorization remains active PETContent (NFT) 0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c On-chain paused() was false and totalSupply() = 0 DEPLOYED (INTEGRATION OFF)' \
  | petclaw_verify_contract_disclosure; then
  echo "FAIL: disclosure missing the tracker tuple is accepted" >&2
  exit 1
fi
if printf '%s' "${PETCLAW_GOOD_CONTRACT_DISCLOSURE} Deployed (paused)" \
  | petclaw_verify_contract_disclosure; then
  echo "FAIL: retired paused-contract disclosure is accepted" >&2
  exit 1
fi
if ! {
  printf '%s' "${PETCLAW_GOOD_CONTRACT_DISCLOSURE}"
  awk 'BEGIN { for (i = 0; i < 300000; i += 1) printf "x" }'
} | petclaw_verify_contract_disclosure; then
  echo "FAIL: contract disclosure verifier cannot stream a large response body" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 4))"

PETCLAW_ECOSYSTEM_DOC="${PETCLAW_TEST_ROOT}/web/public/api-docs/ECOSYSTEM.md"
if ! grep -Fq 'Production on-chain integration is disabled.' "${PETCLAW_ECOSYSTEM_DOC}" \
  || ! grep -Fq 'returned `paused() = false` with zero activity/supply counters' \
    "${PETCLAW_ECOSYSTEM_DOC}" \
  || grep -Fq 'contracts remain paused' "${PETCLAW_ECOSYSTEM_DOC}"; then
  echo "FAIL: public ecosystem document does not preserve the verified launch state" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

if ! grep -Fq 'd?.blockchain_enabled!==false' \
    "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" \
  || ! grep -Fq 'typeof d?.contracts!=="object"||d.contracts===null||Array.isArray(d.contracts)||Object.keys(d.contracts).length!==0' \
    "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh"; then
  echo "FAIL: release smoke does not enforce the disabled blockchain config" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

PETCLAW_FETCH_FUNCTION="${PETCLAW_TEST_TMP}/landing-fetch-function.sh"
awk '/^petclaw_fetch_landing\(\) \{/{copy=1} copy{print} copy && /^\}$/{exit}' \
  "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" > "${PETCLAW_FETCH_FUNCTION}"
# shellcheck source=/dev/null
source "${PETCLAW_FETCH_FUNCTION}"
PETCLAW_EXPECTED_RELEASE_ID=synthetic-release
PETCLAW_SMOKE_PORT=443
PETCLAW_SMOKE_HOST=127.0.0.1
PETCLAW_SMOKE_BODY="${PETCLAW_TEST_TMP}/partial-landing"
PETCLAW_SMOKE_HEADERS="${PETCLAW_TEST_TMP}/partial-landing-headers"
curl() {
  petclaw_valid_landing_fixture > "${PETCLAW_SMOKE_BODY}"
  printf '%s' '200'
  return 18
}
if petclaw_fetch_landing > "${PETCLAW_TEST_TMP}/partial-code"; then
  echo "FAIL: landing fetch accepts a partial HTTP 200 transport" >&2
  exit 1
fi
unset -f curl
if [[ "$(cat "${PETCLAW_TEST_TMP}/partial-code")" != "200" ]] \
  || ! petclaw_verify_landing_body < "${PETCLAW_SMOKE_BODY}"; then
  echo "FAIL: partial-transfer regression fixture is invalid" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 7))"

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

PETCLAW_SEAL_FUNCTION="${PETCLAW_TEST_TMP}/release-seal-function.sh"
awk '/^petclaw_seal_release_tree\(\) \{/{copy=1} copy{print} copy && /^\}$/{exit}' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" > "${PETCLAW_SEAL_FUNCTION}"
# shellcheck source=/dev/null
source "${PETCLAW_SEAL_FUNCTION}"
PETCLAW_MODE_FIXTURE="${PETCLAW_TEST_TMP}/mode-release"
PETCLAW_MODE_WEB="${PETCLAW_MODE_FIXTURE}/web"
mkdir -p "${PETCLAW_MODE_FIXTURE}/landing-assets/nested" \
  "${PETCLAW_MODE_WEB}/.next/static/chunks" \
  "${PETCLAW_MODE_WEB}/.next/standalone/private" \
  "${PETCLAW_MODE_WEB}/node_modules/.bin"
printf '%s' demo > "${PETCLAW_MODE_FIXTURE}/landing-assets/product-demo.html"
printf '%s' chunk > "${PETCLAW_MODE_WEB}/.next/static/chunks/app.js"
printf '%s' runtime > "${PETCLAW_MODE_WEB}/.next/standalone/private/server.js"
printf '%s' dotenv > "${PETCLAW_MODE_WEB}/.env.production"
printf '%s' '#!/bin/sh' > "${PETCLAW_MODE_WEB}/node_modules/.bin/prisma"
find "${PETCLAW_MODE_FIXTURE}" -type d -exec chmod 777 {} +
find "${PETCLAW_MODE_FIXTURE}" -type f -exec chmod 666 {} +
chmod 777 "${PETCLAW_MODE_WEB}/node_modules/.bin/prisma"
(
  sudo() {
    if [[ "$1" == "chown" ]]; then
      return 0
    fi
    "$@"
  }
  petclaw_seal_release_tree "${PETCLAW_MODE_FIXTURE}" "${PETCLAW_MODE_WEB}"
)
for PETCLAW_MODE_CONTRACT in \
  "${PETCLAW_MODE_FIXTURE}:755" \
  "${PETCLAW_MODE_FIXTURE}/landing-assets:755" \
  "${PETCLAW_MODE_FIXTURE}/landing-assets/product-demo.html:644" \
  "${PETCLAW_MODE_WEB}:755" \
  "${PETCLAW_MODE_WEB}/.next:755" \
  "${PETCLAW_MODE_WEB}/.next/static/chunks/app.js:644" \
  "${PETCLAW_MODE_WEB}/.next/standalone/private:750" \
  "${PETCLAW_MODE_WEB}/.next/standalone/private/server.js:640" \
  "${PETCLAW_MODE_WEB}/node_modules/.bin/prisma:750" \
  "${PETCLAW_MODE_WEB}/.env.production:640"; do
  PETCLAW_MODE_PATH="${PETCLAW_MODE_CONTRACT%:*}"
  PETCLAW_MODE_EXPECTED="${PETCLAW_MODE_CONTRACT##*:}"
  if [[ "$(petclaw_mode "${PETCLAW_MODE_PATH}")" != "${PETCLAW_MODE_EXPECTED}" ]]; then
    echo "FAIL: sealed mode drift for ${PETCLAW_MODE_PATH}" >&2
    exit 1
  fi
  PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"
done

PETCLAW_RUNTIME_MODE_LINE="$(grep -nF 'petclaw_seal_release_tree "${PETCLAW_RELEASE_DIR}" "${PETCLAW_WEB}"' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
PETCLAW_POSTSEAL_NGINX_LINE="$(grep -nF 'post-seal nginx cannot read' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
PETCLAW_RUNTIME_READ_LINE="$(grep -nF 'PETCLAW_PRISMA_CLI="$(realpath -e' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
PETCLAW_DOTENV_PARSE_LINE="$(grep -nF 'const dotenv = require("dotenv");' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
if [[ ! "${PETCLAW_RUNTIME_MODE_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_POSTSEAL_NGINX_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_RUNTIME_READ_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_DOTENV_PARSE_LINE}" =~ ^[0-9]+$ \
  || "${PETCLAW_RUNTIME_MODE_LINE}" -ge "${PETCLAW_RUNTIME_READ_LINE}" \
  || "${PETCLAW_RUNTIME_MODE_LINE}" -ge "${PETCLAW_POSTSEAL_NGINX_LINE}" \
  || "${PETCLAW_POSTSEAL_NGINX_LINE}" -ge "${PETCLAW_RUNTIME_READ_LINE}" \
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

PETCLAW_SOURCE_LANGUAGE_SCAN_LINE="$(grep -nF \
  'node "${PETCLAW_STAGE}/tree/deploy/scan-release-language.mjs"' \
  "${PETCLAW_TEST_ROOT}/deploy/build-release-artifact.sh" | cut -d: -f1)"
if [[ ! "${PETCLAW_SOURCE_LANGUAGE_SCAN_LINE}" =~ ^[0-9]+$ \
  || "${PETCLAW_SOURCE_LANGUAGE_SCAN_LINE}" -ge "${PETCLAW_ARTIFACT_WRITE_LINE}" ]]; then
  echo "FAIL: source language scan does not precede signed artifact creation" >&2
  exit 1
fi
PETCLAW_BUILD_LINE="$(grep -nF 'npm run build' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | head -n 1 | cut -d: -f1)"
PETCLAW_RELEASE_READINESS_LINE="$(grep -nF 'npm run test:release-readiness' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | head -n 1 | cut -d: -f1)"
PETCLAW_COMMUNITY_FALLBACK_LINE="$(grep -nF 'npm run test:community-fallback' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | head -n 1 | cut -d: -f1)"
PETCLAW_BUILT_LANGUAGE_SCAN_LINE="$(grep -nF \
  'node "${PETCLAW_RELEASE_SOURCE}/deploy/scan-release-language.mjs"' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
PETCLAW_TRAFFIC_SWITCH_LINE="$(grep -nF 'PETCLAW_SWITCH_STARTED=1' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | tail -n 1 | cut -d: -f1)"
if [[ ! "${PETCLAW_RELEASE_READINESS_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_COMMUNITY_FALLBACK_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_BUILD_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_BUILT_LANGUAGE_SCAN_LINE}" =~ ^[0-9]+$ \
  || ! "${PETCLAW_TRAFFIC_SWITCH_LINE}" =~ ^[0-9]+$ \
  || "${PETCLAW_RELEASE_READINESS_LINE}" -ge "${PETCLAW_COMMUNITY_FALLBACK_LINE}" \
  || "${PETCLAW_COMMUNITY_FALLBACK_LINE}" -ge "${PETCLAW_BUILD_LINE}" \
  || "${PETCLAW_BUILD_LINE}" -ge "${PETCLAW_BUILT_LANGUAGE_SCAN_LINE}" \
  || "${PETCLAW_BUILT_LANGUAGE_SCAN_LINE}" -ge "${PETCLAW_TRAFFIC_SWITCH_LINE}" ]]; then
  echo "FAIL: release-readiness/community/build/language gates are not ordered before traffic switch" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 4))"

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

PETCLAW_SEAL_LINE="$(grep -nF 'petclaw_seal_release_tree "${PETCLAW_RELEASE_DIR}" "${PETCLAW_WEB}"' \
  "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" | cut -d: -f1)"
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

PETCLAW_ABSENT_ENV_FUNCTION="${PETCLAW_TEST_TMP}/season-env-absent-function.sh"
awk '
  /^petclaw_require_launch_assignment_absent\(\) \{/ { copy=1 }
  copy { print }
  copy && /^}$/ { exit }
' "${PETCLAW_TEST_ROOT}/deploy/ec2-release.sh" > "${PETCLAW_ABSENT_ENV_FUNCTION}"
# shellcheck source=/dev/null
source "${PETCLAW_ABSENT_ENV_FUNCTION}"
PETCLAW_ABSENT_ENV_FIXTURE="${PETCLAW_TEST_TMP}/season.env"
printf '%s\n' 'PAYMENTS_ENABLED=false' > "${PETCLAW_ABSENT_ENV_FIXTURE}"
if ! (PETCLAW_ENV_SOURCE="${PETCLAW_ABSENT_ENV_FIXTURE}"; \
  petclaw_require_launch_assignment_absent NEXT_PUBLIC_SEASON1_START_MS); then
  echo "FAIL: absent season start assignment is rejected" >&2
  exit 1
fi
printf '%s\n' 'NEXT_PUBLIC_SEASON1_START_MS=1782864000000' >> "${PETCLAW_ABSENT_ENV_FIXTURE}"
if (PETCLAW_ENV_SOURCE="${PETCLAW_ABSENT_ENV_FIXTURE}"; \
  petclaw_require_launch_assignment_absent NEXT_PUBLIC_SEASON1_START_MS) \
  >/dev/null 2>&1; then
  echo "FAIL: configured season start bypasses the STARTING SOON gate" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 2))"

if ! awk '
  /^const fs = require\("node:fs"\);$/ { copy=1 }
  copy && $0 == "NODE" { exit }
  copy { print }
' "${PETCLAW_TEST_ROOT}/deploy/release-smoke.sh" \
  | node - "${PETCLAW_TEST_ROOT}"; then
  echo "FAIL: embedded release source-contract smoke is invalid or rejects the committed tree" >&2
  exit 1
fi
PETCLAW_TEST_PASSED="$((PETCLAW_TEST_PASSED + 1))"

echo "PASS release safety adversarial harness (${PETCLAW_TEST_PASSED} assertions)"

#!/usr/bin/env bash
# Create a deterministic, secret-scanned production source archive from one
# exact committed revision. The dirty workspace is never copied.
set -euo pipefail
umask 077
unset BASH_ENV CDPATH ENV GLOBIGNORE NODE_OPTIONS
unset -f node npm npx 2>/dev/null || true
hash -r

PETCLAW_REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
PETCLAW_REVISION="${1:-HEAD}"
PETCLAW_OUTPUT_DIR="${2:-${PETCLAW_REPO_ROOT}/release-artifacts}"
PETCLAW_RELEASE_SIGNING_GPG_HOME="${PETCLAW_RELEASE_SIGNING_GPG_HOME:-${HOME}/.gnupg}"
PETCLAW_RELEASE_SIGNING_FINGERPRINT="0B286A30DC9C53D08CE5ABC72E2A4FDD17382A1F"
PETCLAW_RELEASE_SIGNING_SUBKEY_FINGERPRINT="ABD9D161F7FDB82D600D32B7EEB701346799673E"
PETCLAW_REQUIRED_NODE_MAJOR=24
PETCLAW_REQUIRED_NODE_MIN_MINOR=18
PETCLAW_REQUIRED_NPM_VERSION="11.16.0"

petclaw_runtime_versions_supported() {
  local PETCLAW_RUNTIME_NODE_VERSION="$1"
  local PETCLAW_RUNTIME_NPM_VERSION="$2"
  local PETCLAW_RUNTIME_NODE_MAJOR
  local PETCLAW_RUNTIME_NODE_MINOR
  if [[ ! "${PETCLAW_RUNTIME_NODE_VERSION}" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
    return 1
  fi
  PETCLAW_RUNTIME_NODE_MAJOR="${BASH_REMATCH[1]}"
  PETCLAW_RUNTIME_NODE_MINOR="${BASH_REMATCH[2]}"
  if (( PETCLAW_RUNTIME_NODE_MAJOR != PETCLAW_REQUIRED_NODE_MAJOR \
    || PETCLAW_RUNTIME_NODE_MINOR < PETCLAW_REQUIRED_NODE_MIN_MINOR )); then
    return 1
  fi
  [[ "${PETCLAW_RUNTIME_NPM_VERSION}" == "${PETCLAW_REQUIRED_NPM_VERSION}" ]]
}

PETCLAW_NODE_COMMAND="$(type -P node 2>/dev/null || true)"
PETCLAW_NPM_COMMAND="$(type -P npm 2>/dev/null || true)"
PETCLAW_NODE_VERSION="$("${PETCLAW_NODE_COMMAND}" --version 2>/dev/null || true)"
PETCLAW_NPM_VERSION="$("${PETCLAW_NPM_COMMAND}" --version 2>/dev/null || true)"
if ! petclaw_runtime_versions_supported "${PETCLAW_NODE_VERSION}" "${PETCLAW_NPM_VERSION}"; then
  echo "ERROR: release builder requires Node.js >=24.18.0 <25 and npm 11.16.0; found ${PETCLAW_NODE_VERSION:-missing}/${PETCLAW_NPM_VERSION:-missing}." >&2
  exit 2
fi

cd "${PETCLAW_REPO_ROOT}"
PETCLAW_COMMIT="$(git rev-parse --verify "${PETCLAW_REVISION}^{commit}")"
if [[ "$(git rev-parse --show-toplevel)" != "${PETCLAW_REPO_ROOT}" ]]; then
  echo "ERROR: release builder must run from the repository root." >&2
  exit 2
fi
if ! git merge-base --is-ancestor "${PETCLAW_COMMIT}" HEAD; then
  echo "ERROR: release revision is not an ancestor of the current branch." >&2
  exit 2
fi

for PETCLAW_REQUIRED_PATH in \
  desktop-pet/manifest.json \
  petclaw-extension.zip \
  web/package-lock.json \
  web/package.json \
  web/public/petclaw-extension.zip \
  web/scripts/community-fallback-contract.ts \
  web/scripts/llm-router-smoke.ts \
  web/scripts/release-readiness-contract.mjs \
  web/scripts/ui-contract-audit.mjs \
  web/scripts/verify-standalone-artifact.mjs \
  web/src/lib/petclaw-extension.ts \
  deploy/ec2-release.sh \
  deploy/parse-database-url.mjs \
  deploy/verify-release-artifact.sh \
  deploy/release-boot-guard.sh \
  deploy/petclaw-release-boot-guard.service \
  deploy/release-rollback-watchdog.sh \
  deploy/scan-release-language.mjs \
  deploy/scan-release-secrets.sh \
  deploy/check-release-migrations.sh \
  deploy/destructive-migrations.allowlist \
  deploy/backup-verification-public-key.asc \
  deploy/nginx-petclaw.conf.template \
  deploy/release-smoke.sh; do
  if ! git cat-file -e "${PETCLAW_COMMIT}:${PETCLAW_REQUIRED_PATH}" 2>/dev/null; then
    echo "ERROR: committed release is missing ${PETCLAW_REQUIRED_PATH}." >&2
    exit 2
  fi
done
if git cat-file -e "${PETCLAW_COMMIT}:web/prisma/migrations/20260709000000_referral_program" 2>/dev/null; then
  echo "ERROR: unapproved referral migration is present in the release revision." >&2
  exit 2
fi

install -d -m 700 "${PETCLAW_OUTPUT_DIR}"
PETCLAW_OUTPUT_DIR="$(cd -- "${PETCLAW_OUTPUT_DIR}" && pwd -P)"
PETCLAW_SHORT_COMMIT="$(git rev-parse --short=12 "${PETCLAW_COMMIT}")"
PETCLAW_COMMIT_TIME="$(git show -s --format=%cI "${PETCLAW_COMMIT}" | tr -d -- ':-' | sed 's/+.*$//; s/Z$//; s/T/T/')"
PETCLAW_RELEASE_ID="${PETCLAW_COMMIT_TIME}-${PETCLAW_SHORT_COMMIT}"
PETCLAW_ARCHIVE="${PETCLAW_OUTPUT_DIR}/petclaw-${PETCLAW_RELEASE_ID}.tar.gz"
PETCLAW_CHECKSUM="${PETCLAW_ARCHIVE}.sha256"
PETCLAW_MANIFEST="${PETCLAW_OUTPUT_DIR}/petclaw-${PETCLAW_RELEASE_ID}.manifest"
PETCLAW_MANIFEST_SIGNATURE="${PETCLAW_MANIFEST}.asc"
if [[ -e "${PETCLAW_ARCHIVE}" || -e "${PETCLAW_CHECKSUM}" \
  || -e "${PETCLAW_MANIFEST}" || -e "${PETCLAW_MANIFEST_SIGNATURE}" ]]; then
  echo "ERROR: immutable release artifact already exists." >&2
  exit 2
fi

PETCLAW_STAGE="$(mktemp -d)"
PETCLAW_ARTIFACT_COMMITTED=0
petclaw_cleanup_stage() {
  if [[ -n "${PETCLAW_STAGE:-}" && -d "${PETCLAW_STAGE}" && ! -L "${PETCLAW_STAGE}" ]]; then
    find "${PETCLAW_STAGE}" -depth -delete
  fi
  if [[ "${PETCLAW_ARTIFACT_COMMITTED}" != "1" ]]; then
    rm -f -- "${PETCLAW_ARCHIVE}" "${PETCLAW_CHECKSUM}" \
      "${PETCLAW_MANIFEST}" "${PETCLAW_MANIFEST_SIGNATURE}"
  fi
}
trap petclaw_cleanup_stage EXIT HUP INT TERM

# Keep workstation metadata, dormant RDS tooling, and synthetic test fixtures
# out of the production artifact. Runtime release gates use non-`.test.` names
# so they remain included alongside verify-standalone-artifact.
git archive --format=tar "${PETCLAW_COMMIT}" -- \
  . \
  ':(exclude).claude' \
  ':(exclude)deploy/setup-rds.sh' \
  ':(exclude)web/scripts/*.test.*' \
  > "${PETCLAW_STAGE}/release.tar"
mkdir -m 700 "${PETCLAW_STAGE}/tree"
tar -xf "${PETCLAW_STAGE}/release.tar" -C "${PETCLAW_STAGE}/tree"
/bin/bash "${PETCLAW_STAGE}/tree/deploy/scan-release-secrets.sh" "${PETCLAW_STAGE}/tree"
/bin/bash "${PETCLAW_STAGE}/tree/deploy/check-release-migrations.sh" \
  "${PETCLAW_STAGE}/tree" \
  "${PETCLAW_STAGE}/tree/deploy/destructive-migrations.allowlist"
node "${PETCLAW_STAGE}/tree/deploy/scan-release-language.mjs" \
  source "${PETCLAW_STAGE}/tree"

PETCLAW_EXTENSION_VERSION="$(node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || "")) process.exit(1);
  process.stdout.write(manifest.version);
' "${PETCLAW_STAGE}/tree/desktop-pet/manifest.json")"
if [[ "$(grep -Fxc \
    "export const PETCLAW_EXTENSION_VERSION = \"${PETCLAW_EXTENSION_VERSION}\";" \
    "${PETCLAW_STAGE}/tree/web/src/lib/petclaw-extension.ts" || true)" != "1" \
  || "$(grep -Fxc \
    "PETCLAW_EXPECTED_EXTENSION_VERSION=\"${PETCLAW_EXTENSION_VERSION}\"" \
    "${PETCLAW_STAGE}/tree/deploy/release-smoke.sh" || true)" != "1" ]]; then
  echo "ERROR: committed extension manifest, dashboard, and release smoke versions differ." >&2
  exit 2
fi
if ! /bin/bash "${PETCLAW_STAGE}/tree/scripts/build-petclaw-extension.sh" --check; then
  echo "ERROR: committed extension archives are stale or differ from their source." >&2
  exit 2
fi
for PETCLAW_EXTENSION_ARCHIVE in \
  "${PETCLAW_STAGE}/tree/petclaw-extension.zip" \
  "${PETCLAW_STAGE}/tree/web/public/petclaw-extension.zip"; do
  if ! unzip -tq "${PETCLAW_EXTENSION_ARCHIVE}" >/dev/null; then
    echo "ERROR: committed extension archive is not a valid ZIP." >&2
    exit 2
  fi
  if ! PETCLAW_PACKED_EXTENSION_VERSION="$(unzip -p \
      "${PETCLAW_EXTENSION_ARCHIVE}" manifest.json | node -e '
        let source = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => { source += chunk; });
        process.stdin.on("end", () => {
          try { process.stdout.write(JSON.parse(source).version || ""); }
          catch { process.exitCode = 1; }
        });
      ')"; then
    echo "ERROR: committed extension archive manifest is invalid." >&2
    exit 2
  fi
  if [[ "${PETCLAW_PACKED_EXTENSION_VERSION}" != "${PETCLAW_EXTENSION_VERSION}" ]]; then
    echo "ERROR: committed extension archive version differs from its source manifest." >&2
    exit 2
  fi
done
if ! cmp -s "${PETCLAW_STAGE}/tree/petclaw-extension.zip" \
    "${PETCLAW_STAGE}/tree/web/public/petclaw-extension.zip"; then
  echo "ERROR: root and public extension archives are not byte-identical." >&2
  exit 2
fi

# Prove the committed package manifest and lockfile are clean-installable under
# the same supported runtime family before signing immutable release bytes.
# --dry-run and --ignore-scripts avoid executing dependency code or creating a
# generated dependency tree inside the source archive.
(
  cd "${PETCLAW_STAGE}/tree/web"
  npm_config_engine_strict=true \
    npm ci --dry-run --ignore-scripts --no-audit --no-fund
)

if find "${PETCLAW_STAGE}/tree" -type l -o -type f -links +1 | grep -q . \
  || find "${PETCLAW_STAGE}/tree" -type f -name '.env*' -print -quit | grep -q . \
  || [[ -d "${PETCLAW_STAGE}/tree/web/node_modules" || -d "${PETCLAW_STAGE}/tree/web/.next" ]]; then
  echo "ERROR: extracted release violates the immutable source policy." >&2
  exit 2
fi

# gzip -n omits current time and original filename, so the same commit yields
# identical bytes on repeated builds.
gzip -n -c "${PETCLAW_STAGE}/release.tar" > "${PETCLAW_ARCHIVE}"
if command -v sha256sum >/dev/null 2>&1; then
  PETCLAW_SHA256="$(sha256sum "${PETCLAW_ARCHIVE}" | awk '{print $1}')"
else
  PETCLAW_SHA256="$(shasum -a 256 "${PETCLAW_ARCHIVE}" | awk '{print $1}')"
fi
printf '%s  %s\n' "${PETCLAW_SHA256}" "$(basename "${PETCLAW_ARCHIVE}")" > "${PETCLAW_CHECKSUM}"
printf '%s\n' \
  'manifest_version=1' \
  "release_commit=${PETCLAW_COMMIT}" \
  "release_id=${PETCLAW_RELEASE_ID}" \
  "archive_file=$(basename "${PETCLAW_ARCHIVE}")" \
  "archive_sha256=${PETCLAW_SHA256}" > "${PETCLAW_MANIFEST}"

if [[ ! -d "${PETCLAW_RELEASE_SIGNING_GPG_HOME}" \
  || -L "${PETCLAW_RELEASE_SIGNING_GPG_HOME}" ]]; then
  echo "ERROR: operator release-signing GPG home is missing or unsafe." >&2
  exit 2
fi
gpg --homedir "${PETCLAW_RELEASE_SIGNING_GPG_HOME}" --batch --yes \
  --local-user "${PETCLAW_RELEASE_SIGNING_SUBKEY_FINGERPRINT}!" \
  --armor --detach-sign --output "${PETCLAW_MANIFEST_SIGNATURE}" \
  "${PETCLAW_MANIFEST}"

PETCLAW_VERIFY_GPG_HOME="${PETCLAW_STAGE}/verify-gpg"
install -d -m 700 "${PETCLAW_VERIFY_GPG_HOME}"
gpg --homedir "${PETCLAW_VERIFY_GPG_HOME}" --batch --quiet --import \
  "${PETCLAW_STAGE}/tree/deploy/backup-verification-public-key.asc"
if ! PETCLAW_SIGNATURE_STATUS="$(gpg --homedir "${PETCLAW_VERIFY_GPG_HOME}" --batch \
  --status-fd=1 --verify "${PETCLAW_MANIFEST_SIGNATURE}" "${PETCLAW_MANIFEST}" 2>/dev/null)"; then
  echo "ERROR: generated release signature failed local verification." >&2
  exit 2
fi
PETCLAW_SIGNATURE_BINDING="$(printf '%s\n' "${PETCLAW_SIGNATURE_STATUS}" \
  | awk '$1 == "[GNUPG:]" && $2 == "VALIDSIG" { print $3 ":" $NF }')"
if [[ "${PETCLAW_SIGNATURE_BINDING}" != \
  "${PETCLAW_RELEASE_SIGNING_SUBKEY_FINGERPRINT}:${PETCLAW_RELEASE_SIGNING_FINGERPRINT}" ]]; then
  echo "ERROR: generated release signature is not bound to the pinned operator key." >&2
  exit 2
fi

chmod 600 "${PETCLAW_ARCHIVE}" "${PETCLAW_CHECKSUM}" \
  "${PETCLAW_MANIFEST}" "${PETCLAW_MANIFEST_SIGNATURE}"
PETCLAW_ARTIFACT_COMMITTED=1

echo "release_commit=${PETCLAW_COMMIT}"
echo "release_id=${PETCLAW_RELEASE_ID}"
echo "release_archive=${PETCLAW_ARCHIVE}"
echo "release_sha256=${PETCLAW_SHA256}"
echo "release_manifest=${PETCLAW_MANIFEST}"
echo "release_manifest_signature=${PETCLAW_MANIFEST_SIGNATURE}"

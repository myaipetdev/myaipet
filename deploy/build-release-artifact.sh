#!/usr/bin/env bash
# Create a deterministic, secret-scanned production source archive from one
# exact committed revision. The dirty workspace is never copied.
set -euo pipefail
umask 077

PETCLAW_REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
PETCLAW_REVISION="${1:-HEAD}"
PETCLAW_OUTPUT_DIR="${2:-${PETCLAW_REPO_ROOT}/release-artifacts}"
PETCLAW_RELEASE_SIGNING_GPG_HOME="${PETCLAW_RELEASE_SIGNING_GPG_HOME:-${HOME}/.gnupg}"
PETCLAW_RELEASE_SIGNING_FINGERPRINT="0B286A30DC9C53D08CE5ABC72E2A4FDD17382A1F"
PETCLAW_RELEASE_SIGNING_SUBKEY_FINGERPRINT="ABD9D161F7FDB82D600D32B7EEB701346799673E"

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
  web/package-lock.json \
  web/public/petclaw-extension.zip \
  deploy/ec2-release.sh \
  deploy/verify-release-artifact.sh \
  deploy/release-boot-guard.sh \
  deploy/petclaw-release-boot-guard.service \
  deploy/release-rollback-watchdog.sh \
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
# out of the production artifact. Runtime verification scripts do not use the
# `*.test.*` files; verify-standalone-artifact remains included.
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

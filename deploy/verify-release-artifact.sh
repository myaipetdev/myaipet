#!/bin/bash
# Root-owned EC2 trust boundary: verify, scan, and seal a signed release archive.
set -euo pipefail
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
unset BASH_ENV CDPATH ENV GLOBIGNORE NODE_OPTIONS

PETCLAW_TRUSTED_VERIFIER="/usr/local/sbin/petclaw-verify-release-artifact.sh"
PETCLAW_TRUSTED_CONTROLLER="/usr/local/sbin/petclaw-ec2-release.sh"
PETCLAW_TRUSTED_LIBEXEC="/usr/local/libexec/petclaw"
PETCLAW_TRUSTED_SCANNER="${PETCLAW_TRUSTED_LIBEXEC}/scan-release-secrets.sh"
PETCLAW_TRUSTED_MIGRATION_GATE="${PETCLAW_TRUSTED_LIBEXEC}/check-release-migrations.sh"
PETCLAW_RELEASE_PUBLIC_KEY="/etc/petclaw/release-signing-public-key.asc"
PETCLAW_INCOMING_DIR="/opt/petclaw/incoming"
PETCLAW_VERIFIED_DIR="/opt/petclaw/verified"
PETCLAW_RELEASE_SIGNING_FINGERPRINT="0B286A30DC9C53D08CE5ABC72E2A4FDD17382A1F"
PETCLAW_RELEASE_SIGNING_SUBKEY_FINGERPRINT="ABD9D161F7FDB82D600D32B7EEB701346799673E"
PETCLAW_MAX_ARCHIVE_BYTES=$((2 * 1024 * 1024 * 1024))
PETCLAW_MAX_EXPANDED_BYTES=$((4 * 1024 * 1024 * 1024))

petclaw_require_root_owned_tool() {
  local PETCLAW_TOOL_PATH="$1"
  local PETCLAW_TOOL_MODE
  if [[ ! -f "${PETCLAW_TOOL_PATH}" || -L "${PETCLAW_TOOL_PATH}" \
    || "$(stat -c '%U:%G' "${PETCLAW_TOOL_PATH}")" != "root:root" ]]; then
    echo "ERROR: trusted release tool is missing or not root-owned: ${PETCLAW_TOOL_PATH}" >&2
    exit 2
  fi
  PETCLAW_TOOL_MODE="$(stat -c '%a' "${PETCLAW_TOOL_PATH}")"
  if (( (8#${PETCLAW_TOOL_MODE} & 8#022) != 0 )); then
    echo "ERROR: trusted release tool is writable by group or other: ${PETCLAW_TOOL_PATH}" >&2
    exit 2
  fi
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: signed release verification must run as root." >&2
  exit 2
fi
if [[ "$(realpath -e "${BASH_SOURCE[0]}")" != "${PETCLAW_TRUSTED_VERIFIER}" ]]; then
  echo "ERROR: run the installed trusted release verifier, not the uploaded copy." >&2
  exit 2
fi
petclaw_require_root_owned_tool "${PETCLAW_TRUSTED_VERIFIER}"
petclaw_require_root_owned_tool "${PETCLAW_TRUSTED_SCANNER}"
petclaw_require_root_owned_tool "${PETCLAW_TRUSTED_MIGRATION_GATE}"

if [[ "$#" -ne 3 ]]; then
  echo "Usage: sudo ${PETCLAW_TRUSTED_VERIFIER} <archive.tar.gz> <manifest> <manifest.asc>" >&2
  exit 2
fi
PETCLAW_ARCHIVE="$1"
PETCLAW_MANIFEST="$2"
PETCLAW_MANIFEST_SIGNATURE="$3"
PETCLAW_UPLOADED_ARCHIVE_BASENAME="$(basename "${PETCLAW_ARCHIVE}")"
for PETCLAW_PROOF_FILE in "${PETCLAW_ARCHIVE}" "${PETCLAW_MANIFEST}" "${PETCLAW_MANIFEST_SIGNATURE}"; do
  if [[ ! -f "${PETCLAW_PROOF_FILE}" || -L "${PETCLAW_PROOF_FILE}" ]]; then
    echo "ERROR: release archive, manifest, and signature must be regular non-symlink files." >&2
    exit 2
  fi
done
PETCLAW_VERIFY_TMP="$(mktemp -d)"
PETCLAW_STAGE=""
petclaw_cleanup_verify() {
  if [[ -n "${PETCLAW_VERIFY_TMP:-}" && -d "${PETCLAW_VERIFY_TMP}" \
    && ! -L "${PETCLAW_VERIFY_TMP}" ]]; then
    find "${PETCLAW_VERIFY_TMP}" -depth -delete
  fi
  if [[ -n "${PETCLAW_STAGE:-}" && -d "${PETCLAW_STAGE}" \
    && ! -L "${PETCLAW_STAGE}" \
    && "${PETCLAW_STAGE}" == "${PETCLAW_VERIFIED_DIR}/.verify-"* ]]; then
    find "${PETCLAW_STAGE}" -depth -delete
  fi
}
trap petclaw_cleanup_verify EXIT HUP INT TERM
install -o root -g root -m 400 "$1" "${PETCLAW_VERIFY_TMP}/release.tar.gz"
install -o root -g root -m 400 "$2" "${PETCLAW_VERIFY_TMP}/release.manifest"
install -o root -g root -m 400 "$3" "${PETCLAW_VERIFY_TMP}/release.manifest.asc"
PETCLAW_ARCHIVE="${PETCLAW_VERIFY_TMP}/release.tar.gz"
PETCLAW_MANIFEST="${PETCLAW_VERIFY_TMP}/release.manifest"
PETCLAW_MANIFEST_SIGNATURE="${PETCLAW_VERIFY_TMP}/release.manifest.asc"
PETCLAW_RELEASE_KEY_MODE="$(stat -c '%a' "${PETCLAW_RELEASE_PUBLIC_KEY}" 2>/dev/null || true)"
if [[ ! -f "${PETCLAW_RELEASE_PUBLIC_KEY}" || -L "${PETCLAW_RELEASE_PUBLIC_KEY}" \
  || "$(stat -c '%U:%G' "${PETCLAW_RELEASE_PUBLIC_KEY}")" != "root:root" \
  || ! "${PETCLAW_RELEASE_KEY_MODE}" =~ ^[0-7]{3,4}$ ]] \
  || (( (8#${PETCLAW_RELEASE_KEY_MODE} & 8#022) != 0 )); then
  echo "ERROR: pinned release signing key is missing, unsafe, or writable by other." >&2
  exit 2
fi
if [[ ! -d /opt/petclaw || -L /opt/petclaw \
  || "$(realpath -e /opt/petclaw)" != "/opt/petclaw" \
  || "$(stat -c '%U:%G:%a' /opt/petclaw)" != "root:root:755" ]]; then
  echo "ERROR: pinned PetClaw root must be a root-owned mode-755 real directory." >&2
  exit 2
fi
if [[ ! -d "${PETCLAW_INCOMING_DIR}" || -L "${PETCLAW_INCOMING_DIR}" \
  || "$(realpath -e "${PETCLAW_INCOMING_DIR}")" != "${PETCLAW_INCOMING_DIR}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_INCOMING_DIR}")" != "ubuntu:ubuntu:700" ]]; then
  echo "ERROR: pinned upload directory is missing or unsafe." >&2
  exit 2
fi
for PETCLAW_UPLOADED_PROOF in "$1" "$2" "$3"; do
  PETCLAW_UPLOADED_PROOF_REAL="$(realpath -e "${PETCLAW_UPLOADED_PROOF}" 2>/dev/null || true)"
  if [[ -z "${PETCLAW_UPLOADED_PROOF_REAL}" \
    || "$(dirname "${PETCLAW_UPLOADED_PROOF_REAL}")" != "${PETCLAW_INCOMING_DIR}" ]]; then
    echo "ERROR: artifact proof files must be direct children of the untrusted upload spool." >&2
    exit 2
  fi
done
if [[ ! -d "${PETCLAW_VERIFIED_DIR}" || -L "${PETCLAW_VERIFIED_DIR}" \
  || "$(realpath -e "${PETCLAW_VERIFIED_DIR}")" != "${PETCLAW_VERIFIED_DIR}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_VERIFIED_DIR}")" != "root:root:755" ]]; then
  echo "ERROR: pinned verified-release directory is missing or unsafe." >&2
  exit 2
fi

mapfile -t PETCLAW_MANIFEST_LINES < "${PETCLAW_MANIFEST}"
if [[ "${#PETCLAW_MANIFEST_LINES[@]}" -ne 5 \
  || "${PETCLAW_MANIFEST_LINES[0]}" != "manifest_version=1" \
  || "${PETCLAW_MANIFEST_LINES[1]}" != release_commit=* \
  || "${PETCLAW_MANIFEST_LINES[2]}" != release_id=* \
  || "${PETCLAW_MANIFEST_LINES[3]}" != archive_file=* \
  || "${PETCLAW_MANIFEST_LINES[4]}" != archive_sha256=* ]]; then
  echo "ERROR: signed release manifest has an invalid canonical format." >&2
  exit 2
fi
PETCLAW_RELEASE_COMMIT="${PETCLAW_MANIFEST_LINES[1]#release_commit=}"
PETCLAW_RELEASE_ID="${PETCLAW_MANIFEST_LINES[2]#release_id=}"
PETCLAW_ARCHIVE_FILE="${PETCLAW_MANIFEST_LINES[3]#archive_file=}"
PETCLAW_ARCHIVE_EXPECTED_SHA="${PETCLAW_MANIFEST_LINES[4]#archive_sha256=}"
if [[ ! "${PETCLAW_RELEASE_COMMIT}" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ \
  || ! "${PETCLAW_RELEASE_ID}" =~ ^[A-Za-z0-9._-]{6,80}$ \
  || "${PETCLAW_ARCHIVE_FILE}" != "${PETCLAW_UPLOADED_ARCHIVE_BASENAME}" \
  || "${PETCLAW_ARCHIVE_FILE}" != "petclaw-${PETCLAW_RELEASE_ID}.tar.gz" \
  || ! "${PETCLAW_ARCHIVE_EXPECTED_SHA}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: signed release manifest values are invalid." >&2
  exit 2
fi
PETCLAW_ARCHIVE_BYTES="$(stat -c '%s' "${PETCLAW_ARCHIVE}")"
PETCLAW_ARCHIVE_ACTUAL_SHA="$(sha256sum "${PETCLAW_ARCHIVE}" | awk '{print $1}')"
if (( PETCLAW_ARCHIVE_BYTES <= 0 || PETCLAW_ARCHIVE_BYTES > PETCLAW_MAX_ARCHIVE_BYTES )) \
  || [[ "${PETCLAW_ARCHIVE_ACTUAL_SHA}" != "${PETCLAW_ARCHIVE_EXPECTED_SHA}" ]]; then
  echo "ERROR: release archive size or SHA-256 does not match the signed manifest." >&2
  exit 2
fi

PETCLAW_GPG_HOME="${PETCLAW_VERIFY_TMP}/gpg"
install -d -o root -g root -m 700 "${PETCLAW_GPG_HOME}"
gpg --homedir "${PETCLAW_GPG_HOME}" --batch --quiet --import "${PETCLAW_RELEASE_PUBLIC_KEY}"
mapfile -t PETCLAW_IMPORTED_PRIMARY_FPRS < <(
  gpg --homedir "${PETCLAW_GPG_HOME}" --batch --with-colons --fingerprint \
    | awk -F: '$1 == "pub" { want_fpr = 1; next } want_fpr && $1 == "fpr" { print $10; want_fpr = 0 }'
)
if [[ "${#PETCLAW_IMPORTED_PRIMARY_FPRS[@]}" -ne 1 \
  || "${PETCLAW_IMPORTED_PRIMARY_FPRS[0]:-}" != "${PETCLAW_RELEASE_SIGNING_FINGERPRINT}" ]]; then
  echo "ERROR: release verification key is not the single pinned operator key." >&2
  exit 2
fi
if ! PETCLAW_GPG_STATUS="$(gpg --homedir "${PETCLAW_GPG_HOME}" --batch \
  --status-fd=1 --verify "${PETCLAW_MANIFEST_SIGNATURE}" "${PETCLAW_MANIFEST}" 2>/dev/null)"; then
  echo "ERROR: release manifest signature verification failed." >&2
  exit 2
fi
mapfile -t PETCLAW_VALID_SIGNATURES < <(
  printf '%s\n' "${PETCLAW_GPG_STATUS}" \
    | awk '$1 == "[GNUPG:]" && $2 == "VALIDSIG" { print $3 ":" $NF }'
)
if [[ "${#PETCLAW_VALID_SIGNATURES[@]}" -ne 1 \
  || "${PETCLAW_VALID_SIGNATURES[0]:-}" != "${PETCLAW_RELEASE_SIGNING_SUBKEY_FINGERPRINT}:${PETCLAW_RELEASE_SIGNING_FINGERPRINT}" ]]; then
  echo "ERROR: release manifest was not signed by the pinned operator signing subkey." >&2
  exit 2
fi

python3 - "${PETCLAW_ARCHIVE}" "${PETCLAW_MAX_EXPANDED_BYTES}" <<'PY'
import pathlib
import sys
import tarfile

archive = sys.argv[1]
max_bytes = int(sys.argv[2])
seen: set[str] = set()
expanded = 0
with tarfile.open(archive, "r:gz") as bundle:
    for member in bundle:
        path = pathlib.PurePosixPath(member.name)
        if not member.name or path.is_absolute() or ".." in path.parts:
            raise SystemExit("unsafe archive path")
        if member.name in seen:
            raise SystemExit("duplicate archive member")
        seen.add(member.name)
        if not (member.isfile() or member.isdir()):
            raise SystemExit("links and special archive members are forbidden")
        expanded += member.size
        if expanded > max_bytes or len(seen) > 200_000:
            raise SystemExit("release archive expansion limit exceeded")
PY

PETCLAW_RELEASE_TARGET="${PETCLAW_VERIFIED_DIR}/${PETCLAW_RELEASE_ID}"
if [[ -e "${PETCLAW_RELEASE_TARGET}" || -L "${PETCLAW_RELEASE_TARGET}" ]]; then
  echo "ERROR: verified release already exists: ${PETCLAW_RELEASE_TARGET}" >&2
  exit 2
fi
PETCLAW_STAGE="$(mktemp -d "${PETCLAW_VERIFIED_DIR}/.verify-${PETCLAW_RELEASE_ID}.XXXXXX")"
tar --extract --gzip --file "${PETCLAW_ARCHIVE}" --directory "${PETCLAW_STAGE}" \
  --no-same-owner --no-same-permissions
if find "${PETCLAW_STAGE}" -type l -o -type f -links +1 | grep -q . \
  || find "${PETCLAW_STAGE}" -mindepth 1 ! -type f ! -type d -print -quit | grep -q .; then
  echo "ERROR: extracted release contains links, hard links, or special files." >&2
  exit 2
fi
for PETCLAW_REQUIRED_PATH in \
  deploy/ec2-release.sh \
  deploy/parse-database-url.mjs \
  deploy/verify-release-artifact.sh \
  deploy/scan-release-secrets.sh \
  deploy/check-release-migrations.sh \
  deploy/destructive-migrations.allowlist \
  deploy/crontab.example \
  deploy/install-crontab.sh \
  deploy/tests/crontab-installer.test.sh \
  deploy/nginx-conf.d-ratelimit.conf \
  deploy/nginx-petclaw.conf.template \
  deploy/ratelimit-guard.sh \
  deploy/TEAM-HANDOFF-20260722.md \
  deploy/server-ops/.monitor-config.example \
  deploy/server-ops/README.md \
  deploy/server-ops/archive-logs.sh \
  deploy/server-ops/db-backup.sh \
  deploy/server-ops/health-monitor.sh \
  deploy/server-ops/hourly-digest.sh \
  deploy/server-ops/llm-cost-watch.sh \
  deploy/server-ops/sybil-review-petclaw.sql \
  deploy/release-boot-guard.sh \
  deploy/release-rollback-watchdog.sh \
  web/scripts/season-starting-soon-contract.mjs \
  web/package-lock.json; do
  if [[ ! -f "${PETCLAW_STAGE}/${PETCLAW_REQUIRED_PATH}" \
    || -L "${PETCLAW_STAGE}/${PETCLAW_REQUIRED_PATH}" ]]; then
    echo "ERROR: signed release is missing ${PETCLAW_REQUIRED_PATH}." >&2
    exit 2
  fi
done

/bin/bash "${PETCLAW_TRUSTED_SCANNER}" "${PETCLAW_STAGE}"
/bin/bash "${PETCLAW_TRUSTED_MIGRATION_GATE}" \
  "${PETCLAW_STAGE}" "${PETCLAW_STAGE}/deploy/destructive-migrations.allowlist"

PETCLAW_MANIFEST_SHA="$(sha256sum "${PETCLAW_MANIFEST}" | awk '{print $1}')"
printf '%s\n' \
  'provenance_version=1' \
  "release_commit=${PETCLAW_RELEASE_COMMIT}" \
  "release_id=${PETCLAW_RELEASE_ID}" \
  "archive_sha256=${PETCLAW_ARCHIVE_ACTUAL_SHA}" \
  "manifest_sha256=${PETCLAW_MANIFEST_SHA}" \
  > "${PETCLAW_STAGE}/RELEASE_PROVENANCE"

chown -R root:root "${PETCLAW_STAGE}"
find "${PETCLAW_STAGE}" -type d -exec chmod 555 {} +
find "${PETCLAW_STAGE}" -type f -exec chmod 444 {} +

install -d -o root -g root -m 755 "${PETCLAW_TRUSTED_LIBEXEC}" /etc/petclaw
for PETCLAW_INSTALL_PAIR in \
  "deploy/ec2-release.sh:${PETCLAW_TRUSTED_CONTROLLER}" \
  "deploy/verify-release-artifact.sh:${PETCLAW_TRUSTED_VERIFIER}" \
  "deploy/scan-release-secrets.sh:${PETCLAW_TRUSTED_SCANNER}" \
  "deploy/check-release-migrations.sh:${PETCLAW_TRUSTED_MIGRATION_GATE}" \
  "deploy/release-boot-guard.sh:/usr/local/sbin/petclaw-release-boot-guard.sh"; do
  PETCLAW_INSTALL_SOURCE="${PETCLAW_INSTALL_PAIR%%:*}"
  PETCLAW_INSTALL_TARGET="${PETCLAW_INSTALL_PAIR#*:}"
  PETCLAW_INSTALL_TMP="${PETCLAW_INSTALL_TARGET}.next-${PETCLAW_RELEASE_ID}"
  install -o root -g root -m 755 "${PETCLAW_STAGE}/${PETCLAW_INSTALL_SOURCE}" "${PETCLAW_INSTALL_TMP}"
  mv -fT "${PETCLAW_INSTALL_TMP}" "${PETCLAW_INSTALL_TARGET}"
done

mv -T "${PETCLAW_STAGE}" "${PETCLAW_RELEASE_TARGET}"
PETCLAW_STAGE=""
sync -f "${PETCLAW_RELEASE_TARGET}"
sync -f "${PETCLAW_VERIFIED_DIR}"
echo "Verified release source: ${PETCLAW_RELEASE_TARGET}"
echo "release_id=${PETCLAW_RELEASE_ID}"
echo "release_commit=${PETCLAW_RELEASE_COMMIT}"

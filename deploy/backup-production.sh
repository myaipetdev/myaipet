#!/usr/bin/env bash
# Atomic PostgreSQL + local-upload backup for the EC2 production host.
#
# PETCLAW_BACKUP_DIR is mandatory and should be an off-host mounted filesystem
# (EFS/NFS/etc.). The script refuses the EC2 root filesystem unless an operator
# explicitly sets PETCLAW_ALLOW_SAME_DISK_BACKUP=1 for an emergency snapshot.
# Payloads are encrypted to a configured GPG recipient before atomic publish.
# Only complete, timestamp-named sets older than the retention window are pruned.

set -euo pipefail
umask 077

PETCLAW_BACKUP_DIR="${PETCLAW_BACKUP_DIR:-}"
PETCLAW_DATABASE_NAME="${PETCLAW_DATABASE_NAME:-petclaw}"
PETCLAW_UPLOAD_DIR="${PETCLAW_UPLOAD_DIR:-/opt/petclaw/uploads}"
PETCLAW_ALLOW_SAME_DISK_BACKUP="${PETCLAW_ALLOW_SAME_DISK_BACKUP:-0}"
PETCLAW_ENV_FILE="${PETCLAW_ENV_FILE:-/opt/petclaw/current/web/.env.production}"
PETCLAW_CURRENT_ENV_FILE="/opt/petclaw/current/web/.env.production"
PETCLAW_LEGACY_ENV_FILE="/opt/petclaw/aipet-project/web/.env.production"
PETCLAW_BACKUP_GPG_HOME="${PETCLAW_BACKUP_GPG_HOME:-/home/ubuntu/.gnupg}"
PETCLAW_BACKUP_GPG_RECIPIENT="${PETCLAW_BACKUP_GPG_RECIPIENT:-}"
PETCLAW_BACKUP_RETENTION_DAYS="${PETCLAW_BACKUP_RETENTION_DAYS:-90}"
PETCLAW_SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
PETCLAW_VERIFY_HELPER="${PETCLAW_SCRIPT_DIR}/verify-backup-snapshot.sh"
PETCLAW_RELEASE_LOCK="/run/petclaw-release/release.lock"
PETCLAW_BOOT_GUARD="/usr/local/sbin/petclaw-release-boot-guard.sh"
PETCLAW_STOPPED_APPS=()

petclaw_resume_apps() {
  for PETCLAW_APP in "${PETCLAW_STOPPED_APPS[@]}"; do
    pm2 restart "${PETCLAW_APP}" >/dev/null 2>&1 || true
  done
  PETCLAW_STOPPED_APPS=()
}

petclaw_quiesce_apps() {
  local PETCLAW_ONLINE_APPS=()
  # JavaScript template literals are passed verbatim.
  # shellcheck disable=SC2016
  mapfile -t PETCLAW_ONLINE_APPS < <(pm2 jlist | node -e '
    let raw = "";
    process.stdin.on("data", chunk => raw += chunk);
    process.stdin.on("end", () => {
      for (const proc of JSON.parse(raw || "[]")) {
        const name = String(proc.name || "");
        if (name.startsWith("petclaw-web") && proc.pm2_env?.status === "online") {
          process.stdout.write(`${name}\n`);
        }
      }
    });
  ')
  printf '%s\n' "${PETCLAW_ONLINE_APPS[@]}" > "${PETCLAW_PARTIAL_DIR}/stopped-apps"
  chmod 600 "${PETCLAW_PARTIAL_DIR}/stopped-apps"
  PETCLAW_PM2_BIN="$(command -v pm2)"
  if [[ ! "${PETCLAW_PM2_BIN}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
    echo "ERROR: invalid PM2 executable path." >&2
    return 2
  fi
  sudo systemd-run --quiet --collect --unit="${PETCLAW_AVAILABILITY_UNIT}" --on-active=2m \
    /bin/bash -c '
      partial="$1"; pm2_bin="$2"
      case "$(basename "$partial")" in .partial-[0-9]*T[0-9]*Z-*) ;; *) exit 2 ;; esac
      if [[ -d "$partial" && ! -L "$partial" ]]; then
        while IFS= read -r app; do
          [[ -n "$app" ]] && runuser -u ubuntu -- env PM2_HOME=/home/ubuntu/.pm2 "$pm2_bin" restart "$app" >/dev/null 2>&1 || true
        done < "$partial/stopped-apps"
        touch "$partial/WATCHDOG_FIRED"
      fi
    ' petclaw-recovery "${PETCLAW_PARTIAL_DIR}" "${PETCLAW_PM2_BIN}"
  PETCLAW_AVAILABILITY_ARMED=1
  sudo systemd-run --quiet --collect --unit="${PETCLAW_CLEANUP_UNIT}" --on-active=30m \
    /bin/bash -c '
      partial="$1"
      case "$(basename "$partial")" in .partial-[0-9]*T[0-9]*Z-*) ;; *) exit 2 ;; esac
      if [[ -d "$partial" && ! -L "$partial" ]]; then
        rm -f -- "$partial/petclaw-postgres.dump" "$partial/petclaw-uploads.tar.gz"
        if [[ -d "$partial/s3-uploads" && ! -L "$partial/s3-uploads" ]]; then rm -rf -- "$partial/s3-uploads"; fi
      fi
    ' petclaw-cleanup "${PETCLAW_PARTIAL_DIR}"
  PETCLAW_CLEANUP_ARMED=1
  for PETCLAW_APP in "${PETCLAW_ONLINE_APPS[@]}"; do
    PETCLAW_STOPPED_APPS+=("${PETCLAW_APP}")
    pm2 stop "${PETCLAW_APP}" >/dev/null
  done
}

if [[ "${PETCLAW_ENV_FILE}" == "${PETCLAW_CURRENT_ENV_FILE}" \
  && ! -f "${PETCLAW_ENV_FILE}" && -f "${PETCLAW_LEGACY_ENV_FILE}" ]]; then
  PETCLAW_ENV_FILE="${PETCLAW_LEGACY_ENV_FILE}"
fi

case "${PETCLAW_ENV_FILE}" in
  "${PETCLAW_CURRENT_ENV_FILE}") PETCLAW_EXPECTED_ENV_STAT=root:ubuntu:640 ;;
  "${PETCLAW_LEGACY_ENV_FILE}") PETCLAW_EXPECTED_ENV_STAT=ubuntu:ubuntu:600 ;;
  *)
    echo "ERROR: production env path is not one pinned current/legacy path." >&2
    exit 2
    ;;
esac
if [[ ! -f "${PETCLAW_ENV_FILE}" || -L "${PETCLAW_ENV_FILE}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_ENV_FILE}" 2>/dev/null || true)" != "${PETCLAW_EXPECTED_ENV_STAT}" ]]; then
  echo "ERROR: production env ownership/mode does not match ${PETCLAW_EXPECTED_ENV_STAT}: ${PETCLAW_ENV_FILE}" >&2
  exit 2
fi
set -a
# shellcheck disable=SC1090
source "${PETCLAW_ENV_FILE}"
set +a
PETCLAW_DATABASE_URL="${PETCLAW_DATABASE_URL:-${DATABASE_URL:-}}"
PETCLAW_STORAGE_PROVIDER="${STORAGE_PROVIDER:-local}"
PETCLAW_S3_BUCKET="${AWS_S3_BUCKET:-}"

if [[ -z "${PETCLAW_BACKUP_DIR}" ]]; then
  echo "ERROR: PETCLAW_BACKUP_DIR must point to an existing off-host mount." >&2
  exit 2
fi
if [[ ! -x "${PETCLAW_VERIFY_HELPER}" || -L "${PETCLAW_VERIFY_HELPER}" ]]; then
  echo "ERROR: backup restore-verification helper is missing or not executable." >&2
  exit 2
fi
if [[ -z "${PETCLAW_BACKUP_GPG_RECIPIENT}" \
  || ! "${PETCLAW_BACKUP_RETENTION_DAYS}" =~ ^[0-9]+$ ]] \
  || (( PETCLAW_BACKUP_RETENTION_DAYS < 1 || PETCLAW_BACKUP_RETENTION_DAYS > 3650 )); then
  echo "ERROR: a GPG recipient and retention between 1 and 3650 days are required." >&2
  exit 2
fi
if [[ ! -d "${PETCLAW_BACKUP_GPG_HOME}" || -L "${PETCLAW_BACKUP_GPG_HOME}" ]]; then
  echo "ERROR: GPG home must be an existing non-symlink directory." >&2
  exit 2
fi
command -v gpg >/dev/null 2>&1 || { echo "ERROR: gpg is required." >&2; exit 2; }
if ! gpg --homedir "${PETCLAW_BACKUP_GPG_HOME}" --batch --list-keys \
    "${PETCLAW_BACKUP_GPG_RECIPIENT}" >/dev/null 2>&1; then
  echo "ERROR: configured backup GPG public key was not found." >&2
  exit 2
fi
if [[ ! "${PETCLAW_DATABASE_NAME}" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "ERROR: PETCLAW_DATABASE_NAME contains unsupported characters." >&2
  exit 2
fi
if [[ ! -d "${PETCLAW_BACKUP_DIR}" || -L "${PETCLAW_BACKUP_DIR}" ]]; then
  echo "ERROR: backup destination must be an existing, non-symlink directory." >&2
  exit 2
fi
if [[ "${PETCLAW_STORAGE_PROVIDER}" == "local" && ! -d "${PETCLAW_UPLOAD_DIR}" ]]; then
  echo "ERROR: upload directory does not exist: ${PETCLAW_UPLOAD_DIR}" >&2
  exit 2
fi

PETCLAW_BACKUP_DIR="$(realpath -e "${PETCLAW_BACKUP_DIR}")"
if [[ "${PETCLAW_STORAGE_PROVIDER}" == "local" ]]; then
  PETCLAW_UPLOAD_DIR="$(realpath -e "${PETCLAW_UPLOAD_DIR}")"
elif [[ "${PETCLAW_STORAGE_PROVIDER}" == "s3" && -z "${PETCLAW_S3_BUCKET}" ]]; then
  echo "ERROR: AWS_S3_BUCKET is required for STORAGE_PROVIDER=s3." >&2
  exit 2
fi
chmod 700 "${PETCLAW_BACKUP_DIR}"

PETCLAW_ROOT_DEVICE="$(findmnt -n -o SOURCE -T /)"
PETCLAW_BACKUP_DEVICE="$(findmnt -n -o SOURCE -T "${PETCLAW_BACKUP_DIR}")"
if [[ "${PETCLAW_BACKUP_DEVICE}" == "${PETCLAW_ROOT_DEVICE}" && "${PETCLAW_ALLOW_SAME_DISK_BACKUP}" != "1" ]]; then
  echo "ERROR: backup destination is on the EC2 root filesystem; mount off-host storage first." >&2
  exit 2
fi

if [[ ! -x "${PETCLAW_BOOT_GUARD}" || -L "${PETCLAW_BOOT_GUARD}" \
  || "$(stat -c '%U:%G' "${PETCLAW_BOOT_GUARD}" 2>/dev/null || true)" != "root:root" ]]; then
  echo "ERROR: trusted release lock helper is unavailable." >&2
  exit 2
fi
sudo "${PETCLAW_BOOT_GUARD}" --ensure-lock
if [[ ! -f "${PETCLAW_RELEASE_LOCK}" || -L "${PETCLAW_RELEASE_LOCK}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_RELEASE_LOCK}" 2>/dev/null || true)" != "root:ubuntu:660" ]]; then
  echo "ERROR: shared release/backup lock is unsafe." >&2
  exit 2
fi
exec 8<>"${PETCLAW_RELEASE_LOCK}"
if ! flock -n 8; then
  echo "ERROR: a release or backup is already running." >&2
  exit 3
fi

exec 9>"${PETCLAW_BACKUP_DIR}/.backup.lock"
if ! flock -n 9; then
  echo "ERROR: another production backup is already running." >&2
  exit 3
fi
chmod 600 "${PETCLAW_BACKUP_DIR}/.backup.lock"

# Kernel locks vanish on SIGKILL. Remove only plaintext payloads/staging from
# older validated partial directories; retain encrypted artifacts and markers.
while IFS= read -r -d '' PETCLAW_STALE_PARTIAL; do
  PETCLAW_STALE_NAME="$(basename "${PETCLAW_STALE_PARTIAL}")"
  if [[ "${PETCLAW_STALE_NAME}" == .partial-[0-9]*T[0-9]*Z-* \
    && -d "${PETCLAW_STALE_PARTIAL}" && ! -L "${PETCLAW_STALE_PARTIAL}" ]]; then
    rm -f -- "${PETCLAW_STALE_PARTIAL}/petclaw-postgres.dump" \
      "${PETCLAW_STALE_PARTIAL}/petclaw-uploads.tar.gz"
    if [[ -d "${PETCLAW_STALE_PARTIAL}/s3-uploads" \
      && ! -L "${PETCLAW_STALE_PARTIAL}/s3-uploads" ]]; then
      rm -rf -- "${PETCLAW_STALE_PARTIAL}/s3-uploads"
    fi
  fi
done < <(find "${PETCLAW_BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d \
  -name '.partial-[0-9]*T[0-9]*Z-*' -print0)

PETCLAW_BACKUP_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PETCLAW_FINAL_DIR="${PETCLAW_BACKUP_DIR}/${PETCLAW_BACKUP_STAMP}"
if [[ -e "${PETCLAW_FINAL_DIR}" ]]; then
  echo "ERROR: backup destination already exists: ${PETCLAW_FINAL_DIR}" >&2
  exit 3
fi

PETCLAW_PARTIAL_DIR="$(mktemp -d "${PETCLAW_BACKUP_DIR}/.partial-${PETCLAW_BACKUP_STAMP}-XXXXXX")"
chmod 700 "${PETCLAW_PARTIAL_DIR}"
PETCLAW_RECOVERY_ID="${PETCLAW_BACKUP_STAMP//[^A-Za-z0-9]/}-$$"
PETCLAW_AVAILABILITY_UNIT="petclaw-backup-resume-${PETCLAW_RECOVERY_ID}"
PETCLAW_CLEANUP_UNIT="petclaw-backup-clean-${PETCLAW_RECOVERY_ID}"
PETCLAW_AVAILABILITY_ARMED=0
PETCLAW_CLEANUP_ARMED=0

petclaw_backup_exit() {
  PETCLAW_BACKUP_EXIT_CODE=$?
  petclaw_resume_apps
  if [[ "${PETCLAW_AVAILABILITY_ARMED}" == "1" ]]; then
    sudo systemctl stop "${PETCLAW_AVAILABILITY_UNIT}.timer" >/dev/null 2>&1 || true
  fi
  if [[ "${PETCLAW_CLEANUP_ARMED}" == "1" ]]; then
    sudo systemctl stop "${PETCLAW_CLEANUP_UNIT}.timer" >/dev/null 2>&1 || true
  fi
  if [[ ${PETCLAW_BACKUP_EXIT_CODE} -ne 0 ]]; then
    printf 'FAILED exit=%s utc=%s\n' "${PETCLAW_BACKUP_EXIT_CODE}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${PETCLAW_PARTIAL_DIR}/FAILED"
    chmod 600 "${PETCLAW_PARTIAL_DIR}/FAILED"
    rm -f -- "${PETCLAW_PARTIAL_DIR}/petclaw-postgres.dump" \
      "${PETCLAW_PARTIAL_DIR}/petclaw-uploads.tar.gz"
    if [[ -d "${PETCLAW_PARTIAL_DIR}/s3-uploads" && ! -L "${PETCLAW_PARTIAL_DIR}/s3-uploads" ]]; then
      rm -rf -- "${PETCLAW_PARTIAL_DIR}/s3-uploads"
    fi
    echo "ERROR: backup failed; partial evidence retained at ${PETCLAW_PARTIAL_DIR}" >&2
  fi
  exit "${PETCLAW_BACKUP_EXIT_CODE}"
}
trap petclaw_backup_exit EXIT

PETCLAW_DB_DUMP="${PETCLAW_PARTIAL_DIR}/petclaw-postgres.dump"
PETCLAW_UPLOAD_ARCHIVE="${PETCLAW_PARTIAL_DIR}/petclaw-uploads.tar.gz"
PETCLAW_RESTORE_LIST="${PETCLAW_PARTIAL_DIR}/petclaw-postgres.restore-list.txt"
PETCLAW_SNAPSHOT_VERIFICATION="${PETCLAW_PARTIAL_DIR}/snapshot-verification.env"

petclaw_quiesce_apps
if [[ -n "${PETCLAW_DATABASE_URL}" ]]; then
  pg_dump -Fc --no-owner --no-acl --dbname="${PETCLAW_DATABASE_URL}" > "${PETCLAW_DB_DUMP}"
else
  # Backwards-compatible single-box mode. RDS/remote deployments must provide
  # DATABASE_URL and never silently dump an unrelated local database.
  # ubuntu intentionally owns the private output file.
  # shellcheck disable=SC2024
  sudo -n -u postgres pg_dump -Fc --no-owner --no-acl --dbname="${PETCLAW_DATABASE_NAME}" > "${PETCLAW_DB_DUMP}"
fi
chmod 600 "${PETCLAW_DB_DUMP}"

if [[ "${PETCLAW_STORAGE_PROVIDER}" == "s3" ]]; then
  PETCLAW_S3_STAGE="${PETCLAW_PARTIAL_DIR}/s3-uploads"
  install -d -m 700 "${PETCLAW_S3_STAGE}"
  aws s3 sync "s3://${PETCLAW_S3_BUCKET}/uploads/" "${PETCLAW_S3_STAGE}/" --only-show-errors
  tar -C "${PETCLAW_S3_STAGE}" --numeric-owner -czf "${PETCLAW_UPLOAD_ARCHIVE}" .
  find "${PETCLAW_S3_STAGE}" -type f -delete
  find "${PETCLAW_S3_STAGE}" -depth -type d -empty -delete
else
  PETCLAW_UPLOAD_PARENT="$(dirname "${PETCLAW_UPLOAD_DIR}")"
  PETCLAW_UPLOAD_NAME="$(basename "${PETCLAW_UPLOAD_DIR}")"
  tar -C "${PETCLAW_UPLOAD_PARENT}" --numeric-owner -czf "${PETCLAW_UPLOAD_ARCHIVE}" "${PETCLAW_UPLOAD_NAME}"
fi
chmod 600 "${PETCLAW_UPLOAD_ARCHIVE}"
if [[ -e "${PETCLAW_PARTIAL_DIR}/WATCHDOG_FIRED" ]]; then
  echo "ERROR: backup snapshot exceeded the quiescence watchdog." >&2
  exit 4
fi
petclaw_resume_apps
sudo systemctl stop "${PETCLAW_AVAILABILITY_UNIT}.timer" >/dev/null 2>&1 || true
PETCLAW_AVAILABILITY_ARMED=0

pg_restore --list "${PETCLAW_DB_DUMP}" > "${PETCLAW_RESTORE_LIST}"
chmod 600 "${PETCLAW_RESTORE_LIST}"
if ! grep -Eq '^[0-9]+;' "${PETCLAW_RESTORE_LIST}"; then
  echo "ERROR: pg_restore did not find any restorable objects." >&2
  exit 4
fi
gzip -t "${PETCLAW_UPLOAD_ARCHIVE}"
"${PETCLAW_VERIFY_HELPER}" \
  "${PETCLAW_DB_DUMP}" "${PETCLAW_UPLOAD_ARCHIVE}" "${PETCLAW_SNAPSHOT_VERIFICATION}"
printf 'snapshot_quiesced=true\n' >> "${PETCLAW_SNAPSHOT_VERIFICATION}"
chmod 600 "${PETCLAW_SNAPSHOT_VERIFICATION}"
for PETCLAW_REQUIRED_PROOF in \
  'restore_verified=true' 'media_refs_verified=true' 'snapshot_quiesced=true'; do
  if ! grep -Fxq "${PETCLAW_REQUIRED_PROOF}" "${PETCLAW_SNAPSHOT_VERIFICATION}"; then
    echo "ERROR: snapshot verification proof is incomplete." >&2
    exit 4
  fi
done

(
  cd "${PETCLAW_PARTIAL_DIR}"
  sha256sum petclaw-postgres.dump petclaw-uploads.tar.gz \
    petclaw-postgres.restore-list.txt snapshot-verification.env > PLAINTEXT-SHA256SUMS
)
gpg --homedir "${PETCLAW_BACKUP_GPG_HOME}" --batch --yes --trust-model always \
  --recipient "${PETCLAW_BACKUP_GPG_RECIPIENT}" \
  --output "${PETCLAW_DB_DUMP}.gpg" --encrypt "${PETCLAW_DB_DUMP}"
gpg --homedir "${PETCLAW_BACKUP_GPG_HOME}" --batch --yes --trust-model always \
  --recipient "${PETCLAW_BACKUP_GPG_RECIPIENT}" \
  --output "${PETCLAW_UPLOAD_ARCHIVE}.gpg" --encrypt "${PETCLAW_UPLOAD_ARCHIVE}"
chmod 600 "${PETCLAW_DB_DUMP}.gpg" "${PETCLAW_UPLOAD_ARCHIVE}.gpg"
(
  cd "${PETCLAW_PARTIAL_DIR}"
  sha256sum petclaw-postgres.dump.gpg petclaw-uploads.tar.gz.gpg > CIPHERTEXT-SHA256SUMS
)
rm -f -- "${PETCLAW_DB_DUMP}" "${PETCLAW_UPLOAD_ARCHIVE}"
if [[ -d "${PETCLAW_PARTIAL_DIR}/s3-uploads" && ! -L "${PETCLAW_PARTIAL_DIR}/s3-uploads" ]]; then
  rm -rf -- "${PETCLAW_PARTIAL_DIR}/s3-uploads"
fi
sudo systemctl stop "${PETCLAW_CLEANUP_UNIT}.timer" >/dev/null 2>&1 || true
PETCLAW_CLEANUP_ARMED=0
printf 'complete_at_utc=%s\nencrypted=true\nsnapshot_quiesced=true\nrestore_verified=true\nmedia_refs_verified=true\ngpg_recipient=%s\nretention_days=%s\n' \
  "${PETCLAW_BACKUP_STAMP}" "${PETCLAW_BACKUP_GPG_RECIPIENT}" \
  "${PETCLAW_BACKUP_RETENTION_DAYS}" > "${PETCLAW_PARTIAL_DIR}/BACKUP_COMPLETE"
chmod 600 "${PETCLAW_PARTIAL_DIR}/PLAINTEXT-SHA256SUMS" \
  "${PETCLAW_PARTIAL_DIR}/CIPHERTEXT-SHA256SUMS" \
  "${PETCLAW_PARTIAL_DIR}/BACKUP_COMPLETE" "${PETCLAW_SNAPSHOT_VERIFICATION}"

mv "${PETCLAW_PARTIAL_DIR}" "${PETCLAW_FINAL_DIR}"
trap - EXIT
while IFS= read -r -d '' PETCLAW_EXPIRED_DIR; do
  PETCLAW_EXPIRED_NAME="$(basename "${PETCLAW_EXPIRED_DIR}")"
  if [[ "${PETCLAW_EXPIRED_NAME}" =~ ^[0-9]{8}T[0-9]{6}Z$ \
    && -d "${PETCLAW_EXPIRED_DIR}" && ! -L "${PETCLAW_EXPIRED_DIR}" \
    && -f "${PETCLAW_EXPIRED_DIR}/BACKUP_COMPLETE" ]]; then
    rm -rf -- "${PETCLAW_EXPIRED_DIR}"
  fi
done < <(find "${PETCLAW_BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d \
  -name '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z' \
  -mmin "+$(( PETCLAW_BACKUP_RETENTION_DAYS * 1440 - 1 ))" -print0)
echo "Backup complete: ${PETCLAW_FINAL_DIR}"

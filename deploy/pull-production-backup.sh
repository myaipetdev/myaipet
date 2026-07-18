#!/usr/bin/env bash
# Pull an atomic production backup to a separately controlled workstation.
# This is the safe fallback while the EC2 instance has no IAM role or off-host
# mount. Payloads are GPG-encrypted before the atomic publish, completed backup
# sets expire after the configured retention window. A mode-600 EC2 staging
# dump exists only inside the locked snapshot session and is removed by its
# trap after the paired stream completes.
set -euo pipefail
umask 077

PETCLAW_OFFHOST_DIR="${PETCLAW_OFFHOST_DIR:-}"
PETCLAW_SSH_KEY="${PETCLAW_SSH_KEY:-}"
PETCLAW_SSH_HOST="${PETCLAW_SSH_HOST:-ubuntu@app.myaipet.ai}"
PETCLAW_BACKUP_GPG_HOME="${PETCLAW_BACKUP_GPG_HOME:-}"
PETCLAW_BACKUP_GPG_RECIPIENT="${PETCLAW_BACKUP_GPG_RECIPIENT:-}"
PETCLAW_BACKUP_RETENTION_DAYS="${PETCLAW_BACKUP_RETENTION_DAYS:-90}"
PETCLAW_BACKUP_SIGNING_FINGERPRINT="0B286A30DC9C53D08CE5ABC72E2A4FDD17382A1F"
PETCLAW_SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
PETCLAW_VERIFY_HELPER="${PETCLAW_SCRIPT_DIR}/verify-backup-snapshot.sh"
PETCLAW_PUBLIC_KEY="${PETCLAW_SCRIPT_DIR}/backup-verification-public-key.asc"

if [[ -z "${PETCLAW_OFFHOST_DIR}" || -z "${PETCLAW_SSH_KEY}" \
  || -z "${PETCLAW_BACKUP_GPG_HOME}" || -z "${PETCLAW_BACKUP_GPG_RECIPIENT}" ]]; then
  echo "ERROR: off-host dir, SSH key, GPG home, and GPG recipient are required." >&2
  exit 2
fi
if [[ ! -d "${PETCLAW_OFFHOST_DIR}" || -L "${PETCLAW_OFFHOST_DIR}" ]]; then
  echo "ERROR: off-host destination must be an existing non-symlink directory." >&2
  exit 2
fi
if [[ ! -f "${PETCLAW_SSH_KEY}" || -L "${PETCLAW_SSH_KEY}" ]]; then
  echo "ERROR: SSH key must be an existing non-symlink file." >&2
  exit 2
fi
if [[ ! -d "${PETCLAW_BACKUP_GPG_HOME}" || -L "${PETCLAW_BACKUP_GPG_HOME}" ]]; then
  echo "ERROR: GPG home must be an existing non-symlink directory." >&2
  exit 2
fi
if [[ ! -f "${PETCLAW_VERIFY_HELPER}" || -L "${PETCLAW_VERIFY_HELPER}" \
  || ! -f "${PETCLAW_PUBLIC_KEY}" || -L "${PETCLAW_PUBLIC_KEY}" ]]; then
  echo "ERROR: backup restore-verification helper or public key is missing." >&2
  exit 2
fi
if [[ ! "${PETCLAW_BACKUP_RETENTION_DAYS}" =~ ^[0-9]+$ ]] \
  || (( PETCLAW_BACKUP_RETENTION_DAYS < 1 || PETCLAW_BACKUP_RETENTION_DAYS > 3650 )); then
  echo "ERROR: backup retention must be between 1 and 3650 days." >&2
  exit 2
fi
command -v gpg >/dev/null 2>&1 || { echo "ERROR: gpg is required." >&2; exit 2; }
chmod 700 "${PETCLAW_BACKUP_GPG_HOME}"
if ! gpg --homedir "${PETCLAW_BACKUP_GPG_HOME}" --batch --list-secret-keys \
    "${PETCLAW_BACKUP_SIGNING_FINGERPRINT}" >/dev/null 2>&1; then
  echo "ERROR: the backup recipient's secret key is required for restore verification." >&2
  exit 2
fi
PETCLAW_BACKUP_RECIPIENT_NORMALIZED="$(printf '%s' "${PETCLAW_BACKUP_GPG_RECIPIENT}" | tr '[:lower:]' '[:upper:]')"
if [[ "${PETCLAW_BACKUP_RECIPIENT_NORMALIZED}" != "${PETCLAW_BACKUP_SIGNING_FINGERPRINT}" ]]; then
  echo "ERROR: backup recipient must be the pinned production backup key." >&2
  exit 2
fi

PETCLAW_OFFHOST_DIR="$(cd "${PETCLAW_OFFHOST_DIR}" && pwd -P)"
PETCLAW_SSH_KEY="$(cd "$(dirname "${PETCLAW_SSH_KEY}")" && printf '%s/%s' "$(pwd -P)" "$(basename "${PETCLAW_SSH_KEY}")")"
chmod 700 "${PETCLAW_OFFHOST_DIR}"

PETCLAW_LOCK_DIR="${PETCLAW_OFFHOST_DIR}/.pull-backup.lock.d"
petclaw_acquire_lock() {
  if mkdir "${PETCLAW_LOCK_DIR}" 2>/dev/null; then
    printf '%s\n' "$$" > "${PETCLAW_LOCK_DIR}/pid"
    chmod 700 "${PETCLAW_LOCK_DIR}"
    chmod 600 "${PETCLAW_LOCK_DIR}/pid"
    return
  fi
  if [[ ! -d "${PETCLAW_LOCK_DIR}" || -L "${PETCLAW_LOCK_DIR}" ]]; then
    echo "ERROR: invalid pull-backup lock path." >&2
    exit 3
  fi
  PETCLAW_LOCK_PID="$(sed -n '1p' "${PETCLAW_LOCK_DIR}/pid" 2>/dev/null || true)"
  if [[ "${PETCLAW_LOCK_PID}" =~ ^[0-9]+$ ]] && kill -0 "${PETCLAW_LOCK_PID}" 2>/dev/null; then
    echo "ERROR: another pull backup is running (PID ${PETCLAW_LOCK_PID})." >&2
    exit 3
  fi
  # A dead recorded PID is an unambiguous SIGKILL remnant. If the writer died
  # before recording its PID, wait five minutes before reclaiming the directory.
  if [[ -z "${PETCLAW_LOCK_PID}" ]]; then
    PETCLAW_LOCK_MTIME="$(stat -f '%m' "${PETCLAW_LOCK_DIR}" 2>/dev/null || stat -c '%Y' "${PETCLAW_LOCK_DIR}")"
    if (( $(date +%s) - PETCLAW_LOCK_MTIME < 300 )); then
      echo "ERROR: pull-backup lock is being initialized; retry later." >&2
      exit 3
    fi
  fi
  rm -f -- "${PETCLAW_LOCK_DIR}/pid"
  rmdir "${PETCLAW_LOCK_DIR}"
  mkdir "${PETCLAW_LOCK_DIR}"
  printf '%s\n' "$$" > "${PETCLAW_LOCK_DIR}/pid"
  chmod 700 "${PETCLAW_LOCK_DIR}"
  chmod 600 "${PETCLAW_LOCK_DIR}/pid"
}
petclaw_release_lock() {
  rm -f -- "${PETCLAW_LOCK_DIR}/pid"
  rmdir "${PETCLAW_LOCK_DIR}" 2>/dev/null || true
}
petclaw_acquire_lock
trap petclaw_release_lock EXIT

# A previous SIGKILL may have predated the encrypted-stream design. With the
# kernel lock held there is no live writer, so remove only known plaintext
# payload names from validated partial directories and retain failure evidence.
while IFS= read -r -d '' PETCLAW_STALE_PARTIAL; do
  PETCLAW_STALE_NAME="$(basename "${PETCLAW_STALE_PARTIAL}")"
  if [[ "${PETCLAW_STALE_NAME}" == .partial-[0-9]*T[0-9]*Z-* \
    && -d "${PETCLAW_STALE_PARTIAL}" && ! -L "${PETCLAW_STALE_PARTIAL}" ]]; then
    rm -f -- "${PETCLAW_STALE_PARTIAL}/petclaw-postgres.dump" \
      "${PETCLAW_STALE_PARTIAL}/petclaw-uploads.tar.gz"
  fi
done < <(find "${PETCLAW_OFFHOST_DIR}" -mindepth 1 -maxdepth 1 -type d \
  -name '.partial-[0-9]*T[0-9]*Z-*' -print0)

PETCLAW_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PETCLAW_FINAL="${PETCLAW_OFFHOST_DIR}/${PETCLAW_STAMP}"
PETCLAW_PARTIAL="$(mktemp -d "${PETCLAW_OFFHOST_DIR}/.partial-${PETCLAW_STAMP}-XXXXXX")"
chmod 700 "${PETCLAW_PARTIAL}"

petclaw_failed() {
  PETCLAW_EXIT=$?
  if [[ ${PETCLAW_EXIT} -ne 0 ]]; then
    printf 'FAILED exit=%s utc=%s\n' "${PETCLAW_EXIT}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${PETCLAW_PARTIAL}/FAILED"
    chmod 600 "${PETCLAW_PARTIAL}/FAILED"
    # A failed partial is not a usable backup. Retain the failure evidence but
    # never strand plaintext production data on the workstation.
    rm -f -- "${PETCLAW_PARTIAL}/petclaw-postgres.dump" \
      "${PETCLAW_PARTIAL}/petclaw-uploads.tar.gz"
    echo "ERROR: pull backup failed; evidence retained at ${PETCLAW_PARTIAL}" >&2
  fi
  petclaw_release_lock
  exit "${PETCLAW_EXIT}"
}
trap petclaw_failed EXIT

PETCLAW_SSH=(ssh -i "${PETCLAW_SSH_KEY}" -o BatchMode=yes -o ConnectTimeout=15 "${PETCLAW_SSH_HOST}")
PETCLAW_SCP=(scp -q -i "${PETCLAW_SSH_KEY}" -o BatchMode=yes -o ConnectTimeout=15)
PETCLAW_DB_CIPHER="${PETCLAW_PARTIAL}/petclaw-postgres.dump.gpg"
PETCLAW_MEDIA_CIPHER="${PETCLAW_PARTIAL}/petclaw-uploads.tar.gz.gpg"
PETCLAW_RESTORE_LIST="${PETCLAW_PARTIAL}/petclaw-postgres.restore-list.txt"
PETCLAW_SNAPSHOT_VERIFICATION="${PETCLAW_PARTIAL}/snapshot-verification.env"
PETCLAW_REMOTE_HELPER="/tmp/petclaw-backup-verify-${PETCLAW_STAMP}.sh"
PETCLAW_REMOTE_PUBLIC_KEY="/tmp/petclaw-backup-key-${PETCLAW_STAMP}.asc"

"${PETCLAW_SCP[@]}" "${PETCLAW_VERIFY_HELPER}" "${PETCLAW_SSH_HOST}:${PETCLAW_REMOTE_HELPER}"
"${PETCLAW_SCP[@]}" "${PETCLAW_PUBLIC_KEY}" "${PETCLAW_SSH_HOST}:${PETCLAW_REMOTE_PUBLIC_KEY}"

# One remote session owns the release lock, quiesces every online PetClaw app
# process, captures DB + media, resumes the app, performs an actual temporary-DB
# restore, and streams the paired files. The remote trap resumes processes and
# removes plaintext staging even if the SSH connection breaks.
"${PETCLAW_SSH[@]}" bash -s -- \
  "${PETCLAW_REMOTE_HELPER}" "${PETCLAW_REMOTE_PUBLIC_KEY}" \
  "${PETCLAW_BACKUP_SIGNING_FINGERPRINT}" <<'REMOTE_SNAPSHOT' \
  | tar -C "${PETCLAW_PARTIAL}" -xf -
set -euo pipefail
umask 077
PETCLAW_REMOTE_HELPER="$1"
PETCLAW_REMOTE_PUBLIC_KEY="$2"
PETCLAW_BACKUP_RECIPIENT="$3"
PETCLAW_RELEASE_LOCK=/run/petclaw-release/release.lock
PETCLAW_BOOT_GUARD=/usr/local/sbin/petclaw-release-boot-guard.sh
PETCLAW_REMOTE_STAGE_ROOT=/opt/petclaw/backup-staging
if [[ ! -x "${PETCLAW_BOOT_GUARD}" || -L "${PETCLAW_BOOT_GUARD}" \
  || "$(stat -c '%U:%G' "${PETCLAW_BOOT_GUARD}" 2>/dev/null || true)" != root:root ]]; then
  echo "ERROR: trusted release lock helper is unavailable." >&2
  exit 2
fi
sudo "${PETCLAW_BOOT_GUARD}" --ensure-lock
if [[ ! -f "${PETCLAW_RELEASE_LOCK}" || -L "${PETCLAW_RELEASE_LOCK}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_RELEASE_LOCK}" 2>/dev/null || true)" != root:ubuntu:660 ]]; then
  echo "ERROR: shared release/backup lock is unsafe." >&2
  exit 2
fi
if [[ ! -d "${PETCLAW_REMOTE_STAGE_ROOT}" || -L "${PETCLAW_REMOTE_STAGE_ROOT}" \
  || "$(realpath -e "${PETCLAW_REMOTE_STAGE_ROOT}")" != "${PETCLAW_REMOTE_STAGE_ROOT}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_REMOTE_STAGE_ROOT}")" != ubuntu:ubuntu:700 ]]; then
  echo "ERROR: pinned remote backup staging directory is unsafe." >&2
  exit 2
fi
exec 9<>"${PETCLAW_RELEASE_LOCK}"
if ! flock -n 9; then
  echo "ERROR: a release or backup is already running." >&2
  exit 3
fi
# Recover and clean stages left by a killed older backup before opening a new
# quiescence window. The release lock proves no healthy backup/release owns one.
while IFS= read -r -d '' PETCLAW_STALE_STAGE; do
  PETCLAW_STALE_NAME="$(basename "${PETCLAW_STALE_STAGE}")"
  if [[ "${PETCLAW_STALE_NAME}" == .backup-stage-* \
    && -d "${PETCLAW_STALE_STAGE}" && ! -L "${PETCLAW_STALE_STAGE}" ]]; then
    if [[ -f "${PETCLAW_STALE_STAGE}/stopped-apps" ]]; then
      while IFS= read -r PETCLAW_STALE_APP; do
        [[ -n "${PETCLAW_STALE_APP}" ]] && pm2 restart "${PETCLAW_STALE_APP}" >&2 || true
      done < "${PETCLAW_STALE_STAGE}/stopped-apps"
    fi
    rm -rf -- "${PETCLAW_STALE_STAGE}"
  fi
done < <(find "${PETCLAW_REMOTE_STAGE_ROOT}" -mindepth 1 -maxdepth 1 -type d -name '.backup-stage-*' -print0)
PETCLAW_REMOTE_STAGE="$(mktemp -d "${PETCLAW_REMOTE_STAGE_ROOT}/.backup-stage-XXXXXX")"
chmod 700 "${PETCLAW_REMOTE_STAGE}"
PETCLAW_STOPPED_APPS=()
PETCLAW_RECOVERY_ID="$(basename "${PETCLAW_REMOTE_STAGE}" | tr -cd 'A-Za-z0-9_-')"
PETCLAW_AVAILABILITY_UNIT="petclaw-backup-resume-${PETCLAW_RECOVERY_ID}"
PETCLAW_CLEANUP_UNIT="petclaw-backup-clean-${PETCLAW_RECOVERY_ID}"
PETCLAW_AVAILABILITY_ARMED=0
PETCLAW_CLEANUP_ARMED=0

petclaw_resume_apps() {
  for PETCLAW_APP in "${PETCLAW_STOPPED_APPS[@]}"; do
    pm2 restart "${PETCLAW_APP}" >&2 || true
  done
  PETCLAW_STOPPED_APPS=()
}

petclaw_remote_cleanup() {
  PETCLAW_REMOTE_EXIT=$?
  trap - EXIT HUP INT TERM
  petclaw_resume_apps
  if [[ "${PETCLAW_AVAILABILITY_ARMED}" == "1" ]]; then
    sudo systemctl stop "${PETCLAW_AVAILABILITY_UNIT}.timer" >/dev/null 2>&1 || true
  fi
  if [[ "${PETCLAW_CLEANUP_ARMED}" == "1" ]]; then
    sudo systemctl stop "${PETCLAW_CLEANUP_UNIT}.timer" >/dev/null 2>&1 || true
  fi
  rm -rf -- "${PETCLAW_REMOTE_STAGE}"
  rm -f -- "${PETCLAW_REMOTE_HELPER}"
  rm -f -- "${PETCLAW_REMOTE_PUBLIC_KEY}"
  exit "${PETCLAW_REMOTE_EXIT}"
}
trap petclaw_remote_cleanup EXIT HUP INT TERM

if [[ ! -f "${PETCLAW_REMOTE_HELPER}" || -L "${PETCLAW_REMOTE_HELPER}" \
  || ! -f "${PETCLAW_REMOTE_PUBLIC_KEY}" || -L "${PETCLAW_REMOTE_PUBLIC_KEY}" ]]; then
  echo "ERROR: remote verification helper or public key is missing." >&2
  exit 2
fi
chmod 700 "${PETCLAW_REMOTE_HELPER}"
chmod 600 "${PETCLAW_REMOTE_PUBLIC_KEY}"

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
printf '%s\n' "${PETCLAW_ONLINE_APPS[@]}" > "${PETCLAW_REMOTE_STAGE}/stopped-apps"
chmod 600 "${PETCLAW_REMOTE_STAGE}/stopped-apps"
PETCLAW_PM2_BIN="$(command -v pm2)"
if [[ ! "${PETCLAW_PM2_BIN}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "ERROR: invalid PM2 executable path." >&2
  exit 2
fi

# A SIGKILL cannot run a shell trap. Independent transient timers restore every
# process that was online and mark the snapshot invalid after two minutes, then
# remove any surviving plaintext stage after thirty minutes.
sudo systemd-run --quiet --collect --unit="${PETCLAW_AVAILABILITY_UNIT}" --on-active=2m \
  /bin/bash -c '
    stage="$1"; pm2_bin="$2"
    case "$stage" in /opt/petclaw/backup-staging/.backup-stage-*) ;; *) exit 2 ;; esac
    if [[ -d "$stage" && ! -L "$stage" ]]; then
      while IFS= read -r app; do
        [[ -n "$app" ]] && runuser -u ubuntu -- env PM2_HOME=/home/ubuntu/.pm2 "$pm2_bin" restart "$app" >/dev/null 2>&1 || true
      done < "$stage/stopped-apps"
      touch "$stage/WATCHDOG_FIRED"
    fi
  ' petclaw-recovery "${PETCLAW_REMOTE_STAGE}" "${PETCLAW_PM2_BIN}"
PETCLAW_AVAILABILITY_ARMED=1
sudo systemd-run --quiet --collect --unit="${PETCLAW_CLEANUP_UNIT}" --on-active=30m \
  /bin/bash -c '
    stage="$1"
    case "$stage" in /opt/petclaw/backup-staging/.backup-stage-*) ;; *) exit 2 ;; esac
    if [[ -d "$stage" && ! -L "$stage" ]]; then rm -rf -- "$stage"; fi
  ' petclaw-cleanup "${PETCLAW_REMOTE_STAGE}"
PETCLAW_CLEANUP_ARMED=1

for PETCLAW_APP in "${PETCLAW_ONLINE_APPS[@]}"; do
  PETCLAW_STOPPED_APPS+=("${PETCLAW_APP}")
  pm2 stop "${PETCLAW_APP}" >&2
done

PETCLAW_ENV_FILE=/opt/petclaw/current/web/.env.production
if [[ ! -f "${PETCLAW_ENV_FILE}" ]]; then
  PETCLAW_ENV_FILE=/opt/petclaw/aipet-project/web/.env.production
fi
case "${PETCLAW_ENV_FILE}" in
  /opt/petclaw/current/web/.env.production) PETCLAW_EXPECTED_ENV_STAT=root:ubuntu:640 ;;
  /opt/petclaw/aipet-project/web/.env.production) PETCLAW_EXPECTED_ENV_STAT=ubuntu:ubuntu:600 ;;
  *) echo "ERROR: production env path is not pinned." >&2; exit 2 ;;
esac
if [[ ! -f "${PETCLAW_ENV_FILE}" || -L "${PETCLAW_ENV_FILE}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_ENV_FILE}" 2>/dev/null || true)" != "${PETCLAW_EXPECTED_ENV_STAT}" ]]; then
  echo "ERROR: production env ownership/mode does not match ${PETCLAW_EXPECTED_ENV_STAT}." >&2
  exit 2
fi
set -a
source "${PETCLAW_ENV_FILE}"
set +a
if [[ "${STORAGE_PROVIDER:-local}" != "local" ]]; then
  echo "ERROR: workstation pull backup currently requires STORAGE_PROVIDER=local; use the mounted server backup for S3." >&2
  exit 2
fi
if [[ ! -d /opt/petclaw/uploads || -L /opt/petclaw/uploads ]]; then
  echo "ERROR: local upload directory is missing or is a symlink." >&2
  exit 2
fi
pg_dump -Fc --no-owner --no-acl --dbname="$DATABASE_URL" \
  > "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.dump"
tar -C /opt/petclaw --numeric-owner -czf \
  "${PETCLAW_REMOTE_STAGE}/petclaw-uploads.tar.gz" uploads
chmod 600 "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.dump" \
  "${PETCLAW_REMOTE_STAGE}/petclaw-uploads.tar.gz"
if [[ -e "${PETCLAW_REMOTE_STAGE}/WATCHDOG_FIRED" ]]; then
  echo "ERROR: backup snapshot exceeded the quiescence watchdog." >&2
  exit 4
fi

# The consistency-critical copy is complete. Resume serving before the more
# expensive restore drill and transfer.
petclaw_resume_apps
sudo systemctl stop "${PETCLAW_AVAILABILITY_UNIT}.timer" >/dev/null 2>&1 || true
PETCLAW_AVAILABILITY_ARMED=0
"${PETCLAW_REMOTE_HELPER}" \
  "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.dump" \
  "${PETCLAW_REMOTE_STAGE}/petclaw-uploads.tar.gz" \
  "${PETCLAW_REMOTE_STAGE}/snapshot-verification.env"
printf 'snapshot_quiesced=true\n' >> "${PETCLAW_REMOTE_STAGE}/snapshot-verification.env"

pg_restore --list "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.dump" \
  > "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.restore-list.txt"
PETCLAW_REMOTE_DB_SHA="$(sha256sum "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.dump" | awk '{print $1}')"
PETCLAW_REMOTE_MEDIA_SHA="$(sha256sum "${PETCLAW_REMOTE_STAGE}/petclaw-uploads.tar.gz" | awk '{print $1}')"
PETCLAW_REMOTE_GPG_HOME="${PETCLAW_REMOTE_STAGE}/gnupg"
install -d -m 700 "${PETCLAW_REMOTE_GPG_HOME}"
gpg --homedir "${PETCLAW_REMOTE_GPG_HOME}" --batch --quiet --import "${PETCLAW_REMOTE_PUBLIC_KEY}"
if ! gpg --homedir "${PETCLAW_REMOTE_GPG_HOME}" --batch --with-colons --fingerprint \
  | grep -Fq "fpr:::::::::${PETCLAW_BACKUP_RECIPIENT}:"; then
  echo "ERROR: uploaded backup encryption key has the wrong fingerprint." >&2
  exit 5
fi
gpg --homedir "${PETCLAW_REMOTE_GPG_HOME}" --batch --yes --trust-model always \
  --recipient "${PETCLAW_BACKUP_RECIPIENT}" \
  --output "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.dump.gpg" \
  --encrypt "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.dump"
gpg --homedir "${PETCLAW_REMOTE_GPG_HOME}" --batch --yes --trust-model always \
  --recipient "${PETCLAW_BACKUP_RECIPIENT}" \
  --output "${PETCLAW_REMOTE_STAGE}/petclaw-uploads.tar.gz.gpg" \
  --encrypt "${PETCLAW_REMOTE_STAGE}/petclaw-uploads.tar.gz"
PETCLAW_REMOTE_DB_CIPHER_SHA="$(sha256sum "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.dump.gpg" | awk '{print $1}')"
PETCLAW_REMOTE_MEDIA_CIPHER_SHA="$(sha256sum "${PETCLAW_REMOTE_STAGE}/petclaw-uploads.tar.gz.gpg" | awk '{print $1}')"
printf 'database_sha256=%s\nmedia_sha256=%s\ndatabase_cipher_sha256=%s\nmedia_cipher_sha256=%s\nencrypted=true\ngpg_recipient=%s\n' \
  "${PETCLAW_REMOTE_DB_SHA}" "${PETCLAW_REMOTE_MEDIA_SHA}" \
  "${PETCLAW_REMOTE_DB_CIPHER_SHA}" "${PETCLAW_REMOTE_MEDIA_CIPHER_SHA}" \
  "${PETCLAW_BACKUP_RECIPIENT}" >> "${PETCLAW_REMOTE_STAGE}/snapshot-verification.env"
chmod 600 "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.dump.gpg" \
  "${PETCLAW_REMOTE_STAGE}/petclaw-uploads.tar.gz.gpg" \
  "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.restore-list.txt" \
  "${PETCLAW_REMOTE_STAGE}/snapshot-verification.env"
rm -f -- "${PETCLAW_REMOTE_STAGE}/petclaw-postgres.dump" \
  "${PETCLAW_REMOTE_STAGE}/petclaw-uploads.tar.gz"
rm -rf -- "${PETCLAW_REMOTE_GPG_HOME}"

tar -C "${PETCLAW_REMOTE_STAGE}" -cf - \
  petclaw-postgres.dump.gpg petclaw-uploads.tar.gz.gpg \
  petclaw-postgres.restore-list.txt snapshot-verification.env
REMOTE_SNAPSHOT

chmod 600 "${PETCLAW_DB_CIPHER}" "${PETCLAW_MEDIA_CIPHER}" \
  "${PETCLAW_RESTORE_LIST}" "${PETCLAW_SNAPSHOT_VERIFICATION}"
for PETCLAW_REQUIRED_PROOF in \
  'restore_verified=true' 'media_refs_verified=true' 'snapshot_quiesced=true'; do
  if ! grep -Fxq "${PETCLAW_REQUIRED_PROOF}" "${PETCLAW_SNAPSHOT_VERIFICATION}"; then
    echo "ERROR: snapshot verification proof is incomplete." >&2
    exit 4
  fi
done

if ! grep -Eq '^[0-9]+;' "${PETCLAW_RESTORE_LIST}"; then
  echo "ERROR: database dump has no restorable objects." >&2
  exit 4
fi

petclaw_snapshot_hash() {
  local PETCLAW_FIELD="$1"
  local PETCLAW_VALUE
  if [[ "$(grep -Ec "^${PETCLAW_FIELD}=[0-9a-f]{64}$" "${PETCLAW_SNAPSHOT_VERIFICATION}" || true)" != "1" ]]; then
    echo "ERROR: snapshot proof has invalid ${PETCLAW_FIELD}." >&2
    exit 5
  fi
  PETCLAW_VALUE="$(sed -n "s/^${PETCLAW_FIELD}=//p" "${PETCLAW_SNAPSHOT_VERIFICATION}")"
  printf '%s' "${PETCLAW_VALUE}"
}
PETCLAW_DB_SHA="$(petclaw_snapshot_hash database_sha256)"
PETCLAW_MEDIA_SHA="$(petclaw_snapshot_hash media_sha256)"
PETCLAW_DB_CIPHER_EXPECTED_SHA="$(petclaw_snapshot_hash database_cipher_sha256)"
PETCLAW_MEDIA_CIPHER_EXPECTED_SHA="$(petclaw_snapshot_hash media_cipher_sha256)"
if ! grep -Fxq 'encrypted=true' "${PETCLAW_SNAPSHOT_VERIFICATION}" \
  || ! grep -Fxq "gpg_recipient=${PETCLAW_BACKUP_SIGNING_FINGERPRINT}" "${PETCLAW_SNAPSHOT_VERIFICATION}"; then
  echo "ERROR: remote snapshot was not encrypted to the pinned key." >&2
  exit 5
fi

# Verify the encrypted copies by decrypting to the hash pipeline, never to disk.
if command -v sha256sum >/dev/null 2>&1; then
  PETCLAW_DB_DECRYPTED_SHA="$(gpg --homedir "${PETCLAW_BACKUP_GPG_HOME}" --batch --quiet --decrypt "${PETCLAW_DB_CIPHER}" | sha256sum | awk '{print $1}')"
  PETCLAW_MEDIA_DECRYPTED_SHA="$(gpg --homedir "${PETCLAW_BACKUP_GPG_HOME}" --batch --quiet --decrypt "${PETCLAW_MEDIA_CIPHER}" | sha256sum | awk '{print $1}')"
  PETCLAW_DB_CIPHER_ACTUAL_SHA="$(sha256sum "${PETCLAW_DB_CIPHER}" | awk '{print $1}')"
  PETCLAW_MEDIA_CIPHER_ACTUAL_SHA="$(sha256sum "${PETCLAW_MEDIA_CIPHER}" | awk '{print $1}')"
else
  PETCLAW_DB_DECRYPTED_SHA="$(gpg --homedir "${PETCLAW_BACKUP_GPG_HOME}" --batch --quiet --decrypt "${PETCLAW_DB_CIPHER}" | shasum -a 256 | awk '{print $1}')"
  PETCLAW_MEDIA_DECRYPTED_SHA="$(gpg --homedir "${PETCLAW_BACKUP_GPG_HOME}" --batch --quiet --decrypt "${PETCLAW_MEDIA_CIPHER}" | shasum -a 256 | awk '{print $1}')"
  PETCLAW_DB_CIPHER_ACTUAL_SHA="$(shasum -a 256 "${PETCLAW_DB_CIPHER}" | awk '{print $1}')"
  PETCLAW_MEDIA_CIPHER_ACTUAL_SHA="$(shasum -a 256 "${PETCLAW_MEDIA_CIPHER}" | awk '{print $1}')"
fi
if [[ "${PETCLAW_DB_DECRYPTED_SHA}" != "${PETCLAW_DB_SHA}" \
  || "${PETCLAW_MEDIA_DECRYPTED_SHA}" != "${PETCLAW_MEDIA_SHA}" \
  || "${PETCLAW_DB_CIPHER_ACTUAL_SHA}" != "${PETCLAW_DB_CIPHER_EXPECTED_SHA}" \
  || "${PETCLAW_MEDIA_CIPHER_ACTUAL_SHA}" != "${PETCLAW_MEDIA_CIPHER_EXPECTED_SHA}" ]]; then
  echo "ERROR: encrypted backup restore verification failed." >&2
  exit 5
fi
PETCLAW_DB_CIPHER_SHA="${PETCLAW_DB_CIPHER_EXPECTED_SHA}"
PETCLAW_MEDIA_CIPHER_SHA="${PETCLAW_MEDIA_CIPHER_EXPECTED_SHA}"

printf '%s  %s\n%s  %s\n' \
  "${PETCLAW_DB_SHA}" petclaw-postgres.dump \
  "${PETCLAW_MEDIA_SHA}" petclaw-uploads.tar.gz \
  > "${PETCLAW_PARTIAL}/PLAINTEXT-SHA256SUMS"

printf '%s  %s\n%s  %s\n' \
  "${PETCLAW_DB_CIPHER_SHA}" "$(basename "${PETCLAW_DB_CIPHER}")" \
  "${PETCLAW_MEDIA_CIPHER_SHA}" "$(basename "${PETCLAW_MEDIA_CIPHER}")" \
  > "${PETCLAW_PARTIAL}/CIPHERTEXT-SHA256SUMS"

printf 'complete_at_utc=%s\n' "${PETCLAW_STAMP}" > "${PETCLAW_PARTIAL}/BACKUP_COMPLETE"
if command -v sha256sum >/dev/null 2>&1; then
  PETCLAW_COMPLETE_SHA="$(sha256sum "${PETCLAW_PARTIAL}/BACKUP_COMPLETE" | awk '{print $1}')"
else
  PETCLAW_COMPLETE_SHA="$(shasum -a 256 "${PETCLAW_PARTIAL}/BACKUP_COMPLETE" | awk '{print $1}')"
fi

printf 'receipt_version=2\nverified_at_utc=%s\ndatabase_sha256=%s\nmedia_sha256=%s\ndatabase_cipher_sha256=%s\nmedia_cipher_sha256=%s\nbackup_complete_sha256=%s\nencrypted=true\nsnapshot_quiesced=true\nrestore_verified=true\nmedia_refs_verified=true\ngpg_recipient=%s\nretention_days=%s\noff_host_path=%s\n' \
  "${PETCLAW_STAMP}" "${PETCLAW_DB_SHA}" "${PETCLAW_MEDIA_SHA}" \
  "${PETCLAW_DB_CIPHER_SHA}" "${PETCLAW_MEDIA_CIPHER_SHA}" "${PETCLAW_COMPLETE_SHA}" \
  "${PETCLAW_BACKUP_GPG_RECIPIENT}" "${PETCLAW_BACKUP_RETENTION_DAYS}" "${PETCLAW_FINAL}" \
  > "${PETCLAW_PARTIAL}/release-receipt.env"
gpg --homedir "${PETCLAW_BACKUP_GPG_HOME}" --batch --yes \
  --local-user "${PETCLAW_BACKUP_SIGNING_FINGERPRINT}" \
  --output "${PETCLAW_PARTIAL}/release-receipt.env.sig" \
  --detach-sign "${PETCLAW_PARTIAL}/release-receipt.env"
gpg --homedir "${PETCLAW_BACKUP_GPG_HOME}" --batch --verify \
  "${PETCLAW_PARTIAL}/release-receipt.env.sig" \
  "${PETCLAW_PARTIAL}/release-receipt.env" >/dev/null 2>&1
chmod 600 "${PETCLAW_PARTIAL}/PLAINTEXT-SHA256SUMS" \
  "${PETCLAW_PARTIAL}/CIPHERTEXT-SHA256SUMS" \
  "${PETCLAW_PARTIAL}/release-receipt.env" \
  "${PETCLAW_PARTIAL}/release-receipt.env.sig" \
  "${PETCLAW_PARTIAL}/BACKUP_COMPLETE" "${PETCLAW_SNAPSHOT_VERIFICATION}"

mv "${PETCLAW_PARTIAL}" "${PETCLAW_FINAL}"
petclaw_release_lock
trap - EXIT

# Prune only complete, timestamp-named backup sets below the validated root.
# Partial/failed evidence and unrelated directories are never deletion targets.
while IFS= read -r -d '' PETCLAW_EXPIRED; do
  PETCLAW_EXPIRED_NAME="$(basename "${PETCLAW_EXPIRED}")"
  if [[ "${PETCLAW_EXPIRED_NAME}" =~ ^[0-9]{8}T[0-9]{6}Z$ \
    && -d "${PETCLAW_EXPIRED}" && ! -L "${PETCLAW_EXPIRED}" \
    && -f "${PETCLAW_EXPIRED}/BACKUP_COMPLETE" ]]; then
    rm -rf -- "${PETCLAW_EXPIRED}"
  fi
done < <(find "${PETCLAW_OFFHOST_DIR}" -mindepth 1 -maxdepth 1 -type d \
  -name '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z' \
  -mmin "+$(( PETCLAW_BACKUP_RETENTION_DAYS * 1440 - 1 ))" -print0)
echo "Off-host backup verified: ${PETCLAW_FINAL}"

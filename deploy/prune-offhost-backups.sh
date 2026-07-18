#!/usr/bin/env bash
# Independent retention enforcement for workstation-held production backups.
# This runs separately from snapshot creation, so expired sets are removed even
# when a later backup fails before reaching its own cleanup phase.
set -euo pipefail
umask 077

PETCLAW_OFFHOST_DIR="${PETCLAW_OFFHOST_DIR:-}"
PETCLAW_BACKUP_RETENTION_DAYS="${PETCLAW_BACKUP_RETENTION_DAYS:-90}"

if [[ -z "${PETCLAW_OFFHOST_DIR}" || ! -d "${PETCLAW_OFFHOST_DIR}" \
  || -L "${PETCLAW_OFFHOST_DIR}" ]]; then
  echo "ERROR: off-host destination must be an existing non-symlink directory." >&2
  exit 2
fi
if [[ ! "${PETCLAW_BACKUP_RETENTION_DAYS}" =~ ^[0-9]+$ ]] \
  || (( PETCLAW_BACKUP_RETENTION_DAYS < 1 || PETCLAW_BACKUP_RETENTION_DAYS > 3650 )); then
  echo "ERROR: backup retention must be between 1 and 3650 days." >&2
  exit 2
fi

PETCLAW_OFFHOST_DIR="$(cd "${PETCLAW_OFFHOST_DIR}" && pwd -P)"
PETCLAW_LOCK_DIR="${PETCLAW_OFFHOST_DIR}/.pull-backup.lock.d"
petclaw_acquire_lock() {
  if mkdir "${PETCLAW_LOCK_DIR}" 2>/dev/null; then
    printf '%s\n' "$$" > "${PETCLAW_LOCK_DIR}/pid"
    chmod 700 "${PETCLAW_LOCK_DIR}"
    chmod 600 "${PETCLAW_LOCK_DIR}/pid"
    return
  fi
  if [[ ! -d "${PETCLAW_LOCK_DIR}" || -L "${PETCLAW_LOCK_DIR}" ]]; then
    echo "ERROR: invalid retention lock path." >&2
    exit 3
  fi
  PETCLAW_LOCK_PID="$(sed -n '1p' "${PETCLAW_LOCK_DIR}/pid" 2>/dev/null || true)"
  if [[ "${PETCLAW_LOCK_PID}" =~ ^[0-9]+$ ]] && kill -0 "${PETCLAW_LOCK_PID}" 2>/dev/null; then
    echo "Backup retention skipped: snapshot job is active." >&2
    exit 0
  fi
  PETCLAW_LOCK_MTIME="$(stat -f '%m' "${PETCLAW_LOCK_DIR}" 2>/dev/null || stat -c '%Y' "${PETCLAW_LOCK_DIR}")"
  if [[ -z "${PETCLAW_LOCK_PID}" ]] && (( $(date +%s) - PETCLAW_LOCK_MTIME < 300 )); then
    echo "Backup retention skipped: snapshot lock is being initialized." >&2
    exit 0
  fi
  find "${PETCLAW_LOCK_DIR}" -mindepth 1 -maxdepth 1 -type f -name pid -delete
  rmdir "${PETCLAW_LOCK_DIR}"
  mkdir "${PETCLAW_LOCK_DIR}"
  printf '%s\n' "$$" > "${PETCLAW_LOCK_DIR}/pid"
  chmod 700 "${PETCLAW_LOCK_DIR}"
  chmod 600 "${PETCLAW_LOCK_DIR}/pid"
}

petclaw_release_lock() {
  if [[ -d "${PETCLAW_LOCK_DIR}" && ! -L "${PETCLAW_LOCK_DIR}" \
    && "$(sed -n '1p' "${PETCLAW_LOCK_DIR}/pid" 2>/dev/null || true)" == "$$" ]]; then
    find "${PETCLAW_LOCK_DIR}" -mindepth 1 -maxdepth 1 -type f -name pid -delete
    rmdir "${PETCLAW_LOCK_DIR}" 2>/dev/null || true
  fi
}
trap petclaw_release_lock EXIT HUP INT TERM
petclaw_acquire_lock

PETCLAW_RETENTION_MINUTES="$(( PETCLAW_BACKUP_RETENTION_DAYS * 1440 - 1 ))"

# Failure evidence may be retained until expiry, but never plaintext payloads.
while IFS= read -r -d '' PETCLAW_PARTIAL; do
  PETCLAW_NAME="$(basename "${PETCLAW_PARTIAL}")"
  if [[ "${PETCLAW_NAME}" =~ ^\.partial-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]+$ \
    && -d "${PETCLAW_PARTIAL}" && ! -L "${PETCLAW_PARTIAL}" ]]; then
    find "${PETCLAW_PARTIAL}" -maxdepth 1 -type f \
      \( -name 'petclaw-postgres.dump' -o -name 'petclaw-uploads.tar.gz' \) -delete
    if [[ -d "${PETCLAW_PARTIAL}/s3-uploads" && ! -L "${PETCLAW_PARTIAL}/s3-uploads" ]]; then
      find "${PETCLAW_PARTIAL}/s3-uploads" -depth -delete
    fi
  fi
done < <(find "${PETCLAW_OFFHOST_DIR}" -mindepth 1 -maxdepth 1 -type d -name '.partial-*' -print0)

while IFS= read -r -d '' PETCLAW_EXPIRED; do
  PETCLAW_NAME="$(basename "${PETCLAW_EXPIRED}")"
  PETCLAW_CAN_DELETE=0
  if [[ "${PETCLAW_NAME}" =~ ^[0-9]{8}T[0-9]{6}Z$ \
    && -f "${PETCLAW_EXPIRED}/BACKUP_COMPLETE" \
    && ! -L "${PETCLAW_EXPIRED}/BACKUP_COMPLETE" ]]; then
    PETCLAW_CAN_DELETE=1
  elif [[ "${PETCLAW_NAME}" =~ ^\.partial-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]+$ \
    && -f "${PETCLAW_EXPIRED}/FAILED" && ! -L "${PETCLAW_EXPIRED}/FAILED" ]]; then
    PETCLAW_CAN_DELETE=1
  fi
  if [[ "${PETCLAW_CAN_DELETE}" == "1" && -d "${PETCLAW_EXPIRED}" \
    && ! -L "${PETCLAW_EXPIRED}" ]]; then
    find "${PETCLAW_EXPIRED}" -depth -delete
  fi
done < <(find "${PETCLAW_OFFHOST_DIR}" -mindepth 1 -maxdepth 1 -type d \
  -mmin "+${PETCLAW_RETENTION_MINUTES}" -print0)

echo "Off-host backup retention completed." >&2

#!/bin/bash
# Persistently roll back an uncommitted traffic switch after an unexpected
# reboot. The intent file is root-owned, parsed as data (never sourced), and
# removed only after the matching release commits or rollback succeeds.
set -euo pipefail
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
unset BASH_ENV CDPATH ENV GLOBIGNORE NODE_OPTIONS

PETCLAW_STATE_DIR="/var/lib/petclaw-release"
PETCLAW_INTENT="${PETCLAW_STATE_DIR}/rollback-intent"
PETCLAW_LOCK_DIR="/run/petclaw-release"
PETCLAW_RELEASE_LOCK="${PETCLAW_LOCK_DIR}/release.lock"
PETCLAW_BACKUP_VERIFY_LOCK="${PETCLAW_LOCK_DIR}/backup-verify.lock"
PETCLAW_CURRENT_LINK="/opt/petclaw/current"
PETCLAW_NGINX_SITE="/etc/nginx/sites-available/petclaw"

petclaw_require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "ERROR: release boot guard must run as root." >&2
    exit 2
  fi
}

petclaw_ensure_lock() {
  if [[ -e "${PETCLAW_LOCK_DIR}" || -L "${PETCLAW_LOCK_DIR}" ]]; then
    if [[ ! -d "${PETCLAW_LOCK_DIR}" || -L "${PETCLAW_LOCK_DIR}" \
      || "$(realpath -e "${PETCLAW_LOCK_DIR}")" != "${PETCLAW_LOCK_DIR}" \
      || "$(stat -c '%U:%G:%a' "${PETCLAW_LOCK_DIR}")" != "root:ubuntu:750" ]]; then
      echo "ERROR: release lock directory is unsafe." >&2
      exit 2
    fi
  else
    install -d -o root -g ubuntu -m 750 "${PETCLAW_LOCK_DIR}"
  fi

  local PETCLAW_LOCK_FILE
  for PETCLAW_LOCK_FILE in "${PETCLAW_RELEASE_LOCK}" "${PETCLAW_BACKUP_VERIFY_LOCK}"; do
    if [[ -e "${PETCLAW_LOCK_FILE}" || -L "${PETCLAW_LOCK_FILE}" ]]; then
      if [[ ! -f "${PETCLAW_LOCK_FILE}" || -L "${PETCLAW_LOCK_FILE}" \
        || "$(stat -c '%U:%G:%a' "${PETCLAW_LOCK_FILE}")" != "root:ubuntu:660" ]]; then
        echo "ERROR: release/backup generation lock is unsafe." >&2
        exit 2
      fi
    else
      install -o root -g ubuntu -m 660 /dev/null "${PETCLAW_LOCK_FILE}"
    fi
  done
}

petclaw_validate_release() {
  local PETCLAW_RELEASE_DIR="$1"
  local PETCLAW_RELEASE_NAME="${PETCLAW_RELEASE_DIR#/opt/petclaw/releases/}"
  if [[ "${PETCLAW_RELEASE_DIR}" != /opt/petclaw/releases/* \
    || "${PETCLAW_RELEASE_NAME}" == */* \
    || ! "${PETCLAW_RELEASE_NAME}" =~ ^[A-Za-z0-9._-]{6,80}$ \
    || ! -d "${PETCLAW_RELEASE_DIR}" || -L "${PETCLAW_RELEASE_DIR}" ]]; then
    echo "ERROR: release boot guard refused an invalid release." >&2
    exit 2
  fi
}

petclaw_validate_previous() {
  local PETCLAW_PREVIOUS_TARGET="$1"
  if [[ "${PETCLAW_PREVIOUS_TARGET}" == "__NONE__" ]]; then
    return
  fi
  local PETCLAW_PREVIOUS_NAME="${PETCLAW_PREVIOUS_TARGET#/opt/petclaw/releases/}"
  if [[ "${PETCLAW_PREVIOUS_TARGET}" != /opt/petclaw/releases/* \
    || "${PETCLAW_PREVIOUS_NAME}" == */* \
    || ! "${PETCLAW_PREVIOUS_NAME}" =~ ^[A-Za-z0-9._-]{6,80}$ \
    || ! -d "${PETCLAW_PREVIOUS_TARGET}" || -L "${PETCLAW_PREVIOUS_TARGET}" \
    || ! -f "${PETCLAW_PREVIOUS_TARGET}/RELEASE_COMMITTED" \
    || -L "${PETCLAW_PREVIOUS_TARGET}/RELEASE_COMMITTED" ]]; then
    echo "ERROR: release boot guard refused an invalid previous release." >&2
    exit 2
  fi
}

petclaw_validate_values() {
  local PETCLAW_RELEASE_DIR="$1"
  local PETCLAW_PREVIOUS_TARGET="$2"
  local PETCLAW_NGINX_BACKUP="$3"
  local PETCLAW_CANDIDATE_APP="$4"
  local PETCLAW_RELEASE_NAME="${PETCLAW_RELEASE_DIR#/opt/petclaw/releases/}"
  petclaw_validate_release "${PETCLAW_RELEASE_DIR}"
  petclaw_validate_previous "${PETCLAW_PREVIOUS_TARGET}"
  if [[ "${PETCLAW_NGINX_BACKUP}" != "${PETCLAW_NGINX_SITE}.pre-${PETCLAW_RELEASE_NAME}" \
    || ! -f "${PETCLAW_NGINX_BACKUP}" || -L "${PETCLAW_NGINX_BACKUP}" \
    || "$(stat -c '%U:%G' "${PETCLAW_NGINX_BACKUP}")" != "root:root" \
    || "${PETCLAW_CANDIDATE_APP}" != "petclaw-web-${PETCLAW_RELEASE_NAME}" ]]; then
    echo "ERROR: release boot guard refused invalid rollback evidence." >&2
    exit 2
  fi
}

petclaw_read_intent() {
  if [[ ! -f "${PETCLAW_INTENT}" || -L "${PETCLAW_INTENT}" \
    || "$(stat -c '%U:%G:%a' "${PETCLAW_INTENT}")" != "root:root:600" ]]; then
    echo "ERROR: release rollback intent is missing or unsafe." >&2
    exit 2
  fi
  mapfile -t PETCLAW_INTENT_LINES < "${PETCLAW_INTENT}"
  if [[ "${#PETCLAW_INTENT_LINES[@]}" -ne 5 \
    || "${PETCLAW_INTENT_LINES[0]}" != "version=1" \
    || "${PETCLAW_INTENT_LINES[1]}" != release=* \
    || "${PETCLAW_INTENT_LINES[2]}" != previous=* \
    || "${PETCLAW_INTENT_LINES[3]}" != nginx_backup=* \
    || "${PETCLAW_INTENT_LINES[4]}" != candidate=* ]]; then
    echo "ERROR: release rollback intent has an invalid format." >&2
    exit 2
  fi
  PETCLAW_INTENT_RELEASE="${PETCLAW_INTENT_LINES[1]#release=}"
  PETCLAW_INTENT_PREVIOUS="${PETCLAW_INTENT_LINES[2]#previous=}"
  PETCLAW_INTENT_NGINX_BACKUP="${PETCLAW_INTENT_LINES[3]#nginx_backup=}"
  PETCLAW_INTENT_CANDIDATE="${PETCLAW_INTENT_LINES[4]#candidate=}"
  petclaw_validate_values \
    "${PETCLAW_INTENT_RELEASE}" "${PETCLAW_INTENT_PREVIOUS}" \
    "${PETCLAW_INTENT_NGINX_BACKUP}" "${PETCLAW_INTENT_CANDIDATE}"
}

petclaw_remove_intent() {
  rm -f -- "${PETCLAW_INTENT}"
  sync -f "${PETCLAW_STATE_DIR}"
}

petclaw_require_root
petclaw_ensure_lock

case "${1:-}" in
  --ensure-lock)
    if [[ "$#" -ne 1 ]]; then
      echo "ERROR: --ensure-lock takes no additional arguments." >&2
      exit 2
    fi
    ;;
  --arm)
    if [[ "$#" -ne 5 ]]; then
      echo "ERROR: --arm requires release, previous release, nginx backup, and candidate name." >&2
      exit 2
    fi
    PETCLAW_ARM_RELEASE="$2"
    PETCLAW_ARM_PREVIOUS="$3"
    PETCLAW_ARM_NGINX_BACKUP="$4"
    PETCLAW_ARM_CANDIDATE="$5"
    petclaw_validate_values \
      "${PETCLAW_ARM_RELEASE}" "${PETCLAW_ARM_PREVIOUS}" \
      "${PETCLAW_ARM_NGINX_BACKUP}" "${PETCLAW_ARM_CANDIDATE}"
    if [[ -f "${PETCLAW_ARM_RELEASE}/RELEASE_COMMITTED" ]]; then
      echo "ERROR: refusing to arm rollback for an already committed release." >&2
      exit 2
    fi
    if [[ -e "${PETCLAW_INTENT}" || -L "${PETCLAW_INTENT}" ]]; then
      echo "ERROR: refusing to overwrite an unreconciled rollback intent." >&2
      exit 2
    fi
    install -d -o root -g root -m 700 "${PETCLAW_STATE_DIR}"
    PETCLAW_INTENT_TMP="$(mktemp "${PETCLAW_STATE_DIR}/.rollback-intent.XXXXXX")"
    trap 'rm -f -- "${PETCLAW_INTENT_TMP:-}"' EXIT HUP INT TERM
    printf '%s\n' \
      'version=1' \
      "release=${PETCLAW_ARM_RELEASE}" \
      "previous=${PETCLAW_ARM_PREVIOUS}" \
      "nginx_backup=${PETCLAW_ARM_NGINX_BACKUP}" \
      "candidate=${PETCLAW_ARM_CANDIDATE}" > "${PETCLAW_INTENT_TMP}"
    chown root:root "${PETCLAW_INTENT_TMP}"
    chmod 600 "${PETCLAW_INTENT_TMP}"
    mv -fT "${PETCLAW_INTENT_TMP}" "${PETCLAW_INTENT}"
    sync -f "${PETCLAW_STATE_DIR}"
    trap - EXIT HUP INT TERM
    ;;
  --disarm)
    if [[ "$#" -ne 2 ]]; then
      echo "ERROR: --disarm requires the matching release path." >&2
      exit 2
    fi
    if [[ ! -e "${PETCLAW_INTENT}" && ! -L "${PETCLAW_INTENT}" ]]; then
      exit 0
    fi
    petclaw_read_intent
    if [[ "${PETCLAW_INTENT_RELEASE}" != "$2" ]]; then
      echo "ERROR: refusing to disarm another release's rollback intent." >&2
      exit 2
    fi
    petclaw_remove_intent
    ;;
  "")
    if [[ ! -e "${PETCLAW_INTENT}" && ! -L "${PETCLAW_INTENT}" ]]; then
      exit 0
    fi
    petclaw_read_intent
    if [[ -f "${PETCLAW_INTENT_RELEASE}/RELEASE_COMMITTED" \
      && ! -L "${PETCLAW_INTENT_RELEASE}/RELEASE_COMMITTED" ]]; then
      petclaw_remove_intent
      exit 0
    fi

    PETCLAW_CURRENT_TARGET=""
    if [[ -L "${PETCLAW_CURRENT_LINK}" ]]; then
      PETCLAW_CURRENT_TARGET="$(readlink -e "${PETCLAW_CURRENT_LINK}" 2>/dev/null || true)"
    elif [[ -e "${PETCLAW_CURRENT_LINK}" ]]; then
      echo "ERROR: current release pointer is no longer a symlink." >&2
      exit 2
    fi
    if [[ "${PETCLAW_CURRENT_TARGET}" != "${PETCLAW_INTENT_RELEASE}" ]]; then
      if [[ "${PETCLAW_INTENT_PREVIOUS}" == "__NONE__" \
        && -z "${PETCLAW_CURRENT_TARGET}" ]]; then
        : # Switch never occurred; restore only the nginx generation on disk.
      elif [[ "${PETCLAW_INTENT_PREVIOUS}" != "__NONE__" \
        && "${PETCLAW_CURRENT_TARGET}" == "${PETCLAW_INTENT_PREVIOUS}" ]]; then
        : # Another recovery path already restored this exact generation.
      else
        echo "ERROR: stale boot rollback intent refused to overwrite a newer release." >&2
        exit 75
      fi
    fi

    install -o root -g root -m 644 \
      "${PETCLAW_INTENT_NGINX_BACKUP}" "${PETCLAW_NGINX_SITE}"
    if [[ "${PETCLAW_CURRENT_TARGET}" == "${PETCLAW_INTENT_RELEASE}" \
      && "${PETCLAW_INTENT_PREVIOUS}" == "__NONE__" ]]; then
      if [[ -L "${PETCLAW_CURRENT_LINK}" ]]; then
        unlink "${PETCLAW_CURRENT_LINK}"
      elif [[ -e "${PETCLAW_CURRENT_LINK}" ]]; then
        echo "ERROR: current release pointer is no longer a symlink." >&2
        exit 2
      fi
    elif [[ "${PETCLAW_CURRENT_TARGET}" == "${PETCLAW_INTENT_RELEASE}" ]]; then
      PETCLAW_ROLLBACK_LINK="${PETCLAW_CURRENT_LINK}.boot-rollback-$$"
      if [[ -e "${PETCLAW_ROLLBACK_LINK}" || -L "${PETCLAW_ROLLBACK_LINK}" ]]; then
        echo "ERROR: boot rollback temporary pointer already exists." >&2
        exit 2
      fi
      ln -s "${PETCLAW_INTENT_PREVIOUS}" "${PETCLAW_ROLLBACK_LINK}"
      mv -Tf "${PETCLAW_ROLLBACK_LINK}" "${PETCLAW_CURRENT_LINK}"
    fi
    /usr/sbin/nginx -t
    if systemctl is-active --quiet nginx.service; then
      systemctl reload nginx.service
      curl -fsS --max-time 20 --resolve app.myaipet.ai:443:127.0.0.1 \
        https://app.myaipet.ai/api/health >/dev/null
    fi
    petclaw_remove_intent
    logger -t petclaw-release \
      "Boot guard rolled back uncommitted release ${PETCLAW_INTENT_RELEASE##*/}."
    ;;
  *)
    echo "ERROR: unsupported release boot guard command." >&2
    exit 2
    ;;
esac

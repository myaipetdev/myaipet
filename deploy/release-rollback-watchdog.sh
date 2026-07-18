#!/bin/bash
# Root-owned systemd watchdog for the narrow interval after a release traffic
# switch. ec2-release.sh normally disarms it after writing RELEASE_COMMITTED;
# it independently restores the previous route if the deploy shell is SIGKILLed
# or the host loses the controlling SSH session during that interval.
set -euo pipefail
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
unset BASH_ENV CDPATH ENV GLOBIGNORE NODE_OPTIONS

PETCLAW_RELEASE_DIR="${1:-}"
PETCLAW_PREVIOUS_TARGET="${2:-}"
PETCLAW_NGINX_SITE="${3:-}"
PETCLAW_NGINX_BACKUP="${4:-}"
PETCLAW_CANDIDATE_APP="${5:-}"
PETCLAW_PM2_BIN="${6:-}"
PETCLAW_CURRENT_LINK="/opt/petclaw/current"
PETCLAW_RELEASE_LOCK="/run/petclaw-release/release.lock"
PETCLAW_RELEASE_LOCK_DIR="/run/petclaw-release"
PETCLAW_BOOT_GUARD="/usr/local/sbin/petclaw-release-boot-guard.sh"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: release rollback watchdog must run as root." >&2
  exit 2
fi
PETCLAW_RELEASE_NAME="${PETCLAW_RELEASE_DIR#/opt/petclaw/releases/}"
PETCLAW_WATCHDOG_SELF="$(realpath -e "${BASH_SOURCE[0]}" 2>/dev/null || true)"
PETCLAW_WATCHDOG_MODE="$(stat -c '%a' "${PETCLAW_WATCHDOG_SELF}" 2>/dev/null || true)"
if [[ "${PETCLAW_WATCHDOG_SELF}" != /usr/local/libexec/petclaw/release-rollback-*.sh \
  || "$(stat -c '%U:%G' "${PETCLAW_WATCHDOG_SELF}" 2>/dev/null || true)" != "root:root" \
  || ! "${PETCLAW_WATCHDOG_MODE}" =~ ^[0-7]{3,4}$ \
  || "${PETCLAW_RELEASE_DIR}" != /opt/petclaw/releases/* \
  || "${PETCLAW_RELEASE_NAME}" == */* \
  || ! "${PETCLAW_RELEASE_NAME}" =~ ^[A-Za-z0-9._-]{6,80}$ \
  || ! -d "${PETCLAW_RELEASE_DIR}" || -L "${PETCLAW_RELEASE_DIR}" \
  || "${PETCLAW_NGINX_SITE}" != "/etc/nginx/sites-available/petclaw" \
  || "${PETCLAW_NGINX_BACKUP}" != "${PETCLAW_NGINX_SITE}.pre-${PETCLAW_RELEASE_NAME}" \
  || ! -f "${PETCLAW_NGINX_BACKUP}" || -L "${PETCLAW_NGINX_BACKUP}" \
  || "${PETCLAW_CANDIDATE_APP}" != "petclaw-web-${PETCLAW_RELEASE_NAME}" \
  || ! -x "${PETCLAW_PM2_BIN}" || -L "${PETCLAW_PM2_BIN}" \
  || "$(stat -c '%U:%G' "${PETCLAW_PM2_BIN}" 2>/dev/null || true)" != "root:root" \
  || ! -x "${PETCLAW_BOOT_GUARD}" \
  || "$(stat -c '%U:%G' "${PETCLAW_BOOT_GUARD}" 2>/dev/null || true)" != "root:root" \
  || ! -d "${PETCLAW_RELEASE_LOCK_DIR}" || -L "${PETCLAW_RELEASE_LOCK_DIR}" \
  || "$(realpath -e "${PETCLAW_RELEASE_LOCK_DIR}" 2>/dev/null || true)" != "${PETCLAW_RELEASE_LOCK_DIR}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_RELEASE_LOCK_DIR}" 2>/dev/null || true)" != "root:ubuntu:750" \
  || ! -f "${PETCLAW_RELEASE_LOCK}" || -L "${PETCLAW_RELEASE_LOCK}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_RELEASE_LOCK}" 2>/dev/null || true)" != "root:ubuntu:660" ]] \
  || (( (8#${PETCLAW_WATCHDOG_MODE} & 8#022) != 0 )); then
  echo "ERROR: release rollback watchdog received an invalid pinned target." >&2
  exit 2
fi

# Serialize against the deploy controller. A live deploy owns this flock; a
# killed deploy releases it, allowing exactly one recovery generation to act.
exec 9<>"${PETCLAW_RELEASE_LOCK}"
if ! flock -w 900 9; then
  echo "ERROR: rollback watchdog could not acquire the release generation lock." >&2
  exit 75
fi

if [[ -f "${PETCLAW_RELEASE_DIR}/RELEASE_COMMITTED" \
  && ! -L "${PETCLAW_RELEASE_DIR}/RELEASE_COMMITTED" ]]; then
  exit 0
fi

if [[ "${PETCLAW_PREVIOUS_TARGET}" != "__NONE__" ]]; then
  PETCLAW_PREVIOUS_NAME="${PETCLAW_PREVIOUS_TARGET#/opt/petclaw/releases/}"
  if [[ "${PETCLAW_PREVIOUS_TARGET}" != /opt/petclaw/releases/* \
    || "${PETCLAW_PREVIOUS_NAME}" == */* \
    || ! "${PETCLAW_PREVIOUS_NAME}" =~ ^[A-Za-z0-9._-]{6,80}$ \
    || ! -d "${PETCLAW_PREVIOUS_TARGET}" || -L "${PETCLAW_PREVIOUS_TARGET}" \
    || ! -f "${PETCLAW_PREVIOUS_TARGET}/RELEASE_COMMITTED" \
    || -L "${PETCLAW_PREVIOUS_TARGET}/RELEASE_COMMITTED" ]]; then
    echo "ERROR: release rollback watchdog refused an invalid previous release." >&2
    exit 2
  fi
fi

PETCLAW_CURRENT_TARGET=""
if [[ -L "${PETCLAW_CURRENT_LINK}" ]]; then
  PETCLAW_CURRENT_TARGET="$(readlink -e "${PETCLAW_CURRENT_LINK}" 2>/dev/null || true)"
elif [[ -e "${PETCLAW_CURRENT_LINK}" ]]; then
  echo "ERROR: current release pointer is no longer a symlink." >&2
  exit 2
fi
if [[ "${PETCLAW_CURRENT_TARGET}" != "${PETCLAW_RELEASE_DIR}" ]]; then
  if [[ "${PETCLAW_PREVIOUS_TARGET}" == "__NONE__" && -z "${PETCLAW_CURRENT_TARGET}" ]]; then
    : # Traffic never switched, but restore the on-disk nginx generation.
  elif [[ "${PETCLAW_PREVIOUS_TARGET}" != "__NONE__" \
    && "${PETCLAW_CURRENT_TARGET}" == "${PETCLAW_PREVIOUS_TARGET}" ]]; then
    : # A prior recovery already restored the exact previous generation.
  else
    echo "ERROR: stale watchdog generation refused to overwrite a newer current release." >&2
    exit 75
  fi
fi

install -o root -g root -m 644 "${PETCLAW_NGINX_BACKUP}" "${PETCLAW_NGINX_SITE}"
if [[ "${PETCLAW_CURRENT_TARGET}" == "${PETCLAW_RELEASE_DIR}" \
  && "${PETCLAW_PREVIOUS_TARGET}" == "__NONE__" ]]; then
  if [[ -L "${PETCLAW_CURRENT_LINK}" ]]; then
    unlink "${PETCLAW_CURRENT_LINK}"
  elif [[ -e "${PETCLAW_CURRENT_LINK}" ]]; then
    echo "ERROR: current release pointer is no longer a symlink." >&2
    exit 2
  fi
elif [[ "${PETCLAW_CURRENT_TARGET}" == "${PETCLAW_RELEASE_DIR}" ]]; then
  PETCLAW_ROLLBACK_LINK="/opt/petclaw/current.watchdog-${PETCLAW_RELEASE_NAME}"
  if [[ -e "${PETCLAW_ROLLBACK_LINK}" || -L "${PETCLAW_ROLLBACK_LINK}" ]]; then
    unlink "${PETCLAW_ROLLBACK_LINK}"
  fi
  ln -s "${PETCLAW_PREVIOUS_TARGET}" "${PETCLAW_ROLLBACK_LINK}"
  mv -Tf "${PETCLAW_ROLLBACK_LINK}" /opt/petclaw/current
fi

nginx -t
systemctl reload nginx
curl -fsS --max-time 20 --resolve app.myaipet.ai:443:127.0.0.1 \
  https://app.myaipet.ai/api/health >/dev/null
if runuser -u ubuntu -- env PM2_HOME=/home/ubuntu/.pm2 \
  "${PETCLAW_PM2_BIN}" describe "${PETCLAW_CANDIDATE_APP}" >/dev/null 2>&1; then
  runuser -u ubuntu -- env PM2_HOME=/home/ubuntu/.pm2 \
    "${PETCLAW_PM2_BIN}" delete "${PETCLAW_CANDIDATE_APP}" >/dev/null
fi
runuser -u ubuntu -- env PM2_HOME=/home/ubuntu/.pm2 \
  "${PETCLAW_PM2_BIN}" save >/dev/null
"${PETCLAW_BOOT_GUARD}" --disarm "${PETCLAW_RELEASE_DIR}"
logger -t petclaw-release "Watchdog rolled back uncommitted release ${PETCLAW_RELEASE_NAME}."

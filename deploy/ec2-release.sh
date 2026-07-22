#!/bin/bash
# Build and atomically switch an immutable EC2 release. The source directory
# must already be a clean, versioned release upload; this script never git-reset
# or npm-install in the live process directory.
set -euo pipefail
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
unset BASH_ENV CDPATH ENV GLOBIGNORE NODE_OPTIONS
unset -f node npm npx pm2 psql 2>/dev/null || true
hash -r

PETCLAW_TRUSTED_CONTROLLER="/usr/local/sbin/petclaw-ec2-release.sh"
PETCLAW_TRUSTED_SCANNER="/usr/local/libexec/petclaw/scan-release-secrets.sh"
PETCLAW_TRUSTED_MIGRATION_GATE="/usr/local/libexec/petclaw/check-release-migrations.sh"
PETCLAW_TRUSTED_BOOT_GUARD="/usr/local/sbin/petclaw-release-boot-guard.sh"
PETCLAW_ROLLBACK_INTENT="/var/lib/petclaw-release/rollback-intent"
PETCLAW_RELEASE_LOCK="/run/petclaw-release/release.lock"
PETCLAW_VERIFIED_DIR="/opt/petclaw/verified"
PETCLAW_DEPLOY_USER="ubuntu"
PETCLAW_PM2_HOME="/home/ubuntu/.pm2"
PETCLAW_REQUIRED_NODE_MAJOR=24
PETCLAW_REQUIRED_NODE_MIN_MINOR=18
PETCLAW_REQUIRED_NPM_VERSION="11.16.0"
PETCLAW_REQUIRED_PM2_VERSION="6.0.14"

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

petclaw_harden_pm2_logs() {
  local PETCLAW_PM2_LOG_DIR="${PETCLAW_PM2_HOME}/logs"
  install -d -m 700 "${PETCLAW_PM2_LOG_DIR}"
  if [[ -L "${PETCLAW_PM2_LOG_DIR}" \
    || "$(realpath -e "${PETCLAW_PM2_LOG_DIR}")" != "${PETCLAW_PM2_LOG_DIR}" \
    || "$(stat -c '%U:%G:%a' "${PETCLAW_PM2_LOG_DIR}")" != "ubuntu:ubuntu:700" ]] \
    || find "${PETCLAW_PM2_LOG_DIR}" -maxdepth 1 -type l -print -quit | grep -q .; then
    echo "ERROR: PM2 logs must remain an ubuntu-owned mode-700 real directory without symlinks." >&2
    return 1
  fi
  find "${PETCLAW_PM2_LOG_DIR}" -maxdepth 1 -type f -name '*.log' -exec chmod 600 {} +
  if find "${PETCLAW_PM2_LOG_DIR}" -maxdepth 1 -type f -name '*.log' \
    \( ! -user ubuntu -o ! -group ubuntu -o -perm /077 \) -print -quit | grep -q .; then
    echo "ERROR: PM2 leaf logs must be ubuntu-owned with no group/other permissions." >&2
    return 1
  fi
}

petclaw_seal_release_tree() {
  local PETCLAW_SEAL_RELEASE_DIR="$1"
  local PETCLAW_SEAL_WEB="$2"
  local PETCLAW_SEAL_LANDING="${PETCLAW_SEAL_RELEASE_DIR}/landing-assets"
  local PETCLAW_SEAL_STATIC="${PETCLAW_SEAL_WEB}/.next/static"

  # The service account needs the generated runtime, but unrelated local users
  # do not. Preserve executable files for npm/Prisma, make all other private
  # files group-readable, and expose only nginx's two immutable asset trees.
  sudo find "${PETCLAW_SEAL_RELEASE_DIR}" -type d -exec chmod 750 {} +
  sudo find "${PETCLAW_SEAL_RELEASE_DIR}" -type f \
    ! -path "${PETCLAW_SEAL_WEB}/.env.production" \
    -exec /bin/bash -c '
      for PETCLAW_SEAL_FILE do
        if [[ -x "${PETCLAW_SEAL_FILE}" ]]; then
          chmod 750 "${PETCLAW_SEAL_FILE}"
        else
          chmod 640 "${PETCLAW_SEAL_FILE}"
        fi
      done
    ' petclaw-seal {} +
  sudo chown -R root:ubuntu "${PETCLAW_SEAL_RELEASE_DIR}"
  sudo chmod 640 "${PETCLAW_SEAL_WEB}/.env.production"

  sudo chmod 755 "${PETCLAW_SEAL_RELEASE_DIR}" \
    "${PETCLAW_SEAL_WEB}" "${PETCLAW_SEAL_WEB}/.next"
  for PETCLAW_SEAL_PUBLIC_TREE in \
    "${PETCLAW_SEAL_LANDING}" "${PETCLAW_SEAL_STATIC}"; do
    sudo find "${PETCLAW_SEAL_PUBLIC_TREE}" -type d -exec chmod 755 {} +
    sudo find "${PETCLAW_SEAL_PUBLIC_TREE}" -type f -exec chmod 644 {} +
  done
}

if [[ "$(id -un)" != "${PETCLAW_DEPLOY_USER}" \
  || "$(id -u)" != "$(id -u "${PETCLAW_DEPLOY_USER}" 2>/dev/null || true)" ]]; then
  echo "ERROR: production release controller must run as the ubuntu service account, not root." >&2
  exit 2
fi
if [[ "$(realpath -e "${BASH_SOURCE[0]}")" != "${PETCLAW_TRUSTED_CONTROLLER}" \
  || "$(stat -c '%U:%G' "${PETCLAW_TRUSTED_CONTROLLER}")" != "root:root" ]]; then
  echo "ERROR: run the root-installed trusted release controller." >&2
  exit 2
fi
PETCLAW_CONTROLLER_MODE="$(stat -c '%a' "${PETCLAW_TRUSTED_CONTROLLER}")"
if (( (8#${PETCLAW_CONTROLLER_MODE} & 8#022) != 0 )); then
  echo "ERROR: trusted release controller is writable by group or other." >&2
  exit 2
fi
if [[ ! -d /home/ubuntu || -L /home/ubuntu \
  || "$(stat -c '%U:%G' /home/ubuntu)" != "ubuntu:ubuntu" ]]; then
  echo "ERROR: pinned ubuntu home is missing or unsafe." >&2
  exit 2
fi
install -d -m 700 "${PETCLAW_PM2_HOME}"
if [[ -L "${PETCLAW_PM2_HOME}" \
  || "$(realpath -e "${PETCLAW_PM2_HOME}")" != "${PETCLAW_PM2_HOME}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_PM2_HOME}")" != "ubuntu:ubuntu:700" ]]; then
  echo "ERROR: pinned PM2 home must be an ubuntu-owned mode-700 real directory." >&2
  exit 2
fi
petclaw_harden_pm2_logs
export PM2_HOME="${PETCLAW_PM2_HOME}"
if ! sudo systemctl is-enabled pm2-ubuntu.service >/dev/null 2>&1; then
  echo "ERROR: pinned pm2-ubuntu.service must be installed and enabled." >&2
  exit 2
fi
PETCLAW_PM2_EXPECTED_EXECUTABLE="/usr/lib/node_modules/pm2/bin/pm2"
PETCLAW_PM2_EFFECTIVE_USER="$(sudo systemctl show pm2-ubuntu.service -p User --value 2>/dev/null || true)"
PETCLAW_PM2_EFFECTIVE_ENV="$(sudo systemctl show pm2-ubuntu.service -p Environment --value 2>/dev/null || true)"
PETCLAW_PM2_EFFECTIVE_PIDFILE="$(sudo systemctl show pm2-ubuntu.service -p PIDFile --value 2>/dev/null || true)"
PETCLAW_PM2_EFFECTIVE_EXECSTART="$(sudo systemctl show pm2-ubuntu.service -p ExecStart --value 2>/dev/null || true)"
PETCLAW_PM2_EFFECTIVE_MAINPID="$(sudo systemctl show pm2-ubuntu.service -p MainPID --value 2>/dev/null || true)"
if [[ "${PETCLAW_PM2_EFFECTIVE_USER}" != "ubuntu" \
  || "${PETCLAW_PM2_EFFECTIVE_PIDFILE}" != "/home/ubuntu/.pm2/pm2.pid" ]] \
  || ! grep -Fq 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:' \
    <<< "${PETCLAW_PM2_EFFECTIVE_ENV}" \
  || ! grep -Eq '(^|[[:space:]])PM2_HOME=/home/ubuntu/\.pm2($|[[:space:]])' \
    <<< "${PETCLAW_PM2_EFFECTIVE_ENV}" \
  || ! grep -Fq "path=${PETCLAW_PM2_EXPECTED_EXECUTABLE} ; argv[]=${PETCLAW_PM2_EXPECTED_EXECUTABLE} resurrect ;" \
    <<< "${PETCLAW_PM2_EFFECTIVE_EXECSTART}"; then
  echo "ERROR: effective pm2-ubuntu.service does not pin the production user, PATH, PM2_HOME, PIDFile, and executable." >&2
  exit 2
fi
PETCLAW_PM2_COMMAND="$(type -P pm2 2>/dev/null || true)"
PETCLAW_PM2_BIN="$(realpath -e "${PETCLAW_PM2_COMMAND}" 2>/dev/null || true)"
if [[ -z "${PETCLAW_PM2_BIN}" || ! -x "${PETCLAW_PM2_BIN}" \
  || "$(stat -c '%U:%G' "${PETCLAW_PM2_BIN}")" != "root:root" ]]; then
  echo "ERROR: PM2 must resolve to one root-owned canonical executable." >&2
  exit 2
fi
PETCLAW_PM2_MODE="$(stat -c '%a' "${PETCLAW_PM2_BIN}")"
if (( (8#${PETCLAW_PM2_MODE} & 8#022) != 0 )); then
  echo "ERROR: PM2 executable is writable by group or other." >&2
  exit 2
fi

PETCLAW_NODE_COMMAND="$(type -P node 2>/dev/null || true)"
PETCLAW_NODE_BIN="$(realpath -e "${PETCLAW_NODE_COMMAND}" 2>/dev/null || true)"
if [[ -z "${PETCLAW_NODE_BIN}" || ! -x "${PETCLAW_NODE_BIN}" \
  || "$(stat -c '%U:%G' "${PETCLAW_NODE_BIN}" 2>/dev/null || true)" != "root:root" ]]; then
  echo "ERROR: Node.js must resolve to one root-owned canonical executable." >&2
  exit 2
fi
PETCLAW_NODE_MODE="$(stat -c '%a' "${PETCLAW_NODE_BIN}")"
if (( (8#${PETCLAW_NODE_MODE} & 8#022) != 0 )); then
  echo "ERROR: Node.js executable is writable by group or other." >&2
  exit 2
fi
PETCLAW_NODE_VERSION="$("${PETCLAW_NODE_BIN}" --version 2>/dev/null || true)"

PETCLAW_NPM_COMMAND="$(type -P npm 2>/dev/null || true)"
PETCLAW_NPM_BIN="$(realpath -e "${PETCLAW_NPM_COMMAND}" 2>/dev/null || true)"
if [[ -z "${PETCLAW_NPM_BIN}" || ! -f "${PETCLAW_NPM_BIN}" \
  || "$(stat -c '%U:%G' "${PETCLAW_NPM_BIN}" 2>/dev/null || true)" != "root:root" ]]; then
  echo "ERROR: npm must resolve to one root-owned canonical file." >&2
  exit 2
fi
PETCLAW_NPM_MODE="$(stat -c '%a' "${PETCLAW_NPM_BIN}")"
if (( (8#${PETCLAW_NPM_MODE} & 8#022) != 0 )); then
  echo "ERROR: npm is writable by group or other." >&2
  exit 2
fi
PETCLAW_NPM_VERSION="$("${PETCLAW_NPM_COMMAND}" --version 2>/dev/null || true)"
if ! petclaw_runtime_versions_supported "${PETCLAW_NODE_VERSION}" "${PETCLAW_NPM_VERSION}"; then
  echo "ERROR: production requires Node.js >=24.18.0 <25 and npm 11.16.0; found ${PETCLAW_NODE_VERSION:-missing}/${PETCLAW_NPM_VERSION:-missing}." >&2
  exit 2
fi

if ! sudo systemctl is-active pm2-ubuntu.service >/dev/null 2>&1; then
  echo "ERROR: pinned pm2-ubuntu.service must be active before deployment." >&2
  exit 2
fi
PETCLAW_PM2_DAEMON_PID="$(tr -d '[:space:]' < "${PETCLAW_PM2_HOME}/pm2.pid" 2>/dev/null || true)"
PETCLAW_PM2_DAEMON_NODE="$(readlink -e "/proc/${PETCLAW_PM2_DAEMON_PID}/exe" 2>/dev/null || true)"
if [[ ! "${PETCLAW_PM2_DAEMON_PID}" =~ ^[1-9][0-9]*$ \
  || "${PETCLAW_PM2_EFFECTIVE_MAINPID}" != "${PETCLAW_PM2_DAEMON_PID}" \
  || "${PETCLAW_PM2_DAEMON_NODE}" != "${PETCLAW_NODE_BIN}" ]]; then
  echo "ERROR: systemd is not supervising the pinned PM2 daemon under the pinned Node.js executable." >&2
  exit 2
fi
PETCLAW_PM2_VERSION="$(pm2 --version 2>/dev/null | tail -n 1 | tr -d '[:space:]')"
if [[ "${PETCLAW_PM2_VERSION}" != "${PETCLAW_REQUIRED_PM2_VERSION}" ]]; then
  echo "ERROR: production requires PM2 ${PETCLAW_REQUIRED_PM2_VERSION}; found ${PETCLAW_PM2_VERSION:-unknown}." >&2
  exit 2
fi

PETCLAW_RELEASE_SOURCE="${PETCLAW_RELEASE_SOURCE:-$(pwd)}"
PETCLAW_REQUESTED_RELEASE_ID="${PETCLAW_RELEASE_ID:-}"
PETCLAW_RELEASES_DIR="${PETCLAW_RELEASES_DIR:-/opt/petclaw/releases}"
PETCLAW_CURRENT_LINK="${PETCLAW_CURRENT_LINK:-/opt/petclaw/current}"
PETCLAW_ENV_SOURCE="${PETCLAW_ENV_SOURCE:-/opt/petclaw/aipet-project/web/.env.production}"
PETCLAW_CANDIDATE_PORT="${PETCLAW_CANDIDATE_PORT:-}"
PETCLAW_CANDIDATE_PORT_EXPLICIT=0
[[ -n "${PETCLAW_CANDIDATE_PORT}" ]] && PETCLAW_CANDIDATE_PORT_EXPLICIT=1
PETCLAW_REQUESTED_CANDIDATE_APP="${PETCLAW_CANDIDATE_APP:-}"
PETCLAW_NGINX_SITE="${PETCLAW_NGINX_SITE:-/etc/nginx/sites-available/petclaw}"
PETCLAW_BACKUP_EVIDENCE="${PETCLAW_BACKUP_EVIDENCE:-}"
PETCLAW_RELEASE_PREFLIGHT_ONLY="${PETCLAW_RELEASE_PREFLIGHT_ONLY:-0}"
PETCLAW_BACKUP_SIGNING_FINGERPRINT="0B286A30DC9C53D08CE5ABC72E2A4FDD17382A1F"
PETCLAW_BACKUP_SIGNING_SUBKEY_FINGERPRINT="ABD9D161F7FDB82D600D32B7EEB701346799673E"

if [[ ! -d /opt/petclaw || -L /opt/petclaw \
  || "$(realpath -e /opt/petclaw)" != "/opt/petclaw" \
  || "$(stat -c '%U:%G:%a' /opt/petclaw)" != "root:root:755" ]]; then
  echo "ERROR: /opt/petclaw must be a root-owned mode-755 real directory." >&2
  exit 2
fi
if [[ "${PETCLAW_RELEASES_DIR}" != "/opt/petclaw/releases" \
  || "${PETCLAW_CURRENT_LINK}" != "/opt/petclaw/current" \
  || "${PETCLAW_ENV_SOURCE}" != "/opt/petclaw/aipet-project/web/.env.production" \
  || "${PETCLAW_NGINX_SITE}" != "/etc/nginx/sites-available/petclaw" ]]; then
  echo "ERROR: production release/config paths are pinned and cannot be overridden." >&2
  exit 2
fi
if [[ ! -d "${PETCLAW_VERIFIED_DIR}" || -L "${PETCLAW_VERIFIED_DIR}" \
  || "$(realpath -e "${PETCLAW_VERIFIED_DIR}")" != "${PETCLAW_VERIFIED_DIR}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_VERIFIED_DIR}")" != "root:root:755" \
  || ! -d "${PETCLAW_RELEASE_SOURCE}" || -L "${PETCLAW_RELEASE_SOURCE}" ]]; then
  echo "ERROR: release source must be a real directory under the root-owned verified release root." >&2
  exit 2
fi
if [[ -e "${PETCLAW_RELEASES_DIR}" \
  && ( ! -d "${PETCLAW_RELEASES_DIR}" || -L "${PETCLAW_RELEASES_DIR}" \
    || "$(stat -c '%U:%G:%a' "${PETCLAW_RELEASES_DIR}")" != "root:root:755" ) ]]; then
  echo "ERROR: pinned immutable release root must be a real directory." >&2
  exit 2
fi
PETCLAW_RELEASE_SOURCE="$(realpath -e "${PETCLAW_RELEASE_SOURCE}")"
PETCLAW_RELEASE_SOURCE_NAME="${PETCLAW_RELEASE_SOURCE#"${PETCLAW_VERIFIED_DIR}"/}"
if [[ "${PETCLAW_RELEASE_SOURCE}" != "${PETCLAW_VERIFIED_DIR}/"* \
  || "${PETCLAW_RELEASE_SOURCE_NAME}" == */* \
  || ! "${PETCLAW_RELEASE_SOURCE_NAME}" =~ ^[A-Za-z0-9._-]{6,100}$ ]]; then
  echo "ERROR: release source must be one validated direct child of the incoming directory." >&2
  exit 2
fi
PETCLAW_PROVENANCE="${PETCLAW_RELEASE_SOURCE}/RELEASE_PROVENANCE"
if [[ ! -f "${PETCLAW_PROVENANCE}" || -L "${PETCLAW_PROVENANCE}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_PROVENANCE}")" != "root:root:444" ]]; then
  echo "ERROR: release source lacks a root-sealed provenance receipt." >&2
  exit 2
fi
mapfile -t PETCLAW_PROVENANCE_LINES < "${PETCLAW_PROVENANCE}"
if [[ "${#PETCLAW_PROVENANCE_LINES[@]}" -ne 5 \
  || "${PETCLAW_PROVENANCE_LINES[0]}" != "provenance_version=1" \
  || ! "${PETCLAW_PROVENANCE_LINES[1]}" =~ ^release_commit=([0-9a-f]{40}|[0-9a-f]{64})$ \
  || ! "${PETCLAW_PROVENANCE_LINES[2]}" =~ ^release_id=([A-Za-z0-9._-]{6,80})$ \
  || ! "${PETCLAW_PROVENANCE_LINES[3]}" =~ ^archive_sha256=[0-9a-f]{64}$ \
  || ! "${PETCLAW_PROVENANCE_LINES[4]}" =~ ^manifest_sha256=[0-9a-f]{64}$ ]]; then
  echo "ERROR: release provenance receipt has an invalid canonical format." >&2
  exit 2
fi
PETCLAW_RELEASE_COMMIT="${PETCLAW_PROVENANCE_LINES[1]#release_commit=}"
PETCLAW_RELEASE_ID="${PETCLAW_PROVENANCE_LINES[2]#release_id=}"
if [[ "${PETCLAW_RELEASE_SOURCE_NAME}" != "${PETCLAW_RELEASE_ID}" \
  || ( -n "${PETCLAW_REQUESTED_RELEASE_ID}" \
    && "${PETCLAW_REQUESTED_RELEASE_ID}" != "${PETCLAW_RELEASE_ID}" ) ]]; then
  echo "ERROR: requested release id does not match signed provenance." >&2
  exit 2
fi
PETCLAW_CANDIDATE_APP="petclaw-web-${PETCLAW_RELEASE_ID}"
if [[ -n "${PETCLAW_REQUESTED_CANDIDATE_APP}" \
  && "${PETCLAW_REQUESTED_CANDIDATE_APP}" != "${PETCLAW_CANDIDATE_APP}" ]]; then
  echo "ERROR: candidate process name must be derived from signed provenance." >&2
  exit 2
fi
if [[ ! -f "${PETCLAW_ENV_SOURCE}" || -L "${PETCLAW_ENV_SOURCE}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_ENV_SOURCE}")" != "ubuntu:ubuntu:600" ]]; then
  echo "ERROR: pinned production env must be an ubuntu-owned mode-600 regular file." >&2
  exit 2
fi

petclaw_require_launch_flag_false() {
  local PETCLAW_FLAG_NAME="$1"
  local PETCLAW_ASSIGNMENT_COUNT
  PETCLAW_ASSIGNMENT_COUNT="$(grep -Ec "^[[:space:]]*(export[[:space:]]+)?${PETCLAW_FLAG_NAME}[[:space:]]*=" "${PETCLAW_ENV_SOURCE}" || true)"
  if [[ "${PETCLAW_ASSIGNMENT_COUNT}" != "1" \
    || "$(grep -Fxc "${PETCLAW_FLAG_NAME}=false" "${PETCLAW_ENV_SOURCE}" || true)" != "1" ]]; then
    echo "ERROR: production env must contain exactly one literal ${PETCLAW_FLAG_NAME}=false launch gate." >&2
    exit 2
  fi
}
for PETCLAW_DISABLED_LAUNCH_FLAG in \
  PAYMENTS_ENABLED \
  OAUTH_CONNECTIONS_ENABLED \
  AGENT_CHANNELS_ENABLED \
  PET_LORA_ENABLED \
  BLOCKCHAIN_ENABLED \
  REFERRALS_ENABLED; do
  petclaw_require_launch_flag_false "${PETCLAW_DISABLED_LAUNCH_FLAG}"
done
petclaw_require_launch_assignment_absent() {
  local PETCLAW_ABSENT_NAME="$1"
  local PETCLAW_ASSIGNMENT_COUNT
  PETCLAW_ASSIGNMENT_COUNT="$(grep -Ec "^[[:space:]]*(export[[:space:]]+)?${PETCLAW_ABSENT_NAME}[[:space:]]*=" "${PETCLAW_ENV_SOURCE}" || true)"
  if [[ "${PETCLAW_ASSIGNMENT_COUNT}" != "0" ]]; then
    echo "ERROR: production env must not set ${PETCLAW_ABSENT_NAME} in the STARTING SOON release." >&2
    exit 2
  fi
}
for PETCLAW_ABSENT_SEASON_VALUE in \
  NEXT_PUBLIC_SEASON1_START_MS \
  NEXT_PUBLIC_SEASON1_END_MS; do
  petclaw_require_launch_assignment_absent "${PETCLAW_ABSENT_SEASON_VALUE}"
done
petclaw_require_launch_value() {
  local PETCLAW_VALUE_NAME="$1"
  local PETCLAW_EXPECTED_VALUE="$2"
  local PETCLAW_ASSIGNMENT_COUNT
  PETCLAW_ASSIGNMENT_COUNT="$(grep -Ec "^[[:space:]]*(export[[:space:]]+)?${PETCLAW_VALUE_NAME}[[:space:]]*=" "${PETCLAW_ENV_SOURCE}" || true)"
  if [[ "${PETCLAW_ASSIGNMENT_COUNT}" != "1" \
    || "$(grep -Fxc "${PETCLAW_VALUE_NAME}=${PETCLAW_EXPECTED_VALUE}" "${PETCLAW_ENV_SOURCE}" || true)" != "1" ]]; then
    echo "ERROR: production env must contain exactly one literal ${PETCLAW_VALUE_NAME}=${PETCLAW_EXPECTED_VALUE}." >&2
    exit 2
  fi
}
for PETCLAW_REQUIRED_LAUNCH_VALUE in \
  AVATAR_UPLOAD_USER_DAILY_CAP=20 \
  AVATAR_UPLOAD_GLOBAL_DAILY_CAP=1000 \
  AVATAR_PREVIEW_TTL_HOURS=24 \
  LOCAL_STORAGE_MIN_FREE_BYTES=2147483648 \
  VISION_DAILY_CAP=300 \
  VISION_USER_DAILY_CAP=30; do
  petclaw_require_launch_value \
    "${PETCLAW_REQUIRED_LAUNCH_VALUE%%=*}" \
    "${PETCLAW_REQUIRED_LAUNCH_VALUE#*=}"
done
if [[ ! -f "${PETCLAW_NGINX_SITE}" || -L "${PETCLAW_NGINX_SITE}" \
  || "$(stat -c '%U:%G' "${PETCLAW_NGINX_SITE}")" != "root:root" \
  || "$(stat -c '%a' "${PETCLAW_NGINX_SITE}")" != "644" ]]; then
  echo "ERROR: pinned nginx site must be a root-owned mode-644 regular non-symlink file." >&2
  exit 2
fi
if find "${PETCLAW_RELEASE_SOURCE}" -type l -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_SOURCE}" -mindepth 1 \
    ! -type f ! -type d -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_SOURCE}" -type f -links +1 -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_SOURCE}" ! -user root -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_SOURCE}" -perm /022 -print -quit | grep -q .; then
  echo "ERROR: release source is not a root-owned read-only verified tree." >&2
  exit 2
fi
if [[ ! -x "${PETCLAW_TRUSTED_BOOT_GUARD}" || -L "${PETCLAW_TRUSTED_BOOT_GUARD}" \
  || "$(stat -c '%U:%G' "${PETCLAW_TRUSTED_BOOT_GUARD}")" != "root:root" ]]; then
  echo "ERROR: trusted release boot guard is unavailable." >&2
  exit 2
fi
sudo "${PETCLAW_TRUSTED_BOOT_GUARD}" --ensure-lock
if [[ ! -d "$(dirname "${PETCLAW_RELEASE_LOCK}")" \
  || -L "$(dirname "${PETCLAW_RELEASE_LOCK}")" \
  || "$(realpath -e "$(dirname "${PETCLAW_RELEASE_LOCK}")")" != "$(dirname "${PETCLAW_RELEASE_LOCK}")" \
  || "$(stat -c '%U:%G:%a' "$(dirname "${PETCLAW_RELEASE_LOCK}")")" != "root:ubuntu:750" \
  || ! -f "${PETCLAW_RELEASE_LOCK}" || -L "${PETCLAW_RELEASE_LOCK}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_RELEASE_LOCK}")" != "root:ubuntu:660" ]]; then
  echo "ERROR: root-created release generation lock is unsafe." >&2
  exit 2
fi
exec 9<>"${PETCLAW_RELEASE_LOCK}"
if ! flock -n 9; then
  echo "ERROR: another PetClaw release is already running." >&2
  exit 3
fi

# A killed deploy releases flock but leaves a durable intent/transient unit.
# Reconcile that generation before accepting or validating a newer release.
if sudo test -e "${PETCLAW_ROLLBACK_INTENT}" || sudo test -L "${PETCLAW_ROLLBACK_INTENT}"; then
  if [[ ! -x /usr/local/sbin/petclaw-release-boot-guard.sh \
    || "$(sudo stat -c '%U:%G' /usr/local/sbin/petclaw-release-boot-guard.sh)" != "root:root" ]]; then
    echo "ERROR: stale rollback intent exists but the trusted boot guard is unavailable." >&2
    exit 2
  fi
  sudo /usr/local/sbin/petclaw-release-boot-guard.sh
fi
mapfile -t PETCLAW_STALE_ROLLBACK_UNITS < <(
  sudo systemctl list-units --all --plain --no-legend \
    'petclaw-release-rollback-*.timer' 'petclaw-release-rollback-*.service' \
    | awk '{print $1}'
)
for PETCLAW_STALE_ROLLBACK_UNIT in "${PETCLAW_STALE_ROLLBACK_UNITS[@]}"; do
  if [[ "${PETCLAW_STALE_ROLLBACK_UNIT}" =~ ^petclaw-release-rollback-[A-Za-z0-9@_.:-]+\.(timer|service)$ ]]; then
    sudo systemctl stop "${PETCLAW_STALE_ROLLBACK_UNIT}"
  fi
done

if [[ -e "${PETCLAW_CURRENT_LINK}" || -L "${PETCLAW_CURRENT_LINK}" ]]; then
  if [[ ! -L "${PETCLAW_CURRENT_LINK}" ]]; then
    echo "ERROR: current release pointer must be a symlink." >&2
    exit 2
  fi
  PETCLAW_VALIDATED_CURRENT_TARGET="$(readlink -e "${PETCLAW_CURRENT_LINK}" 2>/dev/null || true)"
  PETCLAW_VALIDATED_CURRENT_NAME="${PETCLAW_VALIDATED_CURRENT_TARGET#/opt/petclaw/releases/}"
  if [[ "${PETCLAW_VALIDATED_CURRENT_TARGET}" != /opt/petclaw/releases/* \
    || "${PETCLAW_VALIDATED_CURRENT_NAME}" == */* \
    || ! "${PETCLAW_VALIDATED_CURRENT_NAME}" =~ ^[A-Za-z0-9._-]{6,80}$ \
    || ! -f "${PETCLAW_VALIDATED_CURRENT_TARGET}/RELEASE_COMMITTED" \
    || -L "${PETCLAW_VALIDATED_CURRENT_TARGET}/RELEASE_COMMITTED" ]]; then
    echo "ERROR: current release pointer is not one committed direct child of the pinned release root." >&2
    exit 2
  fi
fi

if [[ ! "${PETCLAW_RELEASE_ID}" =~ ^[A-Za-z0-9._-]{6,80}$ ]]; then
  echo "ERROR: invalid PETCLAW_RELEASE_ID." >&2
  exit 2
fi
if [[ "${PETCLAW_RELEASE_PREFLIGHT_ONLY}" != "0" \
  && "${PETCLAW_RELEASE_PREFLIGHT_ONLY}" != "1" ]]; then
  echo "ERROR: PETCLAW_RELEASE_PREFLIGHT_ONLY must be 0 or 1." >&2
  exit 2
fi

if [[ ! -f "${PETCLAW_RELEASE_SOURCE}/web/package-lock.json" \
  || ! -f "${PETCLAW_RELEASE_SOURCE}/deploy/backup-verification-public-key.asc" \
  || ! -f "${PETCLAW_RELEASE_SOURCE}/deploy/release-boot-guard.sh" \
  || -L "${PETCLAW_RELEASE_SOURCE}/deploy/release-boot-guard.sh" \
  || ! -f "${PETCLAW_RELEASE_SOURCE}/deploy/petclaw-release-boot-guard.service" \
  || -L "${PETCLAW_RELEASE_SOURCE}/deploy/petclaw-release-boot-guard.service" \
  || ! -f "${PETCLAW_RELEASE_SOURCE}/deploy/release-rollback-watchdog.sh" \
  || -L "${PETCLAW_RELEASE_SOURCE}/deploy/release-rollback-watchdog.sh" \
  || ! -f "${PETCLAW_RELEASE_SOURCE}/deploy/scan-release-language.mjs" \
  || -L "${PETCLAW_RELEASE_SOURCE}/deploy/scan-release-language.mjs" \
  || ! -f "${PETCLAW_RELEASE_SOURCE}/deploy/destructive-migrations.allowlist" \
  || -L "${PETCLAW_RELEASE_SOURCE}/deploy/destructive-migrations.allowlist" \
  || ! -f "${PETCLAW_ENV_SOURCE}" ]]; then
  echo "ERROR: release source, backup public key, or production env is missing." >&2
  exit 2
fi
if [[ -z "${PETCLAW_BACKUP_EVIDENCE}" \
  || ! -f "${PETCLAW_BACKUP_EVIDENCE}" \
  || -L "${PETCLAW_BACKUP_EVIDENCE}" \
  || "$(basename "${PETCLAW_BACKUP_EVIDENCE}")" != "release-receipt.env" ]]; then
  echo "ERROR: set PETCLAW_BACKUP_EVIDENCE to a regular signed release-receipt.env." >&2
  exit 2
fi
PETCLAW_BACKUP_EVIDENCE_DIR="$(dirname "${PETCLAW_BACKUP_EVIDENCE}")"
PETCLAW_BACKUP_SIGNATURE="${PETCLAW_BACKUP_EVIDENCE}.sig"
PETCLAW_BACKUP_COMPLETE="${PETCLAW_BACKUP_EVIDENCE_DIR}/BACKUP_COMPLETE"
if [[ -L "${PETCLAW_BACKUP_EVIDENCE_DIR}" \
  || ! -f "${PETCLAW_BACKUP_SIGNATURE}" || -L "${PETCLAW_BACKUP_SIGNATURE}" \
  || ! -f "${PETCLAW_BACKUP_COMPLETE}" || -L "${PETCLAW_BACKUP_COMPLETE}" ]]; then
  echo "ERROR: signed receipt, signature, and completion marker must be regular files." >&2
  exit 2
fi
for PETCLAW_BACKUP_PROOF_FILE in \
  "${PETCLAW_BACKUP_EVIDENCE}" "${PETCLAW_BACKUP_SIGNATURE}" "${PETCLAW_BACKUP_COMPLETE}"; do
  if ! find "${PETCLAW_BACKUP_PROOF_FILE}" -mmin -360 -print -quit | grep -q .; then
    echo "ERROR: backup proof must be less than six hours old." >&2
    exit 2
  fi
done

petclaw_require_receipt_line() {
  local PETCLAW_EXPECTED_LINE="$1"
  if [[ "$(grep -Fxc "${PETCLAW_EXPECTED_LINE}" "${PETCLAW_BACKUP_EVIDENCE}" || true)" != "1" ]]; then
    echo "ERROR: signed backup receipt is missing required proof: ${PETCLAW_EXPECTED_LINE%%=*}." >&2
    exit 2
  fi
}
for PETCLAW_REQUIRED_RECEIPT_LINE in \
  'receipt_version=2' \
  'encrypted=true' \
  'snapshot_quiesced=true' \
  'restore_verified=true' \
  'media_refs_verified=true' \
  "gpg_recipient=${PETCLAW_BACKUP_SIGNING_FINGERPRINT}" \
  'retention_days=90'; do
  petclaw_require_receipt_line "${PETCLAW_REQUIRED_RECEIPT_LINE}"
done
for PETCLAW_HASH_FIELD in database_sha256 media_sha256 database_cipher_sha256 media_cipher_sha256 backup_complete_sha256; do
  if [[ "$(grep -Ec "^${PETCLAW_HASH_FIELD}=[0-9a-f]{64}$" "${PETCLAW_BACKUP_EVIDENCE}" || true)" != "1" ]]; then
    echo "ERROR: signed backup receipt has an invalid ${PETCLAW_HASH_FIELD}." >&2
    exit 2
  fi
done
if [[ "$(grep -Ec '^verified_at_utc=[0-9]{8}T[0-9]{6}Z$' "${PETCLAW_BACKUP_EVIDENCE}" || true)" != "1" \
  || "$(grep -Ec '^off_host_path=/.*\/[0-9]{8}T[0-9]{6}Z$' "${PETCLAW_BACKUP_EVIDENCE}" || true)" != "1" ]]; then
  echo "ERROR: signed backup receipt has invalid time or off-host path evidence." >&2
  exit 2
fi
PETCLAW_BACKUP_STAMP="$(sed -n 's/^verified_at_utc=//p' "${PETCLAW_BACKUP_EVIDENCE}")"
PETCLAW_OFFHOST_PATH="$(sed -n 's/^off_host_path=//p' "${PETCLAW_BACKUP_EVIDENCE}")"
PETCLAW_BACKUP_ISO="${PETCLAW_BACKUP_STAMP:0:4}-${PETCLAW_BACKUP_STAMP:4:2}-${PETCLAW_BACKUP_STAMP:6:2}T${PETCLAW_BACKUP_STAMP:9:2}:${PETCLAW_BACKUP_STAMP:11:2}:${PETCLAW_BACKUP_STAMP:13:2}Z"
if ! PETCLAW_BACKUP_EPOCH="$(date -u -d "${PETCLAW_BACKUP_ISO}" +%s 2>/dev/null)"; then
  echo "ERROR: signed backup timestamp is not parseable." >&2
  exit 2
fi
PETCLAW_BACKUP_AGE_SECONDS="$(( $(date -u +%s) - PETCLAW_BACKUP_EPOCH ))"
if (( PETCLAW_BACKUP_AGE_SECONDS < -300 || PETCLAW_BACKUP_AGE_SECONDS > 21600 )); then
  echo "ERROR: signed backup timestamp is in the future or older than six hours." >&2
  exit 2
fi
if [[ "$(basename "${PETCLAW_OFFHOST_PATH}")" != "${PETCLAW_BACKUP_STAMP}" \
  || "$(cat "${PETCLAW_BACKUP_COMPLETE}")" != "complete_at_utc=${PETCLAW_BACKUP_STAMP}" ]]; then
  echo "ERROR: backup timestamp, off-host path, and completion marker disagree." >&2
  exit 2
fi
PETCLAW_COMPLETE_EXPECTED_SHA="$(sed -n 's/^backup_complete_sha256=//p' "${PETCLAW_BACKUP_EVIDENCE}")"
PETCLAW_COMPLETE_ACTUAL_SHA="$(sha256sum "${PETCLAW_BACKUP_COMPLETE}" | awk '{print $1}')"
if [[ "${PETCLAW_COMPLETE_ACTUAL_SHA}" != "${PETCLAW_COMPLETE_EXPECTED_SHA}" ]]; then
  echo "ERROR: backup completion marker hash does not match the signed receipt." >&2
  exit 2
fi

PETCLAW_RECEIPT_GPG_HOME="$(mktemp -d)"
chmod 700 "${PETCLAW_RECEIPT_GPG_HOME}"
if ! gpg --homedir "${PETCLAW_RECEIPT_GPG_HOME}" --batch --quiet --import \
    "${PETCLAW_RELEASE_SOURCE}/deploy/backup-verification-public-key.asc"; then
  rm -rf -- "${PETCLAW_RECEIPT_GPG_HOME}"
  echo "ERROR: backup verification key could not be imported." >&2
  exit 2
fi

# A bundle containing the pinned key and an attacker key must not satisfy the
# pin. Accept exactly one primary key, then bind VALIDSIG to the dedicated
# signing subkey and its pinned primary fingerprint.
mapfile -t PETCLAW_IMPORTED_PRIMARY_FPRS < <(
  gpg --homedir "${PETCLAW_RECEIPT_GPG_HOME}" --batch --with-colons --fingerprint \
    | awk -F: '$1 == "pub" { want_fpr = 1; next } want_fpr && $1 == "fpr" { print $10; want_fpr = 0 }'
)
if [[ "${#PETCLAW_IMPORTED_PRIMARY_FPRS[@]}" != "1" \
  || "${PETCLAW_IMPORTED_PRIMARY_FPRS[0]:-}" != "${PETCLAW_BACKUP_SIGNING_FINGERPRINT}" ]]; then
  rm -rf -- "${PETCLAW_RECEIPT_GPG_HOME}"
  echo "ERROR: backup verification key bundle is not the single pinned production key." >&2
  exit 2
fi
if ! PETCLAW_GPG_STATUS="$(gpg --homedir "${PETCLAW_RECEIPT_GPG_HOME}" --batch \
    --status-fd=1 --verify "${PETCLAW_BACKUP_SIGNATURE}" \
    "${PETCLAW_BACKUP_EVIDENCE}" 2>/dev/null)"; then
  rm -rf -- "${PETCLAW_RECEIPT_GPG_HOME}"
  echo "ERROR: backup receipt signature verification failed." >&2
  exit 2
fi
mapfile -t PETCLAW_VALID_SIGNATURES < <(
  printf '%s\n' "${PETCLAW_GPG_STATUS}" \
    | awk '$1 == "[GNUPG:]" && $2 == "VALIDSIG" { print $3 ":" $NF }'
)
if [[ "${#PETCLAW_VALID_SIGNATURES[@]}" != "1" \
  || "${PETCLAW_VALID_SIGNATURES[0]:-}" != "${PETCLAW_BACKUP_SIGNING_SUBKEY_FINGERPRINT}:${PETCLAW_BACKUP_SIGNING_FINGERPRINT}" ]]; then
  rm -rf -- "${PETCLAW_RECEIPT_GPG_HOME}"
  echo "ERROR: backup receipt was not signed by the pinned production signing subkey." >&2
  exit 2
fi
rm -rf -- "${PETCLAW_RECEIPT_GPG_HOME}"
if find "${PETCLAW_RELEASE_SOURCE}" -type f \
    \( -name '.env*' -o -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name '*.pfx' \) \
    -print -quit | grep -q . \
  || [[ -d "${PETCLAW_RELEASE_SOURCE}/web/node_modules" || -d "${PETCLAW_RELEASE_SOURCE}/web/.next" ]]; then
  echo "ERROR: release source contains generated dependencies or secret-like files." >&2
  exit 2
fi
for PETCLAW_TRUSTED_GATE in "${PETCLAW_TRUSTED_SCANNER}" "${PETCLAW_TRUSTED_MIGRATION_GATE}"; do
  if [[ ! -f "${PETCLAW_TRUSTED_GATE}" || -L "${PETCLAW_TRUSTED_GATE}" \
    || "$(stat -c '%U:%G' "${PETCLAW_TRUSTED_GATE}")" != "root:root" ]]; then
    echo "ERROR: required root-owned trusted release gate is unavailable." >&2
    exit 2
  fi
  PETCLAW_TRUSTED_GATE_MODE="$(stat -c '%a' "${PETCLAW_TRUSTED_GATE}")"
  if (( (8#${PETCLAW_TRUSTED_GATE_MODE} & 8#022) != 0 )); then
    echo "ERROR: trusted release gate is writable by group or other." >&2
    exit 2
  fi
done
/bin/bash "${PETCLAW_TRUSTED_SCANNER}" "${PETCLAW_RELEASE_SOURCE}"
/bin/bash "${PETCLAW_TRUSTED_MIGRATION_GATE}" \
  "${PETCLAW_RELEASE_SOURCE}" \
  "${PETCLAW_RELEASE_SOURCE}/deploy/destructive-migrations.allowlist"
PETCLAW_PREBUILD_MIN_FREE_BYTES=$((6 * 1024 * 1024 * 1024))
PETCLAW_AVAILABLE_BYTES="$(df --output=avail -B1 /opt/petclaw | tail -n 1 | tr -d '[:space:]')"
if [[ ! "${PETCLAW_AVAILABLE_BYTES}" =~ ^[0-9]+$ ]] \
  || (( PETCLAW_AVAILABLE_BYTES < PETCLAW_PREBUILD_MIN_FREE_BYTES )); then
  echo "ERROR: release build requires at least 6 GiB free on /opt/petclaw." >&2
  exit 2
fi
if [[ "${PETCLAW_RELEASE_PREFLIGHT_ONLY}" == "1" ]]; then
  echo "Release preflight passed: source policy and signed backup evidence are valid."
  exit 0
fi

# Remove only abandoned candidate processes. Preserve the current release and
# one committed previous release until the new candidate has fully committed.
PETCLAW_PREDEPLOY_CURRENT_TARGET="${PETCLAW_VALIDATED_CURRENT_TARGET:-}"
# JavaScript template literals are passed verbatim.
# shellcheck disable=SC2016
PETCLAW_PREDEPLOY_STALE_PROCESSES="$(pm2 jlist | node -e '
  const fs = require("node:fs");
  let raw = "";
  process.stdin.on("data", chunk => raw += chunk);
  process.stdin.on("end", () => {
    const currentTarget = process.argv[1];
    const releaseRoot = "/opt/petclaw/releases/";
    const candidates = [];
    for (const proc of JSON.parse(raw || "[]")) {
      const name = String(proc.name || "");
      const cwd = String(proc.pm2_env?.pm_cwd || "").replace(/\/web$/, "");
      if (!name.startsWith("petclaw-web-")) continue;
      if (currentTarget && cwd === currentTarget) continue;
      const releaseName = cwd.startsWith(releaseRoot) ? cwd.slice(releaseRoot.length) : "";
      const committed = /^[A-Za-z0-9._-]{6,80}$/.test(releaseName)
        && fs.existsSync(`${cwd}/RELEASE_COMMITTED`)
        && proc.pm2_env?.status === "online";
      candidates.push({ name, committed, uptime: Number(proc.pm2_env?.pm_uptime || 0) });
    }
    const previous = candidates.filter((entry) => entry.committed)
      .sort((a, b) => b.uptime - a.uptime)[0]?.name;
    for (const candidate of candidates) {
      if (candidate.name !== previous) process.stdout.write(`${candidate.name}\n`);
    }
  });
' "${PETCLAW_PREDEPLOY_CURRENT_TARGET}")"
PETCLAW_PREDEPLOY_DELETED=0
while IFS= read -r PETCLAW_PREDEPLOY_STALE_PROCESS; do
  if [[ -n "${PETCLAW_PREDEPLOY_STALE_PROCESS}" ]]; then
    pm2 delete "${PETCLAW_PREDEPLOY_STALE_PROCESS}" >/dev/null || true
    PETCLAW_PREDEPLOY_DELETED=1
  fi
done <<< "${PETCLAW_PREDEPLOY_STALE_PROCESSES}"
if [[ "${PETCLAW_PREDEPLOY_DELETED}" == "1" ]]; then
  pm2 save >/dev/null
fi

if [[ -z "${PETCLAW_CANDIDATE_PORT}" ]]; then
  for PETCLAW_PORT_CANDIDATE in 3001 3002 3003; do
    if ! ss -H -ltn "sport = :${PETCLAW_PORT_CANDIDATE}" | grep -q .; then
      PETCLAW_CANDIDATE_PORT="${PETCLAW_PORT_CANDIDATE}"
      break
    fi
  done
fi
if [[ ! "${PETCLAW_CANDIDATE_PORT}" =~ ^300[123]$ ]]; then
  echo "ERROR: no validated candidate port is available." >&2
  exit 2
fi

PETCLAW_RELEASE_DIR="${PETCLAW_RELEASES_DIR}/${PETCLAW_RELEASE_ID}"
if [[ -e "${PETCLAW_RELEASE_DIR}" ]]; then
  echo "ERROR: immutable release already exists: ${PETCLAW_RELEASE_DIR}" >&2
  exit 2
fi
PETCLAW_RELEASE_DIR_CREATED=0
PETCLAW_CANDIDATE_STARTED=0
PETCLAW_SWITCH_STARTED=0
PETCLAW_RELEASE_COMMITTED=0
PETCLAW_NGINX_BACKUP_READY=0
PETCLAW_PREVIOUS_TARGET=""
PETCLAW_NGINX_RENDERED=""
PETCLAW_NGINX_RENDERED_CREATED=0
PETCLAW_LINK_TMP=""
PETCLAW_LINK_TMP_CREATED=0
PETCLAW_ROLLBACK_LINK_TMP="${PETCLAW_CURRENT_LINK}.rollback-${PETCLAW_RELEASE_ID}"
PETCLAW_ROLLBACK_LINK_TMP_CREATED=0
PETCLAW_NGINX_BACKUP="${PETCLAW_NGINX_SITE}.pre-${PETCLAW_RELEASE_ID}"
PETCLAW_ROLLBACK_WATCHDOG_UNIT=""
PETCLAW_ROLLBACK_WATCHDOG_ARMED=0
PETCLAW_BOOT_GUARD_ARMED=0
PETCLAW_ROLLBACK_FAILED=0
PETCLAW_ROLLBACK_WATCHDOG_BIN=""

petclaw_disarm_rollback_watchdog() {
  if [[ "${PETCLAW_ROLLBACK_WATCHDOG_ARMED}" == "1" \
    && -n "${PETCLAW_ROLLBACK_WATCHDOG_UNIT}" ]]; then
    sudo systemctl stop "${PETCLAW_ROLLBACK_WATCHDOG_UNIT}.timer" \
      "${PETCLAW_ROLLBACK_WATCHDOG_UNIT}.service" >/dev/null 2>&1 || true
    if sudo systemctl is-active --quiet "${PETCLAW_ROLLBACK_WATCHDOG_UNIT}.timer" \
      || sudo systemctl is-active --quiet "${PETCLAW_ROLLBACK_WATCHDOG_UNIT}.service"; then
      echo "ERROR: rollback watchdog could not be disarmed." >&2
      return 1
    fi
    PETCLAW_ROLLBACK_WATCHDOG_ARMED=0
  fi
}

petclaw_disarm_boot_guard() {
  if [[ "${PETCLAW_BOOT_GUARD_ARMED}" == "1" ]]; then
    if ! sudo /usr/local/sbin/petclaw-release-boot-guard.sh \
      --disarm "${PETCLAW_RELEASE_DIR}" >/dev/null; then
      echo "ERROR: persistent boot rollback intent could not be disarmed." >&2
      return 1
    fi
    PETCLAW_BOOT_GUARD_ARMED=0
  fi
}

petclaw_rollback() {
  echo "ERROR: release did not commit; rolling traffic back." >&2
  local PETCLAW_ROLLBACK_CURRENT=""
  if [[ "${PETCLAW_NGINX_BACKUP_READY}" != "1" \
    || ! -f "${PETCLAW_NGINX_BACKUP}" || -L "${PETCLAW_NGINX_BACKUP}" ]]; then
    echo "ERROR: validated nginx rollback evidence is unavailable; recovery remains armed." >&2
    return 1
  fi
  PETCLAW_ROLLBACK_CURRENT="$(readlink -e "${PETCLAW_CURRENT_LINK}" 2>/dev/null || true)"
  if [[ "${PETCLAW_ROLLBACK_CURRENT}" != "${PETCLAW_RELEASE_DIR}" ]]; then
    if [[ -n "${PETCLAW_PREVIOUS_TARGET}" \
      && "${PETCLAW_ROLLBACK_CURRENT}" == "${PETCLAW_PREVIOUS_TARGET}" ]]; then
      : # The pointer swap failed or another recovery already restored it.
    elif [[ -z "${PETCLAW_PREVIOUS_TARGET}" && -z "${PETCLAW_ROLLBACK_CURRENT}" ]]; then
      : # First immutable pointer swap did not occur.
    else
      echo "ERROR: current pointer no longer matches this rollback generation." >&2
      return 1
    fi
  fi
  if ! sudo install -o root -g root -m 644 \
    "${PETCLAW_NGINX_BACKUP}" "${PETCLAW_NGINX_SITE}"; then
    echo "ERROR: previous nginx configuration could not be restored." >&2
    return 1
  fi
  if [[ "${PETCLAW_ROLLBACK_CURRENT}" == "${PETCLAW_RELEASE_DIR}" \
    && -n "${PETCLAW_PREVIOUS_TARGET}" ]]; then
    if [[ -e "${PETCLAW_ROLLBACK_LINK_TMP}" || -L "${PETCLAW_ROLLBACK_LINK_TMP}" ]]; then
      echo "ERROR: rollback temporary pointer already exists; recovery remains armed." >&2
      return 1
    fi
    if ! sudo ln -s "${PETCLAW_PREVIOUS_TARGET}" "${PETCLAW_ROLLBACK_LINK_TMP}"; then
      echo "ERROR: rollback pointer could not be created." >&2
      return 1
    fi
    PETCLAW_ROLLBACK_LINK_TMP_CREATED=1
    if ! sudo mv -Tf "${PETCLAW_ROLLBACK_LINK_TMP}" "${PETCLAW_CURRENT_LINK}"; then
      echo "ERROR: rollback pointer could not be installed." >&2
      return 1
    fi
    PETCLAW_ROLLBACK_LINK_TMP_CREATED=0
    if [[ "$(readlink -e "${PETCLAW_CURRENT_LINK}" 2>/dev/null || true)" \
      != "${PETCLAW_PREVIOUS_TARGET}" ]]; then
      echo "ERROR: previous release pointer did not restore exactly." >&2
      return 1
    fi
  elif [[ "${PETCLAW_ROLLBACK_CURRENT}" == "${PETCLAW_RELEASE_DIR}" \
    && -L "${PETCLAW_CURRENT_LINK}" ]]; then
    if ! sudo unlink "${PETCLAW_CURRENT_LINK}"; then
      echo "ERROR: first-release pointer could not be removed." >&2
      return 1
    fi
  elif [[ "${PETCLAW_ROLLBACK_CURRENT}" == "${PETCLAW_RELEASE_DIR}" ]]; then
    echo "ERROR: first-release rollback pointer is no longer a symlink." >&2
    return 1
  fi
  if ! sudo nginx -t; then
    echo "ERROR: restored nginx configuration did not validate." >&2
    return 1
  fi
  if ! sudo systemctl reload nginx; then
    echo "ERROR: nginx did not reload the restored configuration." >&2
    return 1
  fi
  if ! curl -fsS --max-time 20 --resolve app.myaipet.ai:443:127.0.0.1 \
    https://app.myaipet.ai/api/health >/dev/null; then
    echo "ERROR: restored route did not pass local TLS health; recovery remains armed." >&2
    return 1
  fi
  if [[ "${PETCLAW_CANDIDATE_STARTED}" == "1" ]]; then
    if ! pm2 delete "${PETCLAW_CANDIDATE_APP}" >/dev/null; then
      echo "ERROR: failed candidate process could not be removed." >&2
      return 1
    fi
    PETCLAW_CANDIDATE_STARTED=0
  fi
  if ! pm2 save >/dev/null; then
    echo "ERROR: restored PM2 state could not be persisted." >&2
    return 1
  fi
  if ! petclaw_disarm_boot_guard; then
    return 1
  fi
  if ! petclaw_disarm_rollback_watchdog; then
    return 1
  fi
  PETCLAW_SWITCH_STARTED=0
}

petclaw_release_exit() {
  PETCLAW_RELEASE_EXIT_CODE=$?
  trap - EXIT
  if [[ "${PETCLAW_RELEASE_EXIT_CODE}" -ne 0 && "${PETCLAW_SWITCH_STARTED}" == "1" ]]; then
    if ! petclaw_rollback; then
      PETCLAW_ROLLBACK_FAILED=1
      PETCLAW_RELEASE_EXIT_CODE=70
      echo "ERROR: automatic rollback failed closed; durable recovery intent was preserved." >&2
    fi
  elif [[ "${PETCLAW_RELEASE_EXIT_CODE}" -ne 0 && "${PETCLAW_CANDIDATE_STARTED}" == "1" ]]; then
    pm2 delete "${PETCLAW_CANDIDATE_APP}" >/dev/null 2>&1 || true
    pm2 save >/dev/null 2>&1 || true
  fi
  if [[ "${PETCLAW_ROLLBACK_FAILED}" == "0" && "${PETCLAW_SWITCH_STARTED}" == "0" ]]; then
    if [[ "${PETCLAW_BOOT_GUARD_ARMED}" == "1" ]] && ! petclaw_disarm_boot_guard; then
      PETCLAW_RELEASE_EXIT_CODE=70
    fi
    if [[ "${PETCLAW_ROLLBACK_WATCHDOG_ARMED}" == "1" ]] \
      && ! petclaw_disarm_rollback_watchdog; then
      PETCLAW_RELEASE_EXIT_CODE=70
    fi
  fi
  if [[ "${PETCLAW_ROLLBACK_FAILED}" == "0" \
    && "${PETCLAW_ROLLBACK_WATCHDOG_ARMED}" == "0" \
    && -n "${PETCLAW_ROLLBACK_WATCHDOG_BIN}" \
    && "${PETCLAW_ROLLBACK_WATCHDOG_BIN}" == /usr/local/libexec/petclaw/release-rollback-*.sh ]]; then
    sudo rm -f -- "${PETCLAW_ROLLBACK_WATCHDOG_BIN}" || PETCLAW_RELEASE_EXIT_CODE=70
    PETCLAW_ROLLBACK_WATCHDOG_BIN=""
  fi
  if [[ "${PETCLAW_NGINX_RENDERED_CREATED}" == "1" \
    && "${PETCLAW_NGINX_RENDERED}" == "${PETCLAW_NGINX_SITE}.next-${PETCLAW_RELEASE_ID}" \
    && -f "${PETCLAW_NGINX_RENDERED}" && ! -L "${PETCLAW_NGINX_RENDERED}" \
    && "$(sudo stat -c '%U:%G' "${PETCLAW_NGINX_RENDERED}" 2>/dev/null || true)" == "root:root" ]]; then
    sudo rm -f -- "${PETCLAW_NGINX_RENDERED}" || PETCLAW_RELEASE_EXIT_CODE=70
    PETCLAW_NGINX_RENDERED_CREATED=0
  fi
  if [[ "${PETCLAW_LINK_TMP_CREATED}" == "1" && -L "${PETCLAW_LINK_TMP}" ]]; then
    sudo unlink "${PETCLAW_LINK_TMP}" || PETCLAW_RELEASE_EXIT_CODE=70
  fi
  if [[ "${PETCLAW_ROLLBACK_LINK_TMP_CREATED}" == "1" \
    && -L "${PETCLAW_ROLLBACK_LINK_TMP}" ]]; then
    sudo unlink "${PETCLAW_ROLLBACK_LINK_TMP}" || PETCLAW_RELEASE_EXIT_CODE=70
  fi
  if [[ "${PETCLAW_RELEASE_EXIT_CODE}" -ne 0 \
    && "${PETCLAW_RELEASE_COMMITTED}" == "0" \
    && "${PETCLAW_ROLLBACK_FAILED}" == "0" \
    && "${PETCLAW_BOOT_GUARD_ARMED}" == "0" \
    && "${PETCLAW_ROLLBACK_WATCHDOG_ARMED}" == "0" \
    && "${PETCLAW_RELEASE_DIR_CREATED}" == "1" \
    && "${PETCLAW_RELEASE_DIR}" == "${PETCLAW_RELEASES_DIR}/${PETCLAW_RELEASE_ID}" \
    && -d "${PETCLAW_RELEASE_DIR}" && ! -L "${PETCLAW_RELEASE_DIR}" ]]; then
    sudo find "${PETCLAW_RELEASE_DIR}" -depth -delete
  fi
  exit "${PETCLAW_RELEASE_EXIT_CODE}"
}
trap petclaw_release_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

sudo install -d -o root -g root -m 755 "${PETCLAW_RELEASES_DIR}"
sudo install -d -o ubuntu -g ubuntu -m 700 "${PETCLAW_RELEASE_DIR}"
PETCLAW_RELEASE_DIR_CREATED=1
cp -R --preserve=mode,timestamps --no-preserve=ownership \
  "${PETCLAW_RELEASE_SOURCE}/." "${PETCLAW_RELEASE_DIR}/"
sudo chown -R ubuntu:ubuntu "${PETCLAW_RELEASE_DIR}"
sudo chmod -R u+w "${PETCLAW_RELEASE_DIR}"
install -m 600 "${PETCLAW_ENV_SOURCE}" "${PETCLAW_RELEASE_DIR}/web/.env.production"

PETCLAW_WEB="${PETCLAW_RELEASE_DIR}/web"
cd "${PETCLAW_WEB}"
npm_config_engine_strict=true npm ci --ignore-scripts --no-audit --no-fund
npx prisma generate
npm run test:ui-contract
npm run test:release-readiness
npm run test:community-fallback
npm run build

# Standalone runtime needs these static trees but never dotenv/key files.
install -d -m 755 .next/standalone/.next/static .next/standalone/public
cp -a .next/static/. .next/standalone/.next/static/
cp -a public/. .next/standalone/public/
npm run verify:artifact
node "${PETCLAW_RELEASE_SOURCE}/deploy/scan-release-language.mjs" \
  built "${PETCLAW_RELEASE_DIR}"

PETCLAW_PRESWITCH_MIN_FREE_BYTES=$((3 * 1024 * 1024 * 1024))
PETCLAW_AVAILABLE_BYTES="$(df --output=avail -B1 /opt/petclaw | tail -n 1 | tr -d '[:space:]')"
if [[ ! "${PETCLAW_AVAILABLE_BYTES}" =~ ^[0-9]+$ ]] \
  || (( PETCLAW_AVAILABLE_BYTES < PETCLAW_PRESWITCH_MIN_FREE_BYTES )); then
  echo "ERROR: candidate build left less than 3 GiB free for migration and runtime reserve." >&2
  exit 2
fi

# nginx serves these two trees directly. The restrictive release umask keeps
# every other build artifact private, so explicitly expose only the immutable
# public assets and prove the nginx worker can traverse/read them before any
# traffic switch. Production secrets remain mode 600.
chmod 755 "${PETCLAW_RELEASE_DIR}" "${PETCLAW_WEB}" "${PETCLAW_WEB}/.next"
for PETCLAW_PUBLIC_TREE in \
  "${PETCLAW_RELEASE_DIR}/landing-assets" \
  "${PETCLAW_WEB}/.next/static"; do
  find "${PETCLAW_PUBLIC_TREE}" -type d -exec chmod 755 {} +
  find "${PETCLAW_PUBLIC_TREE}" -type f -exec chmod 644 {} +
done
chmod 600 "${PETCLAW_WEB}/.env.production"
PETCLAW_STATIC_PROBE="$(find "${PETCLAW_WEB}/.next/static" -type f -print -quit)"
if [[ -z "${PETCLAW_STATIC_PROBE}" ]] \
  || ! sudo -u www-data test -r "${PETCLAW_RELEASE_DIR}/landing-assets/index.html" \
  || ! sudo -u www-data test -r "${PETCLAW_STATIC_PROBE}"; then
  echo "ERROR: nginx cannot traverse/read the release's public assets." >&2
  exit 1
fi

# The build user needed a writable candidate, but migrations and runtime must
# consume an immutable generation. Seal the candidate first, then prove every
# Prisma input and the approval file are byte-for-byte identical to the signed,
# root-owned verified source. The releases parent is root-owned, so the ubuntu
# runtime cannot rename this generation after the comparison.
petclaw_seal_release_tree "${PETCLAW_RELEASE_DIR}" "${PETCLAW_WEB}"
if ! sudo -u www-data test -r "${PETCLAW_RELEASE_DIR}/landing-assets/index.html" \
  || ! sudo -u www-data test -r "${PETCLAW_STATIC_PROBE}"; then
  echo "ERROR: post-seal nginx cannot read the explicitly public release assets." >&2
  exit 1
fi
for PETCLAW_IMMUTABLE_MIGRATION_INPUT in \
  web/prisma \
  web/prisma.config.ts \
  web/package.json \
  web/package-lock.json \
  deploy/destructive-migrations.allowlist; do
  if ! diff --no-dereference -qr \
    "${PETCLAW_RELEASE_SOURCE}/${PETCLAW_IMMUTABLE_MIGRATION_INPUT}" \
    "${PETCLAW_RELEASE_DIR}/${PETCLAW_IMMUTABLE_MIGRATION_INPUT}" >/dev/null; then
    echo "ERROR: candidate migration input differs from the signed verified source: ${PETCLAW_IMMUTABLE_MIGRATION_INPUT}." >&2
    exit 2
  fi
done
PETCLAW_PRISMA_CLI="$(realpath -e "${PETCLAW_WEB}/node_modules/.bin/prisma" 2>/dev/null || true)"
if find "${PETCLAW_RELEASE_DIR}" ! -user root -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_DIR}" ! -group ubuntu -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_DIR}" \( -type f -o -type d \) \
    -perm /022 -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_DIR}" -type d ! -perm -050 -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_DIR}" -type f ! -perm -040 -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_DIR}" -type f \
    ! -path "${PETCLAW_RELEASE_DIR}/landing-assets/*" \
    ! -path "${PETCLAW_WEB}/.next/static/*" \
    -perm /007 -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_DIR}" -type d \
    ! -path "${PETCLAW_RELEASE_DIR}" \
    ! -path "${PETCLAW_WEB}" \
    ! -path "${PETCLAW_WEB}/.next" \
    ! -path "${PETCLAW_RELEASE_DIR}/landing-assets" \
    ! -path "${PETCLAW_RELEASE_DIR}/landing-assets/*" \
    ! -path "${PETCLAW_WEB}/.next/static" \
    ! -path "${PETCLAW_WEB}/.next/static/*" \
    -perm /007 -print -quit | grep -q . \
  || [[ -z "${PETCLAW_PRISMA_CLI}" || ! -r "${PETCLAW_PRISMA_CLI}" \
    || ! -x "${PETCLAW_PRISMA_CLI}" ]]; then
  echo "ERROR: pre-migration candidate could not be sealed root-owned, non-writable, and runtime-readable." >&2
  exit 2
fi

# Check the exact signed allowlist again only after the migration inputs are
# immutable. Any destructive migration whose bytes changed or lacks an exact
# approval fails closed.
/bin/bash "${PETCLAW_TRUSTED_MIGRATION_GATE}" \
  "${PETCLAW_RELEASE_DIR}" \
  "${PETCLAW_RELEASE_DIR}/deploy/destructive-migrations.allowlist"
if ! PETCLAW_DOTENV_RECORDS="$(node - "${PETCLAW_WEB}/.env.production" <<'NODE'
const fs = require("node:fs");
const dotenv = require("dotenv");
const file = process.argv[2];
const parsed = dotenv.parse(fs.readFileSync(file));
const forbidden = /^(?:BASH_ENV|ENV|HOME|HOSTNAME|LD_.*|NODE_ENV|NODE_OPTIONS|PATH|PM2_HOME|PORT|SHELLOPTS|PETCLAW_(?:BACKUP_EVIDENCE|CANDIDATE_.*|CURRENT_LINK|DEPLOY_.*|ENV_SOURCE|NGINX_SITE|PM2_.*|RELEASE_.*|RELEASES_DIR|ROLLBACK_.*|SMOKE_.*|TRUSTED_.*))$/;
for (const key of Object.keys(parsed).sort()) {
  const value = parsed[key];
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || forbidden.test(key) || value.includes("\0")) {
    process.stderr.write(`ERROR: production dotenv contains forbidden deployment control ${key}.\n`);
    process.exit(2);
  }
  process.stdout.write(`${key}\t${Buffer.from(value, "utf8").toString("base64")}\n`);
}
NODE
)"; then
  echo "ERROR: production dotenv parsing failed." >&2
  exit 2
fi
while IFS=$'\t' read -r PETCLAW_DOTENV_NAME PETCLAW_DOTENV_VALUE_B64; do
  [[ -z "${PETCLAW_DOTENV_NAME}" ]] && continue
  if [[ ! "${PETCLAW_DOTENV_VALUE_B64}" =~ ^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$ ]]; then
    echo "ERROR: production dotenv parser returned invalid encoded data." >&2
    exit 2
  fi
  PETCLAW_DOTENV_VALUE="$(printf '%s' "${PETCLAW_DOTENV_VALUE_B64}" \
    | base64 --decode; printf '\001')"
  PETCLAW_DOTENV_VALUE="${PETCLAW_DOTENV_VALUE%$'\001'}"
  export "${PETCLAW_DOTENV_NAME}=${PETCLAW_DOTENV_VALUE}"
done <<< "${PETCLAW_DOTENV_RECORDS}"
unset PETCLAW_DOTENV_RECORDS PETCLAW_DOTENV_VALUE PETCLAW_DOTENV_VALUE_B64

# The owner FK migration must never discover production drift only after
# migration work has begun. Keep the DSN out of argv/process listings, ignore
# user psql configuration, and make both probes read-only and time-bounded.
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required for the pre-migration integrity check." >&2
  exit 2
fi
PETCLAW_PSQL_COMMAND="$(type -P psql 2>/dev/null || true)"
PETCLAW_PSQL_BIN="$(realpath -e "${PETCLAW_PSQL_COMMAND}" 2>/dev/null || true)"
if [[ "${PETCLAW_PSQL_COMMAND}" != "/usr/bin/psql" \
  || ! -L "${PETCLAW_PSQL_COMMAND}" \
  || "$(stat -c '%U:%G' "${PETCLAW_PSQL_COMMAND}" 2>/dev/null || true)" != "root:root" \
  || "$(stat -c '%U:%G:%a' /usr/bin 2>/dev/null || true)" != "root:root:755" \
  || -z "${PETCLAW_PSQL_BIN}" || ! -x "${PETCLAW_PSQL_BIN}" \
  || "$(stat -c '%U:%G' "${PETCLAW_PSQL_BIN}" 2>/dev/null || true)" != "root:root" ]]; then
  echo "ERROR: the root-owned /usr/bin/psql wrapper and canonical executable are required." >&2
  exit 2
fi
PETCLAW_PSQL_MODE="$(stat -c '%a' "${PETCLAW_PSQL_BIN}")"
if (( (8#${PETCLAW_PSQL_MODE} & 8#022) != 0 )); then
  echo "ERROR: psql executable is writable by group or other." >&2
  exit 2
fi
if ! PETCLAW_PSQL_RECORDS="$("${PETCLAW_NODE_BIN}" \
  "${PETCLAW_RELEASE_SOURCE}/deploy/parse-database-url.mjs")" \
  || [[ -z "${PETCLAW_PSQL_RECORDS}" ]]; then
  echo "ERROR: DATABASE_URL is not a supported PostgreSQL URL." >&2
  exit 2
fi
PETCLAW_PSQL_FIELD_COUNT=0
PETCLAW_PSQL_HOST=""
PETCLAW_PSQL_PORT=""
PETCLAW_PSQL_USER=""
PETCLAW_PSQL_PASSWORD=""
PETCLAW_PSQL_DATABASE=""
PETCLAW_PSQL_SSLMODE=""
while IFS=$'\t' read -r PETCLAW_PSQL_FIELD PETCLAW_PSQL_VALUE_B64; do
  case "${PETCLAW_PSQL_FIELD}" in
    HOST|PORT|USER|PASSWORD|DATABASE|SSLMODE) ;;
    *)
      echo "ERROR: PostgreSQL URL parser returned an invalid field." >&2
      exit 2
      ;;
  esac
  if [[ ! "${PETCLAW_PSQL_VALUE_B64}" =~ ^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$ ]]; then
    echo "ERROR: PostgreSQL URL parser returned invalid encoded data." >&2
    exit 2
  fi
  PETCLAW_PSQL_VALUE="$(printf '%s' "${PETCLAW_PSQL_VALUE_B64}" \
    | base64 --decode; printf '\001')"
  PETCLAW_PSQL_VALUE="${PETCLAW_PSQL_VALUE%$'\001'}"
  printf -v "PETCLAW_PSQL_${PETCLAW_PSQL_FIELD}" '%s' "${PETCLAW_PSQL_VALUE}"
  PETCLAW_PSQL_FIELD_COUNT="$((PETCLAW_PSQL_FIELD_COUNT + 1))"
done <<< "${PETCLAW_PSQL_RECORDS}"
if [[ "${PETCLAW_PSQL_FIELD_COUNT}" != 6 \
  || -z "${PETCLAW_PSQL_HOST}" || -z "${PETCLAW_PSQL_USER}" \
  || -z "${PETCLAW_PSQL_DATABASE}" || -z "${PETCLAW_PSQL_SSLMODE}" \
  || ! "${PETCLAW_PSQL_PORT}" =~ ^[1-9][0-9]*$ \
  || "${PETCLAW_PSQL_PORT}" -lt 1 || "${PETCLAW_PSQL_PORT}" -gt 65535 ]]; then
  echo "ERROR: PostgreSQL URL parser returned incomplete connection fields." >&2
  exit 2
fi
unset PETCLAW_PSQL_RECORDS PETCLAW_PSQL_FIELD PETCLAW_PSQL_VALUE PETCLAW_PSQL_VALUE_B64
petclaw_psql_readonly() (
  # Passing NAME=value through an external environment scrubber exposes each
  # value briefly in that utility's argv. Clear inherited exports with bash
  # builtins, then export only the
  # minimum PostgreSQL environment in-process so the DSN is never an argument.
  local PETCLAW_ENV_NAME
  while IFS= read -r PETCLAW_ENV_NAME; do
    # The variable contains the export name to clear.
    # shellcheck disable=SC2163
    export -n "${PETCLAW_ENV_NAME}" 2>/dev/null || true
  done < <(compgen -e)
  export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  export PGHOST="${PETCLAW_PSQL_HOST}"
  export PGPORT="${PETCLAW_PSQL_PORT}"
  export PGUSER="${PETCLAW_PSQL_USER}"
  export PGPASSWORD="${PETCLAW_PSQL_PASSWORD}"
  export PGDATABASE="${PETCLAW_PSQL_DATABASE}"
  export PGSSLMODE="${PETCLAW_PSQL_SSLMODE}"
  export PGAPPNAME=petclaw-release-preflight
  export PGCONNECT_TIMEOUT=10
  export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=5000'
  # Ubuntu's pg_wrapper dispatches from the /usr/bin/psql basename. Executing
  # its realpath directly makes it treat the first option as a program name.
  exec "${PETCLAW_PSQL_COMMAND}" "$@"
)
PETCLAW_SUBSCRIPTION_TABLE_STATE="$(petclaw_psql_readonly \
  -X -qAt -v ON_ERROR_STOP=1 -c \
  "SELECT CASE
     WHEN to_regclass('public.user_subscriptions') IS NULL THEN 'fresh'
     WHEN to_regclass('public.users') IS NULL THEN 'invalid'
     ELSE 'ready'
   END")"
case "${PETCLAW_SUBSCRIPTION_TABLE_STATE}" in
  fresh)
    # A genuinely empty bootstrap will create both tables in earlier migrations.
    ;;
  ready)
    PETCLAW_SUBSCRIPTION_ORPHANS="$(petclaw_psql_readonly \
      -X -qAt -v ON_ERROR_STOP=1 -c \
      'SELECT count(*)
         FROM "user_subscriptions" AS subscription
         LEFT JOIN "users" AS owner ON owner."id" = subscription."user_id"
        WHERE owner."id" IS NULL')"
    if [[ ! "${PETCLAW_SUBSCRIPTION_ORPHANS}" =~ ^[0-9]+$ \
      || "${PETCLAW_SUBSCRIPTION_ORPHANS}" != "0" ]]; then
      echo "ERROR: user_subscriptions contains orphaned owner rows; migration refused." >&2
      exit 2
    fi
    ;;
  *)
    echo "ERROR: subscription ownership tables are in an invalid pre-migration state." >&2
    exit 2
    ;;
esac
unset PETCLAW_PSQL_HOST PETCLAW_PSQL_PORT PETCLAW_PSQL_USER \
  PETCLAW_PSQL_PASSWORD PETCLAW_PSQL_DATABASE PETCLAW_PSQL_SSLMODE \
  PETCLAW_PSQL_FIELD_COUNT
npx prisma migrate deploy
PETCLAW_POSTMIGRATION_MIN_FREE_BYTES=$((3 * 1024 * 1024 * 1024))
PETCLAW_AVAILABLE_BYTES="$(df --output=avail -B1 /opt/petclaw | tail -n 1 | tr -d '[:space:]')"
if [[ ! "${PETCLAW_AVAILABLE_BYTES}" =~ ^[0-9]+$ ]] \
  || (( PETCLAW_AVAILABLE_BYTES < PETCLAW_POSTMIGRATION_MIN_FREE_BYTES )); then
  echo "ERROR: migrations left less than 3 GiB free; refusing candidate start and traffic switch." >&2
  exit 2
fi
if [[ "${PETCLAW_LIVE_LLM_SMOKE:-0}" == "1" ]]; then
  npm run test:llm-router-live
fi

# Create the single deliberately writable runtime cache only after migrations.
PETCLAW_RUNTIME_CACHE="${PETCLAW_WEB}/.next/standalone/.next/cache"
if [[ -e "${PETCLAW_RUNTIME_CACHE}" || -L "${PETCLAW_RUNTIME_CACHE}" ]]; then
  if [[ ! -d "${PETCLAW_RUNTIME_CACHE}" || -L "${PETCLAW_RUNTIME_CACHE}" ]]; then
    echo "ERROR: standalone runtime cache path is not a real directory." >&2
    exit 2
  fi
  sudo find "${PETCLAW_RUNTIME_CACHE}" -depth -delete
fi
sudo install -d -o ubuntu -g ubuntu -m 700 "${PETCLAW_RUNTIME_CACHE}"
if find "${PETCLAW_RELEASE_DIR}" ! -user root \
    ! -path "${PETCLAW_RUNTIME_CACHE}" ! -path "${PETCLAW_RUNTIME_CACHE}/*" \
    -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_DIR}" ! -group ubuntu \
    ! -path "${PETCLAW_RUNTIME_CACHE}" ! -path "${PETCLAW_RUNTIME_CACHE}/*" \
    -print -quit | grep -q . \
  || find "${PETCLAW_RELEASE_DIR}" \( -type f -o -type d \) \
    ! -path "${PETCLAW_RUNTIME_CACHE}" ! -path "${PETCLAW_RUNTIME_CACHE}/*" \
    -perm /022 -print -quit | grep -q .; then
  echo "ERROR: immutable runtime release could not be sealed root-owned and non-writable." >&2
  exit 2
fi

if pm2 describe "${PETCLAW_CANDIDATE_APP}" >/dev/null 2>&1; then
  pm2 delete "${PETCLAW_CANDIDATE_APP}"
fi
if ss -H -ltn "sport = :${PETCLAW_CANDIDATE_PORT}" | grep -q .; then
  if [[ "${PETCLAW_CANDIDATE_PORT_EXPLICIT}" == "1" ]]; then
    echo "ERROR: explicitly requested candidate port became occupied before start." >&2
    exit 2
  fi
  PETCLAW_CANDIDATE_PORT=""
  for PETCLAW_PORT_CANDIDATE in 3001 3002 3003; do
    if ! ss -H -ltn "sport = :${PETCLAW_PORT_CANDIDATE}" | grep -q .; then
      PETCLAW_CANDIDATE_PORT="${PETCLAW_PORT_CANDIDATE}"
      break
    fi
  done
  if [[ ! "${PETCLAW_CANDIDATE_PORT}" =~ ^300[123]$ ]]; then
    echo "ERROR: no candidate port remained available immediately before start." >&2
    exit 2
  fi
fi
PETCLAW_CANDIDATE_STARTED=1
HOSTNAME=127.0.0.1 PORT="${PETCLAW_CANDIDATE_PORT}" NODE_ENV=production \
  pm2 start .next/standalone/server.js \
  --name "${PETCLAW_CANDIDATE_APP}" --cwd "${PETCLAW_WEB}"

PETCLAW_LOCAL_OK=0
for _ in {1..20}; do
  if curl -fsS --max-time 10 "http://127.0.0.1:${PETCLAW_CANDIDATE_PORT}/api/health" >/dev/null; then
    PETCLAW_LOCAL_OK=1
    break
  fi
  sleep 2
done
if [[ "${PETCLAW_LOCAL_OK}" -ne 1 ]]; then
  pm2 delete "${PETCLAW_CANDIDATE_APP}" || true
  echo "ERROR: candidate did not become healthy." >&2
  exit 1
fi
petclaw_harden_pm2_logs
PETCLAW_CANDIDATE_PID="$(pm2 jlist | node -e '
  let raw = "";
  process.stdin.on("data", chunk => raw += chunk);
  process.stdin.on("end", () => {
    const expectedName = process.argv[1];
    const expectedCwd = process.argv[2];
    const matches = JSON.parse(raw || "[]").filter((proc) =>
      String(proc.name || "") === expectedName
      && String(proc.pm2_env?.pm_cwd || "") === expectedCwd
      && proc.pm2_env?.status === "online"
      && Number.isSafeInteger(proc.pid)
      && proc.pid > 0
    );
    if (matches.length === 1) process.stdout.write(String(matches[0].pid));
  });
' "${PETCLAW_CANDIDATE_APP}" "${PETCLAW_WEB}")"
PETCLAW_CANDIDATE_SOCKET="$(ss -H -ltnp "sport = :${PETCLAW_CANDIDATE_PORT}")"
PETCLAW_CANDIDATE_NODE="$(readlink -e "/proc/${PETCLAW_CANDIDATE_PID}/exe" 2>/dev/null || true)"
if [[ ! "${PETCLAW_CANDIDATE_PID}" =~ ^[0-9]+$ ]] \
  || [[ "${PETCLAW_CANDIDATE_NODE}" != "${PETCLAW_NODE_BIN}" ]] \
  || ! grep -Eq "pid=${PETCLAW_CANDIDATE_PID}(,|\\))" <<< "${PETCLAW_CANDIDATE_SOCKET}" \
  || ! grep -Eq "(^|[[:space:]])127\\.0\\.0\\.1:${PETCLAW_CANDIDATE_PORT}([[:space:]]|$)" \
    <<< "${PETCLAW_CANDIDATE_SOCKET}" \
  || grep -Eq "(^|[[:space:]])(0\\.0\\.0\\.0|\\*|\\[::\\]):${PETCLAW_CANDIDATE_PORT}([[:space:]]|$)" \
    <<< "${PETCLAW_CANDIDATE_SOCKET}"; then
  echo "ERROR: candidate is not the exact pinned-Node PM2 process bound only to IPv4 loopback." >&2
  exit 1
fi

# Persist the validated candidate before touching nginx or the current-release
# pointer. If the host reboots during the switch window, PM2 restores both the
# current process and this loopback-only candidate while the boot guard reverts
# any uncommitted route on disk.
pm2 save
chmod 600 "${PETCLAW_PM2_HOME}/dump.pm2"

if [[ -L "${PETCLAW_CURRENT_LINK}" ]]; then
  PETCLAW_PREVIOUS_TARGET="$(readlink -e "${PETCLAW_CURRENT_LINK}" 2>/dev/null || true)"
fi
PETCLAW_NGINX_RENDERED="${PETCLAW_NGINX_SITE}.next-${PETCLAW_RELEASE_ID}"
if sudo test -e "${PETCLAW_NGINX_RENDERED}" || sudo test -L "${PETCLAW_NGINX_RENDERED}"; then
  echo "ERROR: root-owned nginx candidate path already exists." >&2
  exit 2
fi
sudo install -o root -g root -m 600 /dev/null "${PETCLAW_NGINX_RENDERED}"
PETCLAW_NGINX_RENDERED_CREATED=1
sed \
  -e "s/__APP_PORT__/${PETCLAW_CANDIDATE_PORT}/g" \
  -e "s/__RELEASE_ID__/${PETCLAW_RELEASE_ID}/g" \
  -e "s|__CURRENT_ROOT__|${PETCLAW_CURRENT_LINK}|g" \
  "${PETCLAW_RELEASE_SOURCE}/deploy/nginx-petclaw.conf.template" \
  | sudo tee "${PETCLAW_NGINX_RENDERED}" >/dev/null
sudo sync -f "${PETCLAW_NGINX_RENDERED}"
PETCLAW_NGINX_EXPECTED_SHA="$(sed \
  -e "s/__APP_PORT__/${PETCLAW_CANDIDATE_PORT}/g" \
  -e "s/__RELEASE_ID__/${PETCLAW_RELEASE_ID}/g" \
  -e "s|__CURRENT_ROOT__|${PETCLAW_CURRENT_LINK}|g" \
  "${PETCLAW_RELEASE_SOURCE}/deploy/nginx-petclaw.conf.template" \
  | sha256sum | awk '{print $1}')"
PETCLAW_NGINX_RENDERED_SHA="$(sudo sha256sum "${PETCLAW_NGINX_RENDERED}" | awk '{print $1}')"
if [[ "${PETCLAW_NGINX_RENDERED_SHA}" != "${PETCLAW_NGINX_EXPECTED_SHA}" \
  || "$(sudo stat -c '%U:%G:%a' "${PETCLAW_NGINX_RENDERED}")" != "root:root:600" ]] \
  || sudo grep -Eq '__[A-Z0-9_]+__' "${PETCLAW_NGINX_RENDERED}"; then
  echo "ERROR: root-owned nginx candidate failed canonical hash, ownership, or placeholder validation." >&2
  exit 2
fi
sudo cp "${PETCLAW_NGINX_SITE}" "${PETCLAW_NGINX_BACKUP}"
sudo sync -f "${PETCLAW_NGINX_BACKUP}"
PETCLAW_NGINX_BACKUP_READY=1

sudo install -o root -g root -m 755 \
  "${PETCLAW_RELEASE_SOURCE}/deploy/release-boot-guard.sh" \
  /usr/local/sbin/petclaw-release-boot-guard.sh
sudo install -o root -g root -m 644 \
  "${PETCLAW_RELEASE_SOURCE}/deploy/petclaw-release-boot-guard.service" \
  /etc/systemd/system/petclaw-release-boot-guard.service
sudo systemctl daemon-reload
sudo systemctl reenable petclaw-release-boot-guard.service >/dev/null
PETCLAW_WATCHDOG_PREVIOUS="${PETCLAW_PREVIOUS_TARGET:-__NONE__}"
PETCLAW_WATCHDOG_SAFE_ID="$(printf '%s' "${PETCLAW_RELEASE_ID}" | tr '._' '--')"
PETCLAW_ROLLBACK_WATCHDOG_UNIT="petclaw-release-rollback-${PETCLAW_WATCHDOG_SAFE_ID}-$$"
PETCLAW_ROLLBACK_WATCHDOG_BIN="/usr/local/libexec/petclaw/release-rollback-${PETCLAW_WATCHDOG_SAFE_ID}-$$.sh"
sudo install -d -o root -g root -m 755 /usr/local/libexec/petclaw
sudo install -o root -g root -m 755 \
  "${PETCLAW_RELEASE_SOURCE}/deploy/release-rollback-watchdog.sh" \
  "${PETCLAW_ROLLBACK_WATCHDOG_BIN}"
sudo /usr/local/sbin/petclaw-release-boot-guard.sh --arm \
  "${PETCLAW_RELEASE_DIR}" "${PETCLAW_WATCHDOG_PREVIOUS}" \
  "${PETCLAW_NGINX_BACKUP}" "${PETCLAW_CANDIDATE_APP}"
PETCLAW_BOOT_GUARD_ARMED=1

PETCLAW_ROLLBACK_WATCHDOG_ARMED=1
sudo systemd-run --quiet --collect \
  --unit="${PETCLAW_ROLLBACK_WATCHDOG_UNIT}" --on-active=10m \
  /bin/bash "${PETCLAW_ROLLBACK_WATCHDOG_BIN}" \
  "${PETCLAW_RELEASE_DIR}" "${PETCLAW_WATCHDOG_PREVIOUS}" \
  "${PETCLAW_NGINX_SITE}" "${PETCLAW_NGINX_BACKUP}" \
  "${PETCLAW_CANDIDATE_APP}" "${PETCLAW_PM2_BIN}"

# From the first nginx mutation onward, every error must restore the saved
# route before either durable recovery guard can be disarmed.
PETCLAW_SWITCH_STARTED=1
sudo install -o root -g root -m 644 "${PETCLAW_NGINX_RENDERED}" "${PETCLAW_NGINX_SITE}"
sudo rm -f -- "${PETCLAW_NGINX_RENDERED}"
PETCLAW_NGINX_RENDERED_CREATED=0
PETCLAW_NGINX_RENDERED=""
PETCLAW_LINK_TMP="${PETCLAW_CURRENT_LINK}.next-${PETCLAW_RELEASE_ID}"
sudo ln -s "${PETCLAW_RELEASE_DIR}" "${PETCLAW_LINK_TMP}"
PETCLAW_LINK_TMP_CREATED=1
sudo mv -Tf "${PETCLAW_LINK_TMP}" "${PETCLAW_CURRENT_LINK}"
PETCLAW_LINK_TMP_CREATED=0

if ! sudo nginx -t; then
  exit 1
fi
sudo systemctl reload nginx
PETCLAW_EXTENSION_SHA256="$(sha256sum "${PETCLAW_RELEASE_DIR}/web/public/petclaw-extension.zip" | awk '{print $1}')"
export PETCLAW_EXTENSION_SHA256
if ! PETCLAW_SMOKE_BASE="https://app.myaipet.ai" \
  PETCLAW_SMOKE_HOST="127.0.0.1" PETCLAW_SMOKE_PORT="443" \
  PETCLAW_EXPECTED_RELEASE_ID="${PETCLAW_RELEASE_ID}" \
  PETCLAW_RELEASE_ROOT="${PETCLAW_RELEASE_DIR}" \
  /bin/bash "${PETCLAW_RELEASE_SOURCE}/deploy/release-smoke.sh"; then
  exit 1
fi

pm2 save
chmod 600 "${PETCLAW_PM2_HOME}/dump.pm2"
petclaw_harden_pm2_logs
sudo install -o root -g root -m 644 \
  "${PETCLAW_RELEASE_SOURCE}/deploy/petclaw-logrotate.conf" \
  /etc/logrotate.d/petclaw
sudo logrotate --debug /etc/logrotate.d/petclaw >/dev/null

# Keep the newly active process and exactly the immediately previous release
# process for rollback. Remove older release candidates so ports cannot be
# exhausted after several successful deploys.
# JavaScript template literals are passed verbatim.
# shellcheck disable=SC2016
PETCLAW_STALE_PROCESSES="$(pm2 jlist | node -e '
  let raw="";
  process.stdin.on("data", chunk => raw += chunk);
  process.stdin.on("end", () => {
    const current = process.argv[1];
    const previous = process.argv[2];
    const releaseRoot = "/opt/petclaw/releases/";
    for (const proc of JSON.parse(raw || "[]")) {
      const name = String(proc.name || "");
      const cwd = String(proc.pm2_env?.pm_cwd || "");
      const base = cwd.replace(/\/web$/, "");
      const releaseName = base.startsWith(releaseRoot) ? base.slice(releaseRoot.length) : "";
      const exactReleaseProcess = /^[A-Za-z0-9._-]{6,80}$/.test(releaseName)
        && name === `petclaw-web-${releaseName}`;
      const exactLegacyProcess = name === "petclaw-web"
        && cwd === "/opt/petclaw/aipet-project/web";
      if ((!exactReleaseProcess && !exactLegacyProcess) || name === current) continue;
      if (previous && (cwd === `${previous}/web` || cwd === previous)) continue;
      if (!previous && exactLegacyProcess) continue;
      process.stdout.write(`${name}\n`);
    }
  });
' "${PETCLAW_CANDIDATE_APP}" "${PETCLAW_PREVIOUS_TARGET}")"
while IFS= read -r PETCLAW_STALE_PROCESS; do
  [[ -n "${PETCLAW_STALE_PROCESS}" ]] && pm2 delete "${PETCLAW_STALE_PROCESS}" || true
done <<< "${PETCLAW_STALE_PROCESSES}"
pm2 save
sudo install -o root -g root -m 444 /dev/null "${PETCLAW_RELEASE_DIR}/RELEASE_COMMITTED"
sudo sync -f "${PETCLAW_RELEASE_DIR}/RELEASE_COMMITTED"
PETCLAW_RELEASE_COMMITTED=1
PETCLAW_SWITCH_STARTED=0
petclaw_disarm_boot_guard
petclaw_disarm_rollback_watchdog
if [[ -n "${PETCLAW_ROLLBACK_WATCHDOG_BIN}" \
  && "${PETCLAW_ROLLBACK_WATCHDOG_BIN}" == /usr/local/libexec/petclaw/release-rollback-*.sh ]]; then
  sudo rm -f -- "${PETCLAW_ROLLBACK_WATCHDOG_BIN}"
  PETCLAW_ROLLBACK_WATCHDOG_BIN=""
fi

# Keep only the active immutable release and its immediate rollback target.
# Directory names and parentage are validated before any recursive deletion.
while IFS= read -r -d '' PETCLAW_OLD_RELEASE_DIR; do
  PETCLAW_OLD_RELEASE_NAME="$(basename "${PETCLAW_OLD_RELEASE_DIR}")"
  if [[ ! "${PETCLAW_OLD_RELEASE_NAME}" =~ ^[A-Za-z0-9._-]{6,80}$ \
    || -L "${PETCLAW_OLD_RELEASE_DIR}" ]]; then
    continue
  fi
  if [[ "${PETCLAW_OLD_RELEASE_DIR}" == "${PETCLAW_RELEASE_DIR}" \
    || ( -n "${PETCLAW_PREVIOUS_TARGET}" \
      && "${PETCLAW_OLD_RELEASE_DIR}" == "${PETCLAW_PREVIOUS_TARGET}" ) ]]; then
    continue
  fi
  sudo find "${PETCLAW_OLD_RELEASE_DIR}" -depth -delete
done < <(find "${PETCLAW_RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -print0)

echo "Release active: ${PETCLAW_RELEASE_ID} (${PETCLAW_RELEASE_COMMIT}) on port ${PETCLAW_CANDIDATE_PORT}. Previous PM2 process retained for rollback."

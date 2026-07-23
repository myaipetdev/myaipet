#!/usr/bin/env bash
# Merge-install the PetClaw app cron without overwriting server-managed jobs.
set -euo pipefail
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
unset BASH_ENV CDPATH ENV GLOBIGNORE

APP_BEGIN="# >>> PETCLAW APP CRON >>>"
APP_END="# <<< PETCLAW APP CRON <<<"
OPS_REQUIRED_BASENAMES="
db-backup.sh
archive-logs.sh
llm-cost-watch.sh
health-monitor.sh
hourly-digest.sh
ratelimit-guard.sh
"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
EXAMPLE="${SCRIPT_DIR}/crontab.example"
TEST_MODE="${PETCLAW_CRONTAB_TEST_MODE:-0}"

if [[ "${TEST_MODE}" == "1" ]]; then
  CRONTAB_CMD="${PETCLAW_CRONTAB_CMD:-}"
  if [[ -z "${CRONTAB_CMD}" || "${CRONTAB_CMD}" == *[[:space:]]* \
    || ! -f "${CRONTAB_CMD}" || ! -x "${CRONTAB_CMD}" || -L "${CRONTAB_CMD}" ]]; then
    echo "ERROR: test mode requires one regular executable PETCLAW_CRONTAB_CMD path." >&2
    exit 2
  fi
elif [[ "${TEST_MODE}" == "0" ]]; then
  unset PETCLAW_CRONTAB_CMD
  CRONTAB_CMD="/usr/bin/crontab"
  if [[ "$(id -un)" != "ubuntu" || "$(id -u)" == "0" ]]; then
    echo "ERROR: install-crontab.sh must run as the ubuntu account, not root." >&2
    exit 2
  fi
  if [[ ! -f "${CRONTAB_CMD}" || ! -x "${CRONTAB_CMD}" \
    || -L "${CRONTAB_CMD}" \
    || "$(stat -c '%U' "${CRONTAB_CMD}")" != "root" ]]; then
    echo "ERROR: /usr/bin/crontab must be a root-owned real executable." >&2
    exit 2
  fi
  CRONTAB_MODE="$(stat -c '%a' "${CRONTAB_CMD}")"
  if (( (8#${CRONTAB_MODE} & 8#022) != 0 )); then
    echo "ERROR: /usr/bin/crontab is writable by group or other." >&2
    exit 2
  fi
  CRON_STATE_DIR="/home/ubuntu/.local/state/petclaw-cron"
  install -d -m 700 "${CRON_STATE_DIR}"
  if [[ -L "${CRON_STATE_DIR}" \
    || "$(realpath -e "${CRON_STATE_DIR}")" != "${CRON_STATE_DIR}" \
    || "$(stat -c '%U:%G:%a' "${CRON_STATE_DIR}")" != "ubuntu:ubuntu:700" ]]; then
    echo "ERROR: PetClaw cron state directory is unsafe." >&2
    exit 2
  fi
  exec 9>"${CRON_STATE_DIR}/install.lock"
  /usr/bin/flock -n 9 || {
    echo "ERROR: another PetClaw crontab installation is in progress." >&2
    exit 1
  }
else
  echo "ERROR: PETCLAW_CRONTAB_TEST_MODE must be 0 or 1." >&2
  exit 2
fi

ALLOW_NO_OPS=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --allow-no-ops) ALLOW_NO_OPS=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "Usage: install-crontab.sh [--allow-no-ops] [--dry-run]" >&2; exit 2 ;;
  esac
done

[[ -r "$EXAMPLE" && ! -L "$EXAMPLE" ]] || {
  echo "ERROR: ${EXAMPLE} is missing, unreadable, or a symlink." >&2
  exit 1
}

EXAMPLE_BEGIN_COUNT="$(grep -Fxc -- "$APP_BEGIN" "$EXAMPLE" || true)"
EXAMPLE_END_COUNT="$(grep -Fxc -- "$APP_END" "$EXAMPLE" || true)"
if [[ "$EXAMPLE_BEGIN_COUNT" != "1" || "$EXAMPLE_END_COUNT" != "1" ]]; then
  echo "ERROR: crontab.example must contain exactly one APP CRON marker pair." >&2
  exit 1
fi
NEW_APP_BLOCK="$(awk -v b="$APP_BEGIN" -v e="$APP_END" \
  '$0==b{f=1} f{print} $0==e{exit}' "$EXAMPLE")"
if [[ -z "$NEW_APP_BLOCK" ]] || ! grep -Fxq -- "$APP_END" <<<"$NEW_APP_BLOCK"; then
  echo "ERROR: APP CRON markers are out of order or unterminated in crontab.example." >&2
  exit 1
fi

petclaw_read_crontab() {
  local PETCLAW_READ_STDERR
  local PETCLAW_READ_STATUS
  PETCLAW_READ_STDERR="$(mktemp)"
  if CURRENT_READ="$("$CRONTAB_CMD" -l 2>"${PETCLAW_READ_STDERR}")"; then
    PETCLAW_READ_STATUS=0
  else
    PETCLAW_READ_STATUS=$?
  fi
  if [[ "${PETCLAW_READ_STATUS}" -ne 0 ]]; then
    if [[ "${ALLOW_NO_OPS}" -eq 1 ]] \
      && LC_ALL=C grep -Eq '^no crontab for ' "${PETCLAW_READ_STDERR}"; then
      CURRENT_READ=""
    else
      echo "ERROR: unable to read the current ubuntu crontab." >&2
      sed -n '1,3p' "${PETCLAW_READ_STDERR}" >&2
      find "${PETCLAW_READ_STDERR}" -delete
      return 1
    fi
  fi
  find "${PETCLAW_READ_STDERR}" -delete
}

petclaw_read_crontab
CURRENT="${CURRENT_READ}"

CURRENT_BEGIN_COUNT="$(printf '%s\n' "$CURRENT" | grep -Fxc -- "$APP_BEGIN" || true)"
CURRENT_END_COUNT="$(printf '%s\n' "$CURRENT" | grep -Fxc -- "$APP_END" || true)"
if [[ "$CURRENT_BEGIN_COUNT" == "0" && "$CURRENT_END_COUNT" == "0" ]]; then
  :
elif [[ "$CURRENT_BEGIN_COUNT" == "1" && "$CURRENT_END_COUNT" == "1" ]]; then
  CURRENT_BEGIN_LINE="$(printf '%s\n' "$CURRENT" | grep -Fn -- "$APP_BEGIN" | cut -d: -f1)"
  CURRENT_END_LINE="$(printf '%s\n' "$CURRENT" | grep -Fn -- "$APP_END" | cut -d: -f1)"
  if (( CURRENT_BEGIN_LINE >= CURRENT_END_LINE )); then
    echo "ERROR: current APP CRON markers are out of order." >&2
    exit 1
  fi
else
  echo "ERROR: current crontab has duplicate or unterminated APP CRON markers." >&2
  exit 1
fi

# Canonical server-ops entries are schedules, never environment assignments.
# Restrict discovery to numeric five-field cron jobs before matching basenames.
CURRENT_JOBS="$(printf '%s\n' "$CURRENT" \
  | grep -E '^[[:space:]]*([0-9*/,-]+[[:space:]]+){5}[^[:space:]]' || true)"
ORIGINAL_OPS=""
OPS_FOUND=0
while IFS= read -r basename; do
  [[ -z "$basename" ]] && continue
  BASENAME_REGEX="${basename//./\\.}"
  OPS_LINES="$(printf '%s\n' "$CURRENT_JOBS" \
    | grep -E "(^|[[:space:]/])${BASENAME_REGEX}([[:space:]]|$)" || true)"
  OPS_COUNT="$(printf '%s\n' "$OPS_LINES" | grep -c . || true)"
  if [[ "$OPS_COUNT" == "1" ]]; then
    OPS_FOUND="$((OPS_FOUND + 1))"
    ORIGINAL_OPS="${ORIGINAL_OPS}${OPS_LINES}"$'\n'
  elif [[ "$OPS_COUNT" != "0" ]]; then
    echo "ERROR: current crontab must contain at most one active ${basename} job." >&2
    exit 1
  fi
done <<<"$OPS_REQUIRED_BASENAMES"

if [[ "$OPS_FOUND" != "0" && "$OPS_FOUND" != "6" ]]; then
  echo "ERROR: current crontab has only ${OPS_FOUND}/6 canonical server ops jobs." >&2
  exit 1
fi
if [[ "$OPS_FOUND" == "0" && "$ALLOW_NO_OPS" -ne 1 ]]; then
  echo "ERROR: the live crontab contains none of the six canonical server ops jobs." >&2
  echo "Restore the ops block first; --allow-no-ops is for a fresh host only." >&2
  exit 1
fi
if [[ "$OPS_FOUND" == "0" ]]; then
  echo "WARNING: proceeding without server ops jobs (--allow-no-ops)." >&2
fi

# Validated marker counts make this removal fail closed for malformed input.
PRESERVED="$(printf '%s\n' "$CURRENT" \
  | awk -v b="$APP_BEGIN" -v e="$APP_END" \
    '$0==b{f=1;next} $0==e{f=0;next} !f{print}')"

# Remove only prior app content. A custom ops health check that calls an API
# but does not change to PETCLAW_WEB survives this migration.
# shellcheck disable=SC2016
PRESERVED="$(awk '
  NR == FNR {
    if ($0 != "") exact[$0] = 1
    next
  }
  !($0 in exact) &&
    !(index($0, "cd \"$PETCLAW_WEB\"") &&
      index($0, "app.myaipet.ai/api/")) {
    print
  }
' "$EXAMPLE" <(printf '%s\n' "$PRESERVED"))"

NEW="$(printf '%s\n\n%s\n' "$PRESERVED" "$NEW_APP_BLOCK")"

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  if ! printf '%s\n' "$NEW" | grep -Fxq -- "$line"; then
    echo "ERROR: merge would lose a canonical server ops line." >&2
    exit 1
  fi
done <<<"$ORIGINAL_OPS"

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '%s\n' "$NEW"
  exit 0
fi

# Catch non-cooperating `crontab -e` edits between read and install.
petclaw_read_crontab
if [[ "$CURRENT_READ" != "$CURRENT" ]]; then
  echo "ERROR: current crontab changed during merge; refusing to overwrite it." >&2
  exit 1
fi

printf '%s\n' "$NEW" | "$CRONTAB_CMD" -

petclaw_read_crontab
if [[ "$CURRENT_READ" != "$NEW" ]]; then
  echo "ERROR: installed crontab does not match the verified merge result." >&2
  exit 1
fi

APP_JOBS="$(printf '%s\n' "$NEW_APP_BLOCK" | grep -cE '^[0-9*]' || true)"
ALL_JOBS="$(printf '%s\n' "$NEW" | grep -cE '^[0-9*@]' || true)"
echo "Installed: ${APP_JOBS} app jobs + ${OPS_FOUND} canonical ops jobs; ${ALL_JOBS} total."

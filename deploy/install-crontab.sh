#!/usr/bin/env bash
# install-crontab.sh — merge-install the PetClaw app cron WITHOUT touching the
# server-managed ops jobs (DB backup, ratelimit-guard, monitoring).
#
# 2026-07-23 incident: crontab.example was installed as a full crontab
# replacement, silently wiping the ops jobs. This installer is the only
# supported way to update the app cron:
#
#   1. Reads the live crontab and keeps every line OUTSIDE the
#      ">>> PETCLAW APP CRON >>>" ... "<<< PETCLAW APP CRON <<<" markers
#      verbatim, in order.
#   2. Replaces/appends only the marked APP CRON block from crontab.example.
#   3. Refuses to install if the live crontab has no recognizable ops job
#      (backup / ratelimit-guard / prune / monitor) unless --allow-no-ops is
#      passed (fresh host bootstrap only).
#   4. Verifies line-by-line that every preserved ops line survived, then
#      installs atomically via `crontab -`.
#
# Testable: set PETCLAW_CRONTAB_CMD to a shim (single command word) to avoid
# touching the real crontab.
set -euo pipefail

APP_BEGIN="# >>> PETCLAW APP CRON >>>"
APP_END="# <<< PETCLAW APP CRON <<<"
OPS_SIGNATURES='ratelimit-guard|backup|prune|monitor|pg_dump|archive-logs|cost-watch|digest'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
EXAMPLE="${SCRIPT_DIR}/crontab.example"
CRONTAB_CMD="${PETCLAW_CRONTAB_CMD:-crontab}"

ALLOW_NO_OPS=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --allow-no-ops) ALLOW_NO_OPS=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "Usage: install-crontab.sh [--allow-no-ops] [--dry-run]" >&2; exit 2 ;;
  esac
done

[[ -r "$EXAMPLE" ]] || { echo "ERROR: ${EXAMPLE} not found or unreadable." >&2; exit 1; }

# The app block is everything between the markers in crontab.example, inclusive.
NEW_APP_BLOCK="$(awk -v b="$APP_BEGIN" -v e="$APP_END" '$0==b{f=1} f{print} $0==e{exit}' "$EXAMPLE")"
if [[ -z "$NEW_APP_BLOCK" ]] || ! grep -Fxq -- "$APP_END" <<<"$NEW_APP_BLOCK"; then
  echo "ERROR: APP CRON markers missing or unterminated in crontab.example." >&2
  exit 1
fi

CURRENT="$("$CRONTAB_CMD" -l 2>/dev/null || true)"

# Everything outside the old app block survives verbatim, in original order.
PRESERVED="$(printf '%s\n' "$CURRENT" \
  | awk -v b="$APP_BEGIN" -v e="$APP_END" '$0==b{f=1;next} $0==e{f=0;next} !f{print}')"

# Legacy migration: crontabs installed by pasting an old, marker-less
# crontab.example carry the app jobs unmarked, so they'd survive as duplicates.
# Drop from the preserved set (a) any non-empty line that appears verbatim in
# the current crontab.example, and (b) any app-cron line — identified by the
# app.myaipet.ai/api/ endpoint it curls. Ops jobs are local scripts and never
# match either filter. Stale comment lines that were later edited in the
# example may linger once; they are inert and disappear on the next run.
PRESERVED="$(printf '%s\n' "$PRESERVED" \
  | grep -Fvx -f <(grep -v '^[[:space:]]*$' "$EXAMPLE") \
  | grep -Fv 'app.myaipet.ai/api/' || true)"

# Active (non-comment) ops lines that must survive the merge.
PRESERVED_OPS="$(printf '%s\n' "$PRESERVED" | grep -E "$OPS_SIGNATURES" | grep -Ev '^[[:space:]]*#' || true)"

if [[ -z "$PRESERVED_OPS" ]]; then
  if [[ "$ALLOW_NO_OPS" -ne 1 ]]; then
    echo "ERROR: the live crontab contains no server ops job (expected at least" >&2
    echo "one of: ratelimit-guard / backup / prune / monitor)." >&2
    echo "Refusing to install — the ops block may already have been wiped." >&2
    echo "Restore it first (see ~/TEAM-HANDOFF-20260722.md on the server), or" >&2
    echo "re-run with --allow-no-ops ONLY for a genuinely fresh host." >&2
    exit 1
  fi
  echo "WARNING: proceeding without any server ops jobs (--allow-no-ops)." >&2
fi

NEW="$(printf '%s\n\n%s\n' "$PRESERVED" "$NEW_APP_BLOCK")"

# Belt and suspenders: every active ops line must appear verbatim in the result.
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  if ! printf '%s\n' "$NEW" | grep -Fxq -- "$line"; then
    echo "ERROR: merge bug — an ops line would be lost; aborting install:" >&2
    echo "  $line" >&2
    exit 1
  fi
done <<<"$PRESERVED_OPS"

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '%s\n' "$NEW"
  exit 0
fi

printf '%s\n' "$NEW" | "$CRONTAB_CMD" -

APP_JOBS="$(printf '%s\n' "$NEW_APP_BLOCK" | grep -cE '^[0-9*]' || true)"
OPS_JOBS="$(printf '%s\n' "$PRESERVED" | grep -cE '^[0-9*@]' || true)"
echo "Installed: ${APP_JOBS} app jobs (replaced) + ${OPS_JOBS} preserved non-app jobs."

#!/usr/bin/env bash
set -euo pipefail
umask 077

TEST_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TEST_TMP="$(mktemp -d)"
STATE="${TEST_TMP}/crontab"
READ_COUNT="${TEST_TMP}/reads"
SHIM="${TEST_TMP}/crontab-shim"
INSTALLER="${TEST_ROOT}/deploy/install-crontab.sh"
EXAMPLE="${TEST_ROOT}/deploy/crontab.example"

cleanup() {
  if [[ -d "${TEST_TMP}" && ! -L "${TEST_TMP}" ]]; then
    find "${TEST_TMP}" -depth -delete
  fi
}
trap cleanup EXIT HUP INT TERM

cat >"${SHIM}" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  -l)
    if [[ "${PETCLAW_SHIM_FAIL_READ:-0}" == "1" ]]; then
      echo "permission denied" >&2
      exit 1
    fi
    reads=0
    [[ -f "${PETCLAW_READ_COUNT}" ]] && reads="$(cat "${PETCLAW_READ_COUNT}")"
    reads="$((reads + 1))"
    printf '%s\n' "${reads}" >"${PETCLAW_READ_COUNT}"
    if [[ "${PETCLAW_SHIM_MUTATE_SECOND_READ:-0}" == "1" && "${reads}" == "2" ]]; then
      printf '%s\n' "# concurrent edit"
    fi
    [[ -f "${PETCLAW_CRONTAB_STATE}" ]] && cat "${PETCLAW_CRONTAB_STATE}"
    ;;
  -)
    incoming="$(mktemp)"
    cat >"${incoming}"
    mv "${incoming}" "${PETCLAW_CRONTAB_STATE}"
    ;;
  *)
    echo "unsupported shim arguments" >&2
    exit 2
    ;;
esac
SHIM
chmod 700 "${SHIM}"

export PETCLAW_CRONTAB_TEST_MODE=1
export PETCLAW_CRONTAB_CMD="${SHIM}"
export PETCLAW_CRONTAB_STATE="${STATE}"
export PETCLAW_READ_COUNT="${READ_COUNT}"

write_legacy_app() {
  awk '
    $0 == "# >>> PETCLAW APP CRON >>>" { inside=1; next }
    $0 == "# <<< PETCLAW APP CRON <<<" { exit }
    inside { print }
  ' "${EXAMPLE}" >"${STATE}"
}

append_ops() {
  cat >>"${STATE}" <<'OPS'
0 19 * * * bash /home/ubuntu/db-backup.sh >> /home/ubuntu/ops-cron.log 2>&1
30 1 * * * bash /home/ubuntu/archive-logs.sh >> /home/ubuntu/ops-cron.log 2>&1
40 1 * * * bash /home/ubuntu/llm-cost-watch.sh >> /home/ubuntu/ops-cron.log 2>&1
*/5 * * * * /home/ubuntu/health-monitor.sh >/dev/null 2>&1
5 * * * * /home/ubuntu/hourly-digest.sh >/dev/null 2>&1
*/10 * * * * /home/ubuntu/ratelimit-guard.sh >/dev/null 2>&1
OPS
}

reset_reads() {
  printf '%s\n' 0 >"${READ_COUNT}"
}

write_legacy_app
append_ops
cat >>"${STATE}" <<'CUSTOM'
*/2 * * * * curl -fsS https://app.myaipet.ai/api/health # custom-api-health
CUSTOM
reset_reads
"${INSTALLER}" --dry-run >"${TEST_TMP}/dry-run"
[[ "$(grep -Ec '^[0-9*@]' "${TEST_TMP}/dry-run")" == "14" ]]
[[ "$(grep -Fxc '# >>> PETCLAW APP CRON >>>' "${TEST_TMP}/dry-run")" == "1" ]]
[[ "$(grep -Fxc '# <<< PETCLAW APP CRON <<<' "${TEST_TMP}/dry-run")" == "1" ]]
grep -Fq 'custom-api-health' "${TEST_TMP}/dry-run"
for script in db-backup.sh archive-logs.sh llm-cost-watch.sh \
  health-monitor.sh hourly-digest.sh ratelimit-guard.sh; do
  [[ "$(grep -c "${script}" "${TEST_TMP}/dry-run")" == "1" ]]
done

reset_reads
"${INSTALLER}" >"${TEST_TMP}/install-output"
cp "${STATE}" "${TEST_TMP}/first-install"
reset_reads
"${INSTALLER}" >"${TEST_TMP}/second-output"
cmp -s "${STATE}" "${TEST_TMP}/first-install"

write_legacy_app
reset_reads
if "${INSTALLER}" --dry-run >/dev/null 2>&1; then
  echo "FAIL: missing ops jobs were accepted" >&2
  exit 1
fi

write_legacy_app
printf '%s\n' 'MAILTO=backup-alerts@example.invalid' >>"${STATE}"
reset_reads
if "${INSTALLER}" --dry-run >/dev/null 2>&1; then
  echo "FAIL: an ops-looking environment line bypassed the guard" >&2
  exit 1
fi

write_legacy_app
printf '%s\n' \
  'DB_LABEL=db-backup.sh' \
  'ARCHIVE_LABEL=archive-logs.sh' \
  'COST_LABEL=llm-cost-watch.sh' \
  'HEALTH_LABEL=health-monitor.sh' \
  'DIGEST_LABEL=hourly-digest.sh' \
  'RATE_LABEL=ratelimit-guard.sh' >>"${STATE}"
reset_reads
if "${INSTALLER}" --dry-run >/dev/null 2>&1; then
  echo "FAIL: six ops-looking environment lines bypassed the guard" >&2
  exit 1
fi

write_legacy_app
printf '%s\n' \
  '0 19 * * * bash /home/ubuntu/db-backup.sh' \
  '30 1 * * * bash /home/ubuntu/archive-logs.sh' >>"${STATE}"
reset_reads
if "${INSTALLER}" --dry-run >/dev/null 2>&1; then
  echo "FAIL: a partial canonical ops set was accepted" >&2
  exit 1
fi

printf '%s\n' \
  '0 19 * * * bash /home/ubuntu/db-backup.sh' \
  '# >>> PETCLAW APP CRON >>>' \
  '30 1 * * * bash /home/ubuntu/archive-logs.sh' \
  '40 1 * * * bash /home/ubuntu/llm-cost-watch.sh' \
  '*/5 * * * * /home/ubuntu/health-monitor.sh' \
  '5 * * * * /home/ubuntu/hourly-digest.sh' \
  '*/10 * * * * /home/ubuntu/ratelimit-guard.sh' >"${STATE}"
reset_reads
if "${INSTALLER}" --dry-run >/dev/null 2>&1; then
  echo "FAIL: an unterminated APP CRON block was accepted" >&2
  exit 1
fi

write_legacy_app
append_ops
reset_reads
if PETCLAW_SHIM_FAIL_READ=1 "${INSTALLER}" --allow-no-ops --dry-run \
  >/dev/null 2>&1; then
  echo "FAIL: a crontab read error was treated as an empty fresh host" >&2
  exit 1
fi

write_legacy_app
append_ops
reset_reads
if PETCLAW_SHIM_MUTATE_SECOND_READ=1 "${INSTALLER}" >/dev/null 2>&1; then
  echo "FAIL: a concurrent crontab edit was overwritten" >&2
  exit 1
fi

if "${INSTALLER}" --unknown >/dev/null 2>&1; then
  echo "FAIL: an unknown installer option was accepted" >&2
  exit 1
fi

echo "PASS crontab merge installer adversarial harness"

#!/usr/bin/env bash
# Fail closed when a release tree contains dotenv files, private keys, or
# common live credential token formats. Only relative filenames are reported;
# matching values are never printed to logs.
set -euo pipefail
umask 077

PETCLAW_SCAN_ROOT="${1:-}"
if [[ -z "${PETCLAW_SCAN_ROOT}" || ! -d "${PETCLAW_SCAN_ROOT}" || -L "${PETCLAW_SCAN_ROOT}" ]]; then
  echo "ERROR: secret scan needs a real release directory." >&2
  exit 2
fi
PETCLAW_SCAN_ROOT="$(cd -- "${PETCLAW_SCAN_ROOT}" && pwd -P)"
PETCLAW_SCAN_FAILED=0
PETCLAW_SECRET_PATTERN='(xai-[A-Za-z0-9._-]{16,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|xox[baprs]-[0-9A-Za-z-]{20,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}|(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/[^\/:[:space:]]+:[^\/@[:space:]]{8,}@|"?(AWS_SECRET_ACCESS_KEY|JWT_SECRET|CRON_SECRET|SESSION_SECRET)"?[[:space:]]*[:=][[:space:]]*"[A-Za-z0-9+\/_=-]{24,}"|-----BEGIN ((RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY)-----)'

petclaw_stream_contains_secret() {
  LC_ALL=C grep -Ea "${PETCLAW_SECRET_PATTERN}" >/dev/null
}

while IFS= read -r -d '' PETCLAW_SECRET_FILE; do
  PETCLAW_SECRET_REL="${PETCLAW_SECRET_FILE#"${PETCLAW_SCAN_ROOT}"/}"
  PETCLAW_SECRET_BASE="$(basename "${PETCLAW_SECRET_FILE}")"
  case "${PETCLAW_SECRET_BASE}" in
    .env*)
      echo "ERROR: forbidden dotenv file in release: ${PETCLAW_SECRET_REL}" >&2
      PETCLAW_SCAN_FAILED=1
      continue
      ;;
    .npmrc|.pypirc)
      echo "ERROR: forbidden package-manager credential file in release: ${PETCLAW_SECRET_REL}" >&2
      PETCLAW_SCAN_FAILED=1
      continue
      ;;
  esac

  # grep -a scans raw binary bytes as text, so the verifier does not silently
  # lose coverage when the optional binutils `strings` utility is absent.
  if petclaw_stream_contains_secret < "${PETCLAW_SECRET_FILE}"; then
    echo "ERROR: credential signature found in release file: ${PETCLAW_SECRET_REL}" >&2
    PETCLAW_SCAN_FAILED=1
    continue
  fi

  # Public archives are decompressed and scanned as a combined byte stream so a
  # credential hidden by ZIP/gzip compression cannot bypass the raw-file scan.
  case "${PETCLAW_SECRET_BASE}" in
    *.zip|*.jar)
      if ! unzip -tq "${PETCLAW_SECRET_FILE}" >/dev/null 2>&1; then
        echo "ERROR: invalid ZIP/JAR in release: ${PETCLAW_SECRET_REL}" >&2
        PETCLAW_SCAN_FAILED=1
      elif unzip -p "${PETCLAW_SECRET_FILE}" 2>/dev/null \
        | petclaw_stream_contains_secret; then
        echo "ERROR: credential signature found inside release archive: ${PETCLAW_SECRET_REL}" >&2
        PETCLAW_SCAN_FAILED=1
      fi
      ;;
    *.tar|*.tar.gz|*.tgz)
      if ! tar -tf "${PETCLAW_SECRET_FILE}" >/dev/null 2>&1; then
        echo "ERROR: invalid tar archive in release: ${PETCLAW_SECRET_REL}" >&2
        PETCLAW_SCAN_FAILED=1
      elif tar -xOf "${PETCLAW_SECRET_FILE}" 2>/dev/null \
        | petclaw_stream_contains_secret; then
        echo "ERROR: credential signature found inside release archive: ${PETCLAW_SECRET_REL}" >&2
        PETCLAW_SCAN_FAILED=1
      fi
      ;;
  esac
done < <(find "${PETCLAW_SCAN_ROOT}" -type f -print0)

if [[ "${PETCLAW_SCAN_FAILED}" != "0" ]]; then
  exit 1
fi
echo "Release secret scan passed."

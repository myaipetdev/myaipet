#!/usr/bin/env bash
set -euo pipefail

PETCLAW_SMOKE_BASE="${PETCLAW_SMOKE_BASE:-https://app.myaipet.ai}"
PETCLAW_SMOKE_HOST="${PETCLAW_SMOKE_HOST:-}"
PETCLAW_SMOKE_PORT="${PETCLAW_SMOKE_PORT:-443}"
PETCLAW_EXPECTED_RELEASE_ID="${PETCLAW_EXPECTED_RELEASE_ID:-}"
PETCLAW_SMOKE_BODY="$(mktemp)"
PETCLAW_SMOKE_HEADERS="$(mktemp)"
trap 'rm -f "${PETCLAW_SMOKE_BODY}" "${PETCLAW_SMOKE_HEADERS}"' EXIT

petclaw_curl() {
  if [[ -n "${PETCLAW_SMOKE_HOST}" ]]; then
    curl --disable --silent --show-error --max-time 20 --noproxy '*' \
      --resolve "app.myaipet.ai:${PETCLAW_SMOKE_PORT}:${PETCLAW_SMOKE_HOST}" "$@"
  else
    curl --disable --silent --show-error --max-time 20 "$@"
  fi
}

expect_code() {
  local expected="$1"
  local method="$2"
  local url="$3"
  shift 3
  local code=""
  local curl_ok=1
  if ! code="$(petclaw_curl -o "${PETCLAW_SMOKE_BODY}" -w '%{http_code}' \
    -X "${method}" "${PETCLAW_SMOKE_BASE}${url}" "$@")"; then
    curl_ok=0
  fi
  if [[ "${curl_ok}" != "1" || "${code}" != "${expected}" ]]; then
    echo "ERROR: ${method} ${url} returned ${code:-000}; expected ${expected}." >&2
    return 1
  fi
}

expect_env_exact() {
  local name="$1"
  local expected="$2"
  local actual
  actual="$(printenv "${name}" 2>/dev/null || true)"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "ERROR: ${name} must equal the exact launch value ${expected}." >&2
    return 1
  fi
}

petclaw_exact_release_header() {
  local headers_file="$1"
  awk -v expected="${PETCLAW_EXPECTED_RELEASE_ID}" '
    BEGIN { total = 0; exact = 0 }
    {
      line = $0
      sub(/\r$/, "", line)
      if (tolower(line) ~ /^x-petclaw-release:[ \t]*/) {
        total += 1
        sub(/^[^:]*:[ \t]*/, "", line)
        sub(/[ \t]+$/, "", line)
        if (line == expected) exact += 1
      }
    }
    END { exit(total == 1 && exact == 1 ? 0 : 1) }
  ' "${headers_file}"
}

petclaw_exact_header_value() {
  local headers_file="$1"
  local header_name="$2"
  local expected="$3"
  awk -v wanted="${header_name}" -v expected="${expected}" '
    BEGIN { total = 0; exact = 0 }
    {
      line = $0
      sub(/\r$/, "", line)
      lower = tolower(line)
      prefix = tolower(wanted) ":"
      if (index(lower, prefix) == 1) {
        total += 1
        sub(/^[^:]*:[ \t]*/, "", line)
        sub(/[ \t]+$/, "", line)
        if (line == expected) exact += 1
      }
    }
    END { exit(total == 1 && exact == 1 ? 0 : 1) }
  ' "${headers_file}"
}

petclaw_header_contains_token() {
  local headers_file="$1"
  local header_name="$2"
  local expected_token="$3"
  node -e '
    const fs = require("node:fs");
    const [file, wanted, expected] = process.argv.slice(1);
    const values = fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.toLowerCase().startsWith(`${wanted.toLowerCase()}:`))
      .flatMap((line) => line.slice(line.indexOf(":") + 1).split(","))
      .map((value) => value.trim().toLowerCase());
    if (!values.includes(expected.toLowerCase())) process.exit(1);
  ' "${headers_file}" "${header_name}" "${expected_token}"
}

petclaw_exact_frame_ancestors() {
  local headers_file="$1"
  local expected_sources="$2"
  node -e '
    const fs = require("node:fs");
    const [file, expected] = process.argv.slice(1);
    const values = fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^content-security-policy:/i.test(line))
      .map((line) => line.slice(line.indexOf(":") + 1).trim());
    if (values.length !== 1) process.exit(1);
    const directives = values[0].split(";").map((value) => value.trim())
      .filter((value) => value.toLowerCase().startsWith("frame-ancestors "));
    if (directives.length !== 1 || directives[0] !== `frame-ancestors ${expected}`) process.exit(1);
  ' "${headers_file}" "${expected_sources}"
}

petclaw_verify_landing_body() {
  node -e '
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      const hangul = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;
      if (hangul.test(body) || !body.includes("/api/petclaw/demo-chat")) process.exitCode = 1;
    });
  '
}

petclaw_verify_product_demo_body() {
  node -e '
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      const hangul = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;
      if (hangul.test(body) || !body.includes("id=\"playBtn\"") || !body.includes("id=\"replayBtn\"")) process.exitCode = 1;
    });
  '
}

petclaw_fetch_landing() {
  local path="${1:-/}"
  if [[ -n "${PETCLAW_EXPECTED_RELEASE_ID}" ]]; then
    curl --disable --silent --show-error --max-time 20 --noproxy '*' \
      -D "${PETCLAW_SMOKE_HEADERS}" -o "${PETCLAW_SMOKE_BODY}" -w '%{http_code}' \
      --resolve "myaipet.ai:${PETCLAW_SMOKE_PORT}:${PETCLAW_SMOKE_HOST}" \
      "https://myaipet.ai${path}"
  else
    petclaw_curl -D "${PETCLAW_SMOKE_HEADERS}" -o "${PETCLAW_SMOKE_BODY}" \
      -w '%{http_code}' "https://myaipet.ai${path}"
  fi
}

expect_env_exact AVATAR_UPLOAD_USER_DAILY_CAP 20
expect_env_exact AVATAR_UPLOAD_GLOBAL_DAILY_CAP 1000
expect_env_exact AVATAR_PREVIEW_TTL_HOURS 24
expect_env_exact LOCAL_STORAGE_MIN_FREE_BYTES 2147483648
expect_env_exact VISION_DAILY_CAP 300
expect_env_exact VISION_USER_DAILY_CAP 30
expect_env_exact REFERRALS_ENABLED false

if [[ -n "${PETCLAW_EXPECTED_RELEASE_ID}" ]]; then
  if [[ ! "${PETCLAW_EXPECTED_RELEASE_ID}" =~ ^[A-Za-z0-9._-]{6,80}$ \
    || "${PETCLAW_SMOKE_BASE}" != "https://app.myaipet.ai" \
    || "${PETCLAW_SMOKE_HOST}" != "127.0.0.1" \
    || "${PETCLAW_SMOKE_PORT}" != "443" ]]; then
    echo "ERROR: commit smoke must be pinned to the local TLS release identity." >&2
    exit 1
  fi
  PETCLAW_IDENTITY_OK=0
  # nginx reload is asynchronous: a connection opened immediately after
  # systemctl returns can still reach a retiring worker with the old route.
  # Retry only the exact release-identity probe; every other smoke remains
  # single-shot after the expected generation is proven active.
  for PETCLAW_IDENTITY_ATTEMPT in {1..20}; do
    PETCLAW_IDENTITY_CURL_OK=1
    if ! PETCLAW_IDENTITY_CODE="$(petclaw_curl -D "${PETCLAW_SMOKE_HEADERS}" \
      -o "${PETCLAW_SMOKE_BODY}" -w '%{http_code}' \
      -H 'Connection: close' \
      "${PETCLAW_SMOKE_BASE}/api/health")"; then
      PETCLAW_IDENTITY_CURL_OK=0
    fi
    if [[ "${PETCLAW_IDENTITY_CURL_OK}" == "1" \
      && "${PETCLAW_IDENTITY_CODE}" == "200" ]] \
      && petclaw_exact_release_header "${PETCLAW_SMOKE_HEADERS}"; then
      PETCLAW_IDENTITY_OK=1
      break
    fi
    sleep 1
  done
  if [[ "${PETCLAW_IDENTITY_OK}" != "1" ]]; then
    echo "ERROR: local nginx route did not expose the exact candidate release identity." >&2
    exit 1
  fi
fi

if [[ "${STORAGE_PROVIDER:-local}" == "local" ]]; then
  PETCLAW_LOCAL_UPLOAD_DIR="${LOCAL_UPLOAD_DIR:-/opt/petclaw/uploads}"
  if [[ ! -d "${PETCLAW_LOCAL_UPLOAD_DIR}" ]]; then
    echo "ERROR: local upload directory does not exist for the storage floor smoke." >&2
    exit 1
  fi
  PETCLAW_LOCAL_AVAILABLE_BYTES="$(df -PB1 "${PETCLAW_LOCAL_UPLOAD_DIR}" | awk 'NR==2 {print $4}')"
  if [[ ! "${PETCLAW_LOCAL_AVAILABLE_BYTES}" =~ ^[0-9]+$ ]] \
    || (( PETCLAW_LOCAL_AVAILABLE_BYTES < LOCAL_STORAGE_MIN_FREE_BYTES + 5242880 )); then
    echo "ERROR: local upload filesystem cannot preserve the 2 GiB floor after one max avatar." >&2
    exit 1
  fi
fi

expect_code 200 GET "/api/health"
PAYMENT_CONFIG_BODY="$(petclaw_curl "${PETCLAW_SMOKE_BASE}/api/config")"
node -e 'const d=JSON.parse(process.argv[1]); if(d?.payments_enabled!==false||d?.treasury!==""||d?.usdt!==""||d?.oauth_connections_enabled!==false||d?.agent_channels_enabled!==false) process.exit(1)' "${PAYMENT_CONFIG_BODY}"
expect_code 503 GET "/api/auth/oauth/discord?petId=1"
expect_code 503 GET "/api/auth/oauth/discord/callback?code=synthetic&state=synthetic"
expect_code 503 POST "/api/auth/oauth/telegram/callback?state=synthetic" -H "Content-Type: application/json" -d '{}'
expect_code 503 GET "/api/petclaw/connections?petId=1"
expect_code 503 POST "/api/pets/1/agent/connect" -H "Content-Type: application/json" -d '{}'
expect_code 503 GET "/api/referral"
expect_code 200 POST "/api/agent/webhook/telegram/1" -H "Content-Type: application/json" -d '{}'
expect_code 200 GET "/api/petclaw/skills?id=companion-chat"
expect_code 401 POST "/api/petclaw/skills" -H "Content-Type: application/json" -d '{"action":"execute","petId":1,"skillId":"companion-chat","input":{"message":"hello"}}'
expect_code 404 GET "/uploads/privacy-probe-does-not-exist.jpg"
expect_code 401 POST "/api/cron/media-deletions"
expect_code 200 GET "/petclaw-extension.zip"
if ! unzip -tq "${PETCLAW_SMOKE_BODY}" >/dev/null; then
  echo "ERROR: extension download is not a valid ZIP." >&2
  exit 1
fi
if [[ -n "${PETCLAW_EXTENSION_SHA256:-}" ]]; then
  PETCLAW_DOWNLOADED_EXTENSION_SHA="$(sha256sum "${PETCLAW_SMOKE_BODY}" | awk '{print $1}')"
  if [[ "${PETCLAW_DOWNLOADED_EXTENSION_SHA}" != "${PETCLAW_EXTENSION_SHA256}" ]]; then
    echo "ERROR: extension download hash differs from the release artifact." >&2
    exit 1
  fi
fi
PETCLAW_EXTENSION_MANIFEST="$(unzip -p "${PETCLAW_SMOKE_BODY}" manifest.json)"
node -e 'const m=JSON.parse(process.argv[1]); if(m.manifest_version!==3 || m.version!=="2.3.2") process.exit(1)' "${PETCLAW_EXTENSION_MANIFEST}"
expect_code 204 OPTIONS "/api/petclaw/skills" -H "Origin: https://myaipet.ai" -H "Access-Control-Request-Method: POST"
expect_code 403 OPTIONS "/api/petclaw/skills" -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST"
expect_code 204 OPTIONS "/api/pets" -H "Origin: https://myaipet.ai" -H "Access-Control-Request-Method: GET"
expect_code 403 OPTIONS "/api/pets" -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"
PETCLAW_PETS_CURL_OK=1
if ! PETCLAW_PETS_CODE="$(petclaw_curl -D "${PETCLAW_SMOKE_HEADERS}" \
  -o "${PETCLAW_SMOKE_BODY}" -w '%{http_code}' \
  -H 'Origin: https://myaipet.ai' "${PETCLAW_SMOKE_BASE}/api/pets")"; then
  PETCLAW_PETS_CURL_OK=0
fi
if [[ "${PETCLAW_PETS_CURL_OK}" != "1" || "${PETCLAW_PETS_CODE}" != "401" ]] \
  || ! petclaw_exact_header_value "${PETCLAW_SMOKE_HEADERS}" \
    access-control-allow-origin https://myaipet.ai \
  || ! petclaw_header_contains_token "${PETCLAW_SMOKE_HEADERS}" vary origin; then
  echo "ERROR: authenticated pet-list CORS boundary is not exact." >&2
  exit 1
fi

DEMO_BODY="$(petclaw_curl -H "Origin: https://myaipet.ai" -H "Content-Type: application/json" -d '{"message":"What can PetClaw do?"}' "${PETCLAW_SMOKE_BASE}/api/petclaw/demo-chat")"
node -e 'const d=JSON.parse(process.argv[1]); if(d?.output?.synthetic!==true||d?.output?.persisted!==false) process.exit(1)' "${DEMO_BODY}"

PETCLAW_LANDING_CURL_OK=1
if ! PETCLAW_LANDING_CODE="$(petclaw_fetch_landing /)"; then
  PETCLAW_LANDING_CURL_OK=0
fi
if [[ "${PETCLAW_LANDING_CURL_OK}" != "1" \
  || "${PETCLAW_LANDING_CODE}" != "200" ]] \
  || ! petclaw_verify_landing_body < "${PETCLAW_SMOKE_BODY}" \
  || ! petclaw_exact_header_value "${PETCLAW_SMOKE_HEADERS}" x-frame-options DENY \
  || ! petclaw_exact_frame_ancestors "${PETCLAW_SMOKE_HEADERS}" "'none'"; then
  echo "ERROR: landing smoke did not return exact English launch HTML." >&2
  exit 1
fi

PETCLAW_PRODUCT_DEMO_CURL_OK=1
if ! PETCLAW_PRODUCT_DEMO_CODE="$(petclaw_fetch_landing /product-demo.html)"; then
  PETCLAW_PRODUCT_DEMO_CURL_OK=0
fi
if [[ "${PETCLAW_PRODUCT_DEMO_CURL_OK}" != "1" \
  || "${PETCLAW_PRODUCT_DEMO_CODE}" != "200" ]] \
  || ! petclaw_verify_product_demo_body < "${PETCLAW_SMOKE_BODY}" \
  || ! petclaw_exact_header_value "${PETCLAW_SMOKE_HEADERS}" x-frame-options SAMEORIGIN \
  || ! petclaw_exact_frame_ancestors "${PETCLAW_SMOKE_HEADERS}" "'self'"; then
  echo "ERROR: same-origin product demo frame contract failed." >&2
  exit 1
fi

echo "Release smoke passed: ${PETCLAW_SMOKE_BASE}"

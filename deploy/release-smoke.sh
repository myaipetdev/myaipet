#!/usr/bin/env bash
set -euo pipefail

PETCLAW_SMOKE_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PETCLAW_SMOKE_BASE="${PETCLAW_SMOKE_BASE:-https://app.myaipet.ai}"
PETCLAW_SMOKE_HOST="${PETCLAW_SMOKE_HOST:-}"
PETCLAW_SMOKE_PORT="${PETCLAW_SMOKE_PORT:-443}"
PETCLAW_EXPECTED_RELEASE_ID="${PETCLAW_EXPECTED_RELEASE_ID:-}"
PETCLAW_RELEASE_ROOT="${PETCLAW_RELEASE_ROOT:-}"
PETCLAW_EXPECTED_EXTENSION_VERSION="2.4.1"
PETCLAW_EXPECTED_LANDING_REVISION="20260720-en-only"
PETCLAW_SMOKE_RATE_INTERVAL_SECONDS="0.60"
PETCLAW_SMOKE_BODY="$(mktemp)"
PETCLAW_SMOKE_HEADERS="$(mktemp)"
trap 'rm -f "${PETCLAW_SMOKE_BODY}" "${PETCLAW_SMOKE_HEADERS}"' EXIT

petclaw_curl() {
  # The production /api/ zone is 2r/s with burst=15. Commit smoke originates
  # from one loopback IP, so pace its mixed API sequence instead of consuming
  # the whole burst and mistaking the intended 429 defense for an app failure.
  if [[ -n "${PETCLAW_EXPECTED_RELEASE_ID}" ]]; then
    sleep "${PETCLAW_SMOKE_RATE_INTERVAL_SECONDS}"
  fi
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
  local expected_revision="${PETCLAW_EXPECTED_LANDING_REVISION:-20260720-en-only}"
  node -e '
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      const revision = process.argv[1];
      const hangul = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;
      const required = [
        `<html lang="en" translate="no" class="notranslate">`,
        `<meta name="google" content="notranslate"`,
        "/api/petclaw/demo-chat",
        "19-CONNECTOR REGISTRY · 3 LIVE · 18 SKILLS",
        "Supported MCP clients like Claude, Cursor, and OpenClaw connect through published SDK 1.6.3.",
        "+47 Play Points today",
        "SAMPLE",
        "Two legacy BNB Smart Chain contracts are deployed.",
        "Live app integration is off.",
        "Both contracts returned <code>paused() = false</code>",
        `class="footer-disclosure"`,
        `product-demo.html?v=${revision}`,
        `launch reel — starts as you scroll`,
        `animation: heroGlowBreathe`,
        `Dordor priority: footer/journey beats CTA overlap.`,
        `href="https://app.myaipet.ai/contracts"`,
      ];
      const forbidden = [
        "19 CONNECTORS · 18 SKILLS · 6 LIVE",
        `href="/stats"`,
        `>Metrics<`,
        "belongs to you — forever",
        "Web · Chrome · MCP</span>",
      ];
      if (hangul.test(body)
        || required.some((value) => !body.includes(value))
        || forbidden.some((value) => body.includes(value))
        || body.includes("2 Deployed · 2 Paused")) process.exitCode = 1;
    });
  ' "${expected_revision}"
}

petclaw_verify_product_demo_body() {
  node -e '
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      const hangul = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;
      const required = [
        `<html lang="en" translate="no" class="notranslate">`,
        `<meta name="google" content="notranslate"`,
        `id="playBtn"`,
        `id="replayBtn"`,
        `position:absolute; left:50%; top:50%; width:1280px; height:720px`,
        `transform:translate(-50%,-50%) scale(var(--s,1))`,
        `<a class="cta" href="https://app.myaipet.ai" target="_top">`,
        `7-tool MCP path is published in SDK 1.6.3 · messaging launch-paused.`,
      ];
      const forbidden = [
        "document.querySelector(\u0027.s8 .cta\u0027)",
        `Web · Chrome · MCP — Claude, Cursor, and beyond.`,
      ];
      if (hangul.test(body)
        || required.some((value) => !body.includes(value))
        || forbidden.some((value) => body.includes(value))) process.exitCode = 1;
    });
  '
}

petclaw_verify_release_source_contracts() {
  local release_root="$1"
  if ! node "${release_root}/web/scripts/season-starting-soon-contract.mjs" \
      "${release_root}"; then
    return 1
  fi
  node - "${release_root}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const requireAll = (body, values) => values.every((value) => body.includes(value));
const rejectAny = (body, values) => values.some((value) => body.includes(value));

const app = read("web/src/components/App.tsx");
if (rejectAny(app, ["Jul 1", "Aug 1"])) process.exit(1);

const walletGate = read("web/src/components/WalletGate.tsx");
const cardDeck = read("web/src/components/CardDeck.tsx");
const catCatch = read("web/src/components/CatCatch.tsx");
if (!app.includes('<WalletGate section={section}>')
  || app.includes('<WalletGate section="cards">')
  || !walletGate.includes('if (!isConnected && section === "catch") return children;')
  || !cardDeck.includes('tab === "catch" ? catchTab : <GuestGate')
  || !catCatch.includes('<PurposeHero /><GuestGate />')) process.exit(1);

const season = read("web/src/components/SeasonRewardsHub.tsx");
if (!requireAll(season, ["function TodayStrip", "/api/checkin", 'method: "POST"',
  "onClaimed", "Claim +"])) process.exit(1);

const missionControlRoute = read("web/src/app/api/petclaw/mission-control/route.ts");
const apiClient = read("web/src/lib/api.ts");
const devMockOffice = apiClient.match(/const DEV_MOCK_MC = \{[\s\S]*?\n\};/)?.[0] || "";
if (!requireAll(missionControlRoute, [
    "const pending: never[] = [];",
    "const working: never[] = [];",
    "const blocked: never[] = [];",
    "const doneActions = todaysActions.map",
    'detail: noop ? "No skill executed — credits refunded." : undefined',
    "credits: noop ? 0 : a.credits_used || 0",
  ])
  || rejectAny(missionControlRoute, ["WORKING_WINDOW_MS", "workingRows", "blockedRows",
    "consolidate-memory", "make-selfie", "give-goal"])
  || !requireAll(devMockOffice, ["pending: []", "working: []", "blocked: []"])
  || devMockOffice.includes('status: "active"')) process.exit(1);

const agentOffice = read("web/src/components/AgentOffice.tsx");
const grandPawOffice = read("web/src/components/GrandPawOffice.tsx");
const grandPawScene = read("web/src/lib/grandpaw/agent-cafe-3d.js");
const functionSlice = (body, start, end) => body.slice(body.indexOf(start), body.indexOf(end));
const queueAndDoneAdapters = [
  [
    functionSlice(agentOffice, "function queuedForDisplay", "function doneForDisplay"),
    functionSlice(agentOffice, "function doneForDisplay", "function workingForDisplay"),
  ],
  [
    functionSlice(grandPawOffice, "function queuedForDisplay", "function relTime"),
    functionSlice(grandPawOffice, "function doneForDisplay", "function workingSansDone"),
  ],
];
const officeStatusEscapes = [
  /mono="[^"]*(?:PENDING|BLOCKED|DONE TODAY)[^"]*"/,
  /title: "(?:Pending|Blocked|Done today|Queued|Working)"/,
  /right=\{`DONE /,
  /\{isWorking \? "working" : "idle"\}/,
  /["'](?:● )?Working(?:…|\.\.\.)["']/,
  />available</i,
];
if (!requireAll(agentOffice, [
    'type OfficeStatus = "IDLE" | "WORKING" | "QUEUED" | "DONE" | "LIVE"',
    '{isWorking ? "WORKING" : "IDLE"}',
    '<Column mono="QUEUED"', '<Column mono="WORKING"', '<Column mono="DONE"',
    'disabled={goal.trim().length < 3 || running || receiptMissing || petId == null}',
    '{running ? "WORKING" : receiptMissing ? "Check Account first" : `Authorize ${COST} credits & dispatch`}',
    '{active ? "WORKING" : "IDLE"}',
  ])
  || !requireAll(grandPawOffice, [
    'type Status = "IDLE" | "WORKING" | "QUEUED" | "DONE" | "LIVE"',
    'title: "QUEUED"', 'title: "WORKING"', 'title: "DONE"',
    'disabled={goal.trim().length < 3 || running || receiptMissing}',
    '{running ? "WORKING" : receiptMissing ? "Check Account first" : `Authorize ${cost} credits & dispatch`}',
    's.kind === "skill" && s.id === liveSkill',
    '{active ? "WORKING" : "IDLE"}',
    "task: c.status",
    'line: "courier — “Skills delivery!”"',
    'line: "housekeeper — “Tidy, tidy!”"',
    'fontStyle: c.kind === "staff" ? "italic" : undefined',
  ])
  || queueAndDoneAdapters.some(([queued, done]) => !queued.includes("kanban.pending")
    || queued.includes("kanban.blocked")
    || !done.includes("kanban.blocked.map")
    || !done.includes("credits: 0"))
  || officeStatusEscapes.some((pattern) => pattern.test(agentOffice) || pattern.test(grandPawOffice))
  || !requireAll(agentOffice, [
    "steps.push({ skill: evt.skill, ok: true, complete: false })",
    "ok: !!evt.ok, complete: true",
    "find((step) => !step.complete)?.skill",
    "live={s.id === liveSkill}",
  ])
  || /welcoming guests|skills delivery!|tidy tidy~|DRAFTING/i.test(grandPawScene)
  || !/GOAL' \+ \(LIVE\.goals === 1 \? '' : 'S'\) \+ ' · QUEUED'/.test(grandPawScene)
  || !grandPawScene.includes("const OFFICE_STATUSES = new Set(['IDLE', 'WORKING', 'QUEUED', 'DONE', 'LIVE'])")
  || !grandPawScene.includes("task: normalizeOfficeStatus(pet && pet.task)")
  || (grandPawScene.match(/task: 'IDLE'/g) || []).length !== 3
  || (grandPawScene.match(/\.task \|\| 'IDLE'/g) || []).length !== 3) process.exit(1);

const studio = read("web/src/components/PetStudioPro.tsx");
if (!requireAll(studio, ["ZONE 1 — TEMPLATE LIBRARY", "ZONE 2 — THE STAGE",
  "ZONE 3 — INSPECTOR", "TEMPLATE LIBRARY", "▸ PREVIEW", '<Panel label="RUN"'])) process.exit(1);

const landing = read("landing-assets/index.html");
const pitch = read("landing-assets/pitch-deck.html");
if (!requireAll(landing, ["19-CONNECTOR REGISTRY · 3 LIVE · 18 SKILLS",
  "7 MCP TOOLS · SDK 1.6.3 PUBLISHED", "+47 Play Points today", "SAMPLE"])
  || rejectAny(landing, ['href="/stats"', ">Metrics<", "6 LIVE"])
  || rejectAny(pitch, ["6 live today", "registry, 6 live", "any MCP client"])) process.exit(1);

const demo = read("landing-assets/product-demo.html");
const demoSource = read("tools/demo-video/product-demo.html");
for (const body of [demo, demoSource]) {
  if (!requireAll(body, ['<a class="cta" href="https://app.myaipet.ai" target="_top">',
    "7-tool MCP path is published in SDK 1.6.3 · messaging launch-paused."])
    || body.includes("document.querySelector('.s8 .cta')")) process.exit(1);
}

const publicCopy = [
  landing,
  pitch,
  demo,
  demoSource,
  read("web/src/app/layout.tsx"),
  read("web/src/app/api-docs/page.tsx"),
  read("web/src/app/account/AccountOverview.tsx"),
  read("web/src/components/Hero.tsx"),
  read("web/src/components/PetClawConsole.tsx"),
  read("web/src/components/PetClawHeroIntro.tsx"),
  read("web/src/components/PetClawPreview.tsx"),
  read("web/src/components/PremiumTeaser.tsx"),
  read("web/src/components/SovereigntyDashboard.tsx"),
  read("web/public/api-docs/QUICKSTART.md"),
  read("web/public/api-docs/ECOSYSTEM.md"),
].join("\n");
const forbiddenClaims = [
  /free forever/i,
  /unlimited chat/i,
  /full memory/i,
  /remember(?:s)? everything/i,
  /remember it forever/i,
  /true memory of every chat/i,
  /remembers it all/i,
  /everything it learns (?:is|stays) yours/i,
  /every memory, every bond/i,
  /fully exportable/i,
  /entire identity/i,
  /complete (?:SOUL data|pet identity)/i,
  /(?:zero|no) lock-in/i,
  /across every surface/i,
  /lives everywhere/i,
  /npx petclaw-mcp/i,
  /any MCP stdio client/i,
  /you actually own/i,
  /all the same pet, with a single, growing memory/i,
  /same pet, same memories/i,
  /every interaction shapes who your pet becomes/i,
  /skills, networking, and memory — all portable by design/i,
  /remembers, grows, and stays yours/i,
  /i learn from every turn/i,
];
if (forbiddenClaims.some((pattern) => pattern.test(publicCopy))) process.exit(1);

const apiDocs = read("web/src/app/api-docs/page.tsx");
if (!requireAll(apiDocs, ["MCP tools · SDK 1.6.3", "MCP runtime ·", "Messaging ·"])) process.exit(1);
if (!landing.includes("Import is a reported reconstruction")) process.exit(1);
if (!read("web/src/components/PremiumTeaser.tsx").includes("Chat subject to published rate limits")) process.exit(1);
if (!read("web/src/components/PetClawHeroIntro.tsx").includes("channels · paused")) process.exit(1);
if (!read("web/public/api-docs/QUICKSTART.md").includes("Competitive state, media, external connections, credentials, and consent are excluded")) process.exit(1);

const releaseStatus = read("web/src/lib/releaseStatus.ts");
if (!requireAll(releaseStatus, ['sdkVersion: "1.6.3"', "registry: 19", "live: 3", "skills: 18",
  "mcpTools: 7", 'mcp: "7-tool SDK 1.6.3 · published"',
  'channels: "launch-paused"']) || releaseStatus.includes("mcpCandidateTools")) process.exit(1);

const nginxTemplate = read("deploy/nginx-petclaw.conf.template");
const nginxRateZone = read("deploy/nginx-conf.d-ratelimit.conf");
const cronInstaller = read("deploy/install-crontab.sh");
const envChecklist = read("deploy/ENV-CHECKLIST.md");
if ((nginxTemplate.match(/^[ \t]*limit_req[ \t]+zone=abuse[ \t]+burst=15[ \t]+nodelay;[ \t]*$/gm) || []).length !== 1
  || /^[ \t]*limit_req_zone[ \t]/m.test(nginxTemplate)
  || (nginxRateZone.match(/^[ \t]*limit_req_zone \$binary_remote_addr zone=abuse:10m rate=2r\/s;[ \t]*$/gm) || []).length !== 1
  || (nginxRateZone.match(/^[ \t]*limit_req_status 429;[ \t]*$/gm) || []).length !== 1
  || !requireAll(cronInstaller, [
    "current crontab has duplicate or unterminated APP CRON markers",
    "current crontab changed during merge",
    "installed crontab does not match the verified merge result",
    "OPS_REQUIRED_BASENAMES",
  ])
  || !envChecklist.includes("/bin/bash /opt/petclaw/current/deploy/install-crontab.sh")
  || envChecklist.includes("\ncrontab -e\n")) process.exit(1);

const schema = read("web/prisma/schema.prisma");
const migration = "web/prisma/migrations/20260722000000_catch_map_consent_photo_hash/migration.sql";
const catchRoute = read("web/src/app/api/catch/route.ts");
const catchOwnerRoute = read("web/src/app/api/catch/[id]/route.ts");
const catchNearbyRoute = read("web/src/app/api/catch/nearby/route.ts");
const mediaRoute = read("web/src/app/api/media/[...key]/route.ts");
const nearbyMap = read("web/src/components/NearbyMap.tsx");
if (!requireAll(schema, ["photo_hash", "map_public", "CatchPhotoReservation"])
  || !exists(migration)
  || !exists("web/src/app/api/catch/[id]/route.ts")
  || exists("web/src/app/stats/page.tsx")
  || exists("web/prisma/migrations/20260709000000_referral_program")) process.exit(1);
if (!requireAll(catchRoute, ["photo_hash: privatePhotoHash",
  "where: { reserved_at: { lt: reservationCutoff } }", "Number.isFinite(body.lat)"])
  || !requireAll(catchOwnerRoute, ["Deletion is temporarily unavailable",
    "enqueueMediaDeletionReference", "caughtCat.delete"])
  || catchOwnerRoute.indexOf("await enqueueMediaDeletionReference") >= catchOwnerRoute.lastIndexOf("await prisma.caughtCat.delete")
  || !requireAll(catchNearbyRoute, ['source: "camera", map_public: true',
    "latParam !== null && lngParam !== null"])
  || !requireAll(mediaRoute, ['source: "camera"', "map_public: true", "publicCaughtOwnsObject"])
  || !nearbyMap.includes("escapeHtml(c.photo_path)")) process.exit(1);

const connectors = read("web/src/app/api/petclaw/connectors/route.ts");
if (!requireAll(connectors, ["agentChannelsEnabled", "agentChannelsUnavailableResponse",
  '["telegram", "slack", "discord", "twitter"]'])) process.exit(1);

const docs = read("web/src/app/docs/page.tsx");
if (!requireAll(docs, ["docs-toc-mobile", "@media (max-width: 768px)",
  "display: block !important"])
  || !requireAll(apiDocs, ["apidocs-mobile-toc", "@media (max-width: 820px)"])) process.exit(1);
NODE
}

petclaw_verify_revalidated_english_html_headers() {
  local headers_file="$1"
  petclaw_exact_header_value "${headers_file}" content-language en \
    && petclaw_header_contains_token "${headers_file}" cache-control no-cache
}

petclaw_verify_no_hangul_body() {
  node -e '
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      const hangul = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;
      if (hangul.test(body)) process.exitCode = 1;
    });
  '
}

petclaw_verify_contract_disclosure() {
  node -e '
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      const required = [
        "all blockchain integration disabled",
        "paused() = false",
        "BLOCKCHAIN_ENABLED=false",
        "owner relayer/minter authorization remains active",
        "PETContent (NFT)",
        "0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c",
        "On-chain paused() was false and totalSupply() = 0",
        "PetaGenTracker",
        "0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a",
        "On-chain paused() was false, totalUsers() = 0, and totalGenerations() = 0",
        "DEPLOYED (INTEGRATION OFF)",
      ];
      if (required.some((value) => !body.includes(value)) || body.includes("Deployed (paused)")) {
        process.exitCode = 1;
      }
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
expect_env_exact PAYMENTS_ENABLED false
expect_env_exact OAUTH_CONNECTIONS_ENABLED false
expect_env_exact AGENT_CHANNELS_ENABLED false
expect_env_exact PET_LORA_ENABLED false
expect_env_exact BLOCKCHAIN_ENABLED false
expect_env_exact REFERRALS_ENABLED false

if [[ -n "${PETCLAW_EXPECTED_RELEASE_ID}" || -n "${PETCLAW_RELEASE_ROOT}" ]]; then
  PETCLAW_RELEASE_ROOT="${PETCLAW_RELEASE_ROOT:-/opt/petclaw/current}"
  if ! node "${PETCLAW_SMOKE_SCRIPT_DIR}/scan-release-language.mjs" \
      built "${PETCLAW_RELEASE_ROOT}"; then
    echo "ERROR: active release contains Hangul/Jamo in source or built output." >&2
    exit 1
  fi
  if ! petclaw_verify_release_source_contracts "${PETCLAW_RELEASE_ROOT}"; then
    echo "ERROR: release source contracts do not match the approved launch state." >&2
    exit 1
  fi
fi

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
expect_code 200 GET "/"
if ! petclaw_verify_no_hangul_body < "${PETCLAW_SMOKE_BODY}"; then
  echo "ERROR: app HTML contains Hangul/Jamo." >&2
  exit 1
fi
expect_code 200 GET "/account"
expect_code 200 GET "/studio"
expect_code 200 GET "/docs"
expect_code 200 GET "/api-docs"
expect_code 404 GET "/stats"
expect_code 401 GET "/api/checkin"
expect_code 401 POST "/api/checkin" -H "Content-Type: application/json" -d '{}'
expect_code 401 PATCH "/api/catch/1" -H "Content-Type: application/json" -d '{"map_public":true}'
expect_code 401 DELETE "/api/catch/1"
PAYMENT_CONFIG_BODY="$(petclaw_curl "${PETCLAW_SMOKE_BASE}/api/config")"
node -e 'const d=JSON.parse(process.argv[1]); if(d?.payments_enabled!==false||d?.treasury!==""||d?.usdt!==""||d?.blockchain_enabled!==false||typeof d?.contracts!=="object"||d.contracts===null||Array.isArray(d.contracts)||Object.keys(d.contracts).length!==0||d?.oauth_connections_enabled!==false||d?.agent_channels_enabled!==false) process.exit(1)' "${PAYMENT_CONFIG_BODY}"
expect_code 200 GET "/contracts"
if ! petclaw_verify_contract_disclosure < "${PETCLAW_SMOKE_BODY}"; then
  echo "ERROR: public contract disclosure does not match the verified launch state." >&2
  exit 1
fi
expect_code 200 GET "/api-docs/ECOSYSTEM.md"
if ! grep -Fq 'returned `paused() = false` with zero activity/supply counters' \
    "${PETCLAW_SMOKE_BODY}" \
  || grep -Fq "contracts remain paused" "${PETCLAW_SMOKE_BODY}"; then
  echo "ERROR: public ecosystem documentation does not match the verified launch state." >&2
  exit 1
fi
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
PETCLAW_DOWNLOADED_EXTENSION_SHA="$(sha256sum "${PETCLAW_SMOKE_BODY}" | awk '{print $1}')"
if [[ -n "${PETCLAW_EXTENSION_SHA256:-}" ]]; then
  if [[ "${PETCLAW_DOWNLOADED_EXTENSION_SHA}" != "${PETCLAW_EXTENSION_SHA256}" ]]; then
    echo "ERROR: extension download hash differs from the release artifact." >&2
    exit 1
  fi
fi
PETCLAW_EXTENSION_MANIFEST="$(unzip -p "${PETCLAW_SMOKE_BODY}" manifest.json)"
node -e 'const m=JSON.parse(process.argv[1]); if(m.manifest_version!==3 || m.version!==process.argv[2]) process.exit(1)' \
  "${PETCLAW_EXTENSION_MANIFEST}" "${PETCLAW_EXPECTED_EXTENSION_VERSION}"
expect_code 200 GET "/petclaw-extension.zip.sha256"
if [[ "$(cat "${PETCLAW_SMOKE_BODY}")" != "${PETCLAW_DOWNLOADED_EXTENSION_SHA}  petclaw-extension.zip" ]]; then
  echo "ERROR: published extension checksum does not match the downloadable ZIP." >&2
  exit 1
fi
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
PETCLAW_LANDING_RELEASE_OK=1
if [[ -n "${PETCLAW_EXPECTED_RELEASE_ID}" ]] \
  && ! petclaw_exact_release_header "${PETCLAW_SMOKE_HEADERS}"; then
  PETCLAW_LANDING_RELEASE_OK=0
fi
if [[ "${PETCLAW_LANDING_CURL_OK}" != "1" \
  || "${PETCLAW_LANDING_CODE}" != "200" \
  || "${PETCLAW_LANDING_RELEASE_OK}" != "1" ]] \
  || ! petclaw_verify_landing_body < "${PETCLAW_SMOKE_BODY}" \
  || ! petclaw_verify_revalidated_english_html_headers "${PETCLAW_SMOKE_HEADERS}" \
  || ! petclaw_exact_header_value "${PETCLAW_SMOKE_HEADERS}" x-frame-options DENY \
  || ! petclaw_exact_frame_ancestors "${PETCLAW_SMOKE_HEADERS}" "'none'"; then
  echo "ERROR: landing smoke did not return exact English launch HTML." >&2
  exit 1
fi

PETCLAW_PRODUCT_DEMO_CURL_OK=1
if ! PETCLAW_PRODUCT_DEMO_CODE="$(petclaw_fetch_landing /product-demo.html)"; then
  PETCLAW_PRODUCT_DEMO_CURL_OK=0
fi
PETCLAW_PRODUCT_DEMO_RELEASE_OK=1
if [[ -n "${PETCLAW_EXPECTED_RELEASE_ID}" ]] \
  && ! petclaw_exact_release_header "${PETCLAW_SMOKE_HEADERS}"; then
  PETCLAW_PRODUCT_DEMO_RELEASE_OK=0
fi
if [[ "${PETCLAW_PRODUCT_DEMO_CURL_OK}" != "1" \
  || "${PETCLAW_PRODUCT_DEMO_CODE}" != "200" \
  || "${PETCLAW_PRODUCT_DEMO_RELEASE_OK}" != "1" ]] \
  || ! petclaw_verify_product_demo_body < "${PETCLAW_SMOKE_BODY}" \
  || ! petclaw_verify_revalidated_english_html_headers "${PETCLAW_SMOKE_HEADERS}" \
  || ! petclaw_exact_header_value "${PETCLAW_SMOKE_HEADERS}" x-frame-options SAMEORIGIN \
  || ! petclaw_exact_frame_ancestors "${PETCLAW_SMOKE_HEADERS}" "'self'"; then
  echo "ERROR: same-origin product demo frame contract failed." >&2
  exit 1
fi

PETCLAW_COMPAT_LANDING_CURL_OK=1
if ! PETCLAW_COMPAT_LANDING_CODE="$(petclaw_curl \
  -D "${PETCLAW_SMOKE_HEADERS}" -o "${PETCLAW_SMOKE_BODY}" -w '%{http_code}' \
  "${PETCLAW_SMOKE_BASE}/landing/?v=${PETCLAW_EXPECTED_LANDING_REVISION}")"; then
  PETCLAW_COMPAT_LANDING_CURL_OK=0
fi
PETCLAW_COMPAT_LANDING_RELEASE_OK=1
if [[ -n "${PETCLAW_EXPECTED_RELEASE_ID}" ]] \
  && ! petclaw_exact_release_header "${PETCLAW_SMOKE_HEADERS}"; then
  PETCLAW_COMPAT_LANDING_RELEASE_OK=0
fi
if [[ "${PETCLAW_COMPAT_LANDING_CURL_OK}" != "1" \
  || "${PETCLAW_COMPAT_LANDING_CODE}" != "200" \
  || "${PETCLAW_COMPAT_LANDING_RELEASE_OK}" != "1" ]] \
  || ! petclaw_verify_landing_body < "${PETCLAW_SMOKE_BODY}" \
  || ! petclaw_verify_revalidated_english_html_headers "${PETCLAW_SMOKE_HEADERS}"; then
  echo "ERROR: app landing compatibility path is not cache-safe English HTML." >&2
  exit 1
fi

PETCLAW_COMPAT_DEMO_CURL_OK=1
if ! PETCLAW_COMPAT_DEMO_CODE="$(petclaw_curl \
  -D "${PETCLAW_SMOKE_HEADERS}" -o "${PETCLAW_SMOKE_BODY}" -w '%{http_code}' \
  "${PETCLAW_SMOKE_BASE}/landing/product-demo.html?v=${PETCLAW_EXPECTED_LANDING_REVISION}")"; then
  PETCLAW_COMPAT_DEMO_CURL_OK=0
fi
PETCLAW_COMPAT_DEMO_RELEASE_OK=1
if [[ -n "${PETCLAW_EXPECTED_RELEASE_ID}" ]] \
  && ! petclaw_exact_release_header "${PETCLAW_SMOKE_HEADERS}"; then
  PETCLAW_COMPAT_DEMO_RELEASE_OK=0
fi
if [[ "${PETCLAW_COMPAT_DEMO_CURL_OK}" != "1" \
  || "${PETCLAW_COMPAT_DEMO_CODE}" != "200" \
  || "${PETCLAW_COMPAT_DEMO_RELEASE_OK}" != "1" ]] \
  || ! petclaw_verify_product_demo_body < "${PETCLAW_SMOKE_BODY}" \
  || ! petclaw_verify_revalidated_english_html_headers "${PETCLAW_SMOKE_HEADERS}"; then
  echo "ERROR: app product-demo compatibility path is not cache-safe English HTML." >&2
  exit 1
fi

echo "Release smoke passed: ${PETCLAW_SMOKE_BASE}"

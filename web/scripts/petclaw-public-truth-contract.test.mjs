#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const network = read("web/src/lib/petclaw/pet-network.ts");
assert.match(network, /status:\s*"discoverable"/);
assert.match(network, /progressionScore:/);
assert.doesNotMatch(network, /ownerWallet:|totalInteractions:|lastActivityAt:/,
  "anonymous discovery must not expose owner wallet or exact activity telemetry");
assert.match(network, /discoverableNodes:/);
assert.match(network, /remoteInvocations:\s*0/);
for (const fabricated of ["trustScore", "avgTrustScore", "onlineNodes", 'status: "online"']) {
  assert.equal(network.includes(fabricated), false, `network must not expose fabricated ${fabricated}`);
}

const skillRegistry = read("web/src/lib/petclaw/pethub.ts");
assert.doesNotMatch(
  skillRegistry,
  /rating:\s*(?!0(?:\.0+)?\b)\d+(?:\.\d+)?,\s*reviewCount:\s*0/,
  "unreviewed built-in skills must not advertise invented ratings",
);

const publicDiscovery = read("web/src/app/api/petclaw/network/discover/route.ts");
const publicManifest = read("web/src/app/api/petclaw/route.ts");
assert.match(publicDiscovery, /rateLimit\(req, \{ key: "petclaw-public-discovery"/);
assert.match(publicDiscovery, /"Cache-Control": "private, no-store"/);
assert.match(publicDiscovery, /Invalid discovery filters/);
assert.match(publicManifest, /rateLimit\(req, \{ key: "petclaw-public-manifest"/);
assert.match(publicManifest, /s-maxage=60/);

const publicCopy = [
  "README.md",
  "landing-assets/index.html",
  "landing-assets/pitch-deck.html",
  "landing-assets/product-demo.html",
  "tools/demo-video/product-demo.html",
  "web/src/app/docs/page.tsx",
  "web/src/app/architecture/page.tsx",
  "web/src/app/skills/page.tsx",
  "web/src/app/c/[id]/page.tsx",
  "web/src/components/SovereigntyDashboard.tsx",
  "web/src/components/PetClawPreview.tsx",
  "web/src/components/PetClawHeroIntro.tsx",
  "web/src/components/editorial/ChatEditorial.tsx",
  "web/src/components/Pricing.tsx",
  "web/src/components/TourMyPet.tsx",
  "web/src/components/Guide.tsx",
  "web/src/components/OrchestrationExplainer.tsx",
  "web/src/components/AgentOffice.tsx",
  "web/src/components/PetVillage.tsx",
  "web/src/components/MemoryJournal.tsx",
  "web/src/components/DemoPet.tsx",
  "web/src/components/EnhancedOnboarding.tsx",
  "web/src/app/api/bots/telegram/webhook/route.ts",
].map((file) => [file, read(file)]);

const bannedClaims = [
  /same memory everywhere/i,
  /remembers across every session/i,
  /always-on self-improvement/i,
  /always-on memory pipeline/i,
  /always-on VIGIL crew/i,
  /skills evolve as interactions accumulate/i,
  /version-controlled with git/i,
  /voice and values update immediately/i,
  /full portable export/i,
  /6 MCP tools/i,
  /signed SOUL export/i,
  /it actually remembers you/i,
  /it lives on every site/i,
  /soul you own, forever/i,
  /self-promotes from your chats/i,
  /runs companion-chat \+ memory-recall in every conversation/i,
  /every surface fuels the next/i,
  /memory becomes lock-in/i,
  /MCP-callable/i,
];
for (const [file, source] of publicCopy) {
  for (const claim of bannedClaims) {
    assert.equal(claim.test(source), false, `${file} contains banned public claim ${claim}`);
  }
}

const ecosystem = read("web/public/api-docs/ECOSYSTEM.md");
assert.match(ecosystem, /owner-controlled companion identity, memory, and consent layer/i);
assert.match(ecosystem, /provenance foundations/i);
assert.match(ecosystem, /7 MCP tools/i);
assert.match(ecosystem, /release candidate/i);

const telegram = read("web/src/app/api/bots/telegram/webhook/route.ts");
assert.match(telegram, /Telegram delivery is launch-paused/);

const apiDocs = read("web/public/api-docs/API.md");
const packageApiDocs = read("packages/petclaw/docs/API.md");
assert.match(apiDocs, /progressionScore/);
assert.match(apiDocs, /not a trust, security, identity, or transaction-risk rating/);
for (const source of [apiDocs, packageApiDocs]) {
  assert.match(source, /orchestratorModelCalls/);
  assert.match(source, /skillModelCalls/);
  assert.match(source, /including fallback attempts and calls made inside an\s+executed LLM skill/);
  assert.match(source, /Never blindly retry a paid or\s+non-idempotent run/);
  assert.match(source, /409 agent_run_in_progress/);
  assert.match(source, /agentReceipts\.scrubbedReceipts/);
  assert.match(source, /pet name, goal, answer (?:or|and) step/);
  assert.match(source, /second 404 means no durable run receipt was found/i);
}
const retryBlock = (source) => source.match(/Failure\/retry guide:[\s\S]*?\n\neffect\./)?.[0]
  ?? source.match(/Failure\/retry guide:[\s\S]*?\neffect\./)?.[0];
assert.equal(
  retryBlock(apiDocs),
  retryBlock(packageApiDocs),
  "package and hosted docs must mirror the HTTP retry contract exactly",
);

const rootReadme = read("README.md");
assert.doesNotMatch(rootReadme, /petclaw-sdk install daily-mood/);
assert.match(rootReadme, /level-1-safe core companion skill/);
assert.ok(
  rootReadme.indexOf("petclaw-sdk auth") < rootReadme.indexOf("petclaw-sdk execute companion-chat"),
  "root quickstart must authenticate before the owner-scoped core execution",
);

console.log("petclaw public truth contract: PASS");

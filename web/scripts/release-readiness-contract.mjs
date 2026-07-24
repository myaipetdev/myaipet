import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "..");
const readWeb = (relative) => readFile(resolve(webRoot, relative), "utf8");
const readRepo = (relative) => readFile(resolve(repoRoot, relative), "utf8");
const extensionZip = await readFile(resolve(webRoot, "public/petclaw-extension.zip"));
const extensionChecksum = await readWeb("public/petclaw-extension.zip.sha256");
const extensionBuilder = await readRepo("scripts/build-petclaw-extension.sh");
const releaseBuilder = await readRepo("deploy/build-release-artifact.sh");

const [
  status,
  connectors,
  skills,
  connectorRoute,
  schema,
  catchRoute,
  catchOwnerRoute,
  catchNearbyRoute,
  mediaRoute,
  nearbyMap,
  docs,
  apiDocs,
  landing,
  pitch,
  demo,
  demoSource,
  appLayout,
  account,
  hero,
  petClawConsole,
  petClawHero,
  petClawPreview,
  premium,
  sovereignty,
  quickstart,
  ecosystem,
  appShell,
  walletGate,
  cardDeck,
  catCatch,
  missionControlRoute,
  apiClient,
  agentOffice,
  grandPawOffice,
  grandPawScene,
  chatEditorial,
  baselineManifest,
  baselineSql,
  memoryFtsMigration,
  bootstrapEmptyDatabase,
  ec2Release,
] = await Promise.all([
  readWeb("src/lib/releaseStatus.ts"),
  readWeb("src/lib/petclaw/connectors/index.ts"),
  readWeb("src/lib/petclaw/pethub.ts"),
  readWeb("src/app/api/petclaw/connectors/route.ts"),
  readWeb("prisma/schema.prisma"),
  readWeb("src/app/api/catch/route.ts"),
  readWeb("src/app/api/catch/[id]/route.ts"),
  readWeb("src/app/api/catch/nearby/route.ts"),
  readWeb("src/app/api/media/[...key]/route.ts"),
  readWeb("src/components/NearbyMap.tsx"),
  readWeb("src/app/docs/page.tsx"),
  readWeb("src/app/api-docs/page.tsx"),
  readRepo("landing-assets/index.html"),
  readRepo("landing-assets/pitch-deck.html"),
  readRepo("landing-assets/product-demo.html"),
  readRepo("tools/demo-video/product-demo.html"),
  readWeb("src/app/layout.tsx"),
  readWeb("src/app/account/AccountOverview.tsx"),
  readWeb("src/components/Hero.tsx"),
  readWeb("src/components/PetClawConsole.tsx"),
  readWeb("src/components/PetClawHeroIntro.tsx"),
  readWeb("src/components/PetClawPreview.tsx"),
  readWeb("src/components/PremiumTeaser.tsx"),
  readWeb("src/components/SovereigntyDashboard.tsx"),
  readWeb("public/api-docs/QUICKSTART.md"),
  readWeb("public/api-docs/ECOSYSTEM.md"),
  readWeb("src/components/App.tsx"),
  readWeb("src/components/WalletGate.tsx"),
  readWeb("src/components/CardDeck.tsx"),
  readWeb("src/components/CatCatch.tsx"),
  readWeb("src/app/api/petclaw/mission-control/route.ts"),
  readWeb("src/lib/api.ts"),
  readWeb("src/components/AgentOffice.tsx"),
  readWeb("src/components/GrandPawOffice.tsx"),
  readWeb("src/lib/grandpaw/agent-cafe-3d.js"),
  readWeb("src/components/editorial/ChatEditorial.tsx"),
  readWeb("prisma/baseline/20260717_migrations.txt"),
  readWeb("prisma/baseline/20260717_production.sql"),
  readWeb("prisma/migrations/20260615000000_memory_fts/migration.sql"),
  readRepo("deploy/bootstrap-empty-database.sh"),
  readRepo("deploy/ec2-release.sh"),
]);

assert.match(status, /registry:\s*19/);
assert.match(status, /live:\s*3/);
assert.match(status, /liveIds:\s*\["web-search", "wikipedia", "memory"\]/);
assert.match(status, /skills:\s*18/);
assert.match(status, /sdkVersion:\s*"2\.0\.0"/);
assert.match(status, /mcpTools:\s*7/);
assert.doesNotMatch(status, /mcpCandidateTools/);
assert.match(status, /mcp:\s*"7-tool SDK 2\.0\.0 · published"/);
assert.match(status, /channels:\s*"launch-paused"/);

const connectorRegistry = connectors.match(/export const AVAILABLE_CONNECTORS\s*=\s*\[([\s\S]*?)\n\]\s+as const;/)?.[1] ?? "";
const skillRegistry = skills.match(/export const BUILTIN_SKILLS[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1] ?? "";
assert.equal((connectorRegistry.match(/\{ id:/g) ?? []).length, 19);
assert.equal((skillRegistry.match(/^\s{4}id:/gm) ?? []).length, 18);

for (const text of [landing, pitch]) {
  assert.doesNotMatch(text, /19 CONNECTORS · 18 SKILLS · 6 LIVE/i);
  assert.doesNotMatch(text, /19-connector registry with 6 live/i);
  assert.doesNotMatch(text, /registry, 6 live/i);
}
assert.match(landing, /19-CONNECTOR REGISTRY · 3 LIVE · 18 SKILLS/);
assert.match(landing, /7 MCP TOOLS · SDK 2\.0\.0 PUBLISHED/);
assert.match(landing, /\+47 Play Points today[\s\S]*SAMPLE/);
assert.doesNotMatch(landing, /href=["']\/stats/);
assert.doesNotMatch(landing, />Metrics</);
assert.match(pitch, /19-connector registry with 3 live today/);
assert.match(pitch, /seven MCP tools published in SDK 2\.0\.0/i);

for (const text of [demo, demoSource]) {
  assert.match(text, /<a class="cta" href="https:\/\/app\.myaipet\.ai" target="_top">/);
  assert.match(text, /7-tool MCP path is published in SDK 2\.0\.0 · messaging launch-paused\./);
  assert.doesNotMatch(text, /document\.querySelector\('\.s8 \.cta'\)/);
}

const publicCopy = [
  landing,
  pitch,
  demo,
  demoSource,
  appLayout,
  apiDocs,
  account,
  hero,
  petClawConsole,
  petClawHero,
  petClawPreview,
  premium,
  sovereignty,
  quickstart,
  ecosystem,
].join("\n");
const publicationTruthCopy = [
  publicCopy,
  await readRepo("README.md"),
  await readRepo("docs/DD_RESPONSE.md"),
  await readRepo("docs/PETCLAW-HERMES-DEVEX.md"),
  await readRepo("packages/petclaw/README.md"),
  await readRepo("packages/petclaw/docs/QUICKSTART.md"),
  await readWeb("src/app/architecture/page.tsx"),
  await readWeb("src/app/skills/page.tsx"),
  await readWeb("src/components/OrchestrationExplainer.tsx"),
].join("\n");
for (const stalePublicationClaim of [
  /SDK 1\.6\.3[^\n]*(?:candidate|unpublished|publish pending)/i,
  /(?:candidate|unpublished|publish pending)[^\n]*(?:MCP|SDK 2\.0\.0)/i,
  /@myaipet\/petclaw-sdk[^\n]*v?1\.6\.1/i,
  /npm SDK 1\.6\.1/i,
  /mcpCandidateTools/,
  /MCP-ready when SDK 2\.0\.0 lands/i,
  /when SDK 1\.6\.3 ships/i,
]) {
  assert.doesNotMatch(publicationTruthCopy, stalePublicationClaim);
}
for (const claim of [
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
]) {
  assert.doesNotMatch(publicCopy, claim);
}
assert.match(apiDocs, /MCP tools · SDK \$\{RELEASE_STATUS\.sdkVersion\}/);
assert.match(apiDocs, /MCP runtime ·/);
assert.match(apiDocs, /Messaging ·/);
assert.match(landing, /Import is a reported reconstruction/);
assert.match(premium, /Chat subject to published rate limits/);
assert.match(petClawHero, /channels · paused/);
assert.match(appShell, /<h2 className="season-banner-title"/);
assert.doesNotMatch(appShell, /<h1 className="season-banner-title"/);
assert.match(quickstart, /Persistent[\s\S]*require owner authentication/i);
assert.match(quickstart, /SHA-256 integrity checksum, not a publisher signature/i);

assert.match(connectorRoute, /\["telegram", "slack", "discord", "twitter"\]/);
assert.match(connectorRoute, /!agentChannelsEnabled\(\)/);
assert.match(connectorRoute, /return agentChannelsUnavailableResponse\(\)/);
assert.match(connectorRoute, /case "wikipedia"/);
assert.match(connectorRoute, /wiki\.search/);
assert.match(connectorRoute, /wiki\.getSummary/);

// The production baseline SQL already contains this FK. Marking its migration
// applied is required or a clean disaster-recovery bootstrap fails with
// `constraint already exists` before newer migrations can run.
assert.match(baselineManifest, /^20260718001000_subscription_owner_fk$/m);

// A baselined migration will never replay. Its material objects must exist in
// the snapshot, and both disaster-recovery bootstrap and live release paths
// must fail closed if that invariant is broken.
assert.match(baselineManifest, /^20260615000000_memory_fts$/m);
assert.match(schema, /content_tsv\s+Unsupported\("tsvector"\)/);
assert.match(schema, /@@index\(\[content_tsv\], type: Gin\)/);
assert.match(schema, /@@index\(\[pet_id, created_at\(sort: Desc\)\]\)/);
assert.match(memoryFtsMigration, /GENERATED ALWAYS AS \(to_tsvector\('simple'/);
assert.match(baselineSql,
  /"content_tsv" tsvector GENERATED ALWAYS AS \(to_tsvector\('simple'::regconfig, COALESCE\("content", ''::text\)\)\) STORED/);
assert.match(baselineSql,
  /CREATE INDEX "pet_memories_content_tsv_idx" ON "pet_memories" USING GIN \("content_tsv"\)/);
assert.match(baselineSql,
  /CREATE INDEX "pet_memories_pet_id_created_at_idx" ON "pet_memories"\("pet_id", "created_at" DESC\)/);
for (const guard of [bootstrapEmptyDatabase, ec2Release]) {
  assert.match(guard, /attribute\.attgenerated = 's'/);
  assert.match(guard, /invalid_gin_index/);
  assert.match(guard, /invalid_compound_index/);
  assert.match(guard, /pg_get_indexdef\(index_class\.oid\)/);
}
assert.ok(
  ec2Release.indexOf("PETCLAW_MEMORY_FTS_STATE=")
    < ec2Release.indexOf("npx prisma migrate deploy"),
  "memory FTS preflight must block before migrations and candidate traffic",
);

assert.match(schema, /photo_hash\s+String\?/);
assert.match(schema, /map_public\s+Boolean\s+@default\(false\)/);
assert.match(schema, /model CatchPhotoReservation/);
assert.match(schema, /@@id\(\[owner_user_id, photo_hash\]\)/);
await access(resolve(webRoot, "prisma/migrations/20260722000000_catch_map_consent_photo_hash/migration.sql"));
assert.match(catchRoute, /catchPhotoReservation\.create/);
assert.match(catchRoute, /where: \{ reserved_at: \{ lt: reservationCutoff \} \}/);
assert.match(catchRoute, /code\?: string \}\)\.code === "P2002"/);
assert.match(catchRoute, /duplicate-photo guard is temporarily unavailable/);
assert.match(catchRoute, /Send both lat and lng, or neither/);
assert.match(catchRoute, /Number\.isFinite\(body\.lat\)/);
assert.match(catchRoute, /body\.lat < -90/);
assert.ok(catchRoute.indexOf("catchPhotoReservation.create") < catchRoute.indexOf("await consumeCatchVerify"));
assert.match(catchRoute, /finally \{/);
assert.match(catchRoute, /photo_hash: privatePhotoHash/);
assert.doesNotMatch(catchRoute, /return \{ \.\.\.cat, rarityLabel/);
assert.match(catchOwnerRoute, /export async function PATCH/);
assert.match(catchOwnerRoute, /export async function DELETE/);
assert.match(catchOwnerRoute, /owner_user_id: user\.id/);
assert.match(catchOwnerRoute, /Deletion is temporarily unavailable/);
assert.ok(catchOwnerRoute.indexOf("await enqueueMediaDeletionReference") < catchOwnerRoute.lastIndexOf("await prisma.caughtCat.delete"));
assert.match(catchNearbyRoute, /source: "camera", map_public: true/);
assert.match(catchNearbyRoute, /round3/);
assert.match(catchNearbyRoute, /latParam !== null && lngParam !== null/);
assert.match(mediaRoute, /source: "camera"/);
assert.match(mediaRoute, /map_public: true/);
assert.match(mediaRoute, /publicCaughtOwnsObject/);
assert.match(nearbyMap, /escapeHtml\(c\.photo_path\)/);

assert.match(appShell, /<WalletGate section=\{section\}>[\s\S]*?<CardDeck[\s\S]*?initialTab=\{section === "catch" \? "catch" : undefined\}/);
assert.doesNotMatch(appShell, /<WalletGate section="cards">[\s\S]*?<CardDeck/);
assert.match(walletGate, /if \(!isConnected && section === "catch"\) return children/);
assert.match(cardDeck, /useState<DeckTab>\(initialTab \?\? "collection"\)/);
assert.match(cardDeck, /tab === "catch" \? catchTab : <GuestGate/);
assert.match(catCatch, /return <Shell><PurposeHero \/><GuestGate \/><\/Shell>/);
assert.match(catCatch, /The catch loop/);
assert.match(catCatch, /Your field kit is packed/);

// PetAutonomousAction rows remain completion-only history. Current Office
// state and paid-run receipts come from the owner/pet-scoped PetAgentRun ledger
// so refreshes and second tabs see the same reserved/running/terminal truth.
assert.equal(
  (missionControlRoute.match(/prisma\.petAgentRun\.findMany\(\{/g) ?? []).length,
  2,
  "mission-control must read bounded active and terminal run-ledger projections",
);
assert.match(missionControlRoute, /user_id: user\.id,\s*pet_id: pet\.id,\s*state: \{ in: \["reserved", "running"\] \}/);
assert.match(missionControlRoute, /where: \{ user_id: user\.id, pet_id: pet\.id, state: "terminal" \}/);
assert.match(missionControlRoute, /take: ACTIVE_RUN_CAP/);
assert.match(missionControlRoute, /take: TERMINAL_RUN_CAP/);
assert.match(missionControlRoute, /const pending = activeAgentRuns[\s\S]*run\.state === "reserved"[\s\S]*map\(publicActiveRun\)/);
assert.match(missionControlRoute, /const working = activeAgentRuns[\s\S]*run\.state === "running"[\s\S]*map\(publicActiveRun\)/);
assert.match(missionControlRoute, /const blocked: never\[\] = \[\];/);
assert.match(
  missionControlRoute,
  /const terminalDone = terminalAgentRuns\.map\(\(run\) => publicTerminalRun\(run\)\)/,
  "the seven-second mission-control poll must keep DONE rows summary-only",
);
assert.match(missionControlRoute, /latestAgentRun = terminalAgentRuns\[0\][\s\S]*publicTerminalRun\(terminalAgentRuns\[0\], true\)/);
for (const receiptField of [
  "answer",
  "steps",
  "stoppedReason",
  "billing",
  "creditsRemaining",
]) {
  assert.match(
    missionControlRoute,
    new RegExp(`${receiptField}:`),
    `terminal Agent Office receipts must retain ${receiptField}`,
  );
}
assert.match(missionControlRoute, /!action\.action_taken\.startsWith\("tool_agent:"\)/);
assert.match(missionControlRoute, /detail: noop \? "No skill executed — credits refunded\." : undefined/);
assert.match(missionControlRoute, /credits: noop \? 0 : a\.credits_used \|\| 0/);
assert.match(missionControlRoute, /function publicStepSummaries/);
assert.match(missionControlRoute, /skill,[\s\S]*ok: record\.ok === true/);
assert.match(missionControlRoute, /function publicRecallEvidence/);
assert.match(missionControlRoute, /containsStrongAgentOfficeSecret\(rawContent\)/);
assert.match(missionControlRoute, /isValidTerminalPaidAgentRunBilling\(value\)/);
assert.match(missionControlRoute, /goal: boundedText\(run\.goal, fullReceipt \? 2_000 : 500\)/);
assert.match(missionControlRoute, /"Cache-Control": "private, no-store"/);
assert.match(missionControlRoute, /user_id: user\.id,\s*pet_id: pet\.id,\s*status: "completed"/);
assert.match(missionControlRoute, /\.slice\(0, RUN_STEP_CAP\)/);
assert.doesNotMatch(missionControlRoute, /WORKING_WINDOW_MS|workingRows|blockedRows|consolidate-memory|make-selfie|give-goal/);

// The Office advertises only its four exact typed capabilities. Public skill
// manifests and endpoint descriptors never masquerade as dispatch controls.
for (const capability of [
  "recall_memory",
  "office-summarize",
  "office-review",
  "office-draft",
]) {
  assert.match(missionControlRoute, new RegExp(`id: "${capability}"`));
}
assert.doesNotMatch(missionControlRoute, /BUILTIN_SKILLS\.map/);
assert.match(missionControlRoute, /"core-in-process"/);
assert.match(missionControlRoute, /"locked"/);
assert.match(missionControlRoute, /availableInOffice: false/);
assert.match(missionControlRoute, /mode: "read-only"/);
assert.match(missionControlRoute, /blockedReason:/);

// Hard-coded routine copy is read-only catalog metadata until a real persisted
// last/next timestamp proves that an execution exists.
assert.match(missionControlRoute, /const observed = !!routine\.lastRun \|\| !!routine\.nextRun/);
assert.match(missionControlRoute, /source: observed \? "observed" as const : "catalog" as const/);
assert.match(missionControlRoute, /mode: observed \? "observed-read-only" as const : "catalog-read-only" as const/);
assert.match(missionControlRoute, /readOnly: true/);
assert.match(missionControlRoute, /catalogCount: schedules\.length/);
assert.match(missionControlRoute, /observedCount: observedRoutineCount/);
assert.doesNotMatch(missionControlRoute, /"Autonomy on"/);

const devMockOffice = apiClient.match(/const DEV_MOCK_MC = \{[\s\S]*?\n\};/)?.[0] ?? "";
assert.match(devMockOffice, /pending: \[\]/);
assert.match(devMockOffice, /working: \[\]/);
assert.match(devMockOffice, /blocked: \[\]/);
assert.doesNotMatch(devMockOffice, /status: "active"/);

// Agent Office launch vocabulary is deliberately tiny. Every visible status
// maps to one of these exact uppercase values and character speech stays in the rail.
assert.match(grandPawOffice, /type Status = "IDLE" \| "WORKING" \| "QUEUED" \| "DONE" \| "LIVE"/);
assert.match(grandPawOffice, /pets\.find\(\(candidate: any\) => Number\(candidate\.id\) === selectedPetId\)/);
assert.match(grandPawOffice, /tag="LIVE STATUS · VISUAL LOCATION"/);
assert.match(grandPawOffice, /room: "VISUAL SET"/);
assert.doesNotMatch(grandPawOffice, /room: "FRONT DESK"|SELECTED PET LIVE/);
assert.doesNotMatch(grandPawOffice, /Off duty until the next shift/);
assert.doesNotMatch(grandPawOffice, /selected \? "FRONT DESK" :/);
assert.match(agentOffice, /type OfficeStatus = "IDLE" \| "WORKING" \| "QUEUED" \| "DONE" \| "LIVE"/);
assert.match(agentOffice, /\{isWorking \? "WORKING" : isQueued \? "QUEUED" : "IDLE"\}/);
assert.match(agentOffice, /<Column mono="QUEUED"/);
assert.match(agentOffice, /<Column mono="WORKING"/);
assert.match(agentOffice, /<Column mono="DONE"/);
assert.match(grandPawOffice, /title: "QUEUED"/);
assert.match(grandPawOffice, /title: "WORKING"/);
assert.match(grandPawOffice, /title: "DONE"/);
const functionSlice = (body, start, end) => body.slice(body.indexOf(start), body.indexOf(end));
for (const [queuedAdapter, doneAdapter] of [
  [
    functionSlice(agentOffice, "function queuedForDisplay", "function doneForDisplay"),
    functionSlice(agentOffice, "function doneForDisplay", "function workingForDisplay"),
  ],
  [
    functionSlice(grandPawOffice, "function queuedForDisplay", "function relTime"),
    functionSlice(grandPawOffice, "function doneForDisplay", "function workingSansDone"),
  ],
]) {
  assert.match(queuedAdapter, /kanban\.pending/);
  assert.doesNotMatch(queuedAdapter, /kanban\.blocked/);
  assert.match(doneAdapter, /kanban\.blocked\.map/);
  assert.match(doneAdapter, /credits: 0/);
}
for (const visibleStatusEscape of [
  /mono="[^"]*(?:PENDING|BLOCKED|DONE TODAY)[^"]*"/,
  /title: "(?:Pending|Blocked|Done today|Queued|Working)"/,
  /right=\{`DONE /,
  /\{isWorking \? "working" : "idle"\}/,
  /["'](?:● )?Working(?:…|\.\.\.)["']/,
]) {
  assert.doesNotMatch(agentOffice, visibleStatusEscape);
assert.doesNotMatch(grandPawOffice, visibleStatusEscape);
}
assert.match(agentOffice, /disabled=\{!taskReady \|\| composerLocked \|\| petId == null\}/);
assert.match(agentOffice, /Run \$\{TASK_OPTIONS\.find\(\(option\) => option\.kind === taskKind\)\?\.label/);
assert.match(grandPawOffice, /disabled=\{!taskReady \|\| composerLocked\}/);
assert.match(grandPawOffice, /`Run \$\{selectedTaskMode\.label\} · reserve \$\{cost\} credits`/);
assert.match(agentOffice, /if \(skill\.availableInOffice === false\)[\s\S]*label: "NOT AVAILABLE"/);
assert.match(agentOffice, /skill\.mode === "endpoint-only"[\s\S]*label: studio \? "USE IN STUDIO" : "NOT AVAILABLE"/);
assert.match(agentOffice, /steps\.push\(\{ skill: evt\.skill, ok: true, complete: false \}\)/);
assert.match(agentOffice, /ok: !!evt\.ok,[\s\S]*complete: true/);
assert.match(agentOffice, /function liveRunSteps\(value: unknown, terminal: boolean\)/);
assert.match(agentOffice, /const displayedRun = localSelectedRun && !localSelectedRun\.done/);
assert.match(agentOffice, /selectedPetIdRef\.current !== pid/);
assert.doesNotMatch(agentOffice, /Run again · \{cost\} credits/);
assert.match(agentOffice, /find\(\(step\) => !step\.complete\)\?\.skill/);
assert.match(agentOffice, /live=\{s\.id === liveSkill\}/);
assert.match(grandPawOffice, /s\.kind === "skill" && s\.id === liveSkill/);
assert.match(grandPawOffice, /skill\.availableInOffice === false/);
assert.doesNotMatch(grandPawOffice, /Run again · \{cost\} credits/);
assert.match(agentOffice, /displayedRun\.state !== "reserved"/);
assert.match(agentOffice, /displayedRun\.state === "reserved"/);
assert.match(agentOffice, /const isWorking = classicWorking\.length > 0 \|\| running \|\| displayedRunIsWorking/);
assert.match(agentOffice, /const isQueued = classicQueued\.length > 0 \|\| displayedRunIsQueued/);
assert.match(agentOffice, /isWorking=\{isWorking\}[\s\S]*isQueued=\{isQueued\}/);
assert.match(grandPawOffice, /run\.state !== "reserved"/);
assert.match(grandPawOffice, /liveRun\.state === "reserved"/);
assert.match(grandPawOffice, /const runningCount = workingItems\.length \+ \(liveRunWorking \? 1 : 0\)/);
assert.match(grandPawOffice, /const queuedCount = queuedItems\.length \+ \(liveRunQueuedNotPersisted \? 1 : 0\)/);
assert.match(grandPawOffice, /const officeStatus: Status = busyNow \? "WORKING" : queuedCount > 0 \? "QUEUED" : "IDLE"/);
assert.match(
  grandPawOffice,
  /workingTitle \? "WORKING" : liveRunQueued \? "QUEUED" : "IDLE"/,
  "a reserved paid run must be shown as QUEUED and must never inflate WORKING",
);
assert.match(grandPawOffice, /task: c\.status/);
assert.match(grandPawOffice, /role: "VISUAL-ONLY NPC"[\s\S]*line: "visual host — “No task execution\.”"/);
assert.equal(
  (grandPawOffice.match(/role: "VISUAL-ONLY NPC"/g) ?? []).length,
  2,
  "both hotel-only characters must be explicitly labeled as non-executing NPCs",
);
assert.match(grandPawOffice, /fontStyle: c\.kind === "staff" \? "italic" : undefined/);
assert.doesNotMatch(grandPawScene, /welcoming guests|skills delivery!|tidy tidy~|DRAFTING/i);
assert.match(grandPawScene, /GOAL' \+ \(LIVE\.goals === 1 \? '' : 'S'\) \+ ' · QUEUED'/);
assert.match(grandPawScene, /const OFFICE_STATUSES = new Set\(\['IDLE', 'WORKING', 'QUEUED', 'DONE', 'LIVE'\]\)/);
assert.match(grandPawScene, /task: normalizeOfficeStatus\(pet && pet\.task\)/);
assert.equal((grandPawScene.match(/task: 'IDLE'/g) ?? []).length, 3);
assert.equal((grandPawScene.match(/\.task \|\| 'IDLE'/g) ?? []).length, 3);
assert.match(chatEditorial, /const bondDelta = Number\(res\?\.effects\?\.bond\)/);
assert.match(chatEditorial, /setActive\(\(current\) => current && current\.id === active\.id \? applyBond\(current\) : current\)/);
assert.match(chatEditorial, /setPets\(\(current\) => current\?\.map/);

assert.equal(
  extensionChecksum,
  `${createHash("sha256").update(extensionZip).digest("hex")}  petclaw-extension.zip\n`,
);
assert.match(extensionBuilder, /--check\) CHECK_ONLY=true/);
assert.match(extensionBuilder, /Committed extension ZIPs do not match the deterministic source build/);
assert.match(extensionBuilder, /printf '%s\\n' "\$EXPECTED_CHECKSUM" > "\$PUBLIC_CHECKSUM"/);
assert.match(releaseBuilder, /scripts\/build-petclaw-extension\.sh" --check/);
assert.match(releaseBuilder, /web\/scripts\/agent-run-safety-contract\.mjs/);
assert.match(releaseBuilder, /packages\/petclaw\/lib\/paid-run-journal\.cjs/);
assert.match(releaseBuilder, /packages\/petclaw\/test\/cli-mcp\.test\.cjs/);
assert.match(releaseBuilder, /PETCLAW_SDK_TEST_TREE[\s\S]*npm test/);
assert.match(releaseBuilder, /--experimental-transform-types/);
for (const onboarding of [petClawPreview, sovereignty]) {
  assert.match(onboarding, /href="\/petclaw-extension\.zip\.sha256"/);
  assert.match(onboarding, /Verify SHA-256/);
}

assert.match(docs, /docs-toc-mobile/);
assert.match(docs, /@media \(max-width: 768px\)/);
assert.match(apiDocs, /apidocs-mobile-toc/);
assert.match(apiDocs, /@media \(max-width: 820px\)/);

await assert.rejects(access(resolve(webRoot, "src/app/stats/page.tsx")));
await assert.rejects(access(resolve(webRoot, "prisma/migrations/20260709000000_referral_program")));

console.log("release_readiness_contract=PASS");

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
]);

assert.match(status, /registry:\s*19/);
assert.match(status, /live:\s*3/);
assert.match(status, /liveIds:\s*\["web-search", "wikipedia", "memory"\]/);
assert.match(status, /skills:\s*18/);
assert.match(status, /mcpTools:\s*6/);
assert.match(status, /mcp:\s*"ships with SDK 1\.6\.2"/);
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
assert.match(landing, /MCP client support ships with SDK 1\.6\.2/);
assert.match(landing, /\+47 Play Points today[\s\S]*SAMPLE/);
assert.doesNotMatch(landing, /href=["']\/stats/);
assert.doesNotMatch(landing, />Metrics</);
assert.match(pitch, /19-connector registry with 3 live today/);
assert.match(pitch, /working MCP path ships with SDK 1\.6\.2/i);

for (const text of [demo, demoSource]) {
  assert.match(text, /<a class="cta" href="https:\/\/app\.myaipet\.ai" target="_top">/);
  assert.match(text, /MCP runtime ships with SDK 1\.6\.2 · messaging launch-paused\./);
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
assert.match(apiDocs, /bundled MCP tools/);
assert.match(apiDocs, /MCP runtime ·/);
assert.match(apiDocs, /Messaging ·/);
assert.match(landing, /Import is a reported reconstruction/);
assert.match(premium, /Chat subject to published rate limits/);
assert.match(petClawHero, /channels · paused/);
assert.match(quickstart, /Competitive state, media, external connections, credentials, and consent are excluded/);

assert.match(connectorRoute, /\["telegram", "slack", "discord", "twitter"\]/);
assert.match(connectorRoute, /!agentChannelsEnabled\(\)/);
assert.match(connectorRoute, /return agentChannelsUnavailableResponse\(\)/);

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
assert.equal(
  extensionChecksum,
  `${createHash("sha256").update(extensionZip).digest("hex")}  petclaw-extension.zip\n`,
);
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

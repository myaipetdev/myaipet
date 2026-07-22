import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260722030000_daydream_video_claim_provenance/migration.sql");
const manifest = read("prisma/baseline/20260717_migrations.txt");
const claim = read("src/lib/petclaw/memory/daydream-video-claim.ts");
const cron = read("src/app/api/cron/daydream-to-video/route.ts");
const memory = read("src/lib/petclaw/memory/persistent-memory.ts");
const invalidation = read("src/lib/petclaw/memory/invalidation.ts");
const publicFeed = read("src/lib/publicFeed.ts");
const publish = read("src/app/api/social/publish/[generationId]/route.ts");
const leaderboard = read("src/app/api/leaderboards/[metric]/route.ts");
const integration = read("scripts/daydream-video-claim.integration.ts");
const backfill = read("scripts/backfill-generation-provenance.ts");
const backfillDoc = read("prisma/backfills/20260722-generation-provenance.md");
const studioGenerate = read("src/app/api/studio/generate/route.ts");
const petGenerate = read("src/app/api/pets/[petId]/generate/route.ts");
const petCreate = read("src/app/api/pets/route.ts");
const battleSprite = read("src/app/api/battle-sprite/route.ts");
const rewardMockup = read("src/app/api/rewards/mockup/route.ts");
const mediaRoute = read("src/app/api/media/[...key]/route.ts");
const sharePage = read("src/app/c/[id]/page.tsx");

assert.match(schema, /source_kind\s+String\s+@default\("unclassified"\)\s+@db\.VarChar\(32\)/);
for (const field of [
  "conversion_status",
  "conversion_memory_epoch",
  "conversion_claimed_at",
  "conversion_attempts",
  "conversion_retry_at",
  "conversion_error",
]) assert.match(schema, new RegExp(`\\b${field}\\b`));
assert.match(migration, /ADD COLUMN "source_kind"[\s\S]*?DEFAULT 'unclassified'/);
assert.doesNotMatch(migration, /^\s*(UPDATE|DELETE\s+FROM|INSERT\s+INTO|MERGE\s+INTO|COPY)\b/mi,
  "release migration must not perform historical data mutation");
assert.doesNotMatch(migration, /\bDROP\b/i, "release migration must remain expand-only");
assert.doesNotMatch(migration, /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i,
  "release migration must not build a blocking index inline");
assert.doesNotMatch(manifest, /20260722030000_daydream_video_claim_provenance/,
  "post-baseline migration must be applied, not falsely resolved as baselined");

// Default provenance is private. Every current, user-invoked generation writer
// must opt in explicitly rather than inheriting a permissive database default.
for (const writer of [studioGenerate, petGenerate, petCreate, battleSprite, rewardMockup]) {
  const creates = (writer.match(/(?:tx|prisma)\.generation\.create\(/g) || []).length;
  const labels = (writer.match(/source_kind: "user"/g) || []).length;
  assert.ok(creates > 0);
  assert.equal(labels, creates, "each user Generation create must opt into user provenance");
}

assert.match(backfill, /PETCLAW_PROVENANCE_BACKFILL_APPLY/);
assert.match(backfill, /CLASSIFY_SAFE_LEGACY_ROWS_V1/);
assert.match(backfill, /LIMIT \$1[\s\S]*?FOR UPDATE OF (?:g|pi) SKIP LOCKED/);
assert.match(backfill, /lock_timeout = '2s'/);
assert.match(backfill, /statement_timeout = '15s'/);
assert.match(backfill, /g\.credits_charged > 0 OR g\.pet_id IS NULL OR g\.duration = 0/);
assert.match(backfill, /SET source_kind = 'memory_daydream'/);
assert.match(backfill, /SET source_kind = 'agent_autonomous'/);
assert.match(backfill, /SET source_kind = 'user'/);
assert.doesNotMatch(backfill, /findMany|RETURNING\s+(?:g\.)?id/i,
  "backfill must not materialize generation ids in JavaScript");
assert.match(backfillDoc, /temporarily unavailable publicly/);
assert.match(backfillDoc, /ambiguous[^]*intentionally not auto-classified/);
assert.match(backfillDoc, /Do not add this backfill to `prisma migrate deploy`/);

const atomicClaim = claim.slice(
  claim.indexOf("export async function claimDaydreamVideoCandidate("),
  claim.indexOf("export async function claimNextDaydreamVideoCandidate("),
);
assert.match(atomicClaim, /withLockedPetModifiers\(candidate\.petId/);
const reservation = atomicClaim.indexOf("tx.generation.create");
const link = atomicClaim.indexOf("tx.petInsight.update");
assert.ok(reservation >= 0 && link > reservation,
  "private provenance reservation must be created and linked in one locked transaction");
assert.match(atomicClaim, /source_kind: DAYDREAM_VIDEO_SOURCE_KIND/);
assert.match(atomicClaim, /status: "reserved"/);
assert.match(atomicClaim, /visibility: "private"/);

assert.match(claim, /isDaydreamVideoClaimCurrent[\s\S]*?pet\.memory_epoch !== claim\.memoryEpoch/);
assert.match(claim, /conversion_status: "claimed"[\s\S]*?conversion_memory_epoch: claim\.memoryEpoch/);
assert.match(claim, /beforeVideoSubmission[\s\S]*?DAYDREAM_VIDEO_MAX_ATTEMPTS/);
assert.match(claim, /Manual retry required; automatic replay is disabled after provider submission/);
assert.match(claim, /expireStaleDaydreamVideoClaims[\s\S]*?conversion_claimed_at: \{ lte: cutoff \}/);
assert.match(claim, /worker lease expired\. Manual retry required/);

const post = cron.slice(cron.indexOf("export async function POST"));
const dryBranch = post.indexOf("if (dry) {");
const durableClaim = post.indexOf("claimNextDaydreamVideoCandidate(");
const retainedLlm = post.indexOf("insightToScene(c)");
const videoProvider = post.indexOf("submitGrokVideo(");
assert.ok(dryBranch >= 0 && durableClaim > dryBranch && retainedLlm > dryBranch && videoProvider > dryBranch,
  "dry must return before claims or provider work");
assert.match(post, /if \(dry\) \{[\s\S]*?providerRequests: 0,[\s\S]*?mutations: 0,[\s\S]*?preview,[\s\S]*?submitted: \[\],[\s\S]*?return NextResponse|if \(dry\) \{[\s\S]*?return NextResponse\.json/);
const dryBlockEnd = post.indexOf("\n  }\n\n  const submitted", dryBranch);
const dryBlock = post.slice(dryBranch, dryBlockEnd);
assert.doesNotMatch(dryBlock, /\.insight\b|prompt|avatar|appearance/i,
  "dry response must not export retained text or prompt material");
assert.ok((post.match(/isDaydreamVideoClaimCurrent\(c\)/g) || []).length >= 3,
  "epoch/claim must be revalidated before each provider boundary");
assert.ok(retainedLlm > post.indexOf("isDaydreamVideoClaimCurrent(c)"));
assert.ok(videoProvider > post.lastIndexOf("isDaydreamVideoClaimCurrent(c)", videoProvider));
assert.doesNotMatch(post, /prisma\.generation\.create\(/,
  "route must not create a generation after provider work");

assert.match(publicFeed, /\{ source_kind: "user" \}/,
  "every public query must allowlist user provenance");
assert.doesNotMatch(publicFeed, /petInsight\.findMany|notIn: privateIds/,
  "public requests must not materialize the global insight-link set in JavaScript");
assert.match(publish, /generation\.source_kind !== "user"[\s\S]*?status: 403/,
  "generic publish must fail closed independently of PetInsight");
assert.match(leaderboard, /g\.source_kind = 'user'/);
for (const publicSurface of [mediaRoute, sharePage]) {
  assert.match(publicSurface, /publicGenerationWhere/,
    "public media/share surfaces must use the canonical provenance allowlist");
}

assert.match(memory, /redactUnprovenancedRecallStores\(tx, this\.petId/);
assert.match(invalidation, /conversion_status: \{ in: \["claimed", "submitted"\] \}/);
assert.match(invalidation, /source_kind: "memory_daydream"[\s\S]*?visibility: "private"/);
assert.match(invalidation, /conversion_status: "revoked"/);
assert.match(invalidation, /insight: "Memory insight deleted by owner\."/);

assert.match(integration, /Promise\.all\(\[[\s\S]*?claimNextDaydreamVideoCandidate/);
assert.match(integration, /concurrent cron ticks must claim one insight exactly once/);
assert.match(integration, /isDaydreamVideoClaimCurrent\(claim\), false/);
assert.match(integration, /memory_daydream provenance must fail closed without its insight link/);
assert.match(integration, /expireStaleDaydreamVideoClaims/);

console.log("daydream_video_claim_contract=PASS");

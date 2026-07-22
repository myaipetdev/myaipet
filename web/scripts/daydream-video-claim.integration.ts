/**
 * Real-Postgres concurrency/privacy coverage for durable daydream-video claims.
 * Run only against an isolated database:
 *   DATABASE_URL=postgresql://... npm run test:daydream-video-claims
 */
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { createMemoryManager } from "@/lib/petclaw/memory/persistent-memory";
import {
  claimNextDaydreamVideoCandidate,
  DAYDREAM_VIDEO_SOURCE_KIND,
  expireStaleDaydreamVideoClaims,
  isDaydreamVideoClaimCurrent,
  releaseDaydreamVideoClaim,
} from "@/lib/petclaw/memory/daydream-video-claim";
import { publicGenerationWhere } from "@/lib/publicFeed";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must point to an isolated PetClaw test database");
}

const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const wallet = `0x${suffix.padEnd(40, "0").slice(0, 40)}`;
const petIds: number[] = [];
let userId: number | null = null;

const options = {
  minScore: 7,
  windowStart: new Date(Date.now() - 48 * 60 * 60 * 1000),
  cooldownStart: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
};

async function createEligiblePet(name: string) {
  const pet = await prisma.pet.create({
    data: {
      user_id: userId!,
      name,
      species: 1,
      personality_modifiers: {
        persistent_memories: [{ key: "private_fact", content: `${name} private fact` }],
      },
    },
  });
  petIds.push(pet.id);
  const insight = await prisma.petInsight.create({
    data: {
      pet_id: pet.id,
      insight: `${name} private inferred insight`,
      rationale: "derived from retained owner memory",
      mood: "tender",
      score: 9,
      source_keys: ["private_fact"],
    },
  });
  return { pet, insight };
}

async function main(): Promise<void> {
  try {
    const user = await prisma.user.create({
      data: { wallet_address: wallet, nonce: suffix.slice(0, 32) },
    });
    userId = user.id;

    const first = await createEligiblePet("AtomicClaimPet");
    const concurrent = await Promise.all([
      claimNextDaydreamVideoCandidate(options),
      claimNextDaydreamVideoCandidate(options),
    ]);
    const claims = concurrent.filter((claim) => claim !== null);
    assert.equal(claims.length, 1, "concurrent cron ticks must claim one insight exactly once");
    const claim = claims[0]!;
    assert.equal(claim.insightId, first.insight.id);
    assert.equal(await isDaydreamVideoClaimCurrent(claim), true);

    const reserved = await prisma.generation.findUniqueOrThrow({
      where: { id: claim.generationId },
    });
    assert.equal(reserved.source_kind, DAYDREAM_VIDEO_SOURCE_KIND);
    assert.equal(reserved.visibility, "private");
    assert.equal(reserved.status, "reserved");
    assert.equal(await prisma.generation.count({
      where: { pet_id: first.pet.id, source_kind: DAYDREAM_VIDEO_SOURCE_KIND },
    }), 1);

    const linked = await prisma.petInsight.findUniqueOrThrow({
      where: { id: first.insight.id },
    });
    assert.equal(linked.video_generation_id, claim.generationId);
    assert.equal(linked.conversion_status, "claimed");
    assert.equal(linked.conversion_memory_epoch, claim.memoryEpoch);

    // Clear wins after the durable claim but before any provider permit. It
    // revokes both sides atomically; no worker may proceed with retained text.
    const clearResult = await createMemoryManager(first.pet.id).clearMemory();
    assert.equal(clearResult.insightsSanitized, 1);
    assert.equal(clearResult.daydreamClaimsRevoked, 1);
    assert.equal(await isDaydreamVideoClaimCurrent(claim), false);
    const revokedGeneration = await prisma.generation.findUniqueOrThrow({
      where: { id: claim.generationId },
    });
    assert.equal(revokedGeneration.status, "failed");
    assert.equal(revokedGeneration.visibility, "private");
    assert.equal(revokedGeneration.source_kind, DAYDREAM_VIDEO_SOURCE_KIND);
    const revokedInsight = await prisma.petInsight.findUniqueOrThrow({
      where: { id: first.insight.id },
    });
    assert.equal(revokedInsight.conversion_status, "revoked");
    assert.equal(revokedInsight.insight, "Memory insight deleted by owner.");

    // Even if the mutable PetInsight link disappears and another bug flips
    // visibility, durable provenance keeps the orphan out of every public feed.
    await prisma.petInsight.delete({ where: { id: first.insight.id } });
    await prisma.pet.update({
      where: { id: first.pet.id },
      data: { personality_modifiers: { consent_public_profile: true } },
    });
    await prisma.generation.update({
      where: { id: claim.generationId },
      data: {
        status: "completed",
        visibility: "public",
        video_path: "/uploads/test-private-daydream.mp4",
      },
    });
    assert.equal(await prisma.generation.findFirst({
      where: await publicGenerationWhere({ id: claim.generationId }),
      select: { id: true },
    }), null, "memory_daydream provenance must fail closed without its insight link");

    // A failure before video submission releases the insight after bounded
    // backoff. The failed reservation keeps its private provenance for audit.
    const retryPet = await createEligiblePet("RetryPet");
    const retryClaim = await claimNextDaydreamVideoCandidate(options);
    assert.ok(retryClaim && retryClaim.petId === retryPet.pet.id);
    assert.deepEqual(await releaseDaydreamVideoClaim(
      retryClaim,
      "local prompt preparation failed",
      { beforeVideoSubmission: true },
    ), { retry: "scheduled" });
    const retryInsight = await prisma.petInsight.findUniqueOrThrow({
      where: { id: retryPet.insight.id },
    });
    assert.equal(retryInsight.video_generation_id, null);
    assert.equal(retryInsight.conversion_status, "ready");
    assert.ok(retryInsight.conversion_retry_at);
    const failedReservation = await prisma.generation.findUniqueOrThrow({
      where: { id: retryClaim.generationId },
    });
    assert.equal(failedReservation.status, "failed");
    assert.equal(failedReservation.source_kind, DAYDREAM_VIDEO_SOURCE_KIND);

    // A crashed claim is bounded by a lease but never automatically replayed:
    // upstream may have accepted an unrecorded request, so retry is manual.
    await prisma.petInsight.update({
      where: { id: retryPet.insight.id },
      data: { conversion_retry_at: new Date(Date.now() - 1_000) },
    });
    const crashedClaim = await claimNextDaydreamVideoCandidate(options);
    assert.ok(crashedClaim && crashedClaim.petId === retryPet.pet.id);
    await prisma.petInsight.update({
      where: { id: crashedClaim.insightId },
      data: { conversion_claimed_at: new Date(Date.now() - 60 * 60 * 1000) },
    });
    assert.equal(await expireStaleDaydreamVideoClaims(30 * 60 * 1000, 10), 1);
    const expiredInsight = await prisma.petInsight.findUniqueOrThrow({
      where: { id: crashedClaim.insightId },
    });
    assert.equal(expiredInsight.conversion_status, "failed");
    assert.equal(expiredInsight.conversion_claimed_at, null);
    assert.match(expiredInsight.conversion_error || "", /Manual retry required/);

    console.log("daydream_video_claim_integration=PASS");
  } finally {
    for (const petId of petIds) {
      await prisma.petInsight.deleteMany({ where: { pet_id: petId } }).catch(() => {});
      await prisma.generation.deleteMany({ where: { pet_id: petId } }).catch(() => {});
      await prisma.pet.delete({ where: { id: petId } }).catch(() => {});
    }
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

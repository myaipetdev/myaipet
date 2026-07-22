/** Real-Postgres proof for the bounded, fail-closed provenance backfill. */
import assert from "node:assert/strict";
import { Pool } from "pg";
import { prisma } from "@/lib/prisma";
import { publicGenerationWhere } from "@/lib/publicFeed";
import {
  readProvenanceCounts,
  runProvenanceBackfill,
} from "./backfill-generation-provenance";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must point to an isolated PetClaw test database");
}

const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const wallet = `0x${suffix.padEnd(40, "0").slice(0, 40)}`;
let userId: number | null = null;
let petId: number | null = null;

async function createGeneration(data: {
  petId: number | null;
  credits: number;
  duration: number;
  sourceKind?: string;
}) {
  return prisma.generation.create({
    data: {
      user_id: userId!,
      pet_id: data.petId,
      pet_type: 0,
      style: 0,
      prompt: "private fixture prompt",
      duration: data.duration,
      photo_path: `/uploads/provenance-${suffix}-${Math.random()}.jpg`,
      status: "completed",
      visibility: "public",
      ...(data.sourceKind ? { source_kind: data.sourceKind } : {}),
      credits_charged: data.credits,
      completed_at: new Date(),
    },
  });
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const user = await prisma.user.create({
      data: { wallet_address: wallet, nonce: suffix.slice(0, 32) },
    });
    userId = user.id;
    const pet = await prisma.pet.create({
      data: {
        user_id: user.id,
        name: "Provenance Fixture",
        species: 0,
        personality_modifiers: { consent_public_profile: true },
      },
    });
    petId = pet.id;

    const daydream = await createGeneration({ petId: pet.id, credits: 0, duration: 5 });
    await prisma.petInsight.create({
      data: {
        pet_id: pet.id,
        insight: "retained-memory fixture",
        mood: "tender",
        score: 9,
        video_generation_id: daydream.id,
      },
    });
    const autonomous = await createGeneration({ petId: pet.id, credits: 0, duration: 5 });
    await prisma.petAutonomousAction.create({
      data: {
        pet_id: pet.id,
        urge_type: "create",
        action_taken: "fixture autonomous media",
        generation_id: autonomous.id,
      },
    });
    const paid = await createGeneration({ petId: pet.id, credits: 5, duration: 5 });
    const noPet = await createGeneration({ petId: null, credits: 0, duration: 5 });
    const stillImage = await createGeneration({ petId: pet.id, credits: 0, duration: 0 });
    const ambiguous = await createGeneration({ petId: pet.id, credits: 0, duration: 5 });
    const explicit = await createGeneration({
      petId: pet.id,
      credits: 0,
      duration: 5,
      sourceKind: "user",
    });

    // Before the off-release procedure, every historical/default row is
    // unavailable publicly, including otherwise plausible user content.
    const beforeVisible = await prisma.generation.findMany({
      where: await publicGenerationWhere({
        id: { in: [daydream.id, autonomous.id, paid.id, noPet.id, stillImage.id, ambiguous.id, explicit.id] },
      }),
      select: { id: true },
    });
    assert.deepEqual(beforeVisible.map((row) => row.id), [explicit.id]);

    const preview = await runProvenanceBackfill(pool, {
      apply: false,
      batchSize: 1,
      maxBatches: 20,
    });
    assert.equal(preview.applied, false);
    assert.equal(preview.before.linkedDaydream, 1);
    assert.equal(preview.before.linkedAutonomous, 1);
    assert.equal(preview.before.provableUser, 3);
    assert.equal(preview.before.ambiguous, 1);
    assert.equal((await readProvenanceCounts(pool)).unclassified, 6);

    const applied = await runProvenanceBackfill(pool, {
      apply: true,
      batchSize: 1,
      maxBatches: 20,
    });
    assert.equal(applied.rows.memoryDaydream, 1);
    assert.equal(applied.rows.insightState, 1);
    assert.equal(applied.rows.agentAutonomous, 1);
    assert.equal(applied.rows.user, 3);
    assert.equal(applied.after.unclassified, 1);
    assert.equal(applied.after.ambiguous, 1);

    const rows = await prisma.generation.findMany({
      where: { id: { in: [daydream.id, autonomous.id, paid.id, noPet.id, stillImage.id, ambiguous.id, explicit.id] } },
      select: { id: true, source_kind: true },
    });
    const source = new Map(rows.map((row) => [row.id, row.source_kind]));
    assert.equal(source.get(daydream.id), "memory_daydream");
    assert.equal(source.get(autonomous.id), "agent_autonomous");
    assert.equal(source.get(paid.id), "user");
    assert.equal(source.get(noPet.id), "user");
    assert.equal(source.get(stillImage.id), "user");
    assert.equal(source.get(ambiguous.id), "unclassified");
    assert.equal(source.get(explicit.id), "user");
    assert.equal((await prisma.petInsight.findFirstOrThrow({
      where: { video_generation_id: daydream.id },
      select: { conversion_status: true },
    })).conversion_status, "converted");

    const afterVisible = await prisma.generation.findMany({
      where: await publicGenerationWhere({
        id: { in: [daydream.id, autonomous.id, paid.id, noPet.id, stillImage.id, ambiguous.id, explicit.id] },
      }),
      orderBy: { id: "asc" },
      select: { id: true },
    });
    assert.deepEqual(
      afterVisible.map((row) => row.id),
      [paid.id, noPet.id, stillImage.id, explicit.id].sort((a, b) => a - b),
    );

    console.log("generation_provenance_backfill_integration=PASS");
  } finally {
    if (petId) {
      await prisma.petAutonomousAction.deleteMany({ where: { pet_id: petId } }).catch(() => {});
      await prisma.petInsight.deleteMany({ where: { pet_id: petId } }).catch(() => {});
      await prisma.generation.deleteMany({ where: { user_id: userId! } }).catch(() => {});
      await prisma.pet.delete({ where: { id: petId } }).catch(() => {});
    }
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await pool.end().catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * Pet-LoRA training endpoints (owner-gated, env-gated).
 *
 * POST /api/pets/[petId]/lora            → kick off a training run
 *      ?retrain=1                        → allow retrain when one is already ready
 * GET  /api/pets/[petId]/lora            → latest run (lazy-polls fal while training)
 *
 * Gated behind PET_LORA_ENABLED=true + FAL_API_KEY — training costs real money
 * (~$2/run on fal), so it ships dark until ops turns it on. One run in flight
 * per pet; ready checkpoints are reused by the image generation path.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import {
  loraEnabled,
  submitPetLoraTraining,
  pollPetLora,
} from "@/lib/services/lora";

function serialize(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    triggerWord: row.trigger_word,
    loraReady: row.status === "ready",
    imagesUsed: Array.isArray(row.images_used) ? row.images_used.length : 0,
    error: row.error_message || undefined,
    createdAt: row.created_at?.toISOString?.(),
    completedAt: row.completed_at?.toISOString?.() || null,
  };
}

async function ownedPet(req: NextRequest, petIdRaw: string) {
  const user = await getUser(req);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const id = Number(petIdRaw);
  if (!id) return { error: NextResponse.json({ error: "Bad petId" }, { status: 400 }) };
  const pet = await prisma.pet.findFirst({
    where: { id, user_id: user.id, is_active: true },
    select: { id: true, user_id: true, species: true, avatar_url: true },
  });
  if (!pet) return { error: NextResponse.json({ error: "Pet not found" }, { status: 404 }) };
  return { pet };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const { petId } = await params;
  const { pet, error } = await ownedPet(req, petId);
  if (error) return error;

  const latest = await prisma.petLora.findFirst({
    where: { pet_id: pet.id },
    orderBy: { created_at: "desc" },
  });
  if (!latest) return NextResponse.json({ enabled: loraEnabled(), lora: null });

  const fresh = latest.status === "training" ? await pollPetLora(latest.id) : latest;
  return NextResponse.json({ enabled: loraEnabled(), lora: serialize(fresh) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  if (!loraEnabled()) {
    return NextResponse.json(
      { error: "Pet-LoRA training is not enabled on this deployment" },
      { status: 503 },
    );
  }

  const { petId } = await params;
  const { pet, error } = await ownedPet(req, petId);
  if (error) return error;

  const retrain = req.nextUrl.searchParams.get("retrain") === "1";
  const existing = await prisma.petLora.findFirst({
    where: { pet_id: pet.id, status: { in: ["training", "ready"] } },
    orderBy: { created_at: "desc" },
  });
  if (existing?.status === "training") {
    return NextResponse.json(
      { error: "A training run is already in progress", lora: serialize(existing) },
      { status: 409 },
    );
  }
  if (existing?.status === "ready" && !retrain) {
    return NextResponse.json(
      { error: "A trained LoRA already exists — pass ?retrain=1 to replace it", lora: serialize(existing) },
      { status: 409 },
    );
  }

  try {
    const { loraId, imagesUsed } = await submitPetLoraTraining(pet);
    const row = await prisma.petLora.findUnique({ where: { id: loraId } });
    return NextResponse.json({
      ok: true,
      lora: serialize(row),
      imagesUsed: imagesUsed.length,
      note: "Training takes a few minutes — poll GET /api/pets/[petId]/lora for status.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Training submit failed" }, { status: 400 });
  }
}

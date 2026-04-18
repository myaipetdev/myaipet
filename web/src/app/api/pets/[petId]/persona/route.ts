import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { getPersona, saveOnboarding } from "@/lib/services/persona";

/**
 * GET /api/pets/[petId]/persona
 * Returns the current persona data for the pet.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const pid = Number(petId);

  const pet = await prisma.pet.findFirst({
    where: { id: pid, user_id: user.id, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const persona = await getPersona(pid);

  return NextResponse.json({
    persona: persona || null,
    has_persona: !!persona,
  });
}

/**
 * PUT /api/pets/[petId]/persona
 * Save or update onboarding answers for the pet persona.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const pid = Number(petId);

  const pet = await prisma.pet.findFirst({
    where: { id: pid, user_id: user.id, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const body = await req.json();

  // Validate fields
  const validTones = ["casual", "formal", "meme", "chill", "energetic", "sarcastic"];
  const validLanguages = ["ko", "en", "mixed", "ja", "zh"];

  if (body.tone && !validTones.includes(body.tone)) {
    return NextResponse.json(
      { error: `Invalid tone. Must be one of: ${validTones.join(", ")}` },
      { status: 400 },
    );
  }
  if (body.language && !validLanguages.includes(body.language)) {
    return NextResponse.json(
      { error: `Invalid language. Must be one of: ${validLanguages.join(", ")}` },
      { status: 400 },
    );
  }

  // Truncate text fields for safety
  const data = {
    speech_style: body.speech_style?.slice(0, 500),
    interests: body.interests?.slice(0, 500),
    expressions: body.expressions?.slice(0, 500),
    tone: body.tone,
    language: body.language,
    bio: body.bio?.slice(0, 1000),
  };

  const persona = await saveOnboarding(pid, data);

  // Record Web4 checkpoint
  try {
    const { recordCheckpoint } = await import("@/lib/services/soul");
    await recordCheckpoint(pid, "onboarding");
  } catch (e) {
    console.error("Checkpoint error:", e);
  }

  return NextResponse.json({ persona, ok: true });
}

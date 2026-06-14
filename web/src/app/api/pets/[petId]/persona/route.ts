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

  // Validate fields. `tone` is a free-text descriptor (the picker is multi-select
  // and sends a comma-joined string) used as persona context, so it's stored
  // as-is rather than enum-validated — only `language` is a strict enum.
  const validLanguages = ["ko", "en", "mixed", "ja", "zh"];

  if (body.language && !validLanguages.includes(body.language)) {
    return NextResponse.json(
      { error: `Invalid language. Must be one of: ${validLanguages.join(", ")}` },
      { status: 400 },
    );
  }

  const asStr = (v: any) => (typeof v === "string" ? v : Array.isArray(v) ? v.join(",") : undefined);

  // Truncate text fields for safety (tolerate array payloads → CSV).
  const data = {
    speech_style: asStr(body.speech_style)?.slice(0, 500),
    interests: asStr(body.interests)?.slice(0, 500),
    expressions: asStr(body.expressions)?.slice(0, 500),
    tone: asStr(body.tone)?.slice(0, 50), // owner_tone is VarChar(50)
    language: body.language,
    bio: asStr(body.bio)?.slice(0, 1000),
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

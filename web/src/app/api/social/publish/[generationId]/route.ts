import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasExplicitPublicConsent } from "@/lib/publicPet";
import { rateLimit } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";

function parseGenerationId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ generationId: string }> },
) {
  const limited = rateLimit(req, { key: "publish-generation", limit: 30, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { generationId } = await params;
  const id = parseGenerationId(generationId);
  if (!id) return NextResponse.json({ error: "Invalid generation id" }, { status: 400 });

  const generation = await prisma.generation.findFirst({
    where: { id, user_id: user.id },
    select: {
      id: true,
      status: true,
      photo_path: true,
      video_path: true,
      pet_id: true,
      pet: { select: { personality_modifiers: true } },
    },
  });
  if (!generation) return NextResponse.json({ error: "Creation not found" }, { status: 404 });
  if (generation.status !== "completed" || (!generation.photo_path && !generation.video_path)) {
    return NextResponse.json({ error: "Only completed creations can be shared" }, { status: 409 });
  }

  // Daydream videos are derived from private memories and cannot be converted
  // into public rows through the generic Studio share control.
  const privateInsight = await prisma.petInsight.findFirst({
    where: { video_generation_id: id },
    select: { id: true },
  });
  if (privateInsight) {
    return NextResponse.json({ error: "Memory-derived creations cannot be shared" }, { status: 403 });
  }

  if (generation.pet_id && !hasExplicitPublicConsent(generation.pet?.personality_modifiers)) {
    return NextResponse.json(
      { error: "Enable Public profile in Data Sovereignty before sharing this pet creation", code: "PUBLIC_PROFILE_REQUIRED" },
      { status: 409 },
    );
  }

  await prisma.generation.update({ where: { id }, data: { visibility: "public" } });
  return NextResponse.json({
    published: true,
    url: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.myaipet.ai"}/c/${id}`,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ generationId: string }> },
) {
  const limited = rateLimit(req, { key: "unpublish-generation", limit: 30, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { generationId } = await params;
  const id = parseGenerationId(generationId);
  if (!id) return NextResponse.json({ error: "Invalid generation id" }, { status: 400 });

  const result = await prisma.generation.updateMany({
    where: { id, user_id: user.id },
    data: { visibility: "private" },
  });
  if (!result.count) return NextResponse.json({ error: "Creation not found" }, { status: 404 });
  return NextResponse.json({ published: false });
}

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { petId } = await params;

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id },
    include: {
      memories: {
        orderBy: { created_at: "desc" },
        take: 10,
      },
    },
  });

  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  // Calculate mood based on stats
  let current_mood = "neutral";
  if (pet.happiness >= 80 && pet.energy >= 50) current_mood = "ecstatic";
  else if (pet.happiness >= 60) current_mood = "happy";
  else if (pet.hunger >= 80) current_mood = "starving";
  else if (pet.hunger >= 60) current_mood = "hungry";
  else if (pet.energy <= 15) current_mood = "exhausted";
  else if (pet.energy <= 30) current_mood = "tired";
  else if (pet.happiness <= 20) current_mood = "grumpy";
  else if (pet.happiness <= 40) current_mood = "sad";

  return NextResponse.json({
    ...pet,
    current_mood,
    recent_memories: pet.memories,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { petId } = await params;

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id },
  });

  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  await prisma.pet.update({
    where: { id: pet.id },
    data: { is_active: false },
  });

  await prisma.petMemory.create({
    data: {
      pet_id: pet.id,
      memory_type: "farewell",
      content: `${pet.name} was released. Farewell, dear friend.`,
      emotion: "sad",
      importance: 5,
    },
  });

  return NextResponse.json({ message: "Pet released successfully" });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { petId } = await params;
  const body = await req.json();

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
  });

  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  // SCRUM-53/55: lazy-import sanitizers (keeps cold-start small for read paths)
  const { sanitizeName, sanitizeText, safeUrlOrEmpty } = await import("@/lib/sanitize");

  const updateData: any = {};
  // SCRUM-60: name was previously silently ignored. Now accepted + sanitized.
  if (body.name !== undefined) {
    const cleanName = sanitizeName(body.name, 50);
    if (cleanName) updateData.name = cleanName;
  }
  if (body.appearance_desc !== undefined) {
    updateData.appearance_desc = sanitizeText(body.appearance_desc, 2000);
  }
  if (body.avatar_url !== undefined) {
    const safeAvatar = safeUrlOrEmpty(body.avatar_url);
    if (safeAvatar) updateData.avatar_url = safeAvatar;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.pet.update({
    where: { id: pet.id },
    data: updateData,
  });

  return NextResponse.json(updated);
}

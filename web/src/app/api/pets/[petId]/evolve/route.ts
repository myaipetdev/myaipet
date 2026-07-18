import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { SKILL_MAP } from "@/lib/skills";
import { NextRequest, NextResponse } from "next/server";

const EVOLUTION_STAGES = [
  { stage: 0, name: "Baby", minLevel: 1, icon: "🥚" },
  { stage: 1, name: "Young", minLevel: 5, icon: "🌱" },
  { stage: 2, name: "Adult", minLevel: 10, icon: "⭐" },
  { stage: 3, name: "Elder", minLevel: 20, icon: "👑" },
  { stage: 4, name: "Legendary", minLevel: 35, icon: "🔱" },
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
  });

  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const currentStage = pet.evolution_stage || 0;
  const nextStage = EVOLUTION_STAGES.find(s => s.stage === currentStage + 1);

  if (!nextStage) {
    return NextResponse.json({ error: "Already at max evolution" }, { status: 400 });
  }

  if (pet.level < nextStage.minLevel) {
    return NextResponse.json({
      error: `Need level ${nextStage.minLevel} to evolve. Currently level ${pet.level}.`,
      required_level: nextStage.minLevel,
    }, { status: 400 });
  }

  // Evolve + grant credits in one transaction, with the stage flip as the atomic
  // claim guard: the updateMany only matches while evolution_stage is still the
  // value we read, so concurrent requests can't each grant the 50-credit reward
  // for a single stage transition (was a read-then-write race → N× credits).
  const evolved = await prisma.$transaction(async (tx: any) => {
    const claim = await tx.pet.updateMany({
      where: { id: pet.id, user_id: user.id, evolution_stage: currentStage },
      data: {
        evolution_stage: nextStage.stage,
        evolution_name: nextStage.name,
        happiness: Math.min(100, pet.happiness + 20),
        experience: { increment: 50 },
      },
    });
    if (claim.count !== 1) return null; // another request already evolved this stage
    await tx.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "milestone",
        content: `${pet.name} evolved to ${nextStage.name} stage! ${nextStage.icon}`,
        emotion: "excited",
        importance: 5,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { credits: { increment: 50 } },
    });
    return tx.pet.findUnique({ where: { id: pet.id } });
  });

  if (!evolved) {
    return NextResponse.json({ error: "Already evolving" }, { status: 409 });
  }

  // Record the evolution locally; optional chain anchoring stays exact-gated.
  let evolutionMilestone: any = null;
  try {
    const { recordEvolution } = await import("@/lib/petclaw/nft-mint");
    evolutionMilestone = await recordEvolution(pet.id, nextStage.stage, nextStage.name);
  } catch (e: any) {
    console.error("[evolve] milestone record failed:", e?.message);
  }

  return NextResponse.json({
    pet: evolved,
    new_stage: nextStage,
    // Skills use the canonical 24-skill Adventure/Arena database and are
    // learned through starter grants, Adventure drops and the Skill Shop.
    // Older evolution code inserted unknown keys (fetch/sit/etc.) that could
    // never be equipped or used; do not advertise or create phantom rewards.
    skills_unlocked: [],
    credits_earned: 50,
    evolution_milestone: evolutionMilestone,
  });
}

// GET: Check evolution status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id },
    include: { skills: true },
  });

  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const currentStage = pet.evolution_stage || 0;
  const current = EVOLUTION_STAGES.find(s => s.stage === currentStage) || EVOLUTION_STAGES[0];
  const next = EVOLUTION_STAGES.find(s => s.stage === currentStage + 1);

  return NextResponse.json({
    current_stage: current,
    next_stage: next || null,
    can_evolve: next ? pet.level >= next.minLevel : false,
    level: pet.level,
    // Hide legacy phantom skill rows from this progression surface. They are
    // deliberately left untouched in storage so this read path is non-destructive.
    skills: pet.skills.filter((skill) => Boolean(SKILL_MAP[skill.skill_key])),
    all_stages: EVOLUTION_STAGES,
  });
}

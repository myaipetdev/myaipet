import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { SKILL_DB, SKILL_MAP, MAX_SKILL_SLOTS, getStarterSkills } from "@/lib/skills";
import { NextRequest, NextResponse } from "next/server";
import {
  SkillAlreadyMaxLevelError,
  SkillUpgradeConflictError,
  SkillUpgradeInsufficientCreditsError,
  SkillUpgradeUnavailableError,
  upgradeSkill,
} from "@/lib/skillUpgrade";

// GET /api/skills?pet_id=X — Get pet's skills (learned + equipped)
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const petId = Number(req.nextUrl.searchParams.get("pet_id"));
  if (!petId) return NextResponse.json({ error: "pet_id required" }, { status: 400 });

  const pet = await prisma.pet.findFirst({
    where: { id: petId, user_id: user.id },
    include: { skills: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  // Ignore legacy phantom skill rows created by the retired evolution mapping.
  // If none of the pet's rows belong to the canonical battle database, grant
  // the normal starters so an evolved legacy pet is not left with an empty UI.
  const canonicalSkills = pet.skills.filter((skill) => Boolean(SKILL_MAP[skill.skill_key]));
  if (canonicalSkills.length === 0) {
    const element = (pet.element as any) || "normal";
    const starterKeys = getStarterSkills(element);
    const created = await prisma.$transaction(
      starterKeys.map((key, i) =>
        prisma.petSkill.create({
          data: { pet_id: petId, skill_key: key, level: 1, slot: i },
        })
      )
    );
    const skills = created.map((s) => ({
      ...s,
      def: SKILL_MAP[s.skill_key],
    }));
    return NextResponse.json({ skills, available: getAvailableForPet(pet) });
  }

  const skills = canonicalSkills.map((s) => ({
    ...s,
    def: SKILL_MAP[s.skill_key],
  }));

  return NextResponse.json({ skills, available: getAvailableForPet(pet) });
}

// POST /api/skills — Learn, equip, unequip, or upgrade a skill
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, pet_id, skill_key, slot } = await req.json();

  const pet = await prisma.pet.findFirst({
    where: { id: pet_id, user_id: user.id },
    include: { skills: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const skillDef = SKILL_MAP[skill_key];

  switch (action) {
    case "learn": {
      // Buy a skill from the shop
      if (!skillDef) return NextResponse.json({ error: "Unknown skill" }, { status: 400 });
      if (pet.level < skillDef.levelReq) {
        return NextResponse.json({ error: `Requires level ${skillDef.levelReq}` }, { status: 400 });
      }
      const already = pet.skills.find((s) => s.skill_key === skill_key);
      if (already) return NextResponse.json({ error: "Already learned" }, { status: 400 });

      const price = skillDef.price || 0;
      // Guarded decrement (audit H17): balance check + debit atomically so
      // concurrent learns can't race the balance negative.
      const learned = await prisma.$transaction(async (tx) => {
        if (price > 0) {
          const dec = await tx.user.updateMany({
            where: { id: user.id, credits: { gte: price } },
            data: { credits: { decrement: price } },
          });
          if (dec.count === 0) return false;
        }
        await tx.petSkill.create({ data: { pet_id, skill_key, level: 1, slot: null } });
        return true;
      });
      if (!learned) {
        return NextResponse.json({ error: "Insufficient credits", required: price }, { status: 400 });
      }

      return NextResponse.json({ learned: skill_key, credits_spent: price });
    }

    case "equip": {
      if (!skillDef) return NextResponse.json({ error: "Unknown skill" }, { status: 400 });
      const skill = pet.skills.find((s) => s.skill_key === skill_key);
      if (!skill) return NextResponse.json({ error: "Skill not learned" }, { status: 400 });

      const targetSlot = typeof slot === "number" ? slot : findEmptySlot(pet.skills);
      if (targetSlot === null || targetSlot < 0 || targetSlot >= MAX_SKILL_SLOTS) {
        return NextResponse.json({ error: "No empty slot. Unequip a skill first." }, { status: 400 });
      }

      // Unequip whatever is in the target slot
      const occupant = pet.skills.find((s) => s.slot === targetSlot);
      await prisma.$transaction([
        ...(occupant ? [prisma.petSkill.update({ where: { id: occupant.id }, data: { slot: null } })] : []),
        prisma.petSkill.update({ where: { id: skill.id }, data: { slot: targetSlot } }),
      ]);

      return NextResponse.json({ equipped: skill_key, slot: targetSlot });
    }

    case "unequip": {
      const skill = pet.skills.find((s) => s.skill_key === skill_key);
      if (!skill) return NextResponse.json({ error: "Skill not learned" }, { status: 400 });

      await prisma.petSkill.update({ where: { id: skill.id }, data: { slot: null } });
      return NextResponse.json({ unequipped: skill_key });
    }

    case "upgrade": {
      const skill = pet.skills.find((s) => s.skill_key === skill_key);
      if (!skill || !skillDef) return NextResponse.json({ error: "Skill not found" }, { status: 400 });

      if (skill.level >= skillDef.maxLevel) {
        return NextResponse.json({ error: "Already max level" }, { status: 400 });
      }

      try {
        const result = await upgradeSkill({
          userId: user.id,
          petId: pet.id,
          skillKey: skill.skill_key,
          expectedLevel: skill.level,
          maxLevel: skillDef.maxLevel,
          rarity: skillDef.rarity,
        });
        return NextResponse.json({
          upgraded: skill_key,
          new_level: result.newLevel,
          credits_spent: result.creditsSpent,
          credits_remaining: result.creditsRemaining,
        });
      } catch (error) {
        if (error instanceof SkillUpgradeConflictError) {
          return NextResponse.json({ error: error.message }, { status: 409 });
        }
        if (error instanceof SkillAlreadyMaxLevelError) {
          return NextResponse.json({ error: error.message }, { status: 409 });
        }
        if (error instanceof SkillUpgradeInsufficientCreditsError) {
          return NextResponse.json(
            { error: error.message, required: error.required, available: error.available },
            { status: 400 },
          );
        }
        if (error instanceof SkillUpgradeUnavailableError) {
          return NextResponse.json({ error: error.message }, { status: 404 });
        }
        throw error;
      }
    }

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}

// ── Helpers ──

function findEmptySlot(skills: { slot: number | null }[]): number | null {
  const occupied = new Set(skills.filter((s) => s.slot !== null).map((s) => s.slot));
  for (let i = 0; i < MAX_SKILL_SLOTS; i++) {
    if (!occupied.has(i)) return i;
  }
  return null;
}

function getAvailableForPet(pet: { level: number; element: string; skills: { skill_key: string }[] }) {
  const learned = new Set(pet.skills.map((s) => s.skill_key));
  return SKILL_DB.filter(
    (s) =>
      !learned.has(s.key) &&
      s.levelReq <= pet.level &&
      (s.element === pet.element || s.element === "normal")
  ).map((s) => ({ ...s }));
}

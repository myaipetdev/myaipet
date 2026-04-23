import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { awardPoints } from "@/lib/airdrop";
import { SKILL_DB, DAILY_BATTLE_CAP, DAILY_EXP_CAP, getGrowthMultiplier } from "@/lib/skills";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pet_id, opponent_id, opponent_name, won, turns, hp_left } = await req.json();

  const pet = await prisma.pet.findFirst({
    where: { id: pet_id, user_id: user.id },
  });
  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  // ── Daily training cap check ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailyLog = await prisma.dailyTrainingLog.upsert({
    where: { user_id_pet_id_date: { user_id: user.id, pet_id, date: today } },
    create: { user_id: user.id, pet_id, date: today, battles: 0, exp_earned: 0, credits_spent: 0 },
    update: {},
  });

  if (dailyLog.battles >= DAILY_BATTLE_CAP) {
    return NextResponse.json({
      error: "Daily battle cap reached",
      daily_battles: dailyLog.battles,
      cap: DAILY_BATTLE_CAP,
    }, { status: 429 });
  }

  // ── Calculate rewards with growth multiplier (based on USDT purchases, not shop spending) ──
  const totalUsdSpent = await prisma.creditPurchase.aggregate({
    where: { user_id: user.id, status: "confirmed" },
    _sum: { amount_usd: true },
  });
  const growthMul = getGrowthMultiplier(totalUsdSpent._sum.amount_usd || 0);

  const baseExp = won ? 30 : 12;
  const expGain = Math.min(
    Math.floor(baseExp * growthMul),
    Math.max(0, DAILY_EXP_CAP - dailyLog.exp_earned)
  );
  const airdropIncrement = won ? 35 : 10;

  // ── Rare skill drop on win (5% chance) ──
  let skillDrop: string | null = null;
  if (won && Math.random() < 0.05) {
    const petSkills = await prisma.petSkill.findMany({ where: { pet_id } });
    const learnedKeys = new Set(petSkills.map((s) => s.skill_key));
    const droppable = SKILL_DB.filter(
      (s) =>
        !learnedKeys.has(s.key) &&
        s.levelReq <= pet.level &&
        (s.element === pet.element || s.element === "normal") &&
        s.rarity >= 2
    );
    if (droppable.length > 0) {
      const drop = droppable[Math.floor(Math.random() * droppable.length)];
      skillDrop = drop.key;
      await prisma.petSkill.create({
        data: { pet_id, skill_key: drop.key, level: 1, slot: null },
      });
    }
  }

  // ── Apply exp + level up ──
  const newExp = pet.experience + expGain;
  const expNeeded = pet.level * 100;
  const leveledUp = newExp >= expNeeded;

  const petUpdateData = leveledUp
    ? {
        experience: { set: newExp - expNeeded },
        level: { increment: 1 },
        total_interactions: { increment: 1 },
      }
    : {
        experience: { increment: expGain },
        total_interactions: { increment: 1 },
      };

  await prisma.$transaction([
    prisma.pet.update({
      where: { id: pet.id },
      data: petUpdateData,
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { airdrop_points: { increment: airdropIncrement } },
    }),
    prisma.dailyTrainingLog.update({
      where: { id: dailyLog.id },
      data: {
        battles: { increment: 1 },
        exp_earned: { increment: expGain },
      },
    }),
    prisma.battleHistory.create({
      data: {
        player_pet_id: pet_id,
        opponent_pet_id: opponent_id || null,
        opponent_name: opponent_name || "Unknown",
        won,
        turns: turns || 0,
        player_hp_left: hp_left || 0,
        exp_gained: expGain,
        points_earned: airdropIncrement,
        skill_drop_key: skillDrop,
      },
    }),
  ]);

  if (leveledUp) {
    await awardPoints(user.id, pet.id, "level_up");
  }

  return NextResponse.json({
    points_earned: airdropIncrement,
    exp_gained: expGain,
    growth_multiplier: growthMul,
    leveled_up: leveledUp,
    new_level: leveledUp ? pet.level + 1 : pet.level,
    skill_drop: skillDrop,
    daily_battles: dailyLog.battles + 1,
    daily_battle_cap: DAILY_BATTLE_CAP,
    message: won ? "Victory! Great battle!" : "Defeat... Train harder!",
  });
  } catch (error) {
    console.error("Arena result error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

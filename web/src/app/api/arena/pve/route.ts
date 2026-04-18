import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { awardPoints } from "@/lib/airdrop";
import { SKILL_DB, SKILL_MAP, DAILY_BATTLE_CAP, DAILY_EXP_CAP, getGrowthMultiplier } from "@/lib/skills";
import { PVE_STAGES, REGIONS, getStage, getRegionForStage, generateMinion, calculateStars, getStageMinLevel } from "@/lib/pve";
import { NextRequest, NextResponse } from "next/server";

// GET /api/arena/pve?pet_id=X — Get PvE progress map + current stage info
export async function GET(req: NextRequest) {
  try {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const petId = Number(req.nextUrl.searchParams.get("pet_id"));

  // Get all cleared stages for this user (any pet)
  const progress = await prisma.pveProgress.findMany({
    where: { user_id: user.id, ...(petId ? { pet_id: petId } : {}) },
    orderBy: { stage_id: "asc" },
  });

  const clearedStages = progress.filter((p) => p.stars > 0).map((p) => p.stage_id);
  const maxCleared = clearedStages.length > 0 ? Math.max(...clearedStages) : 0;
  const currentStage = Math.min(maxCleared + 1, 30);

  // Build region map with stage status
  const regionMap = REGIONS.map((region) => ({
    ...region,
    stages: region.stages.map((stageId) => {
      const stage = getStage(stageId)!;
      const prog = progress.find((p) => p.stage_id === stageId);
      return {
        id: stageId,
        name: stage.name,
        emoji: stage.emoji,
        title: stage.title,
        element: stage.element,
        level: stage.level,
        isBoss: stage.isBoss,
        minLevel: getStageMinLevel(stageId),
        unlocked: stageId <= currentStage,
        stars: prog?.stars || 0,
        bestTurns: prog?.best_turns || null,
        bestHpLeft: prog?.best_hp_left || null,
      };
    }),
  }));

  return NextResponse.json({
    regions: regionMap,
    currentStage,
    maxCleared,
    totalStars: progress.reduce((s, p) => s + p.stars, 0),
    maxStars: 30 * 3,
  });
  } catch (error) {
    console.error("PvE GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/arena/pve — Report PvE battle result
export async function POST(req: NextRequest) {
  try {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pet_id, stage_id, won, turns, hp_left, max_hp } = await req.json();

  if (!pet_id || !stage_id) {
    return NextResponse.json({ error: "pet_id and stage_id required" }, { status: 400 });
  }

  const pet = await prisma.pet.findFirst({
    where: { id: pet_id, user_id: user.id },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const stage = getStage(stage_id);
  if (!stage) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });

  // Check stage is unlocked
  const progress = await prisma.pveProgress.findMany({
    where: { user_id: user.id },
  });
  const clearedStages = progress.filter((p) => p.stars > 0).map((p) => p.stage_id);
  const maxCleared = clearedStages.length > 0 ? Math.max(...clearedStages) : 0;
  if (stage_id > maxCleared + 1) {
    return NextResponse.json({ error: "Stage locked. Clear previous stage first." }, { status: 400 });
  }

  // Level check
  if (pet.level < getStageMinLevel(stage_id)) {
    return NextResponse.json({ error: `Pet must be at least Lv.${getStageMinLevel(stage_id)}` }, { status: 400 });
  }

  // Daily cap check
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyLog = await prisma.dailyTrainingLog.upsert({
    where: { user_id_pet_id_date: { user_id: user.id, pet_id, date: today } },
    create: { user_id: user.id, pet_id, date: today },
    update: {},
  });

  if (dailyLog.battles >= DAILY_BATTLE_CAP) {
    return NextResponse.json({ error: "Daily battle cap reached", cap: DAILY_BATTLE_CAP }, { status: 429 });
  }

  // Calculate stars
  const hpRatio = max_hp > 0 ? (hp_left || 0) / max_hp : 0;
  const stars = calculateStars(won, hpRatio, turns || 99);

  // Calculate rewards
  const growthMul = getGrowthMultiplier(0); // TODO: pass real spend
  const baseExp = won ? stage.rewards.exp : Math.floor(stage.rewards.exp * 0.3);
  const expGain = Math.min(
    Math.floor(baseExp * growthMul),
    Math.max(0, DAILY_EXP_CAP - dailyLog.exp_earned)
  );
  const creditsGain = won ? stage.rewards.credits : 0;
  const airdropGain = won ? stage.rewards.airdropPoints : Math.floor(stage.rewards.airdropPoints * 0.2);

  // First clear skill drop
  let skillDrop: string | null = null;
  const existingProgress = progress.find((p) => p.stage_id === stage_id && p.pet_id === pet_id);
  const isFirstClear = won && (!existingProgress || existingProgress.stars === 0);

  if (isFirstClear && stage.rewards.skillDrop) {
    const petSkills = await prisma.petSkill.findMany({ where: { pet_id } });
    const alreadyLearned = petSkills.some((s) => s.skill_key === stage.rewards.skillDrop);
    if (!alreadyLearned) {
      skillDrop = stage.rewards.skillDrop;
      await prisma.petSkill.create({
        data: { pet_id, skill_key: skillDrop, level: 1, slot: null },
      });
    }
  } else if (won && stage.rewards.skillDropChance && Math.random() < stage.rewards.skillDropChance) {
    // Repeat clear has a chance for random skill drop
    const petSkills = await prisma.petSkill.findMany({ where: { pet_id } });
    const learnedKeys = new Set(petSkills.map((s) => s.skill_key));
    const droppable = SKILL_DB.filter(
      (s) => !learnedKeys.has(s.key) && s.levelReq <= pet.level && s.rarity >= 2
    );
    if (droppable.length > 0) {
      const drop = droppable[Math.floor(Math.random() * droppable.length)];
      skillDrop = drop.key;
      await prisma.petSkill.create({
        data: { pet_id, skill_key: drop.key, level: 1, slot: null },
      });
    }
  }

  // Apply exp + level up
  const newExp = pet.experience + expGain;
  const expNeeded = pet.level * 100;
  const leveledUp = newExp >= expNeeded;

  // Save everything in transaction
  await prisma.$transaction([
    // Update pet
    prisma.pet.update({
      where: { id: pet.id },
      data: leveledUp
        ? { experience: { set: newExp - expNeeded }, level: { increment: 1 }, total_interactions: { increment: 1 } }
        : { experience: { increment: expGain }, total_interactions: { increment: 1 } },
    }),
    // Credits + airdrop
    prisma.user.update({
      where: { id: user.id },
      data: {
        credits: { increment: creditsGain },
        airdrop_points: { increment: airdropGain },
      },
    }),
    // Daily training log
    prisma.dailyTrainingLog.update({
      where: { id: dailyLog.id },
      data: { battles: { increment: 1 }, exp_earned: { increment: expGain } },
    }),
    // PvE progress (upsert)
    prisma.pveProgress.upsert({
      where: { user_id_pet_id_stage_id: { user_id: user.id, pet_id, stage_id } },
      create: {
        user_id: user.id, pet_id, stage_id,
        stars,
        best_turns: turns || null,
        best_hp_left: hp_left || null,
        ...(won ? { cleared_at: new Date() } : {}),
      },
      update: {
        // Only update if better
        ...(stars > (existingProgress?.stars || 0) ? { stars } : {}),
        ...(turns && (!existingProgress?.best_turns || turns < existingProgress.best_turns) ? { best_turns: turns } : {}),
        ...(hp_left && (!existingProgress?.best_hp_left || hp_left > existingProgress.best_hp_left) ? { best_hp_left: hp_left } : {}),
        ...(won && !existingProgress?.cleared_at ? { cleared_at: new Date() } : {}),
      },
    }),
    // Battle history
    prisma.battleHistory.create({
      data: {
        player_pet_id: pet_id,
        opponent_name: stage.name,
        won,
        turns: turns || 0,
        player_hp_left: hp_left || 0,
        exp_gained: expGain,
        points_earned: airdropGain,
        skill_drop_key: skillDrop,
        battle_type: "pve",
        stage_id,
      },
    }),
  ]);

  if (leveledUp) {
    await awardPoints(user.id, pet.id, "level_up");
  }

  return NextResponse.json({
    won,
    stars,
    exp_gained: expGain,
    credits_gained: creditsGain,
    airdrop_gained: airdropGain,
    leveled_up: leveledUp,
    new_level: leveledUp ? pet.level + 1 : pet.level,
    skill_drop: skillDrop,
    first_clear: isFirstClear,
    boss_dialogue: won ? stage.dialogue.win : stage.dialogue.lose,
    daily_battles: dailyLog.battles + 1,
  });
  } catch (error) {
    console.error("PvE POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

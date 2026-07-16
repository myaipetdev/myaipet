import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { awardPoints } from "@/lib/seasonRewards";
import { grantEarnedCredits, arenaCreditDailyCap } from "@/lib/economyGuards";
import { SKILL_DB, SKILL_MAP, DAILY_BATTLE_CAP, DAILY_EXP_CAP, getGrowthMultiplier } from "@/lib/skills";
import { PVE_STAGES, REGIONS, getStage, getRegionForStage, generateMinion, calculateStars, getStageMinLevel } from "@/lib/pve";
import { simulateBattle } from "@/lib/battleSim";
import crypto from "crypto";
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

  // audit C5: the PvE outcome is decided server-side from the pet's real stats
  // vs the stage boss — the client no longer reports won/turns/hp_left/max_hp.
  const { pet_id, stage_id } = await req.json();

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

  // ── Resolve the stage SERVER-SIDE (audit C5) ──
  // Boss combat stats come from the stage definition (incl. its tuned baseHp).
  const sim = simulateBattle(
    { atk: pet.atk, def: pet.def, spd: pet.spd, level: pet.level },
    {
      atk: stage.baseAtk,
      def: stage.baseDef,
      spd: stage.baseSpd,
      level: stage.level,
      name: stage.name,
      hpMax: stage.baseHp,
    },
    crypto.randomBytes(16).toString("hex"),
  );
  const won = sim.won;
  const turns = sim.turns;
  const hp_left = sim.player_hp_left;
  const max_hp = sim.player_hp_max;

  // Calculate stars
  const hpRatio = max_hp > 0 ? (hp_left || 0) / max_hp : 0;
  const stars = calculateStars(won, hpRatio, turns || 99);

  // Calculate rewards (growth multiplier based on USDT purchases)
  const totalUsdSpent = await prisma.creditPurchase.aggregate({
    where: { user_id: user.id, status: "confirmed" },
    _sum: { amount_usd: true },
  });
  const growthMul = getGrowthMultiplier(totalUsdSpent._sum.amount_usd || 0);
  const baseExp = won ? stage.rewards.exp : Math.floor(stage.rewards.exp * 0.3);
  const expGain = Math.min(
    Math.floor(baseExp * growthMul),
    Math.max(0, DAILY_EXP_CAP - dailyLog.exp_earned)
  );
  // POINTS-ECONOMY §2.2 knob #1 (the P0): arena credits are FIRST-CLEAR only and
  // routed through the capped earned-credit helper (credits:arena ≤50/day + the
  // global credits:earned ≤100/day). Replays still grant exp/season points but
  // NO credits, killing the ≤6,000 cr/day replay-farm ($36/day/user vendor burn).
  // Granted AFTER the transaction (the helper runs its own atomic tx).
  let creditsGain = 0;
  const seasonGain = won ? stage.rewards.seasonPoints : Math.floor(stage.rewards.seasonPoints * 0.2);

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
    // Season points only — arena credits are granted separately (first-clear +
    // capped) via grantEarnedCredits after this transaction.
    prisma.user.update({
      where: { id: user.id },
      data: {
        season_points: { increment: seasonGain },
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
        points_earned: seasonGain,
        skill_drop_key: skillDrop,
        battle_type: "pve",
        stage_id,
      },
    }),
  ]);

  // Arena credits: first clear only, capped (credits:arena ≤50/day + global
  // credits:earned ≤100/day). Never throws — a capped/errored grant yields 0.
  if (isFirstClear && stage.rewards.credits > 0) {
    const g = await grantEarnedCredits(user.id, "arena", stage.rewards.credits, arenaCreditDailyCap());
    creditsGain = g.granted;
  }

  if (leveledUp) {
    await awardPoints(user.id, pet.id, "level_up");
  }

  return NextResponse.json({
    // Server-decided outcome (audit C5) — client renders this, not its own.
    battle: {
      won,
      turns,
      player_hp_left: sim.player_hp_left,
      player_hp_max: sim.player_hp_max,
      opponent_hp_left: sim.opponent_hp_left,
      opponent_hp_max: sim.opponent_hp_max,
      log: sim.log,
    },
    won,
    stars,
    exp_gained: expGain,
    credits_gained: creditsGain,
    season_gained: seasonGain,
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

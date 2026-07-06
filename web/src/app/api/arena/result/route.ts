import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { SKILL_DB, DAILY_BATTLE_CAP, DAILY_EXP_CAP, getGrowthMultiplier } from "@/lib/skills";
import { simulateBattle } from "@/lib/battleSim";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // audit C4: the battle OUTCOME is decided server-side from real pet stats —
  // the client no longer reports won/turns/hp_left (it only names the opponent).
  const { pet_id, opponent_id, opponent_name } = await req.json();

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

  // ── Resolve the battle SERVER-SIDE (audit C4) ──
  // Look up the real opponent's combat stats; if none was supplied or it no
  // longer exists, synthesise a wild NPC of comparable power (same as
  // /api/battle/create). The outcome is then derived from a deterministic
  // simulation over real stats — never from the client.
  let opp: { atk: number; def: number; spd: number; level: number; name: string };
  const oppPet = opponent_id
    ? await prisma.pet.findFirst({
        where: { id: Number(opponent_id), is_active: true },
        select: { atk: true, def: true, spd: true, level: true, name: true },
      })
    : null;
  if (oppPet) {
    opp = oppPet;
  } else {
    opp = {
      atk: Math.max(5, pet.atk - 2 + Math.floor(Math.random() * 5)),
      def: Math.max(5, pet.def - 2 + Math.floor(Math.random() * 5)),
      spd: Math.max(5, pet.spd - 2 + Math.floor(Math.random() * 5)),
      level: pet.level,
      name: opponent_name || "Wild Challenger",
    };
  }

  const sim = simulateBattle(
    { atk: pet.atk, def: pet.def, spd: pet.spd, level: pet.level },
    opp,
    crypto.randomBytes(16).toString("hex"),
  );
  const won = sim.won;
  const turns = sim.turns;
  const hp_left = sim.player_hp_left;

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
      data: { season_points: { increment: airdropIncrement } },
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
    // COMPLIANCE: arena EXP is scaled by getGrowthMultiplier(USDT spent), so a
    // level-up here can be spend-accelerated. Recognition points must not derive
    // from paid actions ("never bought") — credit the NON-RANKING lifetime
    // ledger instead of season_points.
    await prisma.user.update({
      where: { id: user.id },
      data: { total_points_earned: { increment: 50 } },
    }).catch(() => {});
  }

  return NextResponse.json({
    // Server-decided battle outcome (audit C4) — client renders this, not its own.
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

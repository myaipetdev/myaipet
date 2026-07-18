import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { SKILL_DB, DAILY_BATTLE_CAP, DAILY_EXP_CAP, getGrowthMultiplier } from "@/lib/skills";
import { simulateBattle } from "@/lib/battleSim";
import {
  claimArenaBattle,
  recordArenaLevelUpRecognition,
  ArenaDailyBattleCapError,
  ArenaClaimPetNotFoundError,
} from "@/lib/arenaBattleClaim";
import { rateLimit } from "@/lib/rateLimit";
import { consumeArenaMatchChallenge, InvalidArenaMatchChallengeError } from "@/lib/arenaMatchChallenge";
import { interactablePetWhere } from "@/lib/publicPet";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";

export async function POST(req: NextRequest) {
  try {
  const rl = rateLimit(req, { key: "arena-battle-reward", limit: 40, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The result is accepted only for the exact server-issued player/opponent
  // pair. Client battle outcomes and opponent names are never authoritative.
  const { pet_id, opponent_id, match_challenge } = await req.json();
  const petId = Number(pet_id);
  const opponentId = Number(opponent_id);
  if (
    !Number.isSafeInteger(petId) ||
    !Number.isSafeInteger(opponentId) ||
    typeof match_challenge !== "string"
  ) {
    return NextResponse.json({ error: "A valid Arena match challenge is required" }, { status: 400 });
  }

  const pet = await prisma.pet.findFirst({
    where: { id: petId, user_id: user.id, is_active: true },
    select: { id: true },
  });
  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  // ── Shared day key for the atomic daily claim ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Calculate rewards with growth multiplier (based on USDT purchases, not shop spending) ──
  const totalUsdSpent = await prisma.creditPurchase.aggregate({
    where: { user_id: user.id, status: "confirmed" },
    _sum: { amount_usd: true },
  });
  const growthMul = getGrowthMultiplier(totalUsdSpent._sum.amount_usd || 0);

  const reward = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Consume first. A concurrent replay blocks on this row and then updates
    // zero rows; because this is the reward transaction, any later failure
    // rolls the consume back as well.
    const match = await consumeArenaMatchChallenge(tx, {
      token: match_challenge,
      userId: user.id,
      playerPetId: petId,
      opponentPetId: opponentId,
    });

    const currentPet = await tx.pet.findFirst({
      where: { id: petId, user_id: user.id, is_active: true },
      select: { id: true, atk: true, def: true, spd: true, level: true },
    });
    if (!currentPet) throw new ArenaClaimPetNotFoundError();

    // Consent, other-user ownership and the ±3 current-level band are checked
    // again at consume time. A pet made private after matchmaking cannot pay.
    const opponentPet = await tx.pet.findFirst({
      where: interactablePetWhere({
        id: match.opponent_pet_id,
        user_id: { not: user.id },
        level: {
          gte: Math.max(1, currentPet.level - 3),
          lte: currentPet.level + 3,
        },
      }),
      select: { id: true, atk: true, def: true, spd: true, level: true, name: true },
    });
    if (!opponentPet || opponentPet.id === currentPet.id) {
      throw new InvalidArenaMatchChallengeError();
    }

    const sim = simulateBattle(
      { atk: currentPet.atk, def: currentPet.def, spd: currentPet.spd, level: currentPet.level },
      opponentPet,
      crypto.randomBytes(16).toString("hex"),
    );
    const won = sim.won;
    const turns = sim.turns;
    const hpLeft = sim.player_hp_left;
    const baseExp = won ? 30 : 12;
    const requestedExp = Math.min(Math.floor(baseExp * growthMul), DAILY_EXP_CAP);
    const airdropIncrement = won ? 35 : 10;

    const claim = await claimArenaBattle(tx, {
      userId: user.id,
      petId: pet.id,
      date: today,
      requestedExp,
    });

    // Every reward runs only after the locked daily claim succeeds. Keeping the
    // skill read/create under the pet lock also makes its unique grant stable.
    let skillDrop: string | null = null;
    if (won && Math.random() < 0.05) {
      const petSkills = await tx.petSkill.findMany({ where: { pet_id: petId } });
      const learnedKeys = new Set(petSkills.map((s) => s.skill_key));
      const droppable = SKILL_DB.filter(
        (s) =>
          !learnedKeys.has(s.key) &&
          s.levelReq <= claim.pet.level &&
          (s.element === claim.pet.element || s.element === "normal") &&
          s.rarity >= 2,
      );
      if (droppable.length > 0) {
        skillDrop = droppable[Math.floor(Math.random() * droppable.length)].key;
        await tx.petSkill.create({
          data: { pet_id: petId, skill_key: skillDrop, level: 1, slot: null },
        });
      }
    }

    await tx.user.update({
      where: { id: user.id },
      data: { season_points: { increment: airdropIncrement } },
    });
    await recordArenaLevelUpRecognition(tx, user.id, claim.leveledUp);
    await tx.battleHistory.create({
      data: {
        player_pet_id: petId,
        opponent_pet_id: opponentPet.id,
        opponent_name: opponentPet.name.slice(0, 50),
        won,
        turns: turns || 0,
        player_hp_left: hpLeft || 0,
        exp_gained: claim.expGain,
        points_earned: airdropIncrement,
        skill_drop_key: skillDrop,
        battle_type: "pvp",
      },
    });

    return { ...claim, skillDrop, sim, won, airdropIncrement };
  }, { maxWait: 10_000, timeout: 20_000 });

  return NextResponse.json({
    // Server-decided battle outcome (audit C4) — client renders this, not its own.
    battle: {
      won: reward.won,
      turns: reward.sim.turns,
      player_hp_left: reward.sim.player_hp_left,
      player_hp_max: reward.sim.player_hp_max,
      opponent_hp_left: reward.sim.opponent_hp_left,
      opponent_hp_max: reward.sim.opponent_hp_max,
      log: reward.sim.log,
    },
    won: reward.won,
    points_earned: reward.airdropIncrement,
    exp_gained: reward.expGain,
    growth_multiplier: growthMul,
    leveled_up: reward.leveledUp,
    new_level: reward.newLevel,
    skill_drop: reward.skillDrop,
    daily_battles: reward.dailyBattles,
    daily_battle_cap: DAILY_BATTLE_CAP,
    message: reward.won ? "Victory! Great battle!" : "Defeat... Train harder!",
  });
  } catch (error) {
    if (error instanceof InvalidArenaMatchChallengeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ArenaDailyBattleCapError) {
      return NextResponse.json({
        error: error.message,
        daily_battles: error.battles,
        cap: error.cap,
      }, { status: 429 });
    }
    if (error instanceof ArenaClaimPetNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Arena result error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

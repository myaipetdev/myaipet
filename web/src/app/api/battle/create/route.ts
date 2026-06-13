/**
 * Pet Battle League — paid entry, deterministic resolution.
 *
 *   POST /api/battle/create?tx_hash=0x...
 *   { petId: 1, opponentPetId?: 7 }   // opponentPetId optional → auto-match
 *
 * Flow:
 *   1. Caller's pet must be active. Entry fee 0.5 USDT via paywall (battle_entry).
 *   2. If no opponentPetId: auto-match against a similar-power active pet that
 *      itself paid entry within the same 1h window.
 *   3. Deterministic resolution: power + small randomness from a seed = block hash
 *      of payment tx (verifiable).
 *   4. Winner gets EXP + entry_fee * 1.7 credited as airdrop points (cash payout
 *      lands at week-end via the weekly distribution cron).
 *   5. Battle goes into battle_history with tx_hash.
 *
 * Match queue: in-memory not enough — use battle_history with `won = NULL` as queue.
 * Currently MVP: synchronous resolution. If no opponent available → returns
 * "queued" status and a placeholder battle stub the front-end can poll.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { enforcePaywall } from "@/lib/paywall";
import { awardPoints } from "@/lib/airdrop";
import crypto from "crypto";

const ENTRY_FEE_USD = 0.50;
const WINNER_POINTS_BASE = 100;       // base points for winning
const POWER_RANGE_PCT = 0.3;           // auto-match within ±30% combined power

interface BattleResult {
  battleId: number;
  won: boolean;
  turns: number;
  player_hp_left: number;
  player_hp_max: number;
  opponent_hp_left: number;
  opponent_hp_max: number;
  opponent_name: string;
  opponent_petId: number | null;
  exp_gained: number;
  points_earned: number;
  log: BattleLogEntry[];
  seed: string;
  txHash?: string;
}

/** Deterministic 0..1 PRNG from a seed string (used for combat randomness). */
function seededRng(seed: string): () => number {
  const h = crypto.createHash("sha256").update(seed).digest();
  let state = h.readUInt32LE(0);
  return () => {
    // xorshift32
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

// Surface crit/miss in the log so the UI can highlight them. Crit = top 5% of
// damage range (the 0.7..1.3 multiplier ≥ 1.28). Miss = bottom 5% (< 0.72).
interface BattleLogEntry {
  turn: number;
  actor: "you" | "them";
  dmg: number;
  their_hp: number;
  your_hp: number;
  crit?: boolean;
  miss?: boolean;
}

interface SimulationResult {
  won: boolean;
  turns: number;
  player_hp_left: number;
  opponent_hp_left: number;
  player_hp_max: number;
  opponent_hp_max: number;
  log: BattleLogEntry[];
}

function simulateBattle(
  player: { atk: number; def: number; spd: number; level: number },
  opponent: { atk: number; def: number; spd: number; level: number; name: string },
  seed: string,
): SimulationResult {
  const rng = seededRng(seed);
  const playerHpMax = 50 + player.def * 2 + player.level * 5;
  const opponentHpMax = 50 + opponent.def * 2 + opponent.level * 5;
  let playerHp = playerHpMax;
  let opponentHp = opponentHpMax;
  const log: BattleLogEntry[] = [];
  let turn = 0;
  const playerFirst = player.spd >= opponent.spd;

  while (playerHp > 0 && opponentHp > 0 && turn < 50) {
    turn++;
    const actor: "you" | "them" = (playerFirst ? turn % 2 === 1 : turn % 2 === 0) ? "you" : "them";
    const rngRoll = rng();
    const multiplier = 0.7 + rngRoll * 0.6;   // 0.7..1.3
    const crit = rngRoll > 0.95;
    const miss = rngRoll < 0.05;
    if (actor === "you") {
      const raw = player.atk - opponent.def * 0.5;
      const dmg = miss ? 0 : Math.max(1, Math.round(raw * (crit ? 1.6 : multiplier)));
      opponentHp = Math.max(0, opponentHp - dmg);
      log.push({ turn, actor, dmg, their_hp: opponentHp, your_hp: playerHp, ...(crit && { crit: true }), ...(miss && { miss: true }) });
    } else {
      const raw = opponent.atk - player.def * 0.5;
      const dmg = miss ? 0 : Math.max(1, Math.round(raw * (crit ? 1.6 : multiplier)));
      playerHp = Math.max(0, playerHp - dmg);
      log.push({ turn, actor, dmg, their_hp: opponentHp, your_hp: playerHp, ...(crit && { crit: true }), ...(miss && { miss: true }) });
    }
  }

  return {
    won: opponentHp <= 0 && playerHp > 0,
    turns: turn,
    player_hp_left: playerHp,
    opponent_hp_left: opponentHp,
    player_hp_max: playerHpMax,
    opponent_hp_max: opponentHpMax,
    log,
  };
}

// Battle mode is retired/paused — flip to true (and re-test) to relaunch.
const BATTLE_ENABLED = false;

export async function POST(req: NextRequest) {
  // Disabled server-side so a paid 'battle_entry' can never be created while the
  // feature is off (UI entry points are already removed).
  if (!BATTLE_ENABLED) {
    return NextResponse.json(
      { error: "Battle mode is currently unavailable.", code: "BATTLE_DISABLED" },
      { status: 410 },
    );
  }

  const rl = rateLimit(req, { key: "battle-create", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { petId, opponentPetId } = body;
  if (!petId) return NextResponse.json({ error: "petId required" }, { status: 400 });

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  // Paywall — battle entry has 1 free per day, paid after
  const txHash = req.nextUrl.searchParams.get("tx_hash") || undefined;
  const gate = await enforcePaywall(user.id, "battle_entry", txHash, pet.id);
  if (gate.ok !== true) {
    return NextResponse.json({ error: "Payment required", paywall: gate.paywall }, { status: 402 });
  }

  // ── Find opponent ──
  let opponent;
  if (opponentPetId) {
    opponent = await prisma.pet.findFirst({
      where: { id: Number(opponentPetId), is_active: true, NOT: { user_id: user.id } },
    });
    if (!opponent) return NextResponse.json({ error: "Opponent not available" }, { status: 404 });
  } else {
    const myPower = pet.atk + pet.def + pet.spd;
    const minPow = Math.floor(myPower * (1 - POWER_RANGE_PCT));
    const maxPow = Math.ceil(myPower * (1 + POWER_RANGE_PCT));
    // Find any active pet of another user within power range
    opponent = await prisma.$queryRaw<Array<any>>`
      SELECT * FROM pets
      WHERE is_active = true
        AND user_id != ${user.id}
        AND (atk + def + spd) BETWEEN ${minPow} AND ${maxPow}
      ORDER BY RANDOM()
      LIMIT 1
    `.then(arr => arr[0] || null);

    if (!opponent) {
      // No human opponent — synthesise a "wild" NPC with similar power
      opponent = {
        id: -1, name: `Wild ${["Slime", "Sprite", "Goblin", "Phantom"][Math.floor(Math.random() * 4)]}`,
        atk: Math.max(5, pet.atk - 2 + Math.floor(Math.random() * 5)),
        def: Math.max(5, pet.def - 2 + Math.floor(Math.random() * 5)),
        spd: Math.max(5, pet.spd - 2 + Math.floor(Math.random() * 5)),
        level: pet.level,
        _isNpc: true,
      };
    }
  }

  // ── Resolve battle ──
  const seed = txHash || `${pet.id}-${opponent.id}-${Date.now()}`;
  const result = simulateBattle(
    { atk: pet.atk, def: pet.def, spd: pet.spd, level: pet.level },
    { atk: opponent.atk, def: opponent.def, spd: opponent.spd, level: opponent.level, name: opponent.name },
    seed,
  );

  const expGained = result.won ? 30 + opponent.level * 2 : 5;
  const pointsEarned = result.won ? WINNER_POINTS_BASE : 5;

  // Persist battle history — including full log + snapshots so /battle/[id]
  // can replay even after pets get upgraded or deleted.
  const isNpc = (opponent as any)._isNpc || opponent.id === -1;
  const battle = await prisma.battleHistory.create({
    data: {
      player_pet_id: pet.id,
      opponent_pet_id: isNpc ? null : opponent.id,
      opponent_name: opponent.name.slice(0, 50),
      won: result.won,
      turns: result.turns,
      player_hp_left: result.player_hp_left,
      exp_gained: expGained,
      points_earned: pointsEarned,
      tx_hash: txHash,
      battle_type: isNpc ? "pve" : "pvp",
      battle_log: result.log as any,
      seed,
      player_hp_max: result.player_hp_max,
      opponent_hp_max: result.opponent_hp_max,
      player_avatar: pet.avatar_url || null,
      opponent_avatar: isNpc ? null : (opponent as any).avatar_url || null,
    },
  });

  // Apply XP + airdrop points
  await prisma.pet.update({
    where: { id: pet.id },
    data: { experience: { increment: expGained }, last_interaction_at: new Date() },
  });
  if (result.won) await awardPoints(user.id, pet.id, "battle_win" as any);

  return NextResponse.json({
    ok: true,
    result: {
      battleId: battle.id,
      won: result.won,
      turns: result.turns,
      player_hp_left: result.player_hp_left,
      player_hp_max: result.player_hp_max,
      opponent_hp_left: result.opponent_hp_left,
      opponent_hp_max: result.opponent_hp_max,
      opponent_name: opponent.name,
      opponent_petId: isNpc ? null : opponent.id,
      exp_gained: expGained,
      points_earned: pointsEarned,
      log: result.log,
      seed,
      txHash,
    } satisfies BattleResult,
  });
}

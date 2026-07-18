/**
 * Public read-only battle replay endpoint.
 *
 *   GET /api/battle/[battleId]
 *     → returns full snapshot for replay: stats, log, hp_max, seed, tx_hash
 *
 * No auth required — battles are public artifacts (sharable URLs), the same
 * way leaderboard entries are. Owner info is reduced to a wallet prefix.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { publicPetWhere } from "@/lib/publicPet";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ battleId: string }> }
) {
  const rl = rateLimit(req, { key: "battle-read", limit: 120, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { battleId } = await params;
  const id = Number(battleId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid battleId" }, { status: 400 });
  }

  const battle = await prisma.battleHistory.findUnique({
    where: { id },
  });
  if (!battle) return NextResponse.json({ error: "Battle not found" }, { status: 404 });

  // Look up player pet (still active or not — we keep the avatar snapshot anyway)
  const playerPet = await prisma.pet.findFirst({
    where: publicPetWhere({ id: battle.player_pet_id }),
    include: { user: { select: { wallet_address: true } } },
  });

  const opponentPet = battle.opponent_pet_id ? await prisma.pet.findFirst({
    where: publicPetWhere({ id: battle.opponent_pet_id }),
    include: { user: { select: { wallet_address: true } } },
  }) : null;

  if (!playerPet || (battle.opponent_pet_id && !opponentPet)) {
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }
  // Human-opponent links are detached on pet deletion. Never mistake that
  // tombstone for an NPC and fall back to immutable snapshot PII.
  const opponentRedacted = battle.battle_type === "pvp" && battle.opponent_pet_id == null;

  const shortWallet = (w?: string | null) =>
    w ? `${w.slice(0, 6)}…${w.slice(-4)}` : null;

  return NextResponse.json({
    battleId: battle.id,
    createdAt: battle.created_at,
    battleType: battle.battle_type,    // "pvp" | "pve"
    seed: opponentRedacted ? null : battle.seed,
    txHash: battle.tx_hash,
    won: battle.won,
    turns: battle.turns,
    expGained: battle.exp_gained,
    pointsEarned: battle.points_earned,
    player: {
      petId: battle.player_pet_id,
      name: playerPet?.name || "Pet",
      avatar: battle.player_avatar || playerPet?.avatar_url || null,
      level: playerPet?.level || 1,
      stats: playerPet ? { atk: playerPet.atk, def: playerPet.def, spd: playerPet.spd } : null,
      hpLeft: battle.player_hp_left,
      hpMax: battle.player_hp_max,
      ownerWallet: shortWallet(playerPet?.user?.wallet_address),
    },
    opponent: {
      petId: battle.opponent_pet_id,
      name: opponentRedacted ? "Deleted Pet" : battle.opponent_name,
      avatar: opponentRedacted ? null : battle.opponent_avatar || opponentPet?.avatar_url || null,
      level: opponentPet?.level || null,
      stats: opponentPet ? { atk: opponentPet.atk, def: opponentPet.def, spd: opponentPet.spd } : null,
      hpLeft: 0, // by definition; winner stayed >0, loser stayed ≤0
      hpMax: battle.opponent_hp_max,
      ownerWallet: shortWallet(opponentPet?.user?.wallet_address),
      isNpc: !opponentRedacted && battle.opponent_pet_id == null,
      redacted: opponentRedacted,
    },
    log: opponentRedacted ? [] : battle.battle_log || [],
  });
}

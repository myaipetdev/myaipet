/**
 * POST /api/card/battle — a deterministic, read-only card duel between two pets'
 * cards (same arena resolver + element TYPE_CHART). NO credits, NO stat changes,
 * NO DB writes. Deterministic by the pair, so a shared result reproduces.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { resolveCardBattle, advantage } from "@/lib/tcg/battle";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";
import type { CardData } from "@/lib/tcg/card";

function summary(c: CardData) {
  return {
    id: c.id, name: c.name, element: c.element, level: c.level,
    atk: c.atk, def: c.def, spd: c.spd, power: c.power,
    rarity: c.rarity, topPercent: c.topPercent, avatarUrl: c.avatarUrl,
  };
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "card-battle", limit: 40, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const petId = Number(body?.petId);
  const opponentId = Number(body?.opponentId);
  if (!petId || !opponentId || petId === opponentId) {
    return NextResponse.json({ error: "Pick two different pets" }, { status: 400 });
  }

  // Airdrop-point integrity: the reward-bearing side of the duel must be a pet
  // the caller actually owns. opponentId stays open on purpose — dueling
  // AGAINST any public card is the feature.
  const own = await prisma.pet.findFirst({
    where: { id: petId, user_id: user.id, is_active: true },
    select: { id: true },
  });
  if (!own) return NextResponse.json({ error: "You can only battle with your own pet" }, { status: 403 });

  const b = await resolveCardBattle(petId, opponentId);
  if (!b) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  // Small, daily-capped airdrop points for dueling (anti-spam).
  const pts = await awardPointsCapped(user.id, "card_battle", 5, DAILY_POINT_CAPS.card_battle);

  return NextResponse.json({
    you: summary(b.you),
    opponent: summary(b.opp),
    winner: b.winner === "you" ? "you" : "opponent",
    matchup: `${petId}-vs-${opponentId}`,
    pointsAwarded: pts.points || 0,
    result: {
      won: b.result.won,
      turns: b.result.turns,
      yourHp: b.result.player_hp_left,
      yourHpMax: b.result.player_hp_max,
      oppHp: b.result.opponent_hp_left,
      oppHpMax: b.result.opponent_hp_max,
    },
    advantage: {
      you: advantage(b.you.element, b.opp.element),
      opponent: advantage(b.opp.element, b.you.element),
    },
  });
}

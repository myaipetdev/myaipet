/**
 * POST /api/card/battle — a deterministic, read-only card duel.
 *
 * { petId, opponentId } → resolves a stat-based duel between two pets' cards
 * using the SAME server battle resolver as the arena (lib/battleSim) plus the
 * element TYPE_CHART. Purely cosmetic: NO credits, NO stat changes, NO DB writes
 * — it just compares two cards' real ATK/DEF/SPD/level/element and reports who
 * would win. Deterministic by the pair, so a shared result is reproducible.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { simulateBattle, type Combatant } from "@/lib/battleSim";
import { TYPE_CHART } from "@/lib/skills";
import { getCardData, type CardData } from "@/lib/tcg/card";

function advantage(attacker: string, defender: string): number {
  const row = (TYPE_CHART as Record<string, Record<string, number>>)[attacker];
  return (row && row[defender]) ?? 1;
}

function combatant(c: CardData, vsElement: string): Combatant {
  // Element advantage scales the attacker's ATK against the defender's element.
  return { atk: Math.round(c.atk * advantage(c.element, vsElement)), def: c.def, spd: c.spd, level: c.level, name: c.name };
}

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

  const [you, opp] = await Promise.all([getCardData(petId), getCardData(opponentId)]);
  if (!you || !opp) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  // Deterministic by the ordered pair so a shared duel reproduces the same log.
  const seed = `card-duel-${petId}-vs-${opponentId}`;
  const result = simulateBattle(combatant(you, opp.element), combatant(opp, you.element), seed);

  return NextResponse.json({
    you: summary(you),
    opponent: summary(opp),
    winner: result.won ? "you" : "opponent",
    result: {
      won: result.won,
      turns: result.turns,
      yourHp: result.player_hp_left,
      yourHpMax: result.player_hp_max,
      oppHp: result.opponent_hp_left,
      oppHpMax: result.opponent_hp_max,
    },
    advantage: {
      you: advantage(you.element, opp.element),
      opponent: advantage(opp.element, you.element),
    },
  });
}

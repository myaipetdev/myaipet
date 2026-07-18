/**
 * Shared, deterministic card-duel resolver — used by the battle API, the public
 * battle-result share page, and its OG image so they always agree. Reuses the
 * arena's simulateBattle + the element TYPE_CHART. Read-only (no DB writes).
 */
import { simulateBattle, type Combatant } from "@/lib/battleSim";
import { TYPE_CHART } from "@/lib/skills";
import { getCardData, type CardData } from "@/lib/tcg/card";

export function advantage(attacker: string, defender: string): number {
  const row = (TYPE_CHART as Record<string, Record<string, number>>)[attacker];
  return (row && row[defender]) ?? 1;
}

function combatant(c: CardData, vsElement: string): Combatant {
  return { atk: Math.round(c.atk * advantage(c.element, vsElement)), def: c.def, spd: c.spd, level: c.level, name: c.name };
}

export interface CardBattle {
  you: CardData;
  opp: CardData;
  winner: "you" | "opp";
  result: ReturnType<typeof simulateBattle>;
}

/** Resolve the duel for two pet ids. Deterministic by the ordered pair. Returns null if either card is missing. */
export async function resolveCardBattle(petId: number, opponentId: number, ownerUserId?: number): Promise<CardBattle | null> {
  if (!petId || !opponentId || petId === opponentId) return null;
  const [you, opp] = await Promise.all([getCardData(petId, ownerUserId), getCardData(opponentId)]);
  if (!you || !opp) return null;
  const seed = `card-duel-${petId}-vs-${opponentId}`;
  const result = simulateBattle(combatant(you, opp.element), combatant(opp, you.element), seed);
  return { you, opp, winner: result.won ? "you" : "opp", result };
}

/** Parse a "<a>-vs-<b>" matchup slug. */
export function parseMatchup(slug: string): { a: number; b: number } | null {
  const m = String(slug || "").match(/^(\d+)-vs-(\d+)$/);
  if (!m) return null;
  return { a: parseInt(m[1], 10), b: parseInt(m[2], 10) };
}

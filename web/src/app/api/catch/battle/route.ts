/**
 * /api/catch/battle — Alley Clash. Battle one of YOUR caught animals against a
 * platform "Practice" opponent (a generated alley stray — clearly NOT a real
 * user, so it's DD-safe). Free; small capped season points on a win.
 *
 * Reuses the deterministic combat sim (lib/battleSim) over the animal's real
 * atk/def/spd/hp. The opponent is scaled to the player for a fair, winnable
 * fight, seeded per (user, animal, day) so it's reproducible but rotates daily.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { simulateBattle, seededRng, type Combatant } from "@/lib/battleSim";
import { rarityMeta, kindIcon } from "@/lib/catch/game";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";

export const runtime = "nodejs";

const ALLEY_NAMES = ["Alley Boss Tom", "Scrapper", "Dumpster Duke", "Gutter King", "Smudge", "One-Eye", "Tatters", "Brick", "Snaggle", "Rumble", "Patches", "Mittens the Menace"];
const ALLEY_KINDS = ["cat", "cat", "dog", "dog", "fox", "rat", "squirrel"];

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "alley-battle", limit: 60, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const catId = Number(body?.catId);
  if (!catId) return NextResponse.json({ error: "catId required" }, { status: 400 });

  const cat = await prisma.caughtCat.findFirst({ where: { id: catId, owner_user_id: user.id } });
  if (!cat) return NextResponse.json({ error: "Animal not found in your collection" }, { status: 404 });

  const day = new Date().toISOString().slice(0, 10);
  const seed = `alley:${user.id}:${catId}:${day}`;
  const rng = seededRng(seed);
  const scale = 0.85 + rng() * 0.3; // 85–115% of the player → fair, usually winnable
  const oppName = ALLEY_NAMES[Math.floor(rng() * ALLEY_NAMES.length)];
  const oppKind = ALLEY_KINDS[Math.floor(rng() * ALLEY_KINDS.length)];
  const s = (n: number) => Math.max(1, Math.round(n * scale));

  const player: Combatant = { atk: cat.atk, def: cat.def, spd: cat.spd, level: cat.level, hpMax: cat.hp, name: cat.name };
  const opponent: Combatant = { atk: s(cat.atk), def: s(cat.def), spd: s(cat.spd), level: cat.level, hpMax: s(cat.hp), name: oppName };

  // Opponent identity/scale is stable per (user, animal, day) — but each
  // "Battle again" is a FRESH fight: per-attempt entropy on the combat rolls so
  // a win isn't a free farm and a loss isn't frozen for 24h.
  const sim = simulateBattle(player, opponent, `${seed}:${Date.now()}:${Math.random().toString(36).slice(2)}`);

  let pointsAwarded = 0;
  if (sim.won) {
    const pts = await awardPointsCapped(user.id, "alley_battle", 5, DAILY_POINT_CAPS.alley_battle);
    pointsAwarded = pts.points || 0;
  }

  const m = rarityMeta(cat.rarity);
  return NextResponse.json({
    won: sim.won,
    turns: sim.turns,
    pointsAwarded,
    you: { name: cat.name, kind: cat.kind, icon: kindIcon(cat.kind), rarityLabel: m.label, rarityColor: m.color, atk: cat.atk, def: cat.def, spd: cat.spd, hpLeft: sim.player_hp_left, hpMax: sim.player_hp_max },
    opponent: { name: oppName, kind: oppKind, icon: kindIcon(oppKind), atk: opponent.atk, def: opponent.def, spd: opponent.spd, hpLeft: sim.opponent_hp_left, hpMax: sim.opponent_hp_max },
    log: sim.log.slice(0, 24),
  });
}

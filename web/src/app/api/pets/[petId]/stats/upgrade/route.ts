/**
 * Pay-to-power stat upgrade.
 *
 *   POST /api/pets/[petId]/stats/upgrade?stat=atk&tx_hash=0x...
 *
 * stat ∈ {atk, def, spd}. Each upgrade costs 1 USDT (see ACTIONS in paywall.ts)
 * and bumps the stat by +5. Combined power (atk+def+spd) drives Dashboard ranking.
 *
 * Hard ceiling: 500 per stat (prevents whales from breaking the curve).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { enforcePaywall } from "@/lib/paywall";

const STAT_INCREMENT = 5;
const STAT_CEILING = 500;
const VALID_STATS = ["atk", "def", "spd"] as const;
type StatKey = (typeof VALID_STATS)[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const rl = rateLimit(req, { key: "stat-upgrade", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const stat = req.nextUrl.searchParams.get("stat") as StatKey | null;
  if (!stat || !VALID_STATS.includes(stat)) {
    return NextResponse.json({ error: `stat must be one of ${VALID_STATS.join(", ")}` }, { status: 400 });
  }

  // Current value + ceiling check (before payment, so users don't pay for nothing)
  const currentValue = (pet as any)[stat] as number;
  if (currentValue >= STAT_CEILING) {
    return NextResponse.json(
      { error: `${stat.toUpperCase()} is already at the ceiling (${STAT_CEILING})`, current: currentValue },
      { status: 400 },
    );
  }

  // Enforce paywall
  const txHash = req.nextUrl.searchParams.get("tx_hash") || undefined;
  const gate = await enforcePaywall(user.id, `stat_upgrade_${stat}`, txHash, pet.id);
  if (gate.ok !== true) {
    return NextResponse.json({ error: "Payment required", paywall: gate.paywall }, { status: 402 });
  }

  const nextValue = Math.min(STAT_CEILING, currentValue + STAT_INCREMENT);
  const updated = await prisma.pet.update({
    where: { id: pet.id },
    data: { [stat]: nextValue } as any,
  });

  // Memory: pet remembers its strength training
  await prisma.petMemory.create({
    data: {
      pet_id: pet.id,
      memory_type: "training",
      content: `Trained ${stat.toUpperCase()}! It's now ${nextValue} (+${STAT_INCREMENT}).`,
      emotion: "proud",
      importance: 2,
    },
  });

  return NextResponse.json({
    ok: true,
    stat,
    from: currentValue,
    to: nextValue,
    combinedPower: (updated as any).atk + (updated as any).def + (updated as any).spd,
    pet: updated,
  });
}

/**
 * GET /api/pets/[petId]/stats/upgrade — current stats + ceiling + price.
 * Used by UI to show "ATK 50 / 500 — next +5 = 1 USDT" cards.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
    select: { id: true, name: true, atk: true, def: true, spd: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  return NextResponse.json({
    petId: pet.id,
    name: pet.name,
    stats: { atk: pet.atk, def: pet.def, spd: pet.spd },
    combinedPower: pet.atk + pet.def + pet.spd,
    ceiling: STAT_CEILING,
    increment: STAT_INCREMENT,
    pricePerUpgradeUsd: 1.0,
  });
}

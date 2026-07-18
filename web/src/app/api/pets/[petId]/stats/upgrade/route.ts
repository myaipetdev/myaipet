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
import { executePetActionWithPaywall } from "@/lib/paywall";

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
  const parsedPetId = /^[1-9][0-9]*$/.test(petId) ? Number(petId) : Number.NaN;
  if (!Number.isSafeInteger(parsedPetId)) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  const stat = req.nextUrl.searchParams.get("stat") as StatKey | null;
  if (!stat || !VALID_STATS.includes(stat)) {
    return NextResponse.json({ error: `stat must be one of ${VALID_STATS.join(", ")}` }, { status: 400 });
  }

  const txHash = req.nextUrl.searchParams.get("tx_hash") || undefined;
  const action = await executePetActionWithPaywall(
    prisma,
    {
      userId: user.id,
      petId: parsedPetId,
      actionKey: `stat_upgrade_${stat}`,
      txHash,
    },
    {
      validate: (pet) => pet[stat] > STAT_CEILING - STAT_INCREMENT
        ? { kind: "ceiling" as const, current: pet[stat] }
        : null,
      apply: async (tx, pet) => {
        const currentValue = pet[stat];
        const nextValue = currentValue + STAT_INCREMENT;
        const updated = await tx.pet.update({
          where: { id: pet.id },
          data: { [stat]: nextValue },
        });
        await tx.petMemory.create({
          data: {
            pet_id: pet.id,
            memory_type: "training",
            content: `Trained ${stat.toUpperCase()}! It's now ${nextValue} (+${STAT_INCREMENT}).`,
            emotion: "proud",
            importance: 2,
          },
        });
        return { currentValue, nextValue, updated };
      },
    },
  );

  if (action.ok !== true) {
    if (action.kind === "pet_not_found") {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }
    if (action.kind === "domain") {
      return NextResponse.json(
        {
          error: action.domain.current >= STAT_CEILING
            ? `${stat.toUpperCase()} is already at the ceiling (${STAT_CEILING})`
            : `${stat.toUpperCase()} cannot receive the full +${STAT_INCREMENT} without exceeding ${STAT_CEILING}`,
          current: action.domain.current,
        },
        { status: 400 },
      );
    }
    if (action.kind === "receipt_already_consumed") {
      return NextResponse.json(
        {
          error: "This payment was already applied; refresh the pet to recover current state",
          code: "PAYMENT_ALREADY_APPLIED",
          refresh: true,
        },
        { status: 409 },
      );
    }
    const paused = action.paywall.reason === "payments_paused";
    return NextResponse.json(
      {
        error: paused ? "Payments are temporarily unavailable" : "Payment required",
        paywall: action.paywall,
      },
      { status: paused ? 503 : 402 },
    );
  }

  const { currentValue, nextValue, updated } = action.value;

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

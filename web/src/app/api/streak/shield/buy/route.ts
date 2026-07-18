/**
 * POST /api/streak/shield/buy
 * Body: { paymentMethod: "credits" }   (USDT/token paths added in Phase 3)
 *
 * Debits credits, increments shields_owned (cap at SHIELD_MAX_OWNED), and
 * stamps a streak_purchases row.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getOrCreateStreak } from "@/lib/missions/streak";
import {
  buyStreakShield,
  StreakInsufficientCreditsError,
  StreakShieldInventoryFullError,
  StreakStateConflictError,
} from "@/lib/streakPurchases";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const method = String(body.paymentMethod || "credits");
  if (method !== "credits") {
    return NextResponse.json({ error: "Only `credits` is supported in this build" }, { status: 400 });
  }

  const s = await getOrCreateStreak(user.id);
  try {
    const result = await buyStreakShield({
      userId: user.id,
      expectedUpdatedAt: s.updated_at,
    });
    return NextResponse.json({
      ok: true,
      shieldsOwned: result.shieldsOwned,
      creditsRemaining: result.creditsRemaining,
    });
  } catch (error) {
    if (error instanceof StreakInsufficientCreditsError) {
      return NextResponse.json(
        { error: error.message, needed: error.required, available: error.available },
        { status: 402 },
      );
    }
    if (error instanceof StreakStateConflictError || error instanceof StreakShieldInventoryFullError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

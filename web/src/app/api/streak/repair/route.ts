/**
 * POST /api/streak/repair
 * Body: { paymentMethod: "credits" }
 *
 * Restores the streak to its pre-break value. Pricing scales with the longest
 * streak that's being recovered (see repairPriceForStreak).
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getOrCreateStreak, todayUtcString } from "@/lib/missions/streak";
import {
  repairStreak,
  StreakInsufficientCreditsError,
  StreakRepairUnavailableError,
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
  const today = todayUtcString();
  try {
    const result = await repairStreak({
      userId: user.id,
      expectedUpdatedAt: s.updated_at,
      today,
    });
    return NextResponse.json({
      ok: true,
      streak: result.streak,
      creditsRemaining: result.creditsRemaining,
      price: result.price,
    });
  } catch (error) {
    if (error instanceof StreakInsufficientCreditsError) {
      return NextResponse.json(
        { error: error.message, needed: error.required, available: error.available },
        { status: 402 },
      );
    }
    if (error instanceof StreakStateConflictError || error instanceof StreakRepairUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { paymentsEnabled } from "@/lib/onchain";
import { seasonTier } from "@/lib/season";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/account/overview — owner-scoped account snapshot for /account.
 *
 * Every number is read from the same sources the rest of the app already
 * uses (NO derived/fabricated figures):
 *   - credits + season_points  → users row (same as /api/credits/balance)
 *   - purchases                → credit_purchases ledger (newest first, cap 20)
 *   - usage                    → generations table (same data as /api/generate/history)
 *   - tier                     → seasonTier() over the real season_points
 *   - plan                     → 'companion' is the only real plan today
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [userData, purchases, generationsTotal, recentGenerations] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { credits: true, season_points: true, created_at: true },
      }),
      prisma.creditPurchase.findMany({
        where: { user_id: user.id },
        orderBy: { created_at: "desc" },
        take: 20,
        select: {
          id: true,
          credits: true,
          amount_usd: true,
          status: true,
          chain: true,
          created_at: true,
        },
      }),
      prisma.generation.count({ where: { user_id: user.id } }),
      prisma.generation.findMany({
        where: { user_id: user.id },
        orderBy: { created_at: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          credits_charged: true,
          duration: true,
          created_at: true,
        },
      }),
    ]);

    const seasonPoints = userData?.season_points ?? 0;
    const standing = seasonTier(seasonPoints);

    return NextResponse.json({
      // The only real plan today. Companion+ exists on the roadmap only — the
      // UI must say so honestly rather than render a fake paid tier.
      plan: "companion",
      member_since: userData?.created_at ?? null,
      credits: userData?.credits ?? 0,
      payments_enabled: paymentsEnabled(),
      purchases,
      usage: {
        total: generationsTotal,
        recent: recentGenerations,
      },
      season: {
        points: seasonPoints,
        tier: standing.tier,
        next: standing.next,
        to_next: standing.toNext,
        progress: standing.progress,
      },
    });
  } catch (error) {
    console.error("Account overview error:", error);
    return NextResponse.json({ error: "Failed to fetch account overview" }, { status: 500 });
  }
}

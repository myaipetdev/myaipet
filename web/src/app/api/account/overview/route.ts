import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { paymentsEnabled } from "@/lib/onchain";
import { seasonTier } from "@/lib/season";
import { NextRequest, NextResponse } from "next/server";

const ACCOUNT_OVERVIEW_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: ACCOUNT_OVERVIEW_RESPONSE_HEADERS },
      );
    }

    const [userData, purchases, generationsTotal, recentGenerations, agentRuns] = await Promise.all([
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
      prisma.petAgentRun.findMany({
        where: { user_id: user.id },
        orderBy: { created_at: "desc" },
        take: 20,
        select: {
          run_id: true,
          pet_id: true,
          pet_name: true,
          goal: true,
          private_content_scrubbed: true,
          state: true,
          completed: true,
          stopped_reason: true,
          billing: true,
          credits_remaining: true,
          created_at: true,
          started_at: true,
          terminal_at: true,
          updated_at: true,
        },
      }),
    ]);

    const seasonPoints = userData?.season_points ?? 0;
    const standing = seasonTier(seasonPoints);

    return NextResponse.json(
      {
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
        agent_runs: agentRuns.map((run) => {
          // Full pet deletion keeps a minimal owner-only financial receipt.
          // Privacy state is explicit; display strings are never authoritative.
          const petDeleted = run.private_content_scrubbed;
          return {
            run_id: run.run_id,
            pet_id: run.pet_id,
            pet_deleted: petDeleted,
            pet_name: petDeleted ? null : run.pet_name,
            goal: petDeleted ? null : run.goal,
            state: run.state,
            completed: run.completed,
            stopped_reason: run.stopped_reason,
            billing: run.billing,
            credits_remaining: run.credits_remaining,
            created_at: run.created_at,
            started_at: run.started_at,
            terminal_at: run.terminal_at,
            updated_at: run.updated_at,
          };
        }),
        season: {
          points: seasonPoints,
          tier: standing.tier,
          next: standing.next,
          to_next: standing.toNext,
          progress: standing.progress,
        },
      },
      { headers: ACCOUNT_OVERVIEW_RESPONSE_HEADERS },
    );
  } catch (error) {
    console.error("Account overview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch account overview" },
      { status: 500, headers: ACCOUNT_OVERVIEW_RESPONSE_HEADERS },
    );
  }
}

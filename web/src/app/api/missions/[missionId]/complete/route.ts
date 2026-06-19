/**
 * POST /api/missions/[missionId]/complete
 *
 * Marks a manual mission as completed. For auto-verified missions, runs the
 * check predicate and only flips if the predicate passes — never trust the
 * client to mark auto missions done.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getMission } from "@/lib/missions/catalog";
import { recordCompletionForStreakBookkeeping, todayUtcString } from "@/lib/missions/streak";
import { tryGrantAllCompleteBonus } from "@/lib/missions/today";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ missionId: string }> },
) {
  const { missionId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tpl = getMission(missionId);
  if (!tpl) return NextResponse.json({ error: "Unknown mission" }, { status: 404 });

  const date = todayUtcString();
  const row = await prisma.dailyMission.findUnique({
    where: { user_date_mission: { user_id: user.id, date, mission_id: missionId } },
  });
  if (!row) return NextResponse.json({ error: "Mission not assigned today" }, { status: 400 });
  if (row.status === "completed") {
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  // For auto missions, re-run the check rather than trusting the client.
  if (tpl.verifier === "auto" && tpl.check) {
    const passed = await tpl.check(user.id, date).catch(() => false);
    if (!passed) {
      return NextResponse.json({
        error: "Mission criteria not yet met",
        hint: tpl.description,
      }, { status: 409 });
    }
  }

  // Anti-gaming: manual missions (verifier:"manual") flip to completed on pure
  // self-report — there is no server-side proof the user actually did them. So
  // they must NOT inflate the Season RANK pool (airdrop_points) at full weight,
  // or the leaderboard becomes trivially gameable by spamming "Mark done".
  //
  //   - airdrop_points (the ranking pool) gets only a small capped weight for
  //     manual missions — enough to feel rewarding, too small to climb on.
  //   - total_points_earned (lifetime loyalty / streak ledger, non-ranking)
  //     still gets the FULL reward, so the user keeps their honest progress.
  //
  // Auto missions are server-verified, so they grant the full reward to rank.
  const isManual = tpl.verifier === "manual";
  const MANUAL_RANK_CAP = 2;
  const rankPoints = isManual ? Math.min(row.points, MANUAL_RANK_CAP) : row.points;

  // Flip is the atomic claim: updateMany only matches while status is not yet
  // "completed", so exactly one of two concurrent requests wins and grants the
  // points (the status-read guard above is outside the tx and was racy → the
  // points could be double-credited).
  const granted = await prisma.$transaction(async (tx: any) => {
    const flip = await tx.dailyMission.updateMany({
      where: { user_id: user.id, date, mission_id: missionId, status: { not: "completed" } },
      data: { status: "completed", completed_at: new Date() },
    });
    if (flip.count !== 1) return false; // already completed by a concurrent request
    await tx.user.update({
      where: { id: user.id },
      data: { airdrop_points: { increment: rankPoints } },
    });
    await tx.userStreak.upsert({
      where: { user_id: user.id },
      update: { total_points_earned: { increment: row.points } },
      create: { user_id: user.id, total_points_earned: row.points },
    });
    return true;
  });

  if (!granted) {
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  const streakUpdate = await recordCompletionForStreakBookkeeping(user.id);

  // If this was the last mission of the day, actually credit the +25
  // all-complete bonus now (idempotent — guarded per user/day).
  const bonusGranted = await tryGrantAllCompleteBonus(user.id, date);

  return NextResponse.json({
    ok: true,
    pointsEarned: row.points,
    rankPointsEarned: rankPoints,
    allCompleteBonusGranted: bonusGranted,
    streak: streakUpdate.streak,
    shieldUsed: streakUpdate.shieldUsed,
    newPeakReached: streakUpdate.newPeakReached,
  });
}

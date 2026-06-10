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

  // Flip + reward in a transaction so we never double-credit
  await prisma.$transaction([
    prisma.dailyMission.update({
      where: { user_date_mission: { user_id: user.id, date, mission_id: missionId } },
      data: { status: "completed", completed_at: new Date() },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { airdrop_points: { increment: row.points } },
    }),
    prisma.userStreak.upsert({
      where: { user_id: user.id },
      update: { total_points_earned: { increment: row.points } },
      create: { user_id: user.id, total_points_earned: row.points },
    }),
  ]);

  const streakUpdate = await recordCompletionForStreakBookkeeping(user.id);

  return NextResponse.json({
    ok: true,
    pointsEarned: row.points,
    streak: streakUpdate.streak,
    shieldUsed: streakUpdate.shieldUsed,
    newPeakReached: streakUpdate.newPeakReached,
  });
}

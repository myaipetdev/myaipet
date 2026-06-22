/**
 * POST /api/sos/[id]/help — donate a shield (50 cr) to save another user's
 * streak. Helper gets +20 season_points + "Streak Savior" reputation.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

const HELP_COST_CREDITS = 50;
const HELPER_REWARD_PTS = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const helper = await getUser(req);
  if (!helper) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sosId = Number(id);
  if (!sosId) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const sos = await prisma.streakSos.findUnique({ where: { id: sosId } });
  if (!sos) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sos.helped_by_id) return NextResponse.json({ error: "Already helped" }, { status: 400 });
  if (sos.sender_id === helper.id) return NextResponse.json({ error: "Can't help yourself" }, { status: 400 });
  if (sos.expires_at < new Date()) return NextResponse.json({ error: "Expired" }, { status: 400 });

  const u = await prisma.user.findUnique({ where: { id: helper.id }, select: { credits: true } });
  if (!u || u.credits < HELP_COST_CREDITS) {
    return NextResponse.json({ error: "Not enough credits" }, { status: 402 });
  }

  // Atomic — debit helper, give sender a shield, mark SOS helped, reward helper.
  await prisma.$transaction([
    prisma.user.update({ where: { id: helper.id }, data: { credits: { decrement: HELP_COST_CREDITS }, season_points: { increment: HELPER_REWARD_PTS } } }),
    prisma.userStreak.upsert({
      where: { user_id: sos.sender_id },
      update: { shields_owned: { increment: 1 } },
      create: { user_id: sos.sender_id, shields_owned: 1 },
    }),
    prisma.streakSos.update({
      where: { id: sosId },
      data: { helped_by_id: helper.id, helped_at: new Date(), credits_paid: HELP_COST_CREDITS },
    }),
  ]);

  return NextResponse.json({ ok: true, reward_pts: HELPER_REWARD_PTS });
}

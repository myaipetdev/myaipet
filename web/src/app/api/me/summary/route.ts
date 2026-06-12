/**
 * GET /api/me/summary — the personal dashboard header for the merged
 * Airdrop page. Returns everything "My Card" needs in one call:
 *   points, credits, streak, shields, season rank (by streak), best pet.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [full, streak, pet] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { airdrop_points: true, credits: true } }),
    prisma.userStreak.findUnique({ where: { user_id: user.id } }),
    prisma.pet.findFirst({
      where: { user_id: user.id, is_active: true },
      orderBy: { level: "desc" },
      select: { name: true, avatar_url: true, level: true },
    }),
  ]);

  // Season rank by current streak (cheap single count). Ties resolve to the
  // best possible rank for the user.
  const myStreak = streak?.current_streak ?? 0;
  const higher = myStreak > 0
    ? await prisma.userStreak.count({ where: { current_streak: { gt: myStreak } } })
    : null;

  return NextResponse.json({
    points: full?.airdrop_points ?? 0,
    credits: full?.credits ?? 0,
    streak: myStreak,
    longest: streak?.longest_streak ?? 0,
    shields: streak?.shields_owned ?? 0,
    streakRank: higher != null ? higher + 1 : null,
    pet: pet ? { name: pet.name, avatar_url: pet.avatar_url, level: pet.level } : null,
  });
}

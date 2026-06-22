/**
 * /api/worldcup/predict — community "predict the champion" for World Cup 2026.
 *   POST { code }  → set/replace your predicted winning country; awards points.
 *   GET            → community leaderboard (most-predicted) + your pick + total.
 *
 * This is a PREDICTION poll, not a live result — no fabricated scores/brackets.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { getCountry, WORLD_CUP_COUNTRIES, flagUrl } from "@/lib/worldcup/countries";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/airdrop";

function leaderboardFrom(rows: { country_code: string; _count: { _all: number } }[], total: number) {
  return rows
    .map((r) => {
      const c = getCountry(r.country_code);
      if (!c) return null;
      return {
        code: c.code, name: c.name, flag: flagUrl(c, 80), color: c.colors[0],
        count: r._count._all, pct: total > 0 ? Math.round((r._count._all / total) * 100) : 0,
      };
    })
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  const [grouped, total, mine] = await Promise.all([
    prisma.worldCupPrediction.groupBy({ by: ["country_code"], _count: { _all: true }, orderBy: { _count: { country_code: "desc" } }, take: 12 }),
    prisma.worldCupPrediction.count(),
    user ? prisma.worldCupPrediction.findUnique({ where: { owner_user_id: user.id }, select: { country_code: true } }) : Promise.resolve(null),
  ]);
  return NextResponse.json({ leaderboard: leaderboardFrom(grouped as any, total), total, myPick: mine?.country_code || null });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "wc-predict", limit: 20, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const code = String(body?.code || "");
  if (!getCountry(code)) return NextResponse.json({ error: "Unknown country" }, { status: 400 });

  await prisma.worldCupPrediction.upsert({
    where: { owner_user_id: user.id },
    create: { owner_user_id: user.id, country_code: code },
    update: { country_code: code },
  });

  const pts = await awardPointsCapped(user.id, "worldcup", 10, DAILY_POINT_CAPS.worldcup);

  const [grouped, total] = await Promise.all([
    prisma.worldCupPrediction.groupBy({ by: ["country_code"], _count: { _all: true }, orderBy: { _count: { country_code: "desc" } }, take: 12 }),
    prisma.worldCupPrediction.count(),
  ]);
  return NextResponse.json({ ok: true, myPick: code, pointsAwarded: pts.points || 0, leaderboard: leaderboardFrom(grouped as any, total), total });
}

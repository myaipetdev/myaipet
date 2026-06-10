/**
 * POST /api/sos/send — Body: { message? }
 * Broadcast "my streak is about to break, who'll save me" — visible on the
 * community SOS feed for the next ~24h. A helper donates a shield (or
 * credits) to revive.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getOrCreateStreak } from "@/lib/missions/streak";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const message = String(body.message || "").slice(0, 280);

  const s = await getOrCreateStreak(user.id);
  if (s.current_streak < 3) {
    return NextResponse.json({ error: "Get to at least 3 days before asking for help!" }, { status: 400 });
  }

  // Prevent spam: max 1 active SOS per user
  const live = await prisma.streakSos.findFirst({
    where: { sender_id: user.id, helped_by_id: null, expires_at: { gt: new Date() } },
  });
  if (live) return NextResponse.json({ error: "Already have an active SOS", id: live.id }, { status: 409 });

  const row = await prisma.streakSos.create({
    data: {
      sender_id: user.id,
      sender_streak: s.current_streak,
      message: message || null,
      expires_at: new Date(Date.now() + 24 * 3600_000),
    },
  });
  return NextResponse.json({ ok: true, id: row.id, expires_at: row.expires_at });
}

/**
 * POST /api/buddy/accept — Body: { buddyId }
 * Accept an inbound invite. Status flips to active and shared_streak starts.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { buddyId } = await req.json().catch(() => ({}));
  if (!buddyId) return NextResponse.json({ error: "buddyId required" }, { status: 400 });

  const row = await prisma.streakBuddy.findUnique({ where: { id: Number(buddyId) } });
  if (!row || row.user_b_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "pending") return NextResponse.json({ error: "Already handled" }, { status: 400 });

  await prisma.streakBuddy.update({
    where: { id: row.id },
    data: { status: "active", accepted_at: new Date(), shared_streak: 0 },
  });
  return NextResponse.json({ ok: true });
}

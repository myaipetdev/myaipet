/**
 * GET /api/community/showcase?limit=12 — public gallery of recent creations.
 *
 * Lets cold (no-wallet) visitors actually SEE the art the community is making,
 * not just aggregate stats — the gallery is the proof the place is alive.
 * Read-only; interaction (like/comment/share) still requires sign-in.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(24, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 12));

  const rows = await prisma.generation.findMany({
    where: {
      status: "completed",
      OR: [{ video_path: { not: null } }, { photo_path: { not: "" } }],
    },
    orderBy: { created_at: "desc" },
    take: limit,
    select: {
      id: true,
      photo_path: true,
      video_path: true,
      created_at: true,
      _count: { select: { likes: true } },
    },
  });

  const items = rows
    .map((g) => ({
      id: g.id,
      url: g.video_path || g.photo_path || "",
      isVideo: !!g.video_path,
      likes: g._count?.likes || 0,
      createdAt: g.created_at,
    }))
    .filter((it) => it.url && /^https?:\/\//i.test(it.url));

  return NextResponse.json({ items });
}

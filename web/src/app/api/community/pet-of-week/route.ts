/**
 * GET /api/community/pet-of-week — auto-curated featured pet for the Community
 * tab. Public.
 *
 * "Of the week" = the pet whose owner invested the most this week, scored on
 * the metrics that actually mean devotion here:
 *   bond_level (×3) + level (×2) + moments logged in the last 7 days (×1).
 *
 * Generations aren't pet-linked yet (only user+species), so the hero image is
 * the owner's best recent creation rather than a strictly pet-attributed one.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function maskWallet(w: string | null | undefined): string {
  if (!w || w.length < 10) return "anon";
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

export async function GET(_req: NextRequest) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  // Curation pool: the bond leaders with a face. Bond is the north-star metric,
  // so the strongest candidates already sort to the top — we only need a small
  // pool to re-rank with this week's activity.
  const pool = await prisma.pet.findMany({
    where: { is_active: true, avatar_url: { not: null } },
    orderBy: [{ bond_level: "desc" }, { level: "desc" }],
    take: 20,
    select: {
      id: true, name: true, avatar_url: true, level: true, bond_level: true,
      personality_type: true, current_mood: true, user_id: true,
    },
  });

  if (pool.length === 0) {
    return NextResponse.json({ pet: null });
  }

  // This week's activity per candidate (one grouped query).
  const ids = pool.map(p => p.id);
  const grouped = await prisma.petMemory.groupBy({
    by: ["pet_id"],
    where: { pet_id: { in: ids }, created_at: { gte: weekAgo } },
    _count: { _all: true },
  });
  const weekMoments = new Map<number, number>();
  for (const g of grouped) weekMoments.set(g.pet_id, g._count._all);

  const scored = pool
    .map(p => {
      const moments = weekMoments.get(p.id) || 0;
      return { p, moments, score: p.bond_level * 3 + p.level * 2 + moments };
    })
    .sort((a, b) => b.score - a.score);

  const winner = scored[0];
  const { p } = winner;

  const [owner, heroGen] = await Promise.all([
    prisma.user.findUnique({ where: { id: p.user_id }, select: { wallet_address: true } }),
    prisma.generation.findFirst({
      where: { user_id: p.user_id, status: "completed", photo_path: { not: "" } },
      orderBy: { created_at: "desc" },
      select: { photo_path: true, video_path: true, prompt: true },
    }),
  ]);

  const reasons: string[] = [];
  if (p.bond_level > 0) reasons.push(`💝 Bond Lv.${p.bond_level}`);
  reasons.push(`⭐ Level ${p.level}`);
  if (winner.moments > 0) reasons.push(`🔥 ${winner.moments} moment${winner.moments === 1 ? "" : "s"} this week`);

  return NextResponse.json({
    pet: {
      id: p.id,
      name: p.name,
      avatarUrl: p.avatar_url,
      level: p.level,
      bondLevel: p.bond_level,
      personality: p.personality_type,
      mood: p.current_mood,
      ownerWallet: maskWallet(owner?.wallet_address),
      heroImage: heroGen?.video_path || heroGen?.photo_path || null,
      heroIsVideo: !!heroGen?.video_path,
      heroPrompt: heroGen?.prompt || null,
      reasons,
    },
  });
}

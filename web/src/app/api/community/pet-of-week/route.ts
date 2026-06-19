/**
 * GET /api/community/pet-of-week — auto-curated featured pet for the Community
 * tab. Public.
 *
 * "Of the week" = the pet most active THIS WEEK. Score is dominated by moments
 * logged in the last 7 days (×10), with bond_level and level as tiebreakers, so
 * the hero actually rotates week to week instead of freezing on the single
 * highest-bond pet. A maxed-bond but idle pet only wins on a quiet week.
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

  // Candidates this week = the most ACTIVE pets in the last 7 days. This is the
  // heart of "of the week" and what makes the hero rotate.
  const activeGroups = await prisma.petMemory.groupBy({
    by: ["pet_id"],
    where: { created_at: { gte: weekAgo } },
    _count: { _all: true },
    orderBy: { _count: { pet_id: "desc" } },
    take: 30,
  });
  const activeIds = activeGroups.map(g => g.pet_id);
  const weekMoments = new Map<number, number>();
  for (const g of activeGroups) weekMoments.set(g.pet_id, g._count._all);

  // Bond leaders as a fallback so a quiet week still has a worthy hero.
  const bondLeaders = await prisma.pet.findMany({
    where: { is_active: true, avatar_url: { not: null } },
    orderBy: [{ bond_level: "desc" }, { level: "desc" }],
    take: 10,
    select: { id: true },
  });

  const candidateIds = Array.from(new Set([...activeIds, ...bondLeaders.map(b => b.id)]));
  const pool = await prisma.pet.findMany({
    where: { id: { in: candidateIds }, is_active: true, avatar_url: { not: null } },
    select: {
      id: true, name: true, avatar_url: true, level: true, bond_level: true,
      personality_type: true, user_id: true,
    },
  });

  if (pool.length === 0) {
    return NextResponse.json({ pet: null });
  }

  const scored = pool
    .map(p => {
      const moments = weekMoments.get(p.id) || 0;
      // "Of the WEEK": this week's activity dominates; bond/level break ties.
      return { p, moments, score: moments * 10 + p.bond_level + p.level };
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
  if (winner.moments > 0) reasons.push(`🔥 ${winner.moments} moment${winner.moments === 1 ? "" : "s"} this week`);
  if (p.bond_level > 0) reasons.push(`💝 Bond Lv.${p.bond_level}`);
  reasons.push(`⭐ Level ${p.level}`);

  return NextResponse.json({
    pet: {
      id: p.id,
      name: p.name,
      avatarUrl: p.avatar_url,
      level: p.level,
      bondLevel: p.bond_level,
      personality: p.personality_type,
      ownerWallet: maskWallet(owner?.wallet_address),
      heroImage: heroGen?.video_path || heroGen?.photo_path || null,
      heroIsVideo: !!heroGen?.video_path,
      heroPrompt: heroGen?.prompt || null,
      reasons,
    },
  });
}

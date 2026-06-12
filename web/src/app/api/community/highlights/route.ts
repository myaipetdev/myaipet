/**
 * GET /api/community/highlights — the "this place is alive" header for the
 * Community tab. Public. Returns lightweight aggregates + a few featured pets
 * so the gallery doesn't open cold.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [pets, genTotal, genWeek, creators, topPets] = await Promise.all([
    prisma.pet.count({ where: { is_active: true } }),
    prisma.generation.count({ where: { status: "completed" } }),
    prisma.generation.count({ where: { status: "completed", created_at: { gte: weekAgo } } }),
    prisma.generation.findMany({
      where: { status: "completed", created_at: { gte: weekAgo } },
      distinct: ["user_id"], select: { user_id: true },
    }).then(r => r.length),
    // Featured pets: most-followed, with their best generation as a thumb.
    prisma.pet.findMany({
      where: { is_active: true, avatar_url: { not: null } },
      orderBy: { bond_level: "desc" },
      take: 8,
      select: { id: true, name: true, avatar_url: true, level: true, personality_type: true },
    }),
  ]);

  return NextResponse.json({
    stats: { pets, generations: genTotal, generationsThisWeek: genWeek, activeCreators: creators },
    featuredPets: topPets,
  });
}

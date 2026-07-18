/**
 * GET /api/community/highlights — the "this place is alive" header for the
 * Community tab. Public. Returns lightweight aggregates + a few featured pets
 * so the gallery doesn't open cold.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicGenerationWhere } from "@/lib/publicFeed";
import { publicPetWhere } from "@/lib/publicPet";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [allPublicGenerations, publicGenerationsThisWeek] = await Promise.all([
    publicGenerationWhere(),
    publicGenerationWhere({ created_at: { gte: weekAgo } }),
  ]);

  const [pets, genTotal, genWeek, creators, topPets] = await Promise.all([
    prisma.pet.count({ where: publicPetWhere() }),
    prisma.generation.count({ where: allPublicGenerations }),
    prisma.generation.count({ where: publicGenerationsThisWeek }),
    prisma.generation.findMany({
      where: publicGenerationsThisWeek,
      distinct: ["user_id"], select: { user_id: true },
    }).then(r => r.length),
    // Featured pets: most-followed, with their best generation as a thumb.
    prisma.pet.findMany({
      where: publicPetWhere({ avatar_url: { not: null } }),
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

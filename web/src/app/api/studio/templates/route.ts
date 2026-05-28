/**
 * Public Studio templates list.
 *
 *   GET /api/studio/templates?category=celebration&petId=42
 *     → { templates: [{ id, title, emoji, description, suggestedModelId,
 *                       previewPrompt, duration }] }
 *
 * If `petId` is provided AND the caller owns the pet, the previewPrompt is
 * personalized with that pet's name/species/personality.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { listTemplates } from "@/lib/studio/templates";
import type { StudioTemplate } from "@/lib/studio/templates";

export async function GET(req: NextRequest) {
  const categoryParam = req.nextUrl.searchParams.get("category") as StudioTemplate["category"] | null;
  const petIdParam = req.nextUrl.searchParams.get("petId");
  const templates = listTemplates(categoryParam || undefined);

  let petCtx: any = {
    name: "Your Pet",
    species: undefined,
    personalityType: undefined,
    appearanceDesc: undefined,
    avatarUrl: undefined,
  };

  if (petIdParam) {
    const user = await getUser(req).catch(() => null);
    if (user) {
      const pet = await prisma.pet.findFirst({
        where: { id: Number(petIdParam), user_id: user.id, is_active: true },
        select: { name: true, species: true, personality_type: true, appearance_desc: true, avatar_url: true },
      });
      if (pet) {
        petCtx = {
          name: pet.name,
          species: ["cat", "dog", "parrot", "turtle", "hamster", "rabbit", "fox", "pomeranian"][pet.species] || undefined,
          personalityType: pet.personality_type,
          appearanceDesc: pet.appearance_desc || undefined,
          avatarUrl: pet.avatar_url || undefined,
        };
      }
    }
  }

  return NextResponse.json({
    templates: templates.map(t => ({
      id: t.id,
      category: t.category,
      title: t.title,
      emoji: t.emoji,
      description: t.description,
      suggestedModelId: t.suggestedModelId,
      previewPrompt: t.buildPrompt(petCtx).slice(0, 280),
      duration: t.duration,
    })),
  });
}

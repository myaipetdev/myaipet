import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { SKILL_MAP } from "@/lib/skills";
import { NextRequest, NextResponse } from "next/server";
import { interactablePetWhere } from "@/lib/publicPet";
import { issueArenaMatchChallenge } from "@/lib/arenaMatchChallenge";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "arena-match-issue", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const petId = Number(req.nextUrl.searchParams.get("pet_id"));
  if (!Number.isSafeInteger(petId) || petId <= 0) {
    return NextResponse.json({ error: "A valid pet_id is required" }, { status: 400 });
  }

  const playerPet = await prisma.pet.findFirst({
    where: { id: petId, user_id: user.id, is_active: true },
    select: { id: true, level: true },
  });
  if (!playerPet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  // The server derives the level band from the authenticated user's real pet;
  // a client-supplied level can no longer request an easy farming target.
  const opponents = await prisma.pet.findMany({
    where: interactablePetWhere({
      user_id: { not: user.id },
      level: {
        gte: Math.max(1, playerPet.level - 3),
        lte: playerPet.level + 3,
      },
    }),
    select: {
      id: true,
      name: true,
      level: true,
      personality_type: true,
      avatar_url: true,
      happiness: true,
      energy: true,
      total_interactions: true,
      evolution_stage: true,
      element: true,
      skills: {
        where: { slot: { not: null } },
        select: { skill_key: true, level: true, slot: true },
        orderBy: { slot: "asc" },
      },
      user: { select: { wallet_address: true } },
    },
    take: 20,
  });

  const formatOpponent = (pick: typeof opponents[0]) => ({
    ...pick,
    wallet: `${pick.user.wallet_address.slice(0, 6)}...${pick.user.wallet_address.slice(-4)}`,
    skills: pick.skills.map((s) => ({
      ...s,
      def: SKILL_MAP[s.skill_key],
    })),
  });

  if (opponents.length === 0) {
    return NextResponse.json({ opponent: null, message: "No eligible opponents available" });
  }

  const pick = opponents[Math.floor(Math.random() * opponents.length)];
  const challenge = await issueArenaMatchChallenge(prisma, {
    userId: user.id,
    playerPetId: playerPet.id,
    opponentPetId: pick.id,
    playerLevel: playerPet.level,
    opponentLevel: pick.level,
  });
  return NextResponse.json({
    opponent: formatOpponent(pick),
    match_challenge: challenge.token,
    challenge_expires_at: challenge.expiresAt.toISOString(),
  });
}

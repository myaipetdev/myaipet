import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { awardPoints } from "@/lib/airdrop";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pet_id, opponent_id, won, turns } = await req.json();

  // Award points based on result
  const points = won ? 30 : 10; // Win: 30pts, Lose: 10pts (participation)
  await awardPoints(user.id, pet_id, "interact"); // reuse interact for now

  // Add experience to pet
  const expGain = won ? 25 : 10;
  const pet = await prisma.pet.findFirst({
    where: { id: pet_id, user_id: user.id },
  });

  if (pet) {
    const newExp = pet.experience + expGain;
    const expNeeded = pet.level * 100;
    const leveledUp = newExp >= expNeeded;

    const petUpdateData = leveledUp
      ? {
          experience: newExp - expNeeded,
          level: { increment: 1 },
          total_interactions: { increment: 1 },
        }
      : {
          experience: { increment: expGain },
          total_interactions: { increment: 1 },
        };

    const airdropIncrement = won ? 30 : 10;

    await prisma.$transaction([
      prisma.pet.update({
        where: { id: pet.id },
        data: petUpdateData,
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { airdrop_points: { increment: airdropIncrement } },
      }),
    ]);

    if (leveledUp) {
      await awardPoints(user.id, pet.id, "level_up");
    }
  }

  return NextResponse.json({
    points_earned: points,
    exp_gained: expGain,
    message: won ? "Victory! Great battle!" : "Defeat... Train harder!",
  });
}

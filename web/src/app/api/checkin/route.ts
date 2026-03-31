import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const STREAK_REWARDS = [5, 10, 15, 20, 25, 30, 50]; // day 1-7

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayDateString(): string {
  return toDateString(new Date());
}

function yesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateString(d);
}

async function getCheckinData(userId: number) {
  // Find all checkin interactions for this user, ordered by most recent
  const checkins = await prisma.petInteraction.findMany({
    where: {
      user_id: userId,
      interaction_type: "checkin",
    },
    orderBy: { created_at: "desc" },
    take: 8, // enough to compute streak
    select: { created_at: true, experience_gained: true },
  });

  if (checkins.length === 0) {
    return { streak: 0, lastCheckin: null, checkedInToday: false, rewards: STREAK_REWARDS };
  }

  const lastCheckinDate = toDateString(checkins[0].created_at);
  const checkedInToday = lastCheckinDate === todayDateString();

  // Compute current streak by walking backwards through consecutive days
  let streak = 0;
  let expectedDate = checkedInToday ? todayDateString() : yesterdayDateString();

  for (const c of checkins) {
    const cDate = toDateString(c.created_at);
    if (cDate === expectedDate) {
      streak++;
      // Move expected date back one day
      const d = new Date(expectedDate);
      d.setDate(d.getDate() - 1);
      expectedDate = toDateString(d);
    } else if (cDate < expectedDate) {
      // Gap found, streak broken
      break;
    }
    // If cDate === previous cDate (duplicate same day), skip
  }

  // If the user hasn't checked in today and last checkin wasn't yesterday, streak is 0
  if (!checkedInToday && lastCheckinDate !== yesterdayDateString()) {
    streak = 0;
  }

  return {
    streak,
    lastCheckin: lastCheckinDate,
    checkedInToday,
    rewards: STREAK_REWARDS,
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await getCheckinData(user.id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Checkin GET error:", error);
    return NextResponse.json({ error: "Failed to fetch checkin data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await getCheckinData(user.id);

    if (data.checkedInToday) {
      return NextResponse.json({ error: "Already checked in today", ...data }, { status: 400 });
    }

    // Determine new streak
    let newStreak: number;
    if (data.streak >= 7) {
      // After day 7 cycle completes, reset
      newStreak = 1;
    } else if (data.lastCheckin === yesterdayDateString()) {
      // Consecutive day
      newStreak = data.streak + 1;
    } else {
      // Missed a day or first checkin
      newStreak = 1;
    }

    const rewardPoints = STREAK_REWARDS[newStreak - 1] ?? 5;

    // Find any pet for this user (needed for PetInteraction)
    const pet = await prisma.pet.findFirst({
      where: { user_id: user.id },
      select: { id: true },
    });

    if (!pet) {
      return NextResponse.json({ error: "You need a pet to check in" }, { status: 400 });
    }

    // Create checkin interaction and award points in a transaction
    await prisma.$transaction([
      prisma.petInteraction.create({
        data: {
          pet_id: pet.id,
          user_id: user.id,
          interaction_type: "checkin",
          response_text: `Day ${newStreak} check-in! Earned ${rewardPoints} airdrop points.`,
          happiness_change: 5,
          energy_change: 0,
          hunger_change: 0,
          experience_gained: rewardPoints,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { airdrop_points: { increment: rewardPoints } },
      }),
    ]);

    return NextResponse.json({
      streak: newStreak,
      lastCheckin: todayDateString(),
      checkedInToday: true,
      rewards: STREAK_REWARDS,
      awarded: rewardPoints,
    });
  } catch (error) {
    console.error("Checkin POST error:", error);
    return NextResponse.json({ error: "Failed to check in" }, { status: 500 });
  }
}

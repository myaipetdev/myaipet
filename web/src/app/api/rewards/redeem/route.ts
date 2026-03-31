import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const REWARDS_CATALOG: Record<number, { name: string; points: number; levelReq: number; deliveryDays: string }> = {
  1: { name: "Sticker Pack", points: 500, levelReq: 5, deliveryDays: "3-5 days" },
  2: { name: "Hair Clip", points: 1000, levelReq: 10, deliveryDays: "5-7 days" },
  3: { name: "Phone Case", points: 2000, levelReq: 15, deliveryDays: "5-7 days" },
  4: { name: "Mug", points: 3000, levelReq: 20, deliveryDays: "5-7 days" },
  5: { name: "Notebook", points: 3500, levelReq: 25, deliveryDays: "5-7 days" },
  6: { name: "Pen Set", points: 4000, levelReq: 30, deliveryDays: "7-10 days" },
  7: { name: "Tote Bag", points: 5000, levelReq: 35, deliveryDays: "7-10 days" },
  8: { name: "Hoodie", points: 10000, levelReq: 40, deliveryDays: "10-14 days" },
  9: { name: "3D Figure", points: 20000, levelReq: 50, deliveryDays: "14-21 days" },
};

const REWARD_TIERS = [
  { tier: "Top 1", minRank: 1, maxRank: 1, allowedItems: [1,2,3,4,5,6,7,8,9] },
  { tier: "Top 3", minRank: 2, maxRank: 3, allowedItems: [1,2,3,4,5,6,7,8,9] },
  { tier: "Top 10", minRank: 4, maxRank: 10, allowedItems: [1,2,3,4,5,6,7] },
  { tier: "Top 10%", minRank: 11, maxRank: Infinity, allowedItems: [1,2,3] },
];

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reward_id } = await req.json();
    const reward = REWARDS_CATALOG[reward_id];
    if (!reward) {
      return NextResponse.json({ error: "Invalid reward" }, { status: 400 });
    }

    // Get user's current points and best pet level
    const [userData, bestPet] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { airdrop_points: true },
      }),
      prisma.pet.findFirst({
        where: { user_id: user.id, is_active: true },
        orderBy: { level: "desc" },
        select: { level: true },
      }),
    ]);

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const petLevel = bestPet?.level ?? 0;

    // Check level requirement
    if (petLevel < reward.levelReq) {
      return NextResponse.json(
        { error: `Pet level ${reward.levelReq} required (yours: ${petLevel})` },
        { status: 400 }
      );
    }

    // Check points
    if (userData.airdrop_points < reward.points) {
      return NextResponse.json(
        { error: `Not enough points. Need ${reward.points}, have ${userData.airdrop_points}` },
        { status: 400 }
      );
    }

    // Check tier eligibility via leaderboard rank
    const leaderboard = await prisma.$queryRaw<{ rank: number }[]>`
      SELECT rank FROM (
        SELECT id, RANK() OVER (ORDER BY airdrop_points DESC) as rank
        FROM users
        WHERE airdrop_points > 0
      ) ranked WHERE id = ${user.id}
    `;
    const userRank = leaderboard[0]?.rank ?? null;
    const totalParticipants = await prisma.user.count({ where: { airdrop_points: { gt: 0 } } });

    if (!userRank) {
      return NextResponse.json({ error: "You must be ranked to redeem rewards" }, { status: 400 });
    }

    // Find user's tier
    let userTier: typeof REWARD_TIERS[number] | null = null;
    for (const t of REWARD_TIERS) {
      if (t.tier === "Top 10%") {
        const cutoff = Math.max(10, Math.ceil(totalParticipants * 0.1));
        if (Number(userRank) <= cutoff) { userTier = t; break; }
      } else if (Number(userRank) >= t.minRank && Number(userRank) <= t.maxRank) {
        userTier = t;
        break;
      }
    }

    if (!userTier || !userTier.allowedItems.includes(reward_id)) {
      return NextResponse.json({ error: "This reward is not available at your current rank tier" }, { status: 400 });
    }

    // Atomically deduct points and create redemption record
    const [updatedUser, redemption] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id, airdrop_points: { gte: reward.points } },
        data: { airdrop_points: { decrement: reward.points } },
        select: { airdrop_points: true },
      }),
      prisma.rewardRedemption.create({
        data: {
          user_id: user.id,
          reward_id: reward_id,
          reward_name: reward.name,
          points_spent: reward.points,
          status: "confirmed",
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      redemption_id: redemption.id,
      reward_name: reward.name,
      points_spent: reward.points,
      remaining_points: updatedUser.airdrop_points,
      delivery_estimate: reward.deliveryDays,
    });
  } catch (error: unknown) {
    console.error("Reward redemption error:", error);
    const msg = error instanceof Error ? error.message : "Redemption failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

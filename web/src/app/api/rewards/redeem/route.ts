import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { SEASON_TIERS, seasonTier } from "@/lib/season";

// Single source of truth for Season standing is lib/season.ts (Sprout..Legend).
// Each redeemable good is gated by the MINIMUM season tier required to claim it
// — NOT by a points "cost". Season points are a ranking signal (lifetime
// earned); redeeming merch must never subtract them, or buying a reward would
// lower your rank. Instead we gate eligibility by the tier you have reached.
//
// tierReq is an index into SEASON_TIERS:
//   0 sprout · 1 bronze · 2 silver · 3 gold · 4 diamond · 5 legend
const REWARDS_CATALOG: Record<number, { name: string; tierReq: number; deliveryDays: string }> = {
  1: { name: "Sticker Pack", tierReq: 1, deliveryDays: "3-5 days" },   // Bronze
  2: { name: "Hair Clip",    tierReq: 1, deliveryDays: "5-7 days" },   // Bronze
  3: { name: "Phone Case",   tierReq: 2, deliveryDays: "5-7 days" },   // Silver
  4: { name: "Mug",          tierReq: 2, deliveryDays: "5-7 days" },   // Silver
  5: { name: "Notebook",     tierReq: 3, deliveryDays: "5-7 days" },   // Gold
  6: { name: "Pen Set",      tierReq: 3, deliveryDays: "7-10 days" },  // Gold
  7: { name: "Tote Bag",     tierReq: 4, deliveryDays: "7-10 days" },  // Diamond
  8: { name: "Hoodie",       tierReq: 4, deliveryDays: "10-14 days" }, // Diamond
  9: { name: "3D Figure",    tierReq: 5, deliveryDays: "14-21 days" }, // Legend
};

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

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { airdrop_points: true },
    });

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Standing = lifetime Season points (the ranking pool). Redemption is gated
    // by the tier you've REACHED, and is NON-deductive: claiming merch never
    // subtracts airdrop_points, so it never lowers your rank.
    const standing = seasonTier(userData.airdrop_points);
    const userTierIdx = SEASON_TIERS.findIndex(t => t.key === standing.tier.key);
    const requiredTier = SEASON_TIERS[reward.tierReq];

    if (userTierIdx < reward.tierReq) {
      return NextResponse.json(
        {
          error: `${requiredTier.name} tier required to claim ${reward.name} (you are ${standing.tier.name}).`,
          requiredTier: requiredTier.key,
          requiredPoints: requiredTier.min,
          yourTier: standing.tier.key,
          yourPoints: userData.airdrop_points,
        },
        { status: 400 }
      );
    }

    // Record the redemption WITHOUT touching airdrop_points (rank is preserved).
    const redemption = await prisma.rewardRedemption.create({
      data: {
        user_id: user.id,
        reward_id: reward_id,
        reward_name: reward.name,
        points_spent: 0, // non-deductive: tier-gated claim, not a points purchase
        status: "confirmed",
      },
    });

    return NextResponse.json({
      success: true,
      redemption_id: redemption.id,
      reward_name: reward.name,
      tier: requiredTier.key,
      tier_name: requiredTier.name,
      remaining_points: userData.airdrop_points, // unchanged — rank preserved
      delivery_estimate: reward.deliveryDays,
    });
  } catch (error: unknown) {
    console.error("Reward redemption error:", error);
    const msg = error instanceof Error ? error.message : "Redemption failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Public protocol metrics — no auth required.
 * Used by the /stats public dashboard and by any external party doing DD.
 *
 * Numbers are real DB counts. No marketing inflation.
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const now = new Date();
    const oneDayAgo  = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activePets,
      genTotal,
      genVideos,
      genImages,
      gen24h,
      gen7d,
      creditPurchases,
      creditPurchaseSum,
      itemPurchases,
      onchainTxs,
      memoryNftCount,
      petSoulCount,
      uniqueOnchainUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.pet.count({ where: { is_active: true } }),
      prisma.generation.count({ where: { status: "completed" } }),
      prisma.generation.count({ where: { status: "completed", video_path: { not: "" } } }),
      prisma.generation.count({ where: { status: "completed", photo_path: { not: "" }, video_path: "" } }),
      prisma.generation.count({ where: { status: "completed", created_at: { gte: oneDayAgo } } }),
      prisma.generation.count({ where: { status: "completed", created_at: { gte: sevenDaysAgo } } }),
      prisma.creditPurchase.count({ where: { status: "confirmed" } }),
      prisma.creditPurchase.aggregate({
        where: { status: "confirmed" },
        _sum: { amount_usd: true },
      }),
      prisma.transaction.count({ where: { type: "premium_buy" } }),
      prisma.transaction.count(),
      prisma.memoryNft.count(),
      prisma.petSoulNft.count(),
      prisma.transaction.findMany({
        where: { user_id: { not: null } },
        distinct: ["user_id"],
        select: { user_id: true },
      }),
    ]);

    return NextResponse.json({
      generated_at: now.toISOString(),
      users: {
        total: totalUsers,
        with_active_pet: activePets,
      },
      content: {
        generations_total: genTotal,
        generations_video: genVideos,
        generations_image: genImages,
        generations_24h: gen24h,
        generations_7d: gen7d,
      },
      revenue: {
        credit_purchases: creditPurchases,
        credit_revenue_usdt: Number(creditPurchaseSum._sum.amount_usd || 0),
        item_purchases: itemPurchases,
        currency: "USDT (BSC)",
      },
      onchain: {
        total_transactions: onchainTxs,
        unique_onchain_users: uniqueOnchainUsers.length,
        memory_nfts: memoryNftCount,
        pet_soul_nfts: petSoulCount,
        chain: "BNB Smart Chain (chain id 56)",
      },
      contracts: {
        pet_content: "0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c",
        pet_tracker: "0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a",
        pet_token: null,
        pet_shop: null,
        pet_activity: null,
        pet_soul: null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "stats failed" }, { status: 500 });
  }
}

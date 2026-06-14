import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Public "Live On-Chain Activity" social-proof feed for the home dashboard.
// Built only from already-public events (content generations + new pet
// adoptions) with truncated wallets — no private interactions, no admin gate,
// and no agent-reaction side effects (unlike /api/social/feed), so the home
// strip can poll it safely.

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function truncateWallet(w: string): string {
  return w ? `${w.slice(0, 6)}...${w.slice(-4)}` : "";
}

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(20, parseInt(req.nextUrl.searchParams.get("limit") || "12"));

    const [generations, newPets] = await Promise.all([
      prisma.generation.findMany({
        orderBy: { created_at: "desc" },
        take: limit,
        include: { user: { select: { wallet_address: true } } },
      }),
      prisma.pet.findMany({
        where: { is_active: true },
        orderBy: { created_at: "desc" },
        take: limit,
        include: { user: { select: { wallet_address: true } } },
      }),
    ]);

    const items: any[] = [];

    for (const g of generations) {
      const isVideo = !!g.video_path;
      items.push({
        icon: isVideo ? "🎬" : "🎨",
        wallet: truncateWallet(g.user?.wallet_address || ""),
        text: `Created an AI ${isVideo ? "video" : "image"}`,
        time: timeAgo(g.created_at),
        timestamp: g.created_at.getTime(),
      });
    }

    for (const p of newPets) {
      items.push({
        icon: "🐣",
        wallet: truncateWallet(p.user?.wallet_address || ""),
        text: `Adopted a new pet: ${p.name}`,
        time: timeAgo(p.created_at),
        timestamp: p.created_at.getTime(),
      });
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    const result = items.slice(0, limit).map(({ timestamp, ...rest }) => rest);

    return NextResponse.json({ items: result });
  } catch (error) {
    console.error("Recent activity error:", error);
    return NextResponse.json({ items: [] });
  }
}

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

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
    const limit = Math.min(30, parseInt(req.nextUrl.searchParams.get("limit") || "15"));

    // Fetch multiple activity types in parallel
    const [interactions, generations, newPets] = await Promise.all([
      // Recent pet interactions
      prisma.petInteraction.findMany({
        orderBy: { created_at: "desc" },
        take: limit,
        include: {
          pet: { select: { name: true, user: { select: { wallet_address: true } } } },
        },
      }),
      // Recent content generations
      prisma.generation.findMany({
        orderBy: { created_at: "desc" },
        take: limit,
        include: { user: { select: { wallet_address: true } } },
      }),
      // Recently adopted pets
      prisma.pet.findMany({
        where: { is_active: true },
        orderBy: { created_at: "desc" },
        take: limit,
        include: { user: { select: { wallet_address: true } } },
      }),
    ]);

    const INTERACTION_ICONS: Record<string, string> = {
      feed: "🍖", play: "⚽", talk: "💬", pet: "🤚", walk: "🚶", train: "🎓",
    };

    // Merge all activities into a single timeline
    const items: any[] = [];

    for (const i of interactions) {
      items.push({
        icon: INTERACTION_ICONS[i.interaction_type] || "🐾",
        wallet: truncateWallet(i.pet?.user?.wallet_address || ""),
        chain: "Base",
        text: `${i.interaction_type === "train" ? "Trained" : i.interaction_type === "feed" ? "Fed" : i.interaction_type === "play" ? "Played with" : i.interaction_type === "talk" ? "Talked to" : i.interaction_type === "pet" ? "Petted" : "Walked with"} ${i.pet?.name || "their pet"}`,
        time: timeAgo(i.created_at),
        timestamp: i.created_at.getTime(),
      });
    }

    for (const g of generations) {
      items.push({
        icon: "🎬",
        wallet: truncateWallet(g.user?.wallet_address || ""),
        chain: "Base",
        text: `Generated ${(g as any).media_type || "content"} — ${g.prompt?.slice(0, 40) || "AI content"}`,
        time: timeAgo(g.created_at),
        timestamp: g.created_at.getTime(),
      });
    }

    for (const p of newPets) {
      items.push({
        icon: "🐣",
        wallet: truncateWallet(p.user?.wallet_address || ""),
        chain: "BNB",
        text: `Adopted a new pet: ${p.name}`,
        time: timeAgo(p.created_at),
        timestamp: p.created_at.getTime(),
      });
    }

    // Sort by timestamp descending and take limit
    items.sort((a, b) => b.timestamp - a.timestamp);
    const result = items.slice(0, limit).map(({ timestamp, ...rest }) => rest);

    return NextResponse.json({ items: result });
  } catch (error) {
    console.error("Activity feed error:", error);
    return NextResponse.json({ items: [] });
  }
}

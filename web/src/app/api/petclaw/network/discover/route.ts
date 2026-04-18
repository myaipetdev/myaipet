import { NextRequest, NextResponse } from "next/server";
import { discoverPets, getNetworkStats } from "@/lib/petclaw/pet-network";

export async function GET(req: NextRequest) {
  const personality = req.nextUrl.searchParams.get("personality") || undefined;
  const element = req.nextUrl.searchParams.get("element") || undefined;
  const skill = req.nextUrl.searchParams.get("skill") || undefined;
  const minLevel = req.nextUrl.searchParams.get("minLevel");
  const limit = req.nextUrl.searchParams.get("limit");

  const [nodes, stats] = await Promise.all([
    discoverPets({
      personality,
      element,
      skill,
      minLevel: minLevel ? Number(minLevel) : undefined,
      limit: limit ? Number(limit) : 50,
    }),
    getNetworkStats(),
  ]);

  return NextResponse.json({
    protocol: "petclaw-v1",
    network: stats,
    nodes,
    meta: {
      discoveryEndpoint: "/api/petclaw/network/discover",
      invokeEndpoint: "/api/petclaw/network/invoke",
      petCardUrl: "/.well-known/pet-card.json",
    },
  });
}

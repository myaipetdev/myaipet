import { NextRequest, NextResponse } from "next/server";
import { discoverPets, getNetworkStats } from "@/lib/petclaw/pet-network";
import { rateLimit } from "@/lib/rateLimit";

const DISCOVERY_CACHE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { key: "petclaw-public-discovery", limit: 60, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  const personalityRaw = req.nextUrl.searchParams.get("personality");
  const personality = personalityRaw?.trim() || undefined;
  const elementRaw = req.nextUrl.searchParams.get("element");
  const element = elementRaw?.trim() || undefined;
  const skillRaw = req.nextUrl.searchParams.get("skill");
  const skill = skillRaw?.trim() || undefined;
  const minLevelRaw = req.nextUrl.searchParams.get("minLevel");
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const minLevel = minLevelRaw === null ? undefined : Number(minLevelRaw);
  const limit = limitRaw === null ? 50 : Number(limitRaw);

  if ((personality && personality.length > 20)
    || (element && !["fire", "water", "grass", "electric", "normal"].includes(element))
    || (skill && skill !== "companion-chat")
    || (minLevel !== undefined && (!Number.isSafeInteger(minLevel) || minLevel < 1 || minLevel > 1_000))
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    return NextResponse.json(
      { error: "Invalid discovery filters" },
      { status: 400, headers: DISCOVERY_CACHE_HEADERS },
    );
  }

  const [nodes, stats] = await Promise.all([
    discoverPets({
      personality,
      element,
      skill,
      minLevel,
      limit,
    }),
    getNetworkStats(),
  ]);

  return NextResponse.json(
    {
      protocol: "petclaw-v1",
      network: stats,
      nodes,
      meta: {
        discoveryEndpoint: "/api/petclaw/network/discover",
        remoteInvocation: "disabled",
        petCardUrl: "/.well-known/pet-card.json",
      },
    },
    { headers: DISCOVERY_CACHE_HEADERS },
  );
}

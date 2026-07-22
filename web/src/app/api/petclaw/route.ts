import { NextRequest, NextResponse } from "next/server";
import { buildManifest } from "@/lib/petclaw/petclaw";
import { getRegistryStats } from "@/lib/petclaw/pet-registry";
import { BUILTIN_SKILLS } from "@/lib/petclaw/pethub";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { key: "petclaw-public-manifest", limit: 120, windowMs: 60_000 });
  if (!limited.ok) return limited.response;
  // One runtime registry is authoritative. Do not copy schemas into the
  // discovery route: every field is projected from the same manifests the
  // execute endpoint validates.
  const manifest = buildManifest(BUILTIN_SKILLS);

  let stats: Awaited<ReturnType<typeof getRegistryStats>> | {
    totalPets: null;
    activePets: null;
    totalInteractions: null;
    totalMemories: null;
    totalSoulNfts: null;
  } = {
    totalPets: null,
    activePets: null,
    totalInteractions: null,
    totalMemories: null,
    totalSoulNfts: null,
  };
  try {
    stats = await getRegistryStats();
  } catch {}

  return NextResponse.json(
    { success: true, manifest, stats },
    { headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120" } },
  );
}

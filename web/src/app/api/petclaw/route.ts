import { NextResponse } from "next/server";
import { buildManifest } from "@/lib/petclaw/petclaw";
import { getRegistryStats } from "@/lib/petclaw/pet-registry";

export async function GET() {
  const manifest = buildManifest();

  let stats = { totalPets: 0, activePets: 0, totalInteractions: 0, totalMemories: 0, totalSoulNfts: 0 };
  try {
    stats = await getRegistryStats();
  } catch {}

  return NextResponse.json({
    success: true,
    manifest,
    stats,
  });
}

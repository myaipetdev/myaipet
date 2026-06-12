/**
 * GET /api/drops/current
 * Returns the active hourly drop (or the next one if we're in the half-hour
 * lull). Public — no auth required, drops are global.
 */
import { NextRequest, NextResponse } from "next/server";
import { currentDrop, upcomingDrops } from "@/lib/missions/hourly";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    ...currentDrop(),
    upcoming: upcomingDrops(6),
  });
}

/**
 * Season-close cron — freezes Season 1 final standings at SEASON_END.
 *
 *   POST /api/cron/season-close
 *   header: x-cron-secret: $CRON_SECRET
 *
 * On/after SEASON_END (2026-08-01 UTC) this snapshots the final ranking
 * (top-100 by loyalty points) into a durable JSON blob and marks the season
 * complete. Idempotent: re-running after a snapshot exists is a no-op.
 *
 * NO new table (migration-free): the snapshot is persisted in the existing,
 * otherwise-unused WeeklyBattlePool row keyed by the sentinel "SEASON-1" — see
 * lib/seasonSnapshot.ts. Battles were retired, so that table has no live writer.
 *
 * Before SEASON_END the cron is a no-op (returns due:false). The projection
 * surface reflects the closed season + frozen standings once this has run.
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { verifyCron } from "@/lib/cronAuth";
import { closeSeasonIfDue, readSeasonSnapshot } from "@/lib/seasonSnapshot";
import { SEASON_END_MS } from "@/lib/season";

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "cron-season-close", limit: 5, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  // Header-only secret; fail closed if unset (mirrors distribute-pool).
  const gate = verifyCron(req);
  if (gate) return gate;

  const result = await closeSeasonIfDue();
  if (!result.due) {
    return NextResponse.json({
      ok: true,
      closed: false,
      reason: "Season not ended yet",
      seasonEndsAtIso: new Date(SEASON_END_MS).toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    closed: true,
    created: result.created, // true = snapshot written this run; false = already closed
    participants: result.snapshot?.participants ?? 0,
    standings: result.snapshot?.top.length ?? 0,
    closedAtIso: result.snapshot?.closedAtIso ?? null,
  });
}

// Read-only status (no auth — for the leaderboard UI to detect closure).
export async function GET() {
  const snap = await readSeasonSnapshot();
  return NextResponse.json({
    closed: !!snap,
    snapshot: snap, // null until the season is closed
  });
}

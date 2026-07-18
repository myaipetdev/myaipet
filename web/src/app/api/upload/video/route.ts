import { NextResponse } from "next/server";

/**
 * Server-side edited-video persistence is intentionally disabled for launch.
 *
 * The browser editor can still render and download an MP4 locally. Accepting
 * arbitrary 15 MiB derivatives on the single EC2 volume would create an
 * unbounded, non-essential storage path. Re-enable only after per-account
 * durable quotas, expiry, and object-storage lifecycle rules are deployed.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Saving edited videos to the library is temporarily unavailable. Download the edit instead." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

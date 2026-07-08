import { NextResponse } from "next/server";

// Season-points → physical-merchandise redemption is REMOVED (founder decision,
// 2026-07-08). Season points are non-financial recognition — capped, no cash
// value, and NO redemption path (now or planned). A redemption economy would have
// given points concrete real-world value, contradicting the no-token posture.
// This endpoint is permanently disabled; the merch catalog UI is gone too.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Reward redemption is not available. Season points are non-financial recognition — no cash value, no redemption path.",
    },
    { status: 410 },
  );
}

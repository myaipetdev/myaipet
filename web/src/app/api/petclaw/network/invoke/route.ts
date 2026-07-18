import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "petclaw-invoke", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  // Public-profile/interaction consent does not authorize an external caller
  // to run a skill with the provider pet's private memories or BYOK key. Keep
  // remote invocation fail-closed until it has dedicated consent, public-only
  // context, caller-funded budgeting, and an atomic reservation protocol.
  return NextResponse.json(
    { error: "Remote pet skill invocation is not available" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

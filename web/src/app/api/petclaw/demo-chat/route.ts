import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { buildSyntheticDemoReply } from "@/lib/petclaw/demo-chat";

/**
 * POST /api/petclaw/demo-chat { message }
 *
 * Public, synthetic and stateless by construction: no petId, auth identity,
 * database, owner model, platform LLM, or memory store is consulted.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "synthetic-demo-chat", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  if (message.length > 500) {
    return NextResponse.json({ error: "message must be 500 characters or fewer" }, { status: 400 });
  }

  return NextResponse.json(
    { success: true, output: buildSyntheticDemoReply(message) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

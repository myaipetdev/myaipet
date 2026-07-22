import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { buildSyntheticDemoReply } from "@/lib/petclaw/demo-chat";
import { readBoundedJsonBody } from "@/lib/petclaw/bounded-json-body";

const DEMO_CHAT_BODY_MAX_BYTES = 2 * 1024;

/**
 * POST /api/petclaw/demo-chat { message }
 *
 * Public, synthetic and stateless by construction: no petId, auth identity,
 * database, owner model, platform LLM, or memory store is consulted.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "synthetic-demo-chat", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const parsedBody = await readBoundedJsonBody(req, DEMO_CHAT_BODY_MAX_BYTES);
  if (parsedBody.ok === false) {
    return NextResponse.json(
      { error: parsedBody.reason === "too_large" ? "Request body too large" : "Invalid JSON" },
      { status: parsedBody.reason === "too_large" ? 413 : 400 },
    );
  }
  const body = parsedBody.value;
  const message = body && typeof body === "object" && !Array.isArray(body)
    && typeof (body as { message?: unknown }).message === "string"
    ? (body as { message: string }).message.trim()
    : "";
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

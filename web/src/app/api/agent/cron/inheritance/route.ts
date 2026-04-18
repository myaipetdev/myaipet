import { NextRequest, NextResponse } from "next/server";
import { checkInheritance } from "@/lib/services/soul";

/**
 * GET /api/agent/cron/inheritance
 * Daily cron route. Requires `Authorization: Bearer <CRON_SECRET>` or
 * `x-cron-secret: <CRON_SECRET>` header.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await checkInheritance();
    return NextResponse.json({ ok: true, ...(result || {}) });
  } catch (err: any) {
    console.error("[cron/inheritance] error:", err);
    return NextResponse.json(
      { error: err?.message || "Inheritance check failed" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/cronAuth";
import { processMediaDeletionTasks } from "@/lib/petclaw/data-sovereignty";

export const dynamic = "force-dynamic";

/** Retry durable, reference-aware physical media cleanup after DB deletion. */
export async function POST(req: NextRequest) {
  const denied = verifyCron(req);
  if (denied) return denied;

  const result = await processMediaDeletionTasks({ limit: 200 });
  return NextResponse.json({ ok: result.failed === 0, ...result }, {
    status: result.failed === 0 ? 200 : 503,
  });
}

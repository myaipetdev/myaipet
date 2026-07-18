import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/cronAuth";
import { rateLimit } from "@/lib/rateLimit";
import { refundStaleAgentCreditReservations } from "@/lib/agentCreditReservation";

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "cron-agent-credit-refunds", limit: 12, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const denied = verifyCron(req);
  if (denied) return denied;

  const result = await refundStaleAgentCreditReservations(new Date(), 200);
  return NextResponse.json({ ok: true, ...result }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

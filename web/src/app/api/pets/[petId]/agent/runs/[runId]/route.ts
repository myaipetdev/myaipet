import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import {
  PET_AGENT_RUN_ID_PATTERN,
  getPetAgentRun,
} from "@/lib/petclaw/agent/run-ledger";
import { rateLimit } from "@/lib/rateLimit";

const PRIVATE_RECEIPT_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function privateReceiptJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", PRIVATE_RECEIPT_HEADERS["Cache-Control"]);
  return NextResponse.json(body, { ...init, headers });
}

function withPrivateReceiptHeaders<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", PRIVATE_RECEIPT_HEADERS["Cache-Control"]);
  return response;
}

/** Owner-scoped status/receipt lookup for an idempotent paid agent run. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string; runId: string }> },
) {
  const user = await getUser(req);
  if (!user) return privateReceiptJson({ error: "Unauthorized" }, { status: 401 });

  // Reconciliation is owner-scoped: unauthenticated traffic and another
  // account sharing the same NAT cannot consume this user's receipt bucket.
  const rl = rateLimit(req, {
    key: `agent-run-receipt:${user.id}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.ok) return withPrivateReceiptHeaders(rl.response);

  const { petId, runId: rawRunId } = await params;
  const pid = Number(petId);
  if (!Number.isSafeInteger(pid) || pid <= 0 || !PET_AGENT_RUN_ID_PATTERN.test(rawRunId)) {
    return privateReceiptJson({ error: "Invalid petId or runId" }, { status: 400 });
  }

  const run = await getPetAgentRun(user.id, pid, rawRunId.toLowerCase());
  if (!run) return privateReceiptJson({ error: "Agent run not found" }, { status: 404 });

  return privateReceiptJson(
    {
      ...run,
      statusUrl: `/api/pets/${pid}/agent/runs/${run.runId}`,
    },
    {
      status: run.state === "terminal" ? 200 : 202,
      headers: PRIVATE_RECEIPT_HEADERS,
    },
  );
}

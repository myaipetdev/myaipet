import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import {
  AGENT_RUN_EXPORT_CURSOR_MAX_LENGTH,
  AGENT_RUN_EXPORT_DEFAULT_LIMIT,
  AGENT_RUN_EXPORT_MAX_LIMIT,
  AgentRunExportError,
  exportOwnerAgentRunPage,
} from "@/lib/petclaw/agent-run-export";
import { rateLimit } from "@/lib/rateLimit";

const PRIVATE_EXPORT_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

function privateJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(PRIVATE_EXPORT_HEADERS)) {
    headers.set(key, value);
  }
  return NextResponse.json(body, { ...init, headers });
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * GET /api/account/agent-runs/export
 *
 * Owner-accessible, bounded DSAR pages for private paid-run content and billing
 * outcomes. `petId` is optional; when present it is separately ownership
 * checked. `cursor` is an encrypted owner/scope-bound composite boundary.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return privateJson({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimit(req, {
    key: `account-agent-run-export:${user.id}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    const headers = new Headers(limited.response.headers);
    headers.set("Cache-Control", PRIVATE_EXPORT_HEADERS["Cache-Control"]);
    headers.set("X-Content-Type-Options", PRIVATE_EXPORT_HEADERS["X-Content-Type-Options"]);
    return new NextResponse(limited.response.body, {
      status: limited.response.status,
      statusText: limited.response.statusText,
      headers,
    });
  }

  const rawPetId = req.nextUrl.searchParams.get("petId");
  const petId = rawPetId === null ? undefined : parsePositiveInteger(rawPetId);
  if (rawPetId !== null && petId === null) {
    return privateJson({ error: "petId must be a positive integer" }, { status: 400 });
  }

  const rawLimit = req.nextUrl.searchParams.get("limit");
  const limit = rawLimit === null ? AGENT_RUN_EXPORT_DEFAULT_LIMIT : parsePositiveInteger(rawLimit);
  if (limit === null || limit > AGENT_RUN_EXPORT_MAX_LIMIT) {
    return privateJson(
      { error: `limit must be between 1 and ${AGENT_RUN_EXPORT_MAX_LIMIT}` },
      { status: 400 },
    );
  }

  const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
  if (cursor && cursor.length > AGENT_RUN_EXPORT_CURSOR_MAX_LENGTH) {
    return privateJson({ error: "Invalid cursor", code: "invalid_cursor" }, { status: 400 });
  }

  try {
    const page = await exportOwnerAgentRunPage(user.id, { petId, cursor, limit });
    return privateJson(page, {
      headers: {
        "Content-Disposition": 'attachment; filename="myaipet-agent-runs-page.json"',
      },
    });
  } catch (error) {
    if (error instanceof AgentRunExportError) {
      if (error.code === "pet_not_owned") {
        // Do not disclose whether a foreign pet exists.
        return privateJson({ error: "Forbidden" }, { status: 403 });
      }
      if (error.code === "invalid_cursor") {
        return privateJson({ error: "Invalid cursor", code: error.code }, { status: 400 });
      }
    }
    console.error("Agent-run export error:", error);
    return privateJson({ error: "Agent-run export unavailable" }, { status: 500 });
  }
}

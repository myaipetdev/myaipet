/**
 * /api/petclaw/models — BYO model connections (FEATURE 1).
 *
 *   POST   { provider, label?, apiKey, taskScopes? }  → connect a model (key
 *          stored ENCRYPTED via src/lib/crypto.ts; never echoed back)
 *   GET                                               → list the caller's
 *          connections (provider/label/taskScopes/masked — NO key)
 *   DELETE ?id=N                                      → remove one you own
 *
 * Owner-auth: getUser(). A connection belongs to the authenticated user; the LLM
 * router (lib/llm/router.ts) prefers it for the pet-owner's calls on matching
 * task scopes, else falls back to the platform Grok default.
 *
 * SECURITY: the user supplies THEIR OWN provider key for THEIR OWN usage. We
 * encrypt at rest, never return it, and never log it.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rateLimit";
import { supportedProviders, CONNECTABLE_TASKS, type ProviderId, type LLMTask } from "@/lib/llm/router";

function maskKey(len: number): string {
  return len > 8 ? `••••••••${"•".repeat(Math.min(8, len - 8))}` : "••••••";
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "models-connect", limit: 10, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const provider = String(body?.provider || "") as ProviderId;
  const valid = supportedProviders().map((p) => p.id);
  if (!valid.includes(provider)) {
    return NextResponse.json({ error: `Unsupported provider. Use one of: ${valid.join(", ")}` }, { status: 400 });
  }
  const apiKey = String(body?.apiKey || "").trim();
  if (apiKey.length < 8) return NextResponse.json({ error: "apiKey is required" }, { status: 400 });

  const label = String(body?.label || provider).slice(0, 60);
  const requestedScopes: string[] = Array.isArray(body?.taskScopes) ? body.taskScopes.map(String) : [];
  const taskScopes = requestedScopes.filter((s): s is LLMTask => (CONNECTABLE_TASKS as string[]).includes(s));

  let encrypted_key: string;
  try { encrypted_key = encrypt(apiKey); }
  catch { return NextResponse.json({ error: "Server cannot store keys (encryption not configured)" }, { status: 500 }); }

  const conn = await prisma.modelConnection.create({
    data: {
      owner_user_id: user.id,
      provider,
      label,
      model: String(body?.model || "").slice(0, 80) || defaultModelFor(provider),
      encrypted_key,
      task_scopes: taskScopes,
      is_active: true,
    },
    select: { id: true, provider: true, label: true, model: true, task_scopes: true, is_active: true, created_at: true },
  });
  return NextResponse.json({ ok: true, connection: { ...conn, keyMask: maskKey(apiKey.length) } });
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conns = await prisma.modelConnection.findMany({
    where: { owner_user_id: user.id },
    orderBy: { updated_at: "desc" },
    select: { id: true, provider: true, label: true, model: true, task_scopes: true, is_active: true, created_at: true },
  });
  return NextResponse.json({ connections: conns, supported: supportedProviders(), tasks: CONNECTABLE_TASKS });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const conn = await prisma.modelConnection.findFirst({ where: { id, owner_user_id: user.id } });
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.modelConnection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

function defaultModelFor(provider: ProviderId): string {
  switch (provider) {
    case "openai": return "gpt-4.1-mini";
    case "anthropic": return "claude-sonnet-4-6";
    case "google": return "gemini-2.5-flash";
    case "openrouter": return "openrouter/auto";
    default: return "grok-3-mini";
  }
}

/**
 * /api/petclaw/cli/token — CLI personal access tokens (PAT).
 *
 *   POST   { label? }   → mint a token. The plaintext is returned ONCE; we store
 *                         only its sha256 hash. Run `petclaw-sdk auth <token>`.
 *   GET                 → list the caller's tokens (prefix/label/last-used — NO token)
 *   DELETE ?id=N        → revoke one you own (sets revoked_at; auth fails after)
 *
 * Why this exists: the CLI/SDK previously reused the short-lived (8h, nonce-bound)
 * web JWT, which a user had to copy out of browser localStorage and which broke on
 * the next logout/re-login. A PAT is long-lived, revocable, and owner-bound.
 *
 * SECURITY: managing tokens REQUIRES the interactive web session (a wallet-signed
 * JWT) — a request authenticated by a PAT cannot mint/list/revoke tokens, so a
 * leaked PAT cannot escalate into minting more durable credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  CLI_TOKEN_PREFIX,
  EXTENSION_TOKEN_PREFIX,
  getUser,
  generateCliToken,
  hashCliToken,
  isCliToken,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

const MAX_ACTIVE_TOKENS = 10;
const CLI_TOKEN_TTL_MS = 365 * 24 * 60 * 60_000; // 1 year
const EXTENSION_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days, scoped in getUser()

/** True when the caller authenticated with a PAT rather than the web session. */
function authedViaPat(req: NextRequest): boolean {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") && isCliToken(h.slice(7));
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "cli-token-mint", limit: 10, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (authedViaPat(req)) {
    return NextResponse.json({ error: "Manage CLI tokens from the web app (sign in with your wallet)." }, { status: 403 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* label is optional; empty body is fine */ }
  const purpose = body?.purpose === "extension" ? "extension" : "cli";
  const defaultLabel = purpose === "extension" ? "Chrome extension" : "CLI token";
  const label = (String(body?.label || "").trim() || defaultLabel).slice(0, 60);

  const activeCount = await prisma.cliToken.count({
    where: {
      owner_user_id: user.id,
      revoked_at: null,
      OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
    },
  });
  if (activeCount >= MAX_ACTIVE_TOKENS) {
    return NextResponse.json(
      { error: `You have ${MAX_ACTIVE_TOKENS} active CLI tokens. Revoke one before creating another.` },
      { status: 400 },
    );
  }

  const prefix = purpose === "extension" ? EXTENSION_TOKEN_PREFIX : CLI_TOKEN_PREFIX;
  const ttl = purpose === "extension" ? EXTENSION_TOKEN_TTL_MS : CLI_TOKEN_TTL_MS;
  const token = generateCliToken(prefix);
  const created = await prisma.cliToken.create({
    data: {
      owner_user_id: user.id,
      token_hash: hashCliToken(token),
      prefix: token.slice(0, 12), // pck_ + first 8 chars — for display only
      label,
      expires_at: new Date(Date.now() + ttl),
    },
    select: { id: true, prefix: true, label: true, created_at: true, expires_at: true },
  });

  // token is returned exactly once; it is never recoverable after this response.
  return NextResponse.json({ ok: true, token, purpose, cliToken: created });
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "cli-token-list", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Parity with mint/revoke: token management is web-session only — a leaked PAT
  // can't even enumerate the owner's other tokens (labels/ids that could target a revoke).
  if (authedViaPat(req)) {
    return NextResponse.json({ error: "Manage CLI tokens from the web app (sign in with your wallet)." }, { status: 403 });
  }

  const tokens = await prisma.cliToken.findMany({
    where: { owner_user_id: user.id },
    orderBy: { created_at: "desc" },
    take: 50,
    select: { id: true, prefix: true, label: true, created_at: true, last_used_at: true, revoked_at: true, expires_at: true },
  });
  return NextResponse.json({ tokens });
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, { key: "cli-token-revoke", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (authedViaPat(req)) {
    return NextResponse.json({ error: "Manage CLI tokens from the web app (sign in with your wallet)." }, { status: 403 });
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const row = await prisma.cliToken.findFirst({ where: { id, owner_user_id: user.id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!row.revoked_at) {
    await prisma.cliToken.update({ where: { id }, data: { revoked_at: new Date() } });
  }
  return NextResponse.json({ ok: true });
}

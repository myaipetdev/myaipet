/**
 * OAuth start: GET /api/auth/oauth/{provider}?petId=N&returnTo=...
 *
 * Builds the provider authorize URL with a signed state token bound to the
 * caller's pet + user, then 302 redirects.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { getProvider, isConfigured, getCallbackUrl } from "@/lib/oauth/providers";
import { signState, pkceVerifier, pkceChallenge } from "@/lib/oauth/state";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const rl = rateLimit(req, { key: "oauth-start", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) {
    // Browsers follow this redirect; sending JSON 401 would break the flow
    return NextResponse.redirect(new URL("/?auth=required", req.url));
  }

  const { provider: providerId } = await params;
  const provider = getProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  if (!isConfigured(provider)) {
    // Helpful error vs. silently failing
    return NextResponse.json(
      { error: `${provider.displayName} OAuth is not yet configured. Server admin must set ${provider.clientIdEnv} and ${provider.clientSecretEnv}.` },
      { status: 503 }
    );
  }

  // Validate petId — must belong to caller
  const petIdParam = req.nextUrl.searchParams.get("petId");
  const petId = Number(petIdParam);
  if (!Number.isInteger(petId) || petId <= 0) {
    return NextResponse.json({ error: "Invalid petId" }, { status: 400 });
  }
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id, is_active: true } });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/sovereignty";

  // PKCE for providers that require it
  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;
  if (provider.pkce) {
    codeVerifier = pkceVerifier();
    codeChallenge = pkceChallenge(codeVerifier);
  }

  const state = await signState({
    petId, userId: user.id, provider: provider.id, returnTo, codeVerifier,
  });

  // Telegram has its own flow — redirect to Telegram Login Widget host page
  if (provider.flavor === "telegram-widget") {
    const botUsername = process.env[provider.clientIdEnv] || "";
    const tgUrl = new URL("/oauth/telegram/widget", req.url);
    tgUrl.searchParams.set("bot", botUsername);
    tgUrl.searchParams.set("state", state);
    return NextResponse.redirect(tgUrl);
  }

  // Standard OAuth 2.0 authorize redirect
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", process.env[provider.clientIdEnv] || "");
  url.searchParams.set("redirect_uri", getCallbackUrl(req, provider.id));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("state", state);
  if (provider.pkce && codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(provider.extraAuthorizeParams || {})) {
    url.searchParams.set(k, v);
  }

  return NextResponse.redirect(url);
}

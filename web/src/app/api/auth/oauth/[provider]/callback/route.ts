/**
 * OAuth callback: GET /api/auth/oauth/{provider}/callback?code=...&state=...
 *
 * Verifies state, exchanges code for token, fetches profile, stores in
 * pet_platform_connections.credentials. Redirects to returnTo with success
 * or error flag.
 */

import { NextRequest, NextResponse } from "next/server";
import { getProvider, getCallbackUrl } from "@/lib/oauth/providers";
import { verifyState } from "@/lib/oauth/state";
import { saveConnection } from "@/lib/oauth/store";
import type { StoredCredentials } from "@/lib/oauth/store";
import { rateLimit } from "@/lib/rateLimit";
import { oauthConnectionsEnabled, oauthUnavailableResponse } from "@/lib/oauth/availability";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  // Do not exchange an authorization code while subscriptions are paused.
  // This deliberately precedes parsing/logging any callback parameters.
  if (!oauthConnectionsEnabled()) return oauthUnavailableResponse();

  const rl = rateLimit(req, { key: "oauth-callback", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { provider: providerId } = await params;
  const provider = getProvider(providerId);
  if (!provider) return NextResponse.redirect(new URL("/?oauth_error=unknown_provider", req.url));

  const code = req.nextUrl.searchParams.get("code");
  const stateToken = req.nextUrl.searchParams.get("state");
  const providerError = req.nextUrl.searchParams.get("error");

  if (providerError) {
    return NextResponse.redirect(new URL(`/sovereignty?oauth_error=${encodeURIComponent(providerError)}`, req.url));
  }
  if (!code || !stateToken) {
    return NextResponse.redirect(new URL("/sovereignty?oauth_error=missing_params", req.url));
  }

  const state = await verifyState(stateToken);
  if (!state || state.provider !== providerId) {
    return NextResponse.redirect(new URL("/sovereignty?oauth_error=invalid_state", req.url));
  }

  // ── Exchange code for token ──
  const tokenBody = new URLSearchParams({
    client_id: process.env[provider.clientIdEnv] || "",
    client_secret: process.env[provider.clientSecretEnv] || "",
    code,
    grant_type: "authorization_code",
    redirect_uri: getCallbackUrl(req, provider.id),
  });
  if (provider.pkce && state.codeVerifier) {
    tokenBody.set("code_verifier", state.codeVerifier);
  }

  let tokenJson: any = null;
  try {
    const res = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: tokenBody.toString(),
    });
    tokenJson = await res.json().catch(() => null);
    if (!res.ok || !tokenJson?.access_token) {
      console.error(`[oauth/${providerId}] token exchange failed:`, res.status, tokenJson?.error || tokenJson);
      return NextResponse.redirect(new URL(`/sovereignty?oauth_error=token_exchange_failed`, req.url));
    }
  } catch (e: any) {
    console.error(`[oauth/${providerId}] token exchange threw:`, e?.message);
    return NextResponse.redirect(new URL(`/sovereignty?oauth_error=token_network`, req.url));
  }

  // ── Fetch profile (best-effort) ──
  let profile: StoredCredentials["profile"] | undefined;
  if (provider.profileUrl) {
    try {
      const res = await fetch(provider.profileUrl, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      if (res.ok) {
        const p = await res.json();
        // Normalize across providers
        profile = {
          id: String(p.id || p.data?.id || ""),
          username: p.username || p.login || p.data?.username || undefined,
          displayName: p.global_name || p.name || p.data?.name || undefined,
          avatarUrl: p.avatar_url || (p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png` : undefined),
        };
      }
    } catch (e: any) {
      console.warn(`[oauth/${providerId}] profile fetch failed:`, e?.message);
    }
  }

  // ── Persist ──
  const expiresAt = tokenJson.expires_in ? Date.now() + tokenJson.expires_in * 1000 : undefined;
  const stored: StoredCredentials = {
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token,
    expires_at: expiresAt,
    scope: tokenJson.scope,
    token_type: tokenJson.token_type,
    profile,
  };

  try {
    await saveConnection(state.petId, providerId, stored, {
      grantedScopes: tokenJson.scope?.split(" ") || provider.scopes,
    });
  } catch (e: any) {
    console.error(`[oauth/${providerId}] save failed:`, e?.message);
    return NextResponse.redirect(new URL(`/sovereignty?oauth_error=save_failed`, req.url));
  }

  // Success — back to where the user came from with a success flag
  const returnTo = new URL(state.returnTo || "/sovereignty", req.url);
  returnTo.searchParams.set("connected", providerId);
  return NextResponse.redirect(returnTo);
}

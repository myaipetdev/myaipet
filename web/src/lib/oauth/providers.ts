/**
 * OAuth 2.0 provider configurations.
 *
 * Each provider declares the URLs, scopes, and env-var names for its
 * client credentials. The runtime checks at start() time whether the
 * provider's credentials are configured — providers without keys are
 * surfaced as "coming soon" in the UI instead of breaking.
 *
 * Token storage is unified into pet_platform_connections.credentials
 * (JSON: { access_token, refresh_token?, expires_at?, profile? }).
 */

export type OAuthFlavor = "oauth2-pkce" | "oauth2" | "telegram-widget";

export interface OAuthProvider {
  id: string;                     // matches pet_platform_connections.platform
  displayName: string;
  flavor: OAuthFlavor;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  profileUrl?: string;            // optional — fetched after token exchange
  clientIdEnv: string;
  clientSecretEnv: string;
  extraAuthorizeParams?: Record<string, string>;
  pkce?: boolean;
}

export const PROVIDERS: Record<string, OAuthProvider> = {
  discord: {
    id: "discord",
    displayName: "Discord",
    flavor: "oauth2",
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    profileUrl: "https://discord.com/api/users/@me",
    scopes: ["identify", "guilds"],
    clientIdEnv: "DISCORD_CLIENT_ID",
    clientSecretEnv: "DISCORD_CLIENT_SECRET",
  },
  github: {
    id: "github",
    displayName: "GitHub",
    flavor: "oauth2",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    profileUrl: "https://api.github.com/user",
    scopes: ["read:user"],
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
  twitter: {
    id: "twitter",
    displayName: "Twitter/X",
    flavor: "oauth2-pkce",
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    profileUrl: "https://api.twitter.com/2/users/me",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    clientIdEnv: "TWITTER_CLIENT_ID",
    clientSecretEnv: "TWITTER_CLIENT_SECRET",
    pkce: true,
  },
  telegram: {
    // Telegram doesn't use OAuth 2.0 — instead the Login Widget redirects
    // with signed user data. We handle it as a special flavor.
    id: "telegram",
    displayName: "Telegram",
    flavor: "telegram-widget",
    authorizeUrl: "",  // computed at runtime from bot username
    tokenUrl: "",
    scopes: [],
    clientIdEnv: "TELEGRAM_BOT_USERNAME",
    clientSecretEnv: "TELEGRAM_BOT_TOKEN",
  },
};

export function getProvider(id: string): OAuthProvider | null {
  return PROVIDERS[id] || null;
}

/** Whether the provider has the env credentials needed to actually run. */
export function isConfigured(provider: OAuthProvider): boolean {
  const id = process.env[provider.clientIdEnv];
  const secret = process.env[provider.clientSecretEnv];
  return !!(id && secret);
}

export function listProviders(): Array<{ id: string; displayName: string; configured: boolean; flavor: OAuthFlavor }> {
  return Object.values(PROVIDERS).map(p => ({
    id: p.id,
    displayName: p.displayName,
    configured: isConfigured(p),
    flavor: p.flavor,
  }));
}

export function getCallbackUrl(req: { headers: Headers; nextUrl?: URL }, provider: string): string {
  const host = req.headers.get("host") || "app.myaipet.ai";
  const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/auth/oauth/${provider}/callback`;
}

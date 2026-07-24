let cachedBrowserToken: string | null = null;

export type PaidRunAuthContext = {
  token: string;
  ownerKey: string;
};

export function setApiAuthToken(token: string | null): void {
  cachedBrowserToken = token;
}

export function getApiAuthToken(): string | null {
  const stored = typeof window !== "undefined"
    ? window.localStorage.getItem("petagen_jwt")
    : null;
  const token = cachedBrowserToken || stored;
  if (token && !cachedBrowserToken) cachedBrowserToken = token;
  return token;
}

/**
 * Return the exact bearer credential a paid browser run must use, bound to the
 * owner identity encoded by that credential. A tab-local cached token and the
 * shared localStorage session must agree; otherwise another tab may have
 * switched accounts and starting or reconciling a paid run would mislabel its
 * fail-closed journal marker.
 */
export function getPaidRunAuthContext(): PaidRunAuthContext {
  if (typeof window === "undefined") {
    throw new Error("Paid runs require an authenticated browser session.");
  }
  const storedToken = window.localStorage.getItem("petagen_jwt");
  const token = cachedBrowserToken || storedToken;

  // Local development has an explicit mock identity and never reaches the
  // production paid endpoint. Keep it usable without weakening production's
  // credential/storage equality requirement.
  if (process.env.NODE_ENV === "development" && token === "dev-token") {
    return { token, ownerKey: "dev:0xdev1234567890abcdef1234567890abcdef1234" };
  }
  if (!token || !storedToken || token !== storedToken) {
    throw new Error("The signed-in session changed in another tab. Refresh before running a paid agent.");
  }

  const rawUser = window.localStorage.getItem("petagen_user");
  const storedUser: unknown = rawUser ? JSON.parse(rawUser) : null;
  const storedWallet = (
    storedUser
    && typeof storedUser === "object"
    && "wallet_address" in storedUser
    && typeof (storedUser as { wallet_address?: unknown }).wallet_address === "string"
  )
    ? (storedUser as { wallet_address: string }).wallet_address.trim().toLowerCase()
    : "";

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("The paid-run session credential is not a valid signed-in session.");
  }
  const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const payload: unknown = JSON.parse(
    globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")),
  );
  if (!payload || typeof payload !== "object") {
    throw new Error("The paid-run session identity is unavailable.");
  }
  const claims = payload as { sub?: unknown; wallet?: unknown; exp?: unknown };
  const subject = typeof claims.sub === "string" ? claims.sub.trim() : "";
  const wallet = typeof claims.wallet === "string" ? claims.wallet.trim().toLowerCase() : "";
  if (
    !/^[1-9][0-9]*$/.test(subject)
    || wallet.length < 3
    || wallet.length > 128
    || storedWallet !== wallet
    || typeof claims.exp !== "number"
    || claims.exp * 1000 <= Date.now()
  ) {
    throw new Error("The paid-run session identity does not match the signed-in account.");
  }
  return { token, ownerKey: `session:${subject}:${wallet}` };
}

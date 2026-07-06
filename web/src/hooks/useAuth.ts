"use client";

/**
 * PETAGEN Auth Hook
 * SIWE-based authentication with JWT persisted in localStorage.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { api } from "@/lib/api";
import { CONTRACTS } from "@/lib/contracts";

// SIWE chain id — sourced from the single on-chain config so BSC→Base is an
// env change (NEXT_PUBLIC_CHAIN_ID). Mirrored server-side in lib/onchain.ts.
const SIWE_CHAIN_ID = CONTRACTS.chainId;

const TOKEN_KEY = "petagen_jwt";
const USER_KEY = "petagen_user";

function loadStored(): { token: string | null; user: any } {
  if (typeof window === "undefined") return { token: null, user: null };
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const user = localStorage.getItem(USER_KEY);
    return { token, user: user ? JSON.parse(user) : null };
  } catch {
    return { token: null, user: null };
  }
}

export function useAuth() {
  const { address, isConnected, status } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const isDev = process.env.NODE_ENV === "development";

  const [token, setToken] = useState<string | null>(() => isDev ? "dev-token" : loadStored().token);
  const [user, setUser] = useState<any>(() => isDev ? { wallet_address: "0xDEV1234567890abcdef1234567890abcdef1234", credits: 9999 } : loadStored().user);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevAddress = useRef<string | null>(null);
  const initialized = useRef(false);
  const wasConnected = useRef(false);

  const isAuthenticated = isDev ? true : (!!token && !!user);

  // Restore token to api on mount
  useEffect(() => {
    if (token) {
      api.setToken(token);
    }
  }, []);

  const saveAuth = (newToken: string, newUser: any) => {
    setToken(newToken);
    setUser(newUser);
    api.setToken(newToken);
    try {
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    } catch {}
  };

  const clearAuth = () => {
    setToken(null);
    setUser(null);
    api.setToken(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
  };

  const authenticate = useCallback(async () => {
    if (!address) return;
    if (isAuthenticating) {
      // If stuck authenticating, reset
      setIsAuthenticating(false);
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // SIWE is identity-only — it works on any chain and needs no on-chain tx.
      // We intentionally do NOT force a chain switch here (the UI promises
      // "no gas, identity only"); a switchChain prompt at sign-in surprised
      // users. Genuine on-chain-tx flows (e.g. adoption) keep their own
      // switch-to-chain logic where the gas is actually spent.
      const nonceRes = await api.auth.getNonce(address, SIWE_CHAIN_ID);
      const signature = await signMessageAsync({ account: address, message: nonceRes.message });
      const authRes = await api.auth.verify(nonceRes.message, signature);

      saveAuth(authRes.token, {
        wallet_address: authRes.wallet_address,
        credits: authRes.credits,
      });
    } catch (err: any) {
      console.error("Auth failed:", err);
      setError(err.message || "Authentication failed. Tap Sign In to retry.");
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, isAuthenticating, signMessageAsync]);

  const logout = useCallback(async () => {
    // SCRUM-58: notify server to rotate the session nonce, invalidating this
    // and any other JWT for this account. Fire-and-forget — even if it fails,
    // we still wipe client-side state.
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {}
    clearAuth();
  }, [token]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const me = await api.auth.getMe();
      const newUser = { wallet_address: me.wallet_address, credits: me.credits, season_points: me.season_points };
      setUser(newUser);
      try { localStorage.setItem(USER_KEY, JSON.stringify(newUser)); } catch {}
    } catch {
      clearAuth();
    }
  }, [token]);

  // Validate stored token on mount, or auto-auth if wallet connected
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (token && isConnected) {
      // Validate existing token
      api.setToken(token);
      api.auth.getMe().then((me: any) => {
        const newUser = { wallet_address: me.wallet_address, credits: me.credits, season_points: me.season_points };
        setUser(newUser);
        try { localStorage.setItem(USER_KEY, JSON.stringify(newUser)); } catch {}
      }).catch(() => {
        // Token expired, clear and re-auth
        clearAuth();
        prevAddress.current = null; // Reset so auto-auth triggers
      });
    }
  }, []);

  // Restore auth from storage when wallet connects, or clear on a genuine
  // disconnect.
  useEffect(() => {
    // SCRUM-104: account switched in the wallet. wagmi flips `address`, but we were
    // still holding the PREVIOUS account's token/user (isAuthenticated stays true),
    // so the connect branch below — gated on !isAuthenticated — never ran and the
    // app kept showing Account 1's pets/cards/rewards until a full disconnect+reconnect.
    // Detect the address↔user mismatch and swap accounts: restore the new account's
    // stored session if present, otherwise clear (drop the stale one, prompt re-auth).
    if (!isDev && isConnected && address && user?.wallet_address &&
        user.wallet_address.toLowerCase() !== address.toLowerCase()) {
      const stored = loadStored();
      if (stored.token && stored.user?.wallet_address?.toLowerCase() === address.toLowerCase()) {
        api.setToken(stored.token);
        setToken(stored.token);
        setUser(stored.user);
      } else {
        clearAuth();
      }
      prevAddress.current = address;
      return;
    }
    if (isConnected && address) {
      wasConnected.current = true;
      if (!isAuthenticated && !isAuthenticating && prevAddress.current !== address) {
        prevAddress.current = address;
        // Try restoring from storage only (no auto sign-in)
        const stored = loadStored();
        if (stored.token && stored.user?.wallet_address?.toLowerCase() === address.toLowerCase()) {
          api.setToken(stored.token);
          setToken(stored.token);
          setUser(stored.user);
        }
      }
    }
    // Only clear on a SETTLED disconnect we actually transitioned into — never
    // during wagmi's initial "connecting"/"reconnecting" phase on a fresh page
    // load. The old code called logout() here, which rotates the server-side
    // session nonce; because every full navigation (e.g. to/from /studio) boots
    // with status !== "connected" for a tick, it invalidated the stored JWT and
    // forced a brand-new wallet signature on every page change. We now do a
    // LOCAL-only clear and reserve nonce rotation for explicit user logout.
    if (status === "disconnected" && wasConnected.current) {
      wasConnected.current = false;
      prevAddress.current = null;
      clearAuth();
    }
  }, [isConnected, address, isAuthenticated, isAuthenticating, status]);

  return {
    token,
    user,
    isAuthenticated,
    isAuthenticating,
    error,
    authenticate,
    logout,
    refreshUser,
  };
}

"use client";

/**
 * PETAGEN Auth Hook
 * SIWE-based authentication with JWT persisted in localStorage.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage, useSwitchChain } from "wagmi";
import { api } from "@/lib/api";

const BSC_CHAIN_ID = 56;

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
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();

  const isDev = process.env.NODE_ENV === "development";

  const [token, setToken] = useState<string | null>(() => isDev ? "dev-token" : loadStored().token);
  const [user, setUser] = useState<any>(() => isDev ? { wallet_address: "0xDEV1234567890abcdef1234567890abcdef1234", credits: 9999 } : loadStored().user);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevAddress = useRef<string | null>(null);
  const initialized = useRef(false);

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
      // Switch to BSC before signing
      if (chainId !== BSC_CHAIN_ID) {
        await switchChainAsync({ chainId: BSC_CHAIN_ID });
      }

      const nonceRes = await api.auth.getNonce(address, BSC_CHAIN_ID);
      const signature = await signMessageAsync({ message: nonceRes.message });
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

  const logout = useCallback(() => {
    clearAuth();
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const me = await api.auth.getMe();
      const newUser = { wallet_address: me.wallet_address, credits: me.credits };
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
        const newUser = { wallet_address: me.wallet_address, credits: me.credits };
        setUser(newUser);
        try { localStorage.setItem(USER_KEY, JSON.stringify(newUser)); } catch {}
      }).catch(() => {
        // Token expired, clear and re-auth
        clearAuth();
        prevAddress.current = null; // Reset so auto-auth triggers
      });
    }
  }, []);

  // Restore auth from storage when wallet connects, or clear on disconnect
  useEffect(() => {
    if (isConnected && address && !isAuthenticated && !isAuthenticating) {
      if (prevAddress.current !== address) {
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
    if (!isConnected) {
      logout();
      prevAddress.current = null;
    }
  }, [isConnected, address, isAuthenticated, isAuthenticating, logout]);

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

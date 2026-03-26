/**
 * PETAGEN Auth Hook
 * SIWE-based authentication with JWT stored in memory.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { api } from "../api";

export function useAuth() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState(null);
  const prevAddress = useRef(null);

  const isAuthenticated = !!token && !!user;

  const authenticate = useCallback(async () => {
    if (!address || isAuthenticating) return;

    setIsAuthenticating(true);
    setError(null);

    try {
      // 1. Get nonce from backend
      const nonceRes = await api.auth.getNonce(address);

      // 2. Sign the SIWE message
      const signature = await signMessageAsync({
        message: nonceRes.message,
      });

      // 3. Verify signature and get JWT
      const authRes = await api.auth.verify(nonceRes.message, signature);

      // 4. Store token in memory (not localStorage)
      setToken(authRes.token);
      api.setToken(authRes.token);

      setUser({
        wallet_address: authRes.wallet_address,
        credits: authRes.credits,
      });
    } catch (err) {
      console.error("Auth failed:", err);
      setError(err.message || "Authentication failed");
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, isAuthenticating, signMessageAsync]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    api.setToken(null);
  }, []);

  // Refresh user info
  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const me = await api.auth.getMe();
      setUser({
        wallet_address: me.wallet_address,
        credits: me.credits,
      });
    } catch {
      // Token expired
      logout();
    }
  }, [token, logout]);

  // Auto-authenticate when wallet connects
  useEffect(() => {
    if (isConnected && address && !isAuthenticated && !isAuthenticating) {
      if (prevAddress.current !== address) {
        prevAddress.current = address;
        authenticate();
      }
    }
    if (!isConnected) {
      logout();
      prevAddress.current = null;
    }
  }, [isConnected, address, isAuthenticated, isAuthenticating, authenticate, logout]);

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

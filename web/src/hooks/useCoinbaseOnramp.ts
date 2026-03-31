"use client";

import { useAccount } from "wagmi";
import { getAuthHeaders } from "@/lib/api";

const COINBASE_APP_ID = (
  process.env.NEXT_PUBLIC_COINBASE_ONRAMP_APP_ID || ""
).trim();

export function useCoinbaseOnramp() {
  const { address } = useAccount();
  const isAvailable = !!COINBASE_APP_ID && !!address;

  const openOnramp = async (fiatAmount: number) => {
    if (!address || !COINBASE_APP_ID) return;

    try {
      // Get session token from our backend
      const res = await fetch("/api/coinbase/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create session");
      }

      const { token } = await res.json();

      // Open Coinbase Onramp with session token
      const params = new URLSearchParams({
        sessionToken: token,
        defaultAsset: "USDC",
        defaultNetwork: "base",
        presetFiatAmount: String(fiatAmount),
        fiatCurrency: "USD",
      });

      const url = `https://pay.coinbase.com/buy/select-asset?${params.toString()}`;
      window.open(
        url,
        "coinbase-onramp",
        "width=460,height=700,scrollbars=yes"
      );
    } catch (error: any) {
      console.error("Coinbase Onramp error:", error);
      console.error("Payment error:", error?.message);
    }
  };

  return { openOnramp, isAvailable };
}

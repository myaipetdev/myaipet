"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { base, bsc, mainnet } from "wagmi/chains";
import { parseUnits } from "viem";
import { CONTRACTS } from "@/lib/contracts";

// Paid token address comes from the single on-chain config (CONTRACTS.usdt),
// so a BSC→Base swap is an env change (NEXT_PUBLIC_USDT_CONTRACT), not a code edit.
const USDT_ADDRESS = CONTRACTS.usdt as `0x${string}`;
const targetChainId = CONTRACTS.chainId;
const targetChain = targetChainId === base.id ? base : targetChainId === mainnet.id ? mainnet : bsc;
const TRANSFER_ABI = [{
  name: "transfer",
  type: "function",
  stateMutability: "nonpayable",
  inputs: [
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
}] as const;

export function useDirectUsdtPay() {
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { address } = useAccount();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const [error, setError] = useState<string | null>(null);
  const [treasury, setTreasury] = useState<`0x${string}` | "">(
    ((process.env.NEXT_PUBLIC_TREASURY_WALLET || "").trim() as `0x${string}`) || ""
  );

  // Runtime fetch — covers builds where NEXT_PUBLIC_TREASURY_WALLET wasn't set at build time
  useEffect(() => {
    if (treasury) return;
    fetch("/api/config")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.treasury && /^0x[a-fA-F0-9]{40}$/.test(d.treasury)) {
          setTreasury(d.treasury as `0x${string}`);
        }
      })
      .catch(() => {});
  }, [treasury]);

  const pay = async (amountUsd: number): Promise<{ hash: `0x${string}` } | { error: string }> => {
    setError(null);
    if (!treasury || !/^0x[a-fA-F0-9]{40}$/.test(treasury)) {
      const msg = "Treasury wallet not configured. Contact support.";
      setError(msg);
      return { error: msg };
    }
    if (!address) {
      const msg = "Wallet is not connected. Connect your wallet and try again.";
      setError(msg);
      return { error: msg };
    }
    try {
      // BSC-USD / Base USDC both use the configured decimal count
      const amountWei = parseUnits(String(amountUsd), CONTRACTS.usdtDecimals);
      const tx = await writeContractAsync({
        address: USDT_ADDRESS,
        abi: TRANSFER_ABI,
        functionName: "transfer",
        args: [treasury, amountWei],
        account: address,
        chain: targetChain,
        chainId: targetChainId,
      });
      return { hash: tx };
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "USDT transfer failed";
      setError(msg);
      return { error: msg };
    }
  };

  return {
    pay,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    treasuryConfigured: !!treasury && /^0x[a-fA-F0-9]{40}$/.test(treasury),
    treasury,
  };
}

"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";

const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955" as const;
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
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const [error, setError] = useState<string | null>(null);

  const treasury = (process.env.NEXT_PUBLIC_TREASURY_WALLET || "").trim() as `0x${string}`;

  const pay = async (amountUsd: number): Promise<{ hash: `0x${string}` } | { error: string }> => {
    setError(null);
    if (!treasury || !/^0x[a-fA-F0-9]{40}$/.test(treasury)) {
      const msg = "Treasury wallet not configured. Contact support.";
      setError(msg);
      return { error: msg };
    }
    try {
      // BSC-USD uses 18 decimals
      const amountWei = parseUnits(String(amountUsd), 18);
      const tx = await writeContractAsync({
        address: USDT_BSC,
        abi: TRANSFER_ABI,
        functionName: "transfer",
        args: [treasury, amountWei],
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

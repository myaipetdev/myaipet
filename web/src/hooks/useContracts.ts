"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { CONTRACTS, PETShopABI, PETTokenABI, PetaGenTrackerABI, ERC20_ABI } from "@/lib/contracts";

const bscChainId = 56;

// ── Read $PET balance ──
export function usePETBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.petToken as `0x${string}`,
    abi: PETTokenABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: bscChainId,
    query: { enabled: !!address && !!CONTRACTS.petToken },
  });
}

// ── Read USDT allowance for shop ──
export function useUSDTAllowance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.usdt as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && CONTRACTS.petShop ? [address, CONTRACTS.petShop as `0x${string}`] : undefined,
    chainId: bscChainId,
    query: { enabled: !!address && !!CONTRACTS.petShop },
  });
}

// ── Read USDT balance ──
export function useUSDTBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.usdt as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: bscChainId,
    query: { enabled: !!address },
  });
}

// ── Read tracker stats ──
export function useTrackerStats() {
  return useReadContract({
    address: CONTRACTS.tracker as `0x${string}`,
    abi: PetaGenTrackerABI,
    functionName: "getStats",
    chainId: bscChainId,
    query: { enabled: !!CONTRACTS.tracker },
  });
}

// ── Write: Approve USDT ──
export function useApproveUSDT() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: bigint) => {
    writeContract({
      address: CONTRACTS.usdt as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACTS.petShop as `0x${string}`, amount],
      chainId: bscChainId,
    });
  };

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

// ── Write: Purchase PET ──
export function usePurchasePET() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const purchase = (tierKey: string, expectedPrice: bigint, expectedAmount: bigint) => {
    writeContract({
      address: CONTRACTS.petShop as `0x${string}`,
      abi: PETShopABI,
      functionName: "purchase",
      args: [tierKey, expectedPrice, expectedAmount],
      chainId: bscChainId,
    });
  };

  return { purchase, hash, isPending, isConfirming, isSuccess, error };
}

// ── Helpers ──
export const TIER_USDT: Record<string, bigint> = {
  starter: parseEther("5"),
  creator: parseEther("20"),
  pro: parseEther("50"),
};

export const TIER_PET: Record<string, bigint> = {
  starter: parseEther("500"),
  creator: parseEther("2500"),
  pro: parseEther("10000"),
};

export { parseEther, formatEther };

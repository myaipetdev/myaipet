"use client";

import { useWriteContract, useAccount, useSwitchChain, useBalance } from "wagmi";
import { base, bsc, mainnet } from "wagmi/chains";
import { CONTRACTS, PETActivityABI } from "@/lib/contracts";

// Single source of truth for the target chain (BSC today → Base via
// NEXT_PUBLIC_CHAIN_ID). Mirrored server-side in lib/onchain.ts.
const targetChainId = CONTRACTS.chainId;
const targetChain = targetChainId === base.id ? base : targetChainId === mainnet.id ? mainnet : bsc;
const NATIVE_SYMBOL = CONTRACTS.nativeSymbol; // BNB on BSC, ETH on Base
const MIN_GAS = BigInt(5e13); // 0.00005 native token minimum for gas (~$0.03)

/** A configured address never overrides the exact public blockchain gate. */
export function isPETActivityEnabled(): boolean {
  return CONTRACTS.blockchainEnabled && Boolean(CONTRACTS.petActivity);
}

/** Check native-gas-token balance and throw if insufficient */
function checkBalance(balance: bigint | undefined) {
  if (balance !== undefined && balance < MIN_GAS) {
    throw new Error(`Insufficient ${NATIVE_SYMBOL} balance. You need at least 0.001 ${NATIVE_SYMBOL} in your wallet to record this on-chain.`);
  }
}

/** Pre-check hook: check gas balance and switch to the target chain before starting a flow */
export function useCheckBnbBalance() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: balanceData } = useBalance({ address, chainId: targetChainId });

  const checkBnb = (): boolean => {
    if (balanceData?.value !== undefined && balanceData.value < MIN_GAS) {
      return false;
    }
    return true;
  };

  const switchToBsc = async () => {
    if (chainId !== targetChainId) {
      await switchChainAsync({ chainId: targetChainId });
    }
  };

  return { checkBnb, switchToBsc, bnbBalance: balanceData?.value };
}

// ── Record adoption on-chain ──
export function useRecordAdoption() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: balanceData } = useBalance({ address, chainId: targetChainId });

  const recordAdoption = async (petName: string, species: string) => {
    if (!isPETActivityEnabled()) return;
    if (!address) throw new Error("Wallet is not connected. Connect your wallet and try again.");

    checkBalance(balanceData?.value);

    if (chainId !== targetChainId) {
      await switchChainAsync({ chainId: targetChainId });
    }

    await writeContractAsync({
      address: CONTRACTS.petActivity as `0x${string}`,
      abi: PETActivityABI,
      functionName: "recordAdoption",
      args: [petName, species],
      account: address,
      chain: targetChain,
      chainId: targetChainId,
    });
  };

  return { recordAdoption, hash, isPending, error };
}

// ── Record image generation on-chain ──
export function useRecordImageGeneration() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: balanceData } = useBalance({ address, chainId: targetChainId });

  const recordImageGeneration = async (petId: number, style: number) => {
    if (!isPETActivityEnabled()) return;
    if (!address) throw new Error("Wallet is not connected. Connect your wallet and try again.");

    checkBalance(balanceData?.value);

    if (chainId !== targetChainId) {
      await switchChainAsync({ chainId: targetChainId });
    }

    await writeContractAsync({
      address: CONTRACTS.petActivity as `0x${string}`,
      abi: PETActivityABI,
      functionName: "recordImageGeneration",
      args: [BigInt(petId), style],
      account: address,
      chain: targetChain,
      chainId: targetChainId,
    });
  };

  return { recordImageGeneration, hash, isPending, error };
}

// ── Record video generation on-chain ──
export function useRecordVideoGeneration() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: balanceData } = useBalance({ address, chainId: targetChainId });

  const recordVideoGeneration = async (petId: number, style: number, duration: number) => {
    if (!isPETActivityEnabled()) return;
    if (!address) throw new Error("Wallet is not connected. Connect your wallet and try again.");

    checkBalance(balanceData?.value);

    if (chainId !== targetChainId) {
      await switchChainAsync({ chainId: targetChainId });
    }

    await writeContractAsync({
      address: CONTRACTS.petActivity as `0x${string}`,
      abi: PETActivityABI,
      functionName: "recordVideoGeneration",
      args: [BigInt(petId), style, duration],
      account: address,
      chain: targetChain,
      chainId: targetChainId,
    });
  };

  return { recordVideoGeneration, hash, isPending, error };
}

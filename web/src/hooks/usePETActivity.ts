"use client";

import { useWriteContract, useAccount, useSwitchChain, useBalance } from "wagmi";
import { CONTRACTS, PETActivityABI } from "@/lib/contracts";

const bscChainId = 56;
const MIN_BNB = BigInt(5e13); // 0.00005 BNB minimum for gas (~$0.03)

/** Returns true if the PETActivity contract address is configured */
export function isPETActivityEnabled(): boolean {
  return !!CONTRACTS.petActivity;
}

/** Check BNB balance and throw if insufficient */
function checkBalance(balance: bigint | undefined) {
  if (balance !== undefined && balance < MIN_BNB) {
    throw new Error("BNB 잔액이 부족합니다. 온체인 기록을 위해 BSC 지갑에 최소 0.001 BNB가 필요합니다.");
  }
}

/** Pre-check hook: check BNB balance and switch to BSC before starting a flow */
export function useCheckBnbBalance() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: balanceData } = useBalance({ address, chainId: bscChainId });

  const checkBnb = (): boolean => {
    if (balanceData?.value !== undefined && balanceData.value < MIN_BNB) {
      return false;
    }
    return true;
  };

  const switchToBsc = async () => {
    if (chainId !== bscChainId) {
      await switchChainAsync({ chainId: bscChainId });
    }
  };

  return { checkBnb, switchToBsc, bnbBalance: balanceData?.value };
}

// ── Record adoption on-chain ──
export function useRecordAdoption() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: balanceData } = useBalance({ address, chainId: bscChainId });

  const recordAdoption = async (petName: string, species: string) => {
    if (!isPETActivityEnabled()) return;

    checkBalance(balanceData?.value);

    if (chainId !== bscChainId) {
      await switchChainAsync({ chainId: bscChainId });
    }

    await writeContractAsync({
      address: CONTRACTS.petActivity as `0x${string}`,
      abi: PETActivityABI,
      functionName: "recordAdoption",
      args: [petName, species],
      chainId: bscChainId,
    });
  };

  return { recordAdoption, hash, isPending, error };
}

// ── Record image generation on-chain ──
export function useRecordImageGeneration() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: balanceData } = useBalance({ address, chainId: bscChainId });

  const recordImageGeneration = async (petId: number, style: number) => {
    if (!isPETActivityEnabled()) return;

    checkBalance(balanceData?.value);

    if (chainId !== bscChainId) {
      await switchChainAsync({ chainId: bscChainId });
    }

    await writeContractAsync({
      address: CONTRACTS.petActivity as `0x${string}`,
      abi: PETActivityABI,
      functionName: "recordImageGeneration",
      args: [BigInt(petId), style],
      chainId: bscChainId,
    });
  };

  return { recordImageGeneration, hash, isPending, error };
}

// ── Record video generation on-chain ──
export function useRecordVideoGeneration() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: balanceData } = useBalance({ address, chainId: bscChainId });

  const recordVideoGeneration = async (petId: number, style: number, duration: number) => {
    if (!isPETActivityEnabled()) return;

    checkBalance(balanceData?.value);

    if (chainId !== bscChainId) {
      await switchChainAsync({ chainId: bscChainId });
    }

    await writeContractAsync({
      address: CONTRACTS.petActivity as `0x${string}`,
      abi: PETActivityABI,
      functionName: "recordVideoGeneration",
      args: [BigInt(petId), style, duration],
      chainId: bscChainId,
    });
  };

  return { recordVideoGeneration, hash, isPending, error };
}

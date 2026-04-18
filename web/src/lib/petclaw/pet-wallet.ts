/**
 * PetClaw Pet Wallet
 * Tracks per-pet earnings — revenue accrues to soul NFT owner
 * Simplified for Phase 1: credit-based, on-chain settlement later
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export interface PetWallet {
  petId: number;
  ownerWallet: string;
  balance: number;       // earned credits
  totalEarned: number;
  totalSpent: number;
  dailyLimit: number;
  createdAt: string;
}

export interface PetTransaction {
  id: string;
  petId: number;
  amount: number;
  type: "earn" | "spend";
  reason: string;
  timestamp: string;
}

// Generate deterministic wallet address for a pet
export function generatePetWalletAddress(petId: number, ownerWallet: string): string {
  const hash = createHash("sha256")
    .update(`petclaw:wallet:${ownerWallet.toLowerCase()}:${petId}`)
    .digest("hex");
  return "0x" + hash.slice(0, 40);
}

// Get or create pet wallet (uses pet's personality_modifiers JSON for storage)
export async function getPetWallet(petId: number): Promise<PetWallet | null> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    include: { user: true },
  });
  if (!pet || !pet.user) return null;

  const mods = (pet.personality_modifiers as Record<string, unknown>) || {};

  return {
    petId: pet.id,
    ownerWallet: pet.user.wallet_address,
    balance: (mods.wallet_balance as number) || 0,
    totalEarned: (mods.wallet_total_earned as number) || 0,
    totalSpent: (mods.wallet_total_spent as number) || 0,
    dailyLimit: (mods.wallet_daily_limit as number) || 50,
    createdAt: pet.created_at.toISOString(),
  };
}

// Credit pet wallet (e.g., someone interacted with this pet)
export async function creditPetWallet(
  petId: number,
  amount: number,
  reason: string
): Promise<{ balance: number }> {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) throw new Error("Pet not found");

  const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
  const currentBalance = (mods.wallet_balance as number) || 0;
  const totalEarned = (mods.wallet_total_earned as number) || 0;

  const newBalance = currentBalance + amount;

  await prisma.pet.update({
    where: { id: petId },
    data: {
      personality_modifiers: {
        ...mods,
        wallet_balance: newBalance,
        wallet_total_earned: totalEarned + amount,
      },
    },
  });

  return { balance: newBalance };
}

// Deduct from pet wallet
export async function deductPetWallet(
  petId: number,
  amount: number,
  reason: string
): Promise<{ success: boolean; balance: number }> {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) throw new Error("Pet not found");

  const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
  const currentBalance = (mods.wallet_balance as number) || 0;
  const totalSpent = (mods.wallet_total_spent as number) || 0;

  if (currentBalance < amount) {
    return { success: false, balance: currentBalance };
  }

  const newBalance = currentBalance - amount;

  await prisma.pet.update({
    where: { id: petId },
    data: {
      personality_modifiers: {
        ...mods,
        wallet_balance: newBalance,
        wallet_total_spent: totalSpent + amount,
      },
    },
  });

  return { success: true, balance: newBalance };
}

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

// Adjust a pet's wallet balance under a row lock. The balance lives inside the
// `personality_modifiers` JSON, so a naive read→modify→write-whole-blob lets two
// concurrent invokes both read the old balance and lose one debit/credit
// (double-spend / lost earnings), and clobbers any other concurrent writer of
// that JSON. We SELECT … FOR UPDATE the row and write the recomputed blob in the
// SAME transaction, which serializes concurrent settlements on a pet. Pass a
// transaction `client` to settle a matching debit + credit atomically.
async function adjustPetWallet(
  client: any,
  petId: number,
  delta: number, // +credit, −debit
  requireFunds = false,
): Promise<{ success: boolean; balance: number }> {
  const rows: Array<{ personality_modifiers: unknown }> = await client.$queryRaw`
    SELECT personality_modifiers FROM pets WHERE id = ${petId} FOR UPDATE
  `;
  if (!rows.length) throw new Error(`Pet ${petId} not found`);

  let mods: Record<string, unknown> = {};
  const raw = rows[0].personality_modifiers;
  if (raw && typeof raw === "object") mods = raw as Record<string, unknown>;
  else if (typeof raw === "string") { try { mods = JSON.parse(raw); } catch { /* keep {} */ } }

  const currentBalance = (mods.wallet_balance as number) || 0;
  if (requireFunds && currentBalance + delta < 0) {
    return { success: false, balance: currentBalance };
  }
  const newBalance = currentBalance + delta;
  const totalEarned = (mods.wallet_total_earned as number) || 0;
  const totalSpent = (mods.wallet_total_spent as number) || 0;

  await client.pet.update({
    where: { id: petId },
    data: {
      personality_modifiers: {
        ...mods,
        wallet_balance: newBalance,
        ...(delta >= 0
          ? { wallet_total_earned: totalEarned + delta }
          : { wallet_total_spent: totalSpent - delta }),
      },
    },
  });
  return { success: true, balance: newBalance };
}

// Credit pet wallet (e.g., someone interacted with this pet). Pass `tx` to run
// inside a caller's transaction so it's atomic with the matching debit.
export async function creditPetWallet(
  petId: number,
  amount: number,
  reason: string,
  tx?: any,
): Promise<{ balance: number }> {
  const r = tx
    ? await adjustPetWallet(tx, petId, amount)
    : await prisma.$transaction((c: any) => adjustPetWallet(c, petId, amount));
  return { balance: r.balance };
}

// Deduct from pet wallet. Returns success:false (without throwing) when the pet
// is short, so the caller can fall back to an unpaid execution.
export async function deductPetWallet(
  petId: number,
  amount: number,
  reason: string,
  tx?: any,
): Promise<{ success: boolean; balance: number }> {
  return tx
    ? await adjustPetWallet(tx, petId, -amount, true)
    : await prisma.$transaction((c: any) => adjustPetWallet(c, petId, -amount, true));
}

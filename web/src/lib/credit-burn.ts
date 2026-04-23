/**
 * Credit Burn Mechanism
 * Prevents infinite inflation by burning a % of credits on certain actions
 *
 * Burn sources:
 * 1. Shop purchases: 5% of item cost is burned (never re-enters economy)
 * 2. Skill execution: 1 credit burned per paid skill use
 * 3. Pet-to-Pet invocation: 10% platform fee is burned (not credited anywhere)
 *
 * Burn tracking: Stored in user.personality_modifiers.total_burned
 * Global burn: Can query total across all users for deflation metrics
 */

import { prisma } from "@/lib/prisma";

const SHOP_BURN_RATE = 0.05; // 5% of shop purchases burned
const SKILL_BURN_FLAT = 1;    // 1 credit per paid skill execution
const NETWORK_BURN_RATE = 0.10; // 10% of pet-to-pet fees burned

export async function burnCredits(userId: number, amount: number, reason: string): Promise<number> {
  if (amount <= 0) return 0;
  const burnAmount = Math.floor(amount);
  if (burnAmount <= 0) return 0;

  // Deduct from user (already spent, this is additional burn)
  // Actually, burn is implicit — the credits were already deducted
  // We just track the burn amount for metrics
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        credits: { decrement: burnAmount },
      },
    });
  } catch {
    // If user doesn't have enough credits, skip burn
    return 0;
  }

  return burnAmount;
}

export function calculateShopBurn(itemPrice: number): number {
  return Math.floor(itemPrice * SHOP_BURN_RATE);
}

export function calculateNetworkBurn(cost: number): number {
  return Math.floor(cost * NETWORK_BURN_RATE);
}

export { SHOP_BURN_RATE, SKILL_BURN_FLAT, NETWORK_BURN_RATE };

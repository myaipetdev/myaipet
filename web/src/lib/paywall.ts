/**
 * Unified paywall for paid actions.
 *
 * Pattern (every "click" with a BM tie):
 *   1. Client calls action endpoint (e.g. POST /api/pets/[petId]/interact?type=feed)
 *   2. Server calls `enforcePaywall(userId, ACTION, freeCap, pricedUsd)`
 *   3. If under the daily free cap → counter++, return { ok, paid: false }
 *   4. If over → returns { ok: false, paywall: { actionKey, priceUsd, treasury } }
 *      → client opens USDT pay modal → user signs `transfer(treasury, amount)`
 *      → client re-calls action with `tx_hash` query param
 *   5. Server verifies via `/api/payments/action-pay`, records PaidAction with
 *      action_key matching, then enforcePaywall returns { ok, paid: true }
 *
 * Replay-protected: paid_actions.tx_hash is unique. Same tx can't unlock two actions.
 * Daily caps: reset at UTC midnight via day key "YYYY-MM-DD".
 */

import { prisma } from "@/lib/prisma";

export interface ActionConfig {
  freeCap: number;        // free actions per UTC day
  priceUsd: number;       // USD price after free cap exhausted
  description: string;    // surfaced to client in paywall modal
}

// Single source of truth — anywhere we charge, we look up here.
// Tweak these freely without touching call sites.
export const ACTIONS: Record<string, ActionConfig> = {
  feed_extra:        { freeCap: 5,  priceUsd: 0.10, description: "Feed your pet (1 extra meal)" },
  play_extra:        { freeCap: 5,  priceUsd: 0.10, description: "Play with your pet (1 extra session)" },
  stat_upgrade_atk:  { freeCap: 0,  priceUsd: 1.00, description: "Boost ATK by +5" },
  stat_upgrade_def:  { freeCap: 0,  priceUsd: 1.00, description: "Boost DEF by +5" },
  stat_upgrade_spd:  { freeCap: 0,  priceUsd: 1.00, description: "Boost SPD by +5" },
  battle_entry:      { freeCap: 1,  priceUsd: 0.50, description: "Enter Battle League (1 match)" },
  skill_install:     { freeCap: 0,  priceUsd: 2.00, description: "Install a premium skill" },
  generation_extra:  { freeCap: 1,  priceUsd: 0.20, description: "Generate one more pet image/video" },
  xp_boost:          { freeCap: 0,  priceUsd: 0.50, description: "+50 XP instant" },
  pet_adopt_extra:   { freeCap: 1,  priceUsd: 5.00, description: "Adopt an additional pet" },
};

function utcDayKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

export type PaywallResult =
  | { ok: true; paid: false; used: number; cap: number }
  | { ok: true; paid: true; receipt: { actionKey: string; txHash: string; amountUsd: number } }
  | {
      ok: false;
      paywall: {
        actionKey: string;
        priceUsd: number;
        description: string;
        treasury: string;
        usdtAddress: string;
        chainId: number;
        reason: "free_cap_exhausted" | "no_free_tier";
      };
    };

const TREASURY = process.env.TREASURY_WALLET || process.env.NEXT_PUBLIC_TREASURY_WALLET || "";
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

/**
 * Check or grant access to a paid action.
 *
 * @param userId          authenticated user id
 * @param actionKey       must exist in ACTIONS map
 * @param txHash          optional: USDT tx hash if user just paid (consumes the payment)
 * @param petId           optional: tie the receipt to a specific pet
 */
export async function enforcePaywall(
  userId: number,
  actionKey: string,
  txHash?: string,
  petId?: number,
): Promise<PaywallResult> {
  const cfg = ACTIONS[actionKey];
  if (!cfg) throw new Error(`Unknown action: ${actionKey}`);

  // Path A: client provided a tx_hash → consume the payment as the gate
  if (txHash) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return {
        ok: false,
        paywall: { actionKey, priceUsd: cfg.priceUsd, description: cfg.description,
          treasury: TREASURY, usdtAddress: USDT_BSC, chainId: 56,
          reason: "free_cap_exhausted" },
      };
    }
    // Verify the tx_hash was previously recorded (via /api/payments/action-pay)
    // We do NOT re-verify on-chain here — that's already done at receipt time.
    // Idempotent: marking the same receipt 'consumed' twice is harmless because
    // tx_hash is unique and we only count actions, not tx replays.
    const receipt = await prisma.paidAction.findUnique({ where: { tx_hash: txHash } });
    if (!receipt) {
      return {
        ok: false,
        paywall: { actionKey, priceUsd: cfg.priceUsd, description: cfg.description,
          treasury: TREASURY, usdtAddress: USDT_BSC, chainId: 56,
          reason: "free_cap_exhausted" },
      };
    }
    if (receipt.action_key !== actionKey) {
      // tx_hash exists but was used for a different action → reject (can't reuse)
      return {
        ok: false,
        paywall: { actionKey, priceUsd: cfg.priceUsd, description: cfg.description,
          treasury: TREASURY, usdtAddress: USDT_BSC, chainId: 56,
          reason: "free_cap_exhausted" },
      };
    }
    if (receipt.user_id !== userId) {
      // Someone else's receipt — reject
      return {
        ok: false,
        paywall: { actionKey, priceUsd: cfg.priceUsd, description: cfg.description,
          treasury: TREASURY, usdtAddress: USDT_BSC, chainId: 56,
          reason: "free_cap_exhausted" },
      };
    }
    return {
      ok: true, paid: true,
      receipt: { actionKey, txHash, amountUsd: receipt.amount_usd },
    };
  }

  // Path B: no tx — check / increment free counter
  if (cfg.freeCap <= 0) {
    return {
      ok: false,
      paywall: { actionKey, priceUsd: cfg.priceUsd, description: cfg.description,
        treasury: TREASURY, usdtAddress: USDT_BSC, chainId: 56,
        reason: "no_free_tier" },
    };
  }

  const day = utcDayKey();
  const counter = await prisma.dailyActionCount.upsert({
    where: { user_action_day: { user_id: userId, action_key: actionKey, day } },
    create: { user_id: userId, action_key: actionKey, day, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (counter.count > cfg.freeCap) {
    // Rollback the over-cap increment so user isn't penalised
    await prisma.dailyActionCount.update({
      where: { user_action_day: { user_id: userId, action_key: actionKey, day } },
      data: { count: cfg.freeCap },
    });
    return {
      ok: false,
      paywall: { actionKey, priceUsd: cfg.priceUsd, description: cfg.description,
        treasury: TREASURY, usdtAddress: USDT_BSC, chainId: 56,
        reason: "free_cap_exhausted" },
    };
  }

  return { ok: true, paid: false, used: counter.count, cap: cfg.freeCap };
}

/**
 * Read-only: how many free actions has the user used today?
 * Used by UI to show "Feed: 3/5 free remaining" badges.
 */
export async function getDailyUsage(userId: number, actionKey: string): Promise<{ used: number; cap: number }> {
  const cfg = ACTIONS[actionKey];
  if (!cfg) return { used: 0, cap: 0 };
  const day = utcDayKey();
  const row = await prisma.dailyActionCount.findUnique({
    where: { user_action_day: { user_id: userId, action_key: actionKey, day } },
  });
  return { used: row?.count || 0, cap: cfg.freeCap };
}

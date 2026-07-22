/**
 * Unified, failure-atomic access control for pet actions.
 *
 * The authoritative pet row, its domain checks, the free quota/payment receipt,
 * and the effect all live in one PostgreSQL transaction. A rejected or failed
 * effect therefore consumes neither quota nor payment.
 */

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  canonicalizePaymentTxHash,
  InvalidPaymentTxHash,
  ONCHAIN,
  paymentsEnabled,
} from "@/lib/onchain";
import { lockPetModifiersInTransaction } from "@/lib/petclaw/modifier-store";

export interface ActionConfig {
  freeCap: number;
  priceUsd: number;
  description: string;
}

// Single source of truth for every currently consumed paid action.
export const ACTIONS: Record<string, ActionConfig> = {
  feed_extra:        { freeCap: 5, priceUsd: 0.10, description: "Feed your pet (1 extra meal)" },
  play_extra:        { freeCap: 5, priceUsd: 0.10, description: "Play with your pet (1 extra session)" },
  stat_upgrade_atk:  { freeCap: 0, priceUsd: 1.00, description: "Boost ATK by +5" },
  stat_upgrade_def:  { freeCap: 0, priceUsd: 1.00, description: "Boost DEF by +5" },
  stat_upgrade_spd:  { freeCap: 0, priceUsd: 1.00, description: "Boost SPD by +5" },
};

function utcDayKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

export type PaywallAccess =
  | { ok: true; paid: false; used: number; cap: number }
  | {
      ok: true;
      paid: true;
      replayed: boolean;
      receipt: { actionKey: string; txHash: string; amountUsd: number };
    };

export type PaywallDetails = {
  actionKey: string;
  priceUsd: number;
  description: string;
  treasury: string;
  usdtAddress: string;
  chainId: number;
  petId?: number;
  paymentsEnabled: boolean;
  reason: "free_cap_exhausted" | "no_free_tier" | "payments_paused";
};

export type LockedActionPet = {
  id: number;
  user_id: number;
  name: string;
  species: number;
  personality_type: string;
  level: number;
  experience: number;
  happiness: number;
  energy: number;
  hunger: number;
  bond_level: number;
  total_interactions: number;
  personality_modifiers: Prisma.JsonValue | null;
  last_interaction_at: Date | null;
  atk: number;
  def: number;
  spd: number;
};

type PetActionDb = {
  $transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

export type PetActionResult<T, D> =
  | { ok: true; access: PaywallAccess | null; value: T }
  | { ok: false; kind: "pet_not_found" }
  | { ok: false; kind: "domain"; domain: D }
  | { ok: false; kind: "receipt_already_consumed" }
  | { ok: false; kind: "paywall"; paywall: PaywallDetails };

export type PetActionHooks<T, D> = {
  /** Runs after the authoritative row lock and before quota/receipt claim. */
  validate?: (pet: LockedActionPet, now: Date) => D | null | Promise<D | null>;
  /** A throw rolls the effect and its access grant back together. */
  apply: (
    tx: Prisma.TransactionClient,
    pet: LockedActionPet,
    access: PaywallAccess | null,
    now: Date,
  ) => Promise<T>;
};

export type PetActionInput = {
  userId: number;
  petId: number;
  actionKey?: string;
  txHash?: string;
  now?: Date;
  /** Test seam only. Production routes rely on the fail-closed env gate. */
  paymentsAreEnabled?: () => boolean;
};

function paywallDetails(
  actionKey: string,
  cfg: ActionConfig,
  reason: PaywallDetails["reason"],
  petId: number,
  enabled: boolean,
): PaywallDetails {
  return {
    actionKey,
    priceUsd: cfg.priceUsd,
    description: cfg.description,
    treasury: enabled ? ONCHAIN.treasuryWallet : "",
    usdtAddress: enabled ? ONCHAIN.usdt.address : "",
    chainId: ONCHAIN.chainId,
    petId,
    paymentsEnabled: enabled,
    reason: enabled ? reason : "payments_paused",
  };
}

function paywallFailure(
  actionKey: string,
  cfg: ActionConfig,
  reason: PaywallDetails["reason"],
  petId: number,
  enabled: boolean,
) {
  return {
    ok: false,
    kind: "paywall",
    paywall: paywallDetails(actionKey, cfg, reason, petId, enabled),
  } as const;
}

const OUTCOME_METADATA_KEY = "atomic_action_outcome_v1";

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readStoredOutcome<T>(
  metadata: unknown,
  actionKey: string,
  petId: number,
): { found: true; value: T } | { found: false } {
  const stored = objectRecord(objectRecord(metadata)[OUTCOME_METADATA_KEY]);
  if (
    stored.version !== 1
    || stored.actionKey !== actionKey
    || stored.petId !== petId
    || !("value" in stored)
  ) {
    return { found: false };
  }
  return { found: true, value: stored.value as T };
}

function jsonOutcome(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Paid action outcome is not JSON serializable");
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

/**
 * Execute one authoritative pet mutation with its access grant.
 *
 * Lock order is fixed for every caller:
 *   1. sorted shared pet modifier advisory lock(s)
 *   2. active owned `pets` row (`FOR UPDATE`)
 *   3. `daily_action_counts` row OR global ledger + `paid_actions` receipt
 *   4. pet effect, interaction log, and memory writes
 *
 * The validation hook observes the locked row, preventing stale cooldown,
 * ceiling, or resource-gate checks from consuming access.
 */
export async function executePetActionWithPaywall<T, D = never>(
  db: PetActionDb,
  input: PetActionInput,
  hooks: PetActionHooks<T, D>,
): Promise<PetActionResult<T, D>> {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    return { ok: false, kind: "pet_not_found" };
  }
  if (!Number.isSafeInteger(input.petId) || input.petId <= 0) {
    return { ok: false, kind: "pet_not_found" };
  }

  const cfg = input.actionKey ? ACTIONS[input.actionKey] : undefined;
  if (input.actionKey && !cfg) throw new Error(`Unknown action: ${input.actionKey}`);
  const enabled = input.paymentsAreEnabled ?? paymentsEnabled;

  return db.$transaction<PetActionResult<T, D>>(async (tx) => {
    // This must precede the row lock below. Pet actions can update both ordinary
    // columns and personality_modifiers, so every writer shares one global lock
    // order with memory, persona, and wallet transactions.
    await lockPetModifiersInTransaction(tx, input.petId);
    const rows = await tx.$queryRaw<LockedActionPet[]>`
      SELECT
        "id", "user_id", "name", "species", "personality_type", "level",
        "experience", "happiness", "energy", "hunger", "bond_level",
        "total_interactions", "personality_modifiers", "last_interaction_at",
        "atk", "def", "spd"
      FROM "pets"
      WHERE "id" = ${input.petId}
        AND "user_id" = ${input.userId}
        AND "is_active" = true
      FOR UPDATE
    `;
    const pet = rows[0];
    if (!pet) return { ok: false, kind: "pet_not_found" };

    const now = input.now ?? new Date();
    let access: PaywallAccess | null = null;
    let paidReceiptContext: {
      txHash: string;
      metadata: Prisma.JsonValue | null;
    } | null = null;

    if (input.actionKey && cfg && input.txHash) {
        const paymentsOn = enabled();
        if (!paymentsOn) {
          return paywallFailure(input.actionKey, cfg, "payments_paused", input.petId, false);
        }

        let canonicalTxHash: string;
        try {
          canonicalTxHash = canonicalizePaymentTxHash(input.txHash);
        } catch (error) {
          if (!(error instanceof InvalidPaymentTxHash)) throw error;
          return paywallFailure(input.actionKey, cfg, "free_cap_exhausted", input.petId, true);
        }

        // paid_actions predates the global consumed_payments ledger. Never
        // trust an orphan or a receipt whose hash was claimed by another
        // product/user. The hardening migration backfills valid legacy action
        // rows; this runtime assertion keeps the invariant fail-closed.
        const [ledger, receipt] = await Promise.all([
          tx.consumedPayment.findUnique({
            where: { tx_hash: canonicalTxHash },
            select: { user_id: true, purpose: true, amount_usd: true },
          }),
          tx.paidAction.findUnique({
            where: { tx_hash: canonicalTxHash },
            select: {
              user_id: true,
              pet_id: true,
              action_key: true,
              amount_usd: true,
              consumed_at: true,
              metadata: true,
            },
          }),
        ]);
        if (
          !ledger
          || !receipt
          || ledger.user_id !== input.userId
          || ledger.purpose !== "action"
          || ledger.amount_usd !== receipt.amount_usd
          || receipt.user_id !== input.userId
          || receipt.pet_id !== input.petId
          || receipt.action_key !== input.actionKey
        ) {
          return paywallFailure(input.actionKey, cfg, "free_cap_exhausted", input.petId, true);
        }

        // A committed outcome is the idempotency record. A lost HTTP response
        // can safely retry the same hash and receive the exact prior payload,
        // without re-running the effect or asking the user to pay again.
        if (receipt.consumed_at) {
          const stored = readStoredOutcome<T>(receipt.metadata, input.actionKey, input.petId);
          if (!stored.found) {
            // Legacy consumed rows predate durable outcomes. Never translate
            // these to 402: callers return an explicit non-payment 409 and ask
            // the client to refresh current state instead of purchasing again.
            return { ok: false, kind: "receipt_already_consumed" };
          }
          return {
            ok: true,
            access: {
              ok: true,
              paid: true,
              replayed: true,
              receipt: {
                actionKey: input.actionKey,
                txHash: canonicalTxHash,
                amountUsd: receipt.amount_usd,
              },
            },
            value: stored.value,
          };
        }

        const domain = hooks.validate ? await hooks.validate(pet, now) : null;
        if (domain !== null && domain !== undefined) {
          return { ok: false, kind: "domain", domain };
        }

        const claim = await tx.paidAction.updateMany({
          where: {
            tx_hash: canonicalTxHash,
            user_id: input.userId,
            action_key: input.actionKey,
            pet_id: input.petId,
            consumed_at: null,
          },
          data: { consumed_at: now },
        });
        if (claim.count !== 1) {
          return paywallFailure(input.actionKey, cfg, "free_cap_exhausted", input.petId, true);
        }
        access = {
          ok: true,
          paid: true,
          replayed: false,
          receipt: {
            actionKey: input.actionKey,
            txHash: canonicalTxHash,
            amountUsd: receipt.amount_usd,
          },
        };
        paidReceiptContext = { txHash: canonicalTxHash, metadata: receipt.metadata };
    } else {
      const domain = hooks.validate ? await hooks.validate(pet, now) : null;
      if (domain !== null && domain !== undefined) {
        return { ok: false, kind: "domain", domain };
      }

      if (input.actionKey && cfg && cfg.freeCap <= 0) {
        return paywallFailure(input.actionKey, cfg, "no_free_tier", input.petId, enabled());
      } else if (input.actionKey && cfg) {
        const day = utcDayKey(now);
        // Prisma's emulated upsert can surface P2002 when different pet locks
        // converge on the same user/day counter. Native ON CONFLICT plus an
        // explicit row lock is the cross-pet serialization point.
        await tx.$executeRaw`
          INSERT INTO "daily_action_counts"
            ("user_id", "action_key", "day", "count", "updated_at")
          VALUES (${input.userId}, ${input.actionKey}, ${day}, 0, ${now})
          ON CONFLICT ("user_id", "action_key", "day") DO NOTHING
        `;
        const counters = await tx.$queryRaw<Array<{ id: number; count: number }>>`
          SELECT "id", "count"
          FROM "daily_action_counts"
          WHERE "user_id" = ${input.userId}
            AND "action_key" = ${input.actionKey}
            AND "day" = ${day}
          FOR UPDATE
        `;
        const counter = counters[0];
        if (!counter) throw new Error("Daily action counter disappeared");
        const increment = await tx.dailyActionCount.updateMany({
          where: { id: counter.id, count: { lt: cfg.freeCap } },
          data: { count: { increment: 1 } },
        });
        if (increment.count !== 1) {
          return paywallFailure(input.actionKey, cfg, "free_cap_exhausted", input.petId, enabled());
        }
        access = { ok: true, paid: false, used: counter.count + 1, cap: cfg.freeCap };
      }
    }

    const value = await hooks.apply(tx, pet, access, now);
    if (paidReceiptContext && input.actionKey) {
      await tx.paidAction.update({
        where: { tx_hash: paidReceiptContext.txHash },
        data: {
          metadata: {
            ...objectRecord(paidReceiptContext.metadata),
            [OUTCOME_METADATA_KEY]: {
              version: 1,
              actionKey: input.actionKey,
              petId: input.petId,
              value: jsonOutcome(value),
            },
          } as Prisma.InputJsonValue,
        },
      });
    }
    return { ok: true, access, value };
  });
}

/** Read-only daily usage for free-cap UI badges. */
export async function getDailyUsage(
  userId: number,
  actionKey: string,
): Promise<{ used: number; cap: number }> {
  const cfg = ACTIONS[actionKey];
  if (!cfg) return { used: 0, cap: 0 };
  const row = await prisma.dailyActionCount.findUnique({
    where: {
      user_action_day: {
        user_id: userId,
        action_key: actionKey,
        day: utcDayKey(),
      },
    },
  });
  return { used: row?.count || 0, cap: cfg.freeCap };
}

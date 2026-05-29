/**
 * Subscription helpers — tier check, usage check, monthly counter.
 *
 * Single source of truth for "can this user run this model right now?"
 * Used by /api/studio/generate before submitting to the backend.
 */

import { prisma } from "@/lib/prisma";
import { TIER_LIMITS } from "./providers";
import type { ModelTier } from "./providers";

export function utcMonthKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const TIER_RANK: Record<ModelTier, number> = { free: 0, pro: 1, studio: 2 };

export interface CurrentSubscription {
  tier: ModelTier;
  expiresAt: Date | null;
  usage: { videos: number; images: number; month: string };
  limits: typeof TIER_LIMITS[ModelTier];
}

export async function getCurrentSubscription(userId: number): Promise<CurrentSubscription> {
  // Upsert ensures every user has a row at "free" tier
  let sub = await prisma.userSubscription.findUnique({ where: { user_id: userId } });
  if (!sub) {
    sub = await prisma.userSubscription.create({
      data: { user_id: userId, tier: "free" },
    });
  }

  // If a paid tier expired, demote on the fly
  let effectiveTier: ModelTier = (sub.tier as ModelTier) || "free";
  if (effectiveTier !== "free" && sub.expires_at && sub.expires_at < new Date()) {
    effectiveTier = "free";
    await prisma.userSubscription.update({
      where: { id: sub.id },
      data: { tier: "free", expires_at: null },
    });
  }

  // Current month usage
  const monthKey = utcMonthKey();
  const usageRow = await prisma.studioMonthlyUsage.findUnique({
    where: { user_month: { user_id: userId, month_key: monthKey } },
  });

  return {
    tier: effectiveTier,
    expiresAt: sub.expires_at,
    usage: {
      videos: usageRow?.videos_used || 0,
      images: usageRow?.images_used || 0,
      month: monthKey,
    },
    limits: TIER_LIMITS[effectiveTier],
  };
}

export interface GateResult {
  ok: boolean;
  reason?: "tier_required" | "video_quota" | "image_quota";
  requiredTier?: ModelTier;
  currentTier?: ModelTier;
}

export function gateModel(sub: CurrentSubscription, modelTier: ModelTier, kind: "video" | "image"): GateResult {
  if (TIER_RANK[modelTier] > TIER_RANK[sub.tier]) {
    return { ok: false, reason: "tier_required", requiredTier: modelTier, currentTier: sub.tier };
  }
  if (kind === "video" && sub.usage.videos >= sub.limits.monthlyVideoLimit) {
    return { ok: false, reason: "video_quota", currentTier: sub.tier };
  }
  if (kind === "image" && sub.usage.images >= sub.limits.monthlyImageLimit) {
    return { ok: false, reason: "image_quota", currentTier: sub.tier };
  }
  return { ok: true };
}

export async function incrementUsage(userId: number, kind: "video" | "image"): Promise<void> {
  const monthKey = utcMonthKey();
  const field = kind === "video" ? { videos_used: { increment: 1 } } : { images_used: { increment: 1 } };
  await prisma.studioMonthlyUsage.upsert({
    where: { user_month: { user_id: userId, month_key: monthKey } },
    create: {
      user_id: userId, month_key: monthKey,
      videos_used: kind === "video" ? 1 : 0,
      images_used: kind === "image" ? 1 : 0,
    },
    update: field,
  });
}

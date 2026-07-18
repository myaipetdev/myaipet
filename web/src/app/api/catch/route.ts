/**
 * /api/catch — the Cat Catch core.
 *   POST { imageDataUrl, lat?, lng? } → verify a REAL live cat (anti-cheat),
 *         then roll a collectible creature and save it. Rejects screenshots /
 *         photos-of-screens / drawings / memes with a clear message.
 *   GET  → the caller's caught-cat collection.
 *
 * The capture image is sent to Grok vision FIRST; we only store it on a real
 * catch, so cheaters' screenshots never hit storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { deleteStoredFile, uploadFile } from "@/lib/storage";
import { verifyAndDescribeAnimal } from "@/lib/catch/vision";
import { rollRarity, rollStats, pickElement, pickName, rarityMeta, CATCH_POINTS } from "@/lib/catch/game";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";
import { consumeCatchVerify, refundCatchCredit } from "@/lib/economyGuards";
import { consumeVisionBudget, isLLMBudgetError, isLLMBudgetStoreError } from "@/lib/llm/router";
import { enqueueMediaDeletionReference } from "@/lib/mediaDeletion";

export const runtime = "nodejs";

function withRarity(cat: any) {
  const m = rarityMeta(cat.rarity);
  return { ...cat, rarityLabel: m.label, rarityColor: m.color };
}

export async function POST(req: NextRequest) {
  // POINTS-ECONOMY §2.4: per-token rate is politeness only (6/hr) — the real wall
  // is the per-wallet credit meter + durable per-owner/global vision caps below.
  const rl = rateLimit(req, { key: "cat-catch", limit: 6, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const dataUrl: string = String(body?.imageDataUrl || "");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([\s\S]+)$/);
  if (!match) return NextResponse.json({ error: "Send a camera photo (jpeg/png/webp data URL)" }, { status: 400 });
  // Size guard (~8MB of base64 ≈ 6MB image).
  if (match[2].length > 8_500_000) return NextResponse.json({ error: "Photo too large" }, { status: 413 });

  const lat = typeof body?.lat === "number" ? body.lat : null;
  const lng = typeof body?.lng === "number" ? body.lng : null;

  // ── Metering (POINTS-ECONOMY §2.4, knob #2) ──
  // We pay Grok on ATTEMPT, so we charge on attempt: 3 free verifies/day/wallet,
  // then 1 credit each. Every actual fallback model attempt reserves the same
  // transactionally paired owner/global vision budget. Refund the credit if a
  // budget trips so a paying user isn't charged for a call we refused to finish.
  const bill = await consumeCatchVerify(user.id);
  if (!bill.ok) {
    return NextResponse.json({ caught: false, error: bill.error, needsCredits: true }, { status: bill.status });
  }
  let verdict;
  try {
    verdict = await verifyAndDescribeAnimal(
      dataUrl,
      () => consumeVisionBudget(user.id),
    );
  } catch (e) {
    if (bill.mode === "credit") await refundCatchCredit(user.id);
    if (isLLMBudgetError(e)) {
      return NextResponse.json({
        caught: false,
        reason: "The wildlife scanner is resting for today — come back tomorrow and try again. 🐾",
      }, { status: 429 });
    }
    if (isLLMBudgetStoreError(e)) {
      return NextResponse.json({
        caught: false,
        reason: "The wildlife scanner is temporarily unavailable. Please try again later.",
      }, { status: 503 });
    }
    throw e;
  }

  // ── Anti-cheat: verify a real live animal BEFORE storing anything ──
  if (!verdict) {
    return NextResponse.json({ caught: false, reason: "Couldn't read that photo — try again with more light." });
  }
  if (!verdict.isAnimal) {
    return NextResponse.json({ caught: false, reason: verdict.reason || "No animal in frame — point your camera at a real one." });
  }
  if (!verdict.isLivePhoto) {
    return NextResponse.json({
      caught: false,
      antiCheat: true,
      reason: verdict.reason || "That looks like a screen or a printed/illustrated image — go find a REAL cat! 🕵️",
    });
  }

  // ── Real catch — store the photo, roll the creature ──
  let photoPath = "";
  try {
    const buf = Buffer.from(match[2], "base64");
    const captureMime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
    const captureExt = captureMime === "image/png" ? "png" : captureMime === "image/webp" ? "webp" : "jpg";
    const up = await uploadFile(
      `catches/${user.id}-${randomUUID()}.${captureExt}`,
      buf,
      captureMime,
    );
    photoPath = up.url;
  } catch {
    return NextResponse.json({ error: "Couldn't save the photo — try again" }, { status: 500 });
  }

  const kind = (verdict.kind || "other").slice(0, 16); // real animal type (cat/dog mostly, but anything)
  const rarity = rollRarity(verdict.confidence);
  const stats = rollStats(rarity);
  let cat;
  try {
    cat = await prisma.caughtCat.create({
      data: {
        owner_user_id: user.id,
        kind,
        name: pickName(kind),
        breed: verdict.breed,
        rarity,
        element: pickElement(verdict.mood),
        hp: stats.hp, atk: stats.atk, def: stats.def, spd: stats.spd,
        photo_path: photoPath,
        lat, lng,
      },
    });
  } catch (error) {
    console.error("Catch DB finalize failed after storage write:", error);
    // Prefer the durable, reference-aware outbox. If PostgreSQL itself is the
    // failure, fall back to an immediate idempotent storage delete.
    try {
      await enqueueMediaDeletionReference(photoPath, {
        ownerUserId: user.id,
        reason: "Catch database finalize failed after storage write",
      });
    } catch (enqueueError) {
      console.error("Catch cleanup enqueue failed; deleting object directly:", enqueueError);
      await deleteStoredFile(photoPath).catch((deleteError) => {
        console.error("Catch direct storage cleanup failed:", deleteError);
      });
    }
    return NextResponse.json({ error: "Couldn't save the catch — try again" }, { status: 500 });
  }

  // Season points for a real catch, scaled by rarity, daily-capped (anti-farm).
  const pts = await awardPointsCapped(user.id, "catch", CATCH_POINTS[rarity], DAILY_POINT_CAPS.catch);

  return NextResponse.json({
    caught: true,
    cat: withRarity(cat),
    pointsAwarded: pts.points || 0,
    verdict: { kind, breed: verdict.breed, furColor: verdict.furColor, mood: verdict.mood },
  });
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cats = await prisma.caughtCat.findMany({
    where: { owner_user_id: user.id },
    orderBy: { caught_at: "desc" },
    take: 200,
  });
  return NextResponse.json({ cats: cats.map(withRarity) });
}

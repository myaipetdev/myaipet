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
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { uploadFile } from "@/lib/storage";
import { verifyAndDescribeCat } from "@/lib/catch/vision";
import { rollRarity, rollStats, pickElement, pickName, rarityMeta } from "@/lib/catch/game";

export const runtime = "nodejs";

function withRarity(cat: any) {
  const m = rarityMeta(cat.rarity);
  return { ...cat, rarityLabel: m.label, rarityColor: m.color };
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "cat-catch", limit: 20, windowMs: 60 * 60_000 });
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

  // ── Anti-cheat: verify a real live cat BEFORE storing anything ──
  const verdict = await verifyAndDescribeCat(dataUrl);
  if (!verdict) {
    return NextResponse.json({ caught: false, reason: "Couldn't read that photo — try again with more light 🔦" });
  }
  if (!verdict.isPet) {
    return NextResponse.json({ caught: false, reason: verdict.reason || "No cat or dog in frame — point your camera at a real one 🐾" });
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
    const up = await uploadFile(`catches/${user.id}-${Date.now()}.jpg`, buf, "image/jpeg");
    photoPath = up.url;
  } catch {
    return NextResponse.json({ error: "Couldn't save the photo — try again" }, { status: 500 });
  }

  const kind = verdict.kind === "dog" ? "dog" : "cat";
  const rarity = rollRarity(verdict.confidence);
  const stats = rollStats(rarity);
  const cat = await prisma.caughtCat.create({
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

  return NextResponse.json({ caught: true, cat: withRarity(cat), verdict: { breed: verdict.breed, furColor: verdict.furColor, mood: verdict.mood } });
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

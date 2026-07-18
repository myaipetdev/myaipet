/**
 * Pet mood-portrait store — the generated "expression pack".
 *
 *   GET    /api/pets/[petId]/mood-portrait            → { moodPortraits: { [key]: url } }
 *   POST   /api/pets/[petId]/mood-portrait  { key, url }   → save one (after the client generates it)
 *   DELETE /api/pets/[petId]/mood-portrait?key=happy  → clear one  (no key → clear all)
 *
 * Stored in pet.personality_modifiers.mood_portraits (JSON) — no migration.
 * The client generates each face via /api/studio/generate (charges credits),
 * then persists the resulting URL here.
 */

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { isExpressionKey } from "@/lib/moodPortraits";
import { applicationMediaKey, userCanAssignApplicationMedia } from "@/lib/mediaOwnership";

async function ownedPet(req: NextRequest, petIdStr: string) {
  const user = await getUser(req);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const petId = Number(petIdStr);
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id, is_active: true }, select: { id: true, personality_modifiers: true } });
  if (!pet) return { error: NextResponse.json({ error: "Pet not found" }, { status: 404 }) };
  return { user, petId, pet };
}

// Mutate ONLY mood_portraits inside a transaction that re-reads the row first —
// personality_modifiers also holds the memory moat (persistent_memories,
// user_profile), so a stale read-modify-write here could erase a concurrently
// written memory. The fresh in-transaction read keeps that window minimal.
async function updateMoodPortraits(petId: number, mutate: (cur: Record<string, string>) => Record<string, string>) {
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.pet.findUnique({ where: { id: petId }, select: { personality_modifiers: true } });
    const mods = (fresh?.personality_modifiers as any) || {};
    const portraits = mutate({ ...(mods.mood_portraits || {}) });
    await tx.pet.update({ where: { id: petId }, data: { personality_modifiers: { ...mods, mood_portraits: portraits } } });
    return portraits;
  });
}

// Only persist our own hosted images (auth + pet-ownership already scope this to
// the caller's own pet, so the blast radius is their own portrait).
function safeImageUrl(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 1000) return null;
  if (/^https:\/\//i.test(url) || url.startsWith("/uploads/")) return url;
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const ctx = await ownedPet(req, petId);
  if ("error" in ctx) return ctx.error;
  const mods = (ctx.pet.personality_modifiers as any) || {};
  return NextResponse.json({ moodPortraits: mods.mood_portraits || {} });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const ctx = await ownedPet(req, petId);
  if ("error" in ctx) return ctx.error;

  const { key, url } = await req.json().catch(() => ({}));
  if (!isExpressionKey(String(key))) return NextResponse.json({ error: "invalid expression key" }, { status: 400 });
  const safe = safeImageUrl(url);
  if (!safe) return NextResponse.json({ error: "invalid url" }, { status: 400 });
  if (applicationMediaKey(safe)) {
    if (!await userCanAssignApplicationMedia(ctx.user.id, safe)) {
      return NextResponse.json({ error: "Portrait media is not owned by this account" }, { status: 403 });
    }
  }

  const portraits = await updateMoodPortraits(ctx.petId, (cur) => ({ ...cur, [key as string]: safe }));
  return NextResponse.json({ ok: true, moodPortraits: portraits });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const ctx = await ownedPet(req, petId);
  if ("error" in ctx) return ctx.error;

  const key = req.nextUrl.searchParams.get("key");
  const portraits = await updateMoodPortraits(ctx.petId, (cur) => {
    if (key) { delete cur[key]; return cur; }
    return {};
  });
  return NextResponse.json({ ok: true, moodPortraits: portraits });
}

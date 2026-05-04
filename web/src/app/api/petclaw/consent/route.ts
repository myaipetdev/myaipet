/**
 * Per-pet sovereignty consent toggles.
 * Stored in Pet.personality_modifiers.consent JSON.
 */

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_CONSENT = {
  allowPublicProfile: true,
  allowDataSharing: false,
  allowAITraining: false,
  allowInteraction: true,
};

const ALLOWED_KEYS = Object.keys(DEFAULT_CONSENT);

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const petId = Number(req.nextUrl.searchParams.get("petId"));
  if (!petId) return NextResponse.json({ error: "petId required" }, { status: 400 });
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id } });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  const mods = (pet.personality_modifiers as any) || {};
  return NextResponse.json({ consent: { ...DEFAULT_CONSENT, ...(mods.consent || {}) } });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { petId, consent } = body;
  if (!petId) return NextResponse.json({ error: "petId required" }, { status: 400 });
  if (!consent || typeof consent !== "object") {
    return NextResponse.json({ error: "consent object required" }, { status: 400 });
  }
  const pet = await prisma.pet.findFirst({ where: { id: Number(petId), user_id: user.id } });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  // Whitelist + boolean coerce
  const cleaned: Record<string, boolean> = {};
  for (const k of ALLOWED_KEYS) cleaned[k] = !!consent[k];
  const mods = (pet.personality_modifiers as any) || {};
  await prisma.pet.update({
    where: { id: pet.id },
    data: { personality_modifiers: { ...mods, consent: cleaned } as any },
  });
  return NextResponse.json({ consent: cleaned, saved_at: new Date().toISOString() });
}

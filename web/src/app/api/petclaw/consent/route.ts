/**
 * Per-pet sovereignty consent toggles.
 *
 * Canonical store is the FLAT keys on Pet.personality_modifiers
 * (consent_public_profile / consent_data_sharing / consent_ai_training /
 * consent_interaction) — the same keys the enforcement paths read
 * (lib/petclaw/pet-network.ts, lib/petclaw/data-sovereignty.ts) and the SOUL
 * export/import schema. The API speaks the UI's allowX shape and maps to/from
 * the flat keys so a toggle actually takes effect (previously this route wrote
 * a nested `consent` object that nothing enforced).
 */

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// allowX (UI/API) → flat personality_modifiers key (enforced) + default
const CONSENT_MAP = {
  allowPublicProfile: { flat: "consent_public_profile", def: false },
  allowDataSharing:   { flat: "consent_data_sharing",   def: false },
  allowAITraining:    { flat: "consent_ai_training",     def: false },
  allowInteraction:   { flat: "consent_interaction",     def: false },
} as const;

function readConsent(mods: any) {
  const out: Record<string, boolean> = {};
  for (const [allowKey, { flat, def }] of Object.entries(CONSENT_MAP)) {
    // Prefer the enforced flat key; fall back to any legacy nested value, then default.
    const flatVal = mods?.[flat];
    const legacy = mods?.consent?.[allowKey];
    out[allowKey] = typeof flatVal === "boolean" ? flatVal
      : typeof legacy === "boolean" ? legacy : def;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const petId = Number(req.nextUrl.searchParams.get("petId"));
  if (!petId) return NextResponse.json({ error: "petId required" }, { status: 400 });
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id } });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  const mods = (pet.personality_modifiers as any) || {};
  return NextResponse.json({ consent: readConsent(mods) });
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
  const mods = (pet.personality_modifiers as any) || {};
  // Write the FLAT keys that enforcement reads. Drop any stale nested object.
  const next: Record<string, any> = { ...mods };
  delete next.consent;
  for (const [allowKey, { flat }] of Object.entries(CONSENT_MAP)) {
    next[flat] = !!consent[allowKey];
  }
  await prisma.pet.update({
    where: { id: pet.id },
    data: { personality_modifiers: next as any },
  });
  return NextResponse.json({ consent: readConsent(next), saved_at: new Date().toISOString() });
}

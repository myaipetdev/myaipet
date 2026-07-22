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
import { withLockedPetModifiers } from "@/lib/petclaw/modifier-store";
import { rateLimit } from "@/lib/rateLimit";

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
  const rl = rateLimit(req, { key: "petclaw-consent-read", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const petId = Number(req.nextUrl.searchParams.get("petId"));
  if (!Number.isInteger(petId) || petId <= 0) return NextResponse.json({ error: "valid petId required" }, { status: 400 });
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id } });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  const mods = (pet.personality_modifiers as any) || {};
  return NextResponse.json({ consent: readConsent(mods) });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "petclaw-consent-write", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > 8 * 1024) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > 8 * 1024) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }
  let body: any = null;
  try { body = JSON.parse(rawBody); } catch { /* handled below */ }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { petId, consent } = body;
  const pid = Number(petId);
  if (!Number.isInteger(pid) || pid <= 0) return NextResponse.json({ error: "valid petId required" }, { status: 400 });
  if (!consent || typeof consent !== "object" || Array.isArray(consent)) {
    return NextResponse.json({ error: "consent object required" }, { status: 400 });
  }
  const allowedConsentKeys = new Set(Object.keys(CONSENT_MAP));
  const suppliedConsentKeys = Object.keys(consent);
  if (
    suppliedConsentKeys.length !== allowedConsentKeys.size ||
    suppliedConsentKeys.some((key) => !allowedConsentKeys.has(key) || typeof consent[key] !== "boolean")
  ) {
    return NextResponse.json(
      { error: "consent must provide exactly four boolean allow* fields" },
      { status: 400 },
    );
  }
  const pet = await prisma.pet.findFirst({
    where: { id: pid, user_id: user.id },
    select: { id: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  const next = await withLockedPetModifiers(pet.id, async ({ tx, modifiers }) => {
    // Write only the enforced flat keys into the latest modifier document so a
    // simultaneous memory/skill update cannot be overwritten by a stale read.
    const merged: Record<string, any> = { ...modifiers };
    delete merged.consent;
    for (const [allowKey, { flat }] of Object.entries(CONSENT_MAP)) {
      merged[flat] = !!consent[allowKey];
    }
    await tx.pet.update({
      where: { id: pet.id },
      data: { personality_modifiers: merged as any },
    });
    return merged;
  });
  return NextResponse.json({ consent: readConsent(next), saved_at: new Date().toISOString() });
}

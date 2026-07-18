/**
 * Shared authorization helpers.
 *
 * Centralises the "authenticate the caller AND verify they own this pet"
 * check that every pet-scoped mutating/LLM-triggering route must perform.
 * Previously this was duplicated (and, in several petclaw routes, missing
 * entirely — see SECURITY_AUDIT_2026-06 C1/C2/M2/L5).
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "./auth";
import { prisma } from "./prisma";

/** True if the authenticated caller owns `petId`. Never throws. */
export async function ownsPet(req: NextRequest, petId: number): Promise<boolean> {
  if (!Number.isInteger(petId) || petId <= 0) return false;
  const user = await getUser(req).catch(() => null);
  if (!user) return false;
  const pet = await prisma.pet.findFirst({
    where: { id: petId, user_id: user.id },
    select: { id: true },
  });
  return !!pet;
}

export type PetOwnerResult =
  | { error: NextResponse; user?: undefined; pet?: undefined }
  | { error?: undefined; user: NonNullable<Awaited<ReturnType<typeof getUser>>>; pet: NonNullable<Awaited<ReturnType<typeof prisma.pet.findFirst>>> };

/**
 * Authenticate the caller and verify they own `petId`.
 * On success returns { user, pet }; otherwise returns { error } — a NextResponse
 * (400/401/403) the caller should return immediately:
 *
 *   const auth = await requirePetOwner(req, petId);
 *   if (auth.error) return auth.error;
 *   const { user, pet } = auth;
 */
export async function requirePetOwner(req: NextRequest, petId: number): Promise<PetOwnerResult> {
  const user = await getUser(req).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!Number.isInteger(petId) || petId <= 0) {
    return { error: NextResponse.json({ error: "Invalid petId" }, { status: 400 }) };
  }
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id } });
  if (!pet) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, pet };
}

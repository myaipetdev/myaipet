import type { Prisma } from "@/generated/prisma/client";

/**
 * A pet is public only after an explicit opt-in. Missing consent is private.
 * The legacy nested key is read during the transition, but absence never
 * silently becomes consent.
 */
export function publicPetWhere(extra?: Prisma.PetWhereInput): Prisma.PetWhereInput {
  const clauses: Prisma.PetWhereInput[] = [
    { is_active: true },
    {
      OR: [
        { personality_modifiers: { path: ["consent_public_profile"], equals: true } },
        { personality_modifiers: { path: ["consent", "allowPublicProfile"], equals: true } },
      ],
    },
  ];
  if (extra) clauses.push(extra);
  return { AND: clauses };
}

/** Public and explicitly opted into cross-pet/social interactions. */
export function interactablePetWhere(extra?: Prisma.PetWhereInput): Prisma.PetWhereInput {
  const clauses: Prisma.PetWhereInput[] = [
    publicPetWhere(),
    {
      OR: [
        { personality_modifiers: { path: ["consent_interaction"], equals: true } },
        { personality_modifiers: { path: ["consent", "allowInteraction"], equals: true } },
      ],
    },
  ];
  if (extra) clauses.push(extra);
  return { AND: clauses };
}

export function hasExplicitPublicConsent(personalityModifiers: unknown): boolean {
  const mods = (personalityModifiers as Record<string, unknown>) || {};
  if (mods.consent_public_profile === true) return true;
  const legacy = mods.consent;
  return !!legacy && typeof legacy === "object"
    && (legacy as Record<string, unknown>).allowPublicProfile === true;
}

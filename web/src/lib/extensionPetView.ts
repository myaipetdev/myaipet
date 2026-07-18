import type { Prisma } from "@/generated/prisma/client";

/** Fields required by the Chrome extension's pairing/roster flow. */
export const EXTENSION_PET_LIST_SELECT = {
  id: true,
  name: true,
  species: true,
  personality_type: true,
  level: true,
  avatar_url: true,
} as const satisfies Prisma.PetSelect;

/** Additional numeric state required by the extension's server-sync flow. */
export const EXTENSION_PET_DETAIL_SELECT = {
  ...EXTENSION_PET_LIST_SELECT,
  happiness: true,
  energy: true,
  hunger: true,
  bond_level: true,
  // Internal inputs for the same time-decay view the first-party app serves.
  // The explicit serializer below never includes either timestamp.
  last_interaction_at: true,
  updated_at: true,
} as const satisfies Prisma.PetSelect;

type ExtensionPetListRecord = Prisma.PetGetPayload<{
  select: typeof EXTENSION_PET_LIST_SELECT;
}>;

type ExtensionPetDetailRecord = Prisma.PetGetPayload<{
  select: typeof EXTENSION_PET_DETAIL_SELECT;
}>;

export function toExtensionPetListView(pet: ExtensionPetListRecord) {
  return {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    personality_type: pet.personality_type,
    level: pet.level,
    avatar_url: pet.avatar_url,
  };
}

export function toExtensionPetDetailView(pet: ExtensionPetDetailRecord) {
  return {
    ...toExtensionPetListView(pet),
    happiness: pet.happiness,
    energy: pet.energy,
    hunger: pet.hunger,
    bond_level: pet.bond_level,
  };
}

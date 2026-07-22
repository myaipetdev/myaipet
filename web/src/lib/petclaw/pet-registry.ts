/**
 * PetClaw Pet Registry
 * Forked from OpenClaw agent-registry — adapted for companion AI pets
 */

import { prisma } from "@/lib/prisma";
import { PETCLAW_PROTOCOL, buildPetDID, type PetClawSkill } from "./petclaw";
import { getExecutableSkillsForPetSnapshot } from "./pethub";
import { publicPetWhere } from "@/lib/publicPet";

export interface RegisteredPet {
  id: number;
  name: string;
  ownerWallet: string;
  petDID: string;
  species: number;
  personalityType: string;
  element: string;
  level: number;
  bondLevel: number;
  evolutionStage: number;
  avatarUrl?: string;
  soulNftId?: number;
  skills: PetClawSkill[];
  status: "active" | "inactive" | "inherited";
  totalInteractions: number;
  createdAt: string;
}

export interface PetCard {
  protocol: typeof PETCLAW_PROTOCOL;
  pet: RegisteredPet;
  capabilities: string[];
  endpoints: {
    chat: string;
    memories: string;
    export: string;
  };
}

export async function getRegisteredPet(petId: number): Promise<RegisteredPet | null> {
  const pet = await prisma.pet.findFirst({
    where: publicPetWhere({ id: petId }),
    include: { user: true },
  });
  if (!pet || !pet.user) return null;

  const soul = await prisma.petSoulNft.findFirst({ where: { pet_id: petId } });

  return {
    id: pet.id,
    name: pet.name,
    ownerWallet: pet.user.wallet_address,
    petDID: buildPetDID(pet.user.wallet_address, pet.id),
    species: pet.species,
    personalityType: pet.personality_type,
    element: (pet.element as string) || "normal",
    level: pet.level,
    bondLevel: pet.bond_level,
    evolutionStage: pet.evolution_stage || 0,
    avatarUrl: pet.avatar_url || undefined,
    soulNftId: soul?.token_id || undefined,
    skills: getExecutableSkillsForPetSnapshot(pet),
    status: pet.is_active ? "active" : "inactive",
    totalInteractions: pet.total_interactions,
    createdAt: pet.created_at.toISOString(),
  };
}

export async function getAllRegisteredPets(filters?: {
  ownerWallet?: string;
  status?: string;
  limit?: number;
}): Promise<RegisteredPet[]> {
  const where: any = {};

  if (filters?.ownerWallet) {
    const user = await prisma.user.findFirst({
      where: { wallet_address: { equals: filters.ownerWallet, mode: "insensitive" as any } },
    });
    if (user) where.user_id = user.id;
    else return [];
  }

  const pets = await prisma.pet.findMany({
    where: publicPetWhere(where),
    include: { user: true },
    orderBy: { created_at: "desc" },
    take: filters?.limit || 50,
  });

  return pets.map(pet => ({
    id: pet.id,
    name: pet.name,
    ownerWallet: pet.user?.wallet_address || "",
    petDID: buildPetDID(pet.user?.wallet_address || "", pet.id),
    species: pet.species,
    personalityType: pet.personality_type,
    element: (pet.element as string) || "normal",
    level: pet.level,
    bondLevel: pet.bond_level,
    evolutionStage: pet.evolution_stage || 0,
    avatarUrl: pet.avatar_url || undefined,
    skills: getExecutableSkillsForPetSnapshot(pet),
    status: "active" as const,
    totalInteractions: pet.total_interactions,
    createdAt: pet.created_at.toISOString(),
  }));
}

export function buildPetCard(pet: RegisteredPet, baseUrl: string): PetCard {
  return {
    protocol: PETCLAW_PROTOCOL,
    pet,
    capabilities: pet.skills.map((skill) => skill.id),
    endpoints: {
      chat: `${baseUrl}/api/pets/${pet.id}/chat`,
      memories: `${baseUrl}/api/pets/${pet.id}/memories`,
      export: `${baseUrl}/api/petclaw/export?petId=${pet.id}`,
    },
  };
}

export async function getRegistryStats(): Promise<{
  totalPets: number;
  activePets: number;
  totalInteractions: null;
  totalMemories: null;
  totalSoulNfts: number;
}> {
  const [discoverablePets, totalSoulNfts] = await Promise.all([
    prisma.pet.count({ where: publicPetWhere() }),
    prisma.petSoulNft.count(),
  ]);

  return {
    // Both fields intentionally describe the same consent-filtered public
    // population. Reuse one query rather than doubling database work on every
    // manifest request.
    totalPets: discoverablePets,
    activePets: discoverablePets,
    // These private-ledger aggregates are deliberately not published. `null`
    // means unavailable; zero would falsely claim that no activity exists.
    totalInteractions: null,
    totalMemories: null,
    totalSoulNfts,
  };
}

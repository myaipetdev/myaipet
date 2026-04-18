/**
 * PetClaw Pet Registry
 * Forked from OpenClaw agent-registry — adapted for companion AI pets
 */

import { prisma } from "@/lib/prisma";
import { PETCLAW_PROTOCOL, buildPetDID, type PetClawSkill, DEFAULT_SKILLS } from "./petclaw";

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
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
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
    skills: DEFAULT_SKILLS,
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
  const where: any = { is_active: true };

  if (filters?.ownerWallet) {
    const user = await prisma.user.findFirst({
      where: { wallet_address: { equals: filters.ownerWallet, mode: "insensitive" as any } },
    });
    if (user) where.user_id = user.id;
    else return [];
  }

  const pets = await prisma.pet.findMany({
    where,
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
    skills: DEFAULT_SKILLS,
    status: "active" as const,
    totalInteractions: pet.total_interactions,
    createdAt: pet.created_at.toISOString(),
  }));
}

export function buildPetCard(pet: RegisteredPet, baseUrl: string): PetCard {
  return {
    protocol: PETCLAW_PROTOCOL,
    pet,
    capabilities: [
      "companion-chat",
      "persona-mirror",
      "memory-recall",
      "autonomous-post",
      "soul-export",
      "data-sovereignty",
    ],
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
  totalInteractions: number;
  totalMemories: number;
  totalSoulNfts: number;
}> {
  const [totalPets, activePets, totalSoulNfts] = await Promise.all([
    prisma.pet.count(),
    prisma.pet.count({ where: { is_active: true } }),
    prisma.petSoulNft.count(),
  ]);

  return {
    totalPets,
    activePets,
    totalInteractions: 0,
    totalMemories: 0,
    totalSoulNfts,
  };
}

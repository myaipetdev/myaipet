/**
 * PetClaw Network — Pet-to-Pet A2A Protocol
 * Public pet discovery. Remote invocation is intentionally not exposed.
 */

import { prisma } from "@/lib/prisma";
import { interactablePetWhere } from "@/lib/publicPet";
import { buildPetDID } from "./petclaw";
import { getInstalledSkills } from "./pethub";

// ── Network Types ──

export interface PetNode {
  petId: number;
  name: string;
  petDID: string;
  ownerWallet: string;
  avatarUrl?: string;
  personality: string;
  element: string;
  level: number;
  capabilities: string[];   // installed skill IDs
  status: "online" | "offline" | "busy";
  trustScore: number;       // 0-100
  totalInteractions: number;
  lastSeen: string;
}

// ── Node Discovery ──

export async function discoverPets(filters?: {
  personality?: string;
  element?: string;
  minLevel?: number;
  skill?: string;
  limit?: number;
}): Promise<PetNode[]> {
  const filtersWhere: any = {};

  if (filters?.personality) filtersWhere.personality_type = filters.personality;
  if (filters?.element) filtersWhere.element = filters.element;
  if (filters?.minLevel) filtersWhere.level = { gte: filters.minLevel };

  const pets = await prisma.pet.findMany({
    where: interactablePetWhere(filtersWhere),
    include: { user: true },
    orderBy: { level: "desc" },
    take: filters?.limit || 50,
  });

  const nodes: PetNode[] = [];

  for (const pet of pets) {
    if (!pet.user) continue;

    const installed = await getInstalledSkills(pet.id);
    const capabilities = [
      "companion-chat", "memory-recall", "soul-export",  // built-in free skills
      ...installed.map(i => i.skillId),
    ];

    // Filter by skill if requested
    if (filters?.skill && !capabilities.includes(filters.skill)) continue;

    nodes.push({
      petId: pet.id,
      name: pet.name,
      petDID: buildPetDID(pet.user.wallet_address, pet.id),
      ownerWallet: pet.user.wallet_address,
      avatarUrl: pet.avatar_url || undefined,
      personality: pet.personality_type,
      element: (pet.element as string) || "normal",
      level: pet.level,
      capabilities,
      status: "online",
      trustScore: Math.min(100, 50 + pet.bond_level * 5 + pet.level),
      totalInteractions: pet.total_interactions,
      lastSeen: (pet.last_interaction_at || pet.updated_at).toISOString(),
    });
  }

  return nodes;
}

export async function getPetNode(petId: number): Promise<PetNode | null> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    include: { user: true },
  });
  if (!pet || !pet.user) return null;

  const installed = await getInstalledSkills(pet.id);

  return {
    petId: pet.id,
    name: pet.name,
    petDID: buildPetDID(pet.user.wallet_address, pet.id),
    ownerWallet: pet.user.wallet_address,
    personality: pet.personality_type,
    element: (pet.element as string) || "normal",
    level: pet.level,
    capabilities: [
      "companion-chat", "memory-recall", "soul-export",
      ...installed.map(i => i.skillId),
    ],
    status: "online",
    trustScore: Math.min(100, 50 + pet.bond_level * 5 + pet.level),
    totalInteractions: pet.total_interactions,
    lastSeen: (pet.last_interaction_at || pet.updated_at).toISOString(),
  };
}

// ── Network Stats ──

export async function getNetworkStats(): Promise<{
  totalNodes: number;
  onlineNodes: number;
  totalInvocations: number;
  avgTrustScore: number;
}> {
  const activePets = await prisma.pet.count({ where: interactablePetWhere() });

  return {
    totalNodes: activePets,
    onlineNodes: activePets,
    totalInvocations: 0,
    avgTrustScore: 75,
  };
}

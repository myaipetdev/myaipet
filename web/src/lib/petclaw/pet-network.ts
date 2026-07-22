/**
 * PetClaw Network — Pet-to-Pet A2A Protocol
 * Public pet discovery. Remote invocation is intentionally not exposed.
 */

import { prisma } from "@/lib/prisma";
import { interactablePetWhere } from "@/lib/publicPet";
import { buildPetDID } from "./petclaw";

// ── Network Types ──

export interface PetNode {
  petId: number;
  name: string;
  petDID: string;
  avatarUrl?: string;
  personality: string;
  element: string;
  level: number;
  capabilities: string[];   // installed skill IDs
  // Discovery consent is known; live presence is not. Do not turn a database
  // row into a fabricated online indicator.
  status: "discoverable";
  // A display-only progression signal derived from level and bond. It is not a
  // security, identity, reputation, or transaction-risk assessment.
  progressionScore: number;
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
  if (Number.isFinite(filters?.minLevel) && Number(filters?.minLevel) > 0) {
    filtersWhere.level = { gte: Math.floor(Number(filters?.minLevel)) };
  }
  const limit = Number.isFinite(filters?.limit)
    ? Math.max(1, Math.min(50, Math.floor(Number(filters?.limit))))
    : 50;

  const pets = await prisma.pet.findMany({
    where: interactablePetWhere(filtersWhere),
    include: { user: true },
    orderBy: { level: "desc" },
    take: limit,
  });

  const nodes: PetNode[] = [];

  for (const pet of pets) {
    if (!pet.user) continue;

    // Public discovery does not reveal owner-private/learned skill IDs. Expand
    // this list only after skill manifests carry an explicit public-capability
    // permission and the owner opts in to each disclosure.
    const capabilities = ["companion-chat"];

    // Filter by skill if requested
    if (filters?.skill && !capabilities.includes(filters.skill)) continue;

    nodes.push({
      petId: pet.id,
      name: pet.name,
      petDID: buildPetDID(pet.user.wallet_address, pet.id),
      avatarUrl: pet.avatar_url || undefined,
      personality: pet.personality_type,
      element: (pet.element as string) || "normal",
      level: pet.level,
      capabilities,
      status: "discoverable",
      progressionScore: Math.min(100, pet.bond_level * 5 + pet.level),
    });
  }

  return nodes;
}

export async function getPetNode(petId: number): Promise<PetNode | null> {
  const pet = await prisma.pet.findFirst({
    where: interactablePetWhere({ id: petId }),
    include: { user: true },
  });
  if (!pet || !pet.user) return null;

  return {
    petId: pet.id,
    name: pet.name,
    petDID: buildPetDID(pet.user.wallet_address, pet.id),
    personality: pet.personality_type,
    element: (pet.element as string) || "normal",
    level: pet.level,
    capabilities: ["companion-chat"],
    status: "discoverable",
    progressionScore: Math.min(100, pet.bond_level * 5 + pet.level),
  };
}

// ── Network Stats ──

export async function getNetworkStats(): Promise<{
  totalNodes: number;
  discoverableNodes: number;
  remoteInvocations: number;
}> {
  const discoverablePets = await prisma.pet.count({ where: interactablePetWhere() });

  return {
    totalNodes: discoverablePets,
    discoverableNodes: discoverablePets,
    // PACK invocation is intentionally disabled; this is a capability-state
    // counter, not an inferred usage metric.
    remoteInvocations: 0,
  };
}

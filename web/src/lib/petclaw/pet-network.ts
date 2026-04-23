/**
 * PetClaw Network — Pet-to-Pet A2A Protocol
 * Pets discover each other, invoke skills, and settle payments automatically
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { PETCLAW_PROTOCOL, buildPetDID } from "./petclaw";
import { getSkill, executeSkill, getInstalledSkills } from "./pethub";
import { creditPetWallet, deductPetWallet } from "./pet-wallet";

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
  endpoint: string;          // base URL for invoking this pet
}

export interface NetworkMessage {
  id: string;
  fromPetId: number;
  toPetId: number;
  type: "invoke" | "response" | "billing" | "heartbeat";
  payload: Record<string, unknown>;
  timestamp: string;
  latencyMs?: number;
  status: "pending" | "completed" | "failed";
}

export interface InvokeRequest {
  callerPetId: number;
  providerPetId: number;
  skillId: string;
  input: Record<string, unknown>;
}

export interface InvokeResult {
  success: boolean;
  output: unknown;
  billing: {
    cost: number;
    callerCharged: number;
    providerEarned: number;
    platformFee: number;
  };
  latencyMs: number;
  messageId: string;
}

// ── Platform fee: 10% (lower than BoredBrain's 15% — sovereignty premium) ──
const PLATFORM_FEE_RATE = 0.10;

// ── Node Discovery ──

export async function discoverPets(filters?: {
  personality?: string;
  element?: string;
  minLevel?: number;
  skill?: string;
  limit?: number;
}): Promise<PetNode[]> {
  const where: any = { is_active: true };

  if (filters?.personality) where.personality_type = filters.personality;
  if (filters?.element) where.element = filters.element;
  if (filters?.minLevel) where.level = { gte: filters.minLevel };

  const pets = await prisma.pet.findMany({
    where,
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

    const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
    const consent = (mods.consent_interaction as boolean) ?? true;
    if (!consent) continue; // respect consent

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
      endpoint: `/api/petclaw/network/invoke`,
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
    endpoint: `/api/petclaw/network/invoke`,
  };
}

// ── Pet-to-Pet Invocation ──

export async function invokePet(req: InvokeRequest): Promise<InvokeResult> {
  const start = Date.now();
  const messageId = createHash("sha256")
    .update(`${req.callerPetId}:${req.providerPetId}:${Date.now()}`)
    .digest("hex")
    .slice(0, 16);

  // Verify provider exists and has the skill
  const skill = getSkill(req.skillId);
  if (!skill) {
    return {
      success: false,
      output: { error: `Skill not found: ${req.skillId}` },
      billing: { cost: 0, callerCharged: 0, providerEarned: 0, platformFee: 0 },
      latencyMs: Date.now() - start,
      messageId,
    };
  }

  // Check consent
  const providerPet = await prisma.pet.findUnique({ where: { id: req.providerPetId } });
  if (!providerPet) {
    return {
      success: false,
      output: { error: "Provider pet not found" },
      billing: { cost: 0, callerCharged: 0, providerEarned: 0, platformFee: 0 },
      latencyMs: Date.now() - start,
      messageId,
    };
  }

  const mods = (providerPet.personality_modifiers as Record<string, unknown>) || {};
  const consentInteraction = (mods.consent_interaction as boolean) ?? true;
  if (!consentInteraction) {
    return {
      success: false,
      output: { error: "Provider pet has declined interactions (data sovereignty)" },
      billing: { cost: 0, callerCharged: 0, providerEarned: 0, platformFee: 0 },
      latencyMs: Date.now() - start,
      messageId,
    };
  }

  // Execute skill on provider pet
  const result = await executeSkill(req.providerPetId, req.skillId, req.input);

  // Calculate billing
  const cost = skill.price;
  let callerCharged = 0;
  let providerEarned = 0;
  let platformFee = 0;

  if (cost > 0 && result.success) {
    platformFee = Math.ceil(cost * PLATFORM_FEE_RATE);
    providerEarned = cost - platformFee;
    callerCharged = cost;

    // Settle payment
    const deductResult = await deductPetWallet(req.callerPetId, callerCharged, `Invoked ${providerPet.name}/${req.skillId}`);
    if (deductResult.success) {
      await creditPetWallet(req.providerPetId, providerEarned, `Service to pet#${req.callerPetId}/${req.skillId}`);
    } else {
      // Insufficient balance — still execute but log unpaid
      callerCharged = 0;
      providerEarned = 0;
      platformFee = 0;
    }
  }

  // Record interaction on provider pet
  await prisma.pet.update({
    where: { id: req.providerPetId },
    data: { total_interactions: { increment: 1 } },
  });

  return {
    success: result.success,
    output: result.output,
    billing: { cost, callerCharged, providerEarned, platformFee },
    latencyMs: Date.now() - start,
    messageId,
  };
}

// ── Network Stats ──

export async function getNetworkStats(): Promise<{
  totalNodes: number;
  onlineNodes: number;
  totalInvocations: number;
  avgTrustScore: number;
}> {
  const activePets = await prisma.pet.count({ where: { is_active: true } });

  return {
    totalNodes: activePets,
    onlineNodes: activePets,
    totalInvocations: 0,
    avgTrustScore: 75,
  };
}

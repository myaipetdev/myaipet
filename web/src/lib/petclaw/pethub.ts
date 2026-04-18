/**
 * PetHub — Skill Registry for PetClaw
 * Forked from ClawHub concept — skills are SKILL.md + metadata
 * Supports: publish, install, search, execute
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { PETCLAW_PROTOCOL } from "./petclaw";

// ── Skill Manifest (SKILL.md frontmatter) ──

export interface PetSkillManifest {
  id: string;                    // unique slug: "companion-chat", "daily-horoscope"
  name: string;
  version: string;               // semver: "1.0.0"
  author: string;                // wallet address or username
  protocol: typeof PETCLAW_PROTOCOL;
  category: "social" | "creative" | "utility" | "knowledge" | "emotional";
  description: string;
  tags: string[];

  // Runtime requirements (like ClawHub)
  requires?: {
    env?: string[];              // env vars needed: ["GROK_API_KEY"]
    bins?: string[];             // binaries needed: ["curl", "ffmpeg"]
    minLevel?: number;           // pet level required
    personality?: string[];      // compatible personalities
  };

  // Execution
  endpoint?: string;             // API endpoint to call
  handler?: string;              // inline handler type: "llm-prompt" | "api-call" | "script"
  systemPrompt?: string;         // for LLM-based skills
  apiUrl?: string;               // for API-based skills

  // Schema
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;

  // Marketplace
  price: number;                 // 0 = free
  currency: string;              // "credits" | "PET"
  installCount: number;
  rating: number;
  reviewCount: number;
}

export interface PetSkillInstall {
  skillId: string;
  petId: number;
  installedAt: string;
  version: string;
  config?: Record<string, string>;  // user-provided env/config values
}

export interface SkillExecutionResult {
  skillId: string;
  success: boolean;
  output: unknown;
  tokensUsed?: number;
  latencyMs: number;
  cost: number;
}

// ── Built-in Skills (shipped with PetClaw) ──

export const BUILTIN_SKILLS: PetSkillManifest[] = [
  {
    id: "companion-chat",
    name: "Companion Chat",
    version: "1.0.0",
    author: "petclaw",
    protocol: PETCLAW_PROTOCOL,
    category: "emotional",
    description: "Personality-driven conversation with persistent memory. Your pet remembers everything and responds in character.",
    tags: ["chat", "memory", "personality", "core"],
    requires: { env: ["GROK_API_KEY"] },
    handler: "llm-prompt",
    inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
    outputSchema: { type: "object", properties: { reply: { type: "string" }, emotion: { type: "string" } } },
    price: 0, currency: "credits", installCount: 0, rating: 5, reviewCount: 0,
  },
  {
    id: "persona-mirror",
    name: "Persona Mirror",
    version: "1.0.0",
    author: "petclaw",
    protocol: PETCLAW_PROTOCOL,
    category: "social",
    description: "Mirror owner's speech patterns, interests, and tone. Your pet talks like you across platforms.",
    tags: ["persona", "mirror", "social", "identity"],
    requires: { env: ["GROK_API_KEY"] },
    handler: "llm-prompt",
    inputSchema: { type: "object", properties: { context: { type: "string" }, platform: { type: "string" } } },
    outputSchema: { type: "object", properties: { response: { type: "string" }, confidence: { type: "number" } } },
    price: 0, currency: "credits", installCount: 0, rating: 5, reviewCount: 0,
  },
  {
    id: "memory-recall",
    name: "Memory Recall",
    version: "1.0.0",
    author: "petclaw",
    protocol: PETCLAW_PROTOCOL,
    category: "knowledge",
    description: "Retrieve and reason over past conversations. Your pet never forgets.",
    tags: ["memory", "recall", "knowledge", "search"],
    handler: "api-call",
    apiUrl: "/api/pets/{petId}/memories",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } } },
    outputSchema: { type: "object", properties: { memories: { type: "array" }, summary: { type: "string" } } },
    price: 0, currency: "credits", installCount: 0, rating: 5, reviewCount: 0,
  },
  {
    id: "autonomous-post",
    name: "Autonomous Post",
    version: "1.0.0",
    author: "petclaw",
    protocol: PETCLAW_PROTOCOL,
    category: "creative",
    description: "Generate and publish content on social platforms as your pet. Works on Telegram, Twitter, Discord.",
    tags: ["social", "post", "autonomous", "creative"],
    requires: { env: ["GROK_API_KEY"], minLevel: 5 },
    handler: "llm-prompt",
    inputSchema: { type: "object", properties: { platform: { type: "string" }, topic: { type: "string" } } },
    outputSchema: { type: "object", properties: { content: { type: "string" }, mediaUrl: { type: "string" } } },
    price: 0, currency: "credits", installCount: 0, rating: 4.5, reviewCount: 0,
  },
  {
    id: "soul-export",
    name: "Soul Export",
    version: "1.0.0",
    author: "petclaw",
    protocol: PETCLAW_PROTOCOL,
    category: "utility",
    description: "Export complete pet identity as portable SOUL data. Take your pet anywhere.",
    tags: ["export", "sovereignty", "portability", "backup"],
    handler: "api-call",
    apiUrl: "/api/petclaw/export",
    inputSchema: { type: "object", properties: { format: { type: "string", enum: ["json", "markdown"] } } },
    outputSchema: { type: "object", properties: { data: { type: "object" }, hash: { type: "string" } } },
    price: 0, currency: "credits", installCount: 0, rating: 5, reviewCount: 0,
  },
  {
    id: "daily-mood",
    name: "Daily Mood Journal",
    version: "1.0.0",
    author: "petclaw",
    protocol: PETCLAW_PROTOCOL,
    category: "emotional",
    description: "Pet writes a daily mood journal entry based on recent interactions and memories.",
    tags: ["mood", "journal", "emotional", "daily"],
    requires: { env: ["GROK_API_KEY"], minLevel: 3 },
    handler: "llm-prompt",
    systemPrompt: "You are {petName}, a {personality} pet. Write a short daily mood journal entry (2-3 sentences) reflecting on recent events and feelings. Be authentic to your personality.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", properties: { entry: { type: "string" }, mood: { type: "string" }, happiness: { type: "number" } } },
    price: 0, currency: "credits", installCount: 0, rating: 4.8, reviewCount: 0,
  },
  {
    id: "image-gen",
    name: "Pet Selfie",
    version: "1.0.0",
    author: "petclaw",
    protocol: PETCLAW_PROTOCOL,
    category: "creative",
    description: "Generate an AI selfie/artwork of your pet in various styles and scenes.",
    tags: ["image", "selfie", "art", "creative"],
    requires: { env: ["GROK_API_KEY"], minLevel: 2 },
    handler: "api-call",
    apiUrl: "/api/battle-sprite",
    inputSchema: { type: "object", properties: { style: { type: "string" }, scene: { type: "string" } } },
    outputSchema: { type: "object", properties: { imageUrl: { type: "string" } } },
    price: 5, currency: "credits", installCount: 0, rating: 4.7, reviewCount: 0,
  },
];

// ── Registry Functions ──

// Get all available skills (built-in + community)
export function getAllSkills(): PetSkillManifest[] {
  // Phase 1: only built-in. Phase 2+: merge with DB community skills
  return BUILTIN_SKILLS;
}

export function getSkill(skillId: string): PetSkillManifest | undefined {
  return BUILTIN_SKILLS.find(s => s.id === skillId);
}

export function searchSkills(query: string, category?: string): PetSkillManifest[] {
  let results = BUILTIN_SKILLS;
  if (category) {
    results = results.filter(s => s.category === category);
  }
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.includes(q))
    );
  }
  return results;
}

// ── Install/Uninstall (stored in pet's personality_modifiers) ──

export async function installSkill(petId: number, skillId: string, config?: Record<string, string>): Promise<PetSkillInstall> {
  const skill = getSkill(skillId);
  if (!skill) throw new Error(`Skill not found: ${skillId}`);

  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) throw new Error("Pet not found");

  if (skill.requires?.minLevel && pet.level < skill.requires.minLevel) {
    throw new Error(`Pet must be level ${skill.requires.minLevel}+ to install this skill`);
  }

  const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
  const installed = (mods.installed_skills as Record<string, unknown>[]) || [];

  // Check if already installed
  if (installed.some((s: any) => s.skillId === skillId)) {
    throw new Error(`Skill already installed: ${skillId}`);
  }

  const install: PetSkillInstall = {
    skillId,
    petId,
    installedAt: new Date().toISOString(),
    version: skill.version,
    config,
  };

  await prisma.pet.update({
    where: { id: petId },
    data: {
      personality_modifiers: {
        ...mods,
        installed_skills: [...installed, install] as any,
      } as any,
    },
  });

  return install;
}

export async function uninstallSkill(petId: number, skillId: string): Promise<void> {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) throw new Error("Pet not found");

  const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
  const installed = (mods.installed_skills as Record<string, unknown>[]) || [];

  await prisma.pet.update({
    where: { id: petId },
    data: {
      personality_modifiers: {
        ...mods,
        installed_skills: installed.filter((s: any) => s.skillId !== skillId) as any,
      } as any,
    },
  });
}

export async function getInstalledSkills(petId: number): Promise<PetSkillInstall[]> {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) return [];

  const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
  return (mods.installed_skills as PetSkillInstall[]) || [];
}

// ── Skill Execution ──

export async function executeSkill(
  petId: number,
  skillId: string,
  input: Record<string, unknown>
): Promise<SkillExecutionResult> {
  const start = Date.now();
  const skill = getSkill(skillId);
  if (!skill) throw new Error(`Skill not found: ${skillId}`);

  // Check if installed
  const installed = await getInstalledSkills(petId);
  const isBuiltIn = BUILTIN_SKILLS.some(s => s.id === skillId && s.price === 0);
  if (!isBuiltIn && !installed.some(s => s.skillId === skillId)) {
    throw new Error(`Skill not installed: ${skillId}. Install it first.`);
  }

  try {
    let output: unknown;

    if (skill.handler === "llm-prompt") {
      output = await executeLLMSkill(petId, skill, input);
    } else if (skill.handler === "api-call" && skill.apiUrl) {
      output = await executeAPISkill(petId, skill, input);
    } else {
      output = { message: `Skill ${skillId} executed (handler: ${skill.handler})` };
    }

    return {
      skillId,
      success: true,
      output,
      latencyMs: Date.now() - start,
      cost: skill.price,
    };
  } catch (e: any) {
    return {
      skillId,
      success: false,
      output: { error: e.message },
      latencyMs: Date.now() - start,
      cost: 0,
    };
  }
}

async function executeLLMSkill(
  petId: number,
  skill: PetSkillManifest,
  input: Record<string, unknown>
): Promise<unknown> {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) throw new Error("Pet not found");

  const grokKey = process.env.GROK_API_KEY;
  if (!grokKey) throw new Error("GROK_API_KEY not configured");

  const userMessage = (input.message as string) || (input.context as string) || (input.topic as string) || "Hello!";
  const platform = (input.platform as string) || "web";

  // ── Persistent Memory: Build context-aware system prompt ──
  const { createMemoryManager } = await import("./memory/persistent-memory");
  const memory = createMemoryManager(petId);
  let systemPrompt: string;

  if (skill.id === "companion-chat" || skill.id === "persona-mirror") {
    // Full memory-aware prompt for chat skills
    systemPrompt = await memory.buildSystemPrompt(pet.name, pet.personality_type, platform, userMessage);
  } else {
    // Basic prompt for other skills
    systemPrompt = skill.systemPrompt || `You are ${pet.name}, a ${pet.personality_type} companion AI pet.`;
    systemPrompt = systemPrompt
      .replace("{petName}", pet.name)
      .replace("{personality}", pet.personality_type);
  }

  systemPrompt += "\n\nIMPORTANT: Keep responses SHORT (1-2 sentences max, under 80 words). No markdown formatting. Be casual and natural.";

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${grokKey}`,
    },
    body: JSON.stringify({
      model: "grok-3-mini-fast",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 100,
      temperature: 0.85,
    }),
  });

  if (!res.ok) throw new Error(`LLM API failed: ${res.status}`);
  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content || "";

  // ── Post-turn: Retain memory + self-learning (fire-and-forget) ──
  if (skill.id === "companion-chat" || skill.id === "persona-mirror") {
    const sessionId = `${platform}_${Date.now()}`;
    // Memory retention (async, non-blocking)
    memory.retainFromConversation(userMessage, reply, platform, sessionId).catch(() => {});
    // Self-learning (async, non-blocking)
    import("./memory/self-learning").then(({ createSelfLearner }) => {
      createSelfLearner(petId).observeConversation(userMessage, reply).catch(() => {});
    }).catch(() => {});
  }

  return { reply, model: data.model, tokensUsed: data.usage?.total_tokens };
}

async function executeAPISkill(
  petId: number,
  skill: PetSkillManifest,
  input: Record<string, unknown>
): Promise<unknown> {
  const url = (skill.apiUrl || "").replace("{petId}", String(petId));

  // For internal API calls, just return the endpoint info
  // Actual execution happens client-side or via specific routes
  return {
    endpoint: url,
    method: "GET",
    params: input,
    message: `API skill ready at ${url}`,
  };
}

// ── SKILL.md Generation (for publishing) ──

export function generateSkillMd(skill: PetSkillManifest): string {
  return `---
id: ${skill.id}
name: ${skill.name}
version: ${skill.version}
author: ${skill.author}
protocol: ${skill.protocol}
category: ${skill.category}
tags: [${skill.tags.join(", ")}]
price: ${skill.price}
currency: ${skill.currency}
${skill.requires ? `requires:
${skill.requires.env ? `  env: [${skill.requires.env.join(", ")}]` : ""}
${skill.requires.bins ? `  bins: [${skill.requires.bins.join(", ")}]` : ""}
${skill.requires.minLevel ? `  minLevel: ${skill.requires.minLevel}` : ""}` : ""}
---

# ${skill.name}

${skill.description}

## Input

\`\`\`json
${JSON.stringify(skill.inputSchema, null, 2)}
\`\`\`

## Output

\`\`\`json
${JSON.stringify(skill.outputSchema, null, 2)}
\`\`\`

## Installation

\`\`\`bash
# via curl
curl -X POST http://localhost:3000/api/petclaw/skills \\
  -H "Content-Type: application/json" \\
  -d '{"action":"install","petId":1,"skillId":"${skill.id}"}'

# via npm (future)
# npx petclaw install ${skill.id}
\`\`\`

## Usage

\`\`\`bash
curl -X POST http://localhost:3000/api/petclaw/skills \\
  -H "Content-Type: application/json" \\
  -d '{"action":"execute","petId":1,"skillId":"${skill.id}","input":{}}'
\`\`\`
`;
}

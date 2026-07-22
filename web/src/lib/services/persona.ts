/**
 * Pet Persona Service
 *
 * Builds owner-mirroring persona context from three sources:
 *   1. Onboarding answers (manual)
 *   2. Chat history analysis (LLM-extracted)
 *   3. Connected platform observations (real-time)
 *
 * The combined persona is injected into system prompts so the pet
 * naturally mirrors its owner's speech style, interests, and tone.
 */

import { prisma } from "@/lib/prisma";
import { callLLM } from "@/lib/llm/router";
import {
  normalizeChatAnalysis,
  normalizePersonaObservation,
  sanitizeStoredPersonaGeneratedFields,
  type ChatAnalysisResult,
} from "@/lib/personaGeneratedLanguage";
import { withLockedPetModifiers } from "@/lib/petclaw/modifier-store";
import {
  isProviderRelevantRetainedText,
  isProviderSafeRetainedText,
} from "@/lib/petclaw/memory/persistent-memory";

export type { ChatAnalysisResult } from "@/lib/personaGeneratedLanguage";

// ── Types ──

export interface PersonaData {
  id: number;
  pet_id: number;
  owner_speech_style: string | null;
  owner_interests: string | null;
  owner_expressions: string | null;
  owner_tone: string | null;
  owner_language: string | null;
  owner_bio: string | null;
  analyzed_patterns: any;
  sample_messages: any;
  vocabulary_style: string | null;
  observed_topics: any;
  observed_style: any;
  last_observed_at: Date | null;
  persona_version: number;
}

export interface OnboardingData {
  speech_style?: string;
  interests?: string;
  expressions?: string;
  tone?: string;
  language?: string;
  bio?: string;
}

// ── Routed analytical helper (low-temperature) ──

async function callAnalytical(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 800,
  petId?: number,
): Promise<string> {
  const out = await callLLM({
    task: "persona",
    petId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
  });
  const content = out.text.trim();
  if (!content) throw new Error("Empty response from text provider");
  return content;
}

// ── Build persona context string for system prompts ──

function providerSafePersonaValue(label: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bounded = value.trim().slice(0, 600);
  if (!bounded || !isProviderSafeRetainedText(`${label} ${bounded}`)) return null;
  return bounded;
}

function providerRelevantPersonaValue(
  label: string,
  value: unknown,
  query: string,
): string | null {
  if (typeof value !== "string" || !query.trim()) return null;
  const relevant = value
    .slice(0, 1200)
    .split(/(?<=[.!?])\s+|[,;|\n]+/)
    .map((fragment) => providerSafePersonaValue(label, fragment))
    .filter((fragment: string | null): fragment is string =>
      !!fragment && isProviderRelevantRetainedText(`${label} ${fragment}`, query),
    )
    .slice(0, 5);
  return relevant.length ? relevant.join(", ") : null;
}

/**
 * Build the provider-bound persona subset. Stable style metadata is always
 * useful; raw biography, interests, phrases, topics, and message samples are
 * included only when they are safe AND lexically relevant to this turn.
 * Complete stored persona data remains available to owner inspect/export.
 */
export function buildPersonaContext(persona: PersonaData | null, query = ""): string {
  if (!persona) return "";

  const sections: string[] = [];

  // Source 1: Onboarding answers
  const speechStyle = providerSafePersonaValue("owner_speech_style", persona.owner_speech_style);
  if (speechStyle) sections.push(`- Speech style: ${speechStyle}`);
  const interests = providerRelevantPersonaValue("owner_interests", persona.owner_interests, query);
  if (interests) sections.push(`- Interests: ${interests}`);
  const expressions = providerRelevantPersonaValue("owner_expressions", persona.owner_expressions, query);
  if (expressions) sections.push(`- Favorite expressions: ${expressions}`);
  const tone = providerSafePersonaValue("owner_tone", persona.owner_tone);
  if (tone) sections.push(`- Tone: ${tone}`);
  const language = providerSafePersonaValue("owner_language", persona.owner_language);
  if (language) sections.push(`- Language preference: ${language}`);
  const bio = providerRelevantPersonaValue("owner_bio", persona.owner_bio, query);
  if (bio) sections.push(`- Owner self-description: ${bio}`);

  // Source 2: Chat analysis results
  const vocabulary = providerSafePersonaValue("vocabulary_style", persona.vocabulary_style);
  if (vocabulary) sections.push(`- Vocabulary patterns: ${vocabulary}`);
  if (persona.analyzed_patterns) {
    const p = persona.analyzed_patterns as any;
    const formality = providerSafePersonaValue("analyzed_patterns.formality", p.formality);
    const emojiUsage = providerSafePersonaValue("analyzed_patterns.emoji_usage", p.emoji_usage);
    const punctuation = providerSafePersonaValue("analyzed_patterns.punctuation_style", p.punctuation_style);
    if (formality) sections.push(`- Formality level: ${formality}`);
    if (emojiUsage) sections.push(`- Emoji usage: ${emojiUsage}`);
    if (punctuation) sections.push(`- Punctuation style: ${punctuation}`);
  }
  if (Array.isArray(persona.sample_messages) && persona.sample_messages.length > 0) {
    const examples = persona.sample_messages
      .map((message: unknown) => providerRelevantPersonaValue("sample_messages", message, query))
      .filter((message: string | null): message is string => !!message)
      .slice(0, 2);
    if (examples.length) {
      sections.push(`- Relevant owner message examples:\n${examples.map((m) => `    "${m}"`).join("\n")}`);
    }
  }

  // Source 3: Connected platform observations
  if (Array.isArray(persona.observed_topics)) {
    const topics = persona.observed_topics
      .map((topic: unknown) => providerRelevantPersonaValue("observed_topics", topic, query))
      .filter((topic: string | null): topic is string => !!topic)
      .slice(0, 5);
    if (topics.length) sections.push(`- Relevant recent topics: ${topics.join(", ")}`);
  }
  if (persona.observed_style) {
    const style = persona.observed_style as any;
    const averageLength = providerSafePersonaValue("observed_style.avg_message_length", style.avg_message_length);
    const commonPhrases = providerRelevantPersonaValue("observed_style.common_phrases", style.common_phrases, query);
    if (averageLength) sections.push(`- Avg message length: ${averageLength}`);
    if (commonPhrases) sections.push(`- Relevant common phrases: ${commonPhrases}`);
  }

  if (sections.length === 0) return "";

  return `\nOWNER PERSONA:
${sections.join("\n")}
IMPORTANT: Mirror the owner's speech patterns naturally while replying in English only. Use equivalent English expressions, match their tone, and use natural English slang when they speak casually. Adapt your personality to feel like a natural extension of the owner.`;
}

// ── Analyze chat history text and extract personality patterns ──

export function isPersonaAnalysisProviderSafe(chatText: string): boolean {
  return isProviderSafeRetainedText(`persona_analysis ${chatText}`);
}

export async function analyzeChatHistory(
  petId: number,
  chatText: string,
): Promise<ChatAnalysisResult> {
  const trimmed = chatText.slice(0, 50000);
  if (!isPersonaAnalysisProviderSafe(trimmed)) {
    throw new Error("Chat text contains content that cannot be sent for persona analysis.");
  }

  const systemPrompt = `You are a linguistic analysis AI. Analyze the provided chat history and extract the writer's personality patterns. Return ONLY valid JSON with no markdown formatting, no code blocks.

Return this exact JSON structure:
{
  "patterns": {
    "formality": "casual/formal/mixed",
    "sentence_length": "short/medium/long",
    "emoji_usage": "none/rare/moderate/heavy",
    "punctuation_style": "description of punctuation habits"
  },
  "sampleMessages": ["msg1", "msg2", ...],
  "vocabularyStyle": "description of vocabulary and expression patterns",
  "detectedTone": "casual/formal/meme/chill/energetic/sarcastic",
  "detectedLanguage": "ko/en/mixed",
  "interests": ["topic1", "topic2", ...]
}

All model-authored descriptions, topic labels, and interest labels MUST be written in English only, even when the source messages use another language.
For sampleMessages, copy 5-10 representative source messages verbatim. Never translate or rewrite them.
For vocabularyStyle, describe their word choices, slang, abbreviations, and expression patterns in English.
For interests, extract topics they frequently discuss and label them in English.`;

  const raw = await callAnalytical(systemPrompt, trimmed, 1000, petId);

  // Parse JSON from response (handle potential markdown wrapping)
  let cleaned = raw;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return normalizeChatAnalysis(JSON.parse(cleaned));
  } catch (err) {
    console.error("[persona] Failed to parse chat analysis JSON:", err, raw);
    throw new Error("Failed to parse chat analysis result");
  }
}

// ── Observe messages from connected platforms and update persona ──

export function selectProviderSafePersonaObservations(messages: string[]): string[] {
  return messages
    .filter((message) =>
      typeof message === "string"
      && isProviderSafeRetainedText(`persona_observation ${message}`),
    )
    .slice(-40);
}

export async function observeAndUpdate(petId: number, messages: string[]): Promise<void> {
  const providerMessages = selectProviderSafePersonaObservations(messages);
  if (!providerMessages.length) return;

  // Observe against a deletion/edit generation and a specific persona version.
  // The model call may take seconds; neither a cleared persona nor a newer
  // observation may be overwritten when it returns.
  let start: { memoryEpoch: number; personaVersion: number } | null = null;
  try {
    start = await withLockedPetModifiers(petId, async ({ tx, pet }) => {
      const persona = await tx.petPersona.findUnique({
        where: { pet_id: petId },
        select: { persona_version: true },
      });
      return persona
        ? { memoryEpoch: pet.memory_epoch, personaVersion: persona.persona_version }
        : null;
    });
  } catch (err) {
    console.error("[persona] observeAndUpdate snapshot error:", err);
    return;
  }
  if (!start) return;

  const combined = providerMessages.join("\n");

  const systemPrompt = `Analyze these recent messages and extract:
1. Topics being discussed (as a JSON array of strings)
2. Style observations: average message length, common phrases, tone

Write every generated topic and style description in English only. Do not copy
non-English phrases into generated fields.

Return ONLY valid JSON:
{
  "topics": ["topic1", "topic2"],
  "style": {
    "avg_message_length": "short/medium/long",
    "common_phrases": "comma-separated phrases",
    "tone": "casual/formal/energetic/chill"
  }
}`;

  try {
    const raw = await callAnalytical(systemPrompt, combined.slice(0, 10000), 500, petId);
    let cleaned = raw;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const observations = normalizePersonaObservation(JSON.parse(cleaned));

    const committed = await withLockedPetModifiers(petId, async ({ tx, pet }) => {
      if (pet.memory_epoch !== start.memoryEpoch) return false;
      const current = await tx.petPersona.findUnique({
        where: { pet_id: petId },
        select: { persona_version: true },
      });
      if (!current || current.persona_version !== start.personaVersion) return false;
      await tx.petPersona.update({
        where: { pet_id: petId },
        data: {
          observed_topics: observations.topics,
          observed_style: observations.style,
          last_observed_at: new Date(),
          persona_version: { increment: 1 },
        },
      });
      return true;
    });

    if (committed) {
      console.log(`[persona] Updated observations for pet ${petId}: ${observations.topics.length} topics`);
    }
  } catch (err) {
    console.error("[persona] observeAndUpdate error:", err);
  }
}

// ── Get persona for a pet ──

export async function getPersona(petId: number): Promise<PersonaData | null> {
  const persona = await prisma.petPersona.findUnique({ where: { pet_id: petId } });
  return persona ? sanitizeStoredPersonaGeneratedFields(persona) as PersonaData : null;
}

// ── Save onboarding answers ──

export async function saveOnboarding(petId: number, data: OnboardingData): Promise<PersonaData> {
  // ── Mirror into PetMemoryManager USER.md ──
  // PetMemoryManager reads pet.personality_modifiers.user_profile. By seeding it
  // at onboarding completion, the chat / skills layer sees owner context on the
  // very first turn — no "I don't know you yet" cold start.
  const now = new Date().toISOString();
  const seed: any[] = [];
  const add = (key: string, content: string | null | undefined, category: string) => {
    if (!content) return;
    seed.push({ key, content, category, source: "onboarding", updatedAt: now });
  };
  add("onboarding_tone",       data.tone        && `Prefers ${data.tone} tone`,                    "preference");
  add("onboarding_speech",     data.speech_style && `Communication style: ${data.speech_style}`,   "communication");
  add("onboarding_expressions", data.expressions && `Self-described role: ${data.expressions}`,    "preference");
  add("onboarding_interests",  data.interests   && `Interests: ${data.interests}`,                 "interest");
  add("onboarding_language",   data.language    && `Preferred language: ${data.language}`,         "communication");
  add("onboarding_bio",        data.bio         && data.bio.slice(0, 400),                         "context");

  const result = await withLockedPetModifiers(petId, async ({ tx, modifiers }) => {
    const persona = await tx.petPersona.upsert({
      where: { pet_id: petId },
      create: {
        pet_id: petId,
        owner_speech_style: data.speech_style ?? null,
        owner_interests: data.interests ?? null,
        owner_expressions: data.expressions ?? null,
        owner_tone: data.tone ?? null,
        owner_language: data.language ?? null,
        owner_bio: data.bio ?? null,
      },
      update: {
        ...(data.speech_style !== undefined && { owner_speech_style: data.speech_style }),
        ...(data.interests !== undefined && { owner_interests: data.interests }),
        ...(data.expressions !== undefined && { owner_expressions: data.expressions }),
        ...(data.tone !== undefined && { owner_tone: data.tone }),
        ...(data.language !== undefined && { owner_language: data.language }),
        ...(data.bio !== undefined && { owner_bio: data.bio }),
        persona_version: { increment: 1 },
      },
    });

    const existing: any[] = Array.isArray(modifiers.user_profile)
      ? modifiers.user_profile as any[]
      : [];
    const byKey = new Map<string, any>(existing.map((entry: any) => [entry.key, entry]));
    for (const entry of seed) byKey.set(entry.key, entry);
    await tx.pet.update({
      where: { id: petId },
      data: {
        personality_modifiers: {
          ...modifiers,
          user_profile: Array.from(byKey.values()),
        } as any,
        // An explicit owner correction invalidates any in-flight analysis or
        // generated cache that began with the prior persona.
        memory_epoch: { increment: 1 },
      },
    });
    return persona;
  });

  return result as any;
}

// ── Save chat analysis results ──

export async function saveChatAnalysis(
  petId: number,
  analysis: ChatAnalysisResult,
  expectedEpoch: number,
): Promise<PersonaData | null> {
  // Defense in depth: callers cannot bypass the generated-language boundary by
  // constructing ChatAnalysisResult directly. User sample excerpts are kept as-is.
  const safeAnalysis = normalizeChatAnalysis(analysis);
  const persona = await withLockedPetModifiers(petId, async ({ tx, pet }) => {
    // The analysis provider call can outlive an owner clear/correction. That
    // mutation advances memory_epoch under this same lock, so a result derived
    // from the earlier ledger must be discarded instead of recreating the
    // deleted PetPersona row.
    if (pet.memory_epoch !== expectedEpoch) return null;

    const saved = await tx.petPersona.upsert({
      where: { pet_id: petId },
      create: {
        pet_id: petId,
        analyzed_patterns: safeAnalysis.patterns,
        sample_messages: safeAnalysis.sampleMessages,
        vocabulary_style: safeAnalysis.vocabularyStyle,
        owner_tone: safeAnalysis.detectedTone,
        owner_language: safeAnalysis.detectedLanguage,
        owner_interests: safeAnalysis.interests.join(", "),
      },
      update: {
        analyzed_patterns: safeAnalysis.patterns,
        sample_messages: safeAnalysis.sampleMessages,
        vocabulary_style: safeAnalysis.vocabularyStyle,
        // Only update tone/language/interests if not already set by onboarding
        persona_version: { increment: 1 },
      },
    });
    await tx.pet.update({
      where: { id: petId },
      data: { memory_epoch: { increment: 1 } },
    });
    return saved;
  });
  if (!persona) return null;
  return sanitizeStoredPersonaGeneratedFields(persona) as PersonaData;
}

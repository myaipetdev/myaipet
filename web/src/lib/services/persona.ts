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

export interface ChatAnalysisResult {
  patterns: {
    formality: string;
    sentence_length: string;
    emoji_usage: string;
    punctuation_style: string;
  };
  sampleMessages: string[];
  vocabularyStyle: string;
  detectedTone: string;
  detectedLanguage: string;
  interests: string[];
}

export interface OnboardingData {
  speech_style?: string;
  interests?: string;
  expressions?: string;
  tone?: string;
  language?: string;
  bio?: string;
}

// ── Grok API helper (analytical, low-temperature) ──

async function callGrokAnalytical(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 800,
): Promise<string> {
  const grokKey = process.env.GROK_API_KEY;
  if (!grokKey) throw new Error("GROK_API_KEY not configured");

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${grokKey}`,
    },
    body: JSON.stringify({
      model: "grok-3-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[persona] Grok analytical API error:", res.status, text);
    throw new Error(`Grok API returned ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty response from Grok");
  return content;
}

// ── Build persona context string for system prompts ──

export function buildPersonaContext(persona: PersonaData | null): string {
  if (!persona) return "";

  const sections: string[] = [];

  // Source 1: Onboarding answers
  if (persona.owner_speech_style) {
    sections.push(`- Speech style: ${persona.owner_speech_style}`);
  }
  if (persona.owner_interests) {
    sections.push(`- Interests: ${persona.owner_interests}`);
  }
  if (persona.owner_expressions) {
    sections.push(`- Favorite expressions: ${persona.owner_expressions}`);
  }
  if (persona.owner_tone) {
    sections.push(`- Tone: ${persona.owner_tone}`);
  }
  if (persona.owner_language) {
    sections.push(`- Language preference: ${persona.owner_language}`);
  }
  if (persona.owner_bio) {
    sections.push(`- Owner self-description: ${persona.owner_bio}`);
  }

  // Source 2: Chat analysis results
  if (persona.vocabulary_style) {
    sections.push(`- Vocabulary patterns: ${persona.vocabulary_style}`);
  }
  if (persona.analyzed_patterns) {
    const p = persona.analyzed_patterns as any;
    if (p.formality) sections.push(`- Formality level: ${p.formality}`);
    if (p.emoji_usage) sections.push(`- Emoji usage: ${p.emoji_usage}`);
    if (p.punctuation_style) sections.push(`- Punctuation style: ${p.punctuation_style}`);
  }
  if (Array.isArray(persona.sample_messages) && persona.sample_messages.length > 0) {
    const examples = persona.sample_messages.slice(0, 5);
    sections.push(`- Example owner messages:\n${examples.map((m: string) => `    "${m}"`).join("\n")}`);
  }

  // Source 3: Connected platform observations
  if (persona.observed_topics) {
    const topics = Array.isArray(persona.observed_topics)
      ? persona.observed_topics.join(", ")
      : JSON.stringify(persona.observed_topics);
    sections.push(`- Recent topics of interest: ${topics}`);
  }
  if (persona.observed_style) {
    const style = persona.observed_style as any;
    if (style.avg_message_length) sections.push(`- Avg message length: ${style.avg_message_length}`);
    if (style.common_phrases) sections.push(`- Common phrases: ${style.common_phrases}`);
  }

  if (sections.length === 0) return "";

  return `\nOWNER PERSONA:
${sections.join("\n")}
IMPORTANT: Mirror the owner's speech patterns naturally. Use their expressions, match their tone and language preference. If they use slang, use slang. If they use ㅋㅋ, use ㅋㅋ. If they speak casually, speak casually. Adapt your personality to feel like a natural extension of the owner.`;
}

// ── Analyze chat history text and extract personality patterns ──

export async function analyzeChatHistory(chatText: string): Promise<ChatAnalysisResult> {
  const trimmed = chatText.slice(0, 50000);

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

For sampleMessages, pick 5-10 most representative messages that capture the person's unique voice.
For vocabularyStyle, describe their word choices, slang, abbreviations, and expression patterns.
For interests, extract topics they frequently discuss.`;

  const raw = await callGrokAnalytical(systemPrompt, trimmed, 1000);

  // Parse JSON from response (handle potential markdown wrapping)
  let cleaned = raw;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      patterns: parsed.patterns || {
        formality: "casual",
        sentence_length: "medium",
        emoji_usage: "moderate",
        punctuation_style: "standard",
      },
      sampleMessages: Array.isArray(parsed.sampleMessages) ? parsed.sampleMessages : [],
      vocabularyStyle: parsed.vocabularyStyle || "",
      detectedTone: parsed.detectedTone || "casual",
      detectedLanguage: parsed.detectedLanguage || "mixed",
      interests: Array.isArray(parsed.interests) ? parsed.interests : [],
    };
  } catch (err) {
    console.error("[persona] Failed to parse chat analysis JSON:", err, raw);
    throw new Error("Failed to parse chat analysis result");
  }
}

// ── Observe messages from connected platforms and update persona ──

export async function observeAndUpdate(petId: number, messages: string[]): Promise<void> {
  if (!messages.length) return;

  const combined = messages.join("\n");

  const systemPrompt = `Analyze these recent messages and extract:
1. Topics being discussed (as a JSON array of strings)
2. Style observations: average message length, common phrases, tone

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
    const raw = await callGrokAnalytical(systemPrompt, combined.slice(0, 10000), 500);
    let cleaned = raw;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleaned);

    await prisma.petPersona.update({
      where: { pet_id: petId },
      data: {
        observed_topics: parsed.topics || [],
        observed_style: parsed.style || {},
        last_observed_at: new Date(),
        persona_version: { increment: 1 },
      },
    });

    console.log(`[persona] Updated observations for pet ${petId}: ${(parsed.topics || []).length} topics`);
  } catch (err) {
    console.error("[persona] observeAndUpdate error:", err);
  }
}

// ── Get persona for a pet ──

export async function getPersona(petId: number): Promise<PersonaData | null> {
  return prisma.petPersona.findUnique({ where: { pet_id: petId } }) as any;
}

// ── Save onboarding answers ──

export async function saveOnboarding(petId: number, data: OnboardingData): Promise<PersonaData> {
  return prisma.petPersona.upsert({
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
  }) as any;
}

// ── Save chat analysis results ──

export async function saveChatAnalysis(
  petId: number,
  analysis: ChatAnalysisResult,
): Promise<PersonaData> {
  return prisma.petPersona.upsert({
    where: { pet_id: petId },
    create: {
      pet_id: petId,
      analyzed_patterns: analysis.patterns,
      sample_messages: analysis.sampleMessages,
      vocabulary_style: analysis.vocabularyStyle,
      owner_tone: analysis.detectedTone,
      owner_language: analysis.detectedLanguage,
      owner_interests: analysis.interests.join(", "),
    },
    update: {
      analyzed_patterns: analysis.patterns,
      sample_messages: analysis.sampleMessages,
      vocabulary_style: analysis.vocabularyStyle,
      // Only update tone/language/interests if not already set by onboarding
      persona_version: { increment: 1 },
    },
  }) as any;
}

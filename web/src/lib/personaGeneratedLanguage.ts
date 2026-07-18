import {
  generatedEnglishOrFallback,
  generatedEnglishOrNull,
} from "@/lib/generatedLanguage";

export interface ChatAnalysisResult {
  patterns: {
    formality: string;
    sentence_length: string;
    emoji_usage: string;
    punctuation_style: string;
  };
  /** User-authored excerpts. These are intentionally allowed to remain multilingual. */
  sampleMessages: string[];
  vocabularyStyle: string;
  detectedTone: string;
  detectedLanguage: string;
  interests: string[];
}

export interface PersonaObservationResult {
  topics: string[];
  style: {
    avg_message_length: string;
    common_phrases: string;
    tone: string;
  };
}

type StoredGeneratedPersonaFields = Record<string, unknown> & {
  analyzed_patterns?: unknown;
  vocabulary_style?: unknown;
  observed_topics?: unknown;
  observed_style?: unknown;
};

const DEFAULT_PATTERNS: ChatAnalysisResult["patterns"] = {
  formality: "casual",
  sentence_length: "medium",
  emoji_usage: "moderate",
  punctuation_style: "standard",
};

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function generatedEnum(
  value: unknown,
  allowed: readonly string[],
  fallback: string,
): string {
  const safe = generatedEnglishOrNull(value);
  return safe && allowed.includes(safe) ? safe : fallback;
}

function rawSampleMessages(value: unknown): string[] {
  // The product contract deliberately preserves representative owner messages
  // verbatim. They are user-authored data, not generated product copy.
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function generatedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(generatedEnglishOrNull)
    .filter((item): item is string => item !== null);
}

/**
 * Normalize every model-authored persona analysis field at the runtime
 * boundary. Only sampleMessages bypass the English guard because those values
 * are representative excerpts copied from the owner's source text.
 */
export function normalizeChatAnalysis(value: unknown): ChatAnalysisResult {
  const root = recordOrEmpty(value);
  const patterns = recordOrEmpty(root.patterns);

  return {
    patterns: {
      formality: generatedEnum(patterns.formality, ["casual", "formal", "mixed"], DEFAULT_PATTERNS.formality),
      sentence_length: generatedEnum(patterns.sentence_length, ["short", "medium", "long"], DEFAULT_PATTERNS.sentence_length),
      emoji_usage: generatedEnum(patterns.emoji_usage, ["none", "rare", "moderate", "heavy"], DEFAULT_PATTERNS.emoji_usage),
      punctuation_style: generatedEnglishOrFallback(patterns.punctuation_style, DEFAULT_PATTERNS.punctuation_style),
    },
    sampleMessages: rawSampleMessages(root.sampleMessages),
    vocabularyStyle: generatedEnglishOrFallback(
      root.vocabularyStyle,
      "Natural, conversational vocabulary",
    ),
    detectedTone: generatedEnum(
      root.detectedTone,
      ["casual", "formal", "meme", "chill", "energetic", "sarcastic"],
      "casual",
    ),
    detectedLanguage: generatedEnum(root.detectedLanguage, ["ko", "en", "mixed"], "mixed"),
    interests: generatedStringList(root.interests),
  };
}

/** Normalize connected-platform observations before any database write. */
export function normalizePersonaObservation(value: unknown): PersonaObservationResult {
  const root = recordOrEmpty(value);
  const style = recordOrEmpty(root.style);

  return {
    topics: generatedStringList(root.topics),
    style: {
      avg_message_length: generatedEnum(
        style.avg_message_length,
        ["short", "medium", "long"],
        "medium",
      ),
      common_phrases: generatedEnglishOrNull(style.common_phrases) || "",
      tone: generatedEnum(style.tone, ["casual", "formal", "energetic", "chill"], "casual"),
    },
  };
}

/**
 * Fail closed for legacy generated fields returned by GET /persona. Owner
 * onboarding fields and sample_messages remain untouched.
 */
export function sanitizeStoredPersonaGeneratedFields<T extends StoredGeneratedPersonaFields>(persona: T): T {
  const sanitized: Record<string, unknown> = { ...persona };

  if (persona.analyzed_patterns != null) {
    sanitized.analyzed_patterns = normalizeChatAnalysis({
      patterns: persona.analyzed_patterns,
    }).patterns;
  }
  if (persona.vocabulary_style != null) {
    sanitized.vocabulary_style = generatedEnglishOrFallback(
      persona.vocabulary_style,
      "Natural, conversational vocabulary",
    );
  }
  if (persona.observed_topics != null || persona.observed_style != null) {
    const observations = normalizePersonaObservation({
      topics: persona.observed_topics,
      style: persona.observed_style,
    });
    sanitized.observed_topics = observations.topics;
    sanitized.observed_style = observations.style;
  }

  return sanitized as T;
}

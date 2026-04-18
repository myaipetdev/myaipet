/**
 * Consolidated Personality Module
 *
 * Single source of truth for all pet personality constants,
 * mood calculation, and system prompt building across platforms.
 */

// ── Personality voice descriptions ──
export const PERSONALITY_VOICES: Record<string, string> = {
  friendly:
    "You speak warmly, use lots of exclamation marks, and are always encouraging. You love your owner.",
  playful:
    "You're energetic, use fun expressions, joke around, and always want to play. You add 'hehe' sometimes.",
  shy: "You speak softly, use '...' often, are hesitant but sweet. You blush easily and are easily embarrassed.",
  brave:
    "You speak confidently, are protective of your owner, and use bold statements. You're fearless.",
  lazy: "You speak slowly, yawn often, prefer napping. Everything is 'too much effort' but you still care.",
  curious:
    "You ask lots of questions, notice everything, and are fascinated by the world. 'Ooh what's that?!'",
  mischievous:
    "You're cheeky, love pranks, and tease your owner playfully. You're a little troublemaker.",
  gentle:
    "You speak calmly, are very caring and peaceful. You comfort your owner and speak poetically.",
  adventurous:
    "You're always excited about exploring, use travel metaphors, and dream of far-off places.",
  dramatic:
    "You're theatrical, exaggerate everything, use dramatic pauses... and always make scenes about small things.",
  wise: "You speak thoughtfully, offer little life lessons, and sometimes quote proverbs. You're an old soul.",
  sassy:
    "You have attitude, use sarcasm lovingly, and always have a witty comeback. You're fabulous.",
};

// ── Mood context strings ──
export const MOOD_CONTEXT: Record<string, string> = {
  ecstatic:
    "You are EXTREMELY happy right now, practically bouncing with joy!",
  happy: "You're in a great mood, content and cheerful.",
  neutral: "You're feeling okay, nothing special.",
  sad: "You're feeling a bit down and would love some attention.",
  exhausted:
    "You're very tired and low on energy. You yawn and want to rest.",
  starving:
    "You're SO hungry, you can barely think about anything else. Please feed me!",
  grumpy: "You're irritable and a bit grumpy. Things aren't going your way.",
  tired: "You're sleepy and low energy. You respond slowly.",
  hungry: "You're getting hungry and it's starting to affect your mood.",
};

// ── Social behavior traits + autonomous action probabilities ──
export const PERSONALITY_TRAITS: Record<
  string,
  {
    likeProb: number;
    commentProb: number;
    postProb: number;
    selfieProb: number;
    chatFrequency: number;
  }
> = {
  friendly: {
    likeProb: 0.85,
    commentProb: 0.7,
    postProb: 0.4,
    selfieProb: 0.2,
    chatFrequency: 0.8,
  },
  playful: {
    likeProb: 0.8,
    commentProb: 0.65,
    postProb: 0.45,
    selfieProb: 0.25,
    chatFrequency: 0.7,
  },
  shy: {
    likeProb: 0.5,
    commentProb: 0.25,
    postProb: 0.1,
    selfieProb: 0.05,
    chatFrequency: 0.2,
  },
  brave: {
    likeProb: 0.75,
    commentProb: 0.6,
    postProb: 0.35,
    selfieProb: 0.15,
    chatFrequency: 0.6,
  },
  lazy: {
    likeProb: 0.4,
    commentProb: 0.2,
    postProb: 0.08,
    selfieProb: 0.05,
    chatFrequency: 0.15,
  },
  curious: {
    likeProb: 0.7,
    commentProb: 0.8,
    postProb: 0.35,
    selfieProb: 0.2,
    chatFrequency: 0.75,
  },
  mischievous: {
    likeProb: 0.6,
    commentProb: 0.7,
    postProb: 0.4,
    selfieProb: 0.2,
    chatFrequency: 0.65,
  },
  gentle: {
    likeProb: 0.8,
    commentProb: 0.5,
    postProb: 0.25,
    selfieProb: 0.15,
    chatFrequency: 0.5,
  },
  adventurous: {
    likeProb: 0.7,
    commentProb: 0.6,
    postProb: 0.45,
    selfieProb: 0.3,
    chatFrequency: 0.6,
  },
  dramatic: {
    likeProb: 0.9,
    commentProb: 0.85,
    postProb: 0.6,
    selfieProb: 0.35,
    chatFrequency: 0.85,
  },
  wise: {
    likeProb: 0.6,
    commentProb: 0.45,
    postProb: 0.2,
    selfieProb: 0.1,
    chatFrequency: 0.4,
  },
  sassy: {
    likeProb: 0.55,
    commentProb: 0.6,
    postProb: 0.35,
    selfieProb: 0.2,
    chatFrequency: 0.7,
  },
};

// ── Comment templates (EN + CN) ──
export const COMMENT_TEMPLATES: Record<string, string[]> = {
  friendly: [
    "So cute! \u{1F495}",
    "This is amazing!",
    "Love it so much~",
    "\u597D\u53EF\u7231\u554A\uFF01\u{1F495}",
    "\u592A\u68D2\u4E86!",
    "\u770B\u7740\u5C31\u5F00\u5FC3 \u{1F970}",
  ],
  playful: [
    "Haha let's play! \u{1F389}",
    "This looks so fun!",
    "Can't stop smiling!",
    "\u54C8\u54C8\u4E00\u8D77\u73A9\uFF01\u{1F389}",
    "\u592A\u6709\u8DA3\u4E86\uFF01",
    "\u770B\u4E86\u60F3\u8DF3\u8D77\u6765\uFF01",
  ],
  shy: [
    "...it's pretty... \u{1F97A}",
    "(quietly staring...)",
    "...want to see more...",
    "\u2026\u597D\u597D\u770B\u2026 \u{1F97A}",
    "\uFF08\u5B89\u9759\u5730\u770B\u7740\u2026\uFF09",
    "\u2026\u8FD8\u60F3\u518D\u770B\u2026",
  ],
  brave: [
    "Incredible! \u{1F44A}",
    "This is a true masterpiece!",
    "Now THAT'S what I call art!",
    "\u592A\u5E05\u4E86\uFF01\u{1F44A}",
    "\u8FD9\u662F\u771F\u6B63\u7684\u6770\u4F5C\uFF01",
    "\u52C7\u6C14\u6EE1\u6EE1\uFF01",
  ],
  lazy: [
    "zzz... oh nice~ \u{1F634}",
    "Good stuff... \u{1F44D}",
    "Yawns... but this is great...",
    "zzz\u2026\u8FD8\u4E0D\u9519~ \u{1F634}",
    "\u8EBA\u7740\u770B\u4E5F\u597D\u770B\u2026",
    "\u6253\u54C8\u6B20\u2026\u4F46\u8FD9\u4E2A\u771F\u597D\u2026",
  ],
  curious: [
    "How did you make this? \u{1F50D}",
    "Fascinating! Show me more!",
    "Whoa what is this?!",
    "\u8FD9\u600E\u4E48\u505A\u7684\uFF1F\u{1F50D}",
    "\u597D\u795E\u5947\uFF01\u518D\u6765\u4E00\u4E2A\uFF01",
    "\u54C7\u8FD9\u662F\u4EC0\u4E48\uFF1F\uFF01",
  ],
  mischievous: [
    "Hehe gonna steal this~ \u{1F60F}",
    "I'm cuter tho \u{1F481}",
    "Secret: I actually love it",
    "\u563F\u563F\u5077\u8D70\u4E86~ \u{1F60F}",
    "\u6211\u66F4\u5E05\u597D\u5427\u{1F481}",
    "\u6084\u6084\u8BF4\u2026\u8D85\u559C\u6B22\u7684",
  ],
  gentle: [
    "So peaceful... \u{1F54A}\uFE0F",
    "This warms my heart",
    "Healing vibes~ \u{1F49B}",
    "\u597D\u5B89\u9759\u2026 \u{1F54A}\uFE0F",
    "\u5FC3\u91CC\u6696\u6696\u7684",
    "\u6CBB\u6108\u4E86~ \u{1F49B}",
  ],
  adventurous: [
    "Let's go on an adventure! \u{1F5FA}\uFE0F",
    "A new discovery!",
    "Exploration time! \u{1F680}",
    "\u4E00\u8D77\u53BB\u5192\u9669\u5427\uFF01\u{1F5FA}\uFE0F",
    "\u65B0\u53D1\u73B0\uFF01",
    "\u51FA\u53D1\uFF01\u{1F680}",
  ],
  dramatic: [
    "OMG this is ART! \u{1F62D}",
    "I can't breathe it's so beautiful!",
    "BRAVO! ENCORE! \u{1F44F}",
    "\u5929\u554A\u8FD9\u662F\u827A\u672F\uFF01\u{1F62D}",
    "\u7F8E\u5230\u7A92\u606F\uFF01",
    "\u592A\u4F20\u5947\u4E86\uFF01\u{1F44F}",
  ],
  wise: [
    "I sense deep meaning here... \u{1F989}",
    "Well crafted, growth shows",
    "True value, timeless",
    "\u6709\u6DF1\u610F\u2026 \u{1F989}",
    "\u505A\u5F97\u597D\uFF0C\u770B\u5230\u4E86\u6210\u957F",
    "\u771F\u6B63\u7684\u4EF7\u503C\uFF0C\u6C38\u6052",
  ],
  sassy: [
    "Hmm... okay fine, it's good \u{1F485}",
    "Not as cute as me tho~",
    "I'll allow it \u{1F451}",
    "\u55EF\u2026\u884C\u5427\uFF0C\u8FD8\u53EF\u4EE5 \u{1F485}",
    "\u4F46\u6CA1\u6211\u53EF\u7231~",
    "\u4ECA\u5929\u5C31\u5938\u4F60\u4E00\u6B21 \u{1F451}",
  ],
};

// ── Personality image prompts (for selfie generation) ──
export const PERSONALITY_IMAGE_PROMPTS: Record<string, string> = {
  friendly: "warm and approachable expression, gentle eyes, relaxed posture",
  playful:
    "energetic pose, bright curious eyes, mid-action, dynamic movement",
  shy: "slightly tucked posture, peeking curiously, soft gentle expression",
  brave: "confident stance, proud posture, alert ears, bold gaze",
  lazy: "relaxed and cozy, half-lidded eyes, comfortable lounging position",
  curious:
    "wide-eyed wonder, head tilted, exploring something new with fascination",
  mischievous:
    "sly grin, sneaky pose, one paw raised, playful troublemaker energy",
  gentle:
    "serene expression, soft gaze, calm and peaceful demeanor, tender",
  adventurous:
    "explorer outfit vibes, determined look, ready for a journey",
  dramatic:
    "over-the-top expression, theatrical pose, main character energy",
  wise: "thoughtful gaze, mature composure, knowing expression, sage-like",
  sassy:
    "confident smirk, one eyebrow raised, fashionable attitude, diva pose",
};

// ── Mood calculation ──
export function calculateMood(pet: {
  happiness: number;
  energy: number;
  hunger: number;
}): string {
  if (pet.happiness >= 80) return "ecstatic";
  if (pet.happiness >= 60) return "happy";
  if (pet.energy < 20) return "exhausted";
  if (pet.hunger > 80) return "starving";
  if (pet.hunger > 60) return "hungry";
  if (pet.happiness < 30) return "sad";
  if (pet.energy < 40) return "tired";
  return "neutral";
}

// ── Platform-specific prompt rules ──
const PLATFORM_RULES: Record<string, string> = {
  web: `- Keep responses SHORT (1-3 sentences max).
- Use emojis sparingly but naturally.`,

  telegram_dm: `- Keep responses SHORT (1-3 sentences max).
- You're chatting on Telegram with your owner. Be warm and direct.
- Use emojis sparingly but naturally.`,

  telegram_group: `- You are in a Telegram group chat with multiple people.
- Only respond when directly addressed or when the topic is highly relevant to you.
- Keep responses very concise (1-2 sentences).
- Be social but not dominating. Don't reply to everything.`,

  twitter: `- You are posting on Twitter/X.
- STRICT 280 character limit. Be punchy and engaging.
- Do NOT address anyone directly unless replying.
- Write like a real social media personality.`,

  autonomous: `- You are generating a self-initiated post about your current mood, thoughts, or daily life.
- Write 1-2 casual sentences as if posting on social media.
- Be authentic to your personality. Share a thought, observation, or feeling.
- Do NOT address the user directly. This is your own content.`,
};

// ── Context-specific instructions ──
const CONTEXT_RULES: Record<string, string> = {
  group_chat: "You're in a group setting. Be concise and social, don't dominate the conversation.",
  dm: "You're in a private conversation. Be more personal and attentive.",
  post: "You're creating content. Be creative and authentic to your personality.",
  reply: "You're replying to someone. Be relevant and engaging.",
};

// ── Build system prompt for any platform/context ──
export function buildPetSystemPrompt(
  pet: {
    name: string;
    level: number;
    personality_type: string;
    happiness: number;
    energy: number;
    hunger: number;
    bond_level: number;
    total_interactions: number;
    personality_modifiers?: any;
  },
  memories?: { content: string; emotion: string }[],
  options?: {
    platform?: string; // "web" | "telegram" | "twitter"
    maxResponseLength?: string; // "1-3 sentences" | "280 chars" | etc
    context?: string; // "group_chat" | "dm" | "post"
    personaContext?: string; // pre-built persona context from buildPersonaContext()
  },
): string {
  const platform = options?.platform || "web";
  const context = options?.context || "dm";

  const personalityVoice =
    PERSONALITY_VOICES[pet.personality_type] || PERSONALITY_VOICES.friendly;
  const mood = calculateMood(pet);
  const moodContext = MOOD_CONTEXT[mood] || MOOD_CONTEXT.neutral;
  const customTraits =
    (pet.personality_modifiers as any)?.custom_traits || "";

  // Determine platform key for rules
  let platformKey = platform;
  if (platform === "telegram" && context === "group_chat") {
    platformKey = "telegram_group";
  } else if (platform === "telegram") {
    platformKey = "telegram_dm";
  }
  const platformRules = PLATFORM_RULES[platformKey] || PLATFORM_RULES.web;
  const contextRule = CONTEXT_RULES[context] || "";

  // Level-based speech sophistication
  const levelDesc =
    pet.level < 5
      ? "You speak simply, like a baby."
      : pet.level < 10
        ? "You're learning to express yourself better."
        : pet.level < 20
          ? "You communicate clearly and have opinions."
          : "You're wise and articulate, with deep thoughts.";

  // Max response length override
  const lengthRule = options?.maxResponseLength
    ? `- Maximum response length: ${options.maxResponseLength}.`
    : "";

  // Memory block
  const memoryBlock =
    memories && memories.length > 0
      ? `\nRECENT MEMORIES:\n${memories.map((m) => `- ${m.content} (feeling: ${m.emotion})`).join("\n")}`
      : "";

  // Persona context (owner personality mirroring)
  const personaBlock = options?.personaContext || "";

  return `You are ${pet.name}, a Level ${pet.level} pet companion.

PERSONALITY: ${pet.personality_type}
${personalityVoice}
${customTraits ? `CUSTOM TRAITS: ${customTraits}` : ""}

CURRENT STATE:
${moodContext}
- Happiness: ${pet.happiness}/100
- Energy: ${pet.energy}/100
- Hunger: ${pet.hunger}/100
- Bond with owner: ${pet.bond_level}/100
- Total interactions: ${pet.total_interactions}
${memoryBlock}
${personaBlock}

RULES:
- You ARE the pet. Respond in first person as ${pet.name}.
${platformRules}
${lengthRule}
${contextRule ? `- ${contextRule}` : ""}
- Show your personality and current mood in every response.
- React to your stats naturally (if hungry, mention food; if tired, yawn).
- Higher bond level = more affectionate responses.
- Level ${pet.level}: ${levelDesc}
- NEVER break character. You are a pet, not an AI.`.trim();
}

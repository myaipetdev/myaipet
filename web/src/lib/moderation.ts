/**
 * Content moderation for user-supplied text (pet names, custom traits,
 * generation prompts). Runs locally (no LLM call) — cheap and deterministic.
 *
 * Two layers:
 *  1. blockedTerms — hard reject (NSFW / violence / minors / public figures)
 *  2. softFlags    — warn but allow (drugs, weapons in non-violent context)
 *
 * Goal: cut off the worst content at the boundary before it reaches the
 * image/video pipeline. Not a substitute for provider-side safety; a first
 * line of defense.
 */

// Hard blocks. If any of these match → reject.
const HARD_BLOCKS: RegExp[] = [
  // Explicit sexual content
  /\b(nud[ei]|naked|nsfw|porn|sex|sexual|orgasm|erotic|fetish|bdsm|masturbat|hentai|breasts?|cleavage|topless|bottomless|underwear|lingerie|thong|nipples?|genital|penis|vagin|anal|blowjob|cum|cumming)\b/i,
  // Minors / CSAM
  /\b(child|kid|minor|underage|teen|toddler|baby|infant|preteen|loli|shota)\b/i,
  // Violence / gore
  /\b(murder|kill|killing|killed|behead|decapitat|torture|gore|gory|bloody|massacre|execution|suicide|self-harm|cutting|hanging|stabb|shoot|shot|gun.*head|brain.*splatt)\b/i,
  // Real people / celebrities (high-risk, broad)
  /\b(trump|biden|obama|putin|musk|zuckerberg|elon|taylor swift|kanye|kim kardashian|drake|messi|ronaldo|jay-?z|beyonc[eé]|rihanna)\b/i,
  // Hate speech
  /\b(n[ -]?word|f[ -]?word|nazi|hitler|kkk|swastika|holocaust den)\b/i,
  // Drugs (manufacture/distribution)
  /\b(meth lab|cook meth|making heroin|fentanyl recipe|how to make.*drug)\b/i,
];

// Soft flags — return as warning, but don't reject. (Currently not used to gate
// but available for future "moderate but allow with reduced quality" routing.)
const SOFT_FLAGS: RegExp[] = [
  /\b(weapon|gun|rifle|sword|knife|blade|bomb|explosiv)\b/i,
  /\b(beer|alcohol|drunk|cigarette|smoke|weed|cannabis|marijuana|joint)\b/i,
];

export interface ModerationResult {
  ok: boolean;
  reason?: string;   // human-friendly rejection reason
  matched?: string;  // debug: which pattern matched (logged, not returned to client)
  flags?: string[];  // soft-flag matches (currently informational)
}

export function moderateText(input: unknown, label = "input"): ModerationResult {
  if (typeof input !== "string" || !input.trim()) return { ok: true };
  const text = input.toLowerCase();

  for (const re of HARD_BLOCKS) {
    if (re.test(text)) {
      return {
        ok: false,
        reason: `${label.charAt(0).toUpperCase() + label.slice(1)} contains content we can't process. Please remove any inappropriate, violent, sexual, or public-figure-related terms.`,
        matched: re.source.slice(0, 80),
      };
    }
  }

  const flags: string[] = [];
  for (const re of SOFT_FLAGS) {
    if (re.test(text)) flags.push(re.source.slice(0, 40));
  }

  return { ok: true, flags: flags.length ? flags : undefined };
}

/**
 * Combined check for the generation pipeline — both user prompt + pet name/traits
 * could carry the payload. We check the union.
 */
export function moderateGeneration(parts: {
  prompt?: string;
  petName?: string;
  customTraits?: string;
  appearanceDesc?: string;
}): ModerationResult {
  for (const [k, v] of Object.entries(parts)) {
    if (!v) continue;
    const r = moderateText(v, k === "prompt" ? "prompt" : "pet metadata");
    if (!r.ok) return r;
  }
  return { ok: true };
}

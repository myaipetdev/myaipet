/**
 * Thumbnail color formula — the pure, client-only brains behind ThumbnailStudio.
 *
 * Ported in concept from a Korean "thumbnail color formula" reference and adapted
 * to English + a pet-creator angle. The idea: a scannable thumbnail earns its click
 * by coloring a *tiny* set of words. This module classifies each word of a title into
 * one of three high-signal buckets and hands back a stable color + the operating rules.
 *
 *   NUMBER / metric   → YELLOW  #FFD84D   (a concrete "3" beats a vague "many")
 *   RISK / negative   → RED     #FF5A4D   (opens the loop: never / stop / mistake …)
 *   SOLUTION / benefit→ GREEN   #7BE06A   (promises the payoff: free / easy / how …)
 *                     or SKY    #5AB8FF   (same bucket, cooler on warm/red styles)
 *
 * Zero network, zero deps — this is math on a string. It is deliberately conservative:
 * it colors ONLY words it is confident about so the "emphasize 2–5 words" rule holds.
 */

export type TokenCategory = "number" | "risk" | "solution" | "plain";

/** Canonical accent colors. The artifact (a thumbnail) may be bold + saturated. */
export const THUMB_COLORS = {
  number: "#FFD84D",       // metrics / digits
  risk: "#FF5A4D",         // warnings / negatives
  solutionGreen: "#7BE06A",// benefits (default)
  solutionSky: "#5AB8FF",  // benefits (alt — reads better on red/warm styles)
} as const;

/** Human labels for the color-guide recipe + on-screen chips. */
export const CATEGORY_LABEL: Record<Exclude<TokenCategory, "plain">, string> = {
  number: "number / metric",
  risk: "risk / warning",
  solution: "solution / benefit",
};

// Risk / negative openers. Normalized to letters-only (apostrophes stripped), so
// "don't" → "dont". Kept tight on purpose — false pops are worse than misses.
const RISK_WORDS = new Set([
  "never", "stop", "stopped", "mistake", "mistakes", "warning", "warn", "warned",
  "fail", "failed", "failing", "fails", "failure",
  "dont", "doesnt", "wont", "cant", "shouldnt", "avoid", "avoiding",
  "worst", "worse", "wrong", "danger", "dangerous", "scam", "scams",
  "risky", "quit", "lose", "losing", "lost", "bad", "ugly", "broken",
  "dead", "die", "waste", "wasted", "regret", "hate",
]);

// Solution / benefit words. The promise half of the headline.
const SOLUTION_WORDS = new Set([
  "free", "easy", "easier", "secret", "secrets", "best", "how", "guide", "guides",
  "tip", "tips", "win", "wins", "winning", "new", "fast", "faster", "save", "saves",
  "saved", "saving", "simple", "quick", "quickest", "proven", "ultimate", "hack",
  "hacks", "boost", "grow", "growth", "top", "love", "cute", "cutest", "viral",
  "works", "working", "worked", "smart", "smarter", "pro", "gain", "gained",
]);

/**
 * Classify a single raw word (may carry punctuation / symbols).
 * Priority: NUMBER (any digit) → RISK → SOLUTION → PLAIN.
 */
export function classifyWord(raw: string): TokenCategory {
  if (!raw) return "plain";
  // Any digit anywhere → treat as a metric: 3, 100K, $500, 24/7, 10x, #1, 2026.
  if (/\d/.test(raw)) return "number";
  const clean = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return "plain";
  if (RISK_WORDS.has(clean)) return "risk";
  if (SOLUTION_WORDS.has(clean)) return "solution";
  return "plain";
}

/** Resolve a category to its concrete hex, honoring the chosen solution accent. */
export function colorFor(category: TokenCategory, solutionColor: string, base: string): string {
  switch (category) {
    case "number": return THUMB_COLORS.number;
    case "risk": return THUMB_COLORS.risk;
    case "solution": return solutionColor;
    default: return base;
  }
}

export interface AnalyzedWord {
  raw: string;            // word as it appears (keeps punctuation)
  category: TokenCategory;
  idx: number;            // global index across the whole title
  active: boolean;        // is this pop actually applied? (formula caps pops at MAX_POPS)
}

/** The formula caps emphasized words so the thumbnail stays scannable. */
export const MAX_POPS = 5;

export interface Analysis {
  /** Title split into paragraphs (hard \n breaks) → words, in reading order. */
  paragraphs: AnalyzedWord[][];
  /** Deduped, de-emphasized list of the pops actually applied — for the chip row. */
  chips: { word: string; category: Exclude<TokenCategory, "plain">; color: string }[];
  /** Count of words the formula is emphasizing (<= MAX_POPS). */
  activeCount: number;
  /** Count of words that *matched* a bucket (may exceed MAX_POPS). */
  detectedCount: number;
}

/**
 * Analyze a full title string. Splits on hard newlines into paragraphs, then on
 * whitespace into words, classifies each, and marks the first MAX_POPS matches as
 * "active" (the ones that get colored). Everything past the cap stays plain so the
 * "emphasize only 2–5 words" rule is enforced in the render, not just the copy.
 */
export function analyzeText(title: string, solutionColor: string, base: string): Analysis {
  const paragraphs: AnalyzedWord[][] = [];
  let idx = 0;
  let activeCount = 0;
  let detectedCount = 0;
  const chips: Analysis["chips"] = [];
  const seen = new Set<string>();

  for (const line of title.split(/\r?\n/)) {
    const words: AnalyzedWord[] = [];
    for (const raw of line.split(/\s+/)) {
      if (raw === "") continue;
      const category = classifyWord(raw);
      let active = false;
      if (category !== "plain") {
        detectedCount++;
        if (activeCount < MAX_POPS) {
          active = true;
          activeCount++;
          const key = raw.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            chips.push({ word: raw, category, color: colorFor(category, solutionColor, base) });
          }
        }
      }
      words.push({ raw, category, idx, active });
      idx++;
    }
    paragraphs.push(words);
  }

  return { paragraphs, chips, activeCount, detectedCount };
}

/** The operating rules — the actual "formula", stated as tips (no metric claims). */
export const OPERATING_TIPS: string[] = [
  "Pick ONE hero word. The eye should land somewhere in under a second.",
  "Cap it at 3 colors on screen. More reads as noise, not emphasis.",
  "Color only 2–5 words. If everything pops, nothing pops.",
  "Numbers earn yellow — a concrete \"3\" beats a vague \"a lot\".",
  "Risk words (never, stop, mistake) earn red — they open the curiosity loop.",
  "Solution words (free, easy, how) earn green — they promise the payoff.",
  "Big, bold, few words: on a phone your title renders thumbnail-small for real.",
  "Keep the pet on one side and the text on the other so they don't fight.",
];

export interface GuideInput {
  title: string;
  subtitle: string;
  presetLabel: string | null;
  styleLabel: string;
  position: string;
  aspect: string;
  aspectPx: string;        // e.g. "1280×720"
  darknessPct: number;
  hasPhoto: boolean;
  analysis: Analysis;
}

/**
 * Build the copy-paste color recipe. Only reflects the user's OWN words — it never
 * fabricates metrics or performance claims.
 */
export function buildColorGuide(input: GuideInput): string {
  const {
    title, subtitle, presetLabel, styleLabel, position, aspect, aspectPx,
    darknessPct, hasPhoto, analysis,
  } = input;

  const lines: string[] = [];
  lines.push("MY AI PET — Thumbnail color guide");
  lines.push("Made on your device · free · no credits · nothing uploaded");
  lines.push("");
  lines.push(`Source photo:  ${hasPhoto ? "your uploaded photo" : "none (solid background)"}`);
  lines.push(`Preset:        ${presetLabel ?? "Custom"}`);
  lines.push(`Style:         ${styleLabel}`);
  lines.push(`Aspect:        ${aspect} (${aspectPx})`);
  lines.push(`Text position: ${position}`);
  if (hasPhoto) lines.push(`Photo darkness overlay: ${darknessPct}%`);
  lines.push("");
  lines.push(`Title:    ${title.replace(/\r?\n/g, " / ") || "(empty)"}`);
  if (subtitle.trim()) lines.push(`Subtitle: ${subtitle}`);
  lines.push("");

  if (analysis.chips.length) {
    lines.push(`Color assignments (${analysis.activeCount} pop${analysis.activeCount === 1 ? "" : "s"}, ${MAX_POPS} max):`);
    for (const c of analysis.chips) {
      const label = CATEGORY_LABEL[c.category];
      lines.push(`  • "${c.word}"  →  ${c.color}  (${label})`);
    }
    if (analysis.detectedCount > analysis.activeCount) {
      lines.push(`  · ${analysis.detectedCount - analysis.activeCount} more matched but stay plain — the formula caps pops at ${MAX_POPS}.`);
    }
  } else {
    lines.push("Color assignments: none yet — add a number, a risk word, or a benefit word.");
  }

  lines.push("");
  lines.push("Operating tips:");
  for (const t of OPERATING_TIPS) lines.push(`  • ${t}`);

  return lines.join("\n");
}

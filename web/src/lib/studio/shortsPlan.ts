/**
 * Shorts Planner — deterministic client-side scene breakdown.
 *
 * Honest scope: this PLANS a short-form vertical video (a timecoded sequence of
 * scenes with captions + shot types + a BGM mood). It does NOT render or
 * assemble a final video. It is a pure, zero-cost heuristic — no LLM, no server.
 * The only paid step downstream is optionally handing one scene's visual
 * direction to the existing Studio Director (metered elsewhere).
 *
 * Given a rough script/idea + a length target + a vibe, it:
 *   1. splits the script into beats (sentence / line / clause split),
 *   2. budgets time across a HOOK (0–2s) → 2–4 BODY scenes → PAYOFF/CTA so the
 *      scene durations sum EXACTLY to the target length,
 *   3. assigns each scene a start–end timecode, a one-line visual direction, a
 *      punchy on-screen caption, and a suggested shot type,
 *   4. and, when the script is thin, synthesizes sensible beats from the vibe.
 *
 * Deterministic: the same inputs always produce the same plan.
 */

export type Vibe = "cozy" | "energetic" | "funny" | "cinematic";
export type LengthTarget = 15 | 30 | 60;
export type SceneRole = "hook" | "body" | "payoff";

export interface ShortsScene {
  id: string;
  role: SceneRole;
  /** 1-based position across the whole plan. */
  index: number;
  /** 1-based position within its role group (e.g. BODY 2). */
  roleIndex: number;
  startSec: number;
  endSec: number;
  /** One-line visual direction — the seed you'd hand a video model. */
  direction: string;
  /** Short, punchy on-screen caption. */
  caption: string;
  /** Suggested shot type. */
  shot: string;
}

export interface ShortsPlan {
  subject: string;
  scriptSummary: string;
  targetSec: LengthTarget;
  vibe: Vibe;
  scenes: ShortsScene[];
  bgmMood: string;
  totalSec: number;
}

export interface BuildShortsPlanInput {
  script: string;
  target: LengthTarget;
  vibe: Vibe;
  /** Optional subject/pet name to anchor the copy (falls back to a guess). */
  subject?: string;
}

// ── Time layout per target (seconds) ─────────────────────────────────────────
// hook is fixed to the 0–2s window; body scene count + payoff scale with length.
// bodyTotal = target − hook − payoff, then distributed across the body scenes so
// the durations sum EXACTLY to the target.
export const SHORTS_LAYOUT: Record<LengthTarget, { hook: number; bodyCount: number; payoff: number }> = {
  15: { hook: 2, bodyCount: 2, payoff: 3 },
  30: { hook: 2, bodyCount: 3, payoff: 5 },
  60: { hook: 2, bodyCount: 4, payoff: 8 },
};

// ── Vibe voice packs ─────────────────────────────────────────────────────────
interface VibePack {
  bgm: string;
  shots: string[];      // rotates across body scenes
  frames: string[];     // framing suffixes, rotates across body scenes
  hookShot: string;
  payoffShot: string;
  hookCaption: string;
  ctaCaption: string;
  hookDir: (subject: string, beat?: string) => string;
  payoffDir: (subject: string, beat?: string) => string;
  bodyIdeas: (subject: string) => string[];
}

const VIBES: Record<Vibe, VibePack> = {
  cozy: {
    bgm: "Warm lo-fi keys + soft vinyl crackle, ~72 BPM",
    shots: ["soft close-up", "slow push-in", "gentle pan", "static cozy wide", "over-the-shoulder"],
    frames: [
      "soft window light, shallow focus, cream palette",
      "warm blanket textures, gentle grain",
      "morning haze and rising steam",
      "low lamp glow, muted tones",
    ],
    hookShot: "slow push-in",
    payoffShot: "soft close-up",
    hookCaption: "start your day with this",
    ctaCaption: "follow for daily cozy",
    hookDir: (s, b) =>
      `Open on ${s} easing into soft morning light${b ? `, ${lc(b)}` : ""} — invite the viewer in`,
    payoffDir: (s, b) =>
      `Settle on ${s} calm and content${b ? `, ${lc(b)}` : ""}; hold a warm, satisfying end frame`,
    bodyIdeas: (s) => [
      `${s} stretches and pads across a sunlit floor`,
      `${s} curls up beside a warm mug`,
      `${s} watches rain on the window, blinking slowly`,
      `${s} settles into a blanket nest`,
    ],
  },
  energetic: {
    bgm: "Upbeat hyperpop drums, ~140 BPM — big drop on the hook",
    shots: ["quick whip-pan", "handheld follow", "low-angle hero", "snap zoom", "fast tracking shot"],
    frames: [
      "punchy saturated color, motion blur",
      "fast cuts, high energy",
      "dynamic low angle, bright pop",
      "kinetic handheld, daylight",
    ],
    hookShot: "snap zoom",
    payoffShot: "low-angle hero",
    hookCaption: "wait for it",
    ctaCaption: "save this + follow",
    hookDir: (s, b) =>
      `Slam in on ${s} mid-action${b ? `, ${lc(b)}` : ""} — grab attention in the first frame`,
    payoffDir: (s, b) =>
      `Big finish — ${s} nails it${b ? `, ${lc(b)}` : ""}; freeze on the peak beat`,
    bodyIdeas: (s) => [
      `${s} sprints across the frame, ears flying`,
      `${s} leaps for a toy in slow-then-fast motion`,
      `${s} spins and shakes off in a burst`,
      `${s} skids to a triumphant stop`,
    ],
  },
  funny: {
    bgm: "Bouncy pizzicato + a comedic sting on the punchline",
    shots: ["reaction close-up", "punch-in zoom", "deadpan static wide", "cutaway insert", "POV shot"],
    frames: [
      "deadpan framing, comedic timing",
      "exaggerated reaction, tight crop",
      "awkward pause beat",
      "sudden zoom on the face",
    ],
    hookShot: "deadpan static wide",
    payoffShot: "punch-in zoom",
    hookCaption: "he did NOT expect this",
    ctaCaption: "follow for more chaos",
    hookDir: (s, b) =>
      `Set up the bit — ${s} looking suspiciously innocent${b ? `, ${lc(b)}` : ""}; plant the setup fast`,
    payoffDir: (s, b) =>
      `Land the punchline${b ? ` — ${lc(b)}` : ""}; hard cut on ${s}'s reaction`,
    bodyIdeas: (s) => [
      `${s} eyes the forbidden snack, plotting`,
      `${s} makes the worst possible decision`,
      `${s} freezes, caught red-pawed`,
      `${s} does a slow, guilty side-eye`,
    ],
  },
  cinematic: {
    bgm: "Swelling strings + sub-bass, a cinematic build to the payoff",
    shots: ["slow dolly-in", "wide establishing", "shallow-focus close-up", "crane rise", "backlit silhouette"],
    frames: [
      "moody backlight, volumetric haze",
      "anamorphic wide, deep shadows",
      "shallow depth, rim light",
      "golden-hour silhouette",
    ],
    hookShot: "wide establishing",
    payoffShot: "slow dolly-in",
    hookCaption: "a small story",
    ctaCaption: "follow the story",
    hookDir: (s, b) =>
      `Establish the world — ${s} small in a wide frame${b ? `, ${lc(b)}` : ""}; slow, deliberate open`,
    payoffDir: (s, b) =>
      `Emotional payoff — push in on ${s}${b ? `, ${lc(b)}` : ""}; hold the final cinematic frame`,
    bodyIdeas: (s) => [
      `${s} pauses at a threshold, backlit`,
      `${s} moves through soft, drifting light`,
      `${s} turns toward the camera in slow motion`,
      `${s} looks out toward the horizon`,
    ],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const STOP_CAPS = new Set([
  "My", "The", "A", "An", "I", "He", "She", "It", "We", "They", "This", "That",
  "When", "Then", "After", "Before", "Here", "There", "So", "But", "And", "Our",
  "Watch", "Meet", "Today", "Every", "Get", "Let",
]);

/** Lowercase the first character (for embedding a beat mid-sentence). */
function lc(text: string): string {
  const t = clean(text);
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/** Uppercase the first character. */
function cap(text: string): string {
  const t = clean(text);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Collapse whitespace + strip wrapping quotes and trailing sentence punctuation. */
function clean(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.,;:!?…]+$/g, "")
    .trim();
}

/** A short, punchy caption from a longer beat: first few words, no trailing period. */
function punchy(text: string, maxChars = 30): string {
  const words = clean(text).split(" ").filter(Boolean);
  const out: string[] = [];
  let len = 0;
  for (const w of words) {
    const next = len === 0 ? w.length : len + 1 + w.length;
    if (out.length >= 1 && next > maxChars) break;
    out.push(w);
    len = next;
    if (out.length >= 6) break;
  }
  return out.join(" ");
}

/** Split a script into beats: sentences → lines → bullets → clauses. */
export function splitBeats(script: string): string[] {
  const raw = script
    .replace(/\r/g, "")
    .split(/(?<=[.!?。！？])\s+|\n+|\s*[•·▪‣]\s*|\s+[-–—]\s+/g)
    .map((s) => clean(s))
    .filter(Boolean);

  let beats = raw;
  // Thin input with a long run-on beat → split further on commas / conjunctions.
  if (beats.length < 3) {
    beats = beats.flatMap((b) =>
      b.length > 38
        ? b
            .split(/,\s*|\s+then\s+|\s+and then\s+|\s+&\s+/i)
            .map((x) => clean(x))
            .filter(Boolean)
        : [b]
    );
  }
  return beats;
}

/** Best-effort subject/pet name for anchoring the copy. */
export function deriveSubject(script: string, explicit?: string): string {
  const e = (explicit || "").trim();
  if (e) return e;

  const poss = script.match(/\b([A-Z][a-zA-Z]{1,20})'s\b/);
  if (poss) return poss[1];

  const caps = (script.match(/\b[A-Z][a-zA-Z]{1,20}\b/g) || []).filter((w) => !STOP_CAPS.has(w));
  if (caps.length) {
    const firstWord = script.trim().split(/\s+/)[0];
    return caps.find((w) => w !== firstWord) || caps[0];
  }
  return "your pet";
}

/** Distribute `total` seconds across `count` slots so they sum EXACTLY to total. */
function distribute(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    // Front-load the extra second(s) so early body scenes breathe slightly more.
    out.push(base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return out;
}

/** Collapse `ideas` down to exactly `count` beats (merging extras), or pad from vibe. */
function fitBodyIdeas(ideas: string[], count: number, pack: VibePack, subject: string): string[] {
  const synth = pack.bodyIdeas(subject);
  const filled = ideas.filter(Boolean);

  if (filled.length === 0) return synth.slice(0, count);

  if (filled.length === count) return filled;

  if (filled.length < count) {
    const out = filled.slice();
    let i = 0;
    while (out.length < count) {
      out.push(synth[i % synth.length]);
      i++;
    }
    return out;
  }

  // More beats than slots → merge into `count` roughly-even groups.
  const groups: string[] = [];
  const per = Math.ceil(filled.length / count);
  for (let i = 0; i < count; i++) {
    const chunk = filled.slice(i * per, (i + 1) * per);
    if (chunk.length) groups.push(chunk.map(clean).join(", "));
  }
  // Guard: if rounding produced fewer groups than count, pad from synth.
  let j = 0;
  while (groups.length < count) {
    groups.push(synth[j % synth.length]);
    j++;
  }
  return groups.slice(0, count);
}

/** mm:ss timecode (e.g. 0:02, 0:15, 1:00). */
export function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Core ─────────────────────────────────────────────────────────────────────

export function buildShortsPlan(input: BuildShortsPlanInput): ShortsPlan {
  const target = input.target;
  const vibe = input.vibe;
  const pack = VIBES[vibe];
  const layout = SHORTS_LAYOUT[target];

  const subject = deriveSubject(input.script, input.subject);
  const beats = splitBeats(input.script);

  const hookBeat = beats.length > 0 ? beats[0] : undefined;
  const payoffBeat = beats.length > 1 ? beats[beats.length - 1] : undefined;
  // Middle beats seed the body; if there aren't distinct middles, use all beats.
  const middle =
    beats.length > 2 ? beats.slice(1, -1) : beats.length === 2 ? [beats[0]] : beats.slice();
  const bodyIdeas = fitBodyIdeas(middle, layout.bodyCount, pack, subject);

  const bodyTotal = target - layout.hook - layout.payoff;
  const bodyDurations = distribute(bodyTotal, layout.bodyCount);

  const scenes: ShortsScene[] = [];
  let cursor = 0;
  let index = 0;

  // HOOK
  index++;
  scenes.push({
    id: "hook",
    role: "hook",
    index,
    roleIndex: 1,
    startSec: cursor,
    endSec: cursor + layout.hook,
    direction: pack.hookDir(subject, hookBeat),
    caption: hookBeat ? punchy(hookBeat) || pack.hookCaption : pack.hookCaption,
    shot: pack.hookShot,
  });
  cursor += layout.hook;

  // BODY
  for (let i = 0; i < layout.bodyCount; i++) {
    index++;
    const idea = bodyIdeas[i];
    const frame = pack.frames[i % pack.frames.length];
    scenes.push({
      id: `body-${i + 1}`,
      role: "body",
      index,
      roleIndex: i + 1,
      startSec: cursor,
      endSec: cursor + bodyDurations[i],
      direction: `${cap(idea)} — ${frame}`,
      caption: punchy(idea),
      shot: pack.shots[i % pack.shots.length],
    });
    cursor += bodyDurations[i];
  }

  // PAYOFF / CTA
  index++;
  scenes.push({
    id: "payoff",
    role: "payoff",
    index,
    roleIndex: 1,
    startSec: cursor,
    endSec: cursor + layout.payoff,
    direction: pack.payoffDir(subject, payoffBeat),
    caption: pack.ctaCaption,
    shot: pack.payoffShot,
  });
  cursor += layout.payoff;

  const summarySource = clean(input.script);
  const scriptSummary =
    summarySource.length > 0
      ? summarySource.length > 120
        ? summarySource.slice(0, 117).replace(/\s+\S*$/, "") + "…"
        : summarySource
      : `${cap(subject)} — a ${vibe} short`;

  return {
    subject,
    scriptSummary,
    targetSec: target,
    vibe,
    scenes,
    bgmMood: pack.bgm,
    totalSec: cursor,
  };
}

/** One-line seed for the Studio Director from a single scene. */
export function sceneToDirectorText(scene: ShortsScene, plan: ShortsPlan): string {
  return `${scene.direction}. ${scene.shot}, ${plan.vibe} mood. On-screen caption: "${scene.caption}".`;
}

const ROLE_LABEL: Record<SceneRole, string> = {
  hook: "HOOK",
  body: "BODY",
  payoff: "PAYOFF / CTA",
};

/** Full, copy-friendly production sheet. No fabricated metrics — a real plan only. */
export function planToText(plan: ShortsPlan): string {
  const lines: string[] = [];
  lines.push("MY AI PET · SHORTS PLAN");
  lines.push(`Length target: ${plan.targetSec}s   ·   Vibe: ${plan.vibe}`);
  lines.push(`Idea: ${plan.scriptSummary}`);
  lines.push("────────────────────────────────────────────");

  for (const s of plan.scenes) {
    const label = s.role === "body" ? `BODY ${s.roleIndex}` : ROLE_LABEL[s.role];
    const range = `${formatTimecode(s.startSec)}–${formatTimecode(s.endSec)}`;
    lines.push(`[${range}]  ${label} — ${s.shot}`);
    lines.push(`   Caption:  ${s.caption}`);
    lines.push(`   Visual:   ${s.direction}`);
    lines.push("");
  }

  lines.push(`BGM mood: ${plan.bgmMood}`);
  lines.push("—");
  lines.push(
    "Planned with MY AI PET Studio · Shorts Planner (a sequence plan — not a rendered video)."
  );
  return lines.join("\n");
}

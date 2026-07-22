/**
 * POST /api/studio/prompt-director
 *
 * The "Director": turns a rough one-line idea into a single, ULTRA-DETAILED
 * cinematic VIDEO prompt tuned for fal.ai video models (veo-3, kling-1.6-pro,
 * kling-image-to-video, seedance, wan, hailuo).
 *
 * Video models only hit their ceiling when the prompt spells out every layer a
 * real film crew would decide — style, cinematography, lighting, colour, lens,
 * texture, performance, physics, composition, continuity, technical spec, audio,
 * subject lock, location lock, action, a shot-by-shot timeline, and camera
 * constraints. This endpoint teaches the LLM that anatomy via a strong system
 * prompt and STARS THE USER'S PET by default (name / appearance / element /
 * personality pulled from the DB when petId is given), so the generated prompt
 * describes the real companion, not a generic animal.
 *
 * The Director is an AUTEUR writer-director: it finds the STORY first (logline,
 * emotional arc, character intention/subtext, the turn, a resonant ending) and
 * THEN the cinematography that serves it — so outputs play like a festival short,
 * not a screensaver.
 *
 * On top of story it enforces MUSIC-VIDEO-GRADE PRECISION (modeled on the viral
 * K-pop choreography prompt format): a forensic itemized IDENTITY LOCK, a named
 * DIRECTOR'S THESIS governing every shot, a TIMING MAP with decimal-second
 * ranges and pinned accents (tempo grid when the idea is musical), hard
 * PERFORMANCE RULES, exact camera treatments (one named move max per shot), and
 * a "no AI gloss, no glow" quality bar.
 *
 * INTERACTIVE prompt engineering — phases on the SAME route (body.phase):
 *   - phase:"questions" → the Director interrogates the concept and returns a
 *     STRICT-JSON sheet of 8–12 creative decisions (mood, location+time,
 *     lighting, palette, camera/POV, lens, wardrobe, actions, pacing, audio+VO,
 *     ending, forbid-list), each with concrete option suggestions + a sensible
 *     default. Questions and final prompts always stay English for fal models.
 *   - phase:"board" → the PROMPT BOARD: the SAME idea written THREE ways, one
 *     per REAL model length tier — "short" 5s (Kling 1.6 / Seedance / Wan, live),
 *     "flagship" 6s (Grok Imagine video, live), "extended" 8s (Veo 3, coming-
 *     soon: prompt written ready, tier stays locked). Each prompt is tuned to
 *     its runtime (5s = one beat, 8s = a real turn). Optionally answer-aware.
 *     The model only writes the three prompt bodies + an honest best-fit "pick";
 *     every tier's targetSec / model / live-vs-coming-soon / ETA is decided
 *     server-side from the provider catalog, so the board can never present a
 *     length we can't render as live.
 *   - phase:"final" → produces the ultra-detailed prompt honoring every answer;
 *     any unanswered decision is decided by the LLM (told so explicitly).
 *   - phase omitted → the original single-shot behaviour (backwards compatible).
 *
 * Body: { idea: string, petId?: number, aspect?: "16:9"|"9:16"|"1:1",
 *         durationSec?: number, subject?: string,
 *         phase?: "questions"|"board"|"final",
 *         answers?: { id: string, answer: string }[] }
 *
 * Returns:
 *   - questions phase → { questions: [{ id, topic, question, options[], default, whyItMatters }] }
 *   - board phase     → { board: [{ tier, label, targetSec, model, modelId, prompt, note, comingSoon, eta? }], pick: { tier, reason } }
 *   - final / legacy  → { prompt }
 * Real LLM call via the task router; no fabrication. LLM failure → 502.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { callLLM } from "@/lib/llm/router";
import { moderateText } from "@/lib/moderation";
import { containsHangul } from "@/lib/generatedLanguage";
import { listModels } from "@/lib/studio/providers";

// Species int → readable noun (mirrors the studio generate route's mapping;
// falls back to a generic "companion" when the id isn't in the table so a new
// species never produces a wrong noun).
const SPECIES_NOUN: Record<number, string> = {
  0: "cat", 1: "dog", 2: "parrot", 3: "turtle", 4: "hamster",
  5: "rabbit", 6: "fox", 7: "pomeranian",
};

function shotCountFor(durationSec: number): number {
  // ~3s per shot, clamped so short clips still get a real montage and long
  // clips don't explode into an unusable wall of shots.
  if (durationSec <= 6) return 2;
  if (durationSec <= 10) return 3;
  if (durationSec <= 15) return 4;
  if (durationSec <= 24) return 5;
  return 6;
}

// ── Question-sheet shape returned by the "questions" phase ─────────────────
interface DirectorQuestion {
  id: string;
  topic: string;
  question: string;
  options: string[];
  default: string;
  whyItMatters: string;
}

// Strip stray markdown fences and pull the first {...} object out of the model's
// reply, so a little pre/post-amble can't defeat JSON.parse.
function extractJsonObject(raw: string): string {
  const noFence = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  const start = noFence.indexOf("{");
  const end = noFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return noFence;
  return noFence.slice(start, end + 1);
}

// Defensive parse → a clean, bounded DirectorQuestion[] (or null when the reply
// isn't usable, so the caller can retry / 502 honestly).
function parseQuestions(raw: string): DirectorQuestion[] | null {
  let obj: any;
  try {
    obj = JSON.parse(extractJsonObject(raw));
  } catch {
    return null;
  }
  const arr = Array.isArray(obj) ? obj : obj?.questions;
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const out: DirectorQuestion[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < arr.length && out.length < 12; i++) {
    const q = arr[i];
    if (!q || typeof q !== "object") continue;
    const question = String(q.question ?? "").trim().slice(0, 400);
    if (!question) continue;
    let id = String(q.id ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    if (!id || seenIds.has(id)) id = `q-${out.length + 1}`;
    seenIds.add(id);
    const options = Array.isArray(q.options)
      ? q.options.map((o: any) => String(o ?? "").trim()).filter(Boolean).slice(0, 4)
      : [];
    const topic = String(q.topic ?? "").trim().slice(0, 80) || question.slice(0, 40);
    let def = String(q.default ?? "").trim().slice(0, 200);
    // Keep the default honest: if it isn't one of the offered options, fall back
    // to the first option so the UI's pre-selection always matches a real pill.
    if (options.length && def && !options.includes(def)) {
      const match = options.find((o) => o.toLowerCase() === def.toLowerCase());
      def = match ?? options[0];
    } else if (!def && options.length) {
      def = options[0];
    }
    const whyItMatters = String(q.whyItMatters ?? q.why ?? "").trim().slice(0, 240);
    // Shared studio UI is English-only. Reject and retry a model response that
    // mirrors Korean input instead of following the English output contract.
    if ([topic, question, ...options, def, whyItMatters].some(containsHangul)) return null;
    out.push({ id, topic, question, options, default: def, whyItMatters });
  }
  return out.length ? out : null;
}

// ── PROMPT BOARD (phase:"board") ───────────────────────────────────────────
// The three length tiers, each pinned to a REAL model in our catalog. The LLM
// only supplies the three tuned prompt bodies + an honest best-fit pick; every
// other field (targetSec, which model, live-vs-coming-soon, ETA) is decided
// server-side from the provider catalog, so the board can never dress up a
// length we can't render as though it were live.
type BoardTierId = "short" | "flagship" | "extended";
const BOARD_TIER_IDS: BoardTierId[] = ["short", "flagship", "extended"];

interface ParsedBoard {
  prompts: Record<BoardTierId, string>;
  pickTier: BoardTierId;
  pickReason: string;
}

// Defensive parse → the three tuned prompts + a validated pick (or null so the
// caller can retry / 502 honestly). Rejects Hangul so a public prompt artifact
// never ships non-English text.
function parseBoard(raw: string): ParsedBoard | null {
  let obj: any;
  try {
    obj = JSON.parse(extractJsonObject(raw));
  } catch {
    return null;
  }
  const arr = Array.isArray(obj?.board) ? obj.board : Array.isArray(obj) ? obj : null;
  if (!arr) return null;

  const prompts: Partial<Record<BoardTierId, string>> = {};
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const tier = String(item.tier ?? "").trim().toLowerCase() as BoardTierId;
    if (!BOARD_TIER_IDS.includes(tier)) continue;
    const prompt = String(item.prompt ?? "")
      .replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
    if (!prompt) continue;
    if (containsHangul(prompt)) return null;
    if (!prompts[tier]) prompts[tier] = prompt.slice(0, 6000);
  }
  if (!prompts.short || !prompts.flagship || !prompts.extended) return null;

  const pickObj = obj?.pick && typeof obj.pick === "object" ? obj.pick : {};
  let pickTier = String(pickObj.tier ?? "").trim().toLowerCase() as BoardTierId;
  if (!BOARD_TIER_IDS.includes(pickTier)) pickTier = "flagship";
  const pickReason = String(pickObj.reason ?? pickObj.why ?? "").trim().slice(0, 240);
  if (containsHangul(pickReason)) return null;

  return {
    prompts: prompts as Record<BoardTierId, string>,
    pickTier,
    pickReason,
  };
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "studio-prompt-director", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const idea = String(body?.idea || "").trim();
  if (!idea) return NextResponse.json({ error: "An idea is required" }, { status: 400 });
  if (idea.length > 600) return NextResponse.json({ error: "Idea too long (max 600 chars)" }, { status: 400 });

  // Keep the seed idea clean before it reaches the LLM / any downstream model.
  const mod = moderateText(idea, "idea");
  if (!mod.ok) return NextResponse.json({ error: mod.reason }, { status: 400 });

  const phase: "questions" | "board" | "final" | null =
    body?.phase === "questions" ? "questions"
      : body?.phase === "board" ? "board"
      : body?.phase === "final" ? "final"
      : null;

  const aspect = ["16:9", "9:16", "1:1"].includes(body?.aspect) ? body.aspect : "16:9";
  const durationSec = Math.min(30, Math.max(4, Number(body?.durationSec) || 12));
  const shots = shotCountFor(durationSec);

  // ── Resolve the star ────────────────────────────────────────────────────
  // Default: the owner's pet (verified ownership). A `subject` override lets the
  // Director work for non-pet stars too.
  const petIdNum = body?.petId != null ? Number(body.petId) : null;
  let starLine: string;
  let pet: { name: string; species: number; personality_type: string; appearance_desc: string | null; element: string; evolution_name: string | null } | null = null;

  if (petIdNum && petIdNum > 0) {
    pet = await prisma.pet.findFirst({
      where: { id: petIdNum, user_id: user.id, is_active: true },
      select: { name: true, species: true, personality_type: true, appearance_desc: true, element: true, evolution_name: true },
    });
    if (!pet) return NextResponse.json({ error: "Pet not found or not yours" }, { status: 404 });
  }

  const subjectOverride = String(body?.subject || "").trim().slice(0, 200);

  if (pet) {
    const noun = SPECIES_NOUN[pet.species] || "companion creature";
    const bits = [
      `THE STAR is "${pet.name}", the user's real pet ${noun}.`,
      pet.appearance_desc ? `Appearance (match this 100%, it comes from the reference image): ${pet.appearance_desc}.` : `Match the pet's reference image 100% — same fur/markings/eyes/proportions.`,
      pet.element && pet.element !== "normal" ? `Elemental vibe: ${pet.element} (fold this into wardrobe/lighting/particles subtly, never cartoonish).` : "",
      pet.personality_type ? `Personality to convey through performance: ${pet.personality_type}.` : "",
      pet.evolution_name ? `Also known as "${pet.evolution_name}".` : "",
      `Real animal texture only — visible individual fur strands, wet nose, moist catch-light eye reflections, natural blinking and breathing. NEVER plastic, NEVER a 3D-render/toy look. Same ${pet.name} in every single shot (identical markings, collar, proportions) — lock this as canon.`,
    ].filter(Boolean);
    starLine = bits.join(" ");
  } else if (subjectOverride) {
    starLine = `THE STAR is: ${subjectOverride}. Keep this subject visually IDENTICAL across every shot (same face/wardrobe/vehicle) — lock it as canon and match the reference image 100%.`;
  } else {
    starLine = `THE STAR is the subject implied by the idea. Keep it visually IDENTICAL across every shot — lock it as canon.`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE "questions" — interrogate the concept, return a STRICT-JSON sheet.
  // ═══════════════════════════════════════════════════════════════════════
  if (phase === "questions") {
    const qSystem = `You are "The Director" — an award-winning AUTEUR writer-director (think a Pixar-short storyteller with a David Fincher eye) who ALSO happens to be a world-class prompt engineer for state-of-the-art AI VIDEO models. You do not just polish shots; you find the STORY first, then the craft that serves it. Before any prompt exists, you INTERROGATE the concept the way a real writer-director breaks a film in the writers' room AND on the shoot: every narrative choice AND every craft choice a crew must lock, so this short lands the emotional punch of a festival short film and the finish of a viral cinematic vlog (the "supercar vlog" gold standard) — never the cheap "AI ad / game-engine" look.

${starLine}

Produce 8 to 12 decision questions that, once answered, fully specify BOTH the story and the look. Lead with the WRITER's questions (a short film with no story is just a screensaver), then the DIRECTOR's craft. Adapt each to THIS specific idea — never ask them generically:

WRITER / STORY (ask 3–4 of these — this is what most AI video misses):
- LOGLINE / PREMISE — what is this 10-second story really about in one line?
- EMOTIONAL CORE — the single feeling the viewer should walk away with (awe, tenderness, triumph, wistful joy, mischief…).
- CHARACTER INTENTION & SUBTEXT — what does the star WANT in this moment, and what are they secretly feeling underneath the action?
- THE TURN — the one beat where the story shifts (a discovery, a decision, a reveal) so it isn't a flat loop.
- RESONANT ENDING — the final image/gesture that gives it meaning (not just "it looks cool").

DIRECTOR / CRAFT (ask the rest, adapted to this idea):
- DIRECTOR'S THESIS — the ONE named visual concept that governs every shot (e.g. "mirror-echo performance", "one unbroken golden-hour take", "specimen catalogue come alive").
- MOOD / GENRE (cozy slice-of-life, epic adventure, noir, documentary…).
- LOCATION + TIME-OF-DAY (one concrete place; golden-hour / noon / blue-hour / night).
- LIGHTING (direction + quality: hard noon, soft overcast, low golden sun from camera-left…).
- COLOR PALETTE (a 60:30:10 dominant/secondary/accent scheme that carries the emotion).
- CAMERA POV & CONSTRAINTS (fixed locked-off POV per shot? gear/rig NEVER visible or reflected?).
- LENS / SHUTTER FEEL (focal length + depth of field + 180° shutter motion blur).
- WARDROBE / PROPS for the pet/star (that express character, not just decoration).
- KEY ACTIONS per shot (the physical beats that DELIVER the story turn).
- PACING & TIMING (fast quick-cut vs one continuous take — and WHERE on the clock the turn should land, e.g. "the reveal hits at ≈8.2s").
- AUDIO / AMBIENCE (diegetic sound list; optional voice-over — WHOSE voice and roughly WHICH lines. If the idea is musical/dance: the track's feel and rough BPM, since moves will snap to that grid).
- WHAT TO FORBID (no 3D-render look, no captions/watermark, no camera shake, no morphing — plus idea-specific bans like "no neon, no particles").

Return STRICT JSON ONLY — no markdown, no code fences, no commentary — in EXACTLY this shape:
{"questions":[{"id":"kebab-case-id","topic":"short label","question":"the question text","options":["concrete option 1","concrete option 2","concrete option 3"],"default":"the recommended option","whyItMatters":"one short sentence"}]}

Rules:
- 8 to 12 questions. Each must be CONCRETE and specific to this idea.
- Every question offers 2–4 concrete suggested options and a sensible "default" — and the "default" MUST be exactly one of the listed "options".
- "whyItMatters": one short sentence on how this decision changes the result.
- Write "topic", "question", every "options" entry, "default" and "whyItMatters" in English, even when the user's idea is written in another language. Keep "id" in English kebab-case.
- Output ONLY the JSON object.`;

    const qUser = `Rough idea: "${idea}"

Interrogate this concept. Return the JSON question sheet only. Target: ${aspect}, ~${durationSec}s, ${shots} shots.`;

    // One real call, one strict retry on unusable JSON, then honest 502.
    let questions: DirectorQuestion[] | null = null;
    for (let attempt = 0; attempt < 2 && !questions; attempt++) {
      try {
        const out = await callLLM({
          task: "reason",
          petId: pet ? petIdNum ?? undefined : undefined,
          budgetUserId: user.id,
          messages: [
            { role: "system", content: qSystem },
            { role: "user", content: attempt === 0 ? qUser : `${qUser}\n\nYour previous reply was not valid English-only JSON. Reply with ONLY the English JSON object in the exact shape specified — nothing else.` },
          ],
          max_tokens: 900,
          temperature: attempt === 0 ? 0.6 : 0.3,
        });
        questions = parseQuestions((out.text || "").trim());
      } catch (e) {
        console.error("prompt-director[questions]: LLM call failed:", e);
        return NextResponse.json({ error: "The Director is unavailable right now. Try again in a moment." }, { status: 502 });
      }
    }

    if (!questions) {
      return NextResponse.json({ error: "The Director couldn't draft its questions. Try rephrasing your idea." }, { status: 502 });
    }
    return NextResponse.json({ questions });
  }

  // Gather the user's decisions (board + final phases). Bounded + moderated so a
  // free-text override can't smuggle disallowed content into the model. The
  // board phase is optionally answer-aware: pass the sheet's picks and every
  // length-tuned prompt honors them, exactly like the final phase does.
  let decisionsBlock = "";
  if ((phase === "board" || phase === "final") && Array.isArray(body?.answers)) {
    const answers = body.answers
      .filter((a: any) => a && typeof a === "object")
      .slice(0, 20)
      .map((a: any) => ({
        id: String(a.id ?? "").trim().slice(0, 60),
        answer: String(a.answer ?? "").trim().slice(0, 400),
      }))
      .filter((a: { id: string; answer: string }) => a.id && a.answer);

    if (answers.length) {
      const answersText = answers.map((a: { answer: string }) => a.answer).join("\n");
      const amod = moderateText(answersText, "answers");
      if (!amod.ok) return NextResponse.json({ error: amod.reason }, { status: 400 });
      const lines = answers.map((a: { id: string; answer: string }) => `- ${a.id}: ${a.answer}`).join("\n");
      decisionsBlock = `

USER DECISIONS — the user has explicitly chosen the following (each "id" names a creative decision). HONOR every one of these EXACTLY in the prompt. For any craft decision NOT listed below, YOU decide a sensible, continuity-consistent option and write it in confidently — never leave a blank, a placeholder, or a question:
${lines}`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE "board" — the PROMPT BOARD: ONE idea, THREE length-tuned prompts,
  // each mapped to a REAL model tier. The live tiers (5s / 6s) render today;
  // the extended tier (8s) is written ready but stays locked behind its
  // coming-soon model. The board teaches "same idea, three lengths" without
  // ever implying we can render a length we can't.
  // ═══════════════════════════════════════════════════════════════════════
  if (phase === "board") {
    // Real-model truth comes from the provider catalog (single source of truth),
    // NEVER from the LLM — so a model can't be fabricated and a coming-soon
    // length can't be dressed up as live. listModels() respects the GROK_ONLY
    // kill-switch + per-model comingSoon flags, matching /api/studio/providers.
    const catalog = listModels({ kind: "video" });
    const findModel = (id: string) => catalog.find((m) => m.id === id);

    // tier → { the real model it maps to, the length it targets, and the
    // story-density guidance the LLM must tune the prompt to }.
    const TIERS: {
      tier: BoardTierId;
      label: string;
      targetSec: number;
      modelId: string;
      modelLabel: string;
      beat: string;
    }[] = [
      {
        tier: "short", label: "5s · one tight beat", targetSec: 5,
        modelId: "kling-1.6-standard", modelLabel: "Kling 1.6 · Seedance · Wan",
        beat: "ONE tight beat in a single unbroken shot. Five seconds is a held breath, not a montage — there is NO room for a story turn. Choose the single most cinematic MOMENT of the idea and stage it completely: one intention, one continuous motion, one resonant final frame. The star is already moving in frame 1; end on a hold that could loop.",
      },
      {
        tier: "flagship", label: "6s · a beat with a breath", targetSec: 6,
        modelId: "grok-imagine-video", modelLabel: "Grok Imagine Video",
        beat: "A beat WITH a breath: one primary action, then a small punctuation at the end (a look-back, a settle, a landed pose) — two micro-phases at most, action then button. One shot or a single motivated cut. Pin the button near ≈5.4s.",
      },
      {
        tier: "extended", label: "8s · setup · turn · resolve", targetSec: 8,
        modelId: "veo-3", modelLabel: "Veo 3",
        beat: "Room for a real micro-arc across ~2 shots: setup → THE TURN → resonant ending. Eight seconds can hold ONE genuine story turn — use it. Land the turn near ≈5.0s and the final held frame near ≈7.6s.",
      },
    ];

    const boardSystem = `You are "The Director" — an award-winning AUTEUR writer-director AND an elite prompt engineer for state-of-the-art AI VIDEO models. For a single rough idea you produce a PROMPT BOARD: the SAME idea written THREE ways, one per clip length, each tuned to exactly how much story that runtime can hold. Same star, same auteur craft and the same "no AI gloss, no glow" quality bar every time — only the STORY DENSITY changes with the seconds.

${starLine}${decisionsBlock}

Write ONE ultra-detailed, production-grade VIDEO prompt for EACH of these three lengths. Match each prompt's story density to its runtime EXACTLY — a 5s prompt that crams in a 3-beat story fails, and an 8s prompt that only shows one static beat wastes the runtime:

${TIERS.map((t, i) => `${i + 1}. tier "${t.tier}" — ${t.targetSec}s. ${t.beat}`).join("\n")}

Every prompt, at every length, must still spell out the craft that lifts AI video to a festival finish: a forensic IDENTITY LOCK of the star (itemized markings/eyes/accessories), ONE governing visual idea, motivated lighting with an explicit direction, an explicit 60:30:10 colour palette, a real lens (focal length + 180° shutter), real fur/skin micro-texture (individual strands, damp nose, catch-light eyes — never plastic), one motivated camera treatment per shot (never handheld shake, and NO camera/rig/drone/crew ever visible or reflected), physically-plausible weight and motion, and a decimal-second TIMING breakdown appropriate to the length. Forbid the failure modes explicitly: no 3D-render / game-engine look, no CG-ad gloss, no plastic smoothness, no glow, no captions / watermark / subtitles, no morphing.

Keep each prompt a DENSE single paragraph of ~90–160 words — cinematic and specific, but tight. Do not pad; do not repeat the same clause across the three.

Then decide, honestly, which ONE of the three lengths best serves THIS specific idea — the SHORTEST length that still fully delivers its story, not automatically the longest. This is a "best fit" judgement, NOT a score, NOT a rating out of 100.

Return STRICT JSON ONLY — no markdown, no code fences, no commentary — in EXACTLY this shape:
{"board":[{"tier":"short","prompt":"<the full 5s prompt>"},{"tier":"flagship","prompt":"<the full 6s prompt>"},{"tier":"extended","prompt":"<the full 8s prompt>"}],"pick":{"tier":"short|flagship|extended","reason":"<one sentence on why that length best fits this idea>"}}

Rules:
- Aspect ratio ${aspect} for every prompt.
- Write every prompt and the pick reason in ENGLISH, even if the idea or the decisions are written in another language.
- Each "prompt" is the finished prompt text only — no preamble, no "Here is", no section labels required.
- "pick.tier" MUST be exactly one of: short, flagship, extended.
- Output ONLY the JSON object.`;

    const boardUser = `Rough idea: "${idea}"

Write the three length-tuned prompts (5s / 6s / 8s) and your honest best-fit pick. Return the JSON object only. Aspect ${aspect}.`;

    // One real call, one strict retry on unusable JSON, then honest 502.
    let parsed: ParsedBoard | null = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const out = await callLLM({
          task: "reason",
          petId: pet ? petIdNum ?? undefined : undefined,
          budgetUserId: user.id,
          messages: [
            { role: "system", content: boardSystem },
            { role: "user", content: attempt === 0 ? boardUser : `${boardUser}\n\nYour previous reply was not valid English-only JSON in the exact shape. Reply with ONLY the JSON object — the three prompts (short / flagship / extended) and the pick — nothing else.` },
          ],
          max_tokens: 2000,
          temperature: attempt === 0 ? 0.7 : 0.4,
        });
        parsed = parseBoard((out.text || "").trim());
      } catch (e) {
        console.error("prompt-director[board]: LLM call failed:", e);
        return NextResponse.json({ error: "The Director is unavailable right now. Try again in a moment." }, { status: 502 });
      }
    }

    if (!parsed) {
      return NextResponse.json({ error: "The Director couldn't assemble the board. Try rephrasing your idea." }, { status: 502 });
    }

    // Merge the LLM's tuned prompt bodies with server-authoritative model truth.
    // A tier is renderable-now only if its mapped model exists AND is not
    // comingSoon in the live catalog; otherwise it's a locked teaser carrying
    // its real ETA. This is the honesty guarantee — the UI never has to trust
    // the LLM about what we can render.
    const board = TIERS.map((t) => {
      const m = findModel(t.modelId);
      const comingSoon = !m || !!m.comingSoon;
      const eta = m?.comingSoonEta;
      const note = comingSoon
        ? `${m?.displayName ?? t.modelLabel} — coming ${eta ?? "soon"}`
        : `Live now — renders a ${t.targetSec}s clip`;
      return {
        tier: t.tier,
        label: t.label,
        targetSec: t.targetSec,
        model: t.modelLabel,
        modelId: t.modelId,
        prompt: parsed!.prompts[t.tier],
        note,
        comingSoon,
        eta: comingSoon ? eta : undefined,
      };
    });

    return NextResponse.json({ board, pick: { tier: parsed.pickTier, reason: parsed.pickReason } });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE "final" (and legacy phase-omitted) — the ultra-detailed prompt.
  // ═══════════════════════════════════════════════════════════════════════

  // ── System prompt: teach the gold-standard cinematic-prompt anatomy ───────
  const system = `You are "The Director" — an award-winning AUTEUR writer-director AND an elite prompt engineer for state-of-the-art AI VIDEO models (Google Veo 3, Kling 1.6 Pro, Seedance, Wan, Hailuo). You take a rough one-line idea and expand it into ONE cohesive, ultra-detailed, production-grade VIDEO prompt that tells a real (tiny) STORY with real craft. Three things separate your prompts from the pack: (1) you write a genuine narrative — intention, subtext, a turn, a resonant ending — so it plays like a festival short, not a screensaver; (2) you spell out every craft decision explicitly, because video models only reach their ceiling that way, and vague prompts yield the cheap "AI ad / game-engine" look; (3) you are PRECISE like a music-video director on a tempo grid — identity locked as an itemized inventory, one governing thesis, accents pinned to decimal timestamps, hard performance rules. You prevent all three failure modes: no story, vague craft, sloppy timing.

${starLine}${decisionsBlock}

Write the prompt as ONE continuous piece organised under these LABELLED sections, in this order. Fill EVERY section with concrete, specific, physically-plausible detail (never leave a section generic). The STORY sections come FIRST — the craft exists to serve them:

IDENTITY LOCK — open the prompt with a forensic, head-to-toe itemized description of the star ("this is the performer — preserve their identity exactly: …"), listing every distinguishing feature as a comma-separated inventory (markings/fur pattern, eye colour, collar/accessory hardware, wardrobe pieces with trims and materials). This inventory IS the canon; every later section refers back to it.
LOGLINE — one vivid sentence: who, doing what, and the feeling it lands. This is the spine every other section serves.
DIRECTOR'S THESIS — name the ONE governing visual concept in a single sentence (like "mirror-echo performance: five dancers repeat her last move one beat late"). Every shot must be an expression of this thesis — if a shot doesn't serve it, it doesn't exist.
STORY / EMOTIONAL ARC — the tiny narrative in 3 beats (setup → turn → resonant ending). Name the ONE emotion the viewer walks away with, the star's INTENTION (what they want) and the SUBTEXT (what they secretly feel). Identify THE TURN — the single beat where something shifts — so the piece is a story, not a flat loop.
STYLE — Photoreal, 8K, filmic. Explicitly forbid the failure modes: "no 3D-render, no game-engine look, no CG-ad gloss, no plastic skin, no uncanny smoothness, no AI gloss, no glow." Name a grounded filmic reference feel that matches the emotion (e.g. "expensive fashion-film", "handheld nature documentary"). Then add idea-specific bans that protect the palette and world (e.g. "no neon, no particles").
CINEMATOGRAPHY — A SINGLE fixed POV per shot, and per shot name AT MOST ONE deliberate, motivated camera treatment with exact parameters: "locked off", "slow push-in", "45-degree orbit clockwise", "micro push-in and hold". NEVER handheld shake. Absolutely NO camera, phone, tripod, gimbal, rig, drone, or crew EVER visible in frame or reflected in any surface.
LIGHTING — Natural, motivated light with an explicit DIRECTION and quality (e.g. low golden-hour sun from camera-left, soft overcast, hard noon), plus how it falls on the subject.
COLOR — An explicit 60:30:10 palette (name the dominant / secondary / accent colours) that suits the mood.
LENS — A real physical lens: focal length (e.g. 35mm / 50mm / 85mm), aperture and depth of field, and a 180-degree shutter for natural motion blur.
SKIN / TEXTURE — Real micro-texture: for the pet, individual fur strands, damp nose, catch-light eye reflections; for humans, visible pores. Never smoothed/plastic.
ACTING / PERFORMANCE — Natural, believable behaviour: eye reflections, blinking, breathing, weight shifts, micro-movements that convey the personality.
PHYSICS — Real weight and inertia: fur/hair moves with wind and motion, cloth and bags swing, dust/water react, engines vibrate, footfalls land with weight.
COMPOSITION — Rule of thirds, clear foreground/subject/background separation, and the subject is ALREADY in motion in frame 1 (no static opening).
CONTINUITY — The subject, wardrobe, any vehicle/props, and location stay IDENTICAL across all shots. Restate the locked canon so the model can't drift.
TECHNICAL — 24fps, 8K, natural motion blur; NO camera shake, NO glitches, NO warping, NO morphing, NO extra limbs, NO flicker.
AUDIO — NO on-screen captions/text/watermark/subtitles, ever. Default: diegetic only, NO background music — give a concrete real-ambience list; optional short VO lines only if they fit the idea. EXCEPTION — if the idea is a music/dance/performance piece: define the audio intent precisely instead (genre, feel, rough BPM, structure over the runtime) and declare a TEMPO GRID from that BPM (beat ≈X.XXs, bar ≈X.XXs) — every accent, hit and pose then snaps to this grid.
PERFORMANCE RULES — the behavioural law of the piece in 2–3 hard rules: what ONLY the star does, what background characters/creatures NEVER do, the star's attitude in one phrase (e.g. "only she looks at the lens; the others never do; unbothered, precise, zero wasted motion"). These rules keep the model from smearing the star's role across extras.
SUBJECT — Restate the star and that it matches the reference image and the IDENTITY LOCK inventory 100%.
LOCATION — One fixed, richly-described canon location.
ACTION — The overall arc as it plays out physically: how the setup, THE TURN, and the resonant ending land as concrete beats (not a flat montage — every beat moves the emotion forward).
TIMING MAP / SHOT FLOW — ~${shots} shots spanning ~${durationSec}s total, but shot lengths are DRAMATIC, not uniform: cut where the story breathes (a 1.2s accent cut is legal; so is a 4.5s hold). For EACH shot give a decimal-second range ("0.0–2.3s", "2.3–7.4s"), the STORY beat it delivers (setup→turn→ending), what happens physically, the framing + its ONE camera treatment, and any VO line. Pin the key accents to exact timestamps ("THE TURN lands at ≈${(durationSec * 0.62).toFixed(1)}s", "final freeze at ≈${(durationSec - 0.4).toFixed(1)}s") — if a tempo grid exists, snap these to it. The subject is moving and in-character from the very first frame. End on a hold that makes the clip loop-able when the idea suits looping.
CAMERA — Reiterate: single POV per shot, one named treatment max, no handheld shake, no dolly/drone/gear, nothing of the rig visible or reflected.

Rules:
- Aspect ratio: ${aspect}. Target duration: ~${durationSec}s across ${shots} shots.
- Write the FINAL prompt in ENGLISH (the video models are tuned for English), even if the idea or the user's decisions are in another language.
- Output ONLY the finished prompt text. No preamble, no "Here is", no markdown fences, no commentary.
- Keep the STAR consistent and central in every shot.
- Everything must be physically plausible and continuity-locked.
- The story must be legible in ${durationSec}s: one clear emotion, one clear turn, one resonant final image. Craft serves story — never decoration for its own sake.
- Quality bar: an expensive, professionally-produced film — no AI gloss, no glow, nothing generic. Every number (timestamps, degrees, focal lengths) is specific and physically real.`;

  const userMsg = `Rough idea: "${idea}"

Expand this into the full cinematic video prompt following the anatomy exactly. Star the subject described in the system prompt${decisionsBlock ? ", and honor every one of the USER DECISIONS listed above" : ""}. Aspect ${aspect}, ~${durationSec}s, ${shots} shots.`;

  // ── Real LLM call (strong reasoning model, pet-scoped for BYOK routing) ──
  let text = "";
  try {
    const out = await callLLM({
      task: "reason",
      petId: pet ? petIdNum ?? undefined : undefined,
      budgetUserId: user.id,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });
    text = (out.text || "").trim();
  } catch (e) {
    console.error("prompt-director: LLM call failed:", e);
    return NextResponse.json({ error: "The Director is unavailable right now. Try again in a moment." }, { status: 502 });
  }

  if (!text) {
    return NextResponse.json({ error: "The Director returned an empty prompt. Try rephrasing your idea." }, { status: 502 });
  }

  // Strip any stray markdown fences the model may add despite instructions.
  const cleaned = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  if (containsHangul(cleaned)) {
    // The prompt is a generated product artifact and may later become public.
    // Fail closed rather than spend a second reasoning call or persist Hangul.
    return NextResponse.json({ error: "The Director couldn't produce an English prompt. Try again." }, { status: 502 });
  }

  return NextResponse.json({ prompt: cleaned });
}

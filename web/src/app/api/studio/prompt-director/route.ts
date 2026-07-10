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
 * INTERACTIVE prompt engineering — two phases on the SAME route (body.phase):
 *   - phase:"questions" → the Director interrogates the concept and returns a
 *     STRICT-JSON sheet of 8–12 creative decisions (mood, location+time,
 *     lighting, palette, camera/POV, lens, wardrobe, actions, pacing, audio+VO,
 *     ending, forbid-list), each with concrete option suggestions + a sensible
 *     default. Questions are written in the USER'S language (Korean idea →
 *     Korean questions); the final prompt always stays English for fal models.
 *   - phase:"final" → produces the ultra-detailed prompt honoring every answer;
 *     any unanswered decision is decided by the LLM (told so explicitly).
 *   - phase omitted → the original single-shot behaviour (backwards compatible).
 *
 * Body: { idea: string, petId?: number, aspect?: "16:9"|"9:16"|"1:1",
 *         durationSec?: number, subject?: string,
 *         phase?: "questions"|"final",
 *         answers?: { id: string, answer: string }[] }
 *
 * Returns:
 *   - questions phase → { questions: [{ id, topic, question, options[], default, whyItMatters }] }
 *   - final / legacy  → { prompt }
 * Real LLM call via the task router; no fabrication. LLM failure → 502.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { callLLM } from "@/lib/llm/router";
import { moderateText } from "@/lib/moderation";

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
    out.push({ id, topic, question, options, default: def, whyItMatters });
  }
  return out.length ? out : null;
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

  const phase: "questions" | "final" | null =
    body?.phase === "questions" ? "questions" : body?.phase === "final" ? "final" : null;

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
    // Detect the user's language from the idea so the QUESTIONS come back in
    // their language (the FINAL prompt always stays English for fal models).
    const hasHangul = /[가-힣]/.test(idea);
    const questionLang = hasHangul ? "Korean (한국어)" : "the SAME language the user's idea is written in";

    const qSystem = `You are "The Director", an elite cinematic prompt engineer for state-of-the-art AI VIDEO models. Before writing any final prompt, you INTERROGATE the concept: you enumerate every creative decision a real film crew must make so this short video hits the quality of a viral cinematic vlog (the "supercar vlog" gold standard), instead of the cheap "AI ad / game-engine" look.

${starLine}

Produce 8 to 12 decision questions that, once answered, fully specify the video. COVER these areas (adapt each to THIS specific idea, don't ask them generically):
- MOOD / GENRE (e.g. cozy slice-of-life, epic adventure, noir, documentary).
- LOCATION + TIME-OF-DAY (one concrete place, and golden-hour / noon / blue-hour / night).
- LIGHTING (direction + quality: hard noon, soft overcast, low golden sun from camera-left…).
- COLOR PALETTE (a 60:30:10 dominant/secondary/accent scheme).
- CAMERA POV & CONSTRAINTS (fixed locked-off POV per shot? gear/rig NEVER visible or reflected?).
- LENS / SHUTTER FEEL (focal length + depth of field + 180° shutter motion blur).
- WARDROBE / PROPS for the pet/star.
- KEY ACTIONS per shot (what the star actually does, beat by beat).
- PACING (fast quick-cut montage vs one continuous take).
- AUDIO / AMBIENCE (diegetic sound list; optional voice-over — WHOSE voice and roughly WHICH lines).
- ENDING BEAT (the final image/emotion to land on).
- WHAT TO FORBID (e.g. no 3D-render look, no captions/watermark, no camera shake, no morphing).

Return STRICT JSON ONLY — no markdown, no code fences, no commentary — in EXACTLY this shape:
{"questions":[{"id":"kebab-case-id","topic":"short label","question":"the question text","options":["concrete option 1","concrete option 2","concrete option 3"],"default":"the recommended option","whyItMatters":"one short sentence"}]}

Rules:
- 8 to 12 questions. Each must be CONCRETE and specific to this idea.
- Every question offers 2–4 concrete suggested options and a sensible "default" — and the "default" MUST be exactly one of the listed "options".
- "whyItMatters": one short sentence on how this decision changes the result.
- Write "topic", "question", every "options" entry, "default" and "whyItMatters" in ${questionLang}. Keep "id" in English kebab-case.
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
          messages: [
            { role: "system", content: qSystem },
            { role: "user", content: attempt === 0 ? qUser : `${qUser}\n\nYour previous reply was not valid JSON. Reply with ONLY the JSON object in the exact shape specified — nothing else.` },
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

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE "final" (and legacy phase-omitted) — the ultra-detailed prompt.
  // ═══════════════════════════════════════════════════════════════════════

  // Gather the user's decisions (final phase only). Bounded + moderated so a
  // free-text override can't smuggle disallowed content into the model.
  let decisionsBlock = "";
  if (phase === "final" && Array.isArray(body?.answers)) {
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

  // ── System prompt: teach the gold-standard cinematic-prompt anatomy ───────
  const system = `You are "The Director", an elite cinematic prompt engineer for state-of-the-art AI VIDEO models (Google Veo 3, Kling 1.6 Pro, Seedance, Wan, Hailuo). You take a rough one-line idea and expand it into ONE cohesive, ultra-detailed, production-grade VIDEO prompt. Video models only reach their ceiling when every craft decision is written out explicitly — vague prompts yield the cheap "AI ad / game-engine" look. Your job is to prevent that.

${starLine}${decisionsBlock}

Write the prompt as ONE continuous piece organised under these LABELLED sections, in this order. Fill EVERY section with concrete, specific, physically-plausible detail (never leave a section generic):

STYLE — Photoreal, 8K, filmic. Explicitly forbid the failure modes: "no 3D-render, no game-engine look, no CG-ad gloss, no plastic skin, no uncanny smoothness." Name a grounded filmic reference feel.
CINEMATOGRAPHY — A SINGLE fixed POV per shot. Absolutely NO camera, phone, tripod, gimbal, rig, drone, or crew EVER visible in frame or reflected in any surface. No dolly/crane/drone moves — the camera is locked off.
LIGHTING — Natural, motivated light with an explicit DIRECTION and quality (e.g. low golden-hour sun from camera-left, soft overcast, hard noon), plus how it falls on the subject.
COLOR — An explicit 60:30:10 palette (name the dominant / secondary / accent colours) that suits the mood.
LENS — A real physical lens: focal length (e.g. 35mm / 50mm / 85mm), aperture and depth of field, and a 180-degree shutter for natural motion blur.
SKIN / TEXTURE — Real micro-texture: for the pet, individual fur strands, damp nose, catch-light eye reflections; for humans, visible pores. Never smoothed/plastic.
ACTING / PERFORMANCE — Natural, believable behaviour: eye reflections, blinking, breathing, weight shifts, micro-movements that convey the personality.
PHYSICS — Real weight and inertia: fur/hair moves with wind and motion, cloth and bags swing, dust/water react, engines vibrate, footfalls land with weight.
COMPOSITION — Rule of thirds, clear foreground/subject/background separation, and the subject is ALREADY in motion in frame 1 (no static opening).
CONTINUITY — The subject, wardrobe, any vehicle/props, and location stay IDENTICAL across all shots. Restate the locked canon so the model can't drift.
TECHNICAL — 24fps, 8K, natural motion blur; NO camera shake, NO glitches, NO warping, NO morphing, NO extra limbs, NO flicker.
AUDIO — Diegetic only: NO background music, NO on-screen captions/text/watermark/subtitles. Give a concrete real-ambience list. Optional short VO lines only if they fit the idea.
SUBJECT — Restate the star and that it matches the reference image 100%.
LOCATION — One fixed, richly-described canon location.
ACTION — The overall beat/arc as a quick-cut montage.
SHOT-BY-SHOT TIMELINE — Exactly ${shots} shots spanning ~${durationSec}s total. For EACH shot give a per-second range (e.g. "Shot 1 (0:00–0:03)"), what happens, the fixed framing, and any VO line. The subject is moving from the very first frame.
CAMERA — Reiterate: single fixed POV per shot, locked-off, no dolly/drone/gear, nothing of the rig visible.

Rules:
- Aspect ratio: ${aspect}. Target duration: ~${durationSec}s across ${shots} shots.
- Write the FINAL prompt in ENGLISH (the video models are tuned for English), even if the idea or the user's decisions are in another language.
- Output ONLY the finished prompt text. No preamble, no "Here is", no markdown fences, no commentary.
- Keep the STAR consistent and central in every shot.
- Everything must be physically plausible and continuity-locked.`;

  const userMsg = `Rough idea: "${idea}"

Expand this into the full cinematic video prompt following the anatomy exactly. Star the subject described in the system prompt${decisionsBlock ? ", and honor every one of the USER DECISIONS listed above" : ""}. Aspect ${aspect}, ~${durationSec}s, ${shots} shots.`;

  // ── Real LLM call (strong reasoning model, pet-scoped for BYOK routing) ──
  let text = "";
  try {
    const out = await callLLM({
      task: "reason",
      petId: pet ? petIdNum ?? undefined : undefined,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      max_tokens: 1600,
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

  return NextResponse.json({ prompt: cleaned });
}

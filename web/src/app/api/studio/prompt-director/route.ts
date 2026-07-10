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
 * Body: { idea: string, petId?: number, aspect?: "16:9"|"9:16"|"1:1",
 *         durationSec?: number, subject?: string }
 *   - idea       (required) the rough one-line concept
 *   - petId      (optional) owner's pet → fetched + made the star (ownership checked)
 *   - aspect     (optional) framing hint (default 16:9)
 *   - durationSec(optional) target length → scales the shot count (default 12)
 *   - subject    (optional) override the star for non-pet subjects
 *
 * Returns { prompt } — one cohesive prompt, editable client-side. Real LLM call
 * via the task router; no fabrication. LLM failure → 502.
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

  // ── System prompt: teach the gold-standard cinematic-prompt anatomy ───────
  const system = `You are "The Director", an elite cinematic prompt engineer for state-of-the-art AI VIDEO models (Google Veo 3, Kling 1.6 Pro, Seedance, Wan, Hailuo). You take a rough one-line idea and expand it into ONE cohesive, ultra-detailed, production-grade VIDEO prompt. Video models only reach their ceiling when every craft decision is written out explicitly — vague prompts yield the cheap "AI ad / game-engine" look. Your job is to prevent that.

${starLine}

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
- Output ONLY the finished prompt text. No preamble, no "Here is", no markdown fences, no commentary.
- Keep the STAR consistent and central in every shot.
- Everything must be physically plausible and continuity-locked.`;

  const userMsg = `Rough idea: "${idea}"

Expand this into the full cinematic video prompt following the anatomy exactly. Star the subject described in the system prompt. Aspect ${aspect}, ~${durationSec}s, ${shots} shots.`;

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
      max_tokens: 1400,
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

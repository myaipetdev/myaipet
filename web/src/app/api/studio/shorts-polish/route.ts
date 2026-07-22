/**
 * POST /api/studio/shorts-polish
 *
 * The optional AI layer on top of the (free, instant, client-side) Shorts
 * Planner: it rewrites each scene's ON-SCREEN CAPTION into a punchy, scroll-
 * stopping line — the timing, shot types and structure the deterministic
 * planner produced are NOT touched. This is the "polish" pass; the base plan
 * stays free and works with no network.
 *
 * Same contract class as the Director (prompt-director): signed-in, English-
 * only, metered through the LLM budget guard (task:"chat" → the cheap mini
 * tier), no credit charge in beta. Strict-JSON out, one retry, honest failures.
 *
 * Body: { scenes: {id, role, caption, direction}[], vibe?, subject?, petId? }
 * Returns: { captions: { id, caption }[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { callLLM } from "@/lib/llm/router";
import { isLLMBudgetError } from "@/lib/llm/router";
import { moderateText } from "@/lib/moderation";
import { containsHangul } from "@/lib/generatedLanguage";

interface InScene { id: string; role: string; caption: string; direction: string }

function extractJsonObject(raw: string): string {
  const noFence = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  const start = noFence.indexOf("{");
  const end = noFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return noFence;
  return noFence.slice(start, end + 1);
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "shorts-polish", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to use AI caption polish." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const rawScenes: unknown = body?.scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0 || rawScenes.length > 8) {
    return NextResponse.json({ error: "Provide 1–8 scenes to polish." }, { status: 400 });
  }

  const scenes: InScene[] = rawScenes
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .slice(0, 8)
    .map((s) => ({
      id: String(s.id ?? "").trim().slice(0, 40),
      role: String(s.role ?? "").trim().slice(0, 12),
      caption: String(s.caption ?? "").trim().slice(0, 120),
      direction: String(s.direction ?? "").trim().slice(0, 300),
    }))
    .filter((s) => s.id && s.direction);

  if (!scenes.length) return NextResponse.json({ error: "No usable scenes." }, { status: 400 });

  const vibe = String(body?.vibe ?? "energetic").trim().slice(0, 20);
  const subject = String(body?.subject ?? "").trim().slice(0, 60);
  const petId = body?.petId != null ? Number(body.petId) : undefined;

  // Moderate the free-text the model will see.
  const mod = moderateText(scenes.map((s) => `${s.caption} ${s.direction}`).join("\n"), "shorts");
  if (!mod.ok) return NextResponse.json({ error: mod.reason }, { status: 400 });

  const system = `You are a short-form video caption writer. You get the scenes of a vertical shorts plan (each has a visual DIRECTION and a rough CAPTION). Rewrite ONLY the on-screen caption for each scene so it stops the scroll: punchy, concrete, at most 6 words, no hashtags, no emoji, sentence-case or ALL-CAPS for a hook. Match the "${vibe}" vibe.${subject ? ` The subject is "${subject}".` : ""} Keep the meaning tied to that scene's direction — never invent facts, metrics, or view counts. English only.

Return STRICT JSON ONLY, no markdown, exactly: {"captions":[{"id":"<scene id>","caption":"<rewritten caption>"}]} — one entry per input scene, same ids.`;

  const userMsg = `Scenes:\n${scenes.map((s) => `- id:${s.id} role:${s.role} direction:"${s.direction}" current:"${s.caption}"`).join("\n")}\n\nReturn the JSON with one polished caption per scene.`;

  let parsed: { id: string; caption: string }[] | null = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    let text = "";
    try {
      const out = await callLLM({
        task: "chat",
        petId: petId && petId > 0 ? petId : undefined,
        budgetUserId: user.id,
        messages: [
          { role: "system", content: system },
          { role: "user", content: attempt === 0 ? userMsg : `${userMsg}\n\nYour previous reply was not valid English-only JSON. Reply with ONLY the JSON object.` },
        ],
        max_tokens: 500,
        temperature: attempt === 0 ? 0.7 : 0.4,
      });
      text = (out.text || "").trim();
    } catch (e) {
      if (isLLMBudgetError(e)) {
        return NextResponse.json({ error: "AI polish is busy right now — try again shortly." }, { status: 429 });
      }
      console.error("shorts-polish: LLM call failed:", e);
      return NextResponse.json({ error: "AI polish is unavailable right now. Try again in a moment." }, { status: 502 });
    }

    try {
      const obj = JSON.parse(extractJsonObject(text));
      const arr = Array.isArray(obj?.captions) ? obj.captions : null;
      if (!arr) continue;
      const byId = new Map(scenes.map((s) => [s.id, true]));
      const clean: { id: string; caption: string }[] = [];
      for (const c of arr) {
        const id = String(c?.id ?? "").trim();
        let cap = String(c?.caption ?? "").trim().slice(0, 80);
        if (!byId.has(id) || !cap) continue;
        if (containsHangul(cap)) { clean.length = 0; break; } // reject Korean, retry
        // Keep it short: hard cap to ~8 words.
        cap = cap.split(/\s+/).slice(0, 8).join(" ");
        clean.push({ id, caption: cap });
      }
      if (clean.length) parsed = clean;
    } catch { /* retry */ }
  }

  if (!parsed) {
    return NextResponse.json({ error: "AI polish couldn't rewrite the captions. The free plan is still perfect to use." }, { status: 502 });
  }

  return NextResponse.json({ captions: parsed });
}

#!/usr/bin/env node
/**
 * CHORUS (best-of-N) benchmark — does PetClaw's best-of-N selection actually
 * produce better in-character replies than a single-shot call?
 *
 * This measures the REAL production A/B (see web/src/app/api/pets/[petId]/chat):
 *   • baseline (CHORUS off): ONE grok-3-mini call at temperature 0.9
 *   • CHORUS on:             TWO grok-3-mini calls (temp 0.75 & 1.0), the best
 *                            picked by the heuristic scorer (pickBest)
 * An INDEPENDENT judge (grok-3 — a different, larger model than the grok-3-mini
 * generator) blind-compares the two replies in BOTH orders (position-controlled,
 * since LLM judges have a strong primacy bias) and we require a NET preference.
 * We report CHORUS win / tie / loss and the win-rate.
 *
 * HONESTY / LIMITATIONS (read before quoting any number):
 *   1. Single vendor. Generator and judge are both xAI Grok (grok-3-mini vs
 *      grok-3). A judge from the same family can share blind spots — this is a
 *      directional signal, not a vendor-neutral benchmark like OpenRouter Fusion
 *      (which uses cross-vendor panels + a separate judge model).
 *   2. Simplified persona prompt — no per-pet memory/bond context, so this
 *      isolates the *sampling* effect of CHORUS, not the full harness (VIGIL).
 *   3. Non-deterministic, no seed. Re-runs vary; report sample size + run count.
 *   4. CHORUS's own heuristic does the picking, but the JUDGE is independent of
 *      that heuristic — so a CHORUS win is NOT tautological.
 *
 * Usage:  GROK_API_KEY=... node web/scripts/chorus-bench.mjs [--n=24] [--json=out.json]
 *
 * The scorer below MUST stay in sync with
 *   web/src/lib/petclaw/memory/best-of-n.ts
 */

const API = "https://api.x.ai/v1/chat/completions";
const GEN_MODEL = "grok-3-mini";   // production generator
const JUDGE_MODEL = "grok-3";      // independent (larger) judge
const KEY = process.env.GROK_API_KEY;
if (!KEY) { console.error("GROK_API_KEY not set — aborting."); process.exit(1); }

const argN = Number((process.argv.find(a => a.startsWith("--n=")) || "").split("=")[1]);
const argJson = (process.argv.find(a => a.startsWith("--json=")) || "").split("=")[1];

// ── scorer: faithful copy of best-of-n.ts (keep in sync) ──
const PERSONALITY_KEYWORDS = {
  friendly: ["love", "warm", "💕", "great", "best"],
  playful: ["hehe", "lol", "fun", "play", "🎾"],
  shy: ["…", "👉👈", "…hi", "*blush*"],
  brave: ["fearless", "strong", "courage"],
  lazy: ["yawn", "nap", "sleep", "😴", "later"],
  curious: ["?", "what", "why", "how", "tell me"],
  mischievous: ["hehe", "sneak", "tease"],
  gentle: ["calm", "peace", "soft", "gentle"],
  adventurous: ["explore", "travel", "where"],
  dramatic: ["!", "oh", "*gasps*"],
  wise: ["perhaps", "remember", "old"],
  sassy: ["hmph", "fabulous", "obviously"],
};
function scoreReply(candidate, ctx) {
  const reasons = []; let score = 1;
  const text = candidate.text.trim();
  if (!text) return { ...candidate, score: 0, reasons: ["empty"] };
  const keywords = PERSONALITY_KEYWORDS[ctx.personalityType] || [];
  const lower = text.toLowerCase();
  const hits = keywords.filter(k => lower.includes(k.toLowerCase())).length;
  if (hits > 0) { score += hits * 0.3; reasons.push(`character:${hits}`); }
  const overshoot = Math.max(0, text.length - ctx.targetMaxChars);
  if (overshoot > 0) { const p = Math.min(2, overshoot / 50); score -= p; reasons.push(`overlong:-${p.toFixed(2)}`); }
  else if (text.length < 10) { score -= 0.5; reasons.push("too_short"); }
  const userTokens = new Set(ctx.userMessage.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  for (const p of ctx.learnedPatterns) {
    const hit = (p.examples || []).some(ex => {
      const exTokens = new Set(ex.toLowerCase().split(/\s+/));
      return [...userTokens].filter(t => exTokens.has(t)).length >= 2;
    });
    if (hit && p.successRate > 0.5) { score += 0.4; reasons.push(`pattern:${p.topic}`); break; }
  }
  const userLower = ctx.userMessage.toLowerCase();
  if (lower.includes(userLower) && userLower.length > 20) { score -= 1; reasons.push("echo"); }
  return { ...candidate, score, reasons };
}
function pickBest(candidates, ctx) {
  return candidates.map(c => scoreReply(c, ctx)).sort((a, b) => b.score - a.score)[0];
}

// ── test set: (personality, message) pairs across all 12 personality types ──
const PERSONAS = Object.keys(PERSONALITY_KEYWORDS);
const PROMPTS = [
  "hey, i had a rough day at work today",
  "what should we do this weekend?",
  "i'm thinking about you, what are you up to?",
  "tell me something interesting",
  "i'm so happy right now!!",
  "do you ever get lonely?",
  "i can't sleep",
  "guess what happened today",
];
function buildTestSet(n) {
  const set = [];
  let i = 0;
  while (set.length < n) {
    const personality = PERSONAS[i % PERSONAS.length];
    const message = PROMPTS[Math.floor(i / PERSONAS.length) % PROMPTS.length];
    set.push({ personality, message });
    i++;
  }
  return set;
}

function systemPrompt(personality) {
  return `You are a small AI companion pet named Mochi with a ${personality} personality. ` +
    `Reply to your owner IN CHARACTER, in 1-2 short sentences, warm and natural. ` +
    `Never break character or mention being an AI.`;
}

async function callGrok(model, messages, temperature, max_tokens) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, messages, temperature, max_tokens }),
  });
  if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return (j.choices?.[0]?.message?.content || "").trim();
}

async function genReplies(personality, message) {
  const messages = [
    { role: "system", content: systemPrompt(personality) },
    { role: "user", content: message },
  ];
  // baseline (CHORUS off): single call @ 0.9
  const baseline = await callGrok(GEN_MODEL, messages, 0.9, 150);
  // CHORUS on: 2 candidates @ 0.75 / 1.0, heuristic picks best
  const [t75, t100] = await Promise.all([
    callGrok(GEN_MODEL, messages, 0.75, 150),
    callGrok(GEN_MODEL, messages, 1.0, 150),
  ]);
  const candidates = [{ text: t75, temperature: 0.75 }, { text: t100, temperature: 1.0 }].filter(c => c.text);
  const chorus = pickBest(candidates, { userMessage: message, personalityType: personality, targetMaxChars: 200, learnedPatterns: [] }).text;
  return { baseline, chorus };
}

async function judge(personality, message, replyA, replyB) {
  const sys = `You are a strict, fair evaluator of AI pet-companion replies. ` +
    `Judge ONLY which reply is more in-character, natural, and engaging for a "${personality}" pet. ` +
    `Answer with EXACTLY one token: "1", "2", or "tie". No explanation.`;
  const usr = `User said: "${message}"\n\nReply 1: "${replyA}"\n\nReply 2: "${replyB}"\n\nWhich is better? (1 / 2 / tie)`;
  const out = (await callGrok(JUDGE_MODEL, [{ role: "system", content: sys }, { role: "user", content: usr }], 0, 4)).toLowerCase();
  if (out.includes("tie")) return "tie";
  if (out.includes("1")) return "1";
  if (out.includes("2")) return "2";
  return "tie";
}

// Position-controlled verdict: judge the SAME pair in BOTH orders and net them.
// LLM judges have a strong primacy bias (favoring "Reply 1"); judging both ways
// and requiring a net preference cancels it. Returns {outcome, r1wins} where
// r1wins counts how many of the 2 judgments picked whichever reply was shown 1st
// (a position-bias diagnostic).
async function judgeControlled(personality, message, baseline, chorus) {
  const [vA, vB] = await Promise.all([
    judge(personality, message, chorus, baseline),   // chorus = Reply 1
    judge(personality, message, baseline, chorus),   // chorus = Reply 2
  ]);
  // map each judgment to who won
  const aWinner = vA === "1" ? "chorus" : vA === "2" ? "baseline" : "tie";
  const bWinner = vB === "2" ? "chorus" : vB === "1" ? "baseline" : "tie";
  let score = 0;
  if (aWinner === "chorus") score++; else if (aWinner === "baseline") score--;
  if (bWinner === "chorus") score++; else if (bWinner === "baseline") score--;
  const outcome = score > 0 ? "chorus" : score < 0 ? "baseline" : "tie";
  // position diagnostic: did the FIRST-shown reply win each judgment?
  const r1wins = (vA === "1" ? 1 : 0) + (vB === "1" ? 1 : 0);
  return { outcome, r1wins };
}

async function main() {
  const N = Number.isInteger(argN) && argN > 0 ? argN : 24;
  const testSet = buildTestSet(N);
  console.log(`CHORUS benchmark — ${N} prompts · gen=${GEN_MODEL} · judge=${JUDGE_MODEL}\n`);

  let win = 0, loss = 0, tie = 0, identical = 0, errors = 0, r1total = 0;
  const rows = [];
  for (let i = 0; i < testSet.length; i++) {
    const { personality, message } = testSet[i];
    try {
      const { baseline, chorus } = await genReplies(personality, message);
      if (!baseline || !chorus) { errors++; continue; }
      if (baseline.trim() === chorus.trim()) identical++;
      const { outcome, r1wins } = await judgeControlled(personality, message, baseline, chorus);
      r1total += r1wins;
      if (outcome === "chorus") win++; else if (outcome === "baseline") loss++; else tie++;
      rows.push({ i, personality, message, baseline, chorus, outcome });
      process.stdout.write(`  [${i + 1}/${N}] ${personality.padEnd(12)} → ${outcome}\n`);
    } catch (e) {
      errors++;
      process.stdout.write(`  [${i + 1}/${N}] ${personality.padEnd(12)} → ERROR ${e.message}\n`);
    }
  }

  const scored = win + loss + tie;
  const winRate = scored ? (100 * win / scored) : 0;
  const decisive = win + loss;
  const decisiveWinRate = decisive ? (100 * win / decisive) : 0;
  const r1rate = scored ? (100 * r1total / (2 * scored)) : 0; // 50% = no primacy bias
  console.log("\n── RESULT (position-controlled: each pair judged both orders) ──");
  console.log(`  scored:        ${scored}  (errors: ${errors})`);
  console.log(`  CHORUS wins:   ${win}`);
  console.log(`  baseline wins: ${loss}`);
  console.log(`  ties (split):  ${tie}`);
  console.log(`  CHORUS win-rate (incl. ties): ${winRate.toFixed(1)}%`);
  console.log(`  CHORUS win-rate (decisive):   ${decisiveWinRate.toFixed(1)}%`);
  console.log(`  identical replies: ${identical}/${scored}`);
  console.log(`  primacy bias (Reply-1 win-rate across all judgments): ${r1rate.toFixed(1)}%  [50% = none; now cancelled by both-orders design]`);
  console.log("───────────────────────────────────────────");
  console.log("  ⚠ single-vendor judge (xAI); simplified persona; non-deterministic.");
  console.log("    Position bias is now controlled. Still quote WITH sample size + caveats.\n");

  if (argJson) {
    const fs = await import("node:fs");
    fs.writeFileSync(argJson, JSON.stringify({
      meta: { n: N, gen: GEN_MODEL, judge: JUDGE_MODEL, scored, errors, identical, positionControlled: true, primacyReply1Rate: r1rate },
      result: { win, loss, tie, winRate, decisiveWinRate },
      rows,
    }, null, 2));
    console.log(`  wrote ${argJson}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

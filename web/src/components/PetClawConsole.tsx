"use client";

/**
 * PetClawConsole — a terminal that surfaces PetClaw's bounded memory/agent
 * capabilities AND lets you actually talk to your pet through it (the
 * petclaw_chat tool, live). Dark terminal panel on the app's light pages.
 *
 * Inventory is the REAL thing (kept honest):
 *   • 19-connector registry (3 live · messaging launch-paused)  • 18 SDK skills
 *   • 6 MCP tool definitions in published 1.6.1; reviewed 1.6.2 candidate has 7
 *   • bounded VIGIL memory capabilities  • discovery-only network preview
 *
 * variant="full"    → manifest + LIVE terminal (boot effect + chat). Needs petId.
 * variant="compact" → banner + channels only, static (onboarding intro).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import PetClawHeroIntro from "@/components/PetClawHeroIntro";
import { RELEASE_STATUS } from "@/lib/releaseStatus";
import {
  createAgentRunId,
  forgetPendingAgentRun,
  latestPendingAgentRun,
  recheckAgentRunReceiptOnNotFound,
  rememberPendingAgentRun,
} from "@/lib/petclaw/agent-run-client";

// Terminal typewriter — reveals a line char-by-char once on mount; a blinking
// caret trails until done. prefers-reduced-motion shows it instantly (no shift).
function useTypewriter(text: string, speed = 26, startDelay = 260) {
  const [out, setOut] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOut(text); setDone(true); return;
    }
    let i = 0; let t: ReturnType<typeof setTimeout>;
    const start = setTimeout(function tick() {
      i += 1; setOut(text.slice(0, i));
      if (i < text.length) t = setTimeout(tick, speed); else setDone(true);
    }, startDelay);
    return () => { clearTimeout(start); clearTimeout(t); };
  }, [text, speed, startDelay]);
  return { out, done };
}

// Masthead tagline, typed out with a blinking block caret (terminal feel).
function TaglineTyper({ text, color }: { text: string; color: string }) {
  const { out } = useTypewriter(text);
  return (
    <div style={{ textAlign: "center", color, fontSize: 14.5, marginBottom: 18, minHeight: "1.5em", fontFamily: "var(--ed-m), ui-monospace, monospace" }}>
      <style>{`@keyframes pcBlink{0%,49%{opacity:1}50%,100%{opacity:0}}`}</style>
      {out}
      <span aria-hidden style={{ display: "inline-block", width: "0.55ch", height: "1em", verticalAlign: "-0.12em", marginLeft: 2, background: color, animation: "pcBlink 1.05s steps(1) infinite" }} />
    </div>
  );
}

interface PetLite {
  name?: string;
  level?: number;
  personality_type?: string;
  element?: string;
  avatar_url?: string | null;
}

interface Props {
  pet?: PetLite | null;
  petId?: number;
  /** true = no real owned pet (logged-out / no pet); terminal runs in simulated mode. */
  demo?: boolean;
  variant?: "full" | "compact";
}

// ── Collectible Editorial — warm-dark terminal palette (foil gold on warm ink) ──
const GOLD = "#E8C77E";        // warm foil gold (was #fbbf24)
const GOLD2 = "#D98E3C";       // warm amber accent (was #f59e0b)
const AMBER_DIM = "#B5894A";   // dim warm key
const TXT = "#ECE0CE";         // warm cream
const MUTED = "rgba(251,246,236,0.65)"; // warm muted — kept ≥.65 alpha for legibility on #1E1710
const GREEN = "#9FC59A";       // warm sage (live)
const LINE = "rgba(231,197,124,0.20)"; // warm gold hairline
const MONO = "var(--ed-m)";    // Space Mono
const AGENT_COST = 5;

// Status strings source from lib/releaseStatus.ts (single source of truth —
// landing + docs must match it). Re-exported here so existing consumers
// (SovereigntyDashboard SDK card) keep importing SDK_VERSION from this file.
export const SDK_VERSION = RELEASE_STATUS.sdkVersion;

// Supported surfaces + the connector registry (three currently live).
// Messaging channel delivery is launch-paused (matches the Agent screen);
// MCP clients require the unpublished, reviewed SDK 1.6.2 candidate.
const RUNS_ON = `web · approved chrome sites · MCP (${RELEASE_STATUS.mcp})`;
const CONNECTORS = [
  { k: "messaging (0/8 live)", v: "telegram · discord · x launch-paused; whatsapp · slack · line · instagram · gmail planned" },
  { k: "productivity (0/3 live)", v: "notion · google-calendar · github planned" },
  { k: "media (0/2 live)", v: "spotify · youtube planned" },
  { k: "knowledge (3/4 live)", v: "web-search · wikipedia · memory live; brave planned" },
  { k: "crypto (0/2 live)", v: "coingecko · bscscan planned" },
];
const MCP_TOOLS = [
  { k: "petclaw_chat", v: "owner chat + normalized session metadata" },
  { k: "petclaw_agent_run", v: "PAID 5 credits · requires confirmCostCredits=5" },
  { k: "petclaw_persona_mirror", v: "owner-context style draft" },
  { k: "petclaw_memory_recall", v: "inspect + select retained context" },
  { k: "petclaw_summarize_page", v: "summarize explicitly approved page text" },
  { k: "petclaw_soul_export", v: "supported SOUL fields + SHA-256 checksum" },
  { k: "petclaw_discover_pets", v: "read-only public discovery" },
];
const SKILLS = [
  { k: "emotional", v: "companion-chat · daily-mood · daydream · pet-thought · pet-diary · vibe-check" },
  { k: "social", v: "persona-mirror · pet-date" },
  { k: "creative", v: "image-gen · video-gen" },
  { k: "knowledge", v: "memory-recall · memory-consolidate · summarize-page" },
  { k: "utility", v: "soul-export · soul-import · consent · evolve · memory-anchor" },
];
// VIGIL is the product name for bounded memory/learning capabilities. Stages
// are conditional: feedback needs a later turn and CHORUS is opt-in.
const HARNESS = [
  { k: "memory-ledger", v: "selected facts → capped, owner-editable memory" },
  { k: "session-log", v: "normalized continuity across approved surfaces" },
  { k: "feedback", v: "best-effort signal from the next owner turn" },
  { k: "self-learn", v: "recurring-topic patterns · not executable code" },
  { k: "chorus", v: "optional best-of-N response selection" },
];
// Public discovery is live; remote invocation remains fail-closed.
const PACK = [
  { k: "discover", v: "find pets by element / skill" },
  { k: "invoke", v: "disabled · dedicated consent + caller funding required" },
];
const SOVEREIGNTY: { k: string; v: React.ReactNode }[] = [
  { k: "export", v: "portable memory + persona archive, JSON + SHA-256 integrity hash" },
  { k: "consent", v: "public / sharing / AI-training / interact" },
  { k: "delete", v: "active-systems wipe · SHA-256 receipt · backups expire ≤90d" },
  { k: "on-chain", v: <>SOUL anchor + inheritance <span style={{ color: MUTED }}>○ planned · not live</span></> },
];

function Row({ k, v, kw = 132 }: { k: string; v: React.ReactNode; kw?: number }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 15, lineHeight: 1.85 }}>
      <span style={{ color: AMBER_DIM, minWidth: kw, flexShrink: 0 }}>{k}</span>
      <span style={{ color: TXT }}>{v}</span>
    </div>
  );
}
function SectionHead({ children }: { children: React.ReactNode }) {
  return <div style={{ color: GOLD2, fontWeight: 700, fontSize: 15, margin: "16px 0 7px" }}>{children}</div>;
}
const liveTag = <span style={{ color: GREEN }}>● live</span>;

interface Line { role: "sys" | "you" | "pet"; text: string }

const BOOT: Line[] = [
  { role: "sys", text: `initializing petclaw console · protocol v1 · SDK ${SDK_VERSION}` },
  { role: "sys", text: `connectors ▸ ${RELEASE_STATUS.connectors.registry} registry / ${RELEASE_STATUS.connectors.live} live · messaging ${RELEASE_STATUS.channels}   mcp ▸ ${RELEASE_STATUS.mcpTools} broken published definitions / ${RELEASE_STATUS.mcpCandidateTools} reviewed candidate tools   skills ▸ ${RELEASE_STATUS.skills} manifests   memory ▸ bounded + owner-controlled` },
  { role: "sys", text: "soul ▸ portable · consent ▸ enforced · on-chain ▸ planned / not live" },
];

const DEMO_REPLIES = [
  "hehe hi! i'm a *demo* of how your pet sounds — adopt one and selected facts and session memories can shape later replies.",
  "*wags* adopt me and give me a name — then we can build a shared history on web and approved Chrome sites.",
  "ooh you typed something! once you adopt, relevant retained memory can shape my replies (the petclaw_chat tool). want to try?",
];

export default function PetClawConsole({ pet, petId, demo = false, variant = "full" }: Props) {
  const compact = variant === "compact";
  const interactive = !compact && (!!petId || demo);
  const isSim = demo || !petId;
  const petName = pet?.name || "Your pet";

  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const simIdx = useRef(0);
  const simHinted = useRef(false);

  const pushLine = useCallback((l: Line) => setLines((prev) => [...prev, l]), []);
  const appendToLast = useCallback((ch: string) => {
    setLines((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      if (last) next[next.length - 1] = { ...last, text: last.text + ch };
      return next;
    });
  }, []);

  // Type a pet reply char-by-char for the "alive" effect.
  const typeReply = useCallback((full: string) => {
    pushLine({ role: "pet", text: "" });
    let i = 0;
    const step = () => {
      if (i >= full.length) return;
      const chunk = full.slice(i, i + 2);
      appendToLast(chunk);
      i += 2;
      const t = setTimeout(step, 16);
      timers.current.push(t);
    };
    step();
  }, [appendToLast, pushLine]);

  // Boot sequence on mount (interactive only) — reveal lines one at a time.
  useEffect(() => {
    if (!interactive) return;
    BOOT.forEach((l, idx) => {
      const t = setTimeout(() => {
        pushLine(l);
        if (idx === BOOT.length - 1) {
          const ready = isSim
            ? `petclaw_chat ready — demo of ${petName}; adopt a pet to chat live (or /help)`
            : `petclaw_chat ready — say hi to ${petName} (or /help)`;
          const t2 = setTimeout(() => pushLine({ role: "sys", text: ready }), 280);
          timers.current.push(t2);
        }
      }, 260 * (idx + 1));
      timers.current.push(t);
    });
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  const reconcileAgentReceipt = async () => {
    const pending = latestPendingAgentRun();
    if (!pending) { pushLine({ role: "sys", text: "no paid run is awaiting reconciliation" }); return; }
    try {
      const receipt = await recheckAgentRunReceiptOnNotFound(
        () => api.pets.agentRunStatus(pending.petId, pending.runId),
      );
      if (receipt.state !== "terminal" || !receipt.billing) {
        pushLine({ role: "sys", text: `run ${pending.runId} is still ${receipt.state} — do not start another paid run` });
        return;
      }
      forgetPendingAgentRun(pending.runId);
      pushLine({ role: "sys", text: `reconciled ${pending.runId} ▸ ${receipt.billing.outcome} · ${receipt.billing.creditsCharged || 0} credits · ${receipt.creditsRemaining ?? "?"} left` });
    } catch (e: any) {
      if (e?.status === 404) {
        forgetPendingAgentRun(pending.runId);
        pushLine({ role: "sys", text: `no durable receipt found for ${pending.runId} after two checks — local marker cleared; the server per-pet guard prevents an overlapping paid run; check Account credits before retrying` });
        return;
      }
      pushLine({ role: "sys", text: `receipt lookup failed — ${e?.message || "try again shortly"}; paid-run lock remains` });
    }
  };

  // /goal --confirm-5 — explicit authorization for one paid, bounded run.
  const runGoal = async (goalText: string) => {
    const g = goalText.trim();
    if (!g) { pushLine({ role: "sys", text: "usage: /goal --confirm-5 <task> · authorizes one 5-credit run" }); return; }
    if (isSim || !petId) { pushLine({ role: "sys", text: "agent loop needs your own pet — adopt one to unlock it" }); return; }
    try {
      if (latestPendingAgentRun()) {
        pushLine({ role: "sys", text: "paid-run safety lock — reconcile the previous run in /account or with /goal-status before another run" });
        return;
      }
    } catch { /* continue when storage is unavailable; the server still enforces confirmation */ }
    const runId = createAgentRunId();
    try { rememberPendingAgentRun({ runId, petId, petName, goal: g, surface: "console", at: Date.now() }); } catch { /* storage unavailable */ }
    pushLine({ role: "sys", text: `agent ▸ planning · "${g}"` });
    setBusy(true);
    try {
      const r = await api.pets.runAgent(petId as number, runId, g, AGENT_COST);
      const billing = r?.billing;
      if (
        !billing
        || (billing.outcome !== "charged" && billing.outcome !== "refunded")
        || typeof billing.creditsCharged !== "number"
        || !(billing.usageKnown === false ? billing.modelCalls == null : typeof billing.modelCalls === "number")
        || r?.runId !== runId
      ) {
        pushLine({ role: "sys", text: `settlement receipt missing for ${runId} — do not retry. Check /account or use /goal-status` });
        return;
      }
      try { forgetPendingAgentRun(runId); } catch { /* storage unavailable */ }
      (r?.steps || []).forEach((s: any) =>
        pushLine({ role: "sys", text: `  ${s.skill === "finish" ? "✓ done" : "→ " + s.skill}${s.thought ? " · " + s.thought : ""}` })
      );
      pushLine({
        role: "sys",
        text: `settled ▸ ${r?.completed === true ? "completed" : r?.stoppedReason || "stopped"} · ${billing.outcome === "charged" ? `${billing.creditsCharged} credits charged` : "credits refunded"} · ${billing.usageKnown === false ? "usage unknown (recovered)" : `${billing.modelCalls} model attempt${billing.modelCalls === 1 ? "" : "s"}`}${typeof r?.creditsRemaining === "number" ? ` · ${r.creditsRemaining} left` : ""}`,
      });
      typeReply(r?.answer || `*${petName} blinks*`);
    } catch (e: any) {
      const message = e?.message || "the connection ended";
      if (/not enough credits/i.test(message)) {
        try { forgetPendingAgentRun(runId); } catch { /* storage unavailable */ }
        pushLine({ role: "sys", text: `agent rejected before starting — ${message}` });
      } else {
        pushLine({ role: "sys", text: `agent connection error — ${message}. Run ${runId} may have reached the server; use /goal-status before any new paid run` });
      }
    } finally {
      setBusy(false);
    }
  };

  const runCommand = (cmd: string): boolean => {
    const c = cmd.trim().toLowerCase();
    if (c === "/goal-status" || c === "/goal-unlock") { reconcileAgentReceipt(); return true; }
    if (c.startsWith("/goal")) {
      const confirmed = cmd.trim().match(/^\/goal\s+--confirm-5\s+([\s\S]+)$/i);
      if (!confirmed) {
        pushLine({ role: "sys", text: "paid command — use /goal --confirm-5 <task> to authorize exactly one 5-credit run" });
        return true;
      }
      runGoal(confirmed[1]);
      return true;
    }
    if (c === "/help") {
      pushLine({ role: "sys", text: "commands: /goal --confirm-5 <task> (paid)  /goal-status (reconcile receipt)  /channels  /tools  /skills  /vigil  /pack  /clear  — or type to chat" });
      return true;
    }
    if (c === "/channels" || c === "/connectors") { pushLine({ role: "sys", text: "connectors: " + CONNECTORS.map((x) => x.k).join(" · ") }); return true; }
    if (c === "/tools") { pushLine({ role: "sys", text: "mcp tools: " + MCP_TOOLS.map((x) => x.k).join(" · ") }); return true; }
    if (c === "/skills") { pushLine({ role: "sys", text: "skills: " + SKILLS.map((x) => x.v).join(", ") }); return true; }
    if (c === "/vigil" || c === "/harness") { pushLine({ role: "sys", text: "VIGIL (capability-dependent): " + HARNESS.map((x) => x.k).join(" · ") }); return true; }
    if (c === "/pack") { pushLine({ role: "sys", text: "Network launch scope: public discovery only · remote invoke disabled" }); return true; }
    if (c === "/clear") { setLines([]); return true; }
    return false;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (text.startsWith("/")) {
      pushLine({ role: "you", text });
      if (!runCommand(text)) pushLine({ role: "sys", text: `unknown command: ${text} — try /help` });
      return;
    }
    pushLine({ role: "you", text });
    if (isSim) {
      if (!simHinted.current) {
        simHinted.current = true;
        pushLine({ role: "sys", text: "demo mode — adopt a pet to chat live" });
      }
      const reply = DEMO_REPLIES[simIdx.current % DEMO_REPLIES.length];
      simIdx.current += 1;
      typeReply(reply);
      return;
    }
    setBusy(true);
    try {
      const res = await api.pets.chat(petId as number, text);
      typeReply(res?.reply || `*${petName} blinks softly*`);
    } catch (e: any) {
      pushLine({ role: "sys", text: `chat error — ${e?.message || "try again in a moment"}` });
    } finally {
      setBusy(false);
    }
  };

  const lineColor = (r: Line["role"]) => (r === "you" ? GOLD : r === "pet" ? TXT : MUTED);
  const linePrefix = (r: Line["role"]) => (r === "you" ? "you ❯ " : r === "pet" ? `${petName.toLowerCase()} ◆ ` : "· ");

  return (
    <div style={{ fontFamily: MONO, color: TXT }}>
      <div style={{
        borderRadius: 18, overflow: "hidden", border: "1px solid rgba(236,224,206,0.07)",
        boxShadow: "0 28px 64px -28px rgba(40,28,12,0.6)", background: "#1E1710",
      }}>
        {/* chrome */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "11px 16px",
          background: "#241B12", borderBottom: "1px solid rgba(236,224,206,0.06)",
        }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840" }} />
          <span style={{ marginLeft: 10, color: "#C2B49A", fontSize: 13.5 }}>
            petclaw connect{pet?.name ? ` · ${pet.name.toLowerCase()}` : ""}
          </span>
        </div>

        <div style={{
          padding: compact ? "22px 26px 14px" : "26px 30px 16px",
          background: "radial-gradient(900px 360px at 50% -20%, #2C2114 0%, #1A140D 60%)",
        }}>
          {/* Full variant: the cinematic intro — the pet's sticker flips into a
              laptop that boots petclaw-mcp, then capability chips fly out.
              (Compact keeps the simple portrait masthead below.) */}
          {!compact && (
            <PetClawHeroIntro petName={petName} avatarUrl={pet?.avatar_url} level={pet?.level} demo={isSim} />
          )}
          {/* The face of PetClaw is the user's OWN pet (mascot fallback in
              demo) — a tilted paper-mat portrait with the gold level seal. */}
          {compact && (
          <>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: compact ? 8 : 12 }}>
            <div style={{ position: "relative", width: compact ? 76 : 96, transform: "rotate(-3deg)", background: "#FBF6EC", borderRadius: 9, padding: 5, boxShadow: "0 18px 30px -14px rgba(0,0,0,.65)" }}>
              <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 6, overflow: "hidden", boxShadow: "inset 0 0 0 1.5px rgba(184,130,44,.55)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pet?.avatar_url || "/mascot.jpg"} alt={petName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <div className="ed-gloss" aria-hidden style={{ left: 0, opacity: 0.5 }} />
              </div>
              {typeof pet?.level === "number" && (
                <span aria-hidden style={{ position: "absolute", top: -10, right: -10, width: 30, height: 30, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #FFF0C0, #EBB84E 48%, #B8822C)", border: "2px solid #FBF6EC", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "#5C3504" }}>
                  {String(pet.level).padStart(2, "0")}
                </span>
              )}
              {/* Honesty: never present the sample pet as the user's own. */}
              {demo && (
                <span style={{ position: "absolute", bottom: 4, left: 4, right: 4, textAlign: "center", fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "#FCE9CF", background: "rgba(30,23,16,.78)", borderRadius: 4, padding: "1px 0" }}>DEMO</span>
              )}
            </div>
          </div>
          <div style={{
            fontFamily: "var(--ed-disp)", fontWeight: 800, letterSpacing: "-0.02em",
            textAlign: "center", fontSize: compact ? "clamp(34px,7vw,56px)" : "clamp(38px,8vw,76px)",
            lineHeight: 0.95, margin: "2px 0 2px",
            background: "linear-gradient(180deg,#FFE6A8 0%,#E8C77E 44%,#C8932F 100%)",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          }}>PETCLAW</div>
          <TaglineTyper text="one companion across web · chrome · terminal — retained context stays inspectable and yours to control" color={MUTED} />
          </>
          )}

          {/* manifest — prints out top→bottom like terminal output (pc-unroll) */}
          <div className="pc-unroll" style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: compact ? "18px 20px" : "20px 24px" }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
              PetClaw Protocol v1 · SDK v{SDK_VERSION} <span style={{ color: MUTED, fontWeight: 400 }}>· @myaipet/petclaw-sdk · MIT</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))", gap: "0 40px" }}>
              <div>
                <SectionHead>Connectors — {RELEASE_STATUS.connectors.registry} registry · {RELEASE_STATUS.connectors.live} live</SectionHead>
                {CONNECTORS.map((c) => <Row key={c.k} k={c.k} v={c.v} kw={112} />)}
                <div style={{ display: "flex", gap: 10, fontSize: 15, lineHeight: 1.8, marginTop: 4 }}>
                  <span style={{ color: AMBER_DIM, minWidth: 112, flexShrink: 0 }}>runs on</span>
                  <span style={{ color: MUTED }}>{RUNS_ON}</span>
                </div>
                {!compact && (<>
                  <SectionHead>Skills ({RELEASE_STATUS.skills})</SectionHead>{SKILLS.map((s) => <Row key={s.k} k={s.k} v={s.v} kw={100} />)}
                  {/* Sovereignty lives in the LEFT column: the right column's
                      long wrapping rows run taller, and ending the left early
                      left a dead dark void under the skills list. */}
                  <SectionHead>Sovereignty</SectionHead>
                  {SOVEREIGNTY.map((s) => <Row key={s.k} k={s.k} v={s.v} kw={100} />)}
                </>)}
              </div>
              {!compact && (
                <div>
                  <SectionHead>MCP tools — {RELEASE_STATUS.mcpCandidateTools} in reviewed candidate · {RELEASE_STATUS.mcp}</SectionHead>
                  {MCP_TOOLS.map((t) => <Row key={t.k} k={t.k} v={t.v} />)}
                  <SectionHead>VIGIL — bounded memory capabilities</SectionHead>
                  {HARNESS.map((h) => <Row key={h.k} k={h.k} v={h.v} kw={120} />)}
                  <SectionHead>Network — launch scope</SectionHead>
                  {PACK.map((p) => <Row key={p.k} k={p.k} v={p.v} kw={120} />)}
                  <SectionHead>MODELS — bring your own (BYOK)</SectionHead>
                  <Row k="providers" v="xAI · OpenAI · Anthropic · Gemini · OpenRouter · Nous (Hermes) — powers chat + agent reasoning + judging" kw={120} />
                  <Row k="agent-loop" v="give a goal → plans, calls skills, iterates → answers" kw={120} />
                  <div style={{ fontSize: 15, marginTop: 4 }}>
                    <span style={{ color: GREEN }}>connect your model ↓ below (or via the CLI)</span>
                  </div>
                </div>
              )}
            </div>
            {/* closing rule so the panel finishes crisp instead of trailing into dark */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${LINE}`, color: MUTED, fontSize: 15 }}>Inspect, correct, export or delete supported retained data below.</div>
          </div>

          {/* LIVE terminal */}
          {interactive && (
            <div style={{ marginTop: 16, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", background: "#16110B" }}>
              <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(236,224,206,0.06)", color: MUTED, fontSize: 13, letterSpacing: "0.08em" }}>
                LIVE · petclaw_chat — {isSim ? `demo of ${petName} (adopt a pet to chat live)` : `talk to ${petName} right here`}
              </div>
              <div ref={scrollRef} style={{ maxHeight: 264, overflowY: "auto", padding: "12px 14px", fontSize: 13, lineHeight: 1.7 }}>
                {lines.map((l, i) => (
                  <div key={i} style={{ color: lineColor(l.role), whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    <span style={{ color: l.role === "you" ? GOLD2 : l.role === "pet" ? AMBER_DIM : MUTED }}>{linePrefix(l.role)}</span>
                    {l.text}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: "1px solid rgba(236,224,206,0.06)" }}>
                <span style={{ color: GOLD, fontSize: 13 }}>petclaw ❯</span>
                <input
                  aria-label={`Message ${petName}`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  placeholder={busy ? `${petName} is thinking…` : "type a message or /help"}
                  disabled={busy}
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    color: TXT, fontFamily: MONO, fontSize: 13.5,
                  }}
                />
                <button onClick={send} disabled={busy || !input.trim()} style={{
                  background: "transparent", border: `1px solid ${LINE}`, color: GOLD,
                  borderRadius: 8, padding: "4px 12px", fontFamily: MONO, fontSize: 13, cursor: busy ? "default" : "pointer",
                  opacity: busy || !input.trim() ? 0.5 : 1,
                }}>send</button>
              </div>
            </div>
          )}
        </div>

        {/* status bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          padding: "11px 22px", background: "#1E1710", borderTop: "1px solid rgba(231,197,124,0.18)",
          fontSize: 13, color: "#C2B49A",
        }}>
          <span>⌁ <b style={{ color: GOLD }}>{petName}</b>
            {pet?.level ? ` · Lv.${pet.level}` : ""}
            {pet?.personality_type ? ` · ${pet.personality_type}` : ""}
            {pet?.element && pet.element !== "normal" ? ` · ${pet.element}` : ""}
          </span>
          <span>│ BSC-native</span>
          <span>│ SOUL: <b style={{ color: GOLD }}>portable</b></span>
        </div>
      </div>
    </div>
  );
}

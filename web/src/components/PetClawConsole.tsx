"use client";

/**
 * PetClawConsole — a Hermes-Agent-style terminal that surfaces the PetClaw
 * agentic harness AND lets you actually talk to your pet through it (the
 * petclaw_chat tool, live). Dark terminal panel on the app's light pages.
 *
 * Inventory is the REAL thing (kept honest):
 *   • 21 connectors  • 18 SDK skills  • 6 MCP tools  • VIGIL (5-stage harness)  • PACK (A2A)  • sovereignty
 *
 * variant="full"    → manifest + LIVE terminal (boot effect + chat). Needs petId.
 * variant="compact" → banner + channels only, static (onboarding intro).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";

interface PetLite {
  name?: string;
  level?: number;
  personality_type?: string;
  element?: string;
}

interface Props {
  pet?: PetLite | null;
  petId?: number;
  /** true = no real owned pet (logged-out / no pet); terminal runs in simulated mode. */
  demo?: boolean;
  variant?: "full" | "compact";
}

const GOLD = "#fbbf24";
const GOLD2 = "#f59e0b";
const AMBER_DIM = "#c08a3a";
const TXT = "#e8e4da";
const MUTED = "#8a8577";
const GREEN = "#34d399";
const LINE = "rgba(245,158,11,0.22)";
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

// Always-on surfaces + the 21-connector registry (lib/petclaw/connectors).
const RUNS_ON = "web · chrome-extension · mcp clients (Claude · Cursor · any)";
const CONNECTORS = [
  { k: "messaging (8)", v: "telegram · discord · x · whatsapp · slack · line · instagram · gmail" },
  { k: "productivity (3)", v: "notion · google-calendar · github" },
  { k: "media (2)", v: "spotify · youtube" },
  { k: "knowledge (4)", v: "web-search · brave · wikipedia · memory" },
  { k: "crypto (2)", v: "coingecko · bscscan" },
];
const MCP_TOOLS = [
  { k: "petclaw_chat", v: "memory-aware chat" }, { k: "persona_mirror", v: "mirror your tone" },
  { k: "memory_recall", v: "retrieve past context" }, { k: "summarize_page", v: "summarize a page in pet's voice" },
  { k: "soul_export", v: "portable SOUL (SHA-256)" }, { k: "discover_pets", v: "find pets on the net" },
];
const SKILLS = [
  { k: "emotional", v: "companion-chat · daily-mood · daydream · pet-thought · pet-diary · vibe-check" },
  { k: "social", v: "persona-mirror · pet-date" },
  { k: "creative", v: "image-gen · video-gen" },
  { k: "knowledge", v: "memory-recall · memory-consolidate · summarize-page" },
  { k: "utility", v: "soul-export · soul-import · consent · evolve · memory-anchor" },
];
// VIGIL — the always-on self-improvement loop. Runs every companion-chat turn
// (lib/petclaw/memory/*). Adapted from the agentic-harness playbook:
// memory-feedback-pattern + learning loop.
const HARNESS = [
  { k: "memory-ledger", v: "per-turn fact extraction → portable MEMORY" },
  { k: "self-reflect", v: "compounding read on how to be your companion" },
  { k: "feedback", v: "estimates how the last reply landed" },
  { k: "self-learn", v: "promotes recurring topics into learned patterns" },
  { k: "chorus", v: "best-of-N: most in-character of N drafts · Fusion-family (opt-in)" },
];
// PACK — pet-to-pet (A2A): pets delegate skills to other pets (network/*).
const PACK = [
  { k: "discover", v: "find pets by element / skill" },
  { k: "invoke", v: "call a skill on another pet · wallet-debited, authed" },
];
const SOVEREIGNTY: { k: string; v: React.ReactNode }[] = [
  { k: "export", v: "full memory ledger, signed JSON" },
  { k: "consent", v: "public / sharing / AI-training / interact" },
  { k: "delete", v: "erase everything, cryptographic proof" },
  { k: "on-chain", v: <>SOUL anchor + inheritance <span style={{ color: MUTED }}>○ at go-live</span></> },
];

function Row({ k, v, kw = 132 }: { k: string; v: React.ReactNode; kw?: number }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 12.5, lineHeight: 1.85 }}>
      <span style={{ color: AMBER_DIM, minWidth: kw, flexShrink: 0 }}>{k}</span>
      <span style={{ color: TXT }}>{v}</span>
    </div>
  );
}
function SectionHead({ children }: { children: React.ReactNode }) {
  return <div style={{ color: GOLD2, fontWeight: 700, fontSize: 13, margin: "16px 0 7px" }}>{children}</div>;
}
const liveTag = <span style={{ color: GREEN }}>● live</span>;

interface Line { role: "sys" | "you" | "pet"; text: string }

const BOOT: Line[] = [
  { role: "sys", text: "initializing petclaw-mcp · protocol v1 · SDK 1.6.0" },
  { role: "sys", text: "connectors ▸ 21   tools ▸ 6 ready   skills ▸ 18 loaded   VIGIL ▸ 5 · PACK ▸ A2A" },
  { role: "sys", text: "soul ▸ portable · consent ▸ enforced · on-chain ▸ holding (go-live)" },
];

const DEMO_REPLIES = [
  "hehe hi! i'm a *demo* of how your pet sounds — adopt one and i'll remember everything about you.",
  "*wags* connect your wallet and give me a name — then this chat becomes really yours, across every channel.",
  "ooh you typed something! once you adopt, i reply from real memory (the petclaw_chat tool). want to try?",
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
            ? `petclaw_chat ready — demo of ${petName}; connect to chat live (or /help)`
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

  // /goal — run the plan-execute agent loop on a real (owned) pet, stream steps.
  const runGoal = async (goalText: string) => {
    const g = goalText.trim();
    if (!g) { pushLine({ role: "sys", text: "usage: /goal <what you want your pet to do>" }); return; }
    if (isSim || !petId) { pushLine({ role: "sys", text: "agent loop needs your own pet — connect your wallet & adopt one" }); return; }
    pushLine({ role: "sys", text: `agent ▸ planning · "${g}"` });
    setBusy(true);
    try {
      const r = await api.pets.runAgent(petId as number, g);
      (r?.steps || []).forEach((s: any) =>
        pushLine({ role: "sys", text: `  ${s.skill === "finish" ? "✓ done" : "→ " + s.skill}${s.thought ? " · " + s.thought : ""}` })
      );
      typeReply(r?.answer || `*${petName} blinks*`);
    } catch (e: any) {
      pushLine({ role: "sys", text: `agent error — ${e?.message || "try again in a moment"}` });
    } finally {
      setBusy(false);
    }
  };

  const runCommand = (cmd: string): boolean => {
    const c = cmd.trim().toLowerCase();
    if (c.startsWith("/goal")) { runGoal(cmd.trim().replace(/^\/goal\s*/i, "")); return true; }
    if (c === "/help") {
      pushLine({ role: "sys", text: "commands: /goal <task>  /channels  /tools  /skills  /vigil  /pack  /clear  — or type to chat" });
      return true;
    }
    if (c === "/channels" || c === "/connectors") { pushLine({ role: "sys", text: "connectors: " + CONNECTORS.map((x) => x.k).join(" · ") }); return true; }
    if (c === "/tools") { pushLine({ role: "sys", text: "mcp tools: " + MCP_TOOLS.map((x) => x.k).join(" · ") }); return true; }
    if (c === "/skills") { pushLine({ role: "sys", text: "skills: " + SKILLS.map((x) => x.v).join(", ") }); return true; }
    if (c === "/vigil" || c === "/harness") { pushLine({ role: "sys", text: "VIGIL (every turn): " + HARNESS.map((x) => x.k).join(" → ") }); return true; }
    if (c === "/pack") { pushLine({ role: "sys", text: "PACK (A2A): " + PACK.map((x) => x.k).join(" · ") + " — pets delegate to other pets" }); return true; }
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
        pushLine({ role: "sys", text: "demo mode — connect your wallet & adopt a pet to chat live" });
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
        borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 24px 64px rgba(15,15,26,0.45)", background: "#13131a",
      }}>
        {/* chrome */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "11px 16px",
          background: "#1b1b24", borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840" }} />
          <span style={{ marginLeft: 10, color: "#b9b3a6", fontSize: 12.5 }}>
            petclaw connect{pet?.name ? ` · ${pet.name.toLowerCase()}` : ""}
          </span>
        </div>

        <div style={{
          padding: compact ? "22px 26px 14px" : "26px 30px 16px",
          background: "radial-gradient(900px 360px at 50% -20%, #1b2330 0%, #0e0e14 60%)",
        }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, letterSpacing: "-0.02em",
            textAlign: "center", fontSize: compact ? "clamp(34px,7vw,56px)" : "clamp(38px,8vw,76px)",
            lineHeight: 0.95, margin: "2px 0 2px",
            background: "linear-gradient(180deg,#fde68a 0%,#fbbf24 44%,#d97706 100%)",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          }}>PETCLAW</div>
          <div style={{ textAlign: "center", color: MUTED, fontSize: 12.5, marginBottom: 18 }}>
            your AI pet, sovereign &amp; portable — across every surface you use
          </div>

          {/* manifest */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: compact ? "18px 20px" : "20px 24px" }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
              PetClaw Protocol v1 · SDK v1.6.0 <span style={{ color: MUTED, fontWeight: 400 }}>· npx petclaw-mcp · MIT</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))", gap: "0 40px" }}>
              <div>
                <SectionHead>Connectors — 21 integrations</SectionHead>
                {CONNECTORS.map((c) => <Row key={c.k} k={c.k} v={c.v} kw={112} />)}
                <div style={{ display: "flex", gap: 10, fontSize: 12, lineHeight: 1.8, marginTop: 4 }}>
                  <span style={{ color: AMBER_DIM, minWidth: 112, flexShrink: 0 }}>runs on</span>
                  <span style={{ color: MUTED }}>{RUNS_ON}</span>
                </div>
                {!compact && (<><SectionHead>Skills (18)</SectionHead>{SKILLS.map((s) => <Row key={s.k} k={s.k} v={s.v} kw={100} />)}</>)}
              </div>
              {!compact && (
                <div>
                  <SectionHead>MCP tools — any agent can call</SectionHead>
                  {MCP_TOOLS.map((t) => <Row key={t.k} k={t.k} v={t.v} />)}
                  <SectionHead>VIGIL — agentic harness · every chat turn</SectionHead>
                  {HARNESS.map((h) => <Row key={h.k} k={h.k} v={h.v} kw={120} />)}
                  <SectionHead>PACK — pet-to-pet (A2A)</SectionHead>
                  {PACK.map((p) => <Row key={p.k} k={p.k} v={p.v} kw={120} />)}
                  <SectionHead>MODELS — bring your own (BYOK)</SectionHead>
                  <Row k="providers" v="xAI · OpenAI · Anthropic · Gemini · OpenRouter — powers chat + agent reasoning + judging" kw={120} />
                  <Row k="agent-loop" v="give a goal → plans, calls skills, iterates → answers" kw={120} />
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    <span style={{ color: GREEN }}>connect your model ↓ below (or via the CLI)</span>
                  </div>
                  <SectionHead>Sovereignty</SectionHead>
                  {SOVEREIGNTY.map((s) => <Row key={s.k} k={s.k} v={s.v} />)}
                </div>
              )}
            </div>
            <div style={{ marginTop: 14, color: MUTED, fontSize: 12.5 }}>21 connectors · 18 skills · 5-stage harness · 6 MCP tools · BYO models · 100% your data</div>
          </div>

          {/* LIVE terminal */}
          {interactive && (
            <div style={{ marginTop: 16, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", background: "#0b0b11" }}>
              <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", color: MUTED, fontSize: 11.5, letterSpacing: "0.08em" }}>
                LIVE · petclaw_chat — {isSim ? `demo of ${petName} (connect to chat live)` : `talk to ${petName} right here`}
              </div>
              <div ref={scrollRef} style={{ maxHeight: 240, overflowY: "auto", padding: "12px 14px", fontSize: 12.5, lineHeight: 1.7 }}>
                {lines.map((l, i) => (
                  <div key={i} style={{ color: lineColor(l.role), whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    <span style={{ color: l.role === "you" ? GOLD2 : l.role === "pet" ? AMBER_DIM : MUTED }}>{linePrefix(l.role)}</span>
                    {l.text}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ color: GOLD, fontSize: 13 }}>petclaw ❯</span>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  placeholder={busy ? `${petName} is thinking…` : "type a message or /help"}
                  disabled={busy}
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    color: TXT, fontFamily: MONO, fontSize: 12.5,
                  }}
                />
                <button onClick={send} disabled={busy || !input.trim()} style={{
                  background: "transparent", border: `1px solid ${LINE}`, color: GOLD,
                  borderRadius: 8, padding: "4px 12px", fontFamily: MONO, fontSize: 12, cursor: busy ? "default" : "pointer",
                  opacity: busy || !input.trim() ? 0.5 : 1,
                }}>send</button>
              </div>
            </div>
          )}
        </div>

        {/* status bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          padding: "11px 22px", background: "#101017", borderTop: "1px solid rgba(245,158,11,0.18)",
          fontSize: 12.5, color: "#b9b3a6",
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

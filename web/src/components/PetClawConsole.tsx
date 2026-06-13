"use client";

/**
 * PetClawConsole — a Hermes-Agent-style terminal console that surfaces the
 * PetClaw agentic harness: the channels a pet lives on, the MCP tools any
 * external agent (Claude/Cursor/…) can call, the SDK skills, and the data-
 * sovereignty controls. Dark terminal panel that sits on the app's light pages.
 *
 * Content is the REAL inventory (kept honest — only live things are marked live):
 *   • 7 channels (web, extension, telegram, discord, twitter/x, github, mcp)
 *   • 6 MCP tools (petclaw-mcp server — lib/petclaw mcp/server.js)
 *   • 5 SDK skills (companion-chat, persona-mirror, memory-recall,
 *     autonomous-post, soul-export)
 *
 * variant="full"    → whole console (PetClaw tab hero)
 * variant="compact" → banner + channels only (onboarding intro)
 */

interface PetLite {
  name?: string;
  level?: number;
  personality_type?: string;
  element?: string;
  memoryCount?: number;
}

interface Props {
  pet?: PetLite | null;
  variant?: "full" | "compact";
}

const GOLD = "#fbbf24";
const GOLD2 = "#f59e0b";
const AMBER_DIM = "#c08a3a";
const TXT = "#e8e4da";
const MUTED = "#8a8577";
const LINE = "rgba(245,158,11,0.22)";
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

const CHANNELS: { k: string; v: string }[] = [
  { k: "web", v: "app.myaipet.ai" },
  { k: "extension", v: "Chrome — PetClaw" },
  { k: "telegram", v: "chats & presence" },
  { k: "discord", v: "server + DMs" },
  { k: "twitter / x", v: "autonomous posts" },
  { k: "github", v: "reads your dev vibe" },
  { k: "mcp clients", v: "Claude · Cursor · any" },
];

const MCP_TOOLS: { k: string; v: string }[] = [
  { k: "petclaw_chat", v: "memory-aware chat" },
  { k: "persona_mirror", v: "mirror your tone" },
  { k: "memory_recall", v: "retrieve past context" },
  { k: "autonomous_post", v: "post in your pet's voice" },
  { k: "soul_export", v: "portable SOUL (SHA-256)" },
  { k: "discover_pets", v: "find pets on the network" },
];

const SKILLS: { k: string; v: string }[] = [
  { k: "emotional", v: "companion-chat" },
  { k: "social", v: "persona-mirror, autonomous-post" },
  { k: "knowledge", v: "memory-recall" },
  { k: "utility", v: "soul-export" },
];

const SOVEREIGNTY: { k: string; v: React.ReactNode }[] = [
  { k: "export", v: "full memory ledger, signed JSON" },
  { k: "consent", v: "public / sharing / AI-training / interact" },
  { k: "delete", v: "erase everything, cryptographic proof" },
  { k: "on-chain", v: <>SOUL anchor + inheritance <span style={{ color: MUTED }}>○ at TGE</span></> },
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
  return (
    <div style={{ color: GOLD2, fontWeight: 700, fontSize: 13, margin: "16px 0 7px" }}>
      {children}
    </div>
  );
}

const liveTag = <span style={{ color: "#34d399" }}>● live</span>;

export default function PetClawConsole({ pet, variant = "full" }: Props) {
  const compact = variant === "compact";
  return (
    <div style={{ fontFamily: MONO, color: TXT }}>
      {/* Window chrome */}
      <div style={{
        borderRadius: 16, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 24px 64px rgba(15,15,26,0.45)",
        background: "#13131a",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "11px 16px", background: "#1b1b24",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840" }} />
          <span style={{ marginLeft: 10, color: "#b9b3a6", fontSize: 12.5 }}>
            petclaw connect{pet?.name ? ` · ${pet.name.toLowerCase()}` : ""}
          </span>
        </div>

        <div style={{
          padding: compact ? "22px 26px 14px" : "28px 32px 16px",
          background: "radial-gradient(900px 360px at 50% -20%, #1b2330 0%, #0e0e14 60%)",
        }}>
          {/* Banner */}
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800,
            letterSpacing: "-0.02em", textAlign: "center",
            fontSize: compact ? "clamp(34px,7vw,56px)" : "clamp(40px,8vw,84px)",
            lineHeight: 0.95, margin: "2px 0 2px",
            background: "linear-gradient(180deg,#fde68a 0%,#fbbf24 44%,#d97706 100%)",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          }}>
            PETCLAW
          </div>
          <div style={{ textAlign: "center", color: MUTED, fontSize: 12.5, marginBottom: 20 }}>
            your AI pet, sovereign &amp; portable — across every surface you use
          </div>

          {/* Console panel */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: compact ? "18px 20px" : "22px 26px" }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
              PetClaw Protocol v1 · SDK v1.3.0{" "}
              <span style={{ color: MUTED, fontWeight: 400 }}>· npx petclaw-mcp · MIT</span>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "0 40px",
            }}>
              <div>
                <SectionHead>Channels — where your pet lives</SectionHead>
                {CHANNELS.map((c) => (
                  <Row key={c.k} k={c.k} v={<>{c.v} {liveTag}</>} />
                ))}
                {!compact && (
                  <>
                    <SectionHead>Skills</SectionHead>
                    {SKILLS.map((s) => <Row key={s.k} k={s.k} v={s.v} />)}
                  </>
                )}
              </div>

              {!compact && (
                <div>
                  <SectionHead>MCP tools — any agent can call</SectionHead>
                  {MCP_TOOLS.map((t) => <Row key={t.k} k={t.k} v={t.v} />)}
                  <SectionHead>Sovereignty</SectionHead>
                  {SOVEREIGNTY.map((s) => <Row key={s.k} k={s.k} v={s.v} />)}
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, color: MUTED, fontSize: 12.5 }}>
              7 channels · 6 MCP tools · 5 skills · 100% your data
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          padding: "11px 22px", background: "#101017",
          borderTop: "1px solid rgba(245,158,11,0.18)",
          fontSize: 12.5, color: "#b9b3a6",
        }}>
          <span>⌁ <b style={{ color: GOLD }}>{pet?.name || "Your pet"}</b>
            {pet?.level ? ` · Lv.${pet.level}` : ""}
            {pet?.personality_type ? ` · ${pet.personality_type}` : ""}
            {pet?.element && pet.element !== "normal" ? ` · ${pet.element}` : ""}
          </span>
          <span>│ BSC-native</span>
          <span>│ SOUL: <b style={{ color: GOLD }}>portable</b></span>
          {pet?.memoryCount ? <span>│ {pet.memoryCount.toLocaleString()} memories</span> : null}
        </div>
      </div>
    </div>
  );
}

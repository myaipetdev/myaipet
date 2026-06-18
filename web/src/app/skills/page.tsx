import type { Metadata } from "next";
import { BUILTIN_SKILLS } from "@/lib/petclaw/pethub";

export const metadata: Metadata = {
  title: "Skills — PetClaw Marketplace",
  description: "Built-in skills your pet can run — chat, memory recall, social posting, summarization, and more. Install with one command.",
};

const CATEGORY_META: Record<string, { color: string; bg: string; emoji: string }> = {
  emotional:  { color: "#dc2626", bg: "rgba(248,113,113,0.10)", emoji: "💭" },
  social:     { color: "#2563eb", bg: "rgba(96,165,250,0.10)",  emoji: "💬" },
  knowledge:  { color: "#7c3aed", bg: "rgba(167,139,250,0.10)", emoji: "🧠" },
  creative:   { color: "#db2777", bg: "rgba(244,114,182,0.10)", emoji: "🎨" },
  utility:    { color: "#0891b2", bg: "rgba(34,211,238,0.10)",  emoji: "⚙️" },
};

export default function SkillsPage() {
  const grouped = BUILTIN_SKILLS.reduce<Record<string, typeof BUILTIN_SKILLS>>((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});
  const order = ["emotional", "social", "knowledge", "creative", "utility"];

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #faf7f2 0%, #fff8eb 50%, #faf7f2 100%)",
      fontFamily: "'Space Grotesk', sans-serif",
      color: "#1a1a2e",
      padding: "60px 24px 100px",
    }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <a href="/" style={{
          display: "inline-block", marginBottom: 24, fontSize: 13,
          color: "rgba(26,26,46,0.65)", textDecoration: "none",
        }}>← Back to landing</a>

        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <span style={{
            display: "inline-block", padding: "5px 14px", borderRadius: 999,
            background: "rgba(245,158,11,0.12)", color: "#b45309",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
            textTransform: "uppercase", marginBottom: 14,
          }}>PetClaw Skill Registry · v1</span>
          <h1 style={{
            fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em",
            margin: "0 0 10px", lineHeight: 1.1,
          }}>
            Skills your pet can run.
          </h1>
          <p style={{
            fontSize: 17, color: "rgba(26,26,46,0.7)", lineHeight: 1.6,
            maxWidth: 640, margin: 0,
          }}>
            Built-in skill manifests, one-command install. Every skill is a markdown +
            JSON schema definition — no proprietary format, no lock-in. Plug them into
            any MCP-compatible client.
          </p>
        </div>

        {/* Quick-install banner */}
        <div style={{
          padding: 18, borderRadius: 14, marginBottom: 36,
          background: "#0f0f1a", color: "#f8f8f8",
          border: "1px solid rgba(245,158,11,0.2)",
          fontFamily: "monospace", fontSize: 13, lineHeight: 1.8,
          overflowX: "auto",
        }}>
          <div style={{ color: "#fbbf24", marginBottom: 6, fontSize: 11, letterSpacing: "0.1em" }}>$ ONE-LINE INSTALL</div>
          <div><span style={{ color: "#4ade80" }}>npx</span> @myaipet/petclaw-sdk install <span style={{ color: "#fbbf24" }}>&lt;skill-id&gt;</span></div>
          <div style={{ color: "rgba(255,255,255,0.5)", marginTop: 6, fontSize: 12 }}>
            # or via API: POST /api/petclaw/skills {"{"} action:"install", petId, skillId {"}"}
          </div>
        </div>

        {/* Learned-skills explainer — VIGIL self-improvement */}
        <div style={{
          padding: 22, borderRadius: 16, marginBottom: 36,
          background: "linear-gradient(135deg, rgba(168,85,247,0.06), rgba(236,72,153,0.06))",
          border: "1px solid rgba(168,85,247,0.18)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>🌱</span>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
              Pets grow new skills on their own
            </h2>
            <span style={{
              fontSize: 9, padding: "3px 10px", borderRadius: 999,
              background: "rgba(168,85,247,0.12)", color: "#a855f7",
              fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.08em",
            }}>VIGIL</span>
          </div>
          <p style={{ fontSize: 14, color: "rgba(26,26,46,0.7)", lineHeight: 1.65, margin: "0 0 10px" }}>
            Every conversation feeds a topic detector. After three similar exchanges with positive
            outcomes, your pet auto-promotes the pattern into a private skill — saved with example
            responses that worked. These travel with your pet via SOUL export, so when your pet
            migrates to another app, its hard-won expertise comes with it.
          </p>
          <p style={{ fontSize: 12, color: "rgba(26,26,46,0.55)", lineHeight: 1.55, margin: 0 }}>
            See your pet's learned skills in <a href="/?section=sovereignty" style={{ color: "#a855f7", fontWeight: 700 }}>Sovereignty → Memory Ledger</a>.
          </p>
        </div>

        {/* Skill cards by category */}
        {order.filter(c => grouped[c]).map((cat) => {
          const meta = CATEGORY_META[cat];
          return (
            <section key={cat} style={{ marginBottom: 32 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
              }}>
                <span style={{ fontSize: 20 }}>{meta.emoji}</span>
                <h2 style={{
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: "rgba(26,26,46,0.5)", margin: 0,
                }}>{cat}</h2>
                <span style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.06)" }} />
                <span style={{ fontSize: 12, color: "rgba(26,26,46,0.45)" }}>
                  {grouped[cat].length} skill{grouped[cat].length === 1 ? "" : "s"}
                </span>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14,
              }}>
                {grouped[cat].map((s) => (
                  <div key={s.id} style={{
                    padding: 20, borderRadius: 16,
                    background: "white",
                    border: "1px solid rgba(0,0,0,0.06)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
                        {s.name}
                      </h3>
                      <span style={{
                        fontSize: 10, padding: "3px 8px", borderRadius: 6,
                        background: s.price === 0 ? "rgba(74,222,128,0.15)" : "rgba(245,158,11,0.15)",
                        color: s.price === 0 ? "#16a34a" : "#b45309",
                        fontWeight: 700, letterSpacing: "0.06em", flexShrink: 0,
                      }}>
                        {s.price === 0 ? "FREE" : `${s.price} credits`}
                      </span>
                    </div>

                    <p style={{
                      fontSize: 13, color: "rgba(26,26,46,0.65)", margin: 0,
                      lineHeight: 1.55, flex: 1,
                    }}>{s.description}</p>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {s.tags.slice(0, 4).map(t => (
                        <span key={t} style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 999,
                          background: "rgba(0,0,0,0.05)", color: "rgba(26,26,46,0.6)",
                          fontFamily: "monospace",
                        }}>{t}</span>
                      ))}
                    </div>

                    <div style={{
                      paddingTop: 10, marginTop: 4,
                      borderTop: "1px dashed rgba(0,0,0,0.07)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      fontFamily: "monospace", fontSize: 11,
                    }}>
                      <code style={{ color: "#b45309" }}>{s.id}</code>
                      {s.requires?.minLevel && (
                        <span style={{ color: "rgba(26,26,46,0.5)" }}>
                          unlocks at Lv.{s.requires.minLevel}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      <code style={{
                        flex: 1, fontSize: 11, padding: "6px 10px", borderRadius: 8,
                        background: "#0f0f1a", color: "#f8f8f8",
                        whiteSpace: "normal", wordBreak: "break-all", lineHeight: 1.45,
                      }}>
                        npx @myaipet/petclaw-sdk install {s.id}
                      </code>
                      <a
                        href={`/api/petclaw/skills?id=${s.id}&format=md`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          padding: "6px 11px", borderRadius: 8,
                          background: "rgba(0,0,0,0.04)", color: "#1a1a2e",
                          fontSize: 11, fontWeight: 600, textDecoration: "none",
                          flexShrink: 0,
                        }}
                      >SKILL.md ↗</a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {/* Try it */}
        <div style={{
          marginTop: 36, padding: "24px 28px", borderRadius: 18,
          background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(192,132,252,0.06))",
          border: "1px solid rgba(245,158,11,0.2)",
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            Try a skill right now
          </h3>
          <p style={{ fontSize: 14, color: "rgba(26,26,46,0.7)", lineHeight: 1.6, margin: "0 0 14px" }}>
            The Sparky demo pet (petId=1) can run any free skill without auth.
            Test from your terminal:
          </p>
          <pre style={{
            background: "#0f0f1a", color: "#f8f8f8", padding: 16, borderRadius: 12,
            fontFamily: "monospace", fontSize: 12.5, lineHeight: 1.7, margin: 0,
            overflowX: "auto",
          }}>{`curl -X POST https://app.myaipet.ai/api/petclaw/skills \\
  -H "Content-Type: application/json" \\
  -d '{"action":"execute","petId":1,"skillId":"vibe-check",
       "input":{"message":"hey wanna grab dinner tonight?"}}'`}</pre>
        </div>

        <div style={{
          marginTop: 36, fontSize: 12, color: "rgba(26,26,46,0.55)", lineHeight: 1.6,
        }}>
          MCP-compatible clients (Claude Code, Cursor, OpenClaw, Gemini CLI) can list
          and invoke these as tools. See <a href="/api-docs" style={{ color: "#b45309" }}>/api-docs</a> →
          Ecosystem → MCP Compatibility, or run <code style={{ fontFamily: "monospace" }}>petclaw-sdk mcp</code>.
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { BUILTIN_SKILLS } from "@/lib/petclaw/pethub";
import Icon from "@/components/Icon";

export const metadata: Metadata = {
  title: "Skills — PetClaw Marketplace",
  description: "Built-in skills your pet can run — chat, memory recall, social posting, summarization, and more. Install with one command.",
};

const CATEGORY_META: Record<string, { color: string; bg: string; icon: string }> = {
  emotional:  { color: "#BE4F28", bg: "rgba(190,79,40,0.10)",   icon: "heart" },
  social:     { color: "#3E8FE0", bg: "rgba(62,143,224,0.10)",  icon: "chat" },
  knowledge:  { color: "#9E72E8", bg: "rgba(158,114,232,0.10)", icon: "crystal-ball" },
  creative:   { color: "#6B4FA0", bg: "rgba(107,79,160,0.10)",  icon: "sparkling" },
  utility:    { color: "#1A7E68", bg: "rgba(26,126,104,0.10)",  icon: "extension-icon" },
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
      background: "#ECE4D4",
      fontFamily: "var(--ed-body, sans-serif)",
      color: "#211A12",
      padding: "60px 24px 100px",
    }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <a href="/" style={{
          display: "inline-block", marginBottom: 24, fontSize: 13,
          color: "rgba(33,26,18,0.65)", textDecoration: "none",
        }}>← Back to landing</a>

        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <span style={{
            display: "inline-block", padding: "5px 14px", borderRadius: 999,
            background: "rgba(190,79,40,0.12)", color: "#9A4E1E",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.16em",
            textTransform: "uppercase", marginBottom: 14,
          }}>PetClaw Skill Registry · v1</span>
          <h1 style={{
            fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em",
            margin: "0 0 10px", lineHeight: 1.1,
          }}>
            Skills your pet can run.
          </h1>
          <p style={{
            fontSize: 17, color: "rgba(33,26,18,0.7)", lineHeight: 1.6,
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
          background: "#1E1710", color: "#FFF8EE",
          border: "1px solid rgba(232,199,126,0.28)",
          fontFamily: "var(--ed-m, ui-monospace, monospace)", fontSize: 13, lineHeight: 1.8,
          overflowX: "auto",
        }}>
          <div style={{ color: "#E8C77E", marginBottom: 6, fontSize: 13, letterSpacing: "0.1em" }}>$ ONE-LINE INSTALL</div>
          <div><span style={{ color: "#5C8A4E" }}>npx</span> @myaipet/petclaw-sdk install <span style={{ color: "#E8C77E" }}>&lt;skill-id&gt;</span></div>
          <div style={{ color: "rgba(255,255,255,0.5)", marginTop: 6, fontSize: 13 }}>
            # or via API: POST /api/petclaw/skills {"{"} action:"install", petId, skillId {"}"}
          </div>
        </div>

        {/* Learned-skills explainer — VIGIL self-improvement */}
        <div style={{
          padding: 22, borderRadius: 16, marginBottom: 36,
          background: "linear-gradient(135deg, rgba(158,114,232,0.06), rgba(190,79,40,0.06))",
          border: "1px solid rgba(158,114,232,0.18)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}><Icon name="grass" size={20} /></span>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
              Pets grow new skills on their own
            </h2>
            <span style={{
              fontSize: 13, padding: "3px 10px", borderRadius: 999,
              background: "rgba(158,114,232,0.12)", color: "#9E72E8",
              fontFamily: "var(--ed-m, ui-monospace, monospace)", fontWeight: 700, letterSpacing: "0.08em",
            }}>VIGIL</span>
          </div>
          <p style={{ fontSize: 14, color: "rgba(33,26,18,0.7)", lineHeight: 1.65, margin: "0 0 10px" }}>
            Every conversation feeds a topic detector. After three similar exchanges with positive
            outcomes, your pet auto-promotes the pattern into a private skill — saved with example
            responses that worked. These travel with your pet via SOUL export, so when your pet
            migrates to another app, its hard-won expertise comes with it.
          </p>
          <p style={{ fontSize: 13, color: "rgba(33,26,18,0.55)", lineHeight: 1.55, margin: 0 }}>
            See your pet's learned skills in <a href="/?section=sovereignty" style={{ color: "#9E72E8", fontWeight: 700 }}>Sovereignty → Memory Ledger</a>.
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
                <span style={{ fontSize: 20 }}><Icon name={meta.icon} size={20} /></span>
                <h2 style={{
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: "rgba(33,26,18,0.5)", margin: 0,
                }}>{cat}</h2>
                <span style={{ flex: 1, height: 1, background: "rgba(33,26,18,0.13)" }} />
                <span style={{ fontSize: 13, color: "rgba(33,26,18,0.45)" }}>
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
                    background: "#FBF6EC",
                    border: "1px solid rgba(33,26,18,0.13)",
                    boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                    display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
                        {s.name}
                      </h3>
                      <span style={{
                        fontSize: 13, padding: "3px 8px", borderRadius: 6,
                        background: s.price === 0 ? "rgba(92,138,78,0.15)" : "rgba(190,79,40,0.15)",
                        color: s.price === 0 ? "#5C8A4E" : "#9A4E1E",
                        fontWeight: 700, letterSpacing: "0.06em", flexShrink: 0,
                      }}>
                        {s.price === 0 ? "FREE" : `${s.price} credits`}
                      </span>
                    </div>

                    <p style={{
                      fontSize: 13, color: "rgba(33,26,18,0.65)", margin: 0,
                      lineHeight: 1.55, flex: 1,
                    }}>{s.description}</p>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {s.tags.slice(0, 4).map(t => (
                        <span key={t} style={{
                          fontSize: 13, padding: "2px 8px", borderRadius: 999,
                          background: "#F5EFE2", color: "rgba(33,26,18,0.6)",
                          fontFamily: "var(--ed-m, ui-monospace, monospace)",
                        }}>{t}</span>
                      ))}
                    </div>

                    <div style={{
                      paddingTop: 10, marginTop: 4,
                      borderTop: "1px dashed rgba(33,26,18,0.13)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      fontFamily: "var(--ed-m, ui-monospace, monospace)", fontSize: 13,
                    }}>
                      <code style={{ color: "#9A4E1E" }}>{s.id}</code>
                      {s.requires?.minLevel && (
                        <span style={{ color: "rgba(33,26,18,0.5)" }}>
                          unlocks at Lv.{s.requires.minLevel}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      <code style={{
                        flex: 1, fontSize: 13, padding: "6px 10px", borderRadius: 8,
                        background: "#1E1710", color: "#FFF8EE",
                        whiteSpace: "normal", wordBreak: "break-all", lineHeight: 1.45,
                      }}>
                        npx @myaipet/petclaw-sdk install {s.id}
                      </code>
                      <a
                        href={`/api/petclaw/skills?id=${s.id}&format=md`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          padding: "6px 11px", borderRadius: 8,
                          background: "#F5EFE2", color: "#211A12",
                          fontSize: 13, fontWeight: 600, textDecoration: "none",
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
          background: "linear-gradient(135deg, rgba(190,79,40,0.08), rgba(158,114,232,0.06))",
          border: "1px solid rgba(190,79,40,0.2)",
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            Try a skill right now
          </h3>
          <p style={{ fontSize: 14, color: "rgba(33,26,18,0.7)", lineHeight: 1.6, margin: "0 0 14px" }}>
            The Sparky demo pet (petId=1) can run any free skill without auth.
            Test from your terminal:
          </p>
          <pre style={{
            background: "#1E1710", color: "#FFF8EE", padding: 16, borderRadius: 12,
            fontFamily: "var(--ed-m, ui-monospace, monospace)", fontSize: 13, lineHeight: 1.7, margin: 0,
            overflowX: "auto",
          }}>{`curl -X POST https://app.myaipet.ai/api/petclaw/skills \\
  -H "Content-Type: application/json" \\
  -d '{"action":"execute","petId":1,"skillId":"vibe-check",
       "input":{"message":"hey wanna grab dinner tonight?"}}'`}</pre>
        </div>

        <div style={{
          marginTop: 36, fontSize: 13, color: "rgba(33,26,18,0.55)", lineHeight: 1.6,
        }}>
          MCP-compatible clients (Claude Code, Cursor, OpenClaw, Gemini CLI) can list
          and invoke these as tools. See <a href="/api-docs" style={{ color: "#9A4E1E" }}>/api-docs</a> →
          Ecosystem → MCP Compatibility, or run <code style={{ fontFamily: "var(--ed-m, ui-monospace, monospace)" }}>petclaw-sdk mcp</code>.
        </div>
      </div>
    </div>
  );
}

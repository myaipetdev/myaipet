import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Codex Avatar — MY AI PET",
  description: "Turn your AI pet into a Codex Desktop avatar. A floating companion that lives next to your editor and reflects your 24/7 agent.",
};

const STATES = [
  { row: 0, state: "idle",          desc: "Calm, waiting" },
  { row: 1, state: "running-right", desc: "Forward execution" },
  { row: 2, state: "running-left",  desc: "Looking back / inspecting" },
  { row: 3, state: "waving",        desc: "Greeting / ready" },
  { row: 4, state: "jumping",       desc: "Level up / milestone" },
  { row: 5, state: "failed",        desc: "Blocked / attention needed" },
  { row: 6, state: "waiting",       desc: "Waiting on user / event" },
  { row: 7, state: "running",       desc: "24/7 loop active" },
  { row: 8, state: "review",        desc: "Reviewing / reporting" },
];

export default function CodexPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #faf7f2 0%, #fff8eb 50%, #faf7f2 100%)",
      fontFamily: "'Space Grotesk', sans-serif",
      color: "#1a1a2e",
      padding: "60px 24px 100px",
    }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <a href="/landing/" style={{
          display: "inline-block", marginBottom: 24,
          fontSize: 13, color: "rgba(26,26,46,0.55)", textDecoration: "none",
        }}>← Back to landing</a>

        {/* Hero */}
        <div style={{
          padding: "44px 36px",
          borderRadius: 28,
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          color: "white",
          marginBottom: 36,
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 20px 50px rgba(26,26,46,0.25)",
        }}>
          {/* Decorative grid bg */}
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "linear-gradient(rgba(245,158,11,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.05) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", top: -100, right: -50, width: 320, height: 320, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(245,158,11,0.18), transparent 70%)",
            pointerEvents: "none",
          }} />

          <div style={{ position: "relative" }}>
            <span style={{
              display: "inline-block",
              padding: "6px 14px", borderRadius: 999,
              background: "rgba(245,158,11,0.15)",
              color: "#fbbf24",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
              marginBottom: 14,
              border: "1px solid rgba(245,158,11,0.3)",
            }}>For Codex Desktop · v0.128+</span>
            <h1 style={{
              fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em",
              margin: "0 0 12px", lineHeight: 1.05,
            }}>
              Your pet,<br/>
              <span style={{
                background: "linear-gradient(135deg, #fbbf24, #f59e0b, #c084fc)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>your coding companion.</span>
            </h1>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: "0 0 24px", maxWidth: 620 }}>
              Export any PetClaw pet as a Codex Desktop avatar. A floating overlay
              that lives next to your editor and animates whatever your 24/7 agent
              is actually doing — running, reviewing, waiting, or stuck.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="https://app.myaipet.ai/sovereignty" style={{
                padding: "14px 26px", borderRadius: 14,
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                color: "white", fontSize: 14, fontWeight: 800,
                textDecoration: "none",
                boxShadow: "0 12px 30px rgba(245,158,11,0.35)",
              }}>Export your pet →</a>
              <a href="#install" style={{
                padding: "14px 26px", borderRadius: 14,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "white", fontSize: 14, fontWeight: 700,
                textDecoration: "none",
              }}>How to install</a>
            </div>
          </div>
        </div>

        {/* Why */}
        <SectionTitle>Why pair PetClaw with Codex?</SectionTitle>
        <Grid>
          <Card title="Same memory, new surface" desc="Your pet's MEMORY.md / USER.md follow into Codex. The same context that powers chat now reflects coding sessions." />
          <Card title="Visible 24/7 agent state" desc="If you wire it to ~/.claw/status.json, the avatar animates between running, waiting, review, and failed — at a glance." />
          <Card title="Personality that codes" desc="Sassy / playful / wise — your pet's tone carries into commit messages, PR replies, and standup reports." />
          <Card title="Sovereignty preserved" desc="Avatar export is a single avatar.json + spritesheet. No telemetry, no cloud lock-in. SOUL.md remains exportable." />
        </Grid>

        {/* Spec */}
        <SectionTitle>Spritesheet spec</SectionTitle>
        <div style={{
          padding: 24, borderRadius: 18, background: "white",
          border: "1px solid rgba(0,0,0,0.06)", marginBottom: 36,
          boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 20 }}>
            <SpecPill k="Total" v="1536 × 1872" />
            <SpecPill k="Grid" v="8 × 9" />
            <SpecPill k="Frame" v="192 × 208" />
            <SpecPill k="Format" v="WebP / PNG" />
            <SpecPill k="Background" v="Transparent" />
          </div>

          {/* State table */}
          <div style={{ overflow: "hidden", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.03)" }}>
                  <th style={th}>Row</th>
                  <th style={th}>State</th>
                  <th style={th}>When PetClaw uses it</th>
                </tr>
              </thead>
              <tbody>
                {STATES.map((s) => (
                  <tr key={s.row} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                    <td style={{ ...td, fontFamily: "monospace", color: "rgba(26,26,46,0.5)", width: 50 }}>{s.row}</td>
                    <td style={{ ...td, fontFamily: "monospace", color: "#b45309", fontWeight: 700 }}>{s.state}</td>
                    <td style={{ ...td, color: "rgba(26,26,46,0.7)" }}>{s.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Install */}
        <SectionTitle id="install">Install in 4 steps</SectionTitle>
        <div style={{ display: "grid", gap: 14, marginBottom: 36 }}>
          <Step n={1} title="Make the avatar folder" code="mkdir -p ~/.codex/avatars/<your-pet-slug>" />
          <Step n={2} title="Drop the avatar.json"
            code='curl -o ~/.codex/avatars/<your-pet-slug>/avatar.json \
  "https://app.myaipet.ai/api/petclaw/codex-avatar?petId=<id>&format=json"'
            note="Generate the URL automatically from /sovereignty after picking a pet — sign in first."
          />
          <Step n={3} title="Add the spritesheet"
            code="cp my-pet-1536x1872.webp ~/.codex/avatars/<slug>/spritesheet.webp"
            note="Pixel art works best at 192×208 per frame. Transparent background recommended."
          />
          <Step n={4} title="Refresh Codex Desktop"
            code="# Codex → Settings → Avatar → Refresh"
            note="If it doesn't show up, validate JSON syntax and confirm the spritesheet is exactly 1536×1872."
          />
        </div>

        {/* Status protocol */}
        <SectionTitle>Status protocol (optional, for 24/7 mode)</SectionTitle>
        <p style={{ fontSize: 14, color: "rgba(26,26,46,0.65)", lineHeight: 1.6, marginBottom: 14 }}>
          If you run the *Claw agent in the background, write its current state to
          <code style={code}>~/.claw/status.json</code>. Any overlay bridge that reads
          it will animate the matching row of the spritesheet.
        </p>
        <pre style={pre}>{`{
  "state": "review",
  "summary": "Verifying overnight test runs",
  "updatedAt": "2026-05-06T15:30:00+09:00",
  "thread": "openclaw-daily-ops",
  "risk": "low"
}`}</pre>
        <p style={{ fontSize: 13, color: "rgba(26,26,46,0.55)", marginTop: 10 }}>
          Allowed <code style={code}>state</code> values:{" "}
          {STATES.map((s) => <code key={s.state} style={{ ...code, marginRight: 6 }}>{s.state}</code>)}
        </p>

        {/* Architecture link */}
        <div style={{
          marginTop: 44, padding: "20px 24px", borderRadius: 16,
          background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(192,132,252,0.06))",
          border: "1px solid rgba(245,158,11,0.2)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#b45309", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Heads up</div>
          <p style={{ margin: 0, fontSize: 14, color: "rgba(26,26,46,0.75)", lineHeight: 1.6 }}>
            Codex Avatar overlay reads <code style={code}>~/.codex/avatars/&lt;id&gt;/avatar.json</code> directly.
            For full 24/7 status sync we&apos;ll ship an overlay-bridge alongside the
            extension — until then the spritesheet animates manually based on
            interactions you trigger.
            See <a href="/architecture" style={{ color: "#b45309", textDecoration: "underline" }}>memory architecture</a>{" "}
            for how persona &amp; memory persist across surfaces.
          </p>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "12px 14px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "rgba(26,26,46,0.6)", letterSpacing: "0.06em", textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "11px 14px", verticalAlign: "top" };
const code: React.CSSProperties = { fontFamily: "'SF Mono', Consolas, monospace", fontSize: 12, padding: "2px 7px", borderRadius: 5, background: "rgba(0,0,0,0.05)", color: "#b45309" };
const pre: React.CSSProperties = { background: "#0f0f1a", color: "#f8f8f8", padding: "16px 20px", borderRadius: 12, fontFamily: "'SF Mono', Consolas, monospace", fontSize: 13, lineHeight: 1.6, overflowX: "auto", margin: 0 };

function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} style={{
      fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
      color: "rgba(26,26,46,0.5)", marginTop: 36, marginBottom: 16,
      scrollMarginTop: 80,
    }}>{children}</h2>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 32 }}>{children}</div>;
}

function Card({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{
      padding: 20, borderRadius: 16,
      background: "white", border: "1px solid rgba(0,0,0,0.06)",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", marginBottom: 6, letterSpacing: "-0.01em" }}>{title}</div>
      <div style={{ fontSize: 13, color: "rgba(26,26,46,0.6)", lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function SpecPill({ k, v }: { k: string; v: string }) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 10,
      background: "rgba(245,158,11,0.08)",
      border: "1px solid rgba(245,158,11,0.2)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(26,26,46,0.5)", marginBottom: 4 }}>{k}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#b45309", fontFamily: "monospace" }}>{v}</div>
    </div>
  );
}

function Step({ n, title, code: cmd, note }: { n: number; title: string; code: string; note?: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "44px 1fr", gap: 16,
      padding: 16, borderRadius: 14,
      background: "white", border: "1px solid rgba(0,0,0,0.06)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: "linear-gradient(135deg, #1a1a2e, #16213e)",
        color: "#fbbf24",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontWeight: 800,
      }}>{n}</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <pre style={{ ...pre, fontSize: 12 }}>{cmd}</pre>
        {note && <div style={{ fontSize: 12, color: "rgba(26,26,46,0.55)", marginTop: 8, lineHeight: 1.55 }}>{note}</div>}
      </div>
    </div>
  );
}

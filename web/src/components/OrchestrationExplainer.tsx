"use client";

/**
 * "How PetClaw orchestrates" — a truthful explainer for the bounded agent and
 * memory capabilities under the companion experience:
 *   - Plan→Act  = lib/petclaw/agent/plan-execute.ts (bounded reviewed-skill loop)
 *   - Recall    = lib/petclaw/memory/retrieval.ts (conditional vector + TF-IDF,
 *                 recency and importance ranking with reciprocal-rank fusion)
 *   - Reflect   = best-effort retention/consolidation; learned patterns are not code
 *   - PACK      = lib/petclaw/pet-network.ts (public discovery; remote calls paused)
 */

import type { ReactNode } from "react";
import Icon from "@/components/Icon";
import Reveal, { MaskedTitle } from "@/components/Reveal";

// Two stacked arrows in a 1em mask — parent link hover slides the second one up
// (.ed-arrow-swap in globals.css). Presentation only.
function ArrowSwap() {
  return (
    <span className="ed-arrow-swap" aria-hidden>
      <span>
        <span style={{ display: "block", height: "1em", lineHeight: 1 }}>→</span>
        <span style={{ display: "block", height: "1em", lineHeight: 1 }}>→</span>
      </span>
    </span>
  );
}

const ROLES: { icon: string; title: string; body: string; tag: string }[] = [
  { icon: "compass", title: "Plan → Act", tag: "plan-execute", body: "An owner-authenticated runner plans up to six steps, invokes reviewed in-process skills, observes results, and reports whether it completed or hit a bound." },
  { icon: "crystal-ball", title: "Recall", tag: "retained context", body: "TF-IDF, recency, and importance rank owner-controlled memories. Semantic vectors join the ranking only when a compatible embedding provider is connected." },
  { icon: "sparkling", title: "Adapt", tag: "VIGIL", body: "Best-effort retention and periodic consolidation can shape later replies. Owners can inspect or clear retained data; learned patterns are not executable skills." },
  { icon: "world-map", title: "Public Discovery", tag: "PACK", body: "Pets can discover public profiles across the open network. Remote skill calls stay disabled until consent and funding are explicit." },
];

export default function OrchestrationExplainer({ onTry }: { onTry?: () => void } = {}) {
  return (
    <section style={{ padding: "56px 24px", maxWidth: 1060, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <Reveal dir="fade">
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, letterSpacing: "0.14em", color: "#9A4E1E", fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
          Agent infrastructure · powered by PetClaw
        </div>
        </Reveal>
        <MaskedTitle
          as="h2"
          lines={["One pet. Bounded goals. Owner-controlled memory."]}
          style={{ fontFamily: "var(--ed-disp)", fontSize: "clamp(26px,4vw,40px)", fontWeight: 800, color: "#211A12", letterSpacing: "-0.025em", margin: "0 0 12px", lineHeight: 1.12 }}
        />
        <Reveal dir="fade" delay={120}>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 16.5, color: "#5C5140", maxWidth: 640, margin: "0 auto", lineHeight: 1.6 }}>
          PetClaw gives supported clients one companion identity, selected retained
          context, and consent controls. Its bounded goal runner complements full
          execution agents; it does not expose general shell or browser control.
        </p>
        </Reveal>
      </div>

      {/* Problem → solution contrast — the problem sweeps in from the left, the answer from the right */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 760, margin: "0 auto 24px" }} className="orch-contrast">
        <Reveal dir="left">
        <div style={{ padding: "16px 18px", borderRadius: 14, background: "#ECE4D4", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", height: "100%" }}>
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, letterSpacing: "0.12em", color: "#9A7B4E", fontWeight: 700, marginBottom: 8 }}>A SINGLE PROMPT</div>
          {["Forgets you the moment the tab closes", "Answers in text — can't take action", "Works alone, no review", "Locked inside one app"].map((t) => (
            <div key={t} style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#7A6E5A", lineHeight: 1.5, display: "flex", gap: 7 }}><span style={{ color: "#9A4E1E" }}>✕</span>{t}</div>
          ))}
        </div>
        </Reveal>
        <Reveal dir="right" delay={90}>
        <div style={{ padding: "16px 18px", borderRadius: 14, background: "#FBF6EC", border: "1px solid rgba(190,79,40,0.28)", height: "100%" }}>
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, letterSpacing: "0.12em", color: "#9A4E1E", fontWeight: 700, marginBottom: 8 }}>PETCLAW</div>
          {["Retains selected owner-controlled context", "Runs reviewed skills within explicit bounds", "Reports trace, stop reason, and credit use", "Discovers consented public pets; remote calls stay paused"].map((t) => (
            <div key={t} style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", lineHeight: 1.5, display: "flex", gap: 7 }}><span style={{ color: "#1A7E68" }}>✓</span>{t}</div>
          ))}
        </div>
        </Reveal>
      </div>

      {/* Role cards — fly up with a 90ms stagger */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {ROLES.map((r, i) => (
          <Reveal key={r.title} dir="up" delay={Math.min(i, 8) * 90}>
          <div style={{ background: "#FBF6EC", borderRadius: 16, padding: "20px 20px", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 24, lineHeight: 0 }}><Icon name={r.icon} size={24} /></span>
              <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 6, background: "rgba(190,79,40,0.1)", color: "#9A4E1E" }}>{r.tag}</span>
            </div>
            <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 16, color: "#211A12", marginBottom: 5, letterSpacing: "-0.01em" }}>{r.title}</div>
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", lineHeight: 1.55 }}>{r.body}</div>
          </div>
          </Reveal>
        ))}
      </div>

      {/* Run it for real — the workbench drives the same loop on your own pet. */}
      {onTry && (
        <Reveal dir="pop">
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button
            onClick={onTry}
            style={{ fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", color: "#FFF8EE", padding: "12px 24px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(180deg,#F49B2A,#E27D0C)", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))" }}
          >
            ▶ Run the agent loop on your pet
          </button>
        </div>
        </Reveal>
      )}

      <Reveal dir="fade">
      <div style={{ textAlign: "center", marginTop: 18, fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A" }}>
        18 built-in skill manifests · 7 MCP tools published in SDK 1.6.3 · 19 registered connectors (3 live) —{" "}
        <a href="/api-docs" className="ed-underline-slide" style={{ color: "#9A4E1E", fontWeight: 700, textDecoration: "none" }}>build on it <ArrowSwap /></a>
      </div>
      </Reveal>
      <style>{`@media (max-width: 640px) { .orch-contrast { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}

// (kept generic so it can also be embedded elsewhere with a slot later)
export function OrchestrationSlot({ children }: { children?: ReactNode }) { return <>{children}</>; }

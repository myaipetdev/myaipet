"use client";

/**
 * "How PetClaw orchestrates" — a Trinity-style explainer (problem → solution +
 * role cards) for the agent infrastructure under the cute pet. Every claim maps
 * to a real piece of the codebase (no fabrication):
 *   - Plan→Act  = lib/petclaw/agent/plan-execute.ts (reasoning model plans, a real
 *                 skill is invoked, observed, iterated, then a chat model synthesizes)
 *   - Recall    = lib/petclaw/memory/retrieval.ts (vector + BM25 + reciprocal-rank fusion)
 *   - Reflect   = lib/petclaw/memory/self-learning.ts (VIGIL consolidation / self-evolution)
 *   - A2A       = lib/petclaw/pet-network.ts (Pet-to-Pet agent-to-agent protocol, "PACK")
 */

import type { ReactNode } from "react";
import Icon from "@/components/Icon";

const ROLES: { icon: string; title: string; body: string; tag: string }[] = [
  { icon: "compass", title: "Plan → Act", tag: "plan-execute", body: "A reasoning model plans each step; a real skill runs it, the result is observed, and it loops until done — then synthesizes the answer. Not text, actions." },
  { icon: "crystal-ball", title: "Recall", tag: "GBrain", body: "Full-memory retrieval (vector + keyword + reciprocal-rank fusion) feeds every step. Your pet doesn't start cold — it remembers everything." },
  { icon: "sparkling", title: "Reflect", tag: "VIGIL", body: "It consolidates what it learned and reshapes future replies — self-evolution, not a frozen prompt." },
  { icon: "world-map", title: "Agent-to-Agent", tag: "PACK", body: "Pets discover and call each other's skills across the open network — agent-to-agent, not a silo." },
];

export default function OrchestrationExplainer({ onTry }: { onTry?: () => void } = {}) {
  return (
    <section style={{ padding: "56px 24px", maxWidth: 1060, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, letterSpacing: "0.14em", color: "#9A4E1E", fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
          Agent infrastructure · powered by PetClaw
        </div>
        <h2 style={{ fontFamily: "var(--ed-disp)", fontSize: "clamp(26px,4vw,40px)", fontWeight: 800, color: "#211A12", letterSpacing: "-0.025em", margin: "0 0 12px", lineHeight: 1.12 }}>
          One pet. A real agent loop. One memory.
        </h2>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 16.5, color: "#5C5140", maxWidth: 640, margin: "0 auto", lineHeight: 1.6 }}>
          A single prompt forgets you, can&apos;t act, and works alone. Your pet runs a
          coordinated loop instead — it plans, acts, recalls, reflects, and calls other
          pets, all on an open protocol.
        </p>
      </div>

      {/* Problem → solution contrast */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 760, margin: "0 auto 24px" }} className="orch-contrast">
        <div style={{ padding: "16px 18px", borderRadius: 14, background: "#ECE4D4", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))" }}>
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, letterSpacing: "0.12em", color: "#9A7B4E", fontWeight: 700, marginBottom: 8 }}>A SINGLE PROMPT</div>
          {["Forgets you the moment the tab closes", "Answers in text — can't take action", "Works alone, no review", "Locked inside one app"].map((t) => (
            <div key={t} style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#7A6E5A", lineHeight: 1.5, display: "flex", gap: 7 }}><span style={{ color: "#9A4E1E" }}>✕</span>{t}</div>
          ))}
        </div>
        <div style={{ padding: "16px 18px", borderRadius: 14, background: "#FBF6EC", border: "1px solid rgba(190,79,40,0.28)" }}>
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, letterSpacing: "0.12em", color: "#9A4E1E", fontWeight: 700, marginBottom: 8 }}>PETCLAW</div>
          {["Remembers across every session — it's yours", "Plans + runs real skills, then observes", "Reflects on itself and improves (VIGIL)", "Calls other pets on the open network (A2A)"].map((t) => (
            <div key={t} style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", lineHeight: 1.5, display: "flex", gap: 7 }}><span style={{ color: "#1A7E68" }}>✓</span>{t}</div>
          ))}
        </div>
      </div>

      {/* Role cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {ROLES.map((r) => (
          <div key={r.title} style={{ background: "#FBF6EC", borderRadius: 16, padding: "20px 20px", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 24, lineHeight: 0 }}><Icon name={r.icon} size={24} /></span>
              <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 6, background: "rgba(190,79,40,0.1)", color: "#9A4E1E" }}>{r.tag}</span>
            </div>
            <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 16, color: "#211A12", marginBottom: 5, letterSpacing: "-0.01em" }}>{r.title}</div>
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", lineHeight: 1.55 }}>{r.body}</div>
          </div>
        ))}
      </div>

      {/* Run it for real — the workbench drives the same loop on your own pet. */}
      {onTry && (
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button
            onClick={onTry}
            style={{ fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", color: "#FFF8EE", padding: "12px 24px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(180deg,#F49B2A,#E27D0C)", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))" }}
          >
            ▶ Run the agent loop on your pet
          </button>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 18, fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A" }}>
        18 skills · 6 MCP tools · 19 connectors · open SDK —{" "}
        <a href="/api-docs" style={{ color: "#9A4E1E", fontWeight: 700, textDecoration: "none" }}>build on it →</a>
      </div>
      <style>{`@media (max-width: 640px) { .orch-contrast { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}

// (kept generic so it can also be embedded elsewhere with a slot later)
export function OrchestrationSlot({ children }: { children?: ReactNode }) { return <>{children}</>; }

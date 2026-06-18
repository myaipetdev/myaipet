"use client";

/**
 * PetClaw preview — the data-sovereignty differentiator, shown to visitors BEFORE
 * the wallet wall. It's the strongest reason to care, so it should be the most
 * visible thing, not the most hidden. Showcases what sovereignty means + teases
 * the live (public) Pet Network with real nodes. The `cta` slot carries the gate's
 * connect/sign-in control.
 */

import { useEffect, useState, type ReactNode } from "react";

const PILLARS = [
  { icon: "📤", title: "Export your pet's soul", body: "Memories, personality, skills — as portable JSON. Take it anywhere, anytime." },
  { icon: "🗑", title: "Delete with proof", body: "Wipe everything and get a SHA-256 receipt. Real erasure you can verify." },
  { icon: "🔍", title: "See what we hold", body: "Every memory, fact, and connection we keep about your pet — in the open." },
  { icon: "🧬", title: "Inheritance", body: "Name a successor wallet. Your pet's soul outlives any single device." },
];

export default function PetClawPreview({ cta }: { cta?: ReactNode }) {
  const [net, setNet] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/petclaw/network/discover")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setNet(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const stats = net?.network || {};
  const online = (net?.nodes || []).filter((n: any) => n.status === "online").slice(0, 6);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "104px 20px 56px" }}>
      {/* Hero */}
      <div style={{
        borderRadius: 22, padding: "30px 28px", color: "#fff", position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, #14142a 0%, #2d1b69 60%, #4c1d95 100%)",
        boxShadow: "0 16px 48px rgba(20,20,42,0.3)",
      }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(circle at 86% 18%, rgba(168,85,247,0.28) 0%, transparent 55%)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.24em", color: "#c4b5fd", marginBottom: 12 }}>
            PETCLAW · DATA SOVEREIGNTY
          </div>
          <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 12px", lineHeight: 1.12 }}>
            Your pet. Your data.<br /><span style={{ color: "#fde68a" }}>Your rules.</span>
          </h1>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15.5, color: "rgba(255,255,255,0.82)", maxWidth: 520, margin: 0, lineHeight: 1.6 }}>
            Most AI forgets you the moment the tab closes — and owns whatever it learns. Here, your pet&apos;s memory is <strong style={{ color: "#fff" }}>yours</strong>: exportable, deletable, inheritable. Built on an open standard.
          </p>
        </div>
      </div>

      {/* Pillars */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
        {PILLARS.map((p) => (
          <div key={p.title} style={{
            background: "white", borderRadius: 16, padding: "18px 18px",
            border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>{p.icon}</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 15, color: "#1a1a2e", letterSpacing: "-0.01em" }}>{p.title}</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(26,26,46,0.6)", marginTop: 5, lineHeight: 1.5 }}>{p.body}</div>
          </div>
        ))}
      </div>

      {/* Live Pet Network (public, real) */}
      <div style={{ marginTop: 16, background: "linear-gradient(135deg, rgba(59,130,246,0.06), rgba(16,185,129,0.05))", borderRadius: 18, padding: "20px 22px", border: "1px solid rgba(59,130,246,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20 }}>🌐</span>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 18, color: "#1a1a2e" }}>Pet Network</span>
          <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: "0.08em", padding: "3px 10px", borderRadius: 999, background: "rgba(16,185,129,0.12)", color: "#059669" }}>LIVE · PUBLIC</span>
          <div style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#059669", fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px rgba(16,185,129,0.6)" }} />
            {stats.onlineNodes ?? 0} online
          </span>
        </div>
        {online.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(26,26,46,0.45)" }}>
            Loading the network…
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {online.map((n: any) => (
              <div key={n.petId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 12, background: "white", border: "1px solid rgba(0,0,0,0.05)" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#1a1a2e,#2d1b69)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                  {n.avatarUrl ? <img src={n.avatarUrl} alt={n.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🐾"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.name}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(26,26,46,0.5)", marginTop: 1 }}>
                    {[n.personality, n.element, n.level != null ? `Lv.${n.level}` : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#059669", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                  ⛨ {n.trustScore ?? 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ marginTop: 18, padding: "20px 22px", borderRadius: 18, textAlign: "center", background: "linear-gradient(135deg, #14142a, #2d1b69)", color: "#fff", boxShadow: "0 8px 28px rgba(20,20,42,0.28)" }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Adopt a pet to claim your sovereign space</div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 16 }}>
          Connect your wallet — no gas, identity only. Everything your pet learns stays yours.
        </div>
        <div style={{ display: "inline-block" }}>{cta}</div>
      </div>
    </div>
  );
}

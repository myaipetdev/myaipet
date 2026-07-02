"use client";

/**
 * PetClaw preview — the data-sovereignty differentiator, shown to visitors BEFORE
 * the wallet wall. It's the strongest reason to care, so it should be the most
 * visible thing, not the most hidden. Showcases what sovereignty means + teases
 * the live (public) Pet Network with real nodes. The `cta` slot carries the gate's
 * connect/sign-in control.
 */

import { useEffect, useState, type ReactNode } from "react";
import Icon from "@/components/Icon";

const PILLARS = [
  { icon: "scroll", title: "Export your pet's soul", body: "Memories, personality, skills — as portable JSON. Take it anywhere, anytime." },
  { icon: "fire", title: "Delete with proof", body: "Wipe everything and get a SHA-256 receipt. Real erasure you can verify." },
  { icon: "crystal-ball", title: "See what we hold", body: "Every memory, fact, and connection we keep about your pet — in the open." },
  { icon: "footprints", title: "Inheritance", body: "Name a successor wallet. Your pet's soul outlives any single device." },
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
  const onlineAll = (net?.nodes || []).filter((n: any) => n.status === "online");
  const online = onlineAll.slice(0, 8);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "104px 20px 56px" }}>
      {/* Hero */}
      <div style={{
        borderRadius: 22, padding: "30px 28px", color: "#FFF8EE", position: "relative", overflow: "hidden",
        background: "#211A12",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        <div style={{ position: "relative" }}>
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, letterSpacing: "0.14em", color: "#9A7B4E", marginBottom: 12 }}>
            PETCLAW · DATA SOVEREIGNTY
          </div>
          <h1 style={{ fontFamily: "var(--ed-disp)", fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 12px", lineHeight: 1.12 }}>
            Your pet. Your data.<br /><span style={{ color: "#F49B2A" }}>Your rules.</span>
          </h1>
          <p style={{ fontFamily: "var(--ed-body)", fontSize: 15.5, color: "rgba(255,248,238,0.82)", maxWidth: 520, margin: 0, lineHeight: 1.6 }}>
            Most AI forgets you the moment the tab closes — and owns whatever it learns. Here, your pet&apos;s memory is <strong style={{ color: "#FFF8EE" }}>yours</strong>: exportable, deletable, inheritable. Built on an open standard.
          </p>
        </div>
      </div>

      {/* Pillars */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
        {PILLARS.map((p) => (
          <div key={p.title} style={{
            background: "#FBF6EC", borderRadius: 16, padding: "18px 18px",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}><Icon name={p.icon} size={26} /></div>
            <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 15, color: "#211A12", letterSpacing: "-0.01em" }}>{p.title}</div>
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", marginTop: 5, lineHeight: 1.5 }}>{p.body}</div>
          </div>
        ))}
      </div>

      {/* Live Pet Network (public, real) */}
      <div style={{ marginTop: 16, background: "#F5EFE2", borderRadius: 18, padding: "20px 22px", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20 }}><Icon name="world-map" size={20} /></span>
          <span style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 18, color: "#211A12" }}>Pet Network</span>
          <span style={{ fontSize: 12, fontFamily: "var(--ed-m)", fontWeight: 700, letterSpacing: "0.08em", padding: "3px 10px", borderRadius: 999, background: "rgba(26,126,104,0.12)", color: "#1A7E68" }}>LIVE · PUBLIC</span>
          <div style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--ed-m)", fontSize: 12, color: "#1A7E68", fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1A7E68" }} />
            {onlineAll.length} online
          </span>
        </div>
        {online.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", fontFamily: "var(--ed-body)", fontSize: 13, color: "#9A7B4E" }}>
            Loading the network…
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {online.map((n: any) => (
              <div key={n.petId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 12, background: "#FBF6EC", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#211A12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                  {n.avatarUrl ? <img src={n.avatarUrl} alt={n.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="paw" size={20} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 700, fontSize: 14, color: "#211A12", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.name}</div>
                  <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A", marginTop: 1 }}>
                    {[n.personality, n.element, n.level != null ? `Lv.${n.level}` : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "rgba(26,126,104,0.1)", border: "1px solid rgba(26,126,104,0.25)", color: "#1A7E68", fontFamily: "var(--ed-m)", fontWeight: 700 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" />
                  </svg>
                  {n.trustScore ?? 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ marginTop: 18, padding: "20px 22px", borderRadius: 18, textAlign: "center", background: "#211A12", color: "#FFF8EE", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))" }}>
        <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Adopt a pet to claim your sovereign space</div>
        <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "rgba(255,248,238,0.7)", marginBottom: 16 }}>
          Connect your wallet — no gas, identity only. Everything your pet learns stays yours.
        </div>
        <div style={{ display: "inline-block" }}>{cta}</div>
      </div>
    </div>
  );
}

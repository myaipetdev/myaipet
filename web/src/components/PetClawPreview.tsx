"use client";

/**
 * PetClaw preview — the data-sovereignty differentiator, shown to visitors BEFORE
 * the wallet wall. It's the strongest reason to care, so it should be the most
 * visible thing, not the most hidden. Showcases what sovereignty means + teases
 * the live (public) Pet Network with real nodes. The `cta` slot carries the gate's
 * connect/sign-in control.
 *
 * IMPORTANT: this ALSO renders when a real owner's auth drops (token expiry /
 * signature refresh). The terracotta banner up top exists so that state reads as
 * "signed out — sign back in", not "the console vanished". Keep the banner first
 * and keep the `cta` inside it.
 *
 * Skin: Collectible Editorial — warm-dark #1E1710 + foil gold #E8C77E on dark,
 * paper #FBF6EC cards with mono eyebrows, inset #F5EFE2, type floor 13px.
 */

import { useEffect, useState, type ReactNode } from "react";
import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";
import { PETCLAW_EXTENSION_STEPS, PETCLAW_EXTENSION_VERSION } from "@/lib/petclaw-extension";

const PILLARS = [
  { icon: "scroll", eyebrow: "01 · EXPORT", title: "Export your pet's soul", body: "Memories, personality, skills — as portable JSON. Take it anywhere, anytime." },
  { icon: "fire", eyebrow: "02 · DELETE", title: "Delete with a receipt", body: "Wipe everything and get a signed SHA-256 receipt of exactly what was removed." },
  { icon: "crystal-ball", eyebrow: "03 · INSPECT", title: "See what we hold", body: "Every memory, fact, and connection we keep about your pet — in the open." },
  { icon: "footprints", eyebrow: "04 · INHERIT", title: "Pass it on", body: "Name a successor wallet. Your pet's soul outlives any single device." },
];

export default function PetClawPreview({ cta, ctaNote }: { cta?: ReactNode; ctaNote?: string }) {
  const [net, setNet] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/petclaw/network/discover")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setNet(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (window.location.hash !== "#petclaw-extension") return;
    const timer = window.setTimeout(() => {
      document.getElementById("petclaw-extension")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, []);

  const publicNodes = net?.nodes || [];
  const visibleNodes = publicNodes.slice(0, 8);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "104px 20px 56px" }}>
      {/* Signed-out banner — the way back. No Reveal: it must be visible instantly. */}
      {cta && (
        <div style={{
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
          background: "#BE4F28", borderRadius: 16, padding: "16px 20px", marginBottom: 16,
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        }}>
          <div style={{ flex: "1 1 280px", minWidth: 220 }}>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "#FCE9CF", marginBottom: 5 }}>
              PETCLAW CONSOLE
            </div>
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 14.5, lineHeight: 1.55, color: "#FFF8EE" }}>
              Sign in to open your PetClaw console, memory ledger and SOUL tools.
            </div>
            {ctaNote && (
              <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, lineHeight: 1.5, color: "#FCE9CF", marginTop: 5 }}>
                {ctaNote}
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>{cta}</div>
        </div>
      )}

      {/* Hero — sanctioned warm-dark tile, foil gold accents */}
      <Reveal dir="fade">
        <div style={{
          borderRadius: 22, padding: "30px 28px", color: "#FFF8EE", position: "relative", overflow: "hidden",
          background: "#1E1710",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        }}>
          <div style={{ position: "relative" }}>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "#E8C77E", marginBottom: 12 }}>
              PETCLAW · DATA SOVEREIGNTY
            </div>
            <h1 style={{ fontFamily: "var(--ed-disp)", fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 12px", lineHeight: 1.12 }}>
              Your pet. Your data.<br /><span style={{ color: "#E8C77E" }}>Your rules.</span>
            </h1>
            <p style={{ fontFamily: "var(--ed-body)", fontSize: 15.5, color: "rgba(255,248,238,0.82)", maxWidth: 520, margin: 0, lineHeight: 1.6 }}>
              Most AI forgets you the moment the tab closes — and owns whatever it learns. Here, your pet&apos;s memory is <strong style={{ color: "#FFF8EE" }}>yours</strong>: exportable, deletable, inheritable. Built on an open, exportable format.
            </p>
          </div>
        </div>
      </Reveal>

      {/* Pillars — paper cards, mono eyebrows, staggered fly-in */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 16 }}>
        {PILLARS.map((p, i) => (
          <Reveal key={p.title} dir="up" delay={i * 90} style={{ height: "100%" }}>
            <div style={{
              height: "100%", boxSizing: "border-box",
              background: "#FBF6EC", borderRadius: 16, padding: "18px 18px",
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
            }}>
              <div style={{ marginBottom: 9 }}><Icon name={p.icon} size={26} /></div>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "#9A7B4E", marginBottom: 4 }}>{p.eyebrow}</div>
              <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 15, color: "#211A12", letterSpacing: "-0.01em" }}>{p.title}</div>
              <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", marginTop: 5, lineHeight: 1.5 }}>{p.body}</div>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Installation is public documentation. Pairing a real pet requires
          sign-in, but nobody should have to connect a wallet just to learn how
          the extension works or download the exact reviewed ZIP. */}
      <Reveal dir="up">
        <section
          id="petclaw-extension"
          aria-labelledby="petclaw-extension-title"
          style={{
            scrollMarginTop: 88, marginTop: 18, padding: "22px",
            background: "#FBF6EC", borderRadius: 18,
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <Icon name="extension-icon" size={22} />
            <h2 id="petclaw-extension-title" style={{ margin: 0, fontFamily: "var(--ed-disp)", fontSize: 22, color: "#211A12" }}>
              Install the PetClaw Desktop Companion
            </h2>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: "#9A4E1E" }}>
              v{PETCLAW_EXTENSION_VERSION} · CHROME
            </span>
          </div>
          <p style={{ margin: "0 0 14px", fontFamily: "var(--ed-body)", fontSize: 14, lineHeight: 1.6, color: "#5C5140" }}>
            Install first, then pair your pet after signing in. PetClaw runs only on sites you explicitly allow.
            MY AI PET, private/local network addresses, and common sensitive domains are blocked. Page summaries
            show the exact excerpt and require a second confirmation before anything is sent.
          </p>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))", gap: 10 }}>
            {PETCLAW_EXTENSION_STEPS.map((step) => (
              <li key={step.n} style={{ padding: 12, borderRadius: 12, background: "#F5EFE2", border: "1px solid rgba(33,26,18,.1)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#BE4F28", color: "#FFF8EE", fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700 }}>{step.n}</span>
                  <strong style={{ fontFamily: "var(--ed-disp)", fontSize: 14, color: "#211A12" }}>{step.title}</strong>
                </div>
                <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, lineHeight: 1.5, color: "#5C5140" }}>{step.desc}</div>
              </li>
            ))}
          </ol>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
            <a href="/petclaw-extension.zip" download="myaipet-extension.zip" style={{ display: "inline-flex", alignItems: "center", padding: "11px 20px", borderRadius: 12, background: "#BE4F28", color: "#FFF8EE", textDecoration: "none", fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 800 }}>
              Download Extension
            </a>
            <span style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#7A6E5A" }}>
              Developer / unpacked install · not yet on the Chrome Web Store
            </span>
          </div>
        </section>
      </Reveal>

      {/* Live Pet Network (public, real) */}
      <Reveal dir="up">
        <div style={{ marginTop: 16, background: "#F5EFE2", borderRadius: 18, padding: "20px 22px", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <Icon name="world-map" size={20} />
            <span style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 18, color: "#211A12" }}>Pet Network</span>
            <span style={{ fontSize: 13, fontFamily: "var(--ed-m)", fontWeight: 700, letterSpacing: "0.08em", padding: "3px 10px", borderRadius: 999, background: "rgba(26,126,104,0.12)", color: "#1A7E68" }}>PUBLIC DISCOVERY</span>
            <div style={{ flex: 1 }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--ed-m)", fontSize: 13, color: "#1A7E68", fontWeight: 700 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1A7E68" }} />
              {publicNodes.length} public
            </span>
          </div>
          {visibleNodes.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", fontFamily: "var(--ed-body)", fontSize: 13, color: "#9A7B4E" }}>
              No public pets yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {visibleNodes.map((n: any) => (
                <div key={n.petId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 12, background: "#FBF6EC", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#1E1710", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {n.avatarUrl ? <img src={n.avatarUrl} alt={n.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="paw" size={20} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 700, fontSize: 14, color: "#211A12", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.name}</div>
                    <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A", marginTop: 1 }}>
                      {[n.personality, n.element, n.level != null ? `Lv.${n.level}` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, padding: "4px 10px", borderRadius: 999, background: "rgba(26,126,104,0.1)", border: "1px solid rgba(26,126,104,0.25)", color: "#1A7E68", fontFamily: "var(--ed-m)", fontWeight: 700 }}>
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
      </Reveal>

      {/* Closing CTA — same warm-dark tile; the cta repeats here so the flow ends on an action */}
      <Reveal dir="up">
        <div style={{ marginTop: 18, padding: "20px 22px", borderRadius: 18, textAlign: "center", background: "#1E1710", color: "#FFF8EE", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))" }}>
          <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Adopt a pet to claim <span style={{ color: "#E8C77E" }}>your sovereign space</span></div>
          <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "rgba(255,248,238,0.7)", marginBottom: 16 }}>
            Connect your wallet — no gas, identity only. Everything your pet learns stays yours.
          </div>
          <div style={{ display: "inline-block" }}>{cta}</div>
        </div>
      </Reveal>
    </div>
  );
}

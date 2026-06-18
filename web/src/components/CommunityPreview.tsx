"use client";

/**
 * Community preview — a live gallery of real creations for no-wallet visitors.
 * Stats + featured pets already render above (public); this adds the actual ART
 * so the place visibly breathes before the sign-in ask. Read-only: the `cta`
 * slot carries the gate's connect/sign-in control.
 */

import { useEffect, useState, type ReactNode } from "react";

interface Item { id: number; url: string; isVideo: boolean; likes: number; }

export default function CommunityPreview({ cta }: { cta?: ReactNode }) {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/community/showcase?limit=12")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setItems(Array.isArray(d?.items) ? d.items : []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "8px 20px 56px" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", color: "#b45309", fontWeight: 700, marginBottom: 6 }}>
          FRESH FROM THE COMMUNITY
        </div>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.02em", margin: "0 0 4px" }}>
          See what the pets are making
        </h2>
        <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: "rgba(26,26,46,0.55)", margin: 0 }}>
          Real creations, made by real people raising real pets. Peek in — then make your own.
        </p>
      </div>

      {items === null ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(26,26,46,0.4)", fontFamily: "'Space Grotesk',sans-serif" }}>Loading the gallery…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 20px", borderRadius: 16, border: "1px dashed rgba(0,0,0,0.1)", color: "rgba(26,26,46,0.5)", fontFamily: "'Space Grotesk',sans-serif", fontSize: 14 }}>
          The gallery is just getting started — be the first to create.
        </div>
      ) : (
        <div style={{ columnCount: 3, columnGap: 12 }} className="community-masonry">
          <style>{`
            @media (max-width: 760px) { .community-masonry { column-count: 2 !important; } }
            .cp-tile { break-inside: avoid; margin-bottom: 12px; border-radius: 14px; overflow: hidden; position: relative; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 2px 10px rgba(0,0,0,0.05); transition: transform 180ms ease, box-shadow 180ms ease; }
            .cp-tile:hover { transform: translateY(-3px); box-shadow: 0 14px 32px rgba(0,0,0,0.12); }
          `}</style>
          {items.map((it) => (
            <div key={it.id} className="cp-tile">
              {it.isVideo
                ? <video src={it.url} muted loop playsInline autoPlay style={{ width: "100%", display: "block" }} />
                : <img src={it.url} alt="creation" loading="lazy" style={{ width: "100%", display: "block" }} />}
              {it.likes > 0 && (
                <div style={{
                  position: "absolute", bottom: 8, left: 8,
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "rgba(0,0,0,0.55)", color: "#fff", borderRadius: 999, padding: "3px 9px",
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700, backdropFilter: "blur(4px)",
                }}>
                  <span style={{ color: "#f472b6" }}>♥</span> {it.likes}
                </div>
              )}
              {it.isVideo && (
                <div style={{ position: "absolute", top: 8, right: 8, fontSize: 12, background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: 8, padding: "2px 7px", fontFamily: "'JetBrains Mono', monospace" }}>▶</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <div style={{ marginTop: 22, padding: "20px 22px", borderRadius: 18, textAlign: "center", background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff", boxShadow: "0 8px 28px rgba(245,158,11,0.3)" }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Like, comment &amp; post your own</div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>
          Connect your wallet — no gas, identity only. Join the pets.
        </div>
        <div style={{ display: "inline-block" }}>{cta}</div>
      </div>
    </div>
  );
}

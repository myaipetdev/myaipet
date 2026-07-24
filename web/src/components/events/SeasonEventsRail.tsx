"use client";

/**
 * SeasonEventsRail — compact Collectible Editorial rail of season-event
 * poster cards, driven entirely by lib/seasonEvents.ts (the one honest
 * registry). Self-contained: mount anywhere, no props required.
 *
 * Honesty rules baked in:
 *   - state badges (wax seals) are ACTIVE / OPENS SOON / ENDED — never a
 *     fabricated live event;
 *   - reward lines come from the registry, which only claims server-paid
 *     values (or a real non-point prize);
 *   - no season dates/countdowns; the header stays quiet — the SeasonBanner
 *     above is the single season-phase announcer (dedupe, founder feedback).
 *
 * Best in Show state is resolved against the REAL pet pool
 * (GET /api/worldcup/bracket) — until confirmed open it shows the honest
 * "opens at 4 public pets" gate poster.
 */

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { getSeasonEvents, type SeasonEvent, type SeasonEventState } from "@/lib/seasonEvents";

// ── Collectible Editorial tokens ──
const T = {
  field: "#ECE4D4", paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12",
  muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", terraSub: "#9A4E1E", gold: "#C8932F", creamOn: "#FCE9CF",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
  shadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
};

const SEAL: Record<SeasonEventState, { bg: string; label: string }> = {
  active: { bg: T.terra, label: "ACTIVE" },
  "opens-soon": { bg: T.gold, label: "OPENS SOON" },
  ended: { bg: "#7A6E5A", label: "ENDED" },
};

/** Wax-seal state badge — pressed-wax pill: hard offset shadow, cream ring. */
function WaxSeal({ state }: { state: SeasonEventState }) {
  const s = SEAL[state];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        padding: "5px 11px", borderRadius: 999,
        background: `radial-gradient(circle at 32% 28%, rgba(255,248,238,.28), rgba(33,26,18,.12) 78%), ${s.bg}`,
        color: T.creamOn, transform: "rotate(-4deg)",
        boxShadow: "0 2px 0 rgba(33,26,18,.4), inset 0 0 0 1.5px rgba(252,233,207,.5)",
        fontFamily: T.m, fontSize: 13, fontWeight: 800, letterSpacing: ".12em",
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}


function PosterCard({ ev }: { ev: SeasonEvent }) {
  const ended = ev.state === "ended";
  return (
    <a
      href={ended ? undefined : ev.href}
      aria-disabled={ended || undefined}
      className={`ser-card${ended ? " ser-card--ended" : ""}`}
      style={{
        position: "relative", display: "flex", flexDirection: "column",
        flex: "0 0 250px", minHeight: 208, padding: "16px 16px 14px",
        borderRadius: 16, textDecoration: "none",
        background: T.paper, border: `1px solid ${T.hair}`,
        boxShadow: T.shadow,
        filter: ended ? "grayscale(.55)" : "none",
        opacity: ended ? 0.72 : 1,
        cursor: ended ? "default" : "pointer",
        transition: "transform .18s ease, box-shadow .18s ease",
      }}
    >
      {/* Wax seal — top right, overhanging like a stamp on a poster */}
      <div style={{ position: "absolute", top: -9, right: 12 }}>
        <WaxSeal state={ev.state} />
      </div>

      {/* Poster mark */}
      <div
        style={{
          width: 44, height: 44, borderRadius: 12, marginBottom: 10,
          background: T.inset, border: `1px solid ${T.hair}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "2px 2px 0 rgba(33,26,18,.1)",
        }}
      >
        <Icon name={ev.icon} size={26} />
      </div>

      {/* Eyebrow + title */}
      <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: T.mono, textTransform: "uppercase", marginBottom: 3 }}>
        {ev.cadence}
      </div>
      <div style={{ fontFamily: T.disp, fontSize: 19, fontWeight: 800, color: T.ink, letterSpacing: "-.02em", lineHeight: 1.1, marginBottom: 7 }}>
        {ev.title}
      </div>

      {/* Highlight chip (weekly spotlight / gate condition) */}
      {ev.chip && (
        <span
          style={{
            alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6,
            fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em",
            color: T.terraSub, background: "rgba(190,79,40,.08)",
            border: "1px solid rgba(190,79,40,.24)", borderRadius: 999,
            padding: "3px 9px", marginBottom: 8, textTransform: "uppercase",
          }}
        >
          <Icon name={ev.chip.icon} size={13} /> {ev.chip.label}
        </span>
      )}

      {/* Blurb */}
      <p style={{ fontFamily: T.body, fontSize: 13, color: T.muted2, lineHeight: 1.5, margin: 0 }}>
        {ev.blurb}
      </p>

      {/* Spacer pins the reward + CTA rows to a shared baseline across cards */}
      <div style={{ flex: 1, minHeight: 8 }} />

      {/* Honest reward strip — only rendered when the registry claims one */}
      {ev.reward && (
        <div
          style={{
            display: "flex", alignItems: "flex-start", gap: 6, marginTop: 10, minHeight: 38,
            paddingTop: 9, borderTop: `1px dashed ${T.hair}`,
            fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".04em",
            color: T.gold, textTransform: "uppercase", lineHeight: 1.45,
          }}
        >
          <Icon name="coin" size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{ev.reward}</span>
        </div>
      )}

      {/* CTA */}
      {!ended && (
        <div style={{ marginTop: 9, fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: T.terra, textTransform: "uppercase" }}>
          {ev.state === "opens-soon" ? "See the gate ▸" : "Open ▸"}
        </div>
      )}
    </a>
  );
}

export default function SeasonEventsRail() {
  // Resolve Best in Show against the real pet pool. Honest default: gated.
  const [bestInShowOpen, setBestInShowOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/worldcup/bracket?size=4")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((d) => {
        if (!cancelled && Array.isArray(d?.pets) && d.pets.length >= 4) setBestInShowOpen(true);
      })
      .catch(() => { /* keep the honest gated poster */ });
    return () => { cancelled = true; };
  }, []);

  const events = getSeasonEvents({ bestInShowOpen });

  return (
    <section className="ser-section" aria-label="Season events" style={{ fontFamily: T.body, color: T.ink }}>
      <style>{`
        .ser-section{
          width:min(1060px,calc(100% - 80px));
          min-width:0;
          margin-inline:auto;
        }
        .ser-card{
          width:100%;
          min-width:0;
          height:100%;
        }
        .ser-card:not(.ser-card--ended):hover{
          transform:translateY(-3px);
          box-shadow:0 26px 46px -24px rgba(80,55,20,.55);
        }
        .ser-rail{
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          align-items:stretch;
          gap:14px;
          min-width:0;
          padding:12px 2px 6px;
        }
        @media (max-width:960px){
          .ser-rail{grid-template-columns:repeat(2,minmax(0,1fr))}
        }
        @media (max-width:640px){
          .ser-section{
            width:100%;
            padding-inline:16px;
          }
          .ser-rail{
            grid-template-columns:minmax(0,1fr);
            padding-inline:0;
          }
        }
        @media (prefers-reduced-motion:reduce){
          .ser-card:not(.ser-card--ended):hover{transform:none}
        }
      `}</style>

      {/* Header — deliberately quiet: the SeasonBanner above already announces
          the season phase; repeating "SEASON 1 · STARTING SOON" here read as
          duplication (founder feedback). */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", paddingLeft: 2 }}>
        <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".18em", color: T.terraSub, textTransform: "uppercase" }}>
          Season Events
        </span>
      </div>

      {/* Poster rail */}
      <div className="ser-rail">
        {events.map((ev) => (
          <PosterCard key={ev.key} ev={ev} />
        ))}
      </div>
    </section>
  );
}

"use client";

/**
 * No-wallet demo pet — the funnel fix. A cold visitor who clicks "Adopt" used to
 * hit a wallet wall before feeling anything. Now they meet a living pet they can
 * feed/play/pet (real reactions, no backend), see it remember their care, and
 * THEN get the adopt CTA. Conveys the core "it's alive + remembers me" promise
 * before asking for a wallet.
 *
 * v2 (launch polish): Collectible Editorial treatment — specimen-poster frame,
 * staggered scroll reveal (eyebrow → title → poster → bars filling one by one →
 * buttons → memory → CTA), on-system colors, a bond milestone where the frame
 * earns its gold foil edge. Fully client-side + ephemeral — no API, no
 * persistence. The `cta` slot carries whatever sign-in control the gate wants.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "@/components/Icon";
import { SEASON_SCHEDULED, seasonPhase } from "@/lib/season";

// Real signed-in reward values (verified against the server: interact pays 5 pts
// per free care via awardPointsCapped, chat pays 2 pts per message, a completed
// creation pays 10 pts). The demo can't bank points — it only shows, honestly
// labeled, what the same actions pay once signed in.
const PTS_PER_CARE = 5;

const NAME = "Dordor";
const clamp = (n: number) => Math.max(0, Math.min(100, n));

const INK = "#211A12";
const MUTED = "#7A6E5A";
const TERRA = "#BE4F28";
const GOLD = "#C8932F";
const PURPLE = "#6B4FA0";
const PAPER = "#FBF6EC";
const FIELD = "#ECE4D4";
const HAIR = "var(--ed-hair, rgba(33,26,18,.13))";
const SHADOW = "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))";

type CareType = "feed" | "play" | "pet";
const CARE: Record<CareType, { label: string; icon: ReactNode; burst: string; anim: string; happiness: number; energy: number; hunger: number; bond: number; mem: string }> = {
  feed: { label: "Feed", icon: <Icon name="chicken" size={18} />, burst: "🍖", anim: "dpBounce", happiness: 6,  energy: 3,   hunger: -22, bond: 1, mem: `You fed ${NAME}` },
  play: { label: "Play", icon: <Icon name="joystick" size={18} />, burst: "🎉", anim: "dpBounce", happiness: 13, energy: -12, hunger: 8,   bond: 2, mem: `You played with ${NAME}` },
  pet:  { label: "Pet",  icon: <Icon name="paw" size={18} />, burst: "💖", anim: "dpWiggle", happiness: 9,  energy: 4,   hunger: 2,   bond: 4, mem: `You pet ${NAME}` },
};

const BOND_TRUST = 22; // demo milestone: the frame earns its foil edge

// Rotating in-character reaction lines — pure demo flavor (the real pet's lines
// come from the server on every care).
const SAY: Record<CareType, string[]> = {
  feed: [
    `${NAME} gobbles it up — tail at maximum wag.`,
    "Crunch crunch. Zero crumbs survive.",
    `${NAME} licks the bowl, then looks up for seconds.`,
  ],
  play: [
    `${NAME} does three victory laps around you.`,
    "Zoomies engaged. Happiness rising.",
    `${NAME} pounces the toy like it owes them treats.`,
  ],
  pet: [
    `${NAME} melts into your hand.`,
    "Little sigh. Total bliss.",
    `${NAME} leans in for one more scritch.`,
  ],
};

export default function DemoPet({ cta, ctaNote }: { cta?: ReactNode; ctaNote?: string }) {
  const [stats, setStats] = useState({ happiness: 58, energy: 66, hunger: 45, bond: 14 });
  const [react, setReact] = useState<{ anim: string; burst: string; n: number } | null>(null);
  const [pops, setPops] = useState<Array<{ id: number; text: string; color: string; chip?: boolean }>>([]);
  const [memory, setMemory] = useState<string[]>([]);
  const [cares, setCares] = useState(0);
  const [say, setSay] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [barsLive, setBarsLive] = useState(false); // bars fill AFTER their reveal lands
  const rootRef = useRef<HTMLDivElement>(null);

  // staggered scroll reveal — everything hides until the section enters the viewport
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setRevealed(true); setBarsLive(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setRevealed(true);
        setTimeout(() => setBarsLive(true), 1050); // after the bar rows slid in
        io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const trusted = stats.bond >= BOND_TRUST;
  const moodEmote = stats.happiness >= 85 ? "✨" : stats.happiness >= 55 ? "💖" : stats.hunger >= 75 ? "🍖" : "·";
  // Season context — no dates/countdowns while Season 1 is unscheduled.
  const phase = SEASON_SCHEDULED ? seasonPhase() : "upcoming";
  const seasonNote = phase === "live" ? "SEASON 1 · LIVE" : phase === "ended" ? "SEASON 1 · ENDED" : "SEASON 1 · STARTING SOON";

  const care = (type: CareType) => {
    const fx = CARE[type];
    const before = stats.bond;
    setStats((s) => ({
      happiness: clamp(s.happiness + fx.happiness),
      energy: clamp(s.energy + fx.energy),
      hunger: clamp(s.hunger + fx.hunger),
      bond: clamp(s.bond + fx.bond),
    }));
    setReact({ anim: fx.anim, burst: fx.burst, n: Date.now() });
    setTimeout(() => setReact(null), 900);
    const crossed = before < BOND_TRUST && clamp(before + fx.bond) >= BOND_TRUST;
    // The pop shows the WOULD-BE reward: +5 pts is the real signed-in grant per
    // free care; the running caption below the buttons carries the "not banked
    // in demo" honesty so the pop itself can stay a clean sticker.
    const pop = crossed
      ? { id: Date.now(), text: `${NAME} trusts you 💛`, color: GOLD }
      : { id: Date.now(), text: `+${PTS_PER_CARE} PTS`, color: "#9A4E1E", chip: true };
    setPops((p) => [...p, pop]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== pop.id)), crossed ? 2200 : 1500);
    setMemory((m) => [fx.mem, ...m].slice(0, 3));
    setSay(SAY[type][cares % SAY[type].length]); // rotate through in-character lines
    setCares((c) => c + 1);
  };

  // reveal helper: hidden → rise, with per-block delay
  const rv = (order: number): React.CSSProperties => ({
    opacity: revealed ? 1 : 0,
    transform: revealed ? "none" : "translateY(22px)",
    transition: `opacity .6s cubic-bezier(.22,.9,.3,1) ${order * 0.12}s, transform .6s cubic-bezier(.22,.9,.3,1) ${order * 0.12}s`,
  });

  return (
    <div ref={rootRef} style={{ maxWidth: 1020, margin: "0 auto", padding: "120px 24px 56px", textAlign: "center" }}>
      <style>{`
        @keyframes dpBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
        @keyframes dpFloat { 0%,100% { transform: translateY(0) rotate(-1.2deg); } 50% { transform: translateY(-7px) rotate(-1.2deg); } }
        @keyframes dpBounce { 0%{transform:translateY(0) scale(1) rotate(-1.2deg);} 30%{transform:translateY(-13px) scale(1.07) rotate(-1.2deg);} 60%{transform:translateY(0) scale(0.96) rotate(-1.2deg);} 100%{transform:translateY(0) scale(1) rotate(-1.2deg);} }
        @keyframes dpWiggle { 0%,100%{transform:rotate(-1.2deg);} 20%{transform:rotate(-9deg);} 60%{transform:rotate(7deg);} 85%{transform:rotate(-4deg);} }
        @keyframes dpBurst { 0%{opacity:0;transform:translateX(-50%) translateY(0) scale(0.3);} 30%{opacity:1;transform:translateX(-50%) translateY(-14px) scale(1.3);} 100%{opacity:0;transform:translateX(-50%) translateY(-44px) scale(1);} }
        @keyframes dpDrift { 0%{opacity:0;transform:translateY(2px) scale(0.5);} 25%{opacity:1;transform:translateY(-10px) scale(1);} 80%{opacity:0.85;transform:translateY(-26px) scale(1);} 100%{opacity:0;transform:translateY(-42px) scale(0.8);} }
        @keyframes dpPop { 0%{opacity:0;transform:translateY(8px) scale(0.7);} 25%{opacity:1;transform:translateY(-4px) scale(1.1);} 100%{opacity:0;transform:translateY(-40px) scale(0.9);} }
        @keyframes dpRing { 0%{opacity:.8;transform:scale(.6);} 100%{opacity:0;transform:scale(1.65);} }
        @keyframes dpSeal { 0%{transform:scale(0) rotate(-30deg);} 60%{transform:scale(1.25) rotate(6deg);} 100%{transform:scale(1) rotate(0);} }
        .dp-care { transition: transform .18s cubic-bezier(.22,.9,.3,1), box-shadow .18s ease; }
        .dp-care:hover { transform: translateY(-3px); box-shadow: 0 10px 22px -12px rgba(80,55,20,.45); }
        .dp-care:active { transform: translateY(0) scale(.96); }
        /* Wide screens: poster+care left, memory/missions/CTA right — mirrors
           TourMyPet's two-column rhythm so guests don't get a lone 460px strip. */
        .dp-cols { display: grid; grid-template-columns: 1fr; gap: 0 48px; }
        @media (min-width: 900px) {
          .dp-cols { grid-template-columns: 460px 1fr; align-items: start; text-align: left; }
          .dp-side { position: sticky; top: 110px; }
          .dp-side > div { max-width: 440px !important; }
        }
      `}</style>

      <div style={{ ...rv(0), fontFamily: "var(--ed-m)", fontSize: 13, letterSpacing: "0.18em", color: "#9A4E1E", fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>
        TRY IT — NO WALLET NEEDED
      </div>
      <h2 style={{ ...rv(1), fontFamily: "var(--ed-disp)", fontSize: 30, fontWeight: 800, color: INK, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
        Meet {NAME} 👋
      </h2>
      <p style={{ ...rv(1), fontFamily: "var(--ed-body)", fontSize: 14.5, color: MUTED, margin: "0 auto 34px", maxWidth: 320, lineHeight: 1.6 }}>
        Care for them and watch them respond. This one&apos;s a demo — adopt to start your own.
      </p>

      <div className="dp-cols">
      <div style={{ textAlign: "center" }}>
      {/* ── Specimen poster (die-cut collectible frame) ── */}
      <div style={{ ...rv(2), position: "relative", display: "inline-block", marginBottom: 36 }}>
        {pops.map((p, i) => (
          <div key={p.id} style={{
            position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
            zIndex: 11, pointerEvents: "none", whiteSpace: "nowrap",
            animation: "dpPop 1.6s ease-out forwards", marginLeft: i * 4,
            ...(p.chip
              ? { // die-cut sticker chip — editorial, hard offset shadow, no glow
                  fontFamily: "var(--ed-m)", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", color: p.color,
                  background: PAPER, border: "1px solid rgba(154,123,78,.5)", borderRadius: 8, padding: "3px 8px",
                  boxShadow: "3px 4px 0 rgba(33,26,18,.15)",
                }
              : {
                  fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 17, color: p.color,
                  textShadow: "0 2px 8px rgba(252,246,236,0.9)",
                }),
          }}>{p.text}</div>
        ))}
        {moodEmote !== "·" && (
          <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", zIndex: 9, pointerEvents: "none" }}>
            <div style={{ fontSize: 24, animation: "dpDrift 2.4s ease-out infinite" }}>{moodEmote}</div>
          </div>
        )}
        {react && (
          <>
            <div style={{ position: "absolute", top: -8, left: "50%", fontSize: 44, zIndex: 12, pointerEvents: "none", animation: "dpBurst 0.9s ease-out forwards" }}>
              {react.burst}
            </div>
            <div style={{ position: "absolute", inset: -6, borderRadius: 30, border: `2px solid ${trusted ? GOLD : TERRA}`, pointerEvents: "none", animation: "dpRing .7s ease-out forwards" }} />
          </>
        )}

        <button
          type="button"
          onClick={() => care("pet")}
          aria-label={`Boop ${NAME}`}
          title={`Boop ${NAME}`}
          style={{
            width: 216, padding: "12px 12px 14px", cursor: "pointer", background: PAPER,
            border: trusted ? `2px solid ${GOLD}` : `1px solid ${HAIR}`,
            borderRadius: 22, boxShadow: trusted ? `6px 8px 0 rgba(200,147,47,.28), ${SHADOW}` : `6px 8px 0 rgba(33,26,18,.12)`,
            animation: react ? `${react.anim} 0.85s ease-in-out` : "dpFloat 6s ease-in-out infinite",
            transition: "border-color .5s ease, box-shadow .5s ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "var(--ed-m)", fontSize: 13, letterSpacing: "0.12em", color: MUTED, padding: "0 3px 8px" }}>
            <span>COMPANION</span><span>FILE №0742</span>
          </div>
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#F5EFE2" }}>
            <img src="/mascot.jpg" alt={NAME} style={{ width: "100%", display: "block", aspectRatio: "1/1", objectFit: "cover", animation: "dpBreathe 3.4s ease-in-out infinite" }} />
            {trusted && (
              <div style={{ position: "absolute", right: 8, bottom: 8, width: 34, height: 34, borderRadius: "50%", background: `radial-gradient(circle at 32% 30%, #E8C77E, ${GOLD})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px -3px rgba(80,55,20,.55)", animation: "dpSeal .6s cubic-bezier(.2,1.5,.4,1) both" }}>
                <span style={{ fontSize: 15 }}>💛</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 3px 0" }}>
            <span style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 19, color: INK, letterSpacing: "-0.01em" }}>{NAME}</span>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, letterSpacing: "0.1em", color: MUTED }}>POMERANIAN · ✦</span>
          </div>
        </button>
      </div>

      {/* ── Reaction line — rotating, in-character (fixed height, no shift) ── */}
      <div aria-live="polite" style={{ minHeight: 22, margin: "-14px auto 20px", maxWidth: 320, fontFamily: "var(--ed-body)", fontSize: 13, fontStyle: "italic", color: "#5C5140", lineHeight: 1.5 }}>
        {say ?? ""}
      </div>

      {/* ── Vitals (fill animates on reveal) ── */}
      <div style={{ maxWidth: 320, margin: "0 auto 30px", display: "flex", flexDirection: "column", gap: 13 }}>
        {([
          { k: "happiness", label: "Happy", icon: "heart", color: TERRA, order: 3 },
          { k: "energy", label: "Energy", icon: "electric", color: GOLD, order: 4 },
          { k: "bond", label: "Bond", icon: "paw", color: PURPLE, order: 5 },
        ] as const).map((row) => (
          <div key={row.k} style={rv(row.order)}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--ed-m)", fontSize: 13, color: MUTED, marginBottom: 5 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name={row.icon} size={13} /> {row.label}</span>
              <span style={{ color: INK, fontWeight: 700 }}>{Math.round((stats as any)[row.k])}</span>
            </div>
            <div style={{ height: 8, background: FIELD, borderRadius: 5, overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(33,26,18,.08)" }}>
              <div style={{
                height: "100%", width: barsLive ? `${(stats as any)[row.k]}%` : "0%",
                background: `linear-gradient(90deg, ${row.color}, ${row.color}CC)`, borderRadius: 5,
                transition: "width .9s cubic-bezier(.22,.9,.3,1)",
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Care buttons ── */}
      <div style={{ ...rv(6), display: "flex", gap: 10, justifyContent: "center", marginBottom: 10 }}>
        {(Object.keys(CARE) as CareType[]).map((k) => (
          <button key={k} onClick={() => care(k)} className="dp-care" style={{
            padding: "11px 20px", borderRadius: 13, border: `1px solid ${HAIR}`, background: PAPER,
            cursor: "pointer", fontFamily: "var(--ed-disp)", fontWeight: 700, fontSize: 14, color: INK,
            display: "flex", alignItems: "center", gap: 7, boxShadow: "3px 4px 0 rgba(33,26,18,.08)",
          }}>
            <span style={{ fontSize: 16, display: "inline-flex" }}>{CARE[k].icon}</span>{CARE[k].label}
          </button>
        ))}
      </div>

      {/* ── Would-be reward honesty: the demo banks nothing; signed-in raisers
             really do get +5 pts per free care (server-verified). ── */}
      <div style={{ ...rv(6), fontFamily: "var(--ed-m)", fontSize: 13, letterSpacing: "0.06em", color: MUTED, margin: "0 auto 26px", maxWidth: 330, lineHeight: 1.6 }}>
        {cares > 0
          ? <>+{cares * PTS_PER_CARE} PTS would be banked by now — demo care isn&apos;t saved. Sign in: every free care pays +{PTS_PER_CARE} pts.</>
          : <>Each care here would pay +{PTS_PER_CARE} pts — sign in to bank points.</>}
      </div>
      </div>

      <div className="dp-side">
      {/* ── Memory ticker — the "it remembers" moat ── */}
      <div style={{
        ...rv(7),
        maxWidth: 320, margin: "0 auto 40px", minHeight: 40, padding: "12px 15px", borderRadius: 12,
        background: "#F5EFE2", border: `1px solid ${HAIR}`, textAlign: "left",
      }}>
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A4E1E", letterSpacing: "0.14em", marginBottom: memory.length ? 6 : 0, textTransform: "uppercase" }}>
          {NAME.toUpperCase()} REMEMBERS
        </div>
        {memory.length === 0 ? (
          <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#9A7B4E", fontStyle: "italic" }}>
            Care for {NAME} and they&apos;ll remember it…
          </div>
        ) : memory.map((m, i) => (
          <div key={i} style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", opacity: 1 - i * 0.3, lineHeight: 1.7 }}>· {m}</div>
        ))}
      </div>

      {/* ── Mission strip — what raisers really earn daily (server-verified
             values: 5 pts/free care, 2 pts/chat message, 10 pts/creation). ── */}
      <div style={{
        ...rv(8),
        maxWidth: 320, margin: "0 auto 36px", padding: "14px 16px", borderRadius: 14,
        background: PAPER, border: `1px solid ${HAIR}`, boxShadow: "4px 5px 0 rgba(33,26,18,.08)", textAlign: "left",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 9 }}>
          <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "#9A4E1E", textTransform: "uppercase" }}>Daily missions — raisers</span>
          <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: MUTED }}>{seasonNote}</span>
        </div>
        {([
          ["Care ×3", "+5 PTS EACH"],
          ["Chat with your pet", "+2 PTS EACH"],
          ["Make 1 creation", "+10 PTS"],
        ] as const).map(([label, payoff]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "5px 0" }}>
            <span style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#3A3024" }}>{label}</span>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: "#9A7B4E", border: "1px solid rgba(154,123,78,.35)", borderRadius: 8, padding: "2px 8px", flexShrink: 0 }}>{payoff}</span>
          </div>
        ))}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${HAIR}`, fontFamily: "var(--ed-body)", fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
          {phase === "upcoming"
            ? "The real values signed-in raisers earn — points bank now and carry into Season 1."
            : "The real values signed-in raisers earn — Season points are non-financial loyalty rewards."}
        </div>
      </div>

      {/* ── Adopt CTA ── normal flow (never overlaps the care buttons above) ── */}
      <div style={{
        ...rv(9),
        padding: "18px 20px", borderRadius: 18,
        background: "linear-gradient(135deg, #211A12, #1E1710)", color: "#FFF8EE",
        boxShadow: SHADOW, border: "1px solid rgba(232,199,126,.22)",
      }}>
        <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 17, marginBottom: 5 }}>
          {cares >= 2 ? `Adopt to keep ${NAME} growing 🌱` : `Adopt your own pet`}
        </div>
        <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "rgba(255,248,238,0.7)", marginBottom: 15, lineHeight: 1.55 }}>
          {ctaNote || "Sign in with your wallet — no gas, identity only. Your pet remembers you across every session."}
        </div>
        <div style={{ display: "inline-block" }}>{cta}</div>
      </div>
      </div>
      </div>
    </div>
  );
}

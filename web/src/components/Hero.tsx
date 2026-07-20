"use client";

import { useState, useEffect, useRef } from "react";
import { LOGO_SRC } from "./Nav";
import CollectibleFrame from "@/components/editorial/CollectibleFrame";
import Icon from "@/components/Icon";
import { seasonPhase } from "@/lib/season";
import Reveal, { MaskedTitle, useMagnet } from "@/components/Reveal";
import PawField from "@/components/PawField";

// Two stacked arrows in a 1em mask — hover (on the parent <a>/<button>) slides
// the second one up. Pure presentation, styled by .ed-arrow-swap in globals.css.
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

// ── WOW beat: 3D tilt-on-pointer for the hero polaroid ──
// rotateX/Y follow the pointer (fine pointers only; reduced-motion skips),
// spring back on leave via the house reveal ease. A one-shot gold-foil sheen
// sweeps the sticker edge on hover (.hero-tilt::after in the hero <style>
// block). The idle float stays on CollectibleFrame (.ed-float) — untouched.
function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;  // -1 … 1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    el.style.transition = "transform 90ms linear";
    el.style.transform = `perspective(800px) rotateX(${(-ny * 7).toFixed(2)}deg) rotateY(${(nx * 9).toFixed(2)}deg)`;
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform 650ms cubic-bezier(.22,.9,.3,1)"; // spring back
    el.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg)";
  };
  return (
    <div ref={ref} className="hero-tilt" onPointerMove={onMove} onPointerLeave={onLeave}
      style={{ position: "relative", willChange: "transform" }}>
      {children}
    </div>
  );
}

// ── Die-cut sticker chips — replace the 3D emoji-icon PNGs on the pillar and
// eco cards. Inline duotone SVG marks: ink stroke, terracotta/foil fills, a
// white die-cut edge + ink kiss-cut line, hard offset shadow, slight rotation
// (Collectible Editorial). Decorative only — labels carry the meaning.
const STICKER_INK = "#211A12";
const STICKER_TERRA = "#BE4F28";
const STICKER_FOIL = "#E8C77E";
const STICKER_PAPER = "#FBF6EC";

type StickerKind = "reel" | "sparkle" | "chat" | "export" | "paw" | "diamond" | "cards";

function StickerMark({ kind, size = 20 }: { kind: StickerKind; size?: number }) {
  const s = { stroke: STICKER_INK, strokeWidth: 1.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const art: Record<StickerKind, React.ReactNode> = {
    reel: (
      <>
        <circle cx="12" cy="12" r="8.2" fill={STICKER_TERRA} {...s} />
        {[[12, 7.4], [12, 16.6], [7.4, 12], [16.6, 12]].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" fill={STICKER_PAPER} {...s} strokeWidth={1.1} />
        ))}
        <circle cx="12" cy="12" r="1.6" fill={STICKER_FOIL} {...s} strokeWidth={1.1} />
      </>
    ),
    sparkle: (
      <>
        <path d="M12 3.2 14.1 9.9 20.8 12 14.1 14.1 12 20.8 9.9 14.1 3.2 12 9.9 9.9Z" fill={STICKER_FOIL} {...s} />
        <circle cx="18.8" cy="5.2" r="1.5" fill={STICKER_TERRA} {...s} strokeWidth={1.1} />
      </>
    ),
    chat: (
      <>
        <path d="M4.6 7a2.2 2.2 0 0 1 2.2-2.2h10.4A2.2 2.2 0 0 1 19.4 7v6.2a2.2 2.2 0 0 1-2.2 2.2h-6.4L7 18.6v-3.2h-.2a2.2 2.2 0 0 1-2.2-2.2z" fill={STICKER_TERRA} {...s} />
        {[8.6, 12, 15.4].map((cx) => (
          <circle key={cx} cx={cx} cy="10.1" r="1.05" fill={STICKER_FOIL} />
        ))}
      </>
    ),
    export: ( // Portable Legacy — the pet's soul leaves the box
      <>
        <path d="M5 11.5h14v7.3a1.2 1.2 0 0 1-1.2 1.2H6.2A1.2 1.2 0 0 1 5 18.8z" fill={STICKER_TERRA} {...s} />
        <path d="M12 3.4l3.7 3.9h-2.3v5.2h-2.8V7.3H8.3z" fill={STICKER_FOIL} {...s} strokeWidth={1.3} />
      </>
    ),
    paw: (
      <>
        {[[7, 8.6, -18], [12, 7.2, 0], [17, 8.6, 18]].map(([cx, cy, r]) => (
          <ellipse key={cx} cx={cx} cy={cy} rx="1.9" ry="2.5" transform={`rotate(${r} ${cx} ${cy})`} fill={STICKER_TERRA} {...s} strokeWidth={1.2} />
        ))}
        <path d="M12 11.2c3 0 5.3 2 5.3 4.5 0 2-1.7 3.4-3.2 2.8-.9-.4-1.5-.4-2.2 0-1.5.6-3.2-.8-3.2-2.8 0-2.5 2.3-4.5 5.3-4.5z" fill={STICKER_TERRA} {...s} />
      </>
    ),
    diamond: (
      <>
        <path d="M7.4 4.8h9.2l3.8 4.8L12 20.2 3.6 9.6z" fill={STICKER_FOIL} {...s} />
        <path d="M7.4 4.8 3.6 9.6h5z" fill={STICKER_TERRA} {...s} strokeWidth={1.1} />
        <path d="M3.6 9.6h16.8M7.4 4.8l1.2 4.8 3.4 10.6 3.4-10.6 1.2-4.8" fill="none" {...s} strokeWidth={1.1} />
      </>
    ),
    cards: (
      <>
        <rect x="9.4" y="4.2" width="9.4" height="13.2" rx="1.4" transform="rotate(7 14.1 10.8)" fill={STICKER_TERRA} {...s} />
        <rect x="4.8" y="6.4" width="9.4" height="13.2" rx="1.4" transform="rotate(-6 9.5 13)" fill={STICKER_PAPER} {...s} />
        <circle cx="9.5" cy="13" r="2" transform="rotate(-6 9.5 13)" fill={STICKER_FOIL} {...s} strokeWidth={1.1} />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {art[kind]}
    </svg>
  );
}

function StickerChip({ kind, rotate = -3, size = 38 }: { kind: StickerKind; rotate?: number; size?: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3),
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: STICKER_PAPER,
      border: "2px solid #FFFFFF",               // die-cut white edge
      outline: "1px solid rgba(33,26,18,.16)",   // ink kiss-cut line
      boxShadow: "3px 4px 0 rgba(33,26,18,.12)", // hard offset shadow
      transform: `rotate(${rotate}deg)`,
    }}>
      <StickerMark kind={kind} size={Math.round(size * 0.6)} />
    </span>
  );
}

// ── Soft ambient glyphs (no 3D-icon match) — flat SVGs tuned to the hero's warm palette ──
function BlossomGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse key={deg} cx="12" cy="6.4" rx="3.1" ry="4.4" fill="#E8B6A0"
          transform={`rotate(${deg} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="2.4" fill="#E2B36A" />
    </svg>
  );
}

function CloudGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M6.5 17.5a3.5 3.5 0 0 1-.4-6.97A4.5 4.5 0 0 1 15 9.2a3.4 3.4 0 0 1 2.7 8.3H6.5z"
        fill="#FBF6EC" stroke="rgba(154,78,30,0.25)" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

const FLOAT_PETS = [
  { icon: <Icon name="cat" size={38} />, x: 8, y: 18, delay: 0, size: 38 },
  { icon: <Icon name="dog" size={34} />, x: 82, y: 12, delay: 1.2, size: 34 },
  { icon: <Icon name="parrot" size={30} />, x: 18, y: 62, delay: 2.4, size: 30 },
  { icon: <Icon name="turtle" size={32} />, x: 88, y: 52, delay: 0.8, size: 32 },
  { icon: <Icon name="hamster" size={28} />, x: 45, y: 78, delay: 1.8, size: 28 },
  { icon: <Icon name="fox" size={32} />, x: 5, y: 45, delay: 3.0, size: 32 },
  { icon: <Icon name="rabbit" size={30} />, x: 92, y: 32, delay: 0.4, size: 30 },
  { icon: <Icon name="dog" size={34} />, x: 65, y: 10, delay: 2.0, size: 34 },
  { icon: <BlossomGlyph size={22} />, x: 15, y: 35, delay: 0.6, size: 22 },
  { icon: <Icon name="sparkling" size={20} />, x: 75, y: 40, delay: 1.5, size: 20 },
  { icon: <Icon name="heart" size={18} />, x: 30, y: 80, delay: 2.8, size: 18 },
  { icon: <Icon name="grass" size={20} />, x: 55, y: 20, delay: 3.5, size: 20 },
  { icon: <CloudGlyph size={26} />, x: 25, y: 8, delay: 0.3, size: 26 },
  { icon: <CloudGlyph size={30} />, x: 70, y: 5, delay: 1.9, size: 30 },
];

function FloatingPet({ icon, x, y, delay, size }: any) {
  return (
    <div className="hero-float" style={{
      position: "absolute", left: `${x}%`, top: `${y}%`,
      fontSize: size, opacity: 0.35,
      animation: `petFloat 6s ease-in-out ${delay}s infinite`,
      pointerEvents: "none", zIndex: 1,
      lineHeight: 0,
    }}>
      {icon}
    </div>
  );
}

const PILLARS: { mark: StickerKind; label: string; desc: string }[] = [
  { mark: "reel", label: "AI Video Engine", desc: "Personalized content for every moment" },
  { mark: "sparkle", label: "Evolve & Equip", desc: "Skills, skins & marketplace" },
  { mark: "chat", label: "Social Circle", desc: "Life sharing & network effects" },
  { mark: "export", label: "Portable Legacy", desc: "Export your pet's soul; on-chain anchoring is planned, not live" },
];

// Right-rail hero — the PET as the star: a foil-stamped collectible poster of the
// brand companion on a terracotta editorial stage (matches design concept 02). The pet is the
// hero, not a montage of samples.
function HeroShowcase({ txToday }: { txToday?: number }) {
  return (
    <div className="hero-showcase" style={{ position: "relative", zIndex: 2 }}>
      <div style={{ position: "relative", background: "#BE4F28", borderRadius: 26, padding: "20px 22px 16px", overflow: "hidden", boxShadow: "var(--ed-shadow-float, 0 54px 84px -28px rgba(38,12,2,.72),0 14px 28px -12px rgba(38,12,2,.45))", minHeight: 440, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div className="ed-grain" />
        {/* corner registration ticks */}
        {[["16px","16px","",""],["16px","","","16px"],["","16px","16px",""],["","","16px","16px"]].map((c, i) => (
          <span key={i} aria-hidden style={{ position: "absolute", top: c[0] || undefined, left: c[1] || undefined, bottom: c[2] || undefined, right: c[3] || undefined, width: 11, height: 11,
            backgroundImage: "linear-gradient(rgba(252,233,207,.6),rgba(252,233,207,.6)),linear-gradient(rgba(252,233,207,.6),rgba(252,233,207,.6))",
            backgroundSize: "1px 11px,11px 1px", backgroundPosition: "center,center", backgroundRepeat: "no-repeat", zIndex: 3 }} />
        ))}
        <div style={{ position: "relative", zIndex: 2, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, padding: "0 2px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FCE9CF", boxShadow: "0 0 0 3px rgba(252,233,207,.22)", animation: "pulse 2s ease-in-out infinite" }} />
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: "#FCE9CF", textTransform: "uppercase" }}>
              {txToday && txToday >= 20 ? `${txToday} creations this week` : "Meet your companion"}
            </span>
          </div>
          <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: "rgba(252,233,207,.7)" }}>FILE № 0742</span>
        </div>
        <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 0" }}>
          {/* The collectible FLIES IN and settles like a dealt card (owner ask),
              then lives on a pointer-following 3D tilt with a foil sheen sweep. */}
          <Reveal dir="fly" duration={950} delay={250} threshold={0.1}>
            <TiltCard>
              <CollectibleFrame photoUrl={LOGO_SRC} level={5} speciesLabel="POMERANIAN" elementLabel="GRASS" width={245} tilt={-2.4} />
            </TiltCard>
          </Reveal>
        </div>
        <div className="ed-foil-text" style={{ position: "relative", zIndex: 2, fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 33, lineHeight: 0.9, letterSpacing: "-0.03em" }}>Dordor</div>
        <div style={{ position: "relative", zIndex: 2, fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: ".22em", color: "rgba(252,233,207,.7)", marginTop: 6, textTransform: "uppercase" }}>Adopt · Remember · Own</div>
      </div>
    </div>
  );
}

// Each pillar navigates to its real in-SPA section — a button whose only effect
// was briefly highlighting itself (wiped by the 3s auto-rotate) did nothing.
// NOTE: the Studio surface is the "create" section in the SPA ("studio" is only
// a URL nav in the header) — using "studio" here rendered a blank body.
const PILLAR_TARGETS = ["create", "my pet", "community", "sovereignty"];

export default function Hero({ onAdopt, onExplore, onNavigate, txToday }: any) {
  const [activePillar, setActivePillar] = useState(0);
  // Primary CTA leans toward the pointer (fine pointers only).
  const magnetRef = useMagnet();

  useEffect(() => {
    const timer = setInterval(() => {
      setActivePillar(prev => (prev + 1) % PILLARS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hero-root" style={{
      textAlign: "center", padding: "130px 40px 60px", position: "relative",
      minHeight: 580, overflow: "hidden",
      background: "#ECE4D4",
    }}>
      {/* Living background — drifting paw glyph field (E01), behind everything.
          Carves clean paper around the headline + CTA via [data-carve]. */}
      <PawField opacity={0.09} cell={48} />
      <style>{`
        @keyframes petFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-12px) rotate(3deg); }
          75% { transform: translateY(8px) rotate(-3deg); }
        }
        /* Backer marquee — track slides exactly one duplicated half (-50%).
           Spacing is margin-right (flex gap would break the -50% math). */
        @keyframes heroTicker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .hero-backer-chip {
          background: #FBF6EC;
          border: 1px solid var(--ed-hair, rgba(33,26,18,.13));
          border-radius: 12px; padding: 14px 16px; margin-right: 12px;
          display: inline-flex; align-items: center; gap: 10px; white-space: nowrap;
          opacity: .75; filter: grayscale(0.2);
          transition: opacity 220ms ease, filter 220ms ease, background 220ms ease, border-color 220ms ease;
        }
        .hero-backer-chip:hover {
          opacity: 1; filter: grayscale(0);
          background: #F5EFE2; border-color: rgba(190,79,40,0.3);
        }
        /* WOW beat — one-shot gold-foil sheen sweeping the polaroid's sticker
           edge on hover (background-position slide; resets instantly off-hover).
           The 3D tilt itself is driven per-pointer in TiltCard. */
        .hero-tilt::after {
          content: ""; position: absolute; inset: -2px; border-radius: 12px;
          pointer-events: none; opacity: 0; z-index: 5;
          background: linear-gradient(115deg, rgba(232,199,126,0) 42%, rgba(232,199,126,.55) 50%, rgba(200,147,47,.3) 55%, rgba(232,199,126,0) 62%);
          background-size: 240% 100%;
          background-position: 200% 0;
        }
        .hero-tilt:hover::after {
          opacity: 1; background-position: -100% 0;
          transition: background-position 1.1s cubic-bezier(.22,.9,.3,1), opacity 180ms ease;
        }
        /* Felt hover for lead-investor + eco cards — shadow steps card → float. */
        .hero-invest-card {
          box-shadow: var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5));
          transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
        }
        .hero-invest-card:hover {
          transform: translateY(-3px);
          border-color: rgba(190,79,40,.45);
          box-shadow: var(--ed-shadow-float, 0 54px 84px -28px rgba(38,12,2,.72), 0 14px 28px -12px rgba(38,12,2,.45));
        }
        @media (max-width: 860px) {
          .hero-root { padding: 100px 16px 40px !important; min-height: auto !important; }
          /* Single-column collapse centers the copy — the %-positioned float
             glyphs would sit on top of the body paragraph, so retire them. */
          .hero-float { display: none !important; }
          .hero-2col { grid-template-columns: 1fr !important; gap: 30px !important; text-align: center !important; }
          .hero-2col-left { display: flex; flex-direction: column; align-items: center; }
          .hero-cta { justify-content: center !important; }
          .hero-showcase { max-width: 400px; margin: 0 auto; width: 100%; }
          .hero-pillars { flex-wrap: wrap !important; }
          .hero-pillars button { min-width: 120px !important; flex: 1 1 40% !important; }
          .hero-cta { flex-direction: column !important; gap: 10px !important; }
          .hero-cta button { width: 100% !important; }
          .hero-partners { flex-wrap: wrap !important; justify-content: center !important; }
          .hero-logo-img { width: 110px !important; height: 110px !important; }
        }
        @media (max-width: 480px) {
          .hero-root { padding: 90px 12px 32px !important; }
          .hero-pillars button { min-width: 0 !important; flex: 1 1 45% !important; padding: 8px 10px !important; }
          .hero-logo-img { width: 90px !important; height: 90px !important; }
        }
      `}</style>

      {FLOAT_PETS.map((p, i) => (
        <FloatingPet key={i} {...p} />
      ))}

      {/* ═══ 2-column hero — text left, live "what you can make" reel right (concept 02) ═══ */}
      <div className="hero-2col" style={{
        position: "relative", zIndex: 2, maxWidth: 1180, margin: "0 auto",
        display: "grid", gridTemplateColumns: "1.04fr 0.92fr", gap: 46, alignItems: "center", textAlign: "left",
      }}>
        {/* LEFT — text column */}
        <div className="hero-2col-left">
          {/* Live counter badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 16px",
            borderRadius: 20, background: "#F5EFE2",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", marginBottom: 22,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1A7E68", animation: "pulse 2s ease-in-out infinite" }} />
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A4E1E", fontWeight: 500 }}>Adopt free · no gas to start</span>
          </div>

          {/* Eyebrow + honest Beta tag */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, letterSpacing: "0.18em", color: "#9A4E1E", fontWeight: 700, textTransform: "uppercase" }}>
              The open infrastructure for AI companions
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.14em", padding: "3px 8px", borderRadius: 7, background: "#BE4F28", color: "#FCE9CF", fontFamily: "var(--ed-m)", border: "1px solid rgba(190,79,40,0.35)" }}>
              BETA
            </span>
          </div>

          {/* Headline — stacked, three colors */}
          <h1 className="mp-enter" data-carve style={{
            fontFamily: "var(--ed-disp)", fontSize: "clamp(34px,4.4vw,56px)",
            fontWeight: 800, color: "#211A12", lineHeight: 1.0, margin: "0 0 16px", letterSpacing: "-0.035em",
          }}>
            <span style={{ display: "block" }}>Your AI.</span>
            <span style={{ display: "block", color: "rgba(33,26,18,0.55)" }}>Your data.</span>
            <span style={{ display: "block", color: "#BE4F28" }}>Your companion.</span>
          </h1>

          {/* Adopt · Remember · Own */}
          <div style={{ display: "inline-flex", gap: 14, alignItems: "center", fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 600, color: "#9A4E1E", marginBottom: 16, letterSpacing: "0.04em" }}>
            <span><Icon name="paw" size={15} /> Adopt</span>
            <span style={{ color: "rgba(33,26,18,0.15)" }}>·</span>
            <span>Remember</span>
            <span style={{ color: "rgba(33,26,18,0.15)" }}>·</span>
            <span>Own</span>
          </div>

          {/* Description */}
          <p className="mp-enter mp-enter-2" style={{ fontFamily: "var(--ed-body)", fontSize: 18, color: "#5C5140", maxWidth: 500, margin: "0 0 28px", lineHeight: 1.6, fontWeight: 500 }}>
            Not another chatbot with a cute avatar. An AI pet that remembers you,
            grows with you, and lives across every surface you do — fully exportable,
            deletable, yours.
          </p>

          {/* CTA */}
          <style>{`
            .hero-cta-primary {
              background: linear-gradient(180deg,#F49B2A,#E27D0C); border: none;
              border-radius: 12px; padding: 14px 36px;
              font-family: var(--ed-disp); font-size: 14px; font-weight: 600; color: #211A12; cursor: pointer;
              box-shadow: var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5));
              transition: all 0.3s;
            }
            .hero-cta-primary:hover { transform: translateY(-2px); box-shadow: 0 22px 44px -24px rgba(80,55,20,.55); background: linear-gradient(180deg,#E27D0C,#C96A05); }
            .hero-cta-secondary {
              background: #FBF6EC; border: 1px solid var(--ed-hair, rgba(33,26,18,.13));
              border-radius: 12px; padding: 14px 36px;
              font-family: var(--ed-disp); font-size: 14px; font-weight: 600; color: #5C5140; cursor: pointer; transition: transform 0.3s, box-shadow 0.3s;
            }
            /* Fill + text flip come from .ed-wipe (terracotta rises bottom-up, text → cream) */
            .hero-cta-secondary:hover { transform: translateY(-2px); box-shadow: var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5)); }
          `}</style>
          <div className="hero-cta" data-carve style={{ display: "flex", gap: 14 }}>
            <div ref={magnetRef} style={{ display: "inline-flex" }}>
              <button onClick={onAdopt} className="hero-cta-primary" style={{ flex: 1 }}>
                <Icon name="paw" size={16} /> Adopt your pet
              </button>
            </div>
            <button onClick={onExplore} className="hero-cta-secondary ed-wipe">
              Explore Community
            </button>
          </div>
        </div>

        {/* RIGHT — live reel of real generated pet clips */}
        <HeroShowcase txToday={txToday} />
      </div>

      {/* Ecosystem pillars — full width below the hero (scroll-revealed as one row) */}
      <Reveal dir="up">
      <div className="hero-pillars" style={{
        display: "flex", justifyContent: "center", gap: 8, margin: "46px auto 0", maxWidth: 1180,
        position: "relative", zIndex: 2, flexWrap: "wrap",
      }}>
        <style>{`
          .hero-pillar-btn {
            background: #FBF6EC;
            border: 1px solid var(--ed-hair, rgba(33,26,18,.13));
            border-radius: 12px; padding: 12px 16px; cursor: pointer;
            flex: 1 1 0; min-width: 220px; max-width: 300px;
            transition: all 0.3s ease; min-width: 150px;
            opacity: 1; filter: saturate(1);
            text-align: left;
          }
          .hero-pillars:hover .hero-pillar-btn:not(:hover) {
            opacity: 0.45;
            filter: saturate(0.5);
          }
          .hero-pillar-btn:hover {
            background: #F5EFE2 !important;
            border-color: rgba(190,79,40,0.3) !important;
            transform: translateY(-3px);
            box-shadow: var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5));
            opacity: 1 !important;
            filter: saturate(1) !important;
          }
          .hero-pillar-btn:hover .pillar-label {
            color: #9A4E1E !important;
          }
          .hero-pillar-btn:hover .pillar-desc {
            color: #7A6E5A !important;
          }
          .hero-pillar-btn:hover .pillar-icon {
            transform: scale(1.2);
          }
          .hero-pillar-btn.active {
            background: #F5EFE2 !important;
            border-color: rgba(190,79,40,0.35) !important;
            box-shadow: var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5));
          }
        `}</style>
        {PILLARS.map((f, i) => (
          <button key={i} onClick={() => { setActivePillar(i); onNavigate?.(PILLAR_TARGETS[i]); }}
            className={`hero-pillar-btn${activePillar === i ? " active" : ""}`}
            aria-label={`Open ${f.label}`}
          >
            <div className="pillar-icon" style={{ marginBottom: 8, lineHeight: 0, transition: "transform 0.3s ease", transformOrigin: "left bottom" }}>
              <StickerChip kind={f.mark} size={34} rotate={i % 2 ? 2.5 : -3} />
            </div>
            <div className="pillar-label" style={{
              fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
              color: activePillar === i ? "#9A4E1E" : "#5C5140",
              marginBottom: 2, transition: "color 0.3s",
            }}>{f.label}</div>
            <div className="pillar-desc" style={{
              fontFamily: "var(--ed-m)", fontSize: 13,
              color: activePillar === i ? "#7A6E5A" : "#9A7B4E",
              transition: "color 0.3s",
            }}>{f.desc}</div>
          </button>
        ))}
      </div>
      </Reveal>

      {/* (Style-showcase marquee removed per feedback — the hero pet is the star,
          not a row of sample images.) */}

      {/* spacer */}
      <div style={{ marginTop: 44 }} />

      {/* ─── The Ecosystem Section ─── */}
      <div style={{
        position: "relative", zIndex: 2,
        marginTop: 80, padding: "0 20px",
        maxWidth: 960, marginLeft: "auto", marginRight: "auto",
      }}>
        {/* Season badge */}
        <Reveal dir="fade">
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 18px", borderRadius: 20,
          background: "#F5EFE2",
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          marginBottom: 20,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%", background: "#BE4F28",
            animation: "pulse 2s ease-in-out infinite",
          }} />
          <span style={{
            fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
            color: "#9A4E1E", letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            {seasonPhase() === "live" ? "Season 1 · Live" : seasonPhase() === "upcoming" ? "Season 1 · Starts Jul 1" : "Season 1 · Ended"}
          </span>
        </div>
        </Reveal>

        {/* Section heading — printed-line rise */}
        <MaskedTitle
          as="h2"
          lines={["Built as infrastructure,", "not a walled garden."]}
          style={{
            fontFamily: "var(--ed-disp)", fontSize: "clamp(28px,4vw,42px)",
            fontWeight: 700, color: "#211A12", letterSpacing: "-0.02em",
            marginBottom: 10, lineHeight: 1.15,
          }}
        />
        <Reveal dir="fade" delay={120}>
        <p style={{
          fontFamily: "var(--ed-body)", fontSize: 17, color: "#5C5140",
          maxWidth: 560, margin: "0 auto 24px", lineHeight: 1.7,
        }}>
          Your pet&apos;s memory + identity use <strong style={{ color: "#9A4E1E" }}>PetClaw</strong> — an
          open, exportable protocol designed to move across supported clients instead of locking you to one surface.
        </p>
        </Reveal>

        {/* Infrastructure evidence chips */}
        <Reveal dir="up" delay={180}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 18 }}>
          {["Open SDK", "MCP in SDK 1.6.2", "19-connector registry · 3 live", "Your data, portable"].map((c) => (
            <span key={c} style={{
              fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
              padding: "6px 14px", borderRadius: 999, color: "#7A6E5A",
              background: "rgba(122,110,90,0.08)", border: "1px solid rgba(122,110,90,0.22)",
            }}>{c}</span>
          ))}
        </div>
        </Reveal>

        {/* Developer SDK strip (#4) — reads as serious infra, not a token */}
        <Reveal dir="pop" delay={240}>
        <div style={{
          maxWidth: 540, margin: "0 auto 40px", borderRadius: 14, overflow: "hidden",
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        }}>
          <div style={{
            background: "#1E1710", padding: "12px 16px",
            fontFamily: "var(--ed-m)", fontSize: 13, color: "#f8f8f8",
            display: "flex", alignItems: "center", gap: 8, textAlign: "left",
          }}>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>$</span>
            <span style={{ color: "#4ade80" }}>npm i</span>
            <span>@myaipet/petclaw-sdk</span>
          </div>
          <div style={{
            background: "#F5EFE2", padding: "10px 16px",
            fontFamily: "var(--ed-m)", fontSize: 13, color: "#5C5140",
            textAlign: "left",
          }}>
            Open protocol · MCP in SDK 1.6.2 · 18 skills · build on the pet layer ·{" "}
            <a href="/api-docs" className="ed-underline-slide" style={{ color: "#9A4E1E", fontWeight: 700, textDecoration: "none" }}>docs <ArrowSwap /></a>
          </div>
        </div>
        </Reveal>

        {/* The experience on top */}
        <Reveal dir="fade">
        <div style={{
          fontFamily: "var(--ed-m)", fontSize: 13, letterSpacing: "0.18em",
          color: "#9A7B4E", textTransform: "uppercase", marginBottom: 14, fontWeight: 700,
        }}>
          And the experience on top
        </div>
        </Reveal>

        {/* Feature cards grid */}
        <style>{`
          .eco-card {
            background: #FBF6EC;
            border: 1px solid var(--ed-hair, rgba(33,26,18,.13));
            border-radius: 16px;
            padding: 28px 22px;
            text-align: left;
            cursor: default;
          }
          /* Lift/border/shadow come from .hero-invest-card — only the icon flourish here. */
          .eco-card:hover .eco-icon {
            transform: scale(1.15);
          }
        `}</style>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 16,
        }}>
          {([
            { mark: "paw", title: "Raise", desc: "Feed, play, and train your AI pet. Watch them grow from Baby to Legendary." },
            { mark: "sparkle", title: "Create", desc: "Generate stunning AI images and videos of your pet in any scene or style." },
            { mark: "diamond", title: "Climb", desc: "Climb the leaderboard and build your Season standing — non-financial recognition for raising well." },
            { mark: "cards", title: "Collect", desc: "Collect TCG cards of your pet — earned by raising and creating, yours to keep and share." },
          ] as { mark: StickerKind; title: string; desc: string }[]).map((card, i) => (
            <Reveal key={card.title} dir="up" delay={Math.min(i, 8) * 90}>
            <div className="eco-card hero-invest-card" style={{ height: "100%" }}>
              <div className="eco-icon" style={{
                marginBottom: 16, lineHeight: 0, transformOrigin: "left bottom",
                transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
              }}>
                <StickerChip kind={card.mark} size={44} rotate={[-3, 2.5, -2, 3][i % 4]} />
              </div>
              <div style={{
                fontFamily: "var(--ed-disp)", fontSize: 20, fontWeight: 700,
                color: "#211A12", marginBottom: 8, letterSpacing: "-0.01em",
              }}>
                {card.title}
              </div>
              <div style={{
                fontFamily: "var(--ed-body)", fontSize: 15, color: "#5C5140",
                lineHeight: 1.65,
              }}>
                {card.desc}
              </div>
            </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* ─── Footer CTA — field-notes postcard (on-system: paper, mono eyebrow,
           postage-stamp paw; the whole card is the link, no faux close button) ─── */}
      <div style={{
        position: "relative", zIndex: 2,
        marginTop: 80, padding: "0 20px",
        maxWidth: 540, marginLeft: "auto", marginRight: "auto",
      }}>
        <Reveal dir="pop">
        <a
          href="https://x.com/MYAIPETS"
          target="_blank"
          rel="noopener noreferrer"
          className="mp-lift"
          style={{
            display: "block", textDecoration: "none", textAlign: "left",
            borderRadius: 22, overflow: "hidden", background: "#FBF6EC",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
            padding: "20px 22px 22px",
          }}
        >
          {/* postcard header — mono eyebrow + postage stamp */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <span style={{
              fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
              letterSpacing: "0.18em", color: "#9A4E1E", textTransform: "uppercase", paddingTop: 8,
            }}>
              Field Notes — Built in Public
            </span>
            <span aria-hidden style={{
              width: 44, height: 52, borderRadius: 4, flex: "0 0 auto",
              background: "#F5EFE2", border: "1.5px dashed rgba(190,79,40,.5)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              transform: "rotate(3deg)", boxShadow: "2px 3px 0 rgba(33,26,18,.1)",
            }}>
              <StickerMark kind="paw" size={22} />
            </span>
          </div>
          {/* address rule */}
          <div aria-hidden style={{ height: 1, background: "var(--ed-hair, rgba(33,26,18,.13))", margin: "14px 0 16px" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img src={LOGO_SRC} alt="MY AI PET" style={{
                width: 58, height: 58, borderRadius: 14, objectFit: "cover",
                border: "2px solid #FFFFFF", outline: "1px solid rgba(33,26,18,.16)",
                boxShadow: "3px 4px 0 rgba(33,26,18,.12)", background: "#F5EFE2",
                transform: "rotate(-2deg)",
              }} />
              <div>
                <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 19, color: "#211A12", letterSpacing: "-0.01em" }}>
                  MY AI PET
                </div>
                <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A", marginTop: 1 }}>
                  @MYAIPETS
                </div>
              </div>
            </div>
            <span style={{
              padding: "10px 22px", borderRadius: 12,
              background: "#211A12", color: "#FBF6EC",
              fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 700,
              display: "inline-flex", alignItems: "center", gap: 7,
              boxShadow: "3px 4px 0 rgba(33,26,18,.18)",
            }}>𝕏 Follow</span>
          </div>
          <div style={{ fontFamily: "var(--ed-body)", fontSize: 14.5, color: "rgba(33,26,18,0.72)", marginTop: 14, lineHeight: 1.55 }}>
            Building the first AI companion you actually own — it remembers you, you own the data, and it lives everywhere. Follow along, built in public. 🐾
          </div>
        </a>
        </Reveal>
      </div>
    </div>
  );
}

"use client";

/**
 * PetVillage — a FAITHFUL PORT of the approved "Pet Village — Premium v2" prototype.
 *
 * The rendered scene reproduces that prototype exactly — its dusk-sky frame, soft
 * light rays + bokeh, the floating-island diorama (grass top, carved underside,
 * little floating rocks, gold path + stepping stones), the four 2.5D buildings
 * (Memory Library / Skills Forge / Soul Shrine / Clock Spire, each with left+right+
 * top faces, gloss, foil-gold trim and glow windows), the central glowing Soul
 * Fountain orb with its halo, the glass stat chips, the chibi pet villagers (the
 * ACTIVE one lifting with gold wisps), and the floating gold dust.
 *
 * Only the DATA is swapped in — nothing is fabricated. Every number, lit window and
 * glow maps to a real mission-control signal (GET /api/petclaw/mission-control):
 *   • 4 glass chips  — Memory count/cap · Skills installed · Routines · Soul (v# ★ / not set)
 *   • Memory Library — lit-window count ∝ real memory count / cap
 *   • Skills Forge   — forge fire lit only while a skill is running
 *   • Soul Shrine    — gold heart-flame emblem lit only when the persona is set
 *   • Clock Spire    — hour/minute/second hands at real local time (routine count in chip)
 *   • Villagers      — the real roster (skills + VIGIL crew); the active one lifts + emits wisps
 *   • Soul Fountain  — ripples while the office is working
 *   • Courier        — a gold spark runs up to the fountain while an SSE run streams
 *
 * All motion carries `data-anim`, so `prefers-reduced-motion: reduce` silences it in
 * one CSS rule (a calm static frame — no bob/particle motion); the SMIL courier and
 * second hand are additionally gated by a JS reduced-motion flag.
 */

import { useEffect, useState } from "react";
import type { MC, Staff, LiveRun } from "./AgentOffice";

// ── tokens (Collectible Editorial) ──
const INK = "#241A12";
const MUTED = "#6A5C48";
const PURPLE = "#6B4FA0";
const TERRA = "#9A4E1E";
const TERRA2 = "#BE4F28";
const SAGE = "#5C8A4E";
const PAPER = "#FBF6EC";
const DISP = "var(--ed-disp, \"Space Grotesk\", system-ui, sans-serif)";
const SANS = "var(--ed-body, \"Space Grotesk\", system-ui, sans-serif)";
const MONO = "var(--ed-m, ui-monospace, Menlo, monospace)";
const HAIR = "rgba(36,26,18,0.12)";
const SHADOW_CARD = "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))";
const FIELD = "#ECE4D4";
const WALL_DK = "#E3D3B2";

function relTime(ts?: string | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── motion (prototype keyframes; data-anim = one-rule reduced-motion kill switch) ──
const KF = `
@keyframes pvRise{0%{transform:translateY(14px);opacity:0}18%{opacity:.9}100%{transform:translateY(-150px);opacity:0}}
@keyframes pvDrift{0%,100%{transform:translate(0,0)}50%{transform:translate(14px,-16px)}}
@keyframes pvBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes pvBobw{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes pvPulse{0%,100%{opacity:.45;transform:scale(.9)}50%{opacity:.95;transform:scale(1.08)}}
@keyframes pvWisp{0%{opacity:0;transform:translateY(4px) scale(.7)}30%{opacity:1}100%{opacity:0;transform:translateY(-26px) scale(1)}}
@keyframes pvRing{0%{opacity:.55;transform:scale(.6)}100%{opacity:0;transform:scale(1.6)}}
@keyframes pvFlame{0%,100%{transform:scaleY(1) scaleX(1)}45%{transform:scaleY(.84) scaleX(1.08)}}
.pv-rays{position:absolute;inset:0;pointer-events:none;opacity:.5;mix-blend-mode:screen;z-index:2;background:conic-gradient(from 210deg at 20% 0%, rgba(255,236,180,0) 0deg, rgba(255,236,180,.22) 12deg, rgba(255,236,180,0) 24deg, rgba(255,236,180,.16) 40deg, rgba(255,236,180,0) 60deg)}
.pv-bokeh{position:absolute;border-radius:50%;filter:blur(2px);pointer-events:none;z-index:2;animation:pvDrift 14s ease-in-out infinite}
.pv-dust{position:absolute;border-radius:50%;background:radial-gradient(circle,#FBEEC0,rgba(234,201,120,0));pointer-events:none;z-index:4;animation:pvRise linear infinite}
@media (prefers-reduced-motion:reduce){[data-anim]{animation:none!important}.pv-dust,.pv-bokeh{animation:none!important}}
`;

// chibi villager palettes (prototype's peach/blue/violet + cute extras) ──
type Pal = { ear: string; head: string; face: string; eye: string };
const PAL: Pal[] = [
  { ear: "#E4C7F0", head: "#E7CBF2", face: "#F0DEF8", eye: "#472e5a" }, // violet (prototype C)
  { ear: "#F4CE9A", head: "#F6D6A0", face: "#FADFB0", eye: "#3a2a18" }, // peach (prototype A)
  { ear: "#BFD6EC", head: "#CFE0EF", face: "#DCEAF6", eye: "#2b3a52" }, // blue  (prototype B)
  { ear: "#BFE6D2", head: "#CFEEDD", face: "#E0F5EA", eye: "#24503f" }, // mint
  { ear: "#F3C9C7", head: "#F7D6D2", face: "#FBE6E2", eye: "#5a2e2e" }, // rose
  { ear: "#F0D79A", head: "#F5E1AE", face: "#FBEFCC", eye: "#5a4620" }, // gold
  { ear: "#D6CBF0", head: "#E0D6F5", face: "#EEE7FA", eye: "#3d3260" }, // lilac
];
// scene villager plaza spots (spot[0] = central star spot for the active villager)
type Spot = { cx: number; cy: number; s: number; ear: "cat" | "round" };
const SPOTS: Spot[] = [
  { cx: 500, cy: 504, s: 1.1, ear: "cat" },
  { cx: 392, cy: 472, s: 1.0, ear: "cat" },
  { cx: 656, cy: 482, s: 0.98, ear: "round" },
  { cx: 300, cy: 500, s: 0.9, ear: "round" },
  { cx: 742, cy: 512, s: 0.9, ear: "cat" },
  { cx: 432, cy: 552, s: 1.0, ear: "round" },
  { cx: 606, cy: 556, s: 1.0, ear: "cat" },
];
// roster-card body colors (used by the below-scene villager cards)
const BODIES = ["#E7CBF2", "#F6D6A0", "#CFE0EF", "#CFEEDD", "#F7D6D2", "#F5E1AE", "#E0D6F5"];

export default function PetVillage({
  mc,
  liveRun,
  running,
  isWorking,
  petName,
}: {
  mc: MC;
  liveRun: LiveRun | null;
  running: boolean;
  isWorking: boolean;
  petName: string;
}) {
  const [reduce, setReduce] = useState(false);
  const [dust, setDust] = useState<{ w: number; l: number; t: number; d: number; delay: number }[]>([]);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => {
      setReduce(m.matches);
      if (m.matches) {
        setDust([]);
      } else {
        setDust(
          Array.from({ length: 18 }, () => ({
            w: 3 + Math.random() * 5,
            l: 10 + Math.random() * 80,
            t: 42 + Math.random() * 42,
            d: 5 + Math.random() * 6,
            delay: -Math.random() * 8,
          })),
        );
      }
    };
    f();
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);

  const { pillars, kanban, roster, schedules } = mc;

  // ── real-data signals ──
  const memRatio = pillars.memory.cap ? pillars.memory.count / pillars.memory.cap : 0;
  const soulSet = pillars.soul.set;
  const skillActive = roster.some((r) => r.kind === "skill" && r.status === "active");
  const busy = isWorking || running || kanban.working.length > 0;
  const forgeOn = skillActive || busy;

  // ── Memory Library: light windows in proportion to real memory count/cap ──
  const litWindows = memRatio > 0 ? Math.min(6, Math.max(1, Math.round(memRatio * 6))) : 0;

  // ── Clock Spire: hour/minute hands at real local time ──
  const now = new Date();
  const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
  const hrDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;

  // ── Villagers = real roster, capped to the plaza; active one takes the center spot ──
  const capped = roster.slice(0, SPOTS.length);
  const activeIdx = capped.findIndex((r) => r.status === "active");
  const busyFallback = busy && activeIdx === -1;
  const ordered =
    activeIdx > 0
      ? [capped[activeIdx], ...capped.slice(0, activeIdx), ...capped.slice(activeIdx + 1)]
      : capped;

  const courierPath = "M540 680 C 520 618, 566 520, 540 456";

  return (
    <>
      <style>{KF}</style>

      {/* ══════════ THE PREMIUM VILLAGE CARD ══════════ */}
      <div style={frame}>
        <div className="pv-rays" aria-hidden />
        <div className="pv-bokeh" data-anim aria-hidden style={{ width: 120, height: 120, left: "12%", top: "16%", background: "radial-gradient(circle,rgba(234,201,120,.5),transparent 70%)" }} />
        <div className="pv-bokeh" data-anim aria-hidden style={{ width: 90, height: 90, left: "80%", top: "12%", background: "radial-gradient(circle,rgba(138,114,218,.4),transparent 70%)", animationDelay: "-5s" }} />
        <div className="pv-bokeh" data-anim aria-hidden style={{ width: 70, height: 70, left: "64%", top: "8%", background: "radial-gradient(circle,rgba(40,179,154,.4),transparent 70%)", animationDelay: "-9s" }} />

        {/* head — title + glass stat chips */}
        <div style={headRow}>
          <div style={{ minWidth: 0 }}>
            <div style={titleStyle}>
              The <b style={titleGrad}>Pet Village</b>
            </div>
            <div style={subStyle}>{petName}&rsquo;s town — your agent&rsquo;s living world</div>
          </div>
          <div style={chipBar}>
            <Chip k="Memory" v={`${pillars.memory.count}`} small={`/${pillars.memory.cap}`} />
            <Chip k="Skills" v={`${pillars.skills.installed}`} />
            <Chip k="Routines" v={`${pillars.crons.routines}`} />
            <Chip k="Soul" v={soulSet ? `v${pillars.soul.checkpoints} ★` : "not set"} gold={soulSet} />
          </div>
        </div>

        <svg
          viewBox="0 0 1080 680"
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label={`${petName}'s village — each building is one of your pet's agent pillars, rendered over live data`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
        >
          <defs>
            <radialGradient id="pvIslTop" cx="46%" cy="30%" r="80%"><stop offset="0%" stopColor="#EAF6D8" /><stop offset="55%" stopColor="#CDE7B0" /><stop offset="100%" stopColor="#A9CE86" /></radialGradient>
            <linearGradient id="pvIslSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B8925E" /><stop offset="55%" stopColor="#8A6A44" /><stop offset="100%" stopColor="#6E5236" /></linearGradient>
            <radialGradient id="pvOrbG" cx="40%" cy="34%" r="72%"><stop offset="0%" stopColor="#FFF7E4" /><stop offset="34%" stopColor="#F6DA92" /><stop offset="70%" stopColor="#EBAA3E" /><stop offset="100%" stopColor="#9A5E1C" /></radialGradient>
            <radialGradient id="pvOrbHalo" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(255,226,150,.85)" /><stop offset="100%" stopColor="rgba(255,226,150,0)" /></radialGradient>
            <linearGradient id="pvGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FBEEC0" /><stop offset="100%" stopColor="#C8932F" /></linearGradient>
            <linearGradient id="pvWin" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFF4CE" /><stop offset="100%" stopColor="#F3C766" /></linearGradient>
            <linearGradient id="pvRoofTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B49BEA" /><stop offset="100%" stopColor="#8A72DA" /></linearGradient>
            <linearGradient id="pvRoofLeft" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7C63C8" /><stop offset="100%" stopColor="#5B429E" /></linearGradient>
            <linearGradient id="pvWTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FBF3E6" /><stop offset="100%" stopColor="#F1E3CE" /></linearGradient>
            <linearGradient id="pvWLeft" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E7D4B6" /><stop offset="100%" stopColor="#D3BC97" /></linearGradient>
            <linearGradient id="pvWRight" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D0B892" /><stop offset="100%" stopColor="#B89A6E" /></linearGradient>
            <linearGradient id="pvTTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4FD0B4" /><stop offset="100%" stopColor="#28B39A" /></linearGradient>
            <linearGradient id="pvGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(255,255,255,.9)" /><stop offset="60%" stopColor="rgba(255,255,255,0)" /></linearGradient>
            <filter id="pvSoft" x="-60%" y="-60%" width="220%" height="240%"><feGaussianBlur in="SourceAlpha" stdDeviation="9" /><feOffset dy="12" /><feComponentTransfer><feFuncA type="linear" slope="0.30" /></feComponentTransfer><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <filter id="pvGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="10" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>

          {/* ======== FLOATING ISLAND (premium diorama) ======== */}
          <ellipse cx="540" cy="628" rx="420" ry="52" fill="rgba(70,40,110,.22)" filter="url(#pvGlow)" />
          <path d="M170 440 Q 540 360 910 440 L 820 520 Q 620 585 540 592 Q 460 585 260 520 Z" fill="url(#pvIslSide)" />
          <path d="M260 520 Q 460 585 540 592 Q 620 585 820 520 L 760 556 Q 600 604 540 610 Q 480 604 320 556 Z" fill="#5E4630" opacity=".55" />
          <g opacity=".8"><path d="M300 596 l26 -14 l24 16 l-14 22 Z" fill="url(#pvIslSide)" /></g>
          <g opacity=".8"><path d="M740 604 l22 -12 l20 14 l-12 18 Z" fill="url(#pvIslSide)" /></g>
          <ellipse cx="540" cy="432" rx="372" ry="96" fill="url(#pvIslTop)" />
          <ellipse cx="540" cy="432" rx="372" ry="96" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="3" />
          <path d="M540 452 Q 512 512 500 560 L 580 560 Q 568 512 540 452 Z" fill="#E7DAB8" opacity=".8" />
          <g fill="#D8C79A" opacity=".8"><ellipse cx="524" cy="500" rx="13" ry="5" /><ellipse cx="556" cy="500" rx="13" ry="5" /><ellipse cx="516" cy="528" rx="15" ry="6" /><ellipse cx="564" cy="528" rx="15" ry="6" /></g>

          {/* ======== MEMORY LIBRARY (back-left, tall) — lit windows ∝ memory/cap ======== */}
          <g filter="url(#pvSoft)" data-anim style={{ transformBox: "fill-box", transformOrigin: "bottom", animation: "pvBob 6.4s ease-in-out infinite" }}>
            <path d="M232 258 l70 -34 l70 34 l0 150 l-70 20 l-70 -20 Z" fill="url(#pvWRight)" />
            <path d="M232 258 l70 20 l0 150 l-70 -20 Z" fill="url(#pvWLeft)" />
            <path d="M302 278 l70 -20 l0 150 l-70 20 Z" fill="url(#pvWRight)" opacity=".92" />
            <path d="M232 258 l70 -34 l70 34 l-70 20 Z" fill="url(#pvWTop)" />
            <path d="M232 258 l70 20 l0 46 l-70 -20 Z" fill="url(#pvGloss)" opacity=".5" />
            <path d="M224 260 l78 -46 l78 46 l-78 22 Z" fill="url(#pvRoofTop)" />
            <path d="M224 260 l78 22 l0 8 l-78 -22 Z" fill="url(#pvRoofLeft)" />
            <rect x="296" y="196" width="12" height="20" rx="3" fill="url(#pvGold)" />
            {/* glowing windows — the first `litWindows` are lit (real memory fraction) */}
            <g filter="url(#pvGlow)">
              {[
                "M250 296 l16 5 l0 20 l-16 -5 Z",
                "M272 302 l16 4 l0 20 l-16 -4 Z",
                "M312 296 l16 -5 l0 20 l-16 5 Z",
                "M334 290 l16 -5 l0 20 l-16 5 Z",
                "M250 328 l16 5 l0 20 l-16 -5 Z",
                "M312 328 l16 -5 l0 20 l-16 5 Z",
              ].map((d, i) => (
                <path key={i} d={d} fill={i < litWindows ? "url(#pvWin)" : "#C9B3E6"} />
              ))}
            </g>
            <path d="M232 372 l70 20 l0 8 l-70 -20 Z" fill="url(#pvGold)" opacity=".9" />
          </g>

          {/* ======== SKILLS FORGE (right, mint roof) — fire lit when a skill runs ======== */}
          <g filter="url(#pvSoft)" data-anim style={{ transformBox: "fill-box", transformOrigin: "bottom", animation: "pvBob 7s ease-in-out .3s infinite" }}>
            <path d="M690 322 l58 -28 l58 28 l0 108 l-58 18 l-58 -18 Z" fill="url(#pvWRight)" />
            <path d="M690 322 l58 18 l0 108 l-58 -18 Z" fill="url(#pvWLeft)" />
            <path d="M748 340 l58 -18 l0 108 l-58 18 Z" fill="url(#pvWRight)" opacity=".92" />
            <path d="M690 322 l58 -28 l58 28 l-58 16 Z" fill="url(#pvWTop)" />
            <path d="M682 324 l66 -34 l66 34 l-66 18 Z" fill="url(#pvTTop)" />
            <path d="M682 324 l66 18 l0 8 l-66 -18 Z" fill="#178C74" />
            <rect x="742" y="270" width="10" height="16" rx="3" fill="url(#pvGold)" />
            <g filter="url(#pvGlow)">
              <path d="M720 356 l40 12 l0 34 l-40 -12 Z" fill="url(#pvWin)" />
              {forgeOn ? (
                <g data-anim style={{ transformBox: "fill-box", transformOrigin: "742px 382px", animation: "pvFlame 1.5s ease-in-out infinite" }}>
                  <circle cx="742" cy="382" r="11" fill="#E8853C" />
                  <circle cx="742" cy="382" r="6" fill="#FFDD9E" />
                </g>
              ) : (
                <circle cx="742" cy="382" r="9" fill="#C9A15E" opacity=".55" />
              )}
            </g>
            <path d="M690 424 l58 18 l0 8 l-58 -18 Z" fill="url(#pvGold)" opacity=".9" />
          </g>

          {/* ======== SOUL SHRINE (mid, rose) — gold flame emblem lit when persona is set ======== */}
          <g filter="url(#pvSoft)" data-anim style={{ transformBox: "fill-box", transformOrigin: "bottom", animation: "pvBob 7.6s ease-in-out .15s infinite" }}>
            <path d="M596 352 l46 -22 l46 22 l0 86 l-46 14 l-46 -14 Z" fill="url(#pvWRight)" />
            <path d="M596 352 l46 14 l0 86 l-46 -14 Z" fill="url(#pvWLeft)" />
            <path d="M642 366 l46 -14 l0 86 l-46 14 Z" fill="url(#pvWRight)" opacity=".92" />
            <path d="M588 354 l54 -30 l54 30 l-54 16 Z" fill="url(#pvRoofTop)" />
            <path d="M588 354 l54 16 l0 8 l-54 -16 Z" fill="url(#pvRoofLeft)" />
            {soulSet ? (
              <path d="M632 372 h20 v16 l-10 8 l-10 -8 Z" fill="url(#pvGold)" filter="url(#pvGlow)" />
            ) : (
              <path d="M634 384 h16" stroke={MUTED} strokeWidth="3" strokeLinecap="round" />
            )}
            <path d="M596 430 l46 14 l0 8 l-46 -14 Z" fill="url(#pvGold)" opacity=".9" />
          </g>

          {/* ======== CLOCK SPIRE (far right, sky) — hands at real local time ======== */}
          <g filter="url(#pvSoft)" data-anim style={{ transformBox: "fill-box", transformOrigin: "bottom", animation: "pvBob 8.4s ease-in-out infinite" }}>
            <path d="M838 270 l34 -16 l34 16 l0 160 l-34 12 l-34 -12 Z" fill="#CFE0EF" />
            <path d="M838 270 l34 12 l0 160 l-34 -12 Z" fill="#B4CAE0" />
            <path d="M872 282 l34 -12 l0 160 l-34 12 Z" fill="#A9C0D8" />
            <path d="M832 272 l40 -22 l40 22 l-40 14 Z" fill="url(#pvRoofTop)" />
            <circle cx="872" cy="228" r="6" fill="url(#pvGold)" />
            <circle cx="872" cy="322" r="26" fill="#FBF4E4" stroke="url(#pvGold)" strokeWidth="4" />
            <line x1="872" y1="322" x2="872" y2="307" stroke="#4A3A24" strokeWidth="3.2" strokeLinecap="round" transform={`rotate(${hrDeg} 872 322)`} />
            <line x1="872" y1="322" x2="872" y2="300" stroke="#8A5A1E" strokeWidth="2.8" strokeLinecap="round" transform={`rotate(${minDeg} 872 322)`} />
            <line x1="872" y1="326" x2="872" y2="298" stroke={PURPLE} strokeWidth="1.4" strokeLinecap="round">
              {!reduce && <animateTransform attributeName="transform" type="rotate" from="0 872 322" to="360 872 322" dur="60s" repeatCount="indefinite" />}
            </line>
            <circle cx="872" cy="322" r="3" fill="#4A3A24" />
          </g>

          {/* ======== SOUL FOUNTAIN (focal glowing orb + halo) — ripples when busy ======== */}
          <g data-anim style={{ transformBox: "fill-box", transformOrigin: "540px 470px" }}>
            <circle cx="540" cy="452" r="92" fill="url(#pvOrbHalo)" data-anim style={{ animation: "pvPulse 4s ease-in-out infinite" }} />
          </g>
          <ellipse cx="540" cy="486" rx="86" ry="30" fill="#BFE6DA" />
          <ellipse cx="540" cy="486" rx="86" ry="30" fill="none" stroke="url(#pvGold)" strokeWidth="4" />
          <ellipse cx="540" cy="482" rx="70" ry="22" fill="#28B39A" opacity=".5" />
          {busy && !reduce && (
            <ellipse data-anim cx="540" cy="484" rx="60" ry="20" fill="none" stroke="rgba(138,114,218,.6)" strokeWidth="3" style={{ transformBox: "fill-box", transformOrigin: "540px 484px", animation: "pvRing 2.4s ease-out infinite" }} />
          )}
          <circle cx="540" cy="454" r="42" fill="url(#pvOrbG)" filter="url(#pvGlow)" />
          <ellipse cx="526" cy="440" rx="15" ry="10" fill="rgba(255,255,255,.75)" />
          <text x="540" y="463" textAnchor="middle" fontSize="26" fill="#6B4A16" fontWeight="700">★</text>

          {/* ======== CHIBI PET VILLAGERS = the real roster ======== */}
          {ordered.map((r, i) => {
            const spot = SPOTS[i];
            const active = r.status === "active" || (busyFallback && i === 0);
            return (
              <Chibi
                key={r.id}
                cx={spot.cx}
                cy={spot.cy}
                scale={spot.s}
                ear={spot.ear}
                pal={PAL[i % PAL.length]}
                active={active}
                delay={`${-(i * 0.5).toFixed(1)}s`}
              />
            );
          })}

          {/* foreground foliage */}
          <g filter="url(#pvSoft)"><ellipse cx="196" cy="470" rx="30" ry="34" fill="#7FAE66" /><ellipse cx="212" cy="452" rx="20" ry="22" fill="#9AC57E" /><rect x="190" y="486" width="10" height="18" rx="3" fill="#7E5E3E" /></g>
          <g filter="url(#pvSoft)"><ellipse cx="900" cy="484" rx="26" ry="30" fill="#7FAE66" /><rect x="895" y="498" width="9" height="16" rx="3" fill="#7E5E3E" /></g>

          {/* ======== DISPATCH COURIER — a gold spark runs to the fountain while a run streams ======== */}
          {running && !reduce && (
            <g>
              <circle r="8" fill="url(#pvGold)" stroke="#8A5A1E" strokeWidth="1.4">
                <animateMotion path={courierPath} dur="1.5s" repeatCount="indefinite" />
              </circle>
              <circle r="4" fill={TERRA2} opacity="0.7">
                <animateMotion path={courierPath} dur="1.5s" begin="-0.28s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </svg>

        {/* floating gold dust */}
        <div style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none", overflow: "hidden" }} aria-hidden>
          {dust.map((p, i) => (
            <span
              key={i}
              className="pv-dust"
              style={{ width: p.w, height: p.w, left: `${p.l}%`, top: `${p.t}%`, animationDuration: `${p.d}s`, animationDelay: `${p.delay}s` }}
            />
          ))}
        </div>

        {/* foot caption */}
        <div style={footStyle}>
          {busy ? (
            <>the village is <b style={{ color: "#5B429E" }}>alive</b> — a courier is running to the fountain</>
          ) : (
            <>the village is <b style={{ color: "#5B429E" }}>alive</b> — dispatch a goal &amp; watch a courier run to the fountain</>
          )}
        </div>
      </div>

      {/* readable legend — the same real metrics as plain text under the scene */}
      <div style={legendRow}>
        <Legend accent={PURPLE} name="Soul Shrine" value={soulSet ? pillars.soul.persona : "not set"} sub={`v${pillars.soul.checkpoints}`} />
        <Legend accent={TERRA} name="Memory Library" value={`${pillars.memory.count}/${pillars.memory.cap}`} sub={pillars.memory.updatedAt ? relTime(pillars.memory.updatedAt) : "empty"} />
        <Legend accent={TERRA2} name="Owner Facts" value={`${pillars.user.count}/${pillars.user.cap}`} sub="what it knows about you" />
        <Legend accent={SAGE} name="Skills Forge" value={`${pillars.skills.total}`} sub={`${pillars.skills.installed} installed`} />
        <Legend accent={PURPLE} name="Clock Spire" value={`${pillars.crons.routines} routines`} sub={pillars.crons.nextLabel} />
      </div>

      {/* ── the town square (kanban) ── */}
      <div style={{ marginTop: 22 }}>
        <SectionHead mono="THE TOWN SQUARE" title="What the village is doing" />
        <div style={squareGrid}>
          <Stall label="NOTICE BOARD" hint="pending" accent={MUTED} count={kanban.pending.length} empty="The board is clear — nothing queued.">
            {kanban.pending.map((it) => (
              <VCard key={String(it.id)} accent={MUTED} title={it.title} detail={it.detail} tag={it.kind} />
            ))}
          </Stall>
          <Stall label="AT THE FOUNTAIN" hint="working" accent={PURPLE} count={kanban.working.length + (liveRun && !liveRun.done ? 1 : 0)} empty="The square is quiet — dispatch a goal.">
            {liveRun && (
              <VCard pulse accent={PURPLE} title={liveRun.title} tag={liveRun.done ? "done" : "live"}
                detail={liveRun.done ? "finishing…" : `${liveRun.steps.length} step${liveRun.steps.length === 1 ? "" : "s"} · ${liveRun.steps.map((s) => s.skill).join(" → ") || "planning…"}`} />
            )}
            {kanban.working.map((it) => (
              <VCard key={String(it.id)} pulse accent={PURPLE} title={it.title} detail={it.detail} tag={it.skill} />
            ))}
          </Stall>
          <Stall label="STUCK CORNER" hint="blocked" accent="#b45309" count={kanban.blocked.length} empty="No one is stuck today.">
            {kanban.blocked.map((it) => (
              <VCard key={String(it.id)} accent="#b45309" title={it.title} detail={it.reason} sub={relTime(it.at)} tag="no-op" />
            ))}
          </Stall>
          <Stall label="LANTERNS LIT" hint="done today" accent={SAGE} count={kanban.done.length} empty="No lanterns lit yet today.">
            {kanban.done.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                {kanban.done.slice(0, 12).map((it) => (
                  <span key={"ln" + String(it.id)} title={it.title} style={{ fontSize: 15, lineHeight: 1 }}>🏮</span>
                ))}
              </div>
            )}
            {kanban.done.map((it) => (
              <VCard key={String(it.id)} accent={SAGE} title={it.title} detail={`${it.skill}${it.credits ? ` · ${it.credits} cr` : ""}`} sub={relTime(it.at)} tag="done" />
            ))}
          </Stall>
        </div>
      </div>

      {/* ── villagers (roster) ── */}
      <VillagersSection roster={roster} />

      {/* ── the village almanac (schedules) ── */}
      <div style={{ marginTop: 26 }}>
        <SectionHead mono="THE ALMANAC" title="Clock-spire routines" />
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          {schedules.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? `1px solid ${HAIR}` : "none", flexWrap: "wrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: s.lastRun ? SAGE : "rgba(33,26,18,0.2)", flexShrink: 0 }} />
              <span style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: INK, minWidth: 130 }}>{s.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: PURPLE, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(107,79,160,0.08)" }}>{s.cadence}</span>
              <span style={{ fontFamily: SANS, fontSize: 13, color: MUTED, flex: 1, minWidth: 160 }}>{s.desc}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>last: {relTime(s.lastRun)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── a cute chibi pet villager (prototype's shapes/gradients; active one lifts + emits wisps) ──
function Chibi({ cx, cy, scale, ear, pal, active, delay }: { cx: number; cy: number; scale: number; ear: "cat" | "round"; pal: Pal; active: boolean; delay: string }) {
  const anim = active ? "pvBobw 1.7s" : "pvBob 3.4s";
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      <ellipse cx="0" cy="30" rx="30" ry="9" fill="rgba(36,26,18,.18)" />
      <g data-anim style={{ transformBox: "fill-box", transformOrigin: "bottom", animation: `${anim} ease-in-out infinite`, animationDelay: delay }}>
        {/* ears */}
        {ear === "cat" ? (
          <>
            <path d="M-22 -4 l-8 -20 l20 10 Z" fill={pal.ear} />
            <path d="M22 -4 l8 -20 l-20 10 Z" fill={pal.ear} />
          </>
        ) : (
          <>
            <ellipse cx="-14" cy="-2" rx="9" ry="14" fill={pal.ear} />
            <ellipse cx="14" cy="-2" rx="9" ry="14" fill={pal.ear} />
          </>
        )}
        {/* head/face */}
        <ellipse cx="0" cy="0" rx="30" ry="32" fill={pal.head} />
        <ellipse cx="0" cy="-6" rx="26" ry="26" fill={pal.face} />
        {/* eyes + highlights + blush + smile */}
        <ellipse cx="-11" cy="-4" rx="4.6" ry="5.4" fill={pal.eye} />
        <ellipse cx="11" cy="-4" rx="4.6" ry="5.4" fill={pal.eye} />
        <circle cx="-12.5" cy="-5.5" r="1.6" fill="#fff" />
        <circle cx="9.5" cy="-5.5" r="1.6" fill="#fff" />
        <circle cx="-19" cy="6" r="5" fill="#F3A9A0" opacity=".75" />
        <circle cx="19" cy="6" r="5" fill="#F3A9A0" opacity=".75" />
        <path d="M-5 6 q5 5 10 0" stroke={pal.eye} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {/* gold wisps rise off the active villager */}
        {active && (
          <g data-anim style={{ transformBox: "fill-box", transformOrigin: "center", animation: "pvWisp 2.1s ease-out infinite", animationDelay: delay }}>
            <path d="M0 -38 l3 -6 l3 6 l6 3 l-6 3 l-3 6 l-3 -6 l-6 -3 Z" fill="url(#pvGold)" />
            <circle cx="14" cy="-52" r="3" fill="url(#pvGold)" opacity=".8" />
            <circle cx="-10" cy="-56" r="2.4" fill="url(#pvGold)" opacity=".6" />
          </g>
        )}
      </g>
    </g>
  );
}

// ── a glass stat chip (backdrop-blur) ──
function Chip({ k, v, small, gold }: { k: string; v: string; small?: string; gold?: boolean }) {
  return (
    <div style={chipStyle}>
      <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.16em", color: MUTED, textTransform: "uppercase" }}>{k}</span>
      <span style={gold ? { ...chipVal, ...chipGold } : chipVal}>
        {v}{small && <small style={{ fontWeight: 600, fontSize: 13, color: MUTED }}>{small}</small>}
      </span>
    </div>
  );
}

// ── villagers roster (skills guild + library keepers) ──
function VillagersSection({ roster }: { roster: Staff[] }) {
  const skills = roster.filter((r) => r.kind === "skill");
  const vigil = roster.filter((r) => r.kind === "vigil");
  return (
    <div style={{ marginTop: 26 }}>
      <SectionHead mono="THE VILLAGERS" title="Who lives and works here" />
      <div style={{ marginBottom: 8, fontFamily: MONO, fontSize: 13, letterSpacing: "0.1em", color: SAGE, fontWeight: 700 }}>WORKSHOP GUILD · skills</div>
      <div style={villagerGrid}>
        {skills.map((s, i) => <VillagerCard key={s.id} s={s} accent={SAGE} idx={i} />)}
      </div>
      <div style={{ margin: "18px 0 8px", fontFamily: MONO, fontSize: 13, letterSpacing: "0.1em", color: PURPLE, fontWeight: 700 }}>LIBRARY KEEPERS · always-on VIGIL crew</div>
      <div style={villagerGrid}>
        {vigil.map((s, i) => <VillagerCard key={s.id} s={s} accent={PURPLE} idx={i} />)}
      </div>
    </div>
  );
}

function VillagerCard({ s, accent, idx }: { s: Staff; accent: string; idx: number }) {
  const active = s.status === "active";
  const body = BODIES[idx % BODIES.length];
  return (
    <div style={{ ...card, padding: "12px 13px", opacity: s.installed ? 1 : 0.62, display: "flex", gap: 11, alignItems: "flex-start" }}>
      <svg width="34" height="38" viewBox="-28 -40 56 56" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden>
        <ellipse cx="0" cy="26" rx="20" ry="6" fill="rgba(36,27,18,.14)" />
        {idx % 2 === 0 ? (
          <>
            <path d="M-17,-18 l-5,-16 l16,8 Z" fill={body} />
            <path d="M17,-18 l5,-16 l-16,8 Z" fill={body} />
          </>
        ) : (
          <>
            <ellipse cx="-13" cy="-22" rx="7" ry="10" fill={body} />
            <ellipse cx="13" cy="-22" rx="7" ry="10" fill={body} />
          </>
        )}
        <ellipse cx="0" cy="0" rx="24" ry="26" fill={active ? body : WALL_DK} stroke={active ? accent : "none"} strokeWidth={active ? 2 : 0} />
        <circle cx="-8" cy="-2" r="3.2" fill="#3A2A18" />
        <circle cx="8" cy="-2" r="3.2" fill="#3A2A18" />
        <circle cx="-14" cy="5" r="3.6" fill="#F3A9A0" opacity="0.7" />
        <circle cx="14" cy="5" r="3.6" fill="#F3A9A0" opacity="0.7" />
        <path d="M-4,4 q4,4 8,0" stroke="#3A2A18" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: active ? accent : "rgba(33,26,18,0.22)", flexShrink: 0 }} />
          <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.4, marginTop: 3, minHeight: 34 }}>{s.role}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: INK }}>{s.runs} run{s.runs === 1 ? "" : "s"}</span>
          {typeof s.successRate === "number" && <span style={{ fontFamily: MONO, fontSize: 13, color: SAGE, fontWeight: 700 }}>{s.successRate}%</span>}
          {s.lastAt && <span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.4)" }}>{relTime(s.lastAt)}</span>}
          {!s.installed && <span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.35)" }}>available</span>}
        </div>
      </div>
    </div>
  );
}

// ── town-square stall (kanban column, village-dressed) ──
function Stall({ label, hint, accent, count, empty, children }: { label: string; hint: string; accent: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <div style={{ background: FIELD, borderRadius: 16, border: `1px solid ${HAIR}`, padding: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, padding: "2px 4px" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.08em", color: accent, fontWeight: 700 }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: INK, background: PAPER, borderRadius: 99, minWidth: 22, textAlign: "center", padding: "1px 7px", border: `1px solid ${HAIR}` }}>{count}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: "rgba(33,26,18,0.4)", padding: "0 4px 8px", fontStyle: "italic" }}>{hint}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {count > 0 ? children : (
          <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.5, padding: "14px 10px", textAlign: "center", border: `1px dashed ${HAIR}`, borderRadius: 12 }}>
            {empty}
          </div>
        )}
      </div>
    </div>
  );
}

function VCard({ title, detail, sub, tag, accent, pulse }: { title: string; detail?: string; sub?: string; tag?: string; accent: string; pulse?: boolean }) {
  return (
    <div style={{ background: PAPER, borderRadius: 12, border: `1px solid ${HAIR}`, borderLeft: `3px solid ${accent}`, padding: "11px 12px", boxShadow: SHADOW_CARD, animation: pulse ? "officePulse 1.8s ease-in-out infinite" : undefined }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: INK, lineHeight: 1.35, minWidth: 0 }}>{title}</div>
        {tag && <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 13, fontWeight: 700, color: accent, background: "rgba(33,26,18,0.04)", borderRadius: 6, padding: "1px 7px" }}>{tag}</span>}
      </div>
      {detail && <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, marginTop: 5, lineHeight: 1.45, wordBreak: "break-word" }}>{detail}</div>}
      {sub && <div style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.4)", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function Legend({ accent, name, value, sub }: { accent: string; name: string; value: string; sub: string }) {
  return (
    <div style={{ flex: "1 1 150px", minWidth: 0, padding: "10px 12px", background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 12, borderTop: `3px solid ${accent}` }}>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.06em", color: accent, fontWeight: 700, textTransform: "uppercase" }}>{name}</div>
      <div style={{ fontFamily: DISP, fontSize: 17, fontWeight: 800, color: INK, margin: "3px 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
    </div>
  );
}

function SectionHead({ mono, title }: { mono: string; title: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.16em", color: PURPLE, fontWeight: 700 }}>{mono}</div>
      <h2 style={{ fontFamily: DISP, fontSize: 22, fontWeight: 800, color: INK, letterSpacing: "-0.02em", margin: "3px 0 0" }}>{title}</h2>
    </div>
  );
}

// ── styles ──
const card: React.CSSProperties = { background: PAPER, borderRadius: 16, padding: 20, border: `1px solid ${HAIR}`, boxShadow: SHADOW_CARD };
const frame: React.CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "1080 / 680",
  borderRadius: 32,
  overflow: "hidden",
  background:
    "radial-gradient(90% 70% at 22% 8%, #FFF6E4 0%, rgba(255,246,228,0) 46%)," +
    "radial-gradient(80% 80% at 88% 20%, #F3E1F0 0%, rgba(243,225,240,0) 55%)," +
    "linear-gradient(170deg,#FDF6EA 0%,#F6E7EF 40%,#ECE0F4 74%,#E4DAF2 100%)",
  boxShadow: "0 50px 110px -50px rgba(60,40,110,.65), inset 0 1px 0 rgba(255,255,255,.6), 0 0 0 1px " + HAIR,
};
const headRow: React.CSSProperties = { position: "absolute", top: 26, left: 30, right: 30, zIndex: 8, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const titleStyle: React.CSSProperties = { fontFamily: DISP, fontWeight: 700, fontSize: "clamp(18px,2.3vw,23px)", letterSpacing: "-0.02em", lineHeight: 1.1, color: INK, textShadow: "0 1px 0 rgba(255,255,255,.5)" };
const titleGrad: React.CSSProperties = { background: "linear-gradient(100deg,#8A72DA,#28B39A 55%,#C8932F)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };
const subStyle: React.CSSProperties = { marginTop: 4, fontFamily: SANS, fontSize: 13, color: MUTED, fontWeight: 500, maxWidth: 340 };
const chipBar: React.CSSProperties = { display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "flex-end" };
const chipStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 1, padding: "9px 13px", borderRadius: 15, textAlign: "center",
  background: "rgba(255,255,255,.58)", backdropFilter: "blur(11px) saturate(1.2)", WebkitBackdropFilter: "blur(11px) saturate(1.2)",
  border: "1px solid rgba(255,255,255,.75)", boxShadow: "0 10px 24px -14px rgba(70,40,110,.55), inset 0 1px 0 rgba(255,255,255,.9)",
};
const chipVal: React.CSSProperties = { fontFamily: DISP, fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: INK, marginTop: 1 };
const chipGold: React.CSSProperties = { background: "linear-gradient(#EAC978,#C8932F)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };
const footStyle: React.CSSProperties = { position: "absolute", left: 30, bottom: 22, zIndex: 8, fontFamily: MONO, fontSize: 13, letterSpacing: "0.03em", color: MUTED };
const legendRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const squareGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const villagerGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 };

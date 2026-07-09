"use client";

/**
 * PetVillage — the flagship "wow" surface: a premium, cute 2.5D town rendered over the
 * SAME REAL mission-control data (GET /api/petclaw/mission-control) that the classic
 * Agent Office shows. Nothing is fabricated — every number, glow, and lit window maps
 * to a real pillar/roster/kanban signal, and every empty state stays honest.
 *
 * The scene reproduces the approved "Pet Village — Premium" prototype: soft 2.5D
 * buildings (front/top/side faces + gloss + foil-gold trim), a glowing central Soul
 * Fountain orb, glass stat chips (backdrop-blur), a slow holographic sheen, a faint
 * perspective grid horizon, chibi pet villagers (the ACTIVE one lifts + emits gold
 * wisps), and floating gold dust. Data → scene mapping:
 *   • Memory Library — lit window count ∝ memory count / cap.
 *   • Skills Forge   — forge fire glows when a skill is running (real installed count in chip).
 *   • Clock Spire    — hour/minute hands at real local time; routine count + next cron in chip/legend.
 *   • Soul Shrine    — gold heart emblem lit when the persona is set.
 *   • Soul Fountain  — the busy square; ripples when the office is working.
 *   • Villagers      — the real roster (skills + VIGIL crew); active ones lift + emit wisps.
 *   • Courier        — a spark runs from the dispatch up to the fountain while an SSE run streams.
 *
 * Pure inline SVG + CSS transforms (no external assets, no heavy per-frame loops). All
 * motion carries `data-anim` so `prefers-reduced-motion: reduce` silences it in one CSS
 * rule; SMIL (courier, second hand) is additionally gated by a JS reduced-motion flag.
 */

import { useEffect, useState } from "react";
import type { MC, Staff, LiveRun } from "./AgentOffice";

// ── tokens (Collectible Editorial) ──
const INK = "#211A12";
const MUTED = "#7A6E5A";
const PURPLE = "#6B4FA0";
const TERRA = "#9A4E1E";
const TERRA2 = "#BE4F28";
const SAGE = "#5C8A4E";
const PAPER = "#FBF6EC";
const FOIL = "#E8C77E";
const FOIL_DK = "#C8932F";
const FIELD = "#ECE4D4";
const DISP = "var(--ed-disp, sans-serif)";
const SANS = "var(--ed-body, sans-serif)";
const MONO = "var(--ed-m, ui-monospace, monospace)";
const HAIR = "rgba(33,26,18,0.13)";
const SHADOW_CARD = "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))";

// scene fills (chibi palette)
const WALL = "#F3E7CE";
const WALL_DK = "#E3D3B2";

function relTime(ts?: string | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── motion (data-anim = one-rule reduced-motion kill switch) ──
const KF = `
@keyframes vBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes vBobL{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes vWork{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@keyframes vPulse{0%,100%{opacity:.5;transform:scale(.94)}50%{opacity:.95;transform:scale(1.06)}}
@keyframes vRise{0%{opacity:0;transform:translateY(6px)}30%{opacity:1}100%{opacity:0;transform:translateY(-22px)}}
@keyframes vFlame{0%,100%{transform:scaleY(1) scaleX(1)}45%{transform:scaleY(.82) scaleX(1.08)}}
@keyframes vRing{0%{opacity:.5;transform:scale(.6)}100%{opacity:0;transform:scale(1.5)}}
@keyframes vSheen{0%,100%{background-position:0% 0}50%{background-position:100% 0}}
@keyframes vDust{0%{transform:translateY(20px) scale(.6);opacity:0}15%{opacity:.9}100%{transform:translateY(-160px) scale(1);opacity:0}}
.pv-sheen{position:absolute;inset:0;pointer-events:none;opacity:.5;mix-blend-mode:screen;z-index:3;background:linear-gradient(115deg,transparent 30%,rgba(129,104,206,.10) 44%,rgba(32,163,134,.10) 52%,rgba(232,199,126,.12) 60%,transparent 74%);background-size:250% 100%;animation:vSheen 9s ease-in-out infinite}
.pv-grid{position:absolute;left:0;right:0;top:42%;bottom:0;pointer-events:none;opacity:.13;z-index:2;background-image:linear-gradient(rgba(91,66,158,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(91,66,158,.4) 1px,transparent 1px);background-size:52px 30px;transform:perspective(420px) rotateX(58deg);transform-origin:top;-webkit-mask-image:linear-gradient(transparent,#000 65%);mask-image:linear-gradient(transparent,#000 65%)}
.pv-dust{position:absolute;border-radius:50%;background:radial-gradient(circle,#FBEAB6,rgba(232,199,126,0));pointer-events:none;animation:vDust linear infinite}
@media (prefers-reduced-motion:reduce){[data-anim]{animation:none!important}}
`;

// chibi villager palette
const BODIES = ["#F6D9A6", "#CFE0EF", "#E7C9F0", "#CDE6C6", "#F3C9C0", "#D6CBF0", "#F7CBA0"];
type Spot = { x: number; y: number; ear: "cat" | "round"; s: number };
const SPOTS: Spot[] = [
  { x: 336, y: 520, ear: "cat", s: 1.0 },
  { x: 704, y: 528, ear: "round", s: 1.0 },
  { x: 250, y: 552, ear: "cat", s: 0.92 },
  { x: 792, y: 544, ear: "round", s: 0.9 },
  { x: 420, y: 574, ear: "cat", s: 1.06 },
  { x: 612, y: 580, ear: "round", s: 1.04 },
  { x: 520, y: 606, ear: "cat", s: 1.1 },
];

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
          Array.from({ length: 16 }, () => ({
            w: 3 + Math.random() * 5,
            l: 8 + Math.random() * 84,
            t: 46 + Math.random() * 40,
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

  // ── clock hands from real local time ──
  const now = new Date();
  const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
  const hrDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;

  // ── villagers = real roster, capped honestly to the plaza spots ──
  const villagers = roster.slice(0, SPOTS.length);
  const anyActive = villagers.some((r) => r.status === "active");

  return (
    <>
      <style>{KF}</style>

      {/* ══════════ THE PREMIUM VILLAGE CARD ══════════ */}
      <div style={sceneCard}>
        <svg
          viewBox="0 0 1040 660"
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label={`${petName}'s village — each building is one of your pet's agent pillars, rendered over live data`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
        >
          <defs>
            <radialGradient id="pvGround" cx="50%" cy="34%" r="72%">
              <stop offset="0%" stopColor="#F7F2E4" />
              <stop offset="60%" stopColor="#E7E0D0" />
              <stop offset="100%" stopColor="#D8D3E4" />
            </radialGradient>
            <linearGradient id="pvGrass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#CFE1B0" />
              <stop offset="100%" stopColor="#A9C88C" />
            </linearGradient>
            <linearGradient id="pvGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FBEAB6" />
              <stop offset="100%" stopColor="#C8932F" />
            </linearGradient>
            <radialGradient id="pvOrb" cx="42%" cy="36%" r="70%">
              <stop offset="0%" stopColor="#FFF8E6" />
              <stop offset="38%" stopColor="#F4D98C" />
              <stop offset="72%" stopColor="#E8A93C" />
              <stop offset="100%" stopColor="#8A5A1E" />
            </radialGradient>
            <radialGradient id="pvOrbGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,224,150,.9)" />
              <stop offset="100%" stopColor="rgba(255,224,150,0)" />
            </radialGradient>
            <filter id="pvSoft" x="-40%" y="-40%" width="180%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="7" />
              <feOffset dy="9" />
              <feComponentTransfer><feFuncA type="linear" slope="0.28" /></feComponentTransfer>
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <linearGradient id="pvWallRose" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FBEEE4" /><stop offset="100%" stopColor="#F0D4C1" /></linearGradient>
            <linearGradient id="pvWallLilac" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F0EAFB" /><stop offset="100%" stopColor="#DCCFF2" /></linearGradient>
            <linearGradient id="pvWallMint" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#EAF6E8" /><stop offset="100%" stopColor="#CDE6C6" /></linearGradient>
            <linearGradient id="pvWallSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#EAF3FB" /><stop offset="100%" stopColor="#CFE2F2" /></linearGradient>
            <linearGradient id="pvRoofV" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9C82E4" /><stop offset="100%" stopColor="#5B429E" /></linearGradient>
            <linearGradient id="pvRoofT" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3FBFA0" /><stop offset="100%" stopColor="#0F6E5A" /></linearGradient>
            <linearGradient id="pvWin" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFF3CE" /><stop offset="100%" stopColor="#F4CE7B" /></linearGradient>
            <linearGradient id="pvGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(255,255,255,.85)" /><stop offset="55%" stopColor="rgba(255,255,255,0)" /></linearGradient>
          </defs>

          {/* ── premium ground plate + plaza ── */}
          <rect width="1040" height="660" fill="url(#pvGround)" />
          <ellipse cx="520" cy="430" rx="560" ry="235" fill="url(#pvGrass)" />
          <ellipse cx="520" cy="430" rx="560" ry="235" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="3" />
          {/* gold cobble path (dispatch → fountain) */}
          <path d="M520 452 C 470 520, 430 560, 400 622 L 640 622 C 610 560, 570 520, 520 452 Z" fill="#E9DFC2" opacity="0.8" />
          <g opacity="0.7">
            {[
              [500, 520, 16, 7], [540, 520, 16, 7],
              [486, 558, 18, 8], [554, 558, 18, 8],
              [472, 596, 20, 8], [568, 596, 20, 8],
            ].map(([cx, cy, rx, ry], i) => (
              <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="#D9CBA6" />
            ))}
          </g>

          {/* ══ MEMORY LIBRARY (left, lilac) — lit windows ∝ memory/cap ══ */}
          <g filter="url(#pvSoft)" data-anim style={{ transformBox: "fill-box", transformOrigin: "bottom", animation: "vBob 6s ease-in-out infinite" }}>
            <path d="M150 250 h150 l34 -22 v168 l-34 22 h-150 Z" fill="#C9B7E0" />
            <rect x="150" y="250" width="150" height="168" rx="10" fill="url(#pvWallLilac)" />
            <rect x="150" y="250" width="150" height="60" rx="10" fill="url(#pvGloss)" opacity="0.5" />
            <path d="M150 250 h150 l34 -22 h-150 Z" fill="#EBE0FA" />
            <path d="M143 252 l82 -40 l82 40 Z" fill="url(#pvRoofV)" />
            <rect x="205" y="200" width="14" height="20" rx="3" fill="url(#pvGold)" />
            {/* book sign */}
            <rect x="185" y="228" width="30" height="15" rx="3" fill={PAPER} stroke="#4A3A24" strokeWidth="1.6" />
            <line x1="200" y1="228" x2="200" y2="243" stroke="#4A3A24" strokeWidth="1.4" />
            {/* window shelf grid — lit count reflects real memory count/cap */}
            {(() => {
              const cols = 4, rows = 3, total = cols * rows;
              const lit = Math.max(memRatio > 0 ? 1 : 0, Math.round(memRatio * total));
              const out: React.ReactNode[] = [];
              let n = 0;
              for (let r = 0; r < rows; r++)
                for (let c = 0; c < cols; c++) {
                  const on = n < lit;
                  const gx = 168 + c * 28;
                  const gy = 282 + r * 30;
                  out.push(
                    <rect key={n} x={gx} y={gy} width="22" height="24" rx="4" fill={on ? "url(#pvWin)" : "#D8C6EE"} />,
                  );
                  n++;
                }
              return out;
            })()}
            <rect x="204" y="374" width="42" height="44" rx="7" fill="#8B6FBE" />
            <rect x="150" y="410" width="150" height="8" rx="4" fill="url(#pvGold)" opacity="0.9" />
          </g>

          {/* ══ SKILLS FORGE (right, mint) — fire glows when a skill runs ══ */}
          <g filter="url(#pvSoft)" data-anim style={{ transformBox: "fill-box", transformOrigin: "bottom", animation: "vBob 6.6s ease-in-out .4s infinite" }}>
            <path d="M760 300 h120 l30 -20 v128 l-30 20 h-120 Z" fill="#B4D2AC" />
            <rect x="760" y="300" width="120" height="128" rx="10" fill="url(#pvWallMint)" />
            <rect x="760" y="300" width="120" height="46" rx="10" fill="url(#pvGloss)" opacity="0.5" />
            <path d="M760 300 h120 l30 -20 h-120 Z" fill="#E6F4E2" />
            <path d="M752 302 l68 -34 l68 34 Z" fill="url(#pvRoofT)" />
            <rect x="812" y="258" width="12" height="18" rx="3" fill="url(#pvGold)" />
            {/* forge window + fire */}
            <rect x="784" y="336" width="72" height="46" rx="8" fill="url(#pvWin)" />
            {forgeOn ? (
              <g data-anim style={{ transformBox: "fill-box", transformOrigin: "820px 372px", animation: "vFlame 1.5s ease-in-out infinite" }}>
                <circle cx="820" cy="359" r="14" fill="#E8853C" />
                <circle cx="820" cy="359" r="7" fill="#FFDD9E" />
              </g>
            ) : (
              <g opacity="0.5">
                <circle cx="820" cy="359" r="12" fill="#C9A15E" />
              </g>
            )}
            <rect x="760" y="420" width="120" height="8" rx="4" fill="url(#pvGold)" opacity="0.9" />
          </g>

          {/* ══ SOUL SHRINE (rose cottage) — gold heart lit when persona is set ══ */}
          <g filter="url(#pvSoft)" data-anim style={{ transformBox: "fill-box", transformOrigin: "bottom", animation: "vBob 7.2s ease-in-out .2s infinite" }}>
            <path d="M640 330 h96 l24 -16 v104 l-24 16 h-96 Z" fill="#E7C7B4" />
            <rect x="640" y="330" width="96" height="104" rx="9" fill="url(#pvWallRose)" />
            <rect x="640" y="330" width="96" height="38" rx="9" fill="url(#pvGloss)" opacity="0.5" />
            <path d="M634 332 l54 -30 l54 30 Z" fill="url(#pvRoofV)" />
            {/* heart emblem — gold + glow when the soul is set, muted otherwise */}
            {soulSet ? (
              <>
                <circle data-anim cx="688" cy="378" r="20" fill="url(#pvOrbGlow)" style={{ transformBox: "fill-box", transformOrigin: "688px 378px", animation: "vPulse 4s ease-in-out infinite" }} />
                <path d="M688,388 c -6,-9 -19,-3 -12,7 l 12,11 l 12,-11 c 7,-10 -6,-16 -12,-7 Z" fill="url(#pvGold)" stroke="#8A5A1E" strokeWidth="1.4" />
              </>
            ) : (
              <path d="M676 380 h24" stroke={MUTED} strokeWidth="3" strokeLinecap="round" />
            )}
            <rect x="672" y="400" width="32" height="34" rx="6" fill="#C79A82" />
            <rect x="640" y="426" width="96" height="7" rx="3.5" fill="url(#pvGold)" opacity="0.9" />
          </g>

          {/* ══ CLOCK SPIRE (far right) — hands at real local time ══ */}
          <g filter="url(#pvSoft)" data-anim style={{ transformBox: "fill-box", transformOrigin: "bottom", animation: "vBob 8s ease-in-out infinite" }}>
            <rect x="930" y="250" width="72" height="200" rx="12" fill="url(#pvWallSky)" />
            <rect x="930" y="250" width="72" height="60" rx="12" fill="url(#pvGloss)" opacity="0.5" />
            <path d="M922 252 l44 -40 l44 40 Z" fill="url(#pvRoofV)" />
            <circle cx="966" cy="204" r="7" fill="url(#pvGold)" />
            <circle cx="966" cy="300" r="30" fill="#FBF4E4" stroke="url(#pvGold)" strokeWidth="4" />
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => {
              const rad = (a - 90) * (Math.PI / 180);
              return <line key={a} x1={966 + Math.cos(rad) * 24} y1={300 + Math.sin(rad) * 24} x2={966 + Math.cos(rad) * 27} y2={300 + Math.sin(rad) * 27} stroke="#B39B6C" strokeWidth="1.4" />;
            })}
            {/* hour + minute hands (real local time) */}
            <line x1="966" y1="300" x2="966" y2="282" stroke="#4A3A24" strokeWidth="3.4" strokeLinecap="round" transform={`rotate(${hrDeg} 966 300)`} />
            <line x1="966" y1="300" x2="966" y2="276" stroke="#8A5A1E" strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${minDeg} 966 300)`} />
            {/* ticking second hand (SMIL, gated by reduced-motion) */}
            <line x1="966" y1="308" x2="966" y2="273" stroke={PURPLE} strokeWidth="1.4" strokeLinecap="round">
              {!reduce && <animateTransform attributeName="transform" type="rotate" from="0 966 300" to="360 966 300" dur="60s" repeatCount="indefinite" />}
            </line>
            <circle cx="966" cy="300" r="3" fill="#4A3A24" />
            <rect x="948" y="360" width="36" height="46" rx="7" fill="#B9CFE4" />
          </g>

          {/* ══ SOUL FOUNTAIN (center focal orb) — ripples when busy ══ */}
          <ellipse cx="520" cy="470" rx="118" ry="46" fill="#CBE7DE" />
          <ellipse cx="520" cy="470" rx="118" ry="46" fill="none" stroke="url(#pvGold)" strokeWidth="5" />
          <ellipse cx="520" cy="466" rx="96" ry="36" fill="#1C9E82" opacity="0.55" />
          {busy && !reduce && (
            <ellipse data-anim cx="520" cy="468" rx="70" ry="27" fill="none" stroke="rgba(129,104,206,.6)" strokeWidth="3" style={{ transformBox: "fill-box", transformOrigin: "520px 468px", animation: "vRing 2.4s ease-out infinite" }} />
          )}
          <circle cx="520" cy="432" r="82" fill="url(#pvOrbGlow)" data-anim style={{ transformBox: "fill-box", transformOrigin: "520px 432px", animation: "vPulse 4s ease-in-out infinite" }} />
          <circle cx="520" cy="436" r="48" fill="url(#pvOrb)" />
          <ellipse cx="504" cy="420" rx="18" ry="12" fill="rgba(255,255,255,.7)" />
          <text x="520" y="447" textAnchor="middle" fontSize="30" fontFamily="ui-monospace,monospace" fill="#6B4A16" fontWeight="700">✦</text>

          {/* ══ CHIBI PET VILLAGERS = the real roster ══ */}
          {villagers.map((r, i) => {
            const spot = SPOTS[i];
            const active = r.status === "active" || (busy && !anyActive && i === 0);
            return (
              <Chibi
                key={r.id}
                x={spot.x}
                y={spot.y}
                scale={spot.s}
                ear={spot.ear}
                body={BODIES[i % BODIES.length]}
                active={active}
                delay={`${-(i * 0.5).toFixed(1)}s`}
              />
            );
          })}

          {/* foliage for depth */}
          <g filter="url(#pvSoft)"><ellipse cx="110" cy="470" rx="30" ry="34" fill="#8FB877" /><ellipse cx="126" cy="452" rx="20" ry="22" fill="#A6CC8A" /><rect x="104" y="486" width="10" height="18" fill="#8A6A46" /></g>
          <g filter="url(#pvSoft)"><ellipse cx="940" cy="486" rx="26" ry="30" fill="#8FB877" /><rect x="935" y="500" width="9" height="16" fill="#8A6A46" /></g>

          {/* ══ DISPATCH COURIER — a spark runs to the fountain while a run streams ══ */}
          {running && !reduce && (
            <g>
              <circle r="8" fill="url(#pvGold)" stroke="#8A5A1E" strokeWidth="1.4">
                <animateMotion path="M520,648 C 500,590 545,530 520,452" dur="1.5s" repeatCount="indefinite" />
              </circle>
              <circle r="4" fill={TERRA2} opacity="0.7">
                <animateMotion path="M520,648 C 500,590 545,530 520,452" dur="1.5s" begin="-0.28s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </svg>

        {/* faint perspective grid + holographic sheen, over the scene */}
        <div className="pv-grid" data-anim aria-hidden />
        <div className="pv-sheen" data-anim aria-hidden />

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

        {/* head overlay — title + glass stat chips */}
        <div style={headRow}>
          <div style={{ minWidth: 0 }}>
            <div style={titleStyle}>
              <span style={{ color: INK }}>{petName}&rsquo;s </span>
              <span style={titleGrad}>Town</span>
            </div>
            <div style={subStyle}>
              {busy ? "the square is busy — a goal is being worked." : "your agent's little world — dispatch a goal below."}
            </div>
          </div>
          <div style={chipBar}>
            <Chip k="Memory" v={`${pillars.memory.count}`} small={`/${pillars.memory.cap}`} />
            <Chip k="Skills" v={`${pillars.skills.total}`} small={` · ${pillars.skills.installed} on`} />
            <Chip k="Routines" v={`${pillars.crons.routines}`} />
            <Chip k="Soul" v={soulSet ? `v${pillars.soul.checkpoints} ✦` : "—"} />
          </div>
        </div>

        {/* foot caption */}
        <div style={footStyle}>
          {busy ? (
            <>the village is <b style={{ color: "#5B429E" }}>alive</b> — a courier is running to the fountain</>
          ) : (
            <>dispatch a goal &amp; watch a courier run to the <b style={{ color: "#5B429E" }}>Soul Fountain</b></>
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

// ── a cute chibi pet villager (ears / big eyes / blush) ──
function Chibi({ x, y, scale, ear, body, active, delay }: { x: number; y: number; scale: number; ear: "cat" | "round"; body: string; active: boolean; delay: string }) {
  const eye = "#3A2A18";
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx="0" cy={active ? 30 : 26} rx="26" ry="8" fill="rgba(36,27,18,.17)" />
      <g data-anim style={{ transformBox: "fill-box", transformOrigin: "bottom", animation: `${active ? "vWork 1.6s" : "vBob 3.4s"} ease-in-out infinite`, animationDelay: delay }}>
        {/* wisps rise off the active villager */}
        {active && (
          <g data-anim style={{ transformBox: "fill-box", transformOrigin: "center", animation: "vRise 2.2s ease-out infinite", animationDelay: delay }}>
            <circle cx="0" cy="-36" r="4" fill="url(#pvGold)" />
            <circle cx="11" cy="-46" r="3" fill="url(#pvGold)" opacity="0.8" />
            <circle cx="-9" cy="-50" r="2.4" fill="url(#pvGold)" opacity="0.6" />
          </g>
        )}
        {/* ears */}
        {ear === "cat" ? (
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
        {/* body/head */}
        <ellipse cx="0" cy="0" rx="24" ry="26" fill={body} />
        {/* eyes + blush + smile */}
        <circle cx="-8" cy="-2" r="3.4" fill={eye} />
        <circle cx="8" cy="-2" r="3.4" fill={eye} />
        <circle cx="-14" cy="5" r="4" fill="#F3A9A0" opacity="0.7" />
        <circle cx="14" cy="5" r="4" fill="#F3A9A0" opacity="0.7" />
        <path d="M-4,4 q4,4 8,0" stroke={eye} strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

// ── a glass stat chip (backdrop-blur) ──
function Chip({ k, v, small }: { k: string; v: string; small?: string }) {
  return (
    <div style={chipStyle}>
      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", color: MUTED, textTransform: "uppercase" }}>{k}</span>
      <span style={{ fontFamily: DISP, fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em", color: INK }}>
        {v}{small && <small style={{ fontWeight: 600, fontSize: 11, color: MUTED }}>{small}</small>}
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
      <div style={{ fontFamily: SANS, fontSize: 12, color: "rgba(33,26,18,0.4)", padding: "0 4px 8px", fontStyle: "italic" }}>{hint}</div>
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
      <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.06em", color: accent, fontWeight: 700, textTransform: "uppercase" }}>{name}</div>
      <div style={{ fontFamily: DISP, fontSize: 17, fontWeight: 800, color: INK, margin: "3px 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
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
const sceneCard: React.CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "1040 / 660",
  borderRadius: 24,
  overflow: "hidden",
  background: "linear-gradient(180deg,#FCFAF4 0%,#F3EEF7 62%,#ECE6F4 100%)",
  border: `1px solid ${HAIR}`,
  boxShadow: "0 40px 90px -50px rgba(60,40,90,.55), inset 0 1px 0 rgba(255,255,255,.7)",
};
const headRow: React.CSSProperties = { position: "absolute", top: 20, left: 24, right: 24, zIndex: 6, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const titleStyle: React.CSSProperties = { fontFamily: DISP, fontWeight: 800, fontSize: "clamp(18px,2.4vw,23px)", letterSpacing: "-0.02em", lineHeight: 1.1 };
const titleGrad: React.CSSProperties = { background: "linear-gradient(100deg,#8168CE,#20A386 60%,#C8932F)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };
const subStyle: React.CSSProperties = { marginTop: 3, fontFamily: SANS, fontSize: 12.5, color: MUTED, fontWeight: 500, maxWidth: 320 };
const chipBar: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" };
const chipStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 1, padding: "7px 11px", borderRadius: 14,
  background: "rgba(255,255,255,.6)", backdropFilter: "blur(9px)", WebkitBackdropFilter: "blur(9px)",
  border: "1px solid rgba(255,255,255,.7)", boxShadow: "0 8px 20px -12px rgba(60,40,90,.5), inset 0 1px 0 rgba(255,255,255,.8)",
};
const footStyle: React.CSSProperties = { position: "absolute", left: 24, bottom: 16, zIndex: 6, fontFamily: MONO, fontSize: 11, letterSpacing: "0.03em", color: MUTED };
const legendRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const squareGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const villagerGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 };

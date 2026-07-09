"use client";

/**
 * PetVillage — the charming illustrated view of the Agent Office.
 *
 * Renders the SAME REAL mission-control data (GET /api/petclaw/mission-control) as a
 * living little town: the 5 pillars become 5 buildings, the roster becomes villagers,
 * the kanban becomes the town square, and a dispatched goal sends a courier spark
 * across the village into the well. No fabricated data — every number is real, and
 * every empty state is honest ("the village is quiet — dispatch a goal").
 *
 * Pure inline SVG + CSS (no external assets). Bob/flame/smoke/glow are CSS classes so
 * `prefers-reduced-motion: reduce` can silence them in one place; the SMIL courier and
 * clock hands are gated by a JS reduced-motion flag.
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
const SAGE2 = "#9FC59A";
const PAPER = "#FBF6EC";
const FOIL = "#E8C77E";
const FOIL_DK = "#C8932F";
const FIELD = "#ECE4D4";
const DISP = "var(--ed-disp, sans-serif)";
const SANS = "var(--ed-body, sans-serif)";
const MONO = "var(--ed-m, ui-monospace, monospace)";
const HAIR = "rgba(33,26,18,0.13)";
const SHADOW_CARD = "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))";

// scene fills
const WALL = "#F3E7CE";
const WALL_DK = "#E3D3B2";
const PANE_OFF = "#CDBF9E";
const SKY = "#F6ECD6";
const GRASS = "#E3ECCE";
const PATH_FILL = "#EFE4C9";

function relTime(ts?: string | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const KF = `
@keyframes vBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes vFlame{0%,100%{transform:scaleY(1) scaleX(1);opacity:1}45%{transform:scaleY(.78) scaleX(1.08);opacity:.86}}
@keyframes vSmoke{0%{opacity:0;transform:translateY(2px) scale(.9)}25%{opacity:.5}100%{opacity:0;transform:translateY(-24px) scale(1.25)}}
@keyframes vRing{0%,100%{opacity:.16;transform:scale(1)}50%{opacity:.42;transform:scale(1.22)}}
@keyframes vGlow{0%,100%{opacity:.28}50%{opacity:.62}}
@keyframes vDrift{0%{transform:translateX(0)}100%{transform:translateX(28px)}}
@keyframes vLantern{0%,100%{opacity:.82}50%{opacity:1}}
.v-bob{animation:vBob 5s ease-in-out infinite}
.v-flame{animation:vFlame 1.5s ease-in-out infinite;transform-box:fill-box;transform-origin:bottom center}
.v-smoke{animation:vSmoke 4s ease-in-out infinite;transform-box:fill-box;transform-origin:bottom center}
.v-ring{animation:vRing 2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.v-glow{animation:vGlow 2.4s ease-in-out infinite}
.v-drift{animation:vDrift 9s ease-in-out infinite alternate}
.v-lantern{animation:vLantern 2.6s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){
  .v-bob,.v-flame,.v-smoke,.v-ring,.v-glow,.v-drift,.v-lantern{animation:none !important}
}
`;

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
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setReduce(m.matches);
    f();
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);

  const { pillars, kanban, roster, schedules } = mc;

  // ── real-data signals ──
  const memRatio = pillars.memory.cap ? pillars.memory.count / pillars.memory.cap : 0;
  const userRatio = pillars.user.cap ? pillars.user.count / pillars.user.cap : 0;
  const soulSet = pillars.soul.set;
  const skillActive = roster.some((r) => r.kind === "skill" && r.status === "active");
  const vigilActive = roster.some((r) => r.kind === "vigil" && r.status === "active");
  const busy = isWorking || running || (kanban.working.length > 0);
  const forgeOn = skillActive || busy;

  // ── clock hands from real local time ──
  const d = new Date();
  const minDeg = d.getMinutes() * 6 + d.getSeconds() * 0.1;
  const hrDeg = (d.getHours() % 12) * 30 + d.getMinutes() * 0.5;

  return (
    <>
      <style>{KF}</style>

      {/* ── the illustrated village ── */}
      <div style={sceneCard}>
        <div style={sceneHead}>
          <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.14em", color: PURPLE, fontWeight: 700 }}>
            THE VILLAGE
          </span>
          <span style={{ fontFamily: SANS, fontSize: 13.5, color: MUTED }}>
            {busy ? `${petName} is at work — the square is busy.` : `${petName}'s town is quiet. Dispatch a goal below.`}
          </span>
        </div>

        <div style={{ width: "100%", overflow: "hidden", borderRadius: 14 }}>
          <svg viewBox="0 0 960 470" role="img" aria-label="An illustrated village where each building is one of your pet's five agent pillars" style={{ width: "100%", height: "auto", display: "block" }}>
            {/* sky + ground */}
            <rect x="0" y="0" width="960" height="470" fill={SKY} />
            <path d="M0,196 C 220,168 360,182 520,176 C 700,169 840,190 960,180 L960,470 L0,470 Z" fill={GRASS} />
            {/* drifting clouds (outline, no glow) */}
            <g className="v-drift" opacity="0.7" stroke={HAIR} strokeWidth="2" fill={PAPER}>
              <g transform="translate(150,70)">
                <ellipse cx="0" cy="0" rx="34" ry="17" />
                <ellipse cx="30" cy="6" rx="26" ry="14" />
              </g>
            </g>
            <g className="v-drift" opacity="0.6" style={{ animationDelay: "-4s", animationDuration: "12s" }} stroke={HAIR} strokeWidth="2" fill={PAPER}>
              <g transform="translate(720,54)">
                <ellipse cx="0" cy="0" rx="30" ry="15" />
                <ellipse cx="26" cy="5" rx="22" ry="12" />
              </g>
            </g>

            {/* winding path from the bottom (dispatch) up to the well */}
            <path d="M470,470 C 452,420 508,398 478,360 C 452,326 500,300 480,270" fill="none" stroke={PATH_FILL} strokeWidth="26" strokeLinecap="round" />
            <path d="M470,470 C 452,420 508,398 478,360 C 452,326 500,300 480,270" fill="none" stroke={HAIR} strokeWidth="26" strokeLinecap="round" strokeDasharray="1 30" opacity="0.5" />

            {/* ══ SOUL SHRINE (back-center) ══ */}
            <g transform="translate(478,238)">
              <ellipse cx="0" cy="4" rx="62" ry="12" fill="rgba(33,26,18,0.12)" />
              <g className="v-bob" style={{ animationDelay: "-0.4s" }}>
                {/* base steps */}
                <rect x="-58" y="-8" width="116" height="12" rx="2" fill={WALL_DK} stroke={INK} strokeWidth="2" />
                <rect x="-50" y="-18" width="100" height="12" rx="2" fill={WALL} stroke={INK} strokeWidth="2" />
                {/* columns */}
                {[-40, -18, 4, 26].map((cx, i) => (
                  <rect key={i} x={cx} y="-72" width="12" height="54" rx="3" fill={WALL} stroke={INK} strokeWidth="2" />
                ))}
                <rect x="-46" y="-82" width="92" height="12" rx="2" fill={WALL_DK} stroke={INK} strokeWidth="2" />
                {/* pediment */}
                <path d="M-52,-82 L0,-116 L52,-82 Z" fill={PURPLE} stroke={INK} strokeWidth="2" />
                <circle cx="0" cy="-92" r="7" fill={FOIL} stroke={INK} strokeWidth="2" />
                {/* brazier flame — lit when the soul is set */}
                <rect x="-9" y="-134" width="18" height="14" rx="3" fill={WALL_DK} stroke={INK} strokeWidth="2" />
                {soulSet ? (
                  <path className="v-flame" d="M0,-134 C -9,-146 -6,-158 0,-168 C 6,-158 9,-146 0,-134 Z" fill={TERRA2} stroke={INK} strokeWidth="1.5" />
                ) : (
                  <path d="M-7,-136 L7,-136" stroke={MUTED} strokeWidth="3" strokeLinecap="round" />
                )}
              </g>
            </g>

            {/* ══ CRONS CLOCK TOWER (back-right) ══ */}
            <g transform="translate(806,254)">
              <ellipse cx="0" cy="6" rx="46" ry="11" fill="rgba(33,26,18,0.12)" />
              <g className="v-bob" style={{ animationDelay: "-1.2s" }}>
                <rect x="-34" y="-150" width="68" height="156" rx="4" fill={WALL} stroke={INK} strokeWidth="2" />
                <rect x="-34" y="-150" width="68" height="16" fill={WALL_DK} stroke={INK} strokeWidth="2" />
                {/* belfry roof */}
                <path d="M-42,-150 L0,-192 L42,-150 Z" fill={PURPLE} stroke={INK} strokeWidth="2" />
                <rect x="-4" y="-206" width="8" height="16" fill={INK} />
                <circle cx="0" cy="-208" r="5" fill={FOIL} stroke={INK} strokeWidth="2" />
                {/* door */}
                <rect x="-13" y="-34" width="26" height="34" rx="13" fill={WALL_DK} stroke={INK} strokeWidth="2" />
                {/* clock face */}
                <circle cx="0" cy="-96" r="26" fill={PAPER} stroke={INK} strokeWidth="2.5" />
                <circle cx="0" cy="-96" r="26" fill="none" stroke={FOIL_DK} strokeWidth="2" opacity="0.5" />
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => {
                  const rad = (a - 90) * (Math.PI / 180);
                  return <line key={a} x1={Math.cos(rad) * 22} y1={-96 + Math.sin(rad) * 22} x2={Math.cos(rad) * 25} y2={-96 + Math.sin(rad) * 25} stroke={MUTED} strokeWidth="1.5" />;
                })}
                {/* hour + minute hands (real local time) */}
                <line x1="0" y1="-96" x2="0" y2="-108" stroke={INK} strokeWidth="3" strokeLinecap="round" transform={`rotate(${hrDeg} 0 -96)`} />
                <line x1="0" y1="-96" x2="0" y2="-115" stroke={TERRA} strokeWidth="2" strokeLinecap="round" transform={`rotate(${minDeg} 0 -96)`} />
                {/* ticking second hand (SMIL, gated by reduced-motion) */}
                <line x1="0" y1="-90" x2="0" y2="-118" stroke={PURPLE} strokeWidth="1.4" strokeLinecap="round">
                  {!reduce && <animateTransform attributeName="transform" type="rotate" from="0 0 -96" to="360 0 -96" dur="60s" repeatCount="indefinite" />}
                </line>
                <circle cx="0" cy="-96" r="3" fill={INK} />
              </g>
            </g>

            {/* ══ MEMORY LIBRARY (mid-left) ══ */}
            <g transform="translate(168,278)">
              <ellipse cx="0" cy="6" rx="74" ry="13" fill="rgba(33,26,18,0.12)" />
              <g className="v-bob" style={{ animationDelay: "-2.1s" }}>
                <rect x="-66" y="-128" width="132" height="134" rx="4" fill={WALL} stroke={INK} strokeWidth="2" />
                {/* gable roof */}
                <path d="M-74,-128 L0,-166 L74,-128 Z" fill={TERRA} stroke={INK} strokeWidth="2" />
                {/* book sign */}
                <rect x="-20" y="-150" width="40" height="18" rx="3" fill={PAPER} stroke={INK} strokeWidth="2" />
                <line x1="0" y1="-150" x2="0" y2="-132" stroke={INK} strokeWidth="1.5" />
                {/* window grid = memory shelves; lit ∝ count/cap */}
                {(() => {
                  const cols = 4, rows = 3, total = cols * rows;
                  const lit = Math.round(memRatio * total);
                  const cells: React.ReactNode[] = [];
                  let n = 0;
                  for (let r = 0; r < rows; r++)
                    for (let c = 0; c < cols; c++) {
                      const on = n < lit;
                      const gx = -52 + c * 28;
                      const gy = -116 + r * 34;
                      cells.push(
                        <g key={n}>
                          <rect x={gx} y={gy} width="20" height="24" rx="2" fill={on ? FOIL : PANE_OFF} stroke={INK} strokeWidth="1.6" />
                          <line x1={gx + 10} y1={gy} x2={gx + 10} y2={gy + 24} stroke={INK} strokeWidth="1" opacity="0.5" />
                          <line x1={gx} y1={gy + 12} x2={gx + 20} y2={gy + 12} stroke={INK} strokeWidth="1" opacity="0.5" />
                        </g>,
                      );
                      n++;
                    }
                  return cells;
                })()}
                {/* door */}
                <rect x="-14" y="-14" width="28" height="20" rx="2" fill={WALL_DK} stroke={INK} strokeWidth="2" />
                {/* keeper lantern glows when the memory pipeline is active */}
                {vigilActive && <circle className="v-glow" cx="60" cy="-30" r="10" fill={FOIL} opacity="0.5" />}
              </g>
            </g>

            {/* ══ USER'S COTTAGE (front-right) ══ */}
            <g transform="translate(654,362)">
              <ellipse cx="0" cy="6" rx="66" ry="12" fill="rgba(33,26,18,0.12)" />
              <g className="v-bob" style={{ animationDelay: "-3s" }}>
                {/* chimney smoke — warmth when the owner profile has facts */}
                {userRatio > 0 && (
                  <g>
                    <circle className="v-smoke" cx="34" cy="-104" r="7" fill={MUTED} />
                    <circle className="v-smoke" cx="34" cy="-104" r="6" fill={MUTED} style={{ animationDelay: "-2s" }} />
                  </g>
                )}
                <rect x="26" y="-104" width="16" height="24" rx="2" fill={TERRA} stroke={INK} strokeWidth="2" />
                <rect x="-52" y="-78" width="104" height="84" rx="4" fill={WALL} stroke={INK} strokeWidth="2" />
                <path d="M-60,-78 L0,-120 L60,-78 Z" fill={TERRA2} stroke={INK} strokeWidth="2" />
                {/* heart plaque */}
                <path d="M0,-96 c -4,-6 -13,-2 -8,5 l 8,8 l 8,-8 c 5,-7 -4,-11 -8,-5 Z" fill={FOIL} stroke={INK} strokeWidth="1.5" />
                {/* framed portraits = owner facts (up to 3 windows lit by ratio) */}
                {[-30, 0, 30].map((wx, i) => {
                  const on = userRatio >= (i + 1) / 4;
                  return <rect key={i} x={wx - 11} y="-58" width="22" height="26" rx="2" fill={on ? FOIL : PANE_OFF} stroke={INK} strokeWidth="1.6" />;
                })}
                {/* door */}
                <rect x="-13" y="-30" width="26" height="36" rx="3" fill={WALL_DK} stroke={INK} strokeWidth="2" />
                <circle cx="7" cy="-12" r="2" fill={INK} />
              </g>
            </g>

            {/* ══ SKILLS WORKSHOP / FORGE (front-left) ══ */}
            <g transform="translate(290,372)">
              <ellipse cx="0" cy="6" rx="70" ry="12" fill="rgba(33,26,18,0.12)" />
              <g className="v-bob" style={{ animationDelay: "-1.7s" }}>
                {/* forge chimney + glow when a skill is running */}
                <rect x="30" y="-108" width="18" height="30" rx="2" fill={WALL_DK} stroke={INK} strokeWidth="2" />
                {forgeOn && <circle className="v-glow" cx="39" cy="-112" r="9" fill={TERRA2} opacity="0.55" />}
                <rect x="-56" y="-82" width="112" height="88" rx="4" fill={WALL} stroke={INK} strokeWidth="2" />
                {/* sawtooth workshop roof */}
                <path d="M-60,-82 L-30,-108 L-30,-82 L0,-108 L0,-82 L30,-108 L30,-82 L56,-108 L56,-82 Z" fill={SAGE} stroke={INK} strokeWidth="2" />
                {/* big arched forge opening */}
                <path d="M-34,-6 L-34,-44 A20,20 0 0 1 6,-44 L6,-6 Z" fill={WALL_DK} stroke={INK} strokeWidth="2" />
                {forgeOn && <ellipse className="v-glow" cx="-14" cy="-18" rx="14" ry="9" fill={FOIL} />}
                {/* anvil */}
                <path d="M-24,-6 L2,-6 L2,-2 L-6,-2 L-6,2 L4,2 L4,6 L-24,6 Z" fill={INK} opacity="0.8" />
                {/* hanging tools sign */}
                <rect x="24" y="-56" width="26" height="20" rx="3" fill={PAPER} stroke={INK} strokeWidth="2" />
                <path d="M31,-50 l 6,6 M43,-50 l -6,6" stroke={SAGE} strokeWidth="2" strokeLinecap="round" />
              </g>
            </g>

            {/* ══ TOWN WELL (center-front) — the busy square ══ */}
            <g transform="translate(480,300)">
              <ellipse cx="0" cy="30" rx="52" ry="12" fill="rgba(33,26,18,0.12)" />
              {busy && <circle className="v-ring" cx="0" cy="8" r="46" fill="none" stroke={PURPLE} strokeWidth="3" />}
              {/* stone rim */}
              <ellipse cx="0" cy="14" rx="34" ry="14" fill={WALL_DK} stroke={INK} strokeWidth="2" />
              <ellipse cx="0" cy="10" rx="34" ry="13" fill={busy ? "#DFC79A" : WALL} stroke={INK} strokeWidth="2" />
              <ellipse cx="0" cy="10" rx="22" ry="8" fill={busy ? PURPLE : "#3F5B6B"} opacity="0.75" />
              {/* posts + roof */}
              <rect x="-30" y="-40" width="7" height="52" rx="2" fill={TERRA} stroke={INK} strokeWidth="2" />
              <rect x="23" y="-40" width="7" height="52" rx="2" fill={TERRA} stroke={INK} strokeWidth="2" />
              <path d="M-42,-40 L0,-64 L42,-40 Z" fill={TERRA2} stroke={INK} strokeWidth="2" />
              {/* bucket */}
              <rect x="-8" y="-22" width="16" height="13" rx="2" fill={WALL} stroke={INK} strokeWidth="2" />
            </g>

            {/* ambient villagers by the square (light up when busy) */}
            <Villager x={418} y={352} accent={SAGE} active={busy && skillActive} delay="-0.6s" />
            <Villager x={548} y={356} accent={PURPLE} active={busy && vigilActive} delay="-1.4s" />
            <Villager x={500} y={372} accent={TERRA} active={busy} delay="-2.2s" />

            {/* dispatch courier spark (SMIL, only while a run streams) */}
            {running && !reduce && (
              <g>
                <circle r="7" fill={FOIL} stroke={INK} strokeWidth="1.5">
                  <animateMotion path="M470,468 C 452,420 508,398 478,360 C 452,326 500,300 480,272" dur="1.5s" repeatCount="indefinite" />
                </circle>
                <circle r="4" fill={TERRA2} opacity="0.7">
                  <animateMotion path="M470,468 C 452,420 508,398 478,360 C 452,326 500,300 480,272" dur="1.5s" begin="-0.25s" repeatCount="indefinite" />
                </circle>
              </g>
            )}
          </svg>
        </div>

        {/* readable legend — the same real metrics as plain text under the scene */}
        <div style={legendRow}>
          <Legend accent={PURPLE} name="Soul Shrine" value={soulSet ? pillars.soul.persona : "not set"} sub={`v${pillars.soul.checkpoints}`} />
          <Legend accent={TERRA} name="Memory Library" value={`${pillars.memory.count}/${pillars.memory.cap}`} sub={pillars.memory.updatedAt ? relTime(pillars.memory.updatedAt) : "empty"} />
          <Legend accent={TERRA2} name="User's Cottage" value={`${pillars.user.count}/${pillars.user.cap}`} sub="owner facts" />
          <Legend accent={SAGE} name="Skills Workshop" value={`${pillars.skills.total}`} sub={`${pillars.skills.installed} installed`} />
          <Legend accent={PURPLE} name="Clock Tower" value={`${pillars.crons.routines} routines`} sub={pillars.crons.nextLabel} />
        </div>
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
          <Stall label="AT THE WELL" hint="working" accent={PURPLE} count={kanban.working.length + (liveRun && !liveRun.done ? 1 : 0)} empty="The square is quiet — dispatch a goal.">
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
                  <span key={"ln" + String(it.id)} className="v-lantern" title={it.title} style={{ fontSize: 15, lineHeight: 1 }}>🏮</span>
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
        <SectionHead mono="THE ALMANAC" title="Clock-tower routines" />
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

// ── a little SVG villager standing in the scene ──
function Villager({ x, y, accent, active, delay }: { x: number; y: number; accent: string; active: boolean; delay: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {active && <circle className="v-ring" cx="0" cy="-8" r="20" fill="none" stroke={accent} strokeWidth="2.5" />}
      <ellipse cx="0" cy="10" rx="12" ry="4" fill="rgba(33,26,18,0.12)" />
      <g className="v-bob" style={{ animationDelay: delay }}>
        {/* body */}
        <path d="M-9,8 C -9,-6 9,-6 9,8 Z" fill={active ? accent : WALL} stroke={INK} strokeWidth="1.6" />
        {/* head */}
        <circle cx="0" cy="-14" r="7" fill={WALL} stroke={INK} strokeWidth="1.6" />
        {/* little cap */}
        <path d="M-7,-16 A7,7 0 0 1 7,-16 Z" fill={active ? accent : WALL_DK} stroke={INK} strokeWidth="1.6" />
      </g>
    </g>
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
        {skills.map((s) => <VillagerCard key={s.id} s={s} accent={SAGE} />)}
      </div>
      <div style={{ margin: "18px 0 8px", fontFamily: MONO, fontSize: 13, letterSpacing: "0.1em", color: PURPLE, fontWeight: 700 }}>LIBRARY KEEPERS · always-on VIGIL crew</div>
      <div style={villagerGrid}>
        {vigil.map((s) => <VillagerCard key={s.id} s={s} accent={PURPLE} />)}
      </div>
    </div>
  );
}

function VillagerCard({ s, accent }: { s: Staff; accent: string }) {
  const active = s.status === "active";
  return (
    <div style={{ ...card, padding: "12px 13px", opacity: s.installed ? 1 : 0.62, display: "flex", gap: 11, alignItems: "flex-start" }}>
      <svg width="30" height="34" viewBox="-15 -26 30 40" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden>
        <path d="M-9,10 C -9,-6 9,-6 9,10 Z" fill={active ? accent : WALL} stroke={INK} strokeWidth="1.6" />
        <circle cx="0" cy="-14" r="7" fill={WALL} stroke={INK} strokeWidth="1.6" />
        <path d="M-7,-16 A7,7 0 0 1 7,-16 Z" fill={active ? accent : WALL_DK} stroke={INK} strokeWidth="1.6" />
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
const sceneCard: React.CSSProperties = { background: PAPER, borderRadius: 18, padding: 14, border: `1px solid ${HAIR}`, boxShadow: SHADOW_CARD, overflow: "hidden" };
const sceneHead: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", padding: "2px 4px 12px" };
const legendRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const squareGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const villagerGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 };

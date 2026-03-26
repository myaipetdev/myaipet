import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import LavaLamp, { useEntropy } from "./LavaLampEntropy";

// ── Grid Config ──
const COLS = 10, ROWS = 8;
const TILE_W = 88, TILE_H = 50;
const MAP = [
  "TTFRRRHFTT",
  "TRRRRRRRET",
  "FRRNRRPPRF",
  "RRRRRRRRRF",
  "FRKRRWWRRT",
  "RRRRRWWRRR",
  "TRHRRRRRRR",
  "TTFFRRHFFT",
].map(r => r.split(""));

const ACT = { W: "drinking", K: "eating", P: "playing", N: "relaxing", H: "resting", E: "exploring" };
const SLBL = { idle: "chilling", walking: "walking", eating: "eating", drinking: "drinking", playing: "playing", sleeping: "sleeping", socializing: "chatting", relaxing: "relaxing", resting: "resting", exploring: "exploring" };

const PDEFS = [
  { id: 0, name: "Luna", emoji: "🐱", bc: "#FF86B7", hc: "#FFB0D0" },
  { id: 1, name: "Mochi", emoji: "🐕", bc: "#A0522D", hc: "#C4824A" },
  { id: 2, name: "Kiko", emoji: "🦊", bc: "#FF8C00", hc: "#FFB347" },
  { id: 3, name: "Peanut", emoji: "🐹", bc: "#FFD23F", hc: "#FFE680" },
  { id: 4, name: "Bun", emoji: "🐰", bc: "#F5F5F5", hc: "#FFFFFF" },
  { id: 5, name: "Rio", emoji: "🦜", bc: "#4CAF50", hc: "#81C784" },
];
const VDEFS = [
  { id: 100, name: "Pixel", emoji: "🐾", bc: "#9C27B0", hc: "#CE93D8", owner: "0x1a2b...f3c4" },
  { id: 101, name: "Mango", emoji: "🐶", bc: "#FF5722", hc: "#FF8A65", owner: "0x8e7d...a1b2" },
  { id: 102, name: "Starry", emoji: "🐱", bc: "#3F51B5", hc: "#7986CB", owner: "0x5f6e...d9c8" },
];
const ALL_DEFS = [...PDEFS, ...VDEFS];

function mkPet(d, i, v = false) {
  const sx = v ? [8, 6, 4][i] : [1, 7, 3, 5, 2, 6][i];
  const sy = v ? [6, 5, 6][i] : [1, 1, 3, 4, 5, 2][i];
  return { ...d, isVisitor: v, x: sx, y: sy, prevX: sx, prevY: sy, state: "idle",
    energy: v ? 100 : [80, 70, 60, 90, 75, 85][i], happiness: v ? 100 : [90, 85, 75, 80, 95, 70][i], dir: 1 };
}
const INIT = [...PDEFS.map((d, i) => mkPet(d, i)), ...VDEFS.map((d, i) => mkPet(d, i, true))];

// ── Isometric position ──
function isoPos(col, row) {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  };
}

// ── SVG Tile Components ──

function TreeTile() {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {/* Ground */}
      <svg viewBox="0 0 88 90" className="w-full h-full">
        {/* Grass base */}
        <ellipse cx="44" cy="68" rx="36" ry="14" fill="#5a9e2f" opacity="0.4" />
        {/* Trunk */}
        <rect x="38" y="28" width="12" height="35" rx="3" fill="#6d4c2a" />
        <rect x="40" y="30" width="4" height="30" rx="1" fill="#8b6914" opacity="0.3" />
        {/* Root bumps */}
        <ellipse cx="38" cy="62" rx="6" ry="3" fill="#5a3a1e" />
        <ellipse cx="50" cy="63" rx="5" ry="3" fill="#5a3a1e" />
        {/* Canopy layers */}
        <ellipse cx="44" cy="28" rx="28" ry="20" fill="#2d8a1e" />
        <ellipse cx="36" cy="22" rx="20" ry="15" fill="#3aaa28" />
        <ellipse cx="52" cy="24" rx="18" ry="14" fill="#248a18" />
        <ellipse cx="44" cy="16" rx="16" ry="12" fill="#3cc030" />
        <ellipse cx="38" cy="12" rx="10" ry="8" fill="#4ad040" />
        {/* Leaf highlights */}
        <ellipse cx="34" cy="18" rx="6" ry="4" fill="#5de050" opacity="0.5" />
        <ellipse cx="50" cy="20" rx="5" ry="3" fill="#5de050" opacity="0.4" />
        {/* Shadow dots for depth */}
        <circle cx="30" cy="30" r="3" fill="#1a6a0e" opacity="0.4" />
        <circle cx="55" cy="28" r="2.5" fill="#1a6a0e" opacity="0.3" />
      </svg>
    </div>
  );
}

function HouseTile() {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <svg viewBox="0 0 88 96" className="w-full h-full">
        {/* Ground shadow */}
        <ellipse cx="44" cy="82" rx="34" ry="10" fill="#00000015" />
        {/* Stone foundation */}
        <rect x="16" y="58" width="56" height="22" rx="2" fill="#9e9488" />
        <rect x="18" y="60" width="12" height="8" rx="1" fill="#8a8072" opacity="0.5" />
        <rect x="34" y="60" width="10" height="8" rx="1" fill="#8a8072" opacity="0.4" />
        <rect x="50" y="62" width="14" height="6" rx="1" fill="#8a8072" opacity="0.5" />
        {/* Main walls */}
        <rect x="18" y="30" width="52" height="30" rx="1" fill="#fce4c8" />
        {/* Half-timber beams */}
        <rect x="18" y="38" width="52" height="2.5" fill="#6d4c2a" />
        <rect x="18" y="48" width="52" height="2.5" fill="#6d4c2a" />
        <rect x="18" y="30" width="2.5" height="30" fill="#6d4c2a" />
        <rect x="67.5" y="30" width="2.5" height="30" fill="#6d4c2a" />
        <rect x="43" y="30" width="2.5" height="30" fill="#6d4c2a" />
        {/* Diagonal timber */}
        <line x1="20" y1="40" x2="43" y2="30" stroke="#6d4c2a" strokeWidth="1.8" />
        <line x1="45" y1="30" x2="68" y2="40" stroke="#6d4c2a" strokeWidth="1.8" />
        {/* Roof */}
        <polygon points="44,6 8,30 80,30" fill="#c44030" />
        <polygon points="44,6 8,30 44,30" fill="#b53030" />
        <polygon points="44,6 44,30 80,30" fill="#a02828" />
        {/* Roof edge trim */}
        <rect x="6" y="28" width="76" height="4" rx="1" fill="#8b2020" />
        {/* Roof ornament */}
        <circle cx="44" cy="8" r="3" fill="#ffd700" />
        <polygon points="44,3 42,8 46,8" fill="#ffb300" />
        {/* Windows with warm glow */}
        <rect x="24" y="34" width="12" height="10" rx="1" fill="#5a3a1e" />
        <rect x="25.5" y="35.5" width="9" height="7" rx="0.5" fill="#ffe5a0" />
        <rect x="29.5" y="35.5" width="1" height="7" fill="#5a3a1e" />
        <rect x="25.5" y="38.5" width="9" height="1" fill="#5a3a1e" />
        <rect x="52" y="34" width="12" height="10" rx="1" fill="#5a3a1e" />
        <rect x="53.5" y="35.5" width="9" height="7" rx="0.5" fill="#ffe5a0" />
        <rect x="57.5" y="35.5" width="1" height="7" fill="#5a3a1e" />
        <rect x="53.5" y="38.5" width="9" height="1" fill="#5a3a1e" />
        {/* Door */}
        <rect x="36" y="46" width="16" height="14" rx="1" fill="#4a2d12" />
        <path d="M36 46 Q44 40 52 46" fill="#5a3818" />
        <circle cx="48" cy="54" r="1.5" fill="#c4a535" />
        {/* Doorstep */}
        <rect x="34" y="59" width="20" height="3" rx="1" fill="#b0a090" />
        {/* Chimney */}
        <rect x="60" y="10" width="10" height="22" fill="#8b6b52" />
        <rect x="58" y="8" width="14" height="4" rx="1" fill="#6d4c2a" />
        {/* Chimney smoke (animated via CSS) */}
        <g className="animate-smoke">
          <circle cx="65" cy="4" r="3" fill="#d0d0d0" opacity="0.3" />
          <circle cx="63" cy="-2" r="2.5" fill="#d0d0d0" opacity="0.2" />
          <circle cx="66" cy="-7" r="2" fill="#d0d0d0" opacity="0.1" />
        </g>
        {/* Flower box */}
        <rect x="22" y="44" width="16" height="3" rx="1" fill="#5a3a1e" />
        <circle cx="25" cy="43" r="2" fill="#ff6b8a" />
        <circle cx="29" cy="42.5" r="1.8" fill="#ffcc44" />
        <circle cx="33" cy="43" r="2" fill="#e879a8" />
        <circle cx="37" cy="42.5" r="1.5" fill="#ff80ab" />
        <rect x="50" y="44" width="16" height="3" rx="1" fill="#5a3a1e" />
        <circle cx="53" cy="43" r="2" fill="#ffcc44" />
        <circle cx="57" cy="42.5" r="1.8" fill="#ff6b8a" />
        <circle cx="61" cy="43" r="2" fill="#e879a8" />
        <circle cx="65" cy="42.5" r="1.5" fill="#fff176" />
      </svg>
    </div>
  );
}

function WaterTile() {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <svg viewBox="0 0 88 60" className="w-full h-full">
        {/* Stone edge */}
        <ellipse cx="44" cy="38" rx="40" ry="18" fill="#7a8b94" />
        <ellipse cx="44" cy="36" rx="37" ry="16" fill="#4fb8f0" />
        <ellipse cx="44" cy="35" rx="34" ry="14" fill="#3da5e0" />
        {/* Water surface gradient */}
        <ellipse cx="44" cy="34" rx="30" ry="12" fill="#5cc8ff" opacity="0.5" />
        {/* Animated ripples */}
        <ellipse cx="38" cy="33" rx="8" ry="3" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.3" className="animate-ripple" />
        <ellipse cx="50" cy="36" rx="6" ry="2.5" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.25" className="animate-ripple2" />
        {/* Light sparkles */}
        <circle cx="35" cy="32" r="1" fill="#fff" opacity="0.5" className="animate-twinkle" />
        <circle cx="50" cy="34" r="0.8" fill="#fff" opacity="0.4" className="animate-twinkle2" />
        <circle cx="42" cy="30" r="0.6" fill="#fff" opacity="0.35" className="animate-twinkle" />
        {/* Lily pads */}
        <ellipse cx="32" cy="35" rx="4" ry="2" fill="#3a8a28" opacity="0.7" />
        <circle cx="31" cy="34" r="1.2" fill="#ff86b7" opacity="0.6" />
        <ellipse cx="54" cy="32" rx="3.5" ry="1.8" fill="#3a8a28" opacity="0.6" />
      </svg>
    </div>
  );
}

function FlowerTile() {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <svg viewBox="0 0 88 60" className="w-full h-full">
        {/* Grass base */}
        <ellipse cx="44" cy="42" rx="36" ry="14" fill="#5aad30" opacity="0.35" />
        {/* Flower stems and blooms */}
        {[
          { x: 20, y: 38, c: "#ff6b8a", s: 3.5 },
          { x: 30, y: 32, c: "#ffcc44", s: 3 },
          { x: 42, y: 36, c: "#e879a8", s: 4 },
          { x: 55, y: 30, c: "#ff4081", s: 3 },
          { x: 65, y: 35, c: "#ce93d8", s: 3.5 },
          { x: 25, y: 42, c: "#fff176", s: 2.5 },
          { x: 48, y: 42, c: "#ff80ab", s: 2.8 },
          { x: 60, y: 40, c: "#b39ddb", s: 3.2 },
          { x: 35, y: 28, c: "#ff6b8a", s: 2.5 },
          { x: 50, y: 38, c: "#ffcc44", s: 3 },
        ].map((f, i) => (
          <g key={i}>
            <line x1={f.x} y1={f.y} x2={f.x} y2={f.y + 8} stroke="#2e7a10" strokeWidth="1.2" />
            {/* Petals */}
            {[0, 72, 144, 216, 288].map((deg, j) => (
              <circle key={j}
                cx={f.x + Math.cos(deg * Math.PI / 180) * f.s * 0.7}
                cy={f.y + Math.sin(deg * Math.PI / 180) * f.s * 0.7}
                r={f.s * 0.45} fill={f.c} opacity="0.85"
              />
            ))}
            <circle cx={f.x} cy={f.y} r={f.s * 0.35} fill="#fff176" />
            {/* Leaves */}
            <ellipse cx={f.x - 3} cy={f.y + 5} rx="3" ry="1.5" fill="#3a9a20" transform={`rotate(-30 ${f.x - 3} ${f.y + 5})`} />
          </g>
        ))}
      </svg>
    </div>
  );
}

function PathTile() {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <svg viewBox="0 0 88 60" className="w-full h-full">
        {/* Path base */}
        <rect x="4" y="12" width="80" height="40" rx="4" fill="#d4c4a8" />
        {/* Cobblestones */}
        {[
          { x: 15, y: 22, w: 14, h: 10, c: "#c4b5a3" },
          { x: 32, y: 18, w: 12, h: 9, c: "#b8a894" },
          { x: 48, y: 22, w: 15, h: 10, c: "#d0c5b5" },
          { x: 66, y: 20, w: 11, h: 9, c: "#c0b0a0" },
          { x: 12, y: 34, w: 13, h: 9, c: "#baa88e" },
          { x: 28, y: 32, w: 14, h: 10, c: "#c8b8a0" },
          { x: 45, y: 35, w: 12, h: 9, c: "#d4c0a8" },
          { x: 60, y: 33, w: 15, h: 10, c: "#b8a894" },
          { x: 22, y: 44, w: 10, h: 6, c: "#c4b098" },
          { x: 52, y: 44, w: 12, h: 6, c: "#baa88e" },
        ].map((s, i) => (
          <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx="2" fill={s.c}
            stroke="#a89882" strokeWidth="0.5" />
        ))}
        {/* Grass tufts at edges */}
        <circle cx="6" cy="18" r="2" fill="#5aad30" opacity="0.4" />
        <circle cx="82" cy="42" r="2" fill="#5aad30" opacity="0.3" />
      </svg>
    </div>
  );
}

function FoodBowlTile() {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <svg viewBox="0 0 88 60" className="w-full h-full">
        <ellipse cx="44" cy="42" rx="30" ry="12" fill="#5aad30" opacity="0.3" />
        {/* Bowl shadow */}
        <ellipse cx="44" cy="44" rx="18" ry="6" fill="#00000015" />
        {/* Bowl */}
        <ellipse cx="44" cy="36" rx="18" ry="8" fill="#6d4538" />
        <ellipse cx="44" cy="34" rx="16" ry="7" fill="#8b5a3c" />
        <ellipse cx="44" cy="33" rx="14" ry="6" fill="#ff8a65" />
        {/* Bowl rim */}
        <ellipse cx="44" cy="30" rx="17" ry="7" fill="none" stroke="#5a3828" strokeWidth="1.5" />
        {/* Food kibble */}
        <circle cx="38" cy="32" r="2.5" fill="#c87040" />
        <circle cx="44" cy="30" r="2" fill="#d88050" />
        <circle cx="50" cy="32" r="2.5" fill="#c87040" />
        <circle cx="41" cy="34" r="2" fill="#d88050" />
        <circle cx="47" cy="33" r="2" fill="#c87040" />
        {/* Bone */}
        <g transform="translate(44,28) rotate(-20)">
          <rect x="-6" y="-1.5" width="12" height="3" rx="1.5" fill="#f5ebe0" />
          <circle cx="-5" cy="-1.5" r="2" fill="#f5ebe0" />
          <circle cx="-5" cy="1.5" r="2" fill="#f5ebe0" />
          <circle cx="5" cy="-1.5" r="2" fill="#f5ebe0" />
          <circle cx="5" cy="1.5" r="2" fill="#f5ebe0" />
        </g>
        {/* Steam */}
        <g className="animate-steam">
          <path d="M36 24 Q34 20 36 16" stroke="#d0d0d0" strokeWidth="1" fill="none" opacity="0.3" />
          <path d="M44 22 Q42 18 44 14" stroke="#d0d0d0" strokeWidth="1" fill="none" opacity="0.25" />
          <path d="M52 24 Q54 20 52 16" stroke="#d0d0d0" strokeWidth="1" fill="none" opacity="0.2" />
        </g>
      </svg>
    </div>
  );
}

function FountainTile() {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <svg viewBox="0 0 88 75" className="w-full h-full">
        {/* Base pool */}
        <ellipse cx="44" cy="60" rx="32" ry="10" fill="#7a8b94" />
        <ellipse cx="44" cy="58" rx="28" ry="8" fill="#4fc3f7" />
        <ellipse cx="44" cy="57" rx="24" ry="6" fill="#64d4ff" opacity="0.6" />
        {/* Pool rim */}
        <ellipse cx="44" cy="56" rx="30" ry="9" fill="none" stroke="#6a7b84" strokeWidth="2" />
        {/* Center pillar */}
        <rect x="40" y="28" width="8" height="30" rx="2" fill="#90a4ae" />
        <rect x="42" y="30" width="3" height="26" fill="#a0b4be" opacity="0.4" />
        {/* Top bowl */}
        <ellipse cx="44" cy="28" rx="14" ry="5" fill="#7a8b94" />
        <ellipse cx="44" cy="27" rx="11" ry="4" fill="#64b5f6" opacity="0.6" />
        {/* Ornament */}
        <circle cx="44" cy="20" r="4" fill="#ffd700" />
        <circle cx="44" cy="20" r="2.5" fill="#ffb300" />
        {/* Water streams */}
        <g className="animate-fountain">
          <path d="M44 22 Q40 14 36 22" stroke="#80d8ff" strokeWidth="1.2" fill="none" opacity="0.5" />
          <path d="M44 22 Q48 14 52 22" stroke="#80d8ff" strokeWidth="1.2" fill="none" opacity="0.5" />
          <path d="M44 22 Q44 12 44 22" stroke="#80d8ff" strokeWidth="1" fill="none" opacity="0.4" />
        </g>
        {/* Water drops */}
        <circle cx="35" cy="40" r="1" fill="#80d8ff" opacity="0.5" className="animate-drop1" />
        <circle cx="53" cy="42" r="1" fill="#80d8ff" opacity="0.4" className="animate-drop2" />
        <circle cx="44" cy="38" r="0.8" fill="#80d8ff" opacity="0.45" className="animate-drop3" />
        {/* Sparkle */}
        <circle cx="44" cy="20" r="1.5" fill="#fff" opacity="0.6" className="animate-twinkle" />
      </svg>
    </div>
  );
}

function PlaygroundTile() {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <svg viewBox="0 0 88 75" className="w-full h-full">
        <ellipse cx="44" cy="62" rx="36" ry="10" fill="#5aad30" opacity="0.3" />
        {/* Swing frame */}
        <line x1="18" y1="60" x2="18" y2="18" stroke="#e65100" strokeWidth="3" strokeLinecap="round" />
        <line x1="42" y1="60" x2="42" y2="18" stroke="#e65100" strokeWidth="3" strokeLinecap="round" />
        <line x1="15" y1="18" x2="45" y2="18" stroke="#bf360c" strokeWidth="3.5" strokeLinecap="round" />
        {/* Swing ropes & seat */}
        <g className="animate-swing">
          <line x1="26" y1="18" x2="24" y2="45" stroke="#795548" strokeWidth="1.5" />
          <line x1="34" y1="18" x2="32" y2="45" stroke="#795548" strokeWidth="1.5" />
          <rect x="22" y="44" width="12" height="3" rx="1" fill="#4e342e" />
        </g>
        {/* Slide */}
        <line x1="62" y1="60" x2="62" y2="20" stroke="#7b1fa2" strokeWidth="3" strokeLinecap="round" />
        <rect x="52" y="18" width="22" height="3" rx="1" fill="#ab47bc" transform="rotate(-35 62 20)" />
        {/* Slide stairs */}
        {[48, 42, 36, 30].map((y, i) => (
          <line key={i} x1="60" y1={y} x2="64" y2={y} stroke="#7b1fa2" strokeWidth="1.5" />
        ))}
        {/* Sand area */}
        <ellipse cx="44" cy="62" rx="28" ry="6" fill="#f0e0c0" opacity="0.4" />
        {/* Ball */}
        <circle cx="50" cy="56" r="3.5" fill="#ff5722" />
        <circle cx="49" cy="55" r="1.2" fill="#ff8a65" opacity="0.6" />
      </svg>
    </div>
  );
}

function ExploreTile() {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <svg viewBox="0 0 88 70" className="w-full h-full">
        <ellipse cx="44" cy="52" rx="36" ry="12" fill="#5aad30" opacity="0.3" />
        {/* Signpost */}
        <rect x="42" y="16" width="4" height="38" fill="#6d4c2a" />
        {/* Arrow signs */}
        <g>
          <rect x="30" y="18" width="28" height="10" rx="2" fill="#8b6914" />
          <text x="44" y="26" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="bold">EXPLORE</text>
        </g>
        <g>
          <rect x="34" y="30" width="24" height="8" rx="2" fill="#a07820" />
          <polygon points="58,34 62,34 58,30 58,38" fill="#a07820" />
          <text x="46" y="36" textAnchor="middle" fill="#fff" fontSize="5">WORLD →</text>
        </g>
        {/* Compass */}
        <circle cx="44" cy="12" r="6" fill="#d4a040" />
        <circle cx="44" cy="12" r="4.5" fill="#f5e6c0" />
        <polygon points="44,8 42,13 44,11 46,13" fill="#c44030" />
        <polygon points="44,16 42,11 44,13 46,11" fill="#4a4a4a" />
        {/* Bushes */}
        <ellipse cx="22" cy="50" rx="10" ry="7" fill="#3a8a28" />
        <ellipse cx="18" cy="48" rx="7" ry="5" fill="#4aaa30" />
        <ellipse cx="66" cy="48" rx="9" ry="6" fill="#3a8a28" />
        <ellipse cx="70" cy="46" rx="6" ry="4.5" fill="#4aaa30" />
        {/* Sparkles */}
        <circle cx="30" cy="22" r="1" fill="#ffd700" opacity="0.5" className="animate-twinkle" />
        <circle cx="58" cy="24" r="0.8" fill="#ffd700" opacity="0.4" className="animate-twinkle2" />
      </svg>
    </div>
  );
}

function GrassTile() {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <svg viewBox="0 0 88 60" className="w-full h-full">
        {/* Grass tufts */}
        <circle cx="20" cy="30" r="2" fill="#5aad30" opacity="0.4" />
        <circle cx="65" cy="25" r="1.5" fill="#4a9a28" opacity="0.35" />
        <circle cx="40" cy="40" r="1.8" fill="#5aad30" opacity="0.3" />
        <circle cx="55" cy="38" r="1.2" fill="#4a9a28" opacity="0.25" />
        {/* Tiny flowers */}
        <circle cx="30" cy="35" r="1" fill="#ffcc44" opacity="0.3" />
        <circle cx="70" cy="32" r="0.8" fill="#ff86b7" opacity="0.25" />
      </svg>
    </div>
  );
}

// ── Tile Renderer ──
const TILE_COMPONENT = {
  T: TreeTile,
  H: HouseTile,
  W: WaterTile,
  F: FlowerTile,
  R: PathTile,
  K: FoodBowlTile,
  N: FountainTile,
  P: PlaygroundTile,
  E: ExploreTile,
};

// ── Speech Bubbles ──
const EMOTES = ["💕","✨","💭","🎵","❤️","⭐","🌸","😊","🎶","💤","🍖","💧","🎾","🌟","😄"];
const SPEECH = ["yay!","hehe~","nya~","woof!","...","♪","rawr","mlem","*purr*","zzz...","nom!","!!"];

// ── Pet Sprite ──
function PetSprite({ pet, isSelected, onClick, bubble }) {
  const { x, y } = isoPos(pet.x, pet.y);
  const isSleeping = pet.state === "sleeping";
  const isWalking = pet.state === "walking";

  return (
    <div
      className={`absolute cursor-pointer transition-all duration-700 ease-out ${isWalking ? "animate-petWalk" : ""}`}
      style={{
        left: `calc(50% + ${x}px - 20px)`,
        top: `calc(30% + ${y}px - 46px)`,
        zIndex: 100 + pet.y * COLS + pet.x,
        filter: isSelected ? "drop-shadow(0 0 8px rgba(255,134,183,0.6))" : "none",
        transform: `scaleX(${pet.dir})`,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Speech / emote bubble */}
      {bubble && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap animate-fadeUp pointer-events-none"
          style={{ transform: `scaleX(${pet.dir}) translateX(-50%)`, zIndex: 999 }}>
          <div className="bg-white/95 rounded-full px-2 py-0.5 shadow-md text-xs font-body font-bold text-[#422D26]/80 border border-pink/15">
            {bubble}
          </div>
        </div>
      )}
      <svg viewBox="0 0 40 52" width="40" height="52">
        {/* Shadow */}
        <ellipse cx="20" cy="48" rx="12" ry="4" fill="#00000020" />
        {/* Body */}
        <ellipse cx="20" cy="34" rx="12" ry="10" fill={pet.bc} />
        {/* Belly */}
        <ellipse cx="20" cy="36" rx="8" ry="6" fill={pet.hc} opacity="0.6" />
        {/* Head */}
        <circle cx="20" cy="20" r="10" fill={pet.hc} />
        {/* Ears */}
        <ellipse cx="12" cy="12" rx="4" ry="6" fill={pet.bc} transform="rotate(-15 12 12)" />
        <ellipse cx="13" cy="12" rx="2.5" ry="4" fill="#ffb0c8" opacity="0.5" transform="rotate(-15 13 12)" />
        <ellipse cx="28" cy="12" rx="4" ry="6" fill={pet.bc} transform="rotate(15 28 12)" />
        <ellipse cx="27" cy="12" rx="2.5" ry="4" fill="#ffb0c8" opacity="0.5" transform="rotate(15 27 12)" />
        {/* Eyes */}
        {isSleeping ? (
          <>
            <line x1="14" y1="19" x2="18" y2="19" stroke="#422d26" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="22" y1="19" x2="26" y2="19" stroke="#422d26" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="16" cy="19" r="3" fill="white" />
            <circle cx="16.5" cy="19.5" r="1.8" fill="#1a1a2e" />
            <circle cx="17.2" cy="18.5" r="0.7" fill="white" />
            <circle cx="24" cy="19" r="3" fill="white" />
            <circle cx="24.5" cy="19.5" r="1.8" fill="#1a1a2e" />
            <circle cx="25.2" cy="18.5" r="0.7" fill="white" />
          </>
        )}
        {/* Nose */}
        <ellipse cx="20" cy="22" rx="2" ry="1.5" fill="#4a2d12" />
        {/* Mouth */}
        {!isSleeping && (
          <path d="M18 24 Q20 26 22 24" stroke="#d32f2f" strokeWidth="0.8" fill="none" />
        )}
        {/* Cheek blush */}
        <circle cx="12" cy="22" r="3" fill="#ff86b7" opacity="0.25" />
        <circle cx="28" cy="22" r="3" fill="#ff86b7" opacity="0.25" />
        {/* Feet */}
        <ellipse cx="14" cy="44" rx="4" ry="3" fill={pet.bc} />
        <ellipse cx="26" cy="44" rx="4" ry="3" fill={pet.bc} />
        {/* Tail */}
        <ellipse cx="32" cy="32" rx="3" ry="5" fill={pet.bc} transform="rotate(30 32 32)" />
        {/* Visitor badge */}
        {pet.isVisitor && (
          <g className="animate-float">
            <circle cx="20" cy="4" r="4" fill="#9c27b0" />
            <text x="20" y="6.5" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold">V</text>
          </g>
        )}
        {/* Sleep Zzz */}
        {isSleeping && (
          <g className="animate-zzz">
            <text x="28" y="12" fill="#7986cb" fontSize="6" fontWeight="bold" opacity="0.6">z</text>
            <text x="32" y="6" fill="#7986cb" fontSize="8" fontWeight="bold" opacity="0.4">Z</text>
          </g>
        )}
        {/* Selection ring */}
        {isSelected && (
          <ellipse cx="20" cy="48" rx="16" ry="5" fill="none"
            stroke={pet.isVisitor ? "#9c27b0" : "#ff86b7"} strokeWidth="2"
            strokeDasharray="4 2" className="animate-spin-slow" />
        )}
      </svg>
      {/* Emoji label */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-lg select-none"
        style={{ transform: `scaleX(${pet.dir}) translateX(-50%)` }}>
        {pet.emoji}
      </div>
    </div>
  );
}

// ── Decorative Elements ──
function Butterflies() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[
        { x: "15%", y: "20%", delay: "0s", dur: "8s" },
        { x: "70%", y: "30%", delay: "2s", dur: "10s" },
        { x: "40%", y: "15%", delay: "4s", dur: "7s" },
        { x: "85%", y: "50%", delay: "1s", dur: "9s" },
        { x: "25%", y: "60%", delay: "3s", dur: "11s" },
      ].map((b, i) => (
        <div key={i} className="absolute animate-butterfly" style={{ left: b.x, top: b.y, animationDelay: b.delay, animationDuration: b.dur }}>
          <span className="text-xs opacity-60">{["🦋", "🦋", "🦋", "🦋", "🦋"][i]}</span>
        </div>
      ))}
    </div>
  );
}

function Sparkles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="absolute animate-sparkle" style={{
          left: `${10 + Math.random() * 80}%`,
          top: `${10 + Math.random() * 80}%`,
          animationDelay: `${Math.random() * 5}s`,
          animationDuration: `${2 + Math.random() * 3}s`,
        }}>
          <span className="text-xs">✨</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──
export default function PetVillage() {
  let ec = null;
  try { ec = useEntropy(); } catch (_) {}
  const rand = useCallback(() => (ec?.randomFloat ? ec.randomFloat() : Math.random()), [ec]);

  const pr = useRef(INIT.map(p => ({ ...p })));
  const [pets, setPets] = useState(INIT);
  const [log, setLog] = useState([]);
  const [sel, setSel] = useState(null);
  const lr = useRef([]);

  const [bubbles, setBubbles] = useState({}); // { [petId]: "text" }
  const [panel, setPanel] = useState("activity"); // "activity" | "predictions"

  // ── Prediction Market State (integrated) ──
  const PREDS_INIT = useMemo(() => [
    { id: 1, question: "Will Mochi befriend Luna today?", pet: { emoji: "🐕", name: "Mochi" }, category: "social", options: [{ label: "Yes", odds: 1.8, pool: 450 },{ label: "No", odds: 2.1, pool: 380 }], timeLeft: 300, duration: 300, status: "active", result: null, resolveResult: 0 },
    { id: 2, question: "Which pet visits the playground first?", pet: { emoji: "🐱", name: "Luna" }, category: "movement", options: [{ label: "Luna 🐱", odds: 2.5, pool: 220 },{ label: "Kiko 🦊", odds: 2.2, pool: 260 },{ label: "Mochi 🐕", odds: 3.0, pool: 180 }], timeLeft: 240, duration: 240, status: "active", result: null, resolveResult: 2 },
    { id: 3, question: "Will any pet fall asleep before noon?", pet: { emoji: "🐹", name: "Peanut" }, category: "action", options: [{ label: "Yes", odds: 1.5, pool: 600 },{ label: "No", odds: 2.8, pool: 310 }], timeLeft: 180, duration: 180, status: "active", result: null, resolveResult: 0 },
    { id: 4, question: "Luna's next mood: Happy or Playful?", pet: { emoji: "🐱", name: "Luna" }, category: "mood", options: [{ label: "Happy 😊", odds: 1.9, pool: 410 },{ label: "Playful 🎾", odds: 1.9, pool: 400 }], timeLeft: 150, duration: 150, status: "active", result: null, resolveResult: 1 },
  ], []);
  const [preds, setPreds] = useState(() => PREDS_INIT.map(p => ({ ...p, options: p.options.map(o => ({ ...o })) })));
  const [bets, setBets] = useState({});
  const [betBalance, setBetBalance] = useState(1000);
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const processedRef = useRef(new Set());

  const showToast = useCallback((msg, type) => { setToast({ message: msg, type }); if (toastRef.current) clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(null), 3000); }, []);

  // Prediction countdown
  useEffect(() => {
    const iv = setInterval(() => {
      setPreds(prev => prev.map(p => {
        if (p.status !== "active") return p;
        const next = p.timeLeft - 1;
        if (next <= 0) return { ...p, timeLeft: 0, status: "resolved", result: p.resolveResult };
        return { ...p, timeLeft: next };
      }));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Prediction payouts
  useEffect(() => {
    preds.forEach(p => {
      if (p.status === "resolved" && !processedRef.current.has(p.id)) {
        processedRef.current.add(p.id);
        const ub = bets[p.id];
        if (ub) {
          if (ub.optionIndex === p.result) {
            const payout = Math.floor(ub.amount * p.options[ub.optionIndex].odds);
            setBetBalance(b => b + payout);
            showToast(`Won ${payout} $PET!`, "win");
          } else {
            showToast("Better luck next time!", "lose");
          }
        }
      }
    });
  }, [preds, bets, showToast]);

  const placeBet = useCallback((predId, optIdx, amount) => {
    if (amount > betBalance) { showToast("Not enough $PET!", "lose"); return; }
    if (bets[predId]) return;
    setBets(prev => ({ ...prev, [predId]: { optionIndex: optIdx, amount } }));
    setBetBalance(b => b - amount);
    setPreds(prev => prev.map(p => {
      if (p.id !== predId) return p;
      const newOpts = p.options.map((o, i) => i === optIdx ? { ...o, pool: o.pool + amount } : o);
      return { ...p, options: newOpts };
    }));
    showToast(`Bet placed: ${amount} $PET`, "info");
  }, [betBalance, bets, showToast]);

  // ── Random speech bubbles ──
  useEffect(() => {
    const iv = setInterval(() => {
      const living = pr.current.filter(p => p.state !== "sleeping");
      if (living.length === 0) return;
      const pet = living[Math.floor(Math.random() * living.length)];
      const isEmote = Math.random() > 0.5;
      const text = isEmote ? EMOTES[Math.floor(Math.random() * EMOTES.length)] : SPEECH[Math.floor(Math.random() * SPEECH.length)];
      setBubbles(prev => ({ ...prev, [pet.id]: text }));
      setTimeout(() => setBubbles(prev => { const n = { ...prev }; delete n[pet.id]; return n; }), 2500);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(iv);
  }, []);

  const addLog = useCallback(e => { const n = [{ text: e, time: Date.now() }, ...lr.current].slice(0, 15); lr.current = n; setLog(n); }, []);
  const findAdj = useCallback((pet, all) => all.find(p => p.id !== pet.id && Math.abs(p.x - pet.x) <= 1 && Math.abs(p.y - pet.y) <= 1), []);

  // ── Pet AI Tick ──
  useEffect(() => {
    const tick = () => {
      const cur = pr.current;
      const next = cur.map(pet => {
        if (pet.energy < 25 && rand() < 0.4 && !pet.isVisitor) {
          if (pet.state !== "sleeping") addLog(`${pet.emoji} ${pet.name} fell asleep`);
          return { ...pet, state: "sleeping", energy: Math.min(100, pet.energy + 5) };
        }
        if (pet.state === "sleeping" && pet.energy >= 60) { addLog(`${pet.emoji} ${pet.name} woke up!`); return { ...pet, state: "idle" }; }
        if (pet.state === "sleeping") return { ...pet, energy: Math.min(100, pet.energy + 3) };

        const dirs = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
        const ch = dirs[Math.floor(rand() * dirs.length)];
        let nx = Math.max(0, Math.min(COLS - 1, pet.x + ch[0]));
        let ny = Math.max(0, Math.min(ROWS - 1, pet.y + ch[1]));
        if (MAP[ny]?.[nx] === "T") { nx = pet.x; ny = pet.y; }

        const moved = nx !== pet.x || ny !== pet.y;
        const ta = ACT[MAP[ny]?.[nx]];
        let ns = moved ? "walking" : "idle";
        let ne = pet.energy - (moved ? 1 : 0);
        let nh = pet.happiness;
        let dir = pet.dir;

        if (moved && nx !== pet.x) dir = nx > pet.x ? 1 : -1;

        if (ta) {
          ns = ta;
          if (ta === "eating") { ne = Math.min(100, ne + 8); nh = Math.min(100, nh + 3); addLog(`${pet.emoji} ${pet.name} is eating`); }
          else if (ta === "drinking") { ne = Math.min(100, ne + 4); addLog(`${pet.emoji} ${pet.name} is drinking`); }
          else if (ta === "playing") { ne = Math.max(0, ne - 3); nh = Math.min(100, nh + 8); addLog(`${pet.emoji} ${pet.name} is playing`); }
          else if (ta === "relaxing") { nh = Math.min(100, nh + 5); addLog(`${pet.emoji} ${pet.name} is relaxing`); }
          else if (ta === "resting") { ne = Math.min(100, ne + 3); addLog(`${pet.emoji} ${pet.name} is resting`); }
          else if (ta === "exploring") { nh = Math.min(100, nh + 6); addLog(`${pet.emoji} ${pet.name} is exploring`); }
        }

        const nb = findAdj({ ...pet, x: nx, y: ny }, cur);
        if (nb && !ta && rand() < 0.35) { ns = "socializing"; nh = Math.min(100, nh + 4); addLog(`${pet.emoji} ${pet.name} chatting with ${nb.emoji} ${nb.name}`); }
        if (rand() < 0.1) nh = Math.max(10, Math.min(100, nh + (rand() > 0.5 ? 2 : -2)));

        return { ...pet, prevX: pet.x, prevY: pet.y, x: nx, y: ny, state: ns, energy: Math.max(0, ne), happiness: nh, dir };
      });
      pr.current = next;
      setPets(next.map(p => ({ ...p })));
    };
    let to;
    const sched = () => { to = setTimeout(() => { tick(); sched(); }, 2000 + Math.floor(Math.random() * 1500)); };
    sched();
    return () => clearTimeout(to);
  }, [rand, addLog, findAdj]);

  // ── Time display ──
  const timeAgo = ts => { const s = Math.floor((Date.now() - ts) / 1000); return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`; };
  const [, stk] = useState(0);
  useEffect(() => { const iv = setInterval(() => stk(t => t + 1), 5000); return () => clearInterval(iv); }, []);

  // ── Derived state ──
  const my = pets.filter(p => !p.isVisitor);
  const vis = pets.filter(p => p.isVisitor);
  const sp = sel !== null ? pets.find(p => p.id === sel) : null;
  const ae = Math.round(my.reduce((s, p) => s + p.energy, 0) / my.length);
  const ah = Math.round(my.reduce((s, p) => s + p.happiness, 0) / my.length);
  const aw = my.filter(p => p.state !== "sleeping").length;

  // ── Render tiles ──
  const tiles = useMemo(() => {
    const t = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const code = MAP[row][col];
        const { x, y } = isoPos(col, row);
        t.push({ col, row, code, x, y });
      }
    }
    return t;
  }, []);

  return (
    <section className="pt-36 px-4 pb-24 min-h-screen" style={{ background: "linear-gradient(180deg, #c8e6c9 0%, #e8f5e9 20%, #FFF9F2 50%)" }}>
      {/* CSS Animations */}
      <style>{`
        @keyframes smoke { 0% { transform: translateY(0) scale(1); opacity: 0.3; } 100% { transform: translateY(-12px) scale(1.5); opacity: 0; } }
        @keyframes ripple { 0% { rx: 6; ry: 2; opacity: 0.3; } 50% { rx: 12; ry: 4; opacity: 0.15; } 100% { rx: 6; ry: 2; opacity: 0.3; } }
        @keyframes ripple2 { 0% { rx: 5; ry: 2; opacity: 0.25; } 50% { rx: 10; ry: 3.5; opacity: 0.1; } 100% { rx: 5; ry: 2; opacity: 0.25; } }
        @keyframes twinkle { 0%,100% { opacity: 0.5; } 50% { opacity: 0.1; } }
        @keyframes twinkle2 { 0%,100% { opacity: 0.4; } 50% { opacity: 0; } }
        @keyframes steam { 0% { transform: translateY(0); opacity: 0.3; } 100% { transform: translateY(-8px); opacity: 0; } }
        @keyframes fountain { 0%,100% { opacity: 0.5; transform: scaleY(1); } 50% { opacity: 0.3; transform: scaleY(1.2); } }
        @keyframes swing { 0%,100% { transform: rotate(-10deg); } 50% { transform: rotate(10deg); } }
        @keyframes petWalk { 0%,100% { transform: translateY(0); } 25% { transform: translateY(-3px); } 75% { transform: translateY(1px); } }
        @keyframes petFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes zzz { 0% { transform: translateY(0); opacity: 0.6; } 100% { transform: translateY(-10px); opacity: 0; } }
        @keyframes butterfly { 0% { transform: translate(0, 0); } 25% { transform: translate(30px, -15px); } 50% { transform: translate(10px, -30px); } 75% { transform: translate(-20px, -10px); } 100% { transform: translate(0, 0); } }
        @keyframes sparkle { 0%,100% { opacity: 0; transform: scale(0.5); } 50% { opacity: 0.8; transform: scale(1.2); } }
        @keyframes spinSlow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 24; } }
        @keyframes drop1 { 0%,100% { cy: 40; opacity: 0.5; } 50% { cy: 36; opacity: 0.2; } }
        @keyframes drop2 { 0%,100% { cy: 42; opacity: 0.4; } 50% { cy: 38; opacity: 0.15; } }
        @keyframes drop3 { 0%,100% { cy: 38; opacity: 0.45; } 50% { cy: 34; opacity: 0.2; } }

        .animate-smoke g { animation: smoke 3s ease-in-out infinite; }
        .animate-ripple { animation: ripple 3s ease-in-out infinite; }
        .animate-ripple2 { animation: ripple2 4s ease-in-out infinite 1s; }
        .animate-twinkle { animation: twinkle 2s ease-in-out infinite; }
        .animate-twinkle2 { animation: twinkle2 2.5s ease-in-out infinite 0.5s; }
        .animate-steam g { animation: steam 2.5s ease-in-out infinite; }
        .animate-fountain g { animation: fountain 2s ease-in-out infinite; }
        .animate-swing g { animation: swing 2s ease-in-out infinite; transform-origin: top center; }
        .animate-petWalk { animation: petWalk 0.6s ease-in-out infinite; }
        .animate-float { animation: petFloat 2s ease-in-out infinite; }
        .animate-zzz { animation: zzz 2s ease-in-out infinite; }
        .animate-butterfly { animation: butterfly linear infinite; }
        .animate-sparkle { animation: sparkle ease-in-out infinite; }
        .animate-spin-slow { animation: spinSlow 2s linear infinite; }
        .animate-drop1 { animation: drop1 2s ease-in-out infinite; }
        .animate-drop2 { animation: drop2 2.5s ease-in-out infinite 0.5s; }
        .animate-drop3 { animation: drop3 2.2s ease-in-out infinite 1s; }
        @keyframes fadeUp { 0% { opacity: 0; transform: translateY(4px) scaleX(var(--dir,1)) translateX(-50%); } 20% { opacity: 1; transform: translateY(0) scaleX(var(--dir,1)) translateX(-50%); } 80% { opacity: 1; } 100% { opacity: 0; transform: translateY(-8px) scaleX(var(--dir,1)) translateX(-50%); } }
        .animate-fadeUp { animation: fadeUp 2.5s ease-out forwards; }

        .iso-grid {
          transform: rotateX(55deg) rotateZ(-45deg);
          transform-style: preserve-3d;
        }
        .iso-tile {
          position: absolute;
          width: ${TILE_W}px;
          height: ${TILE_W}px;
          transform: translateZ(0);
        }
        .iso-tile-ground {
          position: absolute;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #6ab840 0%, #5aa030 50%, #4a9028 100%);
          border: 1px solid rgba(74,144,40,0.3);
          box-shadow: inset 0 0 10px rgba(0,0,0,0.05);
        }
      `}</style>

      <div className="max-w-6xl mx-auto">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl font-body font-bold text-sm shadow-xl flex items-center gap-2
            ${toast.type === "win" ? "bg-emerald-500 text-white" : toast.type === "lose" ? "bg-pink-500 text-white" : "bg-sky-500 text-white"}`}>
            <span className="text-lg">{toast.type === "win" ? "🎉" : toast.type === "lose" ? "💔" : "📝"}</span>
            {toast.message}
          </div>
        )}

        {/* Header */}
        <div className="relative text-center mb-6">
          <h1 className="font-heading text-3xl md:text-4xl text-[#422D26]">Pet Village</h1>
          <p className="font-body text-base text-[#422D26]/50 mt-2">Watch your pets live, predict behaviors, create videos — all in one place</p>
          <div className="flex items-center justify-center gap-4 mt-3 font-body text-sm text-[#422D26]/70">
            <span className="bg-sky/10 px-3 py-1.5 rounded-full">⚡ Energy: {ae}%</span>
            <span className="bg-pink/10 px-3 py-1.5 rounded-full">💕 Happy: {ah}%</span>
            <span className="bg-sun/10 px-3 py-1.5 rounded-full">👁 Awake: {aw}/{my.length}</span>
            <span className="bg-purple-100 px-3 py-1.5 rounded-full text-purple-500">🏠 Visitors: {vis.length}</span>
          </div>
          <div className="absolute top-0 right-0 hidden lg:block"><LavaLamp size="sm" /></div>
        </div>

        {/* Isometric Village Canvas */}
        <div className="rounded-3xl overflow-hidden relative" style={{
          border: "3px solid #FF86B7",
          boxShadow: "0 12px 50px rgba(255,134,183,0.2), 0 4px 15px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)",
          height: "clamp(440px, 58vh, 650px)",
          background: "linear-gradient(180deg, #87ceeb 0%, #b8e6c8 40%, #5a9e2f 60%, #4a8828 100%)",
        }}
          onClick={() => setSel(null)}
        >
          {/* Sky decorations */}
          <div className="absolute top-4 left-8 text-4xl opacity-30 animate-float" style={{ animationDuration: "6s" }}>☁️</div>
          <div className="absolute top-12 right-16 text-3xl opacity-25 animate-float" style={{ animationDuration: "8s", animationDelay: "2s" }}>☁️</div>
          <div className="absolute top-6 left-1/3 text-2xl opacity-20 animate-float" style={{ animationDuration: "7s", animationDelay: "1s" }}>☁️</div>
          <div className="absolute top-2 right-1/3 text-xl opacity-20">☀️</div>

          <Butterflies />
          <Sparkles />

          {/* Isometric Grid Container */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: "1200px" }}>
            <div className="iso-grid relative" style={{
              width: `${COLS * TILE_W}px`,
              height: `${ROWS * TILE_H}px`,
            }}>
              {/* Render tiles */}
              {tiles.map((tile, i) => {
                const TileComp = TILE_COMPONENT[tile.code] || GrassTile;
                return (
                  <div key={i} className="iso-tile" style={{
                    left: `${tile.col * TILE_W}px`,
                    top: `${tile.row * TILE_W}px`,
                    zIndex: tile.row + tile.col,
                  }}>
                    <div className="iso-tile-ground" />
                    <TileComp />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pet sprites (rendered outside isometric transform for easier positioning) */}
          <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
            <div className="relative w-full h-full" style={{ pointerEvents: "none" }}>
              {pets.map(pet => {
                const def = ALL_DEFS.find(d => d.id === pet.id) || PDEFS[0];
                return (
                  <PetSprite
                    key={pet.id}
                    pet={{ ...pet, bc: def.bc, hc: def.hc }}
                    isSelected={sel === pet.id}
                    onClick={() => setSel(s => s === pet.id ? null : pet.id)}
                    bubble={bubbles[pet.id] || null}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Pet chips ── */}
        <div className="mt-6 flex flex-wrap gap-2 mb-2">
          {[...my, ...vis].map(p => (
            <button key={p.id} onClick={() => setSel(sel === p.id ? null : p.id)}
              className="flex items-center gap-2 rounded-full px-4 py-2 transition-all squishy"
              style={{
                background: sel === p.id ? (p.isVisitor ? "#9C27B0" : "#FF86B7") : "rgba(255,255,255,0.7)",
                color: sel === p.id ? "#fff" : "#422D26",
                border: `2px solid ${sel === p.id ? (p.isVisitor ? "#9C27B0" : "#FF86B7") : "rgba(66,45,38,0.1)"}`,
                boxShadow: sel === p.id ? `0 2px 8px ${p.isVisitor ? "rgba(156,39,176,0.3)" : "rgba(255,134,183,0.3)"}` : "none",
              }}>
              <span className="text-lg">{p.emoji}</span>
              <span className="font-body text-sm font-semibold">{p.name}</span>
              <span className={`font-body text-xs ${sel === p.id ? "opacity-70" : "opacity-40"}`}>{SLBL[p.state] || p.state}</span>
              {p.isVisitor && <span className="font-body text-xs opacity-50">👤</span>}
            </button>
          ))}
        </div>

        {/* ── Selected Pet Detail Bar ── */}
        {sp && (
          <div className="rounded-2xl p-4 mb-4 bg-white/80 backdrop-blur-sm flex items-center gap-4 flex-wrap"
            style={{ border: `2px solid ${sp.isVisitor ? "#9C27B0" : "#FF86B7"}` }}>
            <span className="text-3xl">{sp.emoji}</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading text-lg text-[#422D26]">{sp.name}
                {sp.isVisitor && <span className="ml-2 font-body text-xs bg-purple-100 text-purple-500 px-2 py-0.5 rounded-full">Visitor</span>}
              </h3>
              <span className="inline-block rounded-full px-3 py-1 font-body text-xs"
                style={{ background: sp.isVisitor ? "#F3E5F5" : "#FFF0F5", color: sp.isVisitor ? "#9C27B0" : "#FF86B7" }}>
                {SLBL[sp.state] || sp.state}
              </span>
            </div>
            {!sp.isVisitor && (
              <div className="flex gap-6">
                <div className="text-center"><div className="font-heading text-lg text-[#70D6FF]">{sp.energy}%</div><div className="font-body text-xs text-[#422D26]/60">Energy</div></div>
                <div className="text-center"><div className="font-heading text-lg text-[#FF86B7]">{sp.happiness}%</div><div className="font-body text-xs text-[#422D26]/60">Happy</div></div>
              </div>
            )}
          </div>
        )}

        {/* ── Tabbed Panel ── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-3xl sticker-border overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-[#422D26]/8">
            {[
              { key: "activity", icon: "📋", label: "Activity", count: log.length },
              { key: "predictions", icon: "🔮", label: "Predictions", count: preds.filter(p => p.status === "active").length },
            ].map(tab => (
              <button key={tab.key} onClick={() => setPanel(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 font-body text-sm font-bold transition-all
                  ${panel === tab.key ? "text-pink border-b-2 border-pink bg-pink/5" : "text-[#422D26]/60 hover:text-[#422D26]/60"}`}>
                <span className="text-base">{tab.icon}</span>
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs min-w-[20px] text-center ${panel === tab.key ? "bg-pink text-white" : "bg-[#422D26]/10 text-[#422D26]/60"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-5" style={{ maxHeight: 480, overflowY: "auto" }}>
            {/* ── Activity Tab ── */}
            {panel === "activity" && (
              <div className="space-y-2">
                {log.length === 0 && <p className="font-body text-sm text-[#422D26]/60 text-center py-8">Watching pets... activity will appear here</p>}
                {log.map((e, i) => (
                  <div key={`${e.time}-${i}`} className="flex items-start gap-3 rounded-xl px-3 py-2"
                    style={{ background: i === 0 ? "rgba(255,134,183,0.06)" : "transparent" }}>
                    <span className="font-body text-sm text-[#422D26]/70 flex-1 leading-snug">{e.text}</span>
                    <span className="font-body text-xs text-[#422D26]/60 whitespace-nowrap">{timeAgo(e.time)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Predictions Tab ── */}
            {panel === "predictions" && (
              <div className="space-y-4">
                {/* Balance bar */}
                <div className="flex items-center justify-between bg-amber-50/80 rounded-2xl px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💰</span>
                    <div>
                      <div className="font-heading text-lg text-[#422D26]">{betBalance.toLocaleString()} $PET</div>
                      <div className="font-body text-xs text-[#422D26]/60">Your Balance</div>
                    </div>
                  </div>
                  <div className="font-body text-xs text-[#422D26]/60">
                    Bet on what your pets do next!
                  </div>
                </div>

                {/* Prediction cards */}
                {preds.filter(p => p.status === "active").map(pred => (
                  <MiniPrediction key={pred.id} pred={pred} bet={bets[pred.id]} onBet={placeBet} />
                ))}

                {/* Resolved */}
                {preds.filter(p => p.status === "resolved").length > 0 && (
                  <>
                    <div className="font-body text-xs text-[#422D26]/55 uppercase tracking-widest font-bold pt-2">Resolved</div>
                    {preds.filter(p => p.status === "resolved").map(pred => (
                      <MiniPrediction key={pred.id} pred={pred} bet={bets[pred.id]} onBet={placeBet} />
                    ))}
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </section>
  );
}

// ── Mini Prediction Card (inline in village) ──
function MiniPrediction({ pred, bet, onBet }) {
  const [selOpt, setSelOpt] = useState(null);
  const [amount, setAmount] = useState(50);
  const isActive = pred.status === "active";
  const isResolved = pred.status === "resolved";
  const catIcons = { social: "💕", movement: "🏃", action: "⚡", mood: "🎭" };
  const pct = pred.duration > 0 ? (pred.timeLeft / pred.duration) * 100 : 0;
  const m = Math.floor(pred.timeLeft / 60);
  const s = pred.timeLeft % 60;

  return (
    <div className={`rounded-2xl p-4 transition-all ${isResolved ? "bg-[#422D26]/3 opacity-70" : "bg-white/80 border border-[#422D26]/8"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{catIcons[pred.category] || "🔮"}</span>
        <span className="text-lg">{pred.pet.emoji}</span>
        <h4 className="font-heading text-base text-[#422D26] flex-1">{pred.question}</h4>
        {isActive && (
          <span className={`font-heading text-sm tabular-nums ${pct < 25 ? "text-red-500 animate-pulse" : pct < 50 ? "text-amber-500" : "text-[#422D26]/50"}`}>
            {m}:{String(s).padStart(2, "0")}
          </span>
        )}
        {isResolved && <span className="text-sm">✅</span>}
      </div>

      {/* Timer bar */}
      {isActive && (
        <div className="w-full h-1.5 bg-[#422D26]/8 rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: pct < 25 ? "#ef4444" : pct < 50 ? "#f59e0b" : "linear-gradient(90deg,#FF86B7,#70D6FF)" }} />
        </div>
      )}

      {/* Options */}
      <div className="flex gap-2 flex-wrap">
        {pred.options.map((opt, idx) => {
          const isWinner = isResolved && pred.result === idx;
          const isBet = bet && bet.optionIndex === idx;
          const isSelected = selOpt === idx;
          return (
            <button key={idx}
              onClick={() => isActive && !bet && setSelOpt(isSelected ? null : idx)}
              disabled={!isActive || !!bet}
              className={`squishy flex-1 min-w-[80px] rounded-xl px-3 py-2 font-body text-sm font-bold transition-all border-2
                ${isWinner ? "bg-emerald-50 border-emerald-400 text-emerald-600"
                  : isSelected ? "bg-pink-50 border-pink-400 text-pink-600 scale-[1.02]"
                  : isBet ? "bg-sky-50 border-sky-400 text-sky-600"
                  : "bg-white border-[#422D26]/10 text-[#422D26]/70 hover:border-pink-300"}`}>
              <div>{opt.label}</div>
              <div className="text-xs opacity-60">{opt.odds}x · {opt.pool} $PET</div>
            </button>
          );
        })}
      </div>

      {/* Quick bet */}
      {isActive && selOpt !== null && !bet && (
        <div className="flex items-center gap-2 mt-3 bg-amber-50/80 rounded-xl p-3">
          <div className="flex gap-1">
            {[25, 50, 100].map(a => (
              <button key={a} onClick={() => setAmount(a)}
                className={`squishy px-3 py-1.5 rounded-lg font-body text-xs font-bold transition-all
                  ${amount === a ? "bg-amber-400 text-white" : "bg-white border border-[#422D26]/10 text-[#422D26]/60"}`}>
                {a}
              </button>
            ))}
          </div>
          <div className="flex-1 text-right font-body text-xs text-emerald-500 font-bold">
            Win: {Math.floor(amount * pred.options[selOpt].odds)} $PET
          </div>
          <button onClick={() => { onBet(pred.id, selOpt, amount); setSelOpt(null); }}
            className="squishy bg-pink text-white font-heading text-sm px-5 py-2 rounded-xl hover:bg-pink-600 transition-all shadow-md">
            Bet
          </button>
        </div>
      )}

      {/* Active bet display */}
      {bet && isActive && (
        <div className="mt-2 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 font-body text-xs text-sky-600">
          Your bet: <strong>{bet.amount} $PET</strong> on "{pred.options[bet.optionIndex].label}" · Potential: {Math.floor(bet.amount * pred.options[bet.optionIndex].odds)} $PET
        </div>
      )}

      {/* Resolved result */}
      {isResolved && bet && (
        <div className={`mt-2 rounded-xl px-3 py-2 font-body text-sm font-bold text-center ${bet.optionIndex === pred.result ? "bg-emerald-50 text-emerald-600" : "bg-pink-50 text-pink-400"}`}>
          {bet.optionIndex === pred.result ? `🎉 Won ${Math.floor(bet.amount * pred.options[bet.optionIndex].odds)} $PET!` : `😔 Lost ${bet.amount} $PET`}
        </div>
      )}
    </div>
  );
}

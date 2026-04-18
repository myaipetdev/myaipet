"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════
// ── Pokemon-style 2D Overworld — GBA-Quality Pixel Art Engine ──
// ════════════════════════════════════════════════════════════════════

const TILE = 16;
const SCALE = 3;
const MAP_W = 24;
const MAP_H = 20;
const VIEW_TX = 16;
const VIEW_TY = 12;
const CW = VIEW_TX * TILE;
const CH = VIEW_TY * TILE;
const WALK_FRAMES = 8;

// Tile IDs
const _ = 0;  // grass
const P = 1;  // path
const R = 2;  // tree trunk (lower)
const C = 3;  // tree canopy (upper) -- drawn as overlay
const W = 4;  // water
const G = 5;  // tall grass
const K = 6;  // rock
const L = 7;  // lava
const S = 8;  // sand
const F = 9;  // fence
const FL = 10; // flower
const B = 11;  // building wall
const RF = 12; // roof
const DR = 13; // door (building)
const E = 14;  // edge/cliff

type Dir = "down" | "up" | "left" | "right";
const DX: Record<Dir, number> = { up: 0, down: 0, left: -1, right: 1 };
const DY: Record<Dir, number> = { up: -1, down: 1, left: 0, right: 0 };

const SOLID = new Set([R, C, W, K, L, F, B, RF, E]);

interface MapNPC {
  x: number; y: number; name: string;
  type: "trainer" | "boss" | "sign" | "door" | "npc";
  dialogue: string; stageId?: number; targetRegion?: number;
  hairColor?: string; shirtColor?: string; skinColor?: string;
}

interface Pal { g1: string; g2: string; g3: string; p1: string; p2: string; p3: string; bg: string; }

interface RMap {
  id: number; name: string; emoji: string;
  tiles: number[][]; npcs: MapNPC[];
  sx: number; sy: number; pal: Pal;
}

// ══════════════════════════════════════
// ── Seeded random for deterministic  ──
// ── per-tile decoration              ──
// ══════════════════════════════════════
function tileHash(x: number, y: number, salt: number = 0): number {
  let h = (x * 374761 + y * 668265 + salt * 982451) | 0;
  h = ((h >> 16) ^ h) * 0x45d9f3b | 0;
  h = ((h >> 16) ^ h) * 0x45d9f3b | 0;
  h = (h >> 16) ^ h;
  return (h & 0x7fffffff) / 0x7fffffff;
}

// ══════════════════════════════════════════════════
// ── Color utilities                              ──
// ══════════════════════════════════════════════════
function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const gv = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${gv},${bl})`;
}
function darken(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.max(0, r - amt)},${Math.max(0, g - amt)},${Math.max(0, b - amt)})`;
}
function lighten(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.min(255, r + amt)},${Math.min(255, g + amt)},${Math.min(255, b + amt)})`;
}

// ═════════════════════════════════════════════
// ── Enhanced GBA-Quality Tile Rendering ──
// ═════════════════════════════════════════════

// -- GRASS: varied patterns, wind sway, tiny flowers --
function drawGrass(ctx: CanvasRenderingContext2D, x: number, y: number, pal: Pal, tick: number) {
  const px = x * TILE, py = y * TILE;

  // Dithered base - 4 shade checkerboard for depth
  const checker = (x + y) % 2;
  ctx.fillStyle = checker === 0 ? pal.g1 : pal.g2;
  ctx.fillRect(px, py, TILE, TILE);

  // Sub-pixel dithering - alternating pixels for richer color
  const h = tileHash(x, y, 0);
  ctx.fillStyle = pal.g3;
  // Scattered lighter dots
  for (let i = 0; i < 3; i++) {
    const dx = Math.floor(tileHash(x, y, i + 10) * 14) + 1;
    const dy = Math.floor(tileHash(x, y, i + 20) * 14) + 1;
    ctx.fillRect(px + dx, py + dy, 1, 1);
  }

  // Wind-swaying grass tufts
  const windPhase = tick * 0.03 + x * 0.7 + y * 0.4;
  const sway = Math.sin(windPhase) * 0.8;
  ctx.fillStyle = darken(pal.g2, 15);
  if (h < 0.3) {
    const bx = px + 3 + Math.round(sway);
    ctx.fillRect(bx, py + 10, 1, 4);
    ctx.fillRect(bx + 1, py + 8, 1, 3);
  }
  if (h > 0.4 && h < 0.65) {
    const bx2 = px + 10 + Math.round(sway);
    ctx.fillRect(bx2, py + 9, 1, 5);
    ctx.fillRect(bx2 + 1, py + 7, 1, 4);
    ctx.fillRect(bx2 - 1, py + 11, 1, 3);
  }
  // Bright tips
  if (h < 0.65) {
    ctx.fillStyle = lighten(pal.g1, 20);
    const tipX = px + Math.floor(tileHash(x, y, 50) * 10) + 3 + Math.round(sway);
    ctx.fillRect(tipX, py + 7, 1, 1);
  }

  // Tiny scattered flowers (rare)
  if (h > 0.92) {
    const fx = px + Math.floor(tileHash(x, y, 99) * 10) + 3;
    const fy = py + Math.floor(tileHash(x, y, 88) * 8) + 4;
    const cols = ["#ff6688", "#ffcc44", "#aaddff", "#ffaacc", "#ccaaff"];
    ctx.fillStyle = cols[Math.floor(tileHash(x, y, 77) * cols.length)];
    ctx.fillRect(fx, fy, 2, 2);
    ctx.fillStyle = "#ffee55";
    ctx.fillRect(fx, fy + 1, 1, 1);
  }
}

// -- PATH: worn dirt with pebbles and edge blending --
function drawPath(ctx: CanvasRenderingContext2D, x: number, y: number, tiles: number[][], pal: Pal) {
  const px = x * TILE, py = y * TILE;
  // Rich base with subtle variation
  ctx.fillStyle = pal.p1;
  ctx.fillRect(px, py, TILE, TILE);
  // Inner lighter band
  ctx.fillStyle = pal.p2;
  ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
  // Even lighter center
  ctx.fillStyle = lighten(pal.p2, 8);
  ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);

  // Pebble details
  const h = tileHash(x, y, 0);
  ctx.fillStyle = pal.p3;
  if (h < 0.3) {
    ctx.fillRect(px + 4, py + 6, 2, 1);
    ctx.fillRect(px + 10, py + 11, 1, 1);
  }
  if (h > 0.5 && h < 0.7) {
    ctx.fillRect(px + 8, py + 4, 1, 1);
    ctx.fillRect(px + 3, py + 12, 2, 1);
  }
  // Highlight pebble
  ctx.fillStyle = lighten(pal.p2, 16);
  if (h > 0.8) {
    ctx.fillRect(px + 7, py + 9, 1, 1);
  }

  // Edge blending -- draw grass-colored rounded border where path meets grass
  const isGrassAt = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    const t = tiles[ty][tx];
    return t !== P && t !== DR && t !== B;
  };

  // Top edge
  if (isGrassAt(x, y - 1)) {
    ctx.fillStyle = pal.g1;
    ctx.fillRect(px, py, TILE, 2);
    ctx.fillStyle = pal.g2;
    ctx.fillRect(px + 2, py, TILE - 4, 1);
    // Rounded corners
    ctx.fillStyle = lerpColor(pal.g1, pal.p1, 0.5);
    ctx.fillRect(px + 1, py + 2, 2, 1);
    ctx.fillRect(px + TILE - 3, py + 2, 2, 1);
  }
  // Bottom edge
  if (isGrassAt(x, y + 1)) {
    ctx.fillStyle = pal.g1;
    ctx.fillRect(px, py + TILE - 2, TILE, 2);
    ctx.fillStyle = pal.g2;
    ctx.fillRect(px + 2, py + TILE - 1, TILE - 4, 1);
    ctx.fillStyle = lerpColor(pal.g1, pal.p1, 0.5);
    ctx.fillRect(px + 1, py + TILE - 3, 2, 1);
    ctx.fillRect(px + TILE - 3, py + TILE - 3, 2, 1);
  }
  // Left edge
  if (isGrassAt(x - 1, y)) {
    ctx.fillStyle = pal.g1;
    ctx.fillRect(px, py, 2, TILE);
    ctx.fillStyle = lerpColor(pal.g1, pal.p1, 0.4);
    ctx.fillRect(px + 2, py + 2, 1, TILE - 4);
  }
  // Right edge
  if (isGrassAt(x + 1, y)) {
    ctx.fillStyle = pal.g1;
    ctx.fillRect(px + TILE - 2, py, 2, TILE);
    ctx.fillStyle = lerpColor(pal.g1, pal.p1, 0.4);
    ctx.fillRect(px + TILE - 3, py + 2, 1, TILE - 4);
  }
}

// -- TREE TRUNK: detailed bark, roots, shadow --
function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, pal: Pal) {
  const px = x * TILE, py = y * TILE;
  // Base grass under trunk
  ctx.fillStyle = (x + y) % 2 === 0 ? pal.g1 : pal.g2;
  ctx.fillRect(px, py, TILE, TILE);

  // Ground shadow from canopy
  ctx.fillStyle = "rgba(0,30,0,0.18)";
  ctx.fillRect(px - 1, py, TILE + 2, TILE);

  // Trunk - multi-layered for depth
  ctx.fillStyle = "#4a2a10";
  ctx.fillRect(px + 5, py + 0, 7, TILE);
  ctx.fillStyle = "#5a3a18";
  ctx.fillRect(px + 6, py + 0, 5, TILE);
  ctx.fillStyle = "#6a4a28";
  ctx.fillRect(px + 7, py + 0, 3, TILE);
  // Bark highlight (right side light)
  ctx.fillStyle = "#7a5a38";
  ctx.fillRect(px + 8, py + 2, 2, TILE - 4);
  ctx.fillStyle = "#8a6a48";
  ctx.fillRect(px + 9, py + 3, 1, TILE - 6);
  // Bark shadow (left side dark)
  ctx.fillStyle = "#3a1a08";
  ctx.fillRect(px + 5, py + 0, 1, TILE);
  // Bark texture lines
  ctx.fillStyle = "#4a2a10";
  ctx.fillRect(px + 7, py + 3, 1, 3);
  ctx.fillRect(px + 8, py + 8, 1, 2);
  ctx.fillRect(px + 7, py + 12, 1, 2);

  // Roots - spreading outward
  ctx.fillStyle = "#5a3a18";
  ctx.fillRect(px + 3, py + 13, 3, 3);
  ctx.fillRect(px + 11, py + 12, 3, 4);
  ctx.fillStyle = "#4a2a10";
  ctx.fillRect(px + 2, py + 14, 2, 2);
  ctx.fillRect(px + 12, py + 13, 2, 3);
  // Root highlight
  ctx.fillStyle = "#6a4a28";
  ctx.fillRect(px + 4, py + 13, 1, 1);
  ctx.fillRect(px + 12, py + 12, 1, 1);
}

// -- TREE CANOPY: rich layered foliage with depth --
function drawCanopy(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  const px = x * TILE, py = y * TILE;

  // Ground shadow beneath canopy
  ctx.fillStyle = "rgba(0,30,0,0.12)";
  ctx.fillRect(px - 3, py + 12, 22, 6);

  // Subtle wind movement
  const sway = Math.round(Math.sin(tick * 0.02 + x * 1.2 + y * 0.8) * 0.5);

  // Outer shadow layer (darkest)
  ctx.fillStyle = "#0a3a0e";
  ctx.fillRect(px - 3 + sway, py - 3, 22, 18);

  // Dark outer canopy
  ctx.fillStyle = "#1a5a20";
  ctx.fillRect(px - 2 + sway, py - 2, 20, 16);

  // Mid layer
  ctx.fillStyle = "#2a7a30";
  ctx.fillRect(px - 1 + sway, py - 1, 18, 14);

  // Inner lighter
  ctx.fillStyle = "#3a9a3a";
  ctx.fillRect(px + 1 + sway, py + 1, 14, 10);

  // Bright highlights (sun-facing, top-left)
  ctx.fillStyle = "#4aba4a";
  ctx.fillRect(px + 2 + sway, py + 0, 7, 5);
  ctx.fillRect(px + 3 + sway, py - 1, 5, 3);

  // Top bright spot
  ctx.fillStyle = "#5aca5a";
  ctx.fillRect(px + 4 + sway, py - 1, 4, 2);

  // Specular highlight
  ctx.fillStyle = "#6ada6a";
  ctx.fillRect(px + 5 + sway, py, 2, 1);

  // Bottom dark edge (shadow side)
  ctx.fillStyle = "#1a4a18";
  ctx.fillRect(px - 1 + sway, py + 12, 18, 2);
  ctx.fillRect(px - 2 + sway, py + 10, 1, 4);
  ctx.fillRect(px + 16 + sway, py + 10, 1, 4);

  // Leaf detail dots on canopy
  ctx.fillStyle = "#2a6a28";
  const h = tileHash(x, y, 33);
  if (h < 0.5) ctx.fillRect(px + 4 + sway, py + 6, 2, 2);
  if (h > 0.3) ctx.fillRect(px + 10 + sway, py + 4, 2, 2);
  ctx.fillStyle = "#4aba4a";
  if (h > 0.6) ctx.fillRect(px + 7 + sway, py + 2, 1, 1);
}

// -- WATER: 3-frame sine wave animation, reflective highlights, shore blending --
function drawWater(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, tiles: number[][]) {
  const px = x * TILE, py = y * TILE;

  // Deep base
  ctx.fillStyle = "#1050a0";
  ctx.fillRect(px, py, TILE, TILE);

  // Mid-depth layer
  ctx.fillStyle = "#1860b0";
  ctx.fillRect(px, py + 1, TILE, TILE - 2);

  // Animated wave bands (3-frame cycle)
  const frame = Math.floor(tick / 12) % 3;
  const phase = x * 0.9 + y * 0.5;

  // Wave row 1
  const w1off = [0, 2, -1][frame];
  ctx.fillStyle = "#2878cc";
  for (let i = 0; i < TILE; i += 2) {
    const wy = py + 2 + Math.round(Math.sin(phase + i * 0.3 + frame * 1.2) * 1) + w1off;
    if (wy >= py && wy < py + TILE) ctx.fillRect(px + i, wy, 2, 1);
  }

  // Wave row 2
  ctx.fillStyle = "#3090dd";
  for (let i = 0; i < TILE; i += 2) {
    const wy2 = py + 7 + Math.round(Math.sin(phase + i * 0.4 + frame * 1.5 + 2) * 1);
    if (wy2 >= py && wy2 < py + TILE) ctx.fillRect(px + i, wy2, 2, 1);
  }

  // Wave row 3
  ctx.fillStyle = "#2470bb";
  for (let i = 0; i < TILE; i += 3) {
    const wy3 = py + 12 + Math.round(Math.sin(phase + i * 0.5 + frame + 4) * 1);
    if (wy3 >= py && wy3 < py + TILE) ctx.fillRect(px + i, wy3, 2, 1);
  }

  // Reflective sparkles
  ctx.fillStyle = "#a0d0ff";
  const sparkPhase = (tick + x * 17 + y * 11) % 30;
  if (sparkPhase < 3) {
    const spx = px + Math.floor(tileHash(x, y, 5) * 12) + 2;
    const spy = py + Math.floor(tileHash(x, y, 6) * 10) + 3;
    ctx.fillRect(spx, spy, 1, 1);
    if (sparkPhase < 1) {
      ctx.fillStyle = "#c0e8ff";
      ctx.fillRect(spx + 1, spy, 1, 1);
      ctx.fillRect(spx, spy - 1, 1, 1);
    }
  }

  // Shore / edge blending with adjacent non-water tiles
  const isWaterAt = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return tiles[ty][tx] === W;
  };
  // Top shore
  if (!isWaterAt(x, y - 1)) {
    ctx.fillStyle = "#70a8d0";
    ctx.fillRect(px, py, TILE, 2);
    ctx.fillStyle = "#90c0e0";
    ctx.fillRect(px + 2, py, TILE - 4, 1);
    // Foam dots
    ctx.fillStyle = "#c0e0f0";
    ctx.fillRect(px + 3 + (frame * 2), py, 2, 1);
    ctx.fillRect(px + 10 - frame, py, 2, 1);
  }
  // Bottom shore
  if (!isWaterAt(x, y + 1)) {
    ctx.fillStyle = "#70a8d0";
    ctx.fillRect(px, py + TILE - 2, TILE, 2);
    ctx.fillStyle = "#90c0e0";
    ctx.fillRect(px + 2, py + TILE - 1, TILE - 4, 1);
  }
  // Left shore
  if (!isWaterAt(x - 1, y)) {
    ctx.fillStyle = "#70a8d0";
    ctx.fillRect(px, py, 2, TILE);
  }
  // Right shore
  if (!isWaterAt(x + 1, y)) {
    ctx.fillStyle = "#70a8d0";
    ctx.fillRect(px + TILE - 2, py, 2, TILE);
  }
}

// -- TALL GRASS: dense animated blades with layers --
function drawTallGrass(ctx: CanvasRenderingContext2D, x: number, y: number, pal: Pal, tick: number) {
  const px = x * TILE, py = y * TILE;
  // Dark base
  ctx.fillStyle = "#1a5a1a";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = "#206820";
  ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);

  // Animated sway
  const sw = Math.sin(tick * 0.06 + x * 1.3 + y * 0.9);
  const swI = Math.round(sw);

  // Layer 1 -- back blades (darker)
  ctx.fillStyle = "#287028";
  for (let i = 0; i < 5; i++) {
    const bx = px + i * 3 + 1 + swI;
    ctx.fillRect(bx, py + 4, 1, 9);
    ctx.fillRect(bx - 1, py + 2, 1, 5);
    ctx.fillRect(bx + 1, py + 3, 1, 4);
  }

  // Layer 2 -- front blades (bright)
  ctx.fillStyle = "#38a838";
  for (let i = 0; i < 4; i++) {
    const bx = px + i * 4 + 2 - swI;
    ctx.fillRect(bx, py + 1, 2, 11);
    ctx.fillRect(bx, py, 1, 3);
  }

  // Bright tips
  ctx.fillStyle = "#48c848";
  for (let i = 0; i < 4; i++) {
    const tx = px + i * 4 + 3 + Math.round(sw * 0.5);
    ctx.fillRect(tx, py, 1, 2);
  }

  // Highlight spots
  ctx.fillStyle = "#58d858";
  ctx.fillRect(px + 5 + swI, py + 1, 1, 1);
  ctx.fillRect(px + 11 - swI, py + 2, 1, 1);

  // Dark base accent - suppress unused var warning
  void pal;
  ctx.fillStyle = "#185018";
  ctx.fillRect(px, py + TILE - 2, TILE, 2);
}

// -- ROCK: layered 3D appearance with cracks --
function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, pal: Pal) {
  const px = x * TILE, py = y * TILE;
  ctx.fillStyle = (x + y) % 2 === 0 ? pal.g1 : pal.g2;
  ctx.fillRect(px, py, TILE, TILE);

  // Ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(px + 1, py + 12, 14, 4);
  ctx.fillRect(px + 2, py + 11, 12, 1);

  // Rock body (layered for 3D)
  ctx.fillStyle = "#505868";
  ctx.fillRect(px + 1, py + 5, 14, 10);
  ctx.fillStyle = "#606878";
  ctx.fillRect(px + 2, py + 4, 12, 9);
  ctx.fillStyle = "#708090";
  ctx.fillRect(px + 3, py + 3, 10, 7);
  ctx.fillStyle = "#8090a0";
  ctx.fillRect(px + 4, py + 2, 8, 5);

  // Top highlight (sunlit)
  ctx.fillStyle = "#98a0b0";
  ctx.fillRect(px + 4, py + 2, 5, 3);
  ctx.fillStyle = "#a8b0c0";
  ctx.fillRect(px + 5, py + 2, 3, 2);
  ctx.fillStyle = "#b0b8c8";
  ctx.fillRect(px + 6, py + 2, 1, 1);

  // Dark bottom edge
  ctx.fillStyle = "#404858";
  ctx.fillRect(px + 1, py + 13, 14, 2);
  ctx.fillStyle = "#384050";
  ctx.fillRect(px + 2, py + 14, 12, 1);

  // Cracks
  ctx.fillStyle = "#384050";
  ctx.fillRect(px + 5, py + 4, 1, 4);
  ctx.fillRect(px + 6, py + 7, 1, 2);
  ctx.fillRect(px + 10, py + 5, 1, 3);
  ctx.fillRect(px + 9, py + 7, 1, 2);
  // Thin crack detail
  ctx.fillStyle = "#485060";
  ctx.fillRect(px + 7, py + 6, 1, 1);
}

// -- FLOWER: detailed with stem, leaves, petals --
function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, pal: Pal, tick: number) {
  drawGrass(ctx, x, y, pal, tick);
  const px = x * TILE, py = y * TILE;
  const colors = ["#ff4466", "#ffaa22", "#7744ff", "#ff2288", "#44bbff"];
  const ci = Math.floor(tileHash(x, y, 0) * colors.length);
  const sway = Math.round(Math.sin(tick * 0.04 + x * 2) * 0.5);

  // Stem
  ctx.fillStyle = "#2a8820";
  ctx.fillRect(px + 7 + sway, py + 8, 1, 6);
  ctx.fillRect(px + 7 + sway, py + 9, 2, 1);
  // Lower stem
  ctx.fillStyle = "#1a6818";
  ctx.fillRect(px + 7, py + 12, 1, 3);

  // Leaves
  ctx.fillStyle = "#3ab830";
  ctx.fillRect(px + 4 + sway, py + 10, 3, 2);
  ctx.fillRect(px + 10 + sway, py + 9, 3, 2);
  ctx.fillStyle = "#2a9828";
  ctx.fillRect(px + 5 + sway, py + 10, 1, 1);

  // Petals (6 around center)
  ctx.fillStyle = colors[ci];
  ctx.fillRect(px + 5 + sway, py + 4, 2, 3);
  ctx.fillRect(px + 9 + sway, py + 4, 2, 3);
  ctx.fillRect(px + 5 + sway, py + 8, 2, 2);
  ctx.fillRect(px + 9 + sway, py + 8, 2, 2);
  ctx.fillRect(px + 4 + sway, py + 5, 2, 3);
  ctx.fillRect(px + 10 + sway, py + 5, 2, 3);
  // Lighter petal highlight
  ctx.fillStyle = lighten(colors[ci], 40);
  ctx.fillRect(px + 6 + sway, py + 4, 1, 1);
  ctx.fillRect(px + 10 + sway, py + 4, 1, 1);

  // Center
  ctx.fillStyle = "#ffee22";
  ctx.fillRect(px + 6 + sway, py + 6, 4, 3);
  ctx.fillStyle = "#ffdd00";
  ctx.fillRect(px + 7 + sway, py + 7, 2, 1);
  ctx.fillStyle = "#ffcc00";
  ctx.fillRect(px + 7 + sway, py + 6, 1, 1);
}

// -- FENCE: posts and rails with wood texture --
function drawFence(ctx: CanvasRenderingContext2D, x: number, y: number, pal: Pal, tick: number) {
  drawGrass(ctx, x, y, pal, tick);
  const px = x * TILE, py = y * TILE;
  // Posts
  ctx.fillStyle = "#7a5020";
  ctx.fillRect(px + 1, py + 2, 3, 12);
  ctx.fillRect(px + 12, py + 2, 3, 12);
  // Post highlights
  ctx.fillStyle = "#8a6030";
  ctx.fillRect(px + 2, py + 3, 1, 10);
  ctx.fillRect(px + 13, py + 3, 1, 10);
  // Rails
  ctx.fillStyle = "#a07840";
  ctx.fillRect(px, py + 4, TILE, 3);
  ctx.fillRect(px, py + 10, TILE, 3);
  // Rail highlight
  ctx.fillStyle = "#b89050";
  ctx.fillRect(px, py + 4, TILE, 1);
  ctx.fillRect(px, py + 10, TILE, 1);
  // Rail shadow
  ctx.fillStyle = "#806030";
  ctx.fillRect(px, py + 6, TILE, 1);
  ctx.fillRect(px, py + 12, TILE, 1);
  // Post tops (caps)
  ctx.fillStyle = "#604018";
  ctx.fillRect(px + 0, py + 1, 5, 2);
  ctx.fillRect(px + 11, py + 1, 5, 2);
  ctx.fillStyle = "#705020";
  ctx.fillRect(px + 1, py + 1, 3, 1);
  ctx.fillRect(px + 12, py + 1, 3, 1);
}

// -- BUILDING WALL: brick texture with window details --
function drawBuilding(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TILE, py = y * TILE;
  // Base wall
  ctx.fillStyle = "#d0c0a0";
  ctx.fillRect(px, py, TILE, TILE);

  // Brick pattern
  ctx.fillStyle = "#c8b898";
  for (let row = 0; row < TILE; row += 4) {
    const off = (row / 4) % 2 === 0 ? 0 : 4;
    for (let col = off; col < TILE; col += 8) {
      ctx.fillRect(px + col, py + row, 7, 3);
    }
  }
  // Brick mortar lines
  ctx.fillStyle = "#b0a080";
  for (let row = 0; row < TILE; row += 4) {
    ctx.fillRect(px, py + row + 3, TILE, 1);
    const off = (row / 4) % 2 === 0 ? 0 : 4;
    for (let col = off; col < TILE; col += 8) {
      ctx.fillRect(px + col + 7, py + row, 1, 3);
    }
  }

  // Window (on certain tiles)
  if ((x + y) % 3 === 0) {
    // Window frame
    ctx.fillStyle = "#604830";
    ctx.fillRect(px + 3, py + 2, 10, 10);
    // Glass
    ctx.fillStyle = "#3880bb";
    ctx.fillRect(px + 4, py + 3, 8, 8);
    ctx.fillStyle = "#5098cc";
    ctx.fillRect(px + 5, py + 4, 6, 6);
    // Reflection
    ctx.fillStyle = "#88c0ee";
    ctx.fillRect(px + 5, py + 4, 2, 3);
    ctx.fillStyle = "#a0d0ff";
    ctx.fillRect(px + 5, py + 4, 1, 2);
    // Cross divider
    ctx.fillStyle = "#604830";
    ctx.fillRect(px + 7, py + 3, 2, 8);
    ctx.fillRect(px + 4, py + 6, 8, 2);
    // Sill
    ctx.fillStyle = "#c8b898";
    ctx.fillRect(px + 3, py + 11, 10, 2);
    ctx.fillStyle = "#d8c8a8";
    ctx.fillRect(px + 3, py + 11, 10, 1);
  }
}

// -- ROOF: detailed shingle pattern --
function drawRoof(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TILE, py = y * TILE;
  // Base
  ctx.fillStyle = "#993333";
  ctx.fillRect(px, py, TILE, TILE);
  // Shingle rows
  ctx.fillStyle = "#aa3838";
  for (let row = 0; row < TILE; row += 3) {
    const off = (row / 3) % 2 === 0 ? 0 : 3;
    for (let col = off; col < TILE; col += 6) {
      ctx.fillRect(px + col, py + row, 5, 2);
    }
  }
  // Light shingle tops
  ctx.fillStyle = "#cc5555";
  for (let row = 0; row < TILE; row += 3) {
    ctx.fillRect(px, py + row, TILE, 1);
  }
  // Ridge highlight
  ctx.fillStyle = "#dd6666";
  ctx.fillRect(px + 2, py + 1, TILE - 4, 1);
  // Shadow at bottom
  ctx.fillStyle = "#882828";
  ctx.fillRect(px, py + TILE - 2, TILE, 2);
}

// -- DOOR: detailed with frame, handle, welcome mat --
function drawDoor(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TILE, py = y * TILE;
  // Wall behind door
  ctx.fillStyle = "#d0c0a0";
  ctx.fillRect(px, py, TILE, TILE);
  // Brick on wall parts
  ctx.fillStyle = "#c8b898";
  ctx.fillRect(px, py, 3, TILE);
  ctx.fillRect(px + 13, py, 3, TILE);

  // Door frame (outer)
  ctx.fillStyle = "#503820";
  ctx.fillRect(px + 2, py + 1, 12, 14);
  // Door frame (inner)
  ctx.fillStyle = "#604028";
  ctx.fillRect(px + 3, py + 1, 10, 14);

  // Door panels
  ctx.fillStyle = "#8a6838";
  ctx.fillRect(px + 4, py + 2, 8, 13);
  ctx.fillStyle = "#9a7848";
  ctx.fillRect(px + 5, py + 3, 6, 11);
  // Panel detail
  ctx.fillStyle = "#8a6838";
  ctx.fillRect(px + 5, py + 8, 6, 1);
  // Upper panel lighter
  ctx.fillStyle = "#aa8858";
  ctx.fillRect(px + 6, py + 4, 4, 3);
  // Lower panel lighter
  ctx.fillStyle = "#aa8858";
  ctx.fillRect(px + 6, py + 10, 4, 3);

  // Handle
  ctx.fillStyle = "#ffd744";
  ctx.fillRect(px + 10, py + 8, 2, 2);
  ctx.fillStyle = "#eebb22";
  ctx.fillRect(px + 10, py + 9, 2, 1);

  // Welcome mat / step
  ctx.fillStyle = "#907060";
  ctx.fillRect(px + 2, py + 14, 12, 2);
  ctx.fillStyle = "#a08070";
  ctx.fillRect(px + 3, py + 14, 10, 1);
}

// -- CLIFF EDGE: layered depth with cracks --
function drawEdge(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TILE, py = y * TILE;
  // Layers for 3D depth
  ctx.fillStyle = "#4a3a20";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = "#5a4a30";
  ctx.fillRect(px + 1, py, TILE - 2, TILE - 2);
  ctx.fillStyle = "#6a5a40";
  ctx.fillRect(px + 2, py, TILE - 4, TILE - 4);

  // Top surface highlight
  ctx.fillStyle = "#7a6a50";
  ctx.fillRect(px + 2, py, TILE - 4, 3);
  ctx.fillStyle = "#8a7a60";
  ctx.fillRect(px + 3, py, TILE - 6, 2);

  // Shadow at bottom
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(px, py + TILE - 3, TILE, 3);
  ctx.fillStyle = "#2a1a10";
  ctx.fillRect(px, py + TILE - 2, TILE, 2);

  // Cracks
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(px + 4, py + 3, 1, 5);
  ctx.fillRect(px + 5, py + 7, 1, 2);
  ctx.fillRect(px + 10, py + 4, 1, 4);
  ctx.fillRect(px + 11, py + 7, 1, 3);
  // Light crack edges
  ctx.fillStyle = "#7a6a50";
  ctx.fillRect(px + 5, py + 3, 1, 3);
  ctx.fillRect(px + 11, py + 4, 1, 2);
}

// -- LAVA: animated with bubbling --
function drawLava(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  const px = x * TILE, py = y * TILE;
  // Deep base
  ctx.fillStyle = "#770800";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = "#991100";
  ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);

  // Flowing lava animation
  const phase = tick * 0.08 + x * 1.2 + y * 0.8;
  ctx.fillStyle = "#bb3300";
  const ox1 = Math.round(Math.sin(phase) * 3);
  ctx.fillRect(px + 3 + ox1, py + 2, 5, 3);
  ctx.fillRect(px + 2 + ox1, py + 3, 7, 2);

  ctx.fillStyle = "#dd5500";
  const ox2 = Math.round(Math.sin(phase + 2.5) * 3);
  ctx.fillRect(px + 5 + ox2, py + 8, 4, 3);

  // Bright hotspot
  ctx.fillStyle = "#ff8800";
  ctx.fillRect(px + 6 + Math.round(Math.sin(phase * 1.3) * 2), py + 5, 3, 2);
  ctx.fillStyle = "#ffaa22";
  ctx.fillRect(px + 7, py + 6 + Math.round(Math.sin(phase * 1.5)), 2, 2);

  // Bubble
  const bubblePhase = (tick + x * 13 + y * 7) % 40;
  if (bubblePhase < 6) {
    ctx.fillStyle = "#ffcc44";
    const bx = px + Math.floor(tileHash(x, y, 3) * 10) + 3;
    const by = py + 4 - Math.floor(bubblePhase / 2);
    ctx.fillRect(bx, by, 2, 2);
    if (bubblePhase > 3) {
      ctx.fillStyle = "#ffee66";
      ctx.fillRect(bx, by, 1, 1);
    }
  }

  // Edge glow
  ctx.fillStyle = "#660600";
  ctx.fillRect(px, py, TILE, 1);
  ctx.fillRect(px, py + TILE - 1, TILE, 1);
  ctx.fillRect(px, py, 1, TILE);
  ctx.fillRect(px + TILE - 1, py, 1, TILE);
}

// -- SAND: warm tones with speckle --
function drawSand(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TILE, py = y * TILE;
  ctx.fillStyle = (x + y) % 2 === 0 ? "#c8b070" : "#d0b878";
  ctx.fillRect(px, py, TILE, TILE);
  // Subtle grain
  ctx.fillStyle = "#b8a060";
  const h = tileHash(x, y, 0);
  if (h < 0.2) ctx.fillRect(px + 5, py + 9, 1, 1);
  if (h > 0.4 && h < 0.6) ctx.fillRect(px + 11, py + 4, 1, 1);
  if (h > 0.7) ctx.fillRect(px + 3, py + 12, 1, 1);
  // Lighter grain
  ctx.fillStyle = "#d8c888";
  if (h < 0.35) ctx.fillRect(px + 9, py + 7, 1, 1);
  if (h > 0.6) ctx.fillRect(px + 6, py + 3, 1, 1);
}

// Tile dispatcher
function drawTile(ctx: CanvasRenderingContext2D, t: number, x: number, y: number, tiles: number[][], pal: Pal, tick: number) {
  switch (t) {
    case _: drawGrass(ctx, x, y, pal, tick); break;
    case P: drawPath(ctx, x, y, tiles, pal); break;
    case R: drawTree(ctx, x, y, pal); break;
    case C: drawGrass(ctx, x, y, pal, tick); break; // canopy base = grass, canopy drawn as overlay
    case W: drawWater(ctx, x, y, tick, tiles); break;
    case G: drawTallGrass(ctx, x, y, pal, tick); break;
    case K: drawRock(ctx, x, y, pal); break;
    case L: drawLava(ctx, x, y, tick); break;
    case S: drawSand(ctx, x, y); break;
    case F: drawFence(ctx, x, y, pal, tick); break;
    case FL: drawFlower(ctx, x, y, pal, tick); break;
    case B: drawBuilding(ctx, x, y); break;
    case RF: drawRoof(ctx, x, y); break;
    case DR: drawDoor(ctx, x, y); break;
    case E: drawEdge(ctx, x, y); break;
    default: drawGrass(ctx, x, y, pal, tick);
  }
}

// ═══════════════════════════════════════════════════
// ── GBA-Quality Character Rendering             ──
// ═══════════════════════════════════════════════════

// -- PLAYER SPRITE: detailed with 4-directional walk animation --
function drawPlayer(ctx: CanvasRenderingContext2D, px: number, py: number, dir: Dir, step: number, moving: boolean) {
  const bob = moving ? Math.round(Math.sin(step * 0.7) * 1) : 0;
  const leg = moving ? Math.floor(step / 2) % 4 : 0;
  const armSwing = moving ? [0, 1, 0, -1][leg] : 0;

  // Shadow ellipse
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(px + 3, py + 14, 10, 2);
  ctx.fillRect(px + 4, py + 15, 8, 1);

  if (dir === "up") {
    // -- BACK VIEW --
    // Hair
    ctx.fillStyle = "#2a1808";
    ctx.fillRect(px + 4, py + 1 + bob, 8, 5);
    ctx.fillStyle = "#3a2818";
    ctx.fillRect(px + 5, py + 1 + bob, 6, 4);
    // Cap
    ctx.fillStyle = "#cc2222";
    ctx.fillRect(px + 3, py + 0 + bob, 10, 4);
    ctx.fillStyle = "#dd3333";
    ctx.fillRect(px + 4, py + 0 + bob, 8, 3);
    ctx.fillStyle = "#ee4444";
    ctx.fillRect(px + 5, py + 0 + bob, 6, 2);
    // Cap back stripe
    ctx.fillStyle = "#fff";
    ctx.fillRect(px + 7, py + 1 + bob, 2, 2);
    // Backpack
    ctx.fillStyle = "#bb5522";
    ctx.fillRect(px + 5, py + 5 + bob, 6, 6);
    ctx.fillStyle = "#cc6633";
    ctx.fillRect(px + 6, py + 5 + bob, 4, 5);
    ctx.fillStyle = "#dd7744";
    ctx.fillRect(px + 7, py + 6 + bob, 2, 3);
    // Backpack buckle
    ctx.fillStyle = "#886622";
    ctx.fillRect(px + 7, py + 10 + bob, 2, 1);
    // Arms
    ctx.fillStyle = "#2255bb";
    ctx.fillRect(px + 3, py + 6 + bob + armSwing, 2, 5);
    ctx.fillRect(px + 11, py + 6 + bob - armSwing, 2, 5);
    ctx.fillStyle = "#3366cc";
    ctx.fillRect(px + 3, py + 6 + bob + armSwing, 2, 4);
    // Hands
    ctx.fillStyle = "#ffcc88";
    ctx.fillRect(px + 3, py + 10 + bob + armSwing, 2, 1);
    ctx.fillRect(px + 11, py + 10 + bob - armSwing, 2, 1);
    // Legs
    ctx.fillStyle = "#334466";
    ctx.fillRect(px + 5 + [0, 1, 0, -1][leg], py + 12, 3, 2);
    ctx.fillRect(px + 8 - [0, 1, 0, -1][leg], py + 12, 3, 2);
    // Shoes
    ctx.fillStyle = "#cc2222";
    ctx.fillRect(px + 5 + [0, 1, 0, -1][leg], py + 14, 3, 1);
    ctx.fillRect(px + 8 - [0, 1, 0, -1][leg], py + 14, 3, 1);

  } else if (dir === "down") {
    // -- FRONT VIEW --
    // Hair behind cap
    ctx.fillStyle = "#2a1808";
    ctx.fillRect(px + 4, py + 1 + bob, 8, 3);
    // Cap
    ctx.fillStyle = "#cc2222";
    ctx.fillRect(px + 3, py + 0 + bob, 10, 3);
    ctx.fillStyle = "#dd3333";
    ctx.fillRect(px + 4, py + 0 + bob, 8, 2);
    ctx.fillStyle = "#ee4444";
    ctx.fillRect(px + 5, py + 0 + bob, 6, 1);
    // Cap brim
    ctx.fillStyle = "#fff";
    ctx.fillRect(px + 4, py + 2 + bob, 4, 1);
    // Face
    ctx.fillStyle = "#ffcc88";
    ctx.fillRect(px + 4, py + 3 + bob, 8, 5);
    ctx.fillStyle = "#ffd898";
    ctx.fillRect(px + 5, py + 3 + bob, 6, 4);
    // Eyes
    ctx.fillStyle = "#222";
    ctx.fillRect(px + 5, py + 5 + bob, 2, 2);
    ctx.fillRect(px + 9, py + 5 + bob, 2, 2);
    // Eye whites / highlights
    ctx.fillStyle = "#fff";
    ctx.fillRect(px + 5, py + 5 + bob, 1, 1);
    ctx.fillRect(px + 9, py + 5 + bob, 1, 1);
    // Nose hint
    ctx.fillStyle = "#eebb77";
    ctx.fillRect(px + 7, py + 6 + bob, 1, 1);
    // Mouth
    ctx.fillStyle = "#cc8866";
    ctx.fillRect(px + 7, py + 7 + bob, 2, 1);
    // Body / jacket
    ctx.fillStyle = "#2255bb";
    ctx.fillRect(px + 4, py + 8 + bob, 8, 4);
    ctx.fillStyle = "#3366cc";
    ctx.fillRect(px + 5, py + 8 + bob, 6, 3);
    ctx.fillStyle = "#4477dd";
    ctx.fillRect(px + 6, py + 8 + bob, 4, 2);
    // Jacket zip
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(px + 7, py + 8 + bob, 2, 3);
    ctx.fillStyle = "#eebb00";
    ctx.fillRect(px + 7, py + 10 + bob, 2, 1);
    // Arms
    ctx.fillStyle = "#2255bb";
    ctx.fillRect(px + 3, py + 8 + bob + armSwing, 1, 3);
    ctx.fillRect(px + 12, py + 8 + bob - armSwing, 1, 3);
    // Hands
    ctx.fillStyle = "#ffcc88";
    ctx.fillRect(px + 3, py + 10 + bob + armSwing, 1, 1);
    ctx.fillRect(px + 12, py + 10 + bob - armSwing, 1, 1);
    // Legs
    ctx.fillStyle = "#334466";
    ctx.fillRect(px + 5 + [0, 1, 0, -1][leg], py + 12, 3, 2);
    ctx.fillRect(px + 8 - [0, 1, 0, -1][leg], py + 12, 3, 2);
    // Shoes
    ctx.fillStyle = "#cc2222";
    ctx.fillRect(px + 5 + [0, 1, 0, -1][leg], py + 14, 3, 1);
    ctx.fillRect(px + 8 - [0, 1, 0, -1][leg], py + 14, 3, 1);

  } else {
    // -- SIDE VIEW --
    const flip = dir === "left";
    const fx = (lx: number, w: number = 1) => flip ? px + 15 - lx - w + 1 : px + lx;

    // Cap
    ctx.fillStyle = "#cc2222";
    ctx.fillRect(fx(3, 9), py + 0 + bob, 9, 3);
    ctx.fillStyle = "#dd3333";
    ctx.fillRect(fx(4, 7), py + 0 + bob, 7, 2);
    ctx.fillStyle = "#ee4444";
    ctx.fillRect(fx(5, 5), py + 0 + bob, 5, 1);
    // Cap brim (extends forward)
    ctx.fillStyle = "#cc2222";
    const brimX = flip ? px - 1 : px + 11;
    ctx.fillRect(brimX, py + 2 + bob, 4, 1);
    ctx.fillStyle = "#fff";
    ctx.fillRect(brimX + (flip ? 2 : 0), py + 2 + bob, 2, 1);

    // Hair
    ctx.fillStyle = "#2a1808";
    ctx.fillRect(fx(4, 6), py + 1 + bob, 6, 4);
    ctx.fillStyle = "#3a2818";
    ctx.fillRect(fx(5, 4), py + 2 + bob, 4, 3);

    // Face
    ctx.fillStyle = "#ffcc88";
    ctx.fillRect(fx(4, 7), py + 3 + bob, 7, 5);
    ctx.fillStyle = "#ffd898";
    ctx.fillRect(fx(5, 5), py + 3 + bob, 5, 4);
    // Eye
    ctx.fillStyle = "#222";
    const eyeX = flip ? px + 4 : px + 9;
    ctx.fillRect(eyeX, py + 5 + bob, 2, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(eyeX, py + 5 + bob, 1, 1);
    // Mouth
    ctx.fillStyle = "#cc8866";
    ctx.fillRect(flip ? px + 4 : px + 10, py + 7 + bob, 1, 1);

    // Body
    ctx.fillStyle = "#2255bb";
    ctx.fillRect(fx(4, 7), py + 8 + bob, 7, 4);
    ctx.fillStyle = "#3366cc";
    ctx.fillRect(fx(5, 5), py + 8 + bob, 5, 3);
    // Jacket detail
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(fx(7, 1), py + 8 + bob, 1, 3);

    // Arm (in front)
    ctx.fillStyle = "#2255bb";
    const armX = flip ? px + 2 : px + 11;
    ctx.fillRect(armX, py + 8 + bob + armSwing, 2, 4);
    // Hand
    ctx.fillStyle = "#ffcc88";
    ctx.fillRect(armX, py + 11 + bob + armSwing, 2, 1);

    // Legs
    ctx.fillStyle = "#334466";
    ctx.fillRect(fx(5 + [0, 1, 0, -1][leg], 2), py + 12, 2, 3);
    ctx.fillRect(fx(8 - [0, 1, 0, -1][leg], 2), py + 12, 2, 3);
    // Shoes
    ctx.fillStyle = "#cc2222";
    ctx.fillRect(fx(5 + [0, 1, 0, -1][leg], 3), py + 14, 3, 1);
    ctx.fillRect(fx(8 - [0, 1, 0, -1][leg], 2), py + 14, 2, 1);
  }
}

// -- NPC SPRITE: unique per type with detail --
function drawNPC(ctx: CanvasRenderingContext2D, npc: MapNPC, tick: number) {
  const px = npc.x * TILE, py = npc.y * TILE;
  const bob = Math.round(Math.sin(tick * 0.04 + npc.x) * 0.5);

  if (npc.type === "sign") {
    // Wooden signpost
    // Post
    ctx.fillStyle = "#604018";
    ctx.fillRect(px + 6, py + 8, 4, 8);
    ctx.fillStyle = "#705020";
    ctx.fillRect(px + 7, py + 8, 2, 7);
    // Board
    ctx.fillStyle = "#a07830";
    ctx.fillRect(px + 1, py + 2, 14, 7);
    ctx.fillStyle = "#b89040";
    ctx.fillRect(px + 2, py + 3, 12, 5);
    ctx.fillStyle = "#c8a050";
    ctx.fillRect(px + 3, py + 4, 10, 3);
    // Board edge detail
    ctx.fillStyle = "#906820";
    ctx.fillRect(px + 1, py + 2, 14, 1);
    ctx.fillRect(px + 1, py + 8, 14, 1);
    // Text lines
    ctx.fillStyle = "#604018";
    ctx.fillRect(px + 4, py + 4, 8, 1);
    ctx.fillRect(px + 4, py + 6, 6, 1);
    // Nails
    ctx.fillStyle = "#888";
    ctx.fillRect(px + 2, py + 5, 1, 1);
    ctx.fillRect(px + 13, py + 5, 1, 1);
    return;
  }

  if (npc.type === "door") {
    // Arrow / portal marker
    const flash = Math.sin(tick * 0.1) > 0;
    const glow = flash ? "#ffd700" : "#ffaa00";
    // Glow effect
    ctx.fillStyle = "rgba(255,200,0,0.15)";
    ctx.fillRect(px, py, TILE, TILE);
    // Arrow pointing in
    ctx.fillStyle = glow;
    ctx.fillRect(px + 5, py + 3, 2, 10);
    ctx.fillRect(px + 7, py + 5, 2, 6);
    ctx.fillRect(px + 9, py + 6, 2, 4);
    ctx.fillRect(px + 11, py + 7, 1, 2);
    // Sparkle
    ctx.fillStyle = "#fff";
    if (tick % 20 < 5) ctx.fillRect(px + 4, py + 4, 1, 1);
    if (tick % 20 > 10 && tick % 20 < 15) ctx.fillRect(px + 10, py + 9, 1, 1);
    return;
  }

  const hair = npc.hairColor || (npc.type === "boss" ? "#aa0000" : "#443322");
  const shirt = npc.shirtColor || (npc.type === "boss" ? "#cc2222" : npc.type === "trainer" ? "#22aa44" : "#6666aa");
  const skin = npc.skinColor || "#ffcc88";

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(px + 3, py + 14, 10, 2);

  if (npc.type === "boss") {
    // BOSS: larger, intimidating, with crown
    // Crown
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(px + 3, py - 1 + bob, 10, 3);
    ctx.fillStyle = "#ffee44";
    ctx.fillRect(px + 3, py - 2 + bob, 2, 3);
    ctx.fillRect(px + 7, py - 2 + bob, 2, 3);
    ctx.fillRect(px + 11, py - 2 + bob, 2, 3);
    // Gem in crown
    ctx.fillStyle = "#ff3344";
    ctx.fillRect(px + 7, py - 1 + bob, 2, 2);

    // Hair
    ctx.fillStyle = hair;
    ctx.fillRect(px + 3, py + 1 + bob, 10, 4);
    ctx.fillStyle = darken(hair, 20);
    ctx.fillRect(px + 4, py + 1 + bob, 8, 3);

    // Face
    ctx.fillStyle = skin;
    ctx.fillRect(px + 3, py + 4 + bob, 10, 5);
    ctx.fillStyle = lighten(skin, 10);
    ctx.fillRect(px + 4, py + 4 + bob, 8, 4);
    // Fierce eyes
    ctx.fillStyle = "#cc0000";
    ctx.fillRect(px + 4, py + 5 + bob, 3, 2);
    ctx.fillRect(px + 9, py + 5 + bob, 3, 2);
    ctx.fillStyle = "#222";
    ctx.fillRect(px + 5, py + 5 + bob, 2, 2);
    ctx.fillRect(px + 10, py + 5 + bob, 2, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(px + 5, py + 5 + bob, 1, 1);
    ctx.fillRect(px + 10, py + 5 + bob, 1, 1);
    // Stern mouth
    ctx.fillStyle = "#aa6644";
    ctx.fillRect(px + 6, py + 8 + bob, 4, 1);

    // Body (broader)
    ctx.fillStyle = shirt;
    ctx.fillRect(px + 2, py + 9 + bob, 12, 4);
    ctx.fillStyle = lighten(shirt, 20);
    ctx.fillRect(px + 3, py + 9 + bob, 10, 3);
    // Belt
    ctx.fillStyle = "#443322";
    ctx.fillRect(px + 2, py + 12 + bob, 12, 1);
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(px + 7, py + 12 + bob, 2, 1);

    // Arms
    ctx.fillStyle = shirt;
    ctx.fillRect(px + 1, py + 9 + bob, 1, 4);
    ctx.fillRect(px + 14, py + 9 + bob, 1, 4);
    ctx.fillStyle = skin;
    ctx.fillRect(px + 1, py + 12 + bob, 1, 1);
    ctx.fillRect(px + 14, py + 12 + bob, 1, 1);

    // Legs
    ctx.fillStyle = "#334455";
    ctx.fillRect(px + 4, py + 13, 3, 2);
    ctx.fillRect(px + 9, py + 13, 3, 2);
    ctx.fillStyle = "#222";
    ctx.fillRect(px + 4, py + 14, 3, 1);
    ctx.fillRect(px + 9, py + 14, 3, 1);

  } else if (npc.type === "trainer") {
    // TRAINER: battle-ready pose
    // Hair
    ctx.fillStyle = hair;
    ctx.fillRect(px + 4, py + 1 + bob, 8, 4);
    ctx.fillStyle = lighten(hair, 15);
    ctx.fillRect(px + 5, py + 1 + bob, 6, 3);
    // Headband
    ctx.fillStyle = "#ff4444";
    ctx.fillRect(px + 3, py + 3 + bob, 10, 2);
    ctx.fillStyle = "#dd3333";
    ctx.fillRect(px + 4, py + 3 + bob, 8, 1);

    // Face
    ctx.fillStyle = skin;
    ctx.fillRect(px + 4, py + 4 + bob, 8, 4);
    ctx.fillStyle = lighten(skin, 8);
    ctx.fillRect(px + 5, py + 4 + bob, 6, 3);
    // Eyes (determined)
    ctx.fillStyle = "#222";
    ctx.fillRect(px + 5, py + 5 + bob, 2, 2);
    ctx.fillRect(px + 9, py + 5 + bob, 2, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(px + 6, py + 5 + bob, 1, 1);
    ctx.fillRect(px + 10, py + 5 + bob, 1, 1);
    // Confident smirk
    ctx.fillStyle = "#cc8866";
    ctx.fillRect(px + 7, py + 7 + bob, 3, 1);

    // Body
    ctx.fillStyle = shirt;
    ctx.fillRect(px + 3, py + 8 + bob, 10, 5);
    ctx.fillStyle = lighten(shirt, 15);
    ctx.fillRect(px + 4, py + 8 + bob, 8, 4);
    // Vest/detail
    ctx.fillStyle = darken(shirt, 30);
    ctx.fillRect(px + 3, py + 8 + bob, 1, 5);
    ctx.fillRect(px + 12, py + 8 + bob, 1, 5);

    // Arms (one forward in battle stance)
    ctx.fillStyle = skin;
    ctx.fillRect(px + 2, py + 9 + bob, 1, 3);
    ctx.fillRect(px + 13, py + 8 + bob, 1, 4);
    // Pokeball in hand
    ctx.fillStyle = "#ff3333";
    ctx.fillRect(px + 13, py + 8 + bob, 2, 1);
    ctx.fillStyle = "#fff";
    ctx.fillRect(px + 13, py + 9 + bob, 2, 1);

    // Legs
    ctx.fillStyle = "#334455";
    ctx.fillRect(px + 5, py + 13, 2, 2);
    ctx.fillRect(px + 9, py + 13, 2, 2);
    ctx.fillStyle = "#cc3333";
    ctx.fillRect(px + 5, py + 14, 2, 1);
    ctx.fillRect(px + 9, py + 14, 2, 1);

  } else {
    // NPC: casual look
    // Hair
    ctx.fillStyle = hair;
    ctx.fillRect(px + 4, py + 1 + bob, 8, 4);
    ctx.fillStyle = lighten(hair, 12);
    ctx.fillRect(px + 5, py + 1 + bob, 6, 3);
    ctx.fillStyle = darken(hair, 10);
    ctx.fillRect(px + 4, py + 1 + bob, 1, 3);

    // Face
    ctx.fillStyle = skin;
    ctx.fillRect(px + 4, py + 4 + bob, 8, 4);
    ctx.fillStyle = lighten(skin, 8);
    ctx.fillRect(px + 5, py + 4 + bob, 6, 3);
    // Eyes
    ctx.fillStyle = "#222";
    ctx.fillRect(px + 5, py + 5 + bob, 2, 2);
    ctx.fillRect(px + 9, py + 5 + bob, 2, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(px + 5, py + 5 + bob, 1, 1);
    ctx.fillRect(px + 9, py + 5 + bob, 1, 1);
    // Smile
    ctx.fillStyle = "#cc8866";
    ctx.fillRect(px + 7, py + 7 + bob, 2, 1);

    // Body
    ctx.fillStyle = shirt;
    ctx.fillRect(px + 3, py + 8 + bob, 10, 5);
    ctx.fillStyle = lighten(shirt, 15);
    ctx.fillRect(px + 4, py + 8 + bob, 8, 4);
    // Collar
    ctx.fillStyle = lighten(shirt, 30);
    ctx.fillRect(px + 6, py + 8 + bob, 4, 1);

    // Arms
    ctx.fillStyle = skin;
    ctx.fillRect(px + 2, py + 9 + bob, 1, 3);
    ctx.fillRect(px + 13, py + 9 + bob, 1, 3);
    // Legs
    ctx.fillStyle = "#334455";
    ctx.fillRect(px + 5, py + 13, 2, 2);
    ctx.fillRect(px + 9, py + 13, 2, 2);
    ctx.fillStyle = "#665544";
    ctx.fillRect(px + 5, py + 14, 2, 1);
    ctx.fillRect(px + 9, py + 14, 2, 1);
  }
}

// ══════════════════════════════
// ── Particle System         ──
// ══════════════════════════════
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
}

function updateParticle(p: Particle): boolean {
  p.x += p.vx;
  p.y += p.vy;
  p.vy += 0.02; // gravity
  p.life--;
  return p.life > 0;
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  const alpha = Math.max(0, p.life / p.maxLife);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;
  ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  ctx.globalAlpha = 1;
}

// ════════════════════════════════════
// ── Grasslands Map ──
// ════════════════════════════════════
function makeGrassland(): RMap {
  const m: number[][] = [];
  for (let y = 0; y < MAP_H; y++) m.push(Array(MAP_W).fill(_));

  // === BORDERS ===
  for (let x = 0; x < MAP_W; x++) { m[0][x] = C; m[1][x] = R; }
  for (let x = 0; x < MAP_W; x++) { m[MAP_H - 2][x] = C; m[MAP_H - 1][x] = R; }
  for (let y = 2; y < MAP_H - 2; y++) { m[y][0] = R; m[y][MAP_W - 1] = R; }
  for (let y = 2; y < MAP_H - 2; y++) {
    if (m[y][0] === R && y > 1) m[y - 1][0] = C;
    if (m[y][MAP_W - 1] === R && y > 1) m[y - 1][MAP_W - 1] = C;
  }

  // === MAIN PATHS ===
  for (let x = 2; x < MAP_W - 1; x++) m[10][x] = P;
  for (let y = 3; y < 11; y++) m[y][12] = P;
  for (let y = 10; y < MAP_H - 2; y++) m[y][5] = P;
  m[15][4] = P; m[15][5] = P; m[15][6] = P;

  // === GYM BUILDING ===
  m[2][11] = RF; m[2][12] = RF; m[2][13] = RF;
  m[3][11] = B; m[3][12] = DR; m[3][13] = B;

  // === TALL GRASS PATCHES ===
  for (let y = 5; y < 9; y++) for (let x = 5; x < 10; x++) m[y][x] = G;
  for (let y = 12; y < 16; y++) for (let x = 14; x < 20; x++) m[y][x] = G;
  for (let y = 4; y < 7; y++) for (let x = 16; x < 20; x++) m[y][x] = G;

  // === FLOWER PATCHES ===
  m[4][3] = FL; m[6][3] = FL; m[12][8] = FL;
  m[15][10] = FL; m[3][18] = FL; m[8][14] = FL;
  m[11][20] = FL; m[7][22] = FL;

  // === TREES ===
  const trees = [[4, 2], [4, 3], [5, 3], [13, 7], [13, 8], [15, 9], [16, 9], [6, 15], [6, 16], [17, 4], [18, 3], [3, 14], [4, 14]];
  for (const [ty, tx] of trees) {
    if (ty >= 2 && ty < MAP_H - 1 && tx >= 1 && tx < MAP_W - 1) {
      m[ty][tx] = R;
      if (ty > 0) m[ty - 1][tx] = C;
    }
  }

  // === WATER (pond) ===
  for (let y = 12; y < 14; y++) for (let x = 8; x < 11; x++) m[y][x] = W;

  // === FENCES ===
  for (let x = 10; x < 14; x++) m[2][x] = F;
  m[3][10] = F; m[3][14] = F; m[4][10] = F; m[4][14] = F;

  // === ROCKS ===
  m[9][3] = K; m[11][18] = K; m[16][21] = K;

  // Exit
  m[10][MAP_W - 1] = P;

  return {
    id: 1, name: "Grasslands", emoji: "\ud83c\udf3f",
    tiles: m, sx: 5, sy: 15,
    pal: { g1: "#68b850", g2: "#509838", g3: "#78c860", p1: "#c0a868", p2: "#d0b878", p3: "#b09858", bg: "#509838" },
    npcs: [
      { x: 12, y: 4, name: "Elderoak", type: "boss", hairColor: "#1a4a1a", shirtColor: "#2a7a2a", dialogue: "Gym Leader Elderoak:\n'I am the root of all growth.\nCan you withstand my forest?'", stageId: 5 },
      { x: 8, y: 10, name: "Trainer Briar", type: "trainer", shirtColor: "#22aa44", dialogue: "Trainer Briar:\n'Show me what your pet can do!'", stageId: 2 },
      { x: 18, y: 10, name: "Trainer Fern", type: "trainer", shirtColor: "#44aa22", dialogue: "Trainer Fern:\n'The grass whispers!\nLet\\'s battle!'", stageId: 4 },
      { x: 6, y: 15, name: "Prof. Oak", type: "npc", shirtColor: "#8866aa", hairColor: "#aaaaaa", dialogue: "Prof. Oak:\n'Welcome to the world of\nAI Pets! Walk in tall grass\nto find wild encounters.\n\nWASD to move, SPACE to talk.'" },
      { x: 4, y: 15, name: "Signpost", type: "sign", dialogue: "PALLET TOWN\n\u2191 Grasslands Gym\n\u2192 Route 2 (Volcano)\n\nTip: Walk through tall\ngrass for wild battles!" },
      { x: MAP_W - 1, y: 10, name: "\u2192 Volcano Ridge", type: "door", dialogue: "Route 2 \u2014 Volcano Ridge\n\nA scorching path awaits.\nTravel there?", targetRegion: 2 },
    ],
  };
}

function makeVolcano(): RMap {
  const m: number[][] = [];
  for (let y = 0; y < MAP_H; y++) m.push(Array(MAP_W).fill(S));
  for (let x = 0; x < MAP_W; x++) { m[0][x] = K; m[MAP_H - 1][x] = K; }
  for (let y = 0; y < MAP_H; y++) { m[y][0] = K; m[y][MAP_W - 1] = K; }
  for (let y = 4; y < 7; y++) for (let x = 15; x < 19; x++) m[y][x] = L;
  for (let y = 13; y < 15; y++) for (let x = 6; x < 9; x++) m[y][x] = L;
  for (let x = 1; x < MAP_W - 1; x++) m[10][x] = P;
  for (let y = 3; y < 10; y++) m[y][12] = P;
  for (let y = 11; y < 17; y++) m[y][5] = P;
  m[2][11] = RF; m[2][12] = RF; m[2][13] = RF;
  m[3][11] = B; m[3][12] = DR; m[3][13] = B;
  for (let y = 4; y < 8; y++) for (let x = 3; x < 7; x++) m[y][x] = G;
  for (let y = 12; y < 16; y++) for (let x = 16; x < 21; x++) m[y][x] = G;
  m[6][10] = K; m[8][8] = K; m[14][12] = K; m[5][20] = K;
  m[10][0] = S; m[10][MAP_W - 1] = S;
  return {
    id: 2, name: "Volcano Ridge", emoji: "\ud83c\udf0b",
    tiles: m, sx: 1, sy: 10,
    pal: { g1: "#c8b070", g2: "#b0a060", g3: "#d0b878", p1: "#8a7040", p2: "#9a8050", p3: "#7a6030", bg: "#4a2a0a" },
    npcs: [
      { x: 12, y: 4, name: "Infernox", type: "boss", hairColor: "#550000", shirtColor: "#cc2222", dialogue: "Gym Leader Infernox:\n'I am the heart of the\nvolcano. Burn or be burned!'", stageId: 10 },
      { x: 8, y: 10, name: "Scorcha", type: "trainer", shirtColor: "#cc6622", dialogue: "Trainer Scorcha:\n'The volcano is my arena!'", stageId: 7 },
      { x: 18, y: 10, name: "Pyrex", type: "trainer", shirtColor: "#cc4422", dialogue: "Pyrex:\n'Only the strong survive\nthe ridge!'", stageId: 9 },
      { x: 10, y: 14, name: "Hiker", type: "npc", shirtColor: "#886644", dialogue: "Hiker:\n'This volcano has powerful\nfire-type pets.\nBring water skills!'" },
      { x: 0, y: 10, name: "\u2190 Grasslands", type: "door", dialogue: "Route 1 \u2014 Grasslands\n\nReturn to the meadow?", targetRegion: 1 },
      { x: MAP_W - 1, y: 10, name: "\u2192 Coral Depths", type: "door", dialogue: "Route 3 \u2014 Coral Depths\n\nDive into the ocean?", targetRegion: 3 },
    ],
  };
}

function makeOcean(): RMap {
  const m: number[][] = [];
  for (let y = 0; y < MAP_H; y++) m.push(Array(MAP_W).fill(S));
  for (let x = 0; x < MAP_W; x++) { m[0][x] = W; m[MAP_H - 1][x] = W; }
  for (let y = 0; y < MAP_H; y++) { m[y][0] = W; m[y][MAP_W - 1] = W; }
  for (let y = 3; y < 7; y++) for (let x = 15; x < 21; x++) m[y][x] = W;
  for (let y = 13; y < 17; y++) for (let x = 2; x < 8; x++) m[y][x] = W;
  for (let x = 1; x < MAP_W - 1; x++) m[10][x] = P;
  for (let y = 2; y < 10; y++) m[y][10] = P;
  for (let y = 11; y < MAP_H - 1; y++) m[y][16] = P;
  m[2][9] = RF; m[2][10] = RF; m[2][11] = RF;
  m[3][9] = B; m[3][10] = DR; m[3][11] = B;
  for (let y = 5; y < 9; y++) for (let x = 3; x < 8; x++) m[y][x] = G;
  for (let y = 11; y < 14; y++) for (let x = 11; x < 15; x++) m[y][x] = G;
  m[8][13] = K; m[12][18] = K;
  m[10][0] = S;
  return {
    id: 3, name: "Coral Depths", emoji: "\ud83c\udf0a",
    tiles: m, sx: 1, sy: 10,
    pal: { g1: "#90b890", g2: "#78a878", g3: "#a0c8a0", p1: "#b0a080", p2: "#c0b090", p3: "#a09070", bg: "#1a3a5a" },
    npcs: [
      { x: 10, y: 4, name: "Leviathan", type: "boss", hairColor: "#112266", shirtColor: "#2255aa", dialogue: "Gym Leader Leviathan:\n'The deep knows all.\nShow me your courage.'", stageId: 15 },
      { x: 14, y: 10, name: "Coraline", type: "trainer", shirtColor: "#2288aa", dialogue: "Trainer Coraline:\n'The reef protects its own.'", stageId: 12 },
      { x: 16, y: 14, name: "Tsunami", type: "trainer", shirtColor: "#2266cc", dialogue: "Tsunami:\n'I am the ocean\\'s fury!'", stageId: 14 },
      { x: 12, y: 7, name: "Swimmer", type: "npc", shirtColor: "#44aacc", dialogue: "Swimmer:\n'The coral hides ancient\nwater skills. Explore\nthe seagrass!'" },
      { x: 0, y: 10, name: "\u2190 Volcano", type: "door", dialogue: "Route 2 \u2014 Volcano Ridge\n\nReturn to the heat?", targetRegion: 2 },
    ],
  };
}

function getMap(id: number): RMap {
  switch (id) { case 2: return makeVolcano(); case 3: return makeOcean(); default: return makeGrassland(); }
}

// ══════════════════════════════
// ── Main Component ──
// ══════════════════════════════

interface WorldState { regionId: number; px: number; py: number; }

interface Props {
  onBattle: (stageId: number) => void;
  onWildEncounter: () => void;
  onNavigate?: (section: string) => void;
  hasPets: boolean;
  savedState?: WorldState | null;
  onStateChange?: (state: WorldState) => void;
}

export default function GameWorld({ onBattle, onWildEncounter, onNavigate, hasPets, savedState, onStateChange }: Props) {
  // Use refs for callbacks to avoid stale closures in game loop
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);
  const onNavigateRef = useRef(onNavigate);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);
  const hasPetsRef = useRef(hasPets);
  useEffect(() => { hasPetsRef.current = hasPets; }, [hasPets]);

  const initMap = savedState ? getMap(savedState.regionId) : makeGrassland();
  const initPx = savedState?.px ?? initMap.sx;
  const initPy = savedState?.py ?? initMap.sy;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysDown = useRef(new Set<string>());
  const [dialogue, setDialogue] = useState<{ text: string; npc: MapNPC | null } | null>(null);
  const [regionName, setRegionName] = useState(initMap.name);
  const [regionEmoji, setRegionEmoji] = useState(initMap.emoji);
  const [flash, setFlash] = useState(false);
  const [locationPopup, setLocationPopup] = useState<string | null>(initMap.name);
  const [noPetWarning, setNoPetWarning] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [typedText, setTypedText] = useState("");
  const typewriterRef = useRef<{ text: string; index: number; timer: ReturnType<typeof setTimeout> | null }>({ text: "", index: 0, timer: null });

  // Particles
  const particles = useRef<Particle[]>([]);

  // Camera lerp state
  const camRef = useRef({ cx: initPx * TILE, cy: initPy * TILE });

  const st = useRef({
    map: initMap,
    px: initPx, py: initPy, fpx: initPx * TILE, fpy: initPy * TILE,
    dir: "down" as Dir, moving: false, step: 0, tx: initPx, ty: initPy,
    tick: 0, ecCooldown: 0,
    dlg: null as string | null, dlgNpc: null as MapNPC | null, frozen: false,
  });

  // Location popup auto-fade
  useEffect(() => {
    if (locationPopup) {
      const t = setTimeout(() => setLocationPopup(null), 2500);
      return () => clearTimeout(t);
    }
  }, [locationPopup]);

  // No pet warning on mount
  useEffect(() => {
    if (!hasPets) {
      setNoPetWarning(true);
      const t = setTimeout(() => setNoPetWarning(false), 5000);
      return () => clearTimeout(t);
    }
  }, [hasPets]);

  // Typewriter effect for dialogue
  useEffect(() => {
    const tw = typewriterRef.current;
    if (tw.timer) clearTimeout(tw.timer);
    if (!dialogue) {
      tw.text = "";
      tw.index = 0;
      setTypedText("");
      return;
    }
    tw.text = dialogue.text;
    tw.index = 0;
    setTypedText("");
    const advance = () => {
      tw.index++;
      setTypedText(tw.text.slice(0, tw.index));
      if (tw.index < tw.text.length) {
        tw.timer = setTimeout(advance, 25);
      }
    };
    tw.timer = setTimeout(advance, 25);
    return () => { if (tw.timer) clearTimeout(tw.timer); };
  }, [dialogue]);

  // Speed up typewriter on Space
  const skipTypewriter = useCallback(() => {
    const tw = typewriterRef.current;
    if (tw.index < tw.text.length) {
      if (tw.timer) clearTimeout(tw.timer);
      tw.index = tw.text.length;
      setTypedText(tw.text);
    }
  }, []);

  const loadRegion = useCallback((id: number) => {
    const m = getMap(id);
    const s = st.current;
    s.map = m; s.px = m.sx; s.py = m.sy;
    s.fpx = m.sx * TILE; s.fpy = m.sy * TILE;
    s.moving = false; s.dlg = null; s.dlgNpc = null; s.frozen = false;
    camRef.current.cx = m.sx * TILE;
    camRef.current.cy = m.sy * TILE;
    particles.current = [];
    setDialogue(null); setRegionName(m.name); setRegionEmoji(m.emoji);
    setLocationPopup(m.name);
    onStateChangeRef.current?.({ regionId: id, px: m.sx, py: m.sy });
  }, []);

  const doInteract = useCallback(() => {
    const s = st.current;
    if (s.dlg) {
      // Skip typewriter first
      const tw = typewriterRef.current;
      if (tw.index < tw.text.length) {
        skipTypewriter();
        return;
      }
      const n = s.dlgNpc;
      if (n?.type === "door" && n.targetRegion) {
        s.dlg = null; s.dlgNpc = null; setDialogue(null);
        if (onNavigateRef.current) onNavigateRef.current(`region-${n.targetRegion}`);
        loadRegion(n.targetRegion);
        return;
      }
      if ((n?.type === "boss" || n?.type === "trainer") && n?.stageId) {
        if (!hasPetsRef.current) {
          s.dlg = "You don't have any pets yet!\nVisit the Marketplace to get\nyour first companion.";
          s.dlgNpc = { x: s.px, y: s.py, name: "System", type: "npc", dialogue: s.dlg };
          setDialogue({ text: s.dlg, npc: s.dlgNpc });
          return;
        }
        s.dlg = null; s.dlgNpc = null; s.frozen = true; setDialogue(null);
        onBattle(n.stageId);
        return;
      }
      s.dlg = null; s.dlgNpc = null; setDialogue(null); return;
    }
    const fx = s.px + DX[s.dir], fy = s.py + DY[s.dir];
    let n = s.map.npcs.find(np => np.x === fx && np.y === fy);
    if (!n) n = s.map.npcs.find(np => np.x === s.px && np.y === s.py);
    if (n) { s.dlg = n.dialogue; s.dlgNpc = n; setDialogue({ text: n.dialogue, npc: n }); }
  }, [loadRegion, onBattle, skipTypewriter]);

  const triggerEnc = useCallback(() => {
    if (!hasPetsRef.current) {
      const s = st.current;
      s.dlg = "You need a pet to battle!\nVisit the Marketplace first.";
      s.dlgNpc = { x: s.px, y: s.py, name: "System", type: "npc", dialogue: s.dlg };
      setDialogue({ text: s.dlg, npc: s.dlgNpc });
      return;
    }
    st.current.frozen = true;
    setFlash(true);
    setTimeout(() => { setFlash(false); st.current.frozen = false; onWildEncounter(); }, 600);
  }, [onWildEncounter]);

  // Spawn grass particles when walking through tall grass
  const spawnGrassParticles = useCallback((wx: number, wy: number) => {
    for (let i = 0; i < 3; i++) {
      particles.current.push({
        x: wx + Math.random() * 12 + 2,
        y: wy + 8 + Math.random() * 4,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -Math.random() * 1.5 - 0.5,
        life: 15 + Math.floor(Math.random() * 10),
        maxLife: 25,
        color: ["#4ac04a", "#3a9a3a", "#58d858"][Math.floor(Math.random() * 3)],
        size: 1,
      });
    }
  }, []);

  // Water sparkle particles
  const spawnWaterSparkle = useCallback((wx: number, wy: number) => {
    particles.current.push({
      x: wx + Math.random() * 14 + 1,
      y: wy + Math.random() * 14 + 1,
      vx: 0,
      vy: -0.3,
      life: 10 + Math.floor(Math.random() * 8),
      maxLife: 18,
      color: "#a0d8ff",
      size: 1,
    });
  }, []);

  // Keyboard
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " ", "z", "enter", "escape", "m"].includes(k)) {
        e.preventDefault();
        keysDown.current.add(k);
      }
    };
    const u = (e: KeyboardEvent) => keysDown.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => { window.removeEventListener("keydown", d); window.removeEventListener("keyup", u); };
  }, []);

  // GAME LOOP
  useEffect(() => {
    let raf: number;
    let lastTime = 0;

    const loop = (time: number) => {
      // Throttle to ~60fps
      if (time - lastTime < 14) { raf = requestAnimationFrame(loop); return; }
      lastTime = time;

      const s = st.current;
      const cv = canvasRef.current;
      if (!cv) { raf = requestAnimationFrame(loop); return; }
      const ctx = cv.getContext("2d");
      if (!ctx) { raf = requestAnimationFrame(loop); return; }
      s.tick++;
      const keys = keysDown.current;

      // Minimap toggle
      if (keys.has("m")) { keys.delete("m"); setShowMinimap(prev => !prev); }

      // INPUT
      if (!s.frozen && !s.dlg) {
        if (keys.has(" ") || keys.has("z") || keys.has("enter")) {
          keys.delete(" "); keys.delete("z"); keys.delete("enter");
          doInteract();
        }
        if (!s.moving) {
          let dir: Dir | null = null;
          if (keys.has("arrowup") || keys.has("w")) dir = "up";
          else if (keys.has("arrowdown") || keys.has("s")) dir = "down";
          else if (keys.has("arrowleft") || keys.has("a")) dir = "left";
          else if (keys.has("arrowright") || keys.has("d")) dir = "right";
          if (dir) {
            s.dir = dir;
            const nx = s.px + DX[dir], ny = s.py + DY[dir];
            if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H) {
              const tile = s.map.tiles[ny][nx];
              const blocked = s.map.npcs.find(n => n.x === nx && n.y === ny && n.type !== "door" && n.type !== "sign");
              if (!SOLID.has(tile) && !blocked) {
                s.moving = true; s.step = 0; s.tx = nx; s.ty = ny;
              }
            }
          }
        }
        if (s.moving) {
          s.step++;
          const t = s.step / WALK_FRAMES;
          s.fpx = (s.px + (s.tx - s.px) * t) * TILE;
          s.fpy = (s.py + (s.ty - s.py) * t) * TILE;
          if (s.step >= WALK_FRAMES) {
            s.px = s.tx; s.py = s.ty; s.fpx = s.px * TILE; s.fpy = s.py * TILE; s.moving = false;
            onStateChangeRef.current?.({ regionId: s.map.id, px: s.px, py: s.py });
            const tile = s.map.tiles[s.py][s.px];
            // Grass particles
            if (tile === G) {
              spawnGrassParticles(s.px * TILE, s.py * TILE);
              s.ecCooldown--;
              if (s.ecCooldown <= 0 && Math.random() < 0.15) { s.ecCooldown = 5; triggerEnc(); }
            }
            const door = s.map.npcs.find(n => n.x === s.px && n.y === s.py && n.type === "door");
            if (door) {
              s.dlg = door.dialogue; s.dlgNpc = door;
              setDialogue({ text: door.dialogue, npc: door });
            }
          }
        }
      }
      if (s.dlg && keys.has("escape")) { keys.delete("escape"); s.dlg = null; s.dlgNpc = null; setDialogue(null); }
      if (s.dlg && (keys.has(" ") || keys.has("z") || keys.has("enter"))) {
        keys.delete(" "); keys.delete("z"); keys.delete("enter");
        doInteract();
      }

      // Random water sparkles
      if (s.tick % 8 === 0) {
        const rx = Math.floor(Math.random() * MAP_W);
        const ry = Math.floor(Math.random() * MAP_H);
        if (s.map.tiles[ry]?.[rx] === W) {
          spawnWaterSparkle(rx * TILE, ry * TILE);
        }
      }

      // Update particles
      particles.current = particles.current.filter(p => updateParticle(p));

      // RENDER
      ctx.imageSmoothingEnabled = false;

      // Smooth camera (lerp)
      const targetCX = s.fpx + TILE / 2 - CW / 2;
      const targetCY = s.fpy + TILE / 2 - CH / 2;
      const cam = camRef.current;
      cam.cx += (targetCX - cam.cx) * 0.15;
      cam.cy += (targetCY - cam.cy) * 0.15;
      const camX = Math.max(0, Math.min(cam.cx, MAP_W * TILE - CW));
      const camY = Math.max(0, Math.min(cam.cy, MAP_H * TILE - CH));

      ctx.fillStyle = s.map.pal.bg;
      ctx.fillRect(0, 0, CW, CH);

      ctx.save();
      ctx.translate(-Math.round(camX), -Math.round(camY));

      const startX = Math.max(0, Math.floor(camX / TILE) - 1);
      const startY = Math.max(0, Math.floor(camY / TILE) - 1);
      const endX = Math.min(MAP_W, startX + VIEW_TX + 3);
      const endY = Math.min(MAP_H, startY + VIEW_TY + 3);

      // Layer 1: Ground tiles
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          drawTile(ctx, s.map.tiles[y][x], x, y, s.map.tiles, s.map.pal, s.tick);
        }
      }

      // Interaction prompt for nearby NPCs
      let nearbyNpc: MapNPC | null = null;
      const lookX = s.px + DX[s.dir];
      const lookY = s.py + DY[s.dir];
      nearbyNpc = s.map.npcs.find(n => n.x === lookX && n.y === lookY) || null;

      // Layer 2: Y-sorted sprites (NPCs + Player)
      const drawables: { y: number; draw: () => void }[] = [];
      for (const npc of s.map.npcs) {
        if (npc.x >= startX - 1 && npc.x <= endX + 1 && npc.y >= startY - 1 && npc.y <= endY + 1) {
          drawables.push({ y: npc.y, draw: () => drawNPC(ctx, npc, s.tick) });
        }
      }
      drawables.push({ y: s.py, draw: () => drawPlayer(ctx, Math.round(s.fpx), Math.round(s.fpy), s.dir, s.step, s.moving) });
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) d.draw();

      // Layer 3: Tree canopies (drawn over everything for depth)
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          if (s.map.tiles[y][x] === C) drawCanopy(ctx, x, y, s.tick);
        }
      }

      // Tall grass overlay: redraw top of tall grass over player for immersion
      const playerTile = s.map.tiles[s.py]?.[s.px];
      if (playerTile === G) {
        const gpx = s.px * TILE, gpy = s.py * TILE;
        ctx.fillStyle = "#38a838";
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 3; i++) {
          const bx = gpx + i * 5 + 2;
          ctx.fillRect(bx, gpy, 2, 6);
        }
        ctx.globalAlpha = 1;
      }

      // Particles
      for (const p of particles.current) drawParticle(ctx, p);

      // Interaction prompt (in-world)
      if (nearbyNpc && !s.dlg && !s.frozen) {
        const npx = nearbyNpc.x * TILE;
        const npy = nearbyNpc.y * TILE;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(npx - 10, npy - 9, 36, 8);
        ctx.fillStyle = "#fff";
        ctx.font = "5px monospace";
        ctx.fillText("SPACE", npx - 6, npy - 3);
      }

      ctx.restore();

      // Warm daylight tint
      ctx.fillStyle = "rgba(255,248,220,0.04)";
      ctx.fillRect(0, 0, CW, CH);

      // Minimap rendering
      if (showMinimap) {
        const mmScale = 2;
        const mmX = CW - MAP_W * mmScale - 4;
        const mmY = 4;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(mmX - 2, mmY - 2, MAP_W * mmScale + 4, MAP_H * mmScale + 4);
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(mmX, mmY, MAP_W * mmScale, MAP_H * mmScale);
        for (let my = 0; my < MAP_H; my++) {
          for (let mx = 0; mx < MAP_W; mx++) {
            const t = s.map.tiles[my][mx];
            if (t === W || t === L) ctx.fillStyle = t === W ? "#2060b0" : "#cc4400";
            else if (t === R || t === C) ctx.fillStyle = "#1a5a20";
            else if (t === P || t === DR) ctx.fillStyle = "#c0a868";
            else if (t === B || t === RF) ctx.fillStyle = "#aa6644";
            else if (t === K || t === E) ctx.fillStyle = "#606878";
            else if (t === G) ctx.fillStyle = "#2a7a2a";
            else if (t === S) ctx.fillStyle = "#c8b070";
            else ctx.fillStyle = s.map.pal.g1;
            ctx.fillRect(mmX + mx * mmScale, mmY + my * mmScale, mmScale, mmScale);
          }
        }
        if (s.tick % 20 < 14) {
          ctx.fillStyle = "#ff3333";
          ctx.fillRect(mmX + s.px * mmScale, mmY + s.py * mmScale, mmScale, mmScale);
        }
        for (const npc of s.map.npcs) {
          if (npc.type === "boss") ctx.fillStyle = "#ffcc00";
          else if (npc.type === "trainer") ctx.fillStyle = "#44ff44";
          else continue;
          ctx.fillRect(mmX + npc.x * mmScale, mmY + npc.y * mmScale, mmScale, mmScale);
        }
        ctx.strokeStyle = "#aaa";
        ctx.lineWidth = 1;
        ctx.strokeRect(mmX - 1, mmY - 1, MAP_W * mmScale + 2, MAP_H * mmScale + 2);
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [doInteract, triggerEnc, showMinimap, spawnGrassParticles, spawnWaterSparkle]);

  // D-pad helpers
  const pd = (d: Dir) => keysDown.current.add(d === "up" ? "w" : d === "down" ? "s" : d === "left" ? "a" : "d");
  const pu = (d: Dir) => keysDown.current.delete(d === "up" ? "w" : d === "down" ? "s" : d === "left" ? "a" : "d");
  const pa = () => { keysDown.current.add(" "); setTimeout(() => keysDown.current.delete(" "), 80); };

  return (
    <div style={{ textAlign: "center", position: "relative", userSelect: "none" }}>
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, padding: "0 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>{regionEmoji}</span>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, fontWeight: 700, color: "#e0e0e0", letterSpacing: 1, textShadow: "1px 1px 0 #000" }}>{regionName}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setShowMinimap(v => !v)} style={{ background: "none", border: "1px solid #555", borderRadius: 3, color: "#aaa", fontSize: 9, fontFamily: "monospace", cursor: "pointer", padding: "2px 5px" }}>
            {showMinimap ? "MAP ON" : "MAP OFF"} (M)
          </button>
          <span style={{ fontFamily: "monospace", fontSize: 8, color: "#555" }}>WASD move / SPACE interact</span>
        </div>
      </div>

      <div style={{ position: "relative", display: "inline-block" }}>
        <canvas
          ref={canvasRef} width={CW} height={CH} tabIndex={0}
          style={{
            width: CW * SCALE, maxWidth: "100%", height: "auto",
            imageRendering: "pixelated",
            borderRadius: 6,
            border: "3px solid #1a1a28",
            boxShadow: "0 0 0 1px #333, 0 0 8px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.1)",
            display: "block",
          }}
        />

        {/* Battle flash */}
        {flash && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: 6, pointerEvents: "none", zIndex: 10,
            background: "#fff",
            animation: "battleFlash 0.6s ease-out forwards",
          }} />
        )}

        {/* Location popup */}
        {locationPopup && (
          <div style={{
            position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
            zIndex: 15, pointerEvents: "none",
            animation: "locationSlideIn 2.5s ease-out forwards",
          }}>
            <div style={{
              background: "linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.7))",
              border: "2px solid #888",
              borderTop: "none",
              borderRadius: "0 0 8px 8px",
              padding: "8px 20px",
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 11,
              color: "#fff",
              textShadow: "1px 1px 2px #000",
              letterSpacing: 1,
            }}>
              {regionEmoji} {locationPopup}
            </div>
          </div>
        )}

        {/* No pet warning */}
        {noPetWarning && (
          <div style={{
            position: "absolute", top: 40 * SCALE, left: "50%", transform: "translateX(-50%)",
            zIndex: 15, pointerEvents: "none",
            animation: "fadeInOut 5s ease forwards",
          }}>
            <div style={{
              background: "rgba(180,60,0,0.9)",
              border: "2px solid #ff8844",
              borderRadius: 6,
              padding: "8px 16px",
              fontFamily: "monospace",
              fontSize: 11,
              color: "#fff",
              whiteSpace: "nowrap",
            }}>
              No pets yet! Visit Marketplace first.
            </div>
          </div>
        )}

        {/* RPG Dialogue box */}
        {dialogue && (
          <div style={{
            position: "absolute",
            bottom: 6 * SCALE,
            left: 3 * SCALE,
            right: 3 * SCALE,
            zIndex: 20,
          }}>
            {/* Outer border (dark) */}
            <div style={{
              background: "#111",
              borderRadius: 8,
              padding: 3,
            }}>
              {/* Inner border (light) */}
              <div style={{
                background: "#ddd",
                borderRadius: 6,
                padding: 2,
              }}>
                {/* Content */}
                <div style={{
                  background: "linear-gradient(180deg, #ffffee 0%, #fff8dd 100%)",
                  borderRadius: 5,
                  padding: "12px 16px 10px",
                  position: "relative",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
                }}>
                  {/* NPC name tag */}
                  {dialogue.npc && dialogue.npc.name !== "System" && (
                    <div style={{
                      position: "absolute", top: -12, left: 12,
                      background: dialogue.npc.type === "boss" ? "#cc0000" : dialogue.npc.type === "trainer" ? "#0066aa" : "#446688",
                      color: "#fff",
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 8,
                      padding: "3px 8px",
                      borderRadius: 4,
                      border: "2px solid #111",
                      letterSpacing: 0.5,
                    }}>
                      {dialogue.npc.name}
                    </div>
                  )}
                  {/* Typewriter text */}
                  <div style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: 10,
                    color: "#222",
                    lineHeight: 2,
                    whiteSpace: "pre-line",
                    minHeight: 40,
                    marginTop: dialogue.npc && dialogue.npc.name !== "System" ? 4 : 0,
                  }}>
                    {typedText}
                  </div>
                  {/* Action hint */}
                  <div style={{
                    fontFamily: "monospace",
                    fontSize: 9,
                    color: "#888",
                    marginTop: 8,
                    textAlign: "right",
                    borderTop: "1px solid #ddd",
                    paddingTop: 6,
                  }}>
                    {(dialogue.npc?.type === "boss" || dialogue.npc?.type === "trainer")
                      ? "\u25b6 SPACE: Battle  |  ESC: Close"
                      : dialogue.npc?.type === "door"
                        ? "\u25b6 SPACE: Travel  |  ESC: Cancel"
                        : "\u25b6 SPACE to close"}
                  </div>
                  {/* Blinking advance indicator */}
                  <div style={{
                    position: "absolute", bottom: 8, right: 12,
                    fontSize: 10, color: "#333",
                    animation: "blink 0.8s step-end infinite",
                  }}>{"\u25bc"}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile D-pad */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 10, maxWidth: CW * SCALE, margin: "10px auto 0", padding: "0 12px",
      }}>
        <div style={{ position: "relative", width: 94, height: 94 }}>
          {([
            { dir: "up" as Dir, t: 0, l: 32, s: "\u25b2" },
            { dir: "down" as Dir, t: 62, l: 32, s: "\u25bc" },
            { dir: "left" as Dir, t: 32, l: 0, s: "\u25c0" },
            { dir: "right" as Dir, t: 32, l: 62, s: "\u25b6" },
          ]).map(d => (
            <button key={d.dir}
              onPointerDown={() => pd(d.dir)}
              onPointerUp={() => pu(d.dir)}
              onPointerLeave={() => pu(d.dir)}
              onContextMenu={e => e.preventDefault()}
              style={{
                position: "absolute", top: d.t, left: d.l,
                width: 30, height: 30, borderRadius: 5,
                background: "linear-gradient(180deg, #3a3a4a, #2a2a3a)",
                border: "2px solid #555",
                color: "#bbb", fontSize: 11,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", touchAction: "none",
                boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
              }}
            >{d.s}</button>
          ))}
          <div style={{
            position: "absolute", top: 32, left: 32, width: 30, height: 30,
            background: "#1a1a28", borderRadius: 5, border: "1px solid #333",
          }} />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onPointerDown={() => { st.current.dlg = null; st.current.dlgNpc = null; setDialogue(null); }}
            onContextMenu={e => e.preventDefault()}
            style={{
              width: 42, height: 42, borderRadius: "50%",
              background: "linear-gradient(180deg, #cc3333, #aa2222)",
              border: "2px solid #dd4444",
              color: "#fff", fontSize: 13, fontWeight: 900,
              cursor: "pointer", fontFamily: "'Press Start 2P', monospace",
              touchAction: "none",
              boxShadow: "0 3px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}>B</button>
          <button
            onPointerDown={pa}
            onContextMenu={e => e.preventDefault()}
            style={{
              width: 50, height: 50, borderRadius: "50%",
              background: "linear-gradient(180deg, #33cc55, #22aa44)",
              border: "2px solid #44dd66",
              color: "#fff", fontSize: 14, fontWeight: 900,
              cursor: "pointer", fontFamily: "'Press Start 2P', monospace",
              touchAction: "none",
              boxShadow: "0 3px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}>A</button>
        </div>
      </div>

      <style>{`
        @keyframes battleFlash {
          0% { opacity: 0; }
          15% { opacity: 1; }
          30% { opacity: 0.2; }
          50% { opacity: 1; }
          70% { opacity: 0.3; }
          100% { opacity: 0; }
        }
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes locationSlideIn {
          0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          15% { opacity: 1; transform: translateX(-50%) translateY(0); }
          75% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        }
        @keyframes fadeInOut {
          0% { opacity: 0; }
          10% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

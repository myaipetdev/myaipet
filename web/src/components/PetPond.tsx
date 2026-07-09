"use client";

/**
 * PetPond — a lo-fi ambient koi pond drawn on a single <canvas>, ported from
 * the "Long Play" record-pond prototype into the Collectible Editorial system.
 * It is a pure client render: zero server calls, zero generation cost — a "just
 * watch your pet" retention surface that is screenshot-worthy on its own.
 *
 * Everything on screen is driven by REAL pet data, honestly mapped (never
 * fabricated). Missing data degrades to calm defaults rather than inventing a
 * value:
 *   - koi COUNT scales with pet LEVEL  → 4 + floor(level/3), capped at 18.
 *   - koi TEMPO/liveliness scales with MOOD/happiness (sad = slow & still).
 *   - WATER tint shifts subtly by ELEMENT (fire→warmer, water→bluer, …), all
 *     kept inside the warm-editorial teal family.
 *   - TIME OF DAY comes from the client clock → day/dusk/night palette (subtle).
 *   - the center lily pad carries the pet's initial.
 *
 * Respects prefers-reduced-motion (renders one calm static frame, no rAF loop).
 * One rAF loop, ≤18 koi, DPR-aware backing store — cheap and steady.
 */

import { useEffect, useRef } from "react";

type Props = {
  /** 0–100 happiness / mood; drives tempo & liveliness. Falsy → calm default. */
  mood?: number;
  /** pet level; drives koi count. */
  level?: number;
  /** element string (fire/water/nature/…); tints the water. */
  element?: string | null;
  /** pet name; first letter marks the lily pad. */
  name?: string;
};

// Editorial palette (warm paper family) — shared with the rest of My Pet.
const INK = "#211A12";
const CREAM = "#FCF3E4";
const FOIL = "#E8C77E";
const TERRA = "#BE4F28";

// Element → a small hue nudge on the teal water, staying inside the warm family.
// [inner light, mid, deep] teal triples; each element leans the base subtly.
type Water = { light: string; mid: string; deep: string; groove: string };
const WATER_BASE: Water = { light: "#3FA187", mid: "#1A7E68", deep: "#0F5544", groove: "rgba(9,52,42,.22)" };
const WATER_BY_ELEMENT: Record<string, Water> = {
  fire:    { light: "#4FA383", mid: "#2C8467", deep: "#155A45", groove: "rgba(52,30,10,.22)" }, // warmer
  water:   { light: "#3C9EA6", mid: "#1A768A", deep: "#0E4A5C", groove: "rgba(9,42,52,.24)" }, // bluer
  ice:     { light: "#4FA6A6", mid: "#1C7E88", deep: "#0F5560", groove: "rgba(9,42,52,.22)" },
  nature:  { light: "#5AA85E", mid: "#2C8452", deep: "#134F34", groove: "rgba(20,52,20,.24)" }, // greener
  grass:   { light: "#5AA85E", mid: "#2C8452", deep: "#134F34", groove: "rgba(20,52,20,.24)" },
  earth:   { light: "#69A25A", mid: "#3E8352", deep: "#1B5138", groove: "rgba(30,44,16,.24)" },
  electric:{ light: "#57A57E", mid: "#2A8466", deep: "#12563F", groove: "rgba(40,40,8,.22)" },
  light:   { light: "#54A78C", mid: "#248069", deep: "#125848", groove: "rgba(30,40,12,.22)" },
  dark:    { light: "#317E6E", mid: "#0F6455", deep: "#083E34", groove: "rgba(6,34,28,.28)" },
  air:     { light: "#49A594", mid: "#1E7E76", deep: "#0E5250", groove: "rgba(9,46,44,.22)" },
  wind:    { light: "#49A594", mid: "#1E7E76", deep: "#0E5250", groove: "rgba(9,46,44,.22)" },
};

// Time of day → a soft daylight wash multiplied over the whole disc. Subtle so
// the koi stay legible at every hour.
function timeWash(hour: number): { tint: string; dim: number } {
  if (hour >= 6 && hour < 11) return { tint: "rgba(255,247,225,0.10)", dim: 0 };      // morning
  if (hour >= 11 && hour < 17) return { tint: "rgba(255,252,240,0.06)", dim: 0 };     // day
  if (hour >= 17 && hour < 20) return { tint: "rgba(226,125,44,0.12)", dim: 0.04 };   // dusk (terracotta)
  return { tint: "rgba(20,32,52,0.18)", dim: 0.12 };                                  // night
}

type Koi = {
  x: number; y: number; dir: number; spd: number; len: number; wob: number;
  ph: string; white: boolean;
};
type Drop = { x: number; y: number; life: number };
type Ripple = { x: number; y: number; r: number; life: number };

export default function PetPond({ mood, level, element, name }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Real-data mapping, recomputed on prop change (koi count / tempo depend on it).
  const lvl = Number.isFinite(level as number) ? Math.max(1, Math.floor(level as number)) : 1;
  const koiCount = Math.min(18, 4 + Math.floor(lvl / 3));
  // happiness 0–100 → tempo 0.35 (listless) .. 1.35 (lively); default calm 0.8.
  const happiness = Number.isFinite(mood as number) ? Math.max(0, Math.min(100, mood as number)) : 60;
  const elementKey = (element || "").toString().trim().toLowerCase();
  const initial = (name || "").trim().charAt(0).toUpperCase();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Logical drawing size (square). DPR-aware backing store for crisp koi.
    const S = 560;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    canvas.width = Math.round(S * dpr);
    canvas.height = Math.round(S * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const R = S * 0.47, CX = S / 2, CY = S / 2;
    const water = WATER_BY_ELEMENT[elementKey] || WATER_BASE;
    const wash = timeWash(new Date().getHours());
    // happiness → tempo. Reduced motion pins to a still, settled frame.
    const tempo = 0.35 + (happiness / 100) * 1.0;

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    const koi: Koi[] = [];
    for (let i = 0; i < koiCount; i++) {
      const ang = rnd(0, Math.PI * 2), rad = rnd(R * 0.18, R * 0.84);
      koi.push({
        x: CX + Math.cos(ang) * rad, y: CY + Math.sin(ang) * rad,
        dir: rnd(0, Math.PI * 2), spd: rnd(0.7, 1.1), len: rnd(30, 46),
        wob: rnd(0, 6.28),
        ph: Math.random() < 0.55 ? TERRA : FOIL,
        white: Math.random() < 0.7,
      });
    }
    const food: Drop[] = [];
    const ripples: Ripple[] = [];

    const addRipple = (x: number, y: number, strong: boolean) =>
      ripples.push({ x, y, r: strong ? 8 : 3, life: 1 });
    const feed = (x: number, y: number) => { food.push({ x, y, life: 1 }); addRipple(x, y, true); };

    const onPointerDown = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      const x = ((e.clientX - b.left) / b.width) * S;
      const y = ((e.clientY - b.top) / b.height) * S;
      if (Math.hypot(x - CX, y - CY) < R) feed(x, y);
    };
    canvas.addEventListener("pointerdown", onPointerDown);

    function drawPondBase() {
      if (!ctx) return;
      // water disc + concentric "record" grooves
      const g = ctx.createRadialGradient(CX - R * 0.25, CY - R * 0.3, R * 0.1, CX, CY, R);
      g.addColorStop(0, water.light); g.addColorStop(0.55, water.mid); g.addColorStop(1, water.deep);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, 7); ctx.fill();
      ctx.strokeStyle = water.groove; ctx.lineWidth = 1;
      for (let r = R * 0.16; r < R; r += R * 0.045) {
        ctx.beginPath(); ctx.arc(CX, CY, r, 0, 7); ctx.stroke();
      }
      // lily pad (center label = pet initial)
      ctx.save(); ctx.translate(CX, CY);
      const lg = ctx.createRadialGradient(-14, -16, 6, 0, 0, R * 0.2);
      lg.addColorStop(0, "#C4DE73"); lg.addColorStop(1, "#7EA23A");
      ctx.fillStyle = lg;
      const notch = 0.5;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.2, notch, Math.PI * 2); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(60,80,20,.35)"; ctx.lineWidth = 1.6;
      for (let i = 0; i < 11; i++) {
        const a = notch + (Math.PI * 2 - notch) * i / 11;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2); ctx.stroke();
      }
      // center disc + initial
      ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(0, 0, R * 0.09, 0, 7); ctx.fill();
      if (initial) {
        ctx.fillStyle = INK;
        ctx.font = `700 ${Math.round(R * 0.1)}px "Iowan Old Style","Palatino Linotype",Georgia,serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(initial, 0, R * 0.005);
      } else {
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    function drawKoi(k: Koi) {
      if (!ctx) return;
      ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.dir);
      const sway = reduce ? 0 : Math.sin(k.wob) * 0.35;
      // shadow
      ctx.fillStyle = "rgba(9,52,42,.28)";
      ctx.beginPath(); ctx.ellipse(2, 5, k.len * 0.5, k.len * 0.22, 0, 0, 7); ctx.fill();
      // body
      ctx.fillStyle = k.white ? CREAM : "#F3D9A0";
      ctx.beginPath(); ctx.ellipse(0, 0, k.len * 0.5, k.len * 0.24, 0, 0, 7); ctx.fill();
      // tail
      ctx.beginPath(); ctx.moveTo(-k.len * 0.45, 0);
      ctx.quadraticCurveTo(-k.len * 0.78, -k.len * 0.2 + sway * 10, -k.len * 0.9, -k.len * 0.05 + sway * 14);
      ctx.quadraticCurveTo(-k.len * 0.7, 0, -k.len * 0.9, k.len * 0.05 + sway * 14);
      ctx.quadraticCurveTo(-k.len * 0.78, k.len * 0.2 + sway * 10, -k.len * 0.45, 0); ctx.fill();
      // spots
      ctx.fillStyle = k.ph;
      ctx.beginPath(); ctx.ellipse(k.len * 0.12, -k.len * 0.02, k.len * 0.16, k.len * 0.13, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-k.len * 0.16, k.len * 0.05, k.len * 0.1, k.len * 0.08, 0, 0, 7); ctx.fill();
      ctx.restore();
    }

    function step() {
      for (const k of koi) {
        k.wob += 0.14 * tempo;
        k.dir += Math.sin(k.wob * 0.5) * 0.02;
        // seek nearest food
        let tf: Drop | null = null, td = 1e9;
        for (const f of food) { const d = Math.hypot(f.x - k.x, f.y - k.y); if (d < td) { td = d; tf = f; } }
        if (tf && td < R * 1.2) {
          const a = Math.atan2(tf.y - k.y, tf.x - k.x);
          const da = ((a - k.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          k.dir += da * 0.06;
        }
        // steer away from the rim
        const rd = Math.hypot(k.x - CX, k.y - CY);
        if (rd > R * 0.88) {
          const a = Math.atan2(CY - k.y, CX - k.x);
          const da = ((a - k.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          k.dir += da * 0.08;
        }
        const v = k.spd * tempo * 1.1;
        k.x += Math.cos(k.dir) * v; k.y += Math.sin(k.dir) * v;
        if (Math.random() < 0.004) addRipple(k.x, k.y, false);
      }
      for (const f of food) f.life -= 0.006;
      for (let i = food.length - 1; i >= 0; i--) if (food[i].life <= 0) food.splice(i, 1);
      for (const r of ripples) { r.r += 1.2 * tempo; r.life -= 0.02; }
      for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].life <= 0) ripples.splice(i, 1);
    }

    function paintOverlay() {
      if (!ctx) return;
      // daylight wash (clipped to the disc) + a faint night dim
      ctx.save();
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, 7); ctx.clip();
      ctx.fillStyle = wash.tint;
      ctx.fillRect(0, 0, S, S);
      if (wash.dim > 0) { ctx.fillStyle = `rgba(8,14,26,${wash.dim})`; ctx.fillRect(0, 0, S, S); }
      ctx.restore();
    }

    function frame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, S, S);
      drawPondBase();
      for (const r of ripples) {
        ctx.strokeStyle = `rgba(220,240,232,${r.life * 0.5})`;
        ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke();
      }
      for (const f of food) {
        ctx.fillStyle = `rgba(232,199,126,${0.5 + f.life * 0.5})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, 7); ctx.fill();
      }
      for (const k of koi) drawKoi(k);
      paintOverlay();
      step();
      raf = requestAnimationFrame(frame);
    }

    let raf = 0;
    if (reduce) {
      // Single calm static frame — koi settled, no motion.
      ctx.clearRect(0, 0, S, S);
      drawPondBase();
      for (const k of koi) drawKoi(k);
      paintOverlay();
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
    // Re-init the scene when the real inputs change.
  }, [koiCount, happiness, elementKey, initial]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`${name || "Your pet"}'s calm koi pond — tap to feed`}
      style={{
        width: "100%",
        maxWidth: 340,
        aspectRatio: "1 / 1",
        display: "block",
        margin: "0 auto",
        borderRadius: "50%",
        cursor: "crosshair",
        touchAction: "none",
        boxShadow: "0 26px 60px -34px rgba(15,85,68,.65), 0 3px 0 rgba(33,26,18,.06)",
      }}
    />
  );
}

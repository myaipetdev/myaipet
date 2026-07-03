"use client";

/**
 * PawField — the brand background field (FLock E01 glyph-field, translated to
 * Collectible Editorial): a canvas grid of PAW glyphs that appear in drifting
 * noise clusters over the warm cream field, ripple under the pointer, nudge
 * with page scroll, and carve out around [data-carve] elements so type always
 * sits on clean paper. Terracotta at print-texture alpha — a living pattern,
 * never confetti.
 *
 *   <section style={{ position: "relative" }}>
 *     <PawField />                          // absolute-inset canvas, behind
 *     <div style={{ position: "relative", zIndex: 1 }}>
 *       <h1 data-carve>…</h1>               // keeps a clean hole in the field
 *     </div>
 *   </section>
 *
 * Perf: cached Path2D, DPR ≤ 2, one rAF loop; prefers-reduced-motion freezes
 * the drift phase (static field) but keeps the pointer ripple.
 */

import { useEffect, useRef } from "react";

const fract = (x: number) => x - Math.floor(x);
const h2 = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const vn = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return h2(xi, yi) * (1 - u) * (1 - v) + h2(xi + 1, yi) * u * (1 - v) +
         h2(xi, yi + 1) * (1 - u) * v + h2(xi + 1, yi + 1) * u * v;
};

/** Paw print: four toes over a wide pad. */
function pawPath(s: number): Path2D {
  const p = new Path2D();
  // main pad
  p.ellipse(0, s * 0.18, s * 0.30, s * 0.25, 0, 0, Math.PI * 2);
  // toes (outer pair slightly lower + angled)
  const toes: Array<[number, number, number]> = [
    [-0.32, -0.06, 0.115], [-0.115, -0.24, 0.13], [0.115, -0.24, 0.13], [0.32, -0.06, 0.115],
  ];
  for (const [tx, ty, tr] of toes) {
    p.moveTo(tx * s + tr * s, ty * s);
    p.ellipse(tx * s, ty * s, tr * s, tr * s * 1.15, 0, 0, Math.PI * 2);
  }
  return p;
}

export default function PawField({
  cell = 46, tau = 0.46, radius = 140, speed = 1, opacity = 0.1,
  accent = "#BE4F28", style,
}: {
  cell?: number; tau?: number; radius?: number; speed?: number;
  /** overall field strength — print texture, keep ≤ .14 */
  opacity?: number;
  accent?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const root = canvas?.parentElement;
    if (!canvas || !root || typeof window === "undefined") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = Math.random() * 60;
    let mx = -9e3, my = -9e3;
    let w = 0, h = 0, dpr = 1;
    let cells: Array<{ c: number; r: number; x: number; y: number; rnd: number }> = [];
    let path = pawPath(cell * 0.52);
    let carveRects: Array<{ x: number; y: number; w: number; h: number }> = [];

    // Ripple emphasis darkens toward ink (we sit on a light field — lightening
    // would make the ripple LESS visible, the opposite of the reference's
    // dark-ground lift).
    const mix = (hex: string, k: number) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex);
      const n = m ? parseInt(m[1], 16) : 0xbe4f28;
      const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map((x) => Math.round(x * (1 - k) + 33 * k));
      return `rgb(${c.join(",")})`;
    };
    const lit = mix(accent, 0.45);

    const carves = () => {
      const rr = root.getBoundingClientRect();
      const pad = cell * 0.7;
      carveRects = Array.from(root.querySelectorAll<HTMLElement>("[data-carve]")).map((el) => {
        const b = el.getBoundingClientRect();
        return { x: b.left - rr.left - pad, y: b.top - rr.top - pad, w: b.width + pad * 2, h: b.height + pad * 2 };
      });
    };

    const build = () => {
      const rr = root.getBoundingClientRect();
      w = rr.width; h = rr.height;
      if (!w || !h) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
      cells = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        cells.push({ c, r, x: c * cell + cell / 2, y: r * cell + cell / 2, rnd: h2(c * 7.31, r * 3.17) });
      }
      path = pawPath(cell * 0.52);
      carves();
    };

    const draw = () => {
      if (!w || !cells.length) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < cells.length; i++) {
        const cl = cells[i];
        let hid = false;
        for (let j = 0; j < carveRects.length; j++) {
          const cz = carveRects[j];
          if (cl.x > cz.x && cl.x < cz.x + cz.w && cl.y > cz.y && cl.y < cz.y + cz.h) { hid = true; break; }
        }
        if (hid) continue;
        const v = vn(cl.c * 0.16 + t * 0.9, cl.r * 0.24) * 0.62 +
                  vn(cl.c * 0.45 - t * 0.6, cl.r * 0.45 + t * 0.35) * 0.38;
        let a = (v - tau) / 0.08;
        if (a <= 0.02) continue;
        if (a > 1) a = 1;
        const dx = cl.x - mx, dy = cl.y - my;
        const d = Math.sqrt(dx * dx + dy * dy);
        let k = d < radius ? 1 - d / radius : 0;
        k = k * k * (3 - 2 * k);
        const rot = (cl.rnd < 0.025 ? Math.PI : 0) + k * (Math.PI / 2) * (cl.rnd > 0.5 ? 1 : -1) + (cl.rnd - 0.5) * 0.5;
        const sc = 1 + k * 0.14;
        ctx.setTransform(dpr * sc, 0, 0, dpr * sc, cl.x * dpr, cl.y * dpr);
        ctx.rotate(rot);
        ctx.globalAlpha = a * opacity * (1 + 1.6 * k);
        ctx.fillStyle = k > 0.12 ? lit : accent;
        ctx.fill(path);
      }
      ctx.globalAlpha = 1;
    };

    build();
    const ro = new ResizeObserver(build);
    ro.observe(root);
    const iv = window.setInterval(carves, 900);

    const mm = (e: MouseEvent) => { const b = canvas.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; };
    const ml = () => { mx = -9e3; my = -9e3; };
    root.addEventListener("mousemove", mm);
    root.addEventListener("mouseleave", ml);

    let ls = window.scrollY;
    const onSc = () => { const d = window.scrollY - ls; ls = window.scrollY; t += d * 0.0012; };
    window.addEventListener("scroll", onSc, { passive: true });

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.06, (now - last) / 1000); last = now;
      if (!prm) t += dt * 0.5 * speed;
      draw();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); clearInterval(iv);
      root.removeEventListener("mousemove", mm);
      root.removeEventListener("mouseleave", ml);
      window.removeEventListener("scroll", onSc);
    };
  }, [cell, tau, radius, speed, opacity, accent]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ position: "absolute", inset: 0, display: "block", pointerEvents: "none", ...style }}
    />
  );
}

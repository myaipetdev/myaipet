"use client";

/**
 * Reveal — scroll-triggered entrance choreography (FLock-style E02/E03,
 * translated to Collectible Editorial). Children are VISIBLE by default
 * (SSR/no-JS safe); when the element first enters the viewport it animates
 * in via WAAPI from a directional offset. Fires once, never re-triggers on
 * scroll-up, never hijacks scrolling. prefers-reduced-motion skips entirely.
 *
 *   <Reveal dir="left" delay={90}> <Card/> </Reveal>
 *
 * House easing: expo-out cubic-bezier(0.16,1,0.3,1) — reveals 640ms,
 * stagger siblings by ~90ms via `delay`.
 */

import { useEffect, useRef } from "react";

export type RevealDir = "up" | "left" | "right" | "pop" | "fly" | "fade";

const FROM: Record<RevealDir, string> = {
  up: "translateY(28px)",
  left: "translateX(-44px) rotate(-1.2deg)",
  right: "translateX(44px) rotate(1.2deg)",
  pop: "scale(.94) translateY(14px)",
  fly: "translate(150px, -120px) rotate(9deg) scale(1.12)",
  fade: "none",
};

export const ED_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export default function Reveal({
  dir = "up", delay = 0, duration = 640, threshold = 0.22,
  className, style, children,
}: {
  dir?: RevealDir; delay?: number; duration?: number; threshold?: number;
  className?: string; style?: React.CSSProperties; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window) || typeof el.animate !== "function") return;

    let fired = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || fired) continue;
        fired = true;
        io.disconnect();
        // "fly" gets a paper-settle overshoot mid-frame; the rest are two-frame.
        const frames = dir === "fly"
          ? [
              { opacity: 0, transform: FROM.fly },
              { opacity: 1, transform: "translate(-6px, 5px) rotate(-1deg) scale(.995)", offset: 0.72 },
              { opacity: 1, transform: "none" },
            ]
          : [
              { opacity: 0, transform: FROM[dir] },
              { opacity: 1, transform: "none" },
            ];
        const anim = el.animate(frames, { duration, delay, easing: ED_EASE, fill: "backwards" });
        // Pending-animation safety (hidden tab / capture pipelines): content
        // must never be stuck invisible.
        window.setTimeout(() => { try { anim.finish(); } catch { /* already done */ } }, delay + duration + 1000);
      }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [dir, delay, duration, threshold]);

  return <div ref={ref} className={className} style={style}>{children}</div>;
}

/**
 * MaskedTitle — the printed-line type reveal (E02): each line rises out of
 * an overflow-hidden wrapper (translateY 118% → 0, 780ms, 95ms stagger).
 * Pass the visual lines explicitly — automatic line-splitting is fragile.
 *
 *   <MaskedTitle lines={["Your Pet.", "Truly Yours."]} render={(l) => <>{l}</>} … />
 */
export function MaskedTitle({
  lines, as: Tag = "h2", className, style, lineStyle, threshold = 0.3,
}: {
  lines: React.ReactNode[]; as?: "h1" | "h2" | "h3" | "div";
  className?: string; style?: React.CSSProperties; lineStyle?: React.CSSProperties;
  threshold?: number;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    // Whole-effect bail if WAAPI is missing: [data-line] spans render visible
    // by default, so skipping the observer leaves the static title untouched
    // rather than firing once and stranding lines at translateY(118%).
    if (typeof root.animate !== "function") return;

    let fired = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || fired) continue;
        fired = true;
        io.disconnect();
        const inners = Array.from(root.querySelectorAll<HTMLElement>("[data-line]"));
        inners.forEach((line, i) => {
          if (typeof line.animate !== "function") return;
          const anim = line.animate(
            [{ transform: "translateY(118%)" }, { transform: "translateY(0)" }],
            { duration: 780, delay: i * 95, easing: ED_EASE, fill: "backwards" },
          );
          window.setTimeout(() => { try { anim.finish(); } catch { /* done */ } }, i * 95 + 780 + 1000);
        });
      }
    }, { threshold });
    io.observe(root);
    return () => io.disconnect();
  }, [threshold]);

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={className} style={style}>
      {lines.map((l, i) => (
        <span key={i} style={{ display: "block", overflow: "hidden" }}>
          <span data-line style={{ display: "block", ...lineStyle }}>{l}</span>
        </span>
      ))}
    </Tag>
  );
}

/**
 * useInvert — the page's ONE big move (E06): attach to a section carrying
 * className "ed-invert"; at 60% visibility it gains .is-inverted (field →
 * terracotta via CSS transitions in globals.css) and reverts on scroll-back.
 */
export function useInvert(threshold = 0.6) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) el.classList.toggle("is-inverted", e.isIntersecting);
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

/**
 * useMagnet — magnetic CTA (E07-lite, no custom cursor): within `radius`px
 * the target leans toward the pointer at 22% of the offset. Fine pointers
 * only; reduced-motion skips.
 */
export function useMagnet(radius = 130) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.style.transition = "transform 200ms cubic-bezier(.2,.8,.2,1)";
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = ev.clientX - cx, dy = ev.clientY - cy;
      const d = Math.hypot(dx, dy);
      el.style.transform = d < radius ? `translate(${dx * 0.22}px, ${dy * 0.22}px)` : "";
    };
    const leave = () => { el.style.transform = ""; };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerleave", leave);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerleave", leave); };
  }, [radius]);
  return ref;
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number toward `end` (up OR down) with an ease-out tween, starting
 * from whatever value is currently on screen — so a data refresh never flashes
 * back to 0 and a decrease animates too. One shared implementation for Nav
 * credits, season points, card counts and pet stat rows. Presentation only:
 * the target is always the real API value.
 */
export default function useCountUp(end: number, duration = 600): number {
  const [val, setVal] = useState(0);
  const valRef = useRef(0);
  valRef.current = val;

  useEffect(() => {
    const from = valRef.current;
    const diff = end - from;
    if (diff === 0) return;
    if (typeof window === "undefined" || !("requestAnimationFrame" in window)) {
      setVal(end);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / Math.max(1, duration));
      if (p >= 1) { setVal(end); return; }
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + diff * eased));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);

  return val;
}

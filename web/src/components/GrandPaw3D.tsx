"use client";

/**
 * GrandPaw3D — React mount for the <agent-cafe-3d> hotel-lobby diorama
 * (web/src/lib/grandpaw/agent-cafe-3d.js, client-only WebGL).
 *
 * The scene builds once on mount; `liveKey` (pet names) remounts it when the
 * cast changes, while number-only changes (memory counts etc.) wait for the
 * next natural remount — the right rail always shows the live numbers, so the
 * diorama is allowed to be a few polls behind rather than resetting the
 * camera every 7s.
 */
import { useEffect, useRef } from "react";

export interface GrandPawLive {
  pets: { name: string; task: string }[];
  memory: { count: number; cap: number };
  skills: number;
  soulLv: number;
  goals: number;
  next: string;
}

export default function GrandPaw3D({ live, autoRotate = true, showLabels = true, height = 620 }:
  { live: GrandPawLive; autoRotate?: boolean; showLabels?: boolean; height?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const liveKey = live.pets.map((p) => p.name).join("|");
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    let cancelled = false;
    import("@/lib/grandpaw/agent-cafe-3d").then(() => {
      if (cancelled || !hostRef.current || elRef.current) return;
      const el = document.createElement("agent-cafe-3d");
      el.setAttribute("data-live", JSON.stringify(liveRef.current));
      el.style.width = "100%";
      el.style.height = "100%";
      hostRef.current.appendChild(el);
      elRef.current = el;
    });
    return () => {
      cancelled = true;
      if (elRef.current) { elRef.current.remove(); elRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  useEffect(() => {
    if (elRef.current) {
      elRef.current.setAttribute("auto-rotate", autoRotate ? "on" : "off");
      elRef.current.setAttribute("show-labels", showLabels ? "on" : "off");
    }
  }, [autoRotate, showLabels]);

  return <div ref={hostRef} style={{ width: "100%", height, borderRadius: 18, overflow: "hidden", background: "#EFE6CF" }} />;
}

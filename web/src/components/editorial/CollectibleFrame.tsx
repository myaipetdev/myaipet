"use client";

/**
 * CollectibleFrame — the heart of the "Collectible Editorial" system: a pet photo
 * presented as a foil-stamped collectible artifact. Cream print mat + deep floating
 * shadow + gold inset keyline + holographic sheen + diagonal gloss + a gold-foil
 * LEVEL seal, gently floating (petFloat). Reused across My Pet, Home, Catch, Studio,
 * Chat, Cards, Community and World Cup. Pure CSS finishes (no libraries); honours
 * prefers-reduced-motion via the .ed-* classes in globals.css.
 */

import React, { useEffect, useRef, useState } from "react";

const PAPER = "#FBF6EC";
const INK70 = "#3A3024";

export function GoldSeal({ level, size = 62, label = "LEVEL" }: { level: number | string; size?: number; label?: string }) {
  return (
    <div aria-hidden style={{
      position: "absolute", top: -size * 0.22, right: -size * 0.22, width: size, height: size, borderRadius: "50%",
      transform: "rotate(9deg)", zIndex: 4,
      background: "radial-gradient(circle at 35% 30%, #FFF0C0, #EBB84E 48%, #B8822C)",
      border: `2.5px solid ${PAPER}`,
      boxShadow: "0 6px 14px -4px rgba(80,40,0,.5), inset 0 2px 3px rgba(255,255,255,.6), inset 0 -3px 4px rgba(120,70,10,.5)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    }}>
      {/* Wax-seal embossed lettering — decorative foil micro-type on the physical
          collectible artifact (same sanctioned exemption family as PetCard's
          printed №/personality micro-copy), so it sits below the 13px UI floor
          by design. The redundant default "LEVEL" word is dropped (the numeral
          says the level); custom labels like "TEAM" carry real info and stay. */}
      {label !== "LEVEL" && (
        <span style={{ fontFamily: "var(--ed-m)", fontSize: size * 0.13, fontWeight: 700, letterSpacing: "0.1em", color: "#7A4708" }}>{label}</span>
      )}
      <span style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: size * 0.36, lineHeight: 0.9, color: "#5C3504" }}>
        {typeof level === "number" ? String(level).padStart(2, "0") : level}
      </span>
    </div>
  );
}

/** A small field of golden light motes rising around the pet (the "magic
 *  companion" cue). A fixed looping set — cheap, and spec-sanctioned ambient. */
export function Motes({ count = 6 }: { count?: number }) {
  const motes = Array.from({ length: count }, (_, i) => ({
    left: `${30 + ((i * 53) % 50)}%`,
    top: `${40 + ((i * 37) % 34)}%`,
    delay: `${(i * 1.3) % 7}s`,
    dur: `${7 + (i % 4)}s`,
  }));
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3 }}>
      {motes.map((m, i) => (
        <span key={i} style={{
          position: "absolute", left: m.left, top: m.top, width: 5, height: 5, borderRadius: "50%",
          background: "radial-gradient(circle, #FFE9A8, rgba(255,233,168,0))",
          animation: `edMoteFloat ${m.dur} ease-in ${m.delay} infinite`,
        }} />
      ))}
    </div>
  );
}

export default function CollectibleFrame({
  photoUrl, level, speciesLabel, elementLabel, width = 330, tilt = -2.4, holo = true, seal = true, float = true, sealLabel,
}: {
  photoUrl: string; level: number | string; speciesLabel?: string; elementLabel?: string;
  width?: number; tilt?: number; holo?: boolean; seal?: boolean; float?: boolean; sealLabel?: string;
}) {
  const well = width - 26; // mat pad 13 both sides
  const matRef = useRef<HTMLDivElement>(null);
  const [tiltOn, setTiltOn] = useState(false);
  useEffect(() => {
    // Pointer-reactive tilt only for fine hover pointers; touch keeps the
    // passive float/sheen loop and reduced-motion kills everything globally.
    if (typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches) setTiltOn(true);
  }, []);
  const onTiltMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = matRef.current;
    if (!tiltOn || !el) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    el.classList.add("ed-holo-live");
    el.style.transition = "transform .18s ease-out";
    el.style.transform = `rotateX(${(-ny * 5).toFixed(2)}deg) rotateY(${(nx * 5).toFixed(2)}deg)`;
    el.style.setProperty("--holo-x", `${Math.round(50 + nx * 60)}%`);
    el.style.setProperty("--holo-y", `${Math.round(50 + ny * 60)}%`);
  };
  const onTiltLeave = () => {
    const el = matRef.current;
    if (!el) return;
    el.classList.remove("ed-holo-live");
    el.style.transition = "transform .5s ease";
    el.style.transform = "rotateX(0deg) rotateY(0deg)";
  };
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* breathing contact shadow */}
      {float && (
        <div aria-hidden style={{
          position: "absolute", left: "50%", bottom: -26, width: width * 0.7, height: 30, transform: "translateX(-50%)",
          borderRadius: "50%", background: "radial-gradient(50% 50%, rgba(38,12,2,.5), transparent 70%)",
          animation: "edShadowPulse 5.5s ease-in-out infinite",
        }} />
      )}
      <div
        className={float ? "ed-float" : undefined}
        style={{ ["--ed-tilt" as any]: `${tilt}deg`, transform: float ? undefined : `rotate(${tilt}deg)`, perspective: 700 }}
        onPointerMove={onTiltMove}
        onPointerLeave={onTiltLeave}
      >
        <div ref={matRef} style={{
          position: "relative", width, padding: 13, background: PAPER, borderRadius: 8,
          boxShadow: "var(--ed-shadow-float)", willChange: tiltOn ? "transform" : undefined,
        }}>
          <div className="ed-foilstrip" aria-hidden style={{ position: "absolute", top: 5, left: 13, right: 13, height: 4, borderRadius: 2 }} />
          <div style={{ position: "relative", width: well, height: well, borderRadius: 6, overflow: "hidden", boxShadow: "inset 0 0 0 2px rgba(184,130,44,.55)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt={speciesLabel || "pet"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {holo && <div className="ed-holo-sheen" aria-hidden />}
            <div className="ed-gloss" aria-hidden style={{ left: 0 }} />
          </div>
          {(speciesLabel || elementLabel) && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: INK70 }}>
              <span>{speciesLabel}</span>
              {elementLabel && <span>★ {elementLabel}</span>}
            </div>
          )}
          {seal && <GoldSeal level={level} label={sealLabel ?? "LEVEL"} />}
        </div>
      </div>
    </div>
  );
}

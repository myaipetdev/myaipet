"use client";

/**
 * PetCard — a pet presented as a foil-stamped collectible in the "Collectible
 * Editorial" system, with a RARITY-TIERED finish: Common/Uncommon are matte
 * varnish, Rare wears a gold-foil border, Epic a purple-shifted foil, and only
 * Legendary gets the full holographic conic ring + foil-text name. On fine
 * pointers the card tilts in 3D and the holo sheen + a screen-blend highlight
 * follow the pointer (touch keeps the passive loop; prefers-reduced-motion is
 * neutralized globally). Pass `card` directly, or a `petId` to self-fetch
 * /api/card/[petId] — while fetching it renders an .ed-skeleton placeholder
 * (optionally pre-printed with the real name + rarity seal via `placeholder`),
 * and a failed fetch renders an explicit retryable tile instead of null.
 */

import { useEffect, useRef, useState } from "react";
import { elementTheme, rarityColor, type Rarity } from "@/lib/tcg/theme";
import type { CardData } from "@/lib/tcg/card";
import { getAuthHeaders } from "@/lib/api";

const INK = "#211A12", PAPER = "#FBF6EC", MUTED = "rgba(33,26,18,.5)", HAIR = "rgba(33,26,18,.13)";
const HOLO = "conic-gradient(from 210deg, #FFE08A, #FF9FB0, #C0A6FF, #8FE6D8, #FFE08A)";
const FOIL_GOLD = "linear-gradient(100deg,#FFF7E6,#F2CD86 32%,#FFFBF0 50%,#E8B257 68%,#FFF7E6)";
const FOIL_EPIC = "linear-gradient(100deg,#EFE6FA,#B99BE8 32%,#F6F0FD 50%,#9E72E8 68%,#EFE6FA)";

/* Topographic contour tile — masks the holo gradient into foil-stamped
 * contour lines over the photo (the "holographic ticket" texture). Pure
 * SVG data-URI, tiled; the holo underneath follows the pointer via --holo-x. */
export const TOPO_MASK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220' viewBox='0 0 220 220'%3E%3Cg fill='none' stroke='%23fff' stroke-width='1.4'%3E%3Cpath d='M30 110c0-52 34-74 80-74s80 26 80 74-34 74-80 74-80-22-80-74z'/%3E%3Cpath d='M48 110c0-42 26-58 62-58s62 20 62 58-26 58-62 58-62-16-62-58z'/%3E%3Cpath d='M66 110c0-30 18-44 44-44s44 16 44 44-18 44-44 44-44-14-44-44z'/%3E%3Cpath d='M84 110c0-19 11-28 26-28s26 10 26 28-11 28-26 28-26-9-26-28z'/%3E%3Cpath d='M100 110c0-9 5-13 10-13s10 5 10 13-5 13-10 13-10-4-10-13z'/%3E%3Cpath d='M-10 30c30-18 62-20 92-6M230 196c-32 16-66 16-96 4M-8 180c22 22 52 30 84 26M226 34c-24-20-56-26-88-20'/%3E%3C/g%3E%3Cpath fill='%23fff' d='M110 100l3.2 6.8 6.8 3.2-6.8 3.2-3.2 6.8-3.2-6.8-6.8-3.2 6.8-3.2z'/%3E%3C/svg%3E")`;
const HOLO_LINEAR = "linear-gradient(118deg,#ff5e8a,#ffd36e,#54ffc8,#5e8aff,#ff5eef,#ff5e8a)";

/* Rarity-tiered material finish — pulling a Legendary must FEEL different from
 * a Common. Declarative record on the card's REAL computed rarity; commons skip
 * the sheen layer entirely (fewer perpetually-animating layers on big grids).
 * `topo` = opacity of the contour-line holo foil over the photo. */
/** Iridescent topo-foil strength per rarity — shared so the ticket stub
 *  matches the card face (Common/Uncommon matte, Legendary full holo). */
export function rarityTopo(r: Rarity): number { return (RARITY_FINISH[r] || RARITY_FINISH.Common).topo; }
const RARITY_FINISH: Record<Rarity, { pad: number; ring: string; sheen: number; gloss: number; foilName: boolean; topo: number }> = {
  Common:    { pad: 2, ring: "#E4D9C4", sheen: 0,    gloss: 0.5, foilName: false, topo: 0 },
  Uncommon:  { pad: 2, ring: "#E4D9C4", sheen: 0,    gloss: 0.5, foilName: false, topo: 0 },
  Rare:      { pad: 3, ring: FOIL_GOLD, sheen: 0.14, gloss: 0.6, foilName: false, topo: 0.3 },
  Epic:      { pad: 3, ring: FOIL_EPIC, sheen: 0.2,  gloss: 0.6, foilName: false, topo: 0.42 },
  Legendary: { pad: 3, ring: HOLO,      sheen: 0.38, gloss: 0.7, foilName: true,  topo: 0.6 },
};

export default function PetCard({ card: cardProp, petId, maxWidth = 320, placeholder, insideButton = false }: {
  card?: CardData; petId?: number; maxWidth?: number;
  /** Real name + rarity CardDeck already knows — printed on the skeleton/error tile. */
  placeholder?: { name: string; rarity: Rarity };
  insideButton?: boolean;
}) {
  const [card, setCard] = useState<CardData | null>(cardProp || null);
  const [loading, setLoading] = useState(!cardProp);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // ── Pointer-reactive holo tilt (fine hover pointers only) ──
  const tiltRef = useRef<HTMLDivElement>(null);
  const [tiltOn, setTiltOn] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches) setTiltOn(true);
  }, []);
  const onTiltMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!tiltOn || !el) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;  // -1 … 1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    el.classList.add("ed-holo-live");
    el.style.transition = "transform 80ms linear";
    el.style.setProperty("--rx", nx.toFixed(3));
    el.style.setProperty("--ry", (-ny).toFixed(3));
    el.style.setProperty("--px", `${(((nx + 1) / 2) * 100).toFixed(1)}%`);
    el.style.setProperty("--py", `${(((ny + 1) / 2) * 100).toFixed(1)}%`);
    el.style.setProperty("--hl", "1");
    el.style.setProperty("--holo-x", `${Math.round(50 + nx * 60)}%`);
    el.style.setProperty("--holo-y", `${Math.round(50 + ny * 60)}%`);
  };
  const onTiltLeave = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.classList.remove("ed-holo-live");
    el.style.transition = "transform 450ms cubic-bezier(0.2,0.8,0.2,1)";
    el.style.setProperty("--rx", "0");
    el.style.setProperty("--ry", "0");
    el.style.setProperty("--hl", "0");
  };

  useEffect(() => {
    if (cardProp || !petId) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    fetch(`/api/card/${petId}`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const c = d?.card || null;
        setCard(c);
        setFailed(!c);
        setLoading(false);
      })
      .catch(() => { if (alive) { setFailed(true); setLoading(false); } });
    return () => { alive = false; };
  }, [petId, cardProp, attempt]);

  const pRarity = placeholder ? rarityColor(placeholder.rarity) : MUTED;

  if (loading) {
    // Foil-shimmer skeleton — same 5/7 footprint as the loaded card (no grid
    // reflow), optionally pre-printed with the pet's REAL name + rarity seal.
    return (
      <div style={{ width: "100%", maxWidth, margin: "0 auto" }}>
        <div className="ed-skeleton" style={{ position: "relative", width: "100%", aspectRatio: "5 / 7", borderRadius: 18, boxShadow: "var(--ed-shadow-card)", overflow: "hidden" }}>
          {placeholder && (
            <>
              <div style={{ position: "absolute", top: 14, left: 16, right: 52, fontFamily: "var(--ed-disp)", fontSize: 18, fontWeight: 800, color: "rgba(33,26,18,.32)", letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{placeholder.name}</div>
              <div aria-hidden style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: "50%", border: `2px solid ${pRarity}`, opacity: 0.55, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "var(--ed-m)", fontWeight: 700, fontSize: 13, color: pRarity }}>{placeholder.rarity[0]}</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (failed) {
    // Honest error tile — never an invisible null that desyncs the grid count.
    // The tile itself retries (span/div, not <button> — it can sit inside the
    // album's wrapper <button> without nesting interactive elements).
    return (
      <div style={{ width: "100%", maxWidth, margin: "0 auto" }}>
        <div
          role={insideButton ? undefined : "button"}
          tabIndex={insideButton ? undefined : 0}
          aria-label={insideButton ? undefined : `Retry loading ${placeholder?.name ? `${placeholder.name}'s` : "this"} card`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAttempt((a) => a + 1); }}
          onKeyDown={insideButton ? undefined : (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            setAttempt((a) => a + 1);
          }}
          style={{
            width: "100%", aspectRatio: "5 / 7", borderRadius: 18, background: "#F5EFE2",
            border: `1px dashed ${HAIR}`, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 8, textAlign: "center", padding: 14, cursor: "pointer",
          }}
        >
          {placeholder?.name && <div style={{ fontFamily: "var(--ed-disp)", fontSize: 16, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>{placeholder.name}</div>}
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED }}>Card unavailable</div>
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#BE4F28" }}>Retry ▸</div>
        </div>
      </div>
    );
  }

  if (!card) return null;

  const t = elementTheme(card.element);
  const rc = rarityColor(card.rarity);
  const fin = RARITY_FINISH[card.rarity] || RARITY_FINISH.Common;

  return (
    <div style={{ width: "100%", maxWidth, margin: "0 auto", perspective: 900 }}>
      {/* Rarity-tiered border ring: matte → gold foil → epic foil → full holo.
          Tilts in 3D under a fine pointer; --px/--py drive the highlight and
          --holo-x/--holo-y steer the sheen (via .ed-holo-live in globals). */}
      <div
        ref={tiltRef}
        onPointerMove={onTiltMove}
        onPointerLeave={onTiltLeave}
        style={{
          position: "relative", borderRadius: 18, padding: fin.pad, background: fin.ring,
          boxShadow: "var(--ed-shadow-card)",
          transform: "rotateX(calc(var(--ry, 0) * 6deg)) rotateY(calc(var(--rx, 0) * 8deg))",
          willChange: tiltOn ? "transform" : undefined,
        }}
      >
        {/* Inner card — warm cream paper */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 18 - fin.pad, background: PAPER }}>
          {/* Header — Legendary gets a gold keyline under the foil-text name */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "11px 14px 9px", borderBottom: fin.foilName ? "1px solid rgba(184,130,44,.45)" : undefined, marginBottom: fin.foilName ? 7 : 0 }}>
            <div style={{ minWidth: 0 }}>
              <div className={fin.foilName ? "ed-foil-text" : undefined} style={{ fontFamily: "var(--ed-disp)", fontSize: 20, fontWeight: 800, color: INK, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.05 }}>{card.name}</div>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: t.color, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>{t.label}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 700, color: INK }}>Lv {card.level}</div>
              {card.topPercent != null && card.topPercent <= 50 && <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: MUTED, marginTop: 2 }}>TOP {card.topPercent}%</div>}
            </div>
          </div>

          {/* Photo well — gold inset keyline + (rarity-gated) holo sheen + gloss + circular rarity seal */}
          <div style={{ position: "relative", margin: "0 14px", borderRadius: 8, overflow: "hidden", boxShadow: "inset 0 0 0 2px rgba(184,130,44,.5)" }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "#fff" }}>
              {(card.codexUrl || card.avatarUrl) ? (
                // Prefer the Codex sticker illustration when it exists; else the photo.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(card.codexUrl || card.avatarUrl) as string} alt={card.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--ed-disp)", fontSize: 30, fontWeight: 800, color: "rgba(33,26,18,.3)" }}>{card.speciesName}</div>
              )}
              {fin.sheen > 0 && <div className="ed-holo-sheen" aria-hidden style={{ opacity: fin.sheen }} />}
              {/* Foil-stamped topographic contours — iridescence shows only
                  through the contour lines and trails the pointer (--holo-x). */}
              {fin.topo > 0 && (
                <div aria-hidden style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: HOLO_LINEAR, backgroundSize: "300% 300%",
                  backgroundPosition: "var(--holo-x, 50%) var(--holo-y, 50%)",
                  WebkitMaskImage: TOPO_MASK, maskImage: TOPO_MASK,
                  WebkitMaskSize: "220px 220px", maskSize: "220px 220px",
                  mixBlendMode: "screen", opacity: fin.topo,
                }} />
              )}
              <div className="ed-gloss" aria-hidden style={{ left: 0, opacity: fin.gloss }} />
            </div>
            {/* Circular rarity seal */}
            <div aria-hidden title={`${card.rarity} rarity`} style={{
              position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: "50%",
              background: PAPER, border: `2px solid ${rc}`, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px -1px rgba(40,20,0,.4)",
            }}>
              <span style={{ fontFamily: "var(--ed-m)", fontWeight: 700, fontSize: 13, color: rc }}>{card.rarity[0]}</span>
            </div>
          </div>

          {/* species · element caption */}
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: MUTED, padding: "9px 14px 4px", textTransform: "uppercase" }}>
            {(card.evolutionName || card.speciesName)} · {t.label}
          </div>

          {/* Stats trio */}
          <div style={{ display: "flex", gap: 7, padding: "2px 14px 6px" }}>
            {([["ATK", card.atk], ["DEF", card.def], ["SPD", card.spd]] as const).map(([lab, val]) => (
              <div key={lab} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "#fff", borderRadius: 9, border: `1px solid ${HAIR}`, padding: "7px 2px" }}>
                <span style={{ fontFamily: "var(--ed-disp)", fontSize: 19, fontWeight: 700, color: INK, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{val}</span>
                <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: MUTED, letterSpacing: 1, marginTop: 4 }}>{lab}</span>
              </div>
            ))}
          </div>

          {/* Sub-stats */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 16px", fontFamily: "var(--ed-m)", fontSize: 13, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
            <span>PWR {card.power}</span>
            <span>BOND {card.bondLevel}</span>
            <span>STREAK {card.careStreak}d</span>
          </div>

          {/* Moves */}
          {card.moves.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 14px 8px" }}>
              {card.moves.map((m, i) => (
                <span key={i} style={{ fontFamily: "var(--ed-body)", fontSize: 13, fontWeight: 600, color: INK, background: "#fff", borderRadius: 7, border: `1px solid ${HAIR}`, padding: "3px 9px" }}>{m}</span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto", padding: "9px 14px", borderTop: `1px solid ${HAIR}` }}>
            <span style={{ fontFamily: "var(--ed-disp)", fontSize: 13, fontWeight: 800, color: t.color, letterSpacing: "0.01em" }}>MY AI PET</span>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>№ {String(card.id).padStart(4, "0")} · {card.personality}</span>
          </div>
        </div>

        {/* Pointer-following highlight — screen blend, fades in on hover only */}
        <div aria-hidden style={{
          position: "absolute", inset: 0, borderRadius: 18, pointerEvents: "none", mixBlendMode: "screen",
          opacity: "var(--hl, 0)" as unknown as number, transition: "opacity .3s ease",
          background: "radial-gradient(260px circle at var(--px, 50%) var(--py, 50%), rgba(255,246,220,.5), transparent 65%)",
        }} />
      </div>
    </div>
  );
}

/**
 * Shared visual tokens for the CATCH FAMILY only (Catch, Wild Encounters,
 * reveal, dashboard, album, Alley Clash battle). This is the cream / warm /
 * thick-outline "sticker" look the Catch surface already uses — extracting it
 * here keeps the new Catch features cohesive WITHOUT touching the rest of the
 * app's established design.
 */
import type { CSSProperties } from "react";

export const CC = {
  cream: "#fbf6ec",
  paper: "#f3ecdc",
  ink: "#1a1a22",
  outline: "#1a1a22",
  muted: "#6b6b73",
  gold: "#f59e0b",
  goldDeep: "#b45309",
  mint: "#bbf7d0",
};

/** Chunky "sticker" primary button (amber fill, hard offset shadow). */
export const stickerBtn: CSSProperties = {
  padding: "13px 26px", borderRadius: 999, border: `3px solid ${CC.outline}`,
  background: CC.gold, color: CC.ink, fontWeight: 800, fontSize: 15, cursor: "pointer",
  boxShadow: "0 4px 0 rgba(26,26,34,0.25)", fontFamily: "'Space Grotesk', system-ui, sans-serif",
};

/** White sticker (secondary). */
export const stickerBtnAlt: CSSProperties = {
  ...stickerBtn, background: "#fff",
};

/** Ghost (outline only). */
export const ghostBtn: CSSProperties = {
  padding: "9px 18px", borderRadius: 999, border: `2px solid ${CC.outline}`,
  background: "transparent", color: CC.ink, fontWeight: 700, fontSize: 13.5, cursor: "pointer",
};

/** Card/panel surface in the cream look. */
export const panel: CSSProperties = {
  background: "#fff", border: `3px solid ${CC.outline}`, borderRadius: 18,
  boxShadow: "0 6px 0 rgba(26,26,34,0.12)",
};

/** Pad a numeric id into a dex-style serial (#000059). */
export function dexNo(id: number): string {
  return `#${String(id).padStart(6, "0")}`;
}

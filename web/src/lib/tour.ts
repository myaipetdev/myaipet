// Guest tour mode — with ?tour=1 (persisted once seen in sessionStorage under
// "aipet_tour"), wallet-gated sections in the allowlist render a READ-ONLY,
// DEMO-badged preview instead of the connect-wall, so visitors can feel the
// product without a wallet (and we can auto-record step demos). Tour never
// writes to the server and never spends credits — every action is a no-op with
// an honest "connect to do this" nudge.

export const TOUR_KEY = "aipet_tour";

// Sections whose logged-out preview is safe to show in tour mode. Owner-API
// sections (agent, office, workbench, sovereignty, cards, chat) stay gated.
export const TOUR_ALLOWLIST = new Set(["community", "worldcup", "my pet"]);

/**
 * True when the guest tour is active: either ?tour=1 is in the URL (which we
 * then persist to sessionStorage so it survives in-SPA navigation), or it was
 * seen earlier this session. Safe on the server (returns false).
 */
export function isTourActive(): boolean {
  if (typeof window === "undefined") return false;
  let fromUrl = false;
  try {
    fromUrl = new URLSearchParams(window.location.search).get("tour") === "1";
  } catch {
    fromUrl = false;
  }
  if (fromUrl) {
    try { window.sessionStorage.setItem(TOUR_KEY, "1"); } catch { /* storage blocked */ }
    return true;
  }
  try {
    return window.sessionStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return false;
  }
}

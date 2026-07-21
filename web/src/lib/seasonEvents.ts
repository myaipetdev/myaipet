/**
 * Season Events registry — the single honest list of recurring / seasonal
 * event modules. Every entry maps to a REAL surface that already exists in
 * the app, states are honest (no fabricated live events, no countdowns), and
 * reward lines only claim what the server actually pays TODAY:
 *
 *   - streak-festival → /api/checkin STREAK_REWARDS = [5,10,15,20,25,30,50]
 *     (D1–D7, loops back to D1 after day 7; resets on a missed day)
 *   - catch-safari    → /api/catch/spawns claim pays WILD_POINTS 3–25 by
 *     rarity via awardPointsCapped (wild_catch, 60/day). The weekly species
 *     spotlight is PURE FRAMING — no multiplier exists server-side, so no
 *     multiplier is ever claimed.
 *   - best-in-show    → the Favorites Bracket pays NO season points today, so
 *     its poster claims only the real prize: the gold-foil champion card
 *     (CollectibleFrame WINNER seal) the client actually renders + shares.
 *   - world-cup       → the 2026 tournament event is over; module gated OFF.
 *
 * Season points are non-financial Season Rewards loyalty recognition — no
 * token, no cash value. NEVER add a reward line here without verifying the
 * exact server grant first (lib/seasonRewards.ts + the route).
 */

import { SPAWN_KINDS } from "@/lib/catch/spawns";

/**
 * Seasonal World Cup 2026 module (national-pet studio + champion-prediction
 * poll inside WorldCupPet.tsx). The real tournament has ended, so the module
 * is gated OFF by default — code is retained; flip this single flag to bring
 * it back for a future football event.
 */
export const WORLD_CUP_MODULE_ENABLED = false;

export type SeasonEventState = "active" | "opens-soon" | "ended";

export interface SeasonEventChip {
  /** /public/icons name. */
  icon: string;
  label: string;
}

export interface SeasonEvent {
  key: "best-in-show" | "streak-festival" | "catch-safari" | "world-cup";
  title: string;
  state: SeasonEventState;
  /** Mono eyebrow — cadence / mission framing for the poster. */
  cadence: string;
  blurb: string;
  /**
   * Honest reward line — ONLY values the server verifiably pays (or, for
   * best-in-show, a real non-point prize). Omitted when nothing is paid.
   */
  reward?: string;
  /** In-SPA destination for the poster CTA. */
  href: string;
  /** App.tsx section key the href lands on. */
  section: string;
  /** /public/icons name for the poster mark. */
  icon: string;
  /** Optional highlight chip (weekly spotlight, gate condition, …). */
  chip?: SeasonEventChip;
}

/* ── Catch Safari weekly spotlight ─────────────────────────────────────────
   Deterministic rotation over the UNIQUE kinds of the real spawn table
   (lib/catch/spawns.ts SPAWN_KINDS), advancing once per ISO week (Monday
   00:00 UTC). Everyone sees the same featured species for the same week, and
   the server needs no state — it is a spotlight, not a payout change. */

/** Unique spawnable kinds, in first-appearance order: cat, dog, bird, … */
export const SAFARI_SPECIES: string[] = Array.from(new Set(SPAWN_KINDS));

/** Whole ISO weeks elapsed since Monday 2024-01-01 (UTC). */
export function isoWeekIndex(now: Date = new Date()): number {
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const epochMonday = Date.UTC(2024, 0, 1); // 2024-01-01 was an ISO-week Monday
  return Math.floor((utcMidnight - epochMonday) / (7 * 86400000));
}

/** This ISO week's featured wild species (lowercase kind, e.g. "fox"). */
export function safariSpotlight(now: Date = new Date()): string {
  const n = SAFARI_SPECIES.length;
  return SAFARI_SPECIES[((isoWeekIndex(now) % n) + n) % n];
}

/** Poster icon for a spotlight kind (falls back to footprints). */
export function safariSpotlightIcon(kind: string): string {
  const icons: Record<string, string> = { cat: "cat", dog: "dog", bird: "parrot", rabbit: "rabbit", fox: "fox" };
  return icons[kind] || "footprints";
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The registry. `bestInShowOpen` reflects whether ≥4 public avatar-bearing
 * pets exist (GET /api/worldcup/bracket) — pass it when known; the honest
 * default is the gated "opens-soon" poster.
 */
export function getSeasonEvents(opts: { bestInShowOpen?: boolean } = {}): SeasonEvent[] {
  const spotlight = safariSpotlight();
  const open = opts.bestInShowOpen === true;
  return [
    {
      key: "best-in-show",
      title: "Best in Show",
      state: open ? "active" : "opens-soon",
      cadence: "Recurring · community favorites",
      blurb: open
        ? "Two real community pets face off — tap your favorite until one is crowned. Your personal bracket, real pets only."
        : "Seeded only with real community pets — never made-up contestants — so it opens for real as players adopt and add avatars.",
      reward: "Champion crowned on a gold-foil winner card",
      href: "/?section=worldcup",
      section: "worldcup",
      icon: "trophy",
      chip: open ? undefined : { icon: "paw", label: "OPENS AT 4 PUBLIC PETS" },
    },
    {
      key: "streak-festival",
      title: "Streak Festival",
      state: "active",
      cadence: "Daily · D1–D7 ladder",
      blurb: "Check in every day to climb the seven-day ladder — it loops after D7 and resets if you miss a day. The streak is the event.",
      reward: "+5 → +50 season points per day (D1–D7)",
      href: "/?section=home",
      section: "home",
      icon: "fire",
    },
    {
      key: "catch-safari",
      title: "Catch Safari",
      state: "active",
      cadence: "Weekly species spotlight",
      blurb: `This week the wild spotlight is on ${titleCase(spotlight)}s. A featured species to hunt for — spawn odds and points are unchanged.`,
      reward: "Wild catches pay +3–25 season points by rarity (daily-capped)",
      href: "/?section=catch",
      section: "catch",
      icon: "footprints",
      chip: { icon: safariSpotlightIcon(spotlight), label: `THIS WEEK · ${spotlight.toUpperCase()}` },
    },
    {
      key: "world-cup",
      title: "World Cup 2026",
      state: "ended",
      cadence: "Seasonal · wrapped",
      blurb: "The tournament event has wrapped — the national-pet studio and champion poll are retired until the next big cup.",
      href: "/?section=worldcup",
      section: "worldcup",
      icon: "medal",
    },
  ];
}

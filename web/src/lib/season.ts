/**
 * Season Rewards tiers — turns the flat airdrop-points number into a ladder the
 * user climbs, so loyalty points carry felt status + anticipation (without
 * promising a token: tiers are non-financial standing, snapshotted at close).
 *
 * Pure + dependency-free so both server routes and client components can import.
 */

// ── Season 1 window (single source of truth; mirrors SeasonBanner in App.tsx) ──
// Season 1 runs Jul 1 → Aug 1 2026 (UTC).
export const SEASON_KEY = "SEASON-1";
export const SEASON_START_MS = Date.UTC(2026, 6, 1); // 2026-07-01 00:00 UTC
export const SEASON_END_MS = Date.UTC(2026, 7, 1);   // 2026-08-01 00:00 UTC

export type SeasonPhase = "upcoming" | "live" | "ended";

export function seasonPhase(now: number = Date.now()): SeasonPhase {
  if (now < SEASON_START_MS) return "upcoming";
  if (now >= SEASON_END_MS) return "ended";
  return "live";
}

/** A frozen final-standings snapshot, persisted at close. */
export interface SeasonSnapshotEntry {
  rank: number;
  userId: number;
  points: number;
  petId: number | null;
  petName: string;
  petLevel: number;
  petAvatar: string | null;
}
export interface SeasonSnapshot {
  seasonKey: string;
  closedAtIso: string;
  participants: number;
  poolPoints: number;
  top: SeasonSnapshotEntry[]; // top N final standings (frozen)
}

export interface SeasonTier {
  key: string;
  name: string;
  min: number;   // points required to enter this tier
  color: string;
  emoji: string;
}

// Tier accent colors are drawn from the LOCKED Collectible Editorial ramp only
// (rarity common/rare/epic + terracotta + legend gold) — no Tailwind hexes.
export const SEASON_TIERS: SeasonTier[] = [
  { key: "sprout",  name: "Sprout",  min: 0,     color: "#5C8A4E", emoji: "🌱" },
  { key: "bronze",  name: "Bronze",  min: 250,   color: "#9A4E1E", emoji: "🥉" },
  { key: "silver",  name: "Silver",  min: 1000,  color: "#7A6E5A", emoji: "🥈" },
  { key: "gold",    name: "Gold",    min: 3000,  color: "#C8932F", emoji: "🥇" },
  { key: "diamond", name: "Diamond", min: 8000,  color: "#3E8FE0", emoji: "💎" },
  { key: "legend",  name: "Legend",  min: 20000, color: "#9E72E8", emoji: "👑" },
];

export interface TierStanding {
  tier: SeasonTier;
  next: SeasonTier | null;
  toNext: number;    // points to reach the next tier (0 once maxed)
  progress: number;  // 0..1 within the current tier band
}

export function seasonTier(points: number): TierStanding {
  const p = Math.max(0, Math.floor(points || 0));
  let idx = 0;
  for (let i = 0; i < SEASON_TIERS.length; i++) {
    if (p >= SEASON_TIERS[i].min) idx = i;
  }
  const tier = SEASON_TIERS[idx];
  const next = SEASON_TIERS[idx + 1] ?? null;
  const toNext = next ? next.min - p : 0;
  const span = next ? next.min - tier.min : 1;
  const progress = next ? Math.min(1, Math.max(0, (p - tier.min) / span)) : 1;
  return { tier, next, toNext, progress };
}

/**
 * Hourly Spotlight — a rotating "featured category" each hour.
 *
 * One category is spotlighted at most. We don't pre-schedule a whole day; the
 * current spotlight is computed lazily from the current UTC hour seed, so it's
 * deterministic (every user sees the same one at the same time, like live
 * community events) without a cron writer.
 *
 * The spotlight ends 30 min into the hour; the remaining 30 min there's none.
 * The window is shown in UI as a countdown.
 *
 * NOTE: `multiplier_x` is carried in the data model for a future boost feature
 * but is NOT applied to point grants yet — the award paths credit the flat base
 * amount, so the UI must not advertise a live multiplier. `activeMultiplierFor`
 * below is intentionally not wired into any grant path.
 */

export type DropKind = "snack" | "memory" | "studio" | "compliment" | "chat" | "care";

export interface DropDef {
  kind: DropKind;
  emoji: string;
  label: string;
  applies_to: string;       // mission category that gets boosted; "*" = all
  multiplier_x: number;
  description: string;
}

// `multiplier_x` is retained for a future boost feature but is NOT applied to
// grants today (see module note), so descriptions must not promise a multiplier.
export const DROP_POOL: DropDef[] = [
  { kind: "snack",      emoji: "🍖", label: "Snack Hour",        applies_to: "care",         multiplier_x: 1.0, description: "Feed & play care actions are featured this hour." },
  { kind: "memory",     emoji: "💭", label: "Memory Minute",     applies_to: "memory",       multiplier_x: 1.0, description: "Making memories is featured this hour." },
  { kind: "studio",     emoji: "🎬", label: "Studio Happy Hour", applies_to: "creation",     multiplier_x: 1.0, description: "Studio creations are featured this hour." },
  { kind: "compliment", emoji: "💌", label: "Compliment Hour",   applies_to: "social",       multiplier_x: 1.0, description: "Comments & likes are featured this hour." },
  { kind: "chat",       emoji: "💬", label: "Chat Hour",         applies_to: "conversation", multiplier_x: 1.0, description: "Conversations are featured this hour." },
  { kind: "care",       emoji: "💝", label: "Care Frenzy",       applies_to: "care",         multiplier_x: 1.0, description: "All care actions are featured this hour." },
];

export interface ActiveDrop {
  kind: DropKind;
  emoji: string;
  label: string;
  applies_to: string;
  multiplier_x: number;
  description: string;
  starts_at: string;        // ISO
  ends_at: string;          // ISO
  /** Seconds until the drop ends (0 if not active right now). */
  ends_in_seconds: number;
  /** Next drop kind for the FOLLOWING hour (preview), with start time. */
  next_kind: DropKind;
  next_emoji: string;
  next_label: string;
  next_starts_at: string;
}

/** Picks a drop deterministically from the UTC hour seed. */
function dropForHour(epochHour: number): DropDef {
  const idx = Math.abs((epochHour * 1103515245 + 12345) >>> 0) % DROP_POOL.length;
  return DROP_POOL[idx];
}

export function currentDrop(now: Date = new Date()): ActiveDrop {
  const epochMs = now.getTime();
  const hourMs = 3600_000;
  const hourStart = Math.floor(epochMs / hourMs) * hourMs;
  const dropEnd = hourStart + 30 * 60_000;         // 30 min window
  const nextStart = hourStart + hourMs;
  const inWindow = epochMs < dropEnd;

  const current = dropForHour(hourStart / hourMs);
  const next = dropForHour(nextStart / hourMs);

  const ends_in = inWindow ? Math.max(0, Math.round((dropEnd - epochMs) / 1000)) : 0;
  return {
    ...current,
    starts_at: new Date(hourStart).toISOString(),
    ends_at: new Date(dropEnd).toISOString(),
    ends_in_seconds: ends_in,
    next_kind: next.kind,
    next_emoji: next.emoji,
    next_label: next.label,
    next_starts_at: new Date(nextStart).toISOString(),
  };
}

/** Returns the active multiplier for a mission whose category falls under
 *  applies_to. 1.0 if no active drop applies. */
export function activeMultiplierFor(category: string, now: Date = new Date()): number {
  const drop = currentDrop(now);
  if (drop.ends_in_seconds <= 0) return 1.0;
  if (drop.applies_to === "*") return drop.multiplier_x;
  return drop.applies_to === category ? drop.multiplier_x : 1.0;
}

export interface UpcomingDrop {
  kind: DropKind;
  emoji: string;
  label: string;
  applies_to: string;
  multiplier_x: number;
  starts_at: string;        // ISO — top of that hour
  starts_in_seconds: number;
  is_live: boolean;         // true only for the current half-hour window
}

/**
 * The next `count` drops on the schedule, starting with the current hour.
 * Drops are deterministic per-hour, so we can show users the whole runway —
 * "come back at 3pm for Snack Hour" — which is the entire point of making
 * a habit out of checking in.
 */
export function upcomingDrops(count = 6, now: Date = new Date()): UpcomingDrop[] {
  const hourMs = 3600_000;
  const epochMs = now.getTime();
  const thisHourStart = Math.floor(epochMs / hourMs) * hourMs;
  const out: UpcomingDrop[] = [];
  for (let i = 0; i < count; i++) {
    const hourStart = thisHourStart + i * hourMs;
    const def = dropForHour(hourStart / hourMs);
    const dropEnd = hourStart + 30 * 60_000;
    const isLive = i === 0 && epochMs < dropEnd;
    out.push({
      kind: def.kind,
      emoji: def.emoji,
      label: def.label,
      applies_to: def.applies_to,
      multiplier_x: def.multiplier_x,
      starts_at: new Date(hourStart).toISOString(),
      starts_in_seconds: Math.max(0, Math.round((hourStart - epochMs) / 1000)),
      is_live: isLive,
    });
  }
  return out;
}

/**
 * Hourly Drops — global random 30-minute multipliers.
 *
 * One drop is "live" at most. We don't pre-schedule a whole day; the
 * current drop is computed lazily based on the current UTC hour seed.
 * That keeps drops deterministic (every user sees the same drop at the
 * same time, like Pokemon GO community events) without a cron writer.
 *
 * Drop ends 30 min into the hour. The remaining 30 min there's no drop.
 * Window is shown in UI as a countdown.
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

export const DROP_POOL: DropDef[] = [
  { kind: "snack",      emoji: "🍖", label: "Snack Hour",        applies_to: "care",         multiplier_x: 2.0, description: "Feed/play care actions count 2×." },
  { kind: "memory",     emoji: "💭", label: "Memory Minute",     applies_to: "memory",       multiplier_x: 2.0, description: "Memories formed now are worth 2×." },
  { kind: "studio",     emoji: "🎬", label: "Studio Happy Hour", applies_to: "creation",     multiplier_x: 1.5, description: "Studio generations award 1.5× points." },
  { kind: "compliment", emoji: "💌", label: "Compliment Hour",   applies_to: "social",       multiplier_x: 2.0, description: "Comments/likes count 2×." },
  { kind: "chat",       emoji: "💬", label: "Chat Hour",         applies_to: "conversation", multiplier_x: 2.0, description: "Conversation missions 2×." },
  { kind: "care",       emoji: "💝", label: "Care Frenzy",       applies_to: "care",         multiplier_x: 3.0, description: "All 4 care missions worth 3× if done this hour." },
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

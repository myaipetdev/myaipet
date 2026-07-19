/**
 * Tiny count-aware label helpers.
 *
 * `pluralize` picks singular vs plural for a known word ("1 raiser" / "2 raisers").
 * `unitLabel` takes a server-provided plural unit ("days", "memories") and
 * singularizes it when the count is exactly 1 ("1 day", "1 memory"), so
 * leaderboard rows never read "1 days".
 */

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function unitLabel(count: number, pluralUnit: string): string {
  if (count === 1) {
    if (pluralUnit.endsWith("ies")) return `${pluralUnit.slice(0, -3)}y`;
    if (pluralUnit.endsWith("s")) return pluralUnit.slice(0, -1);
  }
  return pluralUnit;
}

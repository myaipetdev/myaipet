/**
 * Season-close snapshot store — freezes final standings at SEASON_END.
 *
 * This freezes a RECOGNITION snapshot only — there is NO settlement, payout, or
 * distribution of any kind. Final standings are non-financial: no token, no cash
 * value, no claim. The column names below are LEGACY reuse of a retired battle
 * table and do not imply any payout.
 *
 * NO new table (migration-free): we persist the single global snapshot as a
 * JSON blob in the existing, otherwise-unused WeeklyBattlePool row, keyed by a
 * sentinel week_key === SEASON_KEY ("SEASON-1"). Battles were retired (see the
 * note in /api/dashboard/projection), so this table has no live writer — we
 * borrow its `payouts Json` column + `closed_at` to hold the snapshot.
 *
 *   week_key      = "SEASON-1"          (sentinel, not a real ISO week)
 *   closed_at     = season close time   (NOT a settlement — nothing is paid out)
 *   total_entries = participant count
 *   pool_usd      = 0                    (no USD, ever; recognition points only)
 *   payouts       = SeasonSnapshot JSON  (legacy column name; holds frozen standings)
 *   paid_out      = true once written    (legacy flag; means "snapshot frozen")
 */

import { prisma } from "@/lib/prisma";
import { SEASON_KEY, SEASON_END_MS, type SeasonSnapshot, type SeasonSnapshotEntry } from "@/lib/season";

const TOP_N = 100;

/** Read the frozen snapshot if the season has been closed; else null. */
export async function readSeasonSnapshot(): Promise<SeasonSnapshot | null> {
  const row = await prisma.weeklyBattlePool
    .findUnique({ where: { week_key: SEASON_KEY } })
    .catch(() => null);
  if (!row || !row.paid_out) return null;
  const snap = row.payouts as unknown as SeasonSnapshot | null;
  if (!snap || !Array.isArray(snap.top)) return null;
  return snap;
}

/**
 * Compute the final standings from live data. Pure read — used both to build
 * the durable snapshot at close and to render "final standings (live)" before
 * the cron has run.
 */
export async function computeFinalStandings(): Promise<SeasonSnapshot> {
  const where = { season_points: { gt: 0 }, pets: { some: { is_active: true } } } as const;
  const [poolAgg, participants, top] = await Promise.all([
    prisma.user.aggregate({ _sum: { season_points: true }, where }),
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { season_points: "desc" },
      take: TOP_N,
      select: {
        id: true,
        season_points: true,
        pets: {
          where: { is_active: true },
          orderBy: { level: "desc" },
          take: 1,
          select: { id: true, name: true, level: true, avatar_url: true },
        },
      },
    }),
  ]);

  const entries: SeasonSnapshotEntry[] = top.map((u, i) => ({
    rank: i + 1,
    userId: u.id,
    points: u.season_points,
    petId: u.pets[0]?.id ?? null,
    petName: u.pets[0]?.name ?? "—",
    petLevel: u.pets[0]?.level ?? 1,
    petAvatar: u.pets[0]?.avatar_url ?? null,
  }));

  return {
    seasonKey: SEASON_KEY,
    closedAtIso: new Date(Math.max(SEASON_END_MS, Date.now())).toISOString(),
    participants,
    poolPoints: poolAgg._sum.season_points ?? 0,
    top: entries,
  };
}

/**
 * Freeze + persist the final standings. Idempotent: if a snapshot already
 * exists (paid_out), returns it unchanged. Returns { snapshot, created }.
 */
export async function closeSeasonIfDue(now: number = Date.now()): Promise<{
  due: boolean;
  created: boolean;
  snapshot: SeasonSnapshot | null;
}> {
  if (now < SEASON_END_MS) return { due: false, created: false, snapshot: null };

  const existing = await readSeasonSnapshot();
  if (existing) return { due: true, created: false, snapshot: existing };

  const snapshot = await computeFinalStandings();

  // Upsert the sentinel row. week_key is @unique so concurrent crons converge;
  // we only treat it as "the" snapshot once paid_out === true.
  await prisma.weeklyBattlePool.upsert({
    where: { week_key: SEASON_KEY },
    update: {
      closed_at: new Date(snapshot.closedAtIso),
      total_entries: snapshot.participants,
      payouts: snapshot as unknown as object,
      paid_out: true,
      paid_at: new Date(),
    },
    create: {
      week_key: SEASON_KEY,
      closed_at: new Date(snapshot.closedAtIso),
      pool_usd: 0,
      total_entries: snapshot.participants,
      payouts: snapshot as unknown as object,
      paid_out: true,
      paid_at: new Date(),
    },
  });

  return { due: true, created: true, snapshot };
}

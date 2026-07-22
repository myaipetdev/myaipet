# Generation provenance backfill (off-release)

The `20260722030000_daydream_video_claim_provenance` release migration is
expand-only. It adds `generations.source_kind` with the fail-closed default
`unclassified` and performs no historical `UPDATE`. Public feed, share, media,
and creator-leaderboard reads allowlist only `source_kind = 'user'`, so legacy
creations are temporarily unavailable publicly until this procedure proves
their source.

Do not add this backfill to `prisma migrate deploy` or an EC2 release hook. Run
it separately after the release is healthy, from an operator host with a fresh
backup and a measured production query plan.

1. Preview aggregate buckets (read-only; no ids, prompts, URLs, or owner data
   are printed):

   ```sh
   PROVENANCE_BACKFILL_DATABASE_URL='postgresql://...' \
     npx tsx scripts/backfill-generation-provenance.ts
   ```

2. On production-size statistics, run `EXPLAIN (ANALYZE, BUFFERS)` for one
   equivalent batch inside a rolled-back transaction. Confirm the planner's
   primary-key joins and protected-link scans keep the batch within the
   operational SLO; if they do not, stop and review a separate measured
   concurrent-index change. Start with 250 rows and at most 20 mutation
   statements:

   ```sh
   PROVENANCE_BACKFILL_DATABASE_URL='postgresql://...' \
   PETCLAW_PROVENANCE_BACKFILL_APPLY=CLASSIFY_SAFE_LEGACY_ROWS_V1 \
   PETCLAW_PROVENANCE_BACKFILL_BATCH_SIZE=250 \
   PETCLAW_PROVENANCE_BACKFILL_MAX_BATCHES=20 \
     npx tsx scripts/backfill-generation-provenance.ts
   ```

3. Observe database load, replication lag, lock waits, and application error
   rate between invocations. The script uses `FOR UPDATE SKIP LOCKED`, a
   two-second lock timeout, a 15-second statement timeout, and a hard maximum of
   1,000 rows per statement. It is resumable because each phase selects only
   rows still marked `unclassified`; JavaScript receives counts, never id lists.

4. Repeat until `linkedDaydream`, `linkedAutonomous`, and `provableUser` are
   zero. `ambiguous` is intentionally not auto-classified. In particular, an
   unlinked, zero-credit, pet-linked legacy video can be an orphan from the old
   daydream worker, so treating every unlinked row as user content would leak
   retained-memory output. Leave ambiguous rows private for manual provenance
   review or deletion.

The safe automatic buckets are deliberately narrow:

- exact `pet_insights.video_generation_id` links become `memory_daydream`;
- exact `pet_autonomous_actions.generation_id` links become
  `agent_autonomous`;
- rows with neither protected link become `user` only when they have an owner
  and independent evidence that the old daydream worker could not have created
  them: positive credits, no pet, or zero duration.

This procedure may leave some historical user videos unavailable. That is the
intentional privacy tradeoff: availability is recoverable after per-row review;
exposure of retained-memory content is not.

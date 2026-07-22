# Production database baseline

`20260717_production.sql` is the full PostgreSQL schema snapshot prepared for
the 2026-07-17 privacy-safe release. It exists because the historical Prisma migration
chain begins by altering tables that were created before migration tracking was
introduced, so replaying `prisma migrate deploy` against an empty database is
not sufficient.

Use `../../../deploy/bootstrap-empty-database.sh` only on a verified empty database.
It applies this baseline in one transaction, records the historical migration
names listed in `20260717_migrations.txt`, and then applies any migrations added
after the snapshot.

Verification performed when generated:

- PostgreSQL 16 empty container
- baseline applied with `ON_ERROR_STOP`
- 54 public application tables created
- required memory-FTS generated column and both indexes reported `ready`

The current Prisma diff still proposes legacy metadata normalization: index
renames plus foreign-key constraint-name changes (and `ON UPDATE CASCADE` to
`NO ACTION` on immutable integer primary keys). Those are not applied during a
release because renaming indexes and dropping/recreating valid foreign keys adds
risk without fixing a runtime data-shape defect. The corrected snapshot has no
remaining missing table, column, generated expression, or required memory-FTS
index.

When the release schema changes, regenerate the dated baseline with
`prisma migrate diff --from-empty --to-schema ... --script` and verify it against
an empty PostgreSQL instance.

The manifest deliberately contains only migrations represented by the dated
snapshot. Later expand-only migrations, including
`20260722030000_daydream_video_claim_provenance`, must remain outside the
manifest so `bootstrap-empty-database.sh` actually applies them with
`prisma migrate deploy`. That provenance migration deliberately performs no
historical data `UPDATE`; legacy rows remain fail-closed as `unclassified`.
Use the measured, resumable procedure in
`backfills/20260722-generation-provenance.md` only after the release transaction
and health checks are complete.

The manifest also resolves `20260615000000_memory_fts`. The snapshot therefore
contains the generated `pet_memories.content_tsv` column plus its GIN and
per-pet recency indexes, and the bootstrap script verifies their catalog state.
If a database created from an older incomplete snapshot fails that guard, stop
the release and follow `../backfills/20260722-memory-fts-repair.md`; never run a
populated-table generated-column backfill inside the release transaction.

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
- `prisma migrate diff` reported no difference from the production datamodel

When the release schema changes, regenerate the dated baseline with
`prisma migrate diff --from-empty --to-schema ... --script` and verify it against
an empty PostgreSQL instance.

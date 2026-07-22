# Memory FTS repair (off-release maintenance only)

`20260615000000_memory_fts` is part of the production baseline manifest. A
database can therefore report every Prisma migration as applied even if an old,
incomplete baseline omitted `pet_memories.content_tsv` or either supporting
index. The corrected baseline contains all three objects, and the release
controller now refuses deployment when any is missing or invalid.

Do not repair a populated table inside `prisma migrate deploy`. Adding a stored
generated column computes a value for every existing row and takes a table
lock; ordinary `CREATE INDEX` can also block production writes. If the release
preflight reports `invalid_column`, `invalid_gin_index`, or
`invalid_compound_index`:

1. Stop the release. Take and verify a fresh signed database backup.
2. Record `SELECT count(*) FROM pet_memories`, table/index sizes, write rate,
   replication lag, and a maintenance-window rollback plan.
   If `content_tsv` already exists with a different type or generation
   expression, do not drop or alter it from this runbook; stop for a separately
   reviewed data-preservation plan.
3. If the generated column is missing, add it during the approved maintenance
   window:

   ```sql
   ALTER TABLE pet_memories
     ADD COLUMN content_tsv tsvector
     GENERATED ALWAYS AS (
       to_tsvector('simple'::regconfig, COALESCE(content, ''::text))
     ) STORED;
   ```

4. After the column is valid, build missing indexes one at a time outside an
   explicit transaction. `CONCURRENTLY` avoids the long write lock but performs
   additional scans and can leave an invalid index after interruption; inspect
   `pg_index.indisvalid` and drop only that exact invalid index before retrying.

   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS pet_memories_content_tsv_idx
     ON pet_memories USING GIN (content_tsv);

   CREATE INDEX CONCURRENTLY IF NOT EXISTS pet_memories_pet_id_created_at_idx
     ON pet_memories (pet_id, created_at DESC);
   ```

5. Run `ANALYZE pet_memories`, repeat the release preflight, and resume only
   when it reports `ready`. Do not mark or resolve another Prisma migration:
   this procedure restores objects that the already-resolved historical
   migration and baseline contract require.

An empty disaster-recovery database must use
`deploy/bootstrap-empty-database.sh`; the corrected snapshot creates the column
and indexes before historical migrations are resolved.

-- Restore the relation declared by UserSubscription.user. The original
-- mission phase migration documented this FK but never created it, leaving
-- subscription rows without database-enforced ownership integrity.
--
-- The production-backup rehearsal verified there are no orphaned rows. If
-- ownership drift ever recurs, PostgreSQL rejects this migration rather than
-- installing a partially enforced relation.
ALTER TABLE "user_subscriptions"
  ADD CONSTRAINT "user_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

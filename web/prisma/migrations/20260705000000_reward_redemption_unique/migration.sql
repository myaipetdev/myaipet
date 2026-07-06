-- One reward claim per user/reward. Keep the earliest row if legacy duplicate
-- claims exist, then enforce the invariant in the database.
DELETE FROM "reward_redemptions" a
 USING "reward_redemptions" b
 WHERE a."user_id" = b."user_id"
   AND a."reward_id" = b."reward_id"
   AND a."id" > b."id";

CREATE UNIQUE INDEX IF NOT EXISTS "reward_redemptions_user_id_reward_id_key"
  ON "reward_redemptions"("user_id", "reward_id");

-- Rename the user points column to match the legal/UX posture ("Season Rewards",
-- not an airdrop). RENAME preserves all existing data; no values are lost.
ALTER TABLE "users" RENAME COLUMN "airdrop_points" TO "season_points";

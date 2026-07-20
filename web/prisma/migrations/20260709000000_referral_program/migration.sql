-- Referral program: one row per successfully-referred new user.
-- referred_id is unique because a user can only ever have been referred once
-- (first ref link they used, first pet they adopt — no retroactive re-linking).
CREATE TABLE "referrals" (
    "id" SERIAL NOT NULL,
    "referrer_id" INTEGER NOT NULL,
    "referred_id" INTEGER NOT NULL,
    "ref_code" VARCHAR(16) NOT NULL,
    "credited" BOOLEAN NOT NULL DEFAULT false,
    "credited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referrals_referred_id_key" ON "referrals"("referred_id");

CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

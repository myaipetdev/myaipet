-- Catch generalized to cats AND dogs. Additive column with a default so existing
-- rows are valid.
ALTER TABLE "caught_cats" ADD COLUMN IF NOT EXISTS "kind" VARCHAR(8) NOT NULL DEFAULT 'cat';

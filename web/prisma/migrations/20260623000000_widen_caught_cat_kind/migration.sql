-- Catch now accepts any real animal (mostly cats/dogs), so kind can be longer
-- than 8 chars (e.g. "squirrel", "hedgehog"). Widening is non-destructive.
ALTER TABLE "caught_cats" ALTER COLUMN "kind" TYPE VARCHAR(16);

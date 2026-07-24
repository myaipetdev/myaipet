-- Explicit privacy state for retained financial receipts. Sentinel display
-- strings are not authoritative because an active owner may legitimately use
-- the same text.
ALTER TABLE "pet_agent_runs"
ADD COLUMN "private_content_scrubbed" BOOLEAN NOT NULL DEFAULT false;

-- Releases before this explicit marker scrubbed terminal rows to these exact
-- sentinels after deleting the Pet row. Backfill only orphaned receipts owned
-- by the same account; a live pet/run may legitimately use identical display
-- text and must remain exportable.
UPDATE "pet_agent_runs" AS r
SET "private_content_scrubbed" = true
WHERE r."state" = 'terminal'
  AND r."pet_name" = 'Deleted Pet'
  AND r."goal" = '[deleted]'
  AND r."answer" = ''
  AND r."steps" = '[]'::jsonb
  AND NOT EXISTS (
    SELECT 1
    FROM "pets" AS p
    WHERE p."id" = r."pet_id"
      AND p."user_id" = r."user_id"
  );

-- Bind every paid run ID to the exact server-side execution/charging contract.
-- Existing runs predate typed Agent Office tasks and therefore remain freeform.
ALTER TABLE "pet_agent_runs"
ADD COLUMN "execution_contract" VARCHAR(120) NOT NULL DEFAULT 'freeform:v1';

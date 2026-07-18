-- Persistent, cluster-safe counters for platform-funded text, vision, and
-- image-generation attempts. Additive only; scope_key separates the budgets.
CREATE TABLE "llm_platform_usage" (
    "usage_date" DATE NOT NULL,
    "scope_key" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_platform_usage_pkey" PRIMARY KEY ("usage_date", "scope_key")
);

CREATE INDEX "llm_platform_usage_usage_date_idx"
  ON "llm_platform_usage"("usage_date");

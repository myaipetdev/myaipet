/**
 * Public Studio catalog — what models exist and what they cost.
 *
 *   GET /api/studio/providers?kind=video&maxTier=pro
 *     → { models: [...], tiers: {...} }
 *
 * Used by the Studio UI to render the picker. Public so the marketing
 * page can show the full catalog too.
 */

import { NextRequest, NextResponse } from "next/server";
import { listModels, TIER_LIMITS } from "@/lib/studio/providers";
import type { ModelKind, ModelTier } from "@/lib/studio/providers";

export async function GET(req: NextRequest) {
  const kindParam = req.nextUrl.searchParams.get("kind") as ModelKind | null;
  const tierParam = req.nextUrl.searchParams.get("maxTier") as ModelTier | null;
  const models = listModels({
    kind: kindParam === "image" || kindParam === "video" ? kindParam : undefined,
    maxTier: tierParam === "free" || tierParam === "pro" || tierParam === "studio" ? tierParam : "studio",
  });
  // Strip backendModel from public response — internal detail
  const safe = models.map(({ backendModel: _, ...rest }) => rest);
  return NextResponse.json({ models: safe, tiers: TIER_LIMITS });
}

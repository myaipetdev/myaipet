/**
 * Pet Studio — provider abstraction.
 *
 * One catalog, multiple backends. Each model entry declares:
 *   - id (stable slug used in API + UI)
 *   - displayName + provider badge
 *   - backend (how we actually call it — `fal` | `grok` | `replicate` later)
 *   - backendModel (the upstream model ID)
 *   - capabilities (image / video / image_ref support)
 *   - duration / resolution caps
 *   - cost: { creditsPerRun, usdPerRun } — credits = what we charge the user;
 *     usdPerRun = our cost (rough), for margin tracking
 *   - tier (free / pro / studio) — minimum subscription required
 *
 * To add a new model: append a row. UI + API auto-pick it up.
 */

export type ModelTier = "free" | "pro" | "studio";
export type ModelKind = "image" | "video";
export type Backend = "fal" | "grok";

export interface StudioModel {
  id: string;
  displayName: string;
  provider: string;             // "Kling" | "Seedance" | "Veo" | "Grok Imagine" etc.
  backend: Backend;
  backendModel: string;         // e.g. "fal-ai/kling-video/v1.6/standard/text-to-video"
  kind: ModelKind;
  supportsImageRef: boolean;    // pet character anchor (use pet.avatar_url as ref)
  maxDurationSec: number;
  maxResolution: string;        // "720p" | "1080p" | "4K"
  tier: ModelTier;
  creditsPerRun: number;        // user-facing cost (retail credit = $0.05; 100 cr = $5 starter pack)
  usdPerRun: number;            // our wholesale cost
  description: string;
  // comingSoon = teaser only. Don't submit to backend; UI shows a lock + ETA.
  // Used for models where our per-run cost approaches or exceeds the price we
  // can credibly charge (Veo 3, Kling Pro, MiniMax) — listing them advertises
  // the roadmap without bleeding money in production.
  comingSoon?: boolean;
  comingSoonEta?: string;       // e.g. "Q3 2026"
}

// ── Catalog ──
// Adjust prices as actual FAL pricing changes. Each new model entry is
// auto-exposed in the Studio picker + /api/studio/providers.
export const MODELS: StudioModel[] = [
  // ── IMAGE (lightweight, free tier OK) ──
  {
    id: "grok-imagine",
    displayName: "Grok Imagine",
    provider: "Grok",
    backend: "grok",
    backendModel: "grok-imagine-image",
    kind: "image",
    supportsImageRef: true,
    maxDurationSec: 0,
    maxResolution: "1024×1024",
    tier: "free",
    creditsPerRun: 5,
    usdPerRun: 0.03,
    description: "Fast pet portraits with reference. Default for free tier.",
  },
  {
    id: "flux-schnell",
    displayName: "FLUX [schnell]",
    provider: "Black Forest Labs",
    backend: "fal",
    backendModel: "fal-ai/flux/schnell",
    kind: "image",
    supportsImageRef: false,
    maxDurationSec: 0,
    maxResolution: "1024×1024",
    tier: "free",
    creditsPerRun: 3,
    usdPerRun: 0.003,
    description: "Sub-second generation. Great for prompt iteration.",
  },
  {
    id: "flux-dev",
    displayName: "FLUX [dev]",
    provider: "Black Forest Labs",
    backend: "fal",
    backendModel: "fal-ai/flux/dev",
    kind: "image",
    supportsImageRef: false,
    maxDurationSec: 0,
    maxResolution: "1024×1024",
    tier: "pro",
    creditsPerRun: 8,
    usdPerRun: 0.025,
    description: "Highest-fidelity FLUX. Pro tier.",
  },
  {
    id: "flux-pulid",
    displayName: "FLUX PuLID (Pet anchor)",
    provider: "Black Forest Labs + PuLID",
    backend: "fal",
    backendModel: "fal-ai/flux-pulid",
    kind: "image",
    supportsImageRef: true,
    maxDurationSec: 0,
    maxResolution: "1024×1024",
    tier: "pro",
    creditsPerRun: 12,
    usdPerRun: 0.05,
    description: "Identity-preserving — locks in YOUR pet's face across scenes.",
  },

  // ── VIDEO (the headline pivot) ──
  {
    id: "kling-1.6-standard",
    displayName: "Kling 1.6 Standard",
    provider: "Kling",
    backend: "fal",
    backendModel: "fal-ai/kling-video/v1.6/standard/text-to-video",
    kind: "video",
    supportsImageRef: false,
    maxDurationSec: 5,
    maxResolution: "720p",
    tier: "pro",
    creditsPerRun: 40,
    usdPerRun: 0.35,
    description: "ByteDance/Kuaishou model. Reliable cinematic motion.",
  },
  {
    id: "seedance-1-lite",
    displayName: "Seedance 1.0 Lite",
    provider: "Seedance",
    backend: "fal",
    backendModel: "fal-ai/bytedance/seedance/v1/lite/text-to-video",
    kind: "video",
    supportsImageRef: true,
    maxDurationSec: 5,
    maxResolution: "720p",
    tier: "pro",
    creditsPerRun: 40,
    usdPerRun: 0.30,
    description: "ByteDance Seedance — fast, expressive character motion.",
  },
  {
    id: "kling-1.6-pro",
    displayName: "Kling 1.6 Pro",
    provider: "Kling",
    backend: "fal",
    backendModel: "fal-ai/kling-video/v1.6/pro/text-to-video",
    kind: "video",
    supportsImageRef: false,
    maxDurationSec: 10,
    maxResolution: "1080p",
    tier: "studio",
    creditsPerRun: 120,
    usdPerRun: 1.20,
    description: "Pro tier of Kling — 10s clips, 1080p.",
    comingSoon: true,
    comingSoonEta: "Q3 2026",
  },
  {
    id: "kling-image-to-video",
    displayName: "Kling Image-to-Video",
    provider: "Kling",
    backend: "fal",
    backendModel: "fal-ai/kling-video/v1.6/standard/image-to-video",
    kind: "video",
    supportsImageRef: true,
    maxDurationSec: 5,
    maxResolution: "720p",
    tier: "pro",
    creditsPerRun: 50,
    usdPerRun: 0.45,
    description: "Use YOUR pet's photo as the first frame. Best identity match.",
  },
  {
    id: "wan-2.1",
    displayName: "Wan 2.1",
    provider: "Wan",
    backend: "fal",
    backendModel: "fal-ai/wan-i2v",
    kind: "video",
    supportsImageRef: true,
    maxDurationSec: 5,
    maxResolution: "480p",
    tier: "pro",
    creditsPerRun: 25,
    usdPerRun: 0.18,
    description: "Open-source alternative. Cheapest pet-anchored video.",
  },
  {
    id: "minimax-hailuo",
    displayName: "MiniMax Hailuo 02",
    provider: "MiniMax",
    backend: "fal",
    backendModel: "fal-ai/minimax/hailuo-02/pro/image-to-video",
    kind: "video",
    supportsImageRef: true,
    maxDurationSec: 6,
    maxResolution: "1080p",
    tier: "studio",
    creditsPerRun: 90,
    usdPerRun: 0.85,
    description: "1080p i2v. Strong physics + camera moves.",
    comingSoon: true,
    comingSoonEta: "Q3 2026",
  },
  {
    id: "veo-3",
    displayName: "Veo 3",
    provider: "Google",
    backend: "fal",
    backendModel: "fal-ai/veo3",
    kind: "video",
    supportsImageRef: false,
    maxDurationSec: 8,
    maxResolution: "1080p",
    tier: "studio",
    // Repriced per docs/ECONOMY.md: real fal Veo-3-with-audio cost is ~$4–6/clip
    // (not the old $2.40), so 250cr ($6.25 at bulk) was break-even-to-negative.
    // 400cr keeps the ≥50% floor (credits ≈ ceil(vendorUSD/0.0125)). Still
    // comingSoon — nothing bleeds today; the guard lands before unlock.
    creditsPerRun: 400,
    usdPerRun: 4.50,
    description: "Premium model. Native audio. Studio tier.",
    comingSoon: true,
    comingSoonEta: "Q4 2026",
  },
  {
    id: "grok-imagine-video",
    displayName: "Grok Imagine Video",
    provider: "Grok",
    backend: "grok",
    backendModel: "grok-imagine-video",
    kind: "video",
    supportsImageRef: true,
    maxDurationSec: 6,
    maxResolution: "720p",
    tier: "free",
    creditsPerRun: 25,
    usdPerRun: 0.15,
    description: "Default video model. Free tier (limited monthly quota).",
  },
];

export function getModel(id: string): StudioModel | undefined {
  return MODELS.find(m => m.id === id);
}

// Emergency catalog switch. Keep false while the FAL-backed roster is enabled;
// setting true marks every non-Grok engine unavailable without changing prices
// or deleting roadmap entries. Individual comingSoon flags remain authoritative.
const GROK_ONLY = false;

export function listModels(opts?: { kind?: ModelKind; maxTier?: ModelTier }): StudioModel[] {
  const tierRank: Record<ModelTier, number> = { free: 0, pro: 1, studio: 2 };
  const maxRank = opts?.maxTier ? tierRank[opts.maxTier] : 2;
  return MODELS
    .filter(m => {
      if (opts?.kind && m.kind !== opts.kind) return false;
      if (tierRank[m.tier] > maxRank) return false;
      return true;
    })
    .map(m =>
      GROK_ONLY && m.backend !== "grok"
        ? { ...m, comingSoon: true, comingSoonEta: m.comingSoonEta }
        : m
    );
}

// ── Tier limits (subscription gates) ──
export interface TierLimits {
  monthlyVideoLimit: number;
  monthlyImageLimit: number;
  maxResolution: string;
  editorAccess: boolean;
  pricePerMonthUsd: number;
}

export const TIER_LIMITS: Record<ModelTier, TierLimits> = {
  free: {
    monthlyVideoLimit: 3,
    monthlyImageLimit: 30,
    maxResolution: "720p",
    editorAccess: false,
    pricePerMonthUsd: 0,
  },
  pro: {
    monthlyVideoLimit: 30,
    monthlyImageLimit: 300,
    maxResolution: "1080p",
    editorAccess: true,
    // Unified with the /api/subscription/me price quote (conversion-first).
    pricePerMonthUsd: 4.99,
  },
  studio: {
    monthlyVideoLimit: 120,
    monthlyImageLimit: 2000,
    maxResolution: "4K",
    editorAccess: true,
    pricePerMonthUsd: 9.99,
  },
};

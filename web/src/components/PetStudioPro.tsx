"use client";

/**
 * Pet Studio — Runway/Pika style single-screen pro video tool.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Studio                       💰 cr · TIER · History         │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  ┌──────────────────────────┐  ┌─────────────────────────┐  │
 *   │  │                          │  │ Pet  [chip][chip]       │  │
 *   │  │                          │  │                         │  │
 *   │  │     16:9 PREVIEW         │  │ Style                   │  │
 *   │  │  (placeholder / live /   │  │ [🎬][✨][📷][🎨][🧸]   │  │
 *   │  │   result video|image)    │  │                         │  │
 *   │  │                          │  │ Engine                  │  │
 *   │  │                          │  │ ┌─────────────────────┐│  │
 *   │  │                          │  │ │ Kling i2v        ▾ ││  │
 *   │  │                          │  │ │ 🎭 PET ANCHOR · 50cr││  │
 *   │  │                          │  │ └─────────────────────┘│  │
 *   │  └──────────────────────────┘  └─────────────────────────┘  │
 *   │                                                              │
 *   │  Prompt + suggestion chips                                  │
 *   │  ▶ Generate                                                 │
 *   │                                                              │
 *   │  Recent: thumb thumb thumb thumb …                          │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Replaces the chat-guided v4 — that flow added friction for what should be
 * a fast iteration tool. Keeps the pro positioning (multi-model, PuLID
 * anchor, audio-capable engines) and the demo-fallback for unauth users.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useAuth } from "@/hooks/useAuth";
import { getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";
import CollectibleFrame from "@/components/editorial/CollectibleFrame";
import { SEASON_SCHEDULED, seasonPhase } from "@/lib/season";
import PetLoraPanel from "@/components/PetLoraPanel";
import StudioEditor, { type EditorSourceClip } from "@/components/StudioEditor";
import useCountUp from "@/hooks/useCountUp";
import { TEMPLATES, type StudioTemplate } from "@/lib/studio/templates";
import { STYLE_EXAMPLES, TEMPLATE_EXAMPLES } from "@/lib/studio/example-assets";
import { TEMPLATE_EXAMPLE_VIDEOS } from "@/lib/studio/example-videos";

interface Pet { id: number; name: string; avatar_url: string | null; species: number; level: number; }
interface StudioModel {
  id: string; displayName: string; provider: string; kind: "image" | "video";
  backend?: "fal" | "grok" | string;  // returned by /api/studio/providers (only backendModel is stripped)
  supportsImageRef: boolean; maxDurationSec: number; maxResolution: string;
  tier: "free" | "pro" | "studio"; creditsPerRun: number; description: string;
  comingSoon?: boolean; comingSoonEta?: string;
}
interface Generation {
  id: number; status: string; prompt: string | null;
  photo_path: string | null; video_path: string | null;
  created_at: string;
  error_message?: string | null;
  credits_charged?: number | null;
}
// One creative decision the Director asks the user to make (phase:"questions").
interface DirectorQuestion {
  id: string; topic: string; question: string;
  options: string[]; default: string; whyItMatters: string;
}

// Item #12: a paid 1–2 min job must survive reload / SPA navigation. We persist
// ONLY the pointer to an already-submitted job (its generationId) so a remount
// can resume polling — never the request itself, so a restore can never
// re-submit or double-charge.
const JOB_STORE_KEY = "studio_active_job";
interface StoredJob { jobId: number; prompt?: string; kind?: "image" | "video"; ts?: number }
function saveActiveJob(job: StoredJob) {
  try { sessionStorage.setItem(JOB_STORE_KEY, JSON.stringify({ ...job, ts: Date.now() })); } catch { /* private mode etc. */ }
}
function readActiveJob(): StoredJob | null {
  try {
    const j = JSON.parse(sessionStorage.getItem(JOB_STORE_KEY) || "null");
    return j && typeof j.jobId === "number" ? j : null;
  } catch { return null; }
}
function clearActiveJob() {
  try { sessionStorage.removeItem(JOB_STORE_KEY); } catch { /* ignore */ }
}

// Server truth (lib/studio/subscription.ts gateModel): models above the user's
// subscription tier are rejected with 403 tier_required — and no membership is
// purchasable yet. Rank mirror so the picker can lock what the server locks.
const TIER_RANK: Record<"free" | "pro" | "studio", number> = { free: 0, pro: 1, studio: 2 };
// Honest one-word quality read per tier, shown as the picker's group subtitle.
const TIER_QUALITY: Record<"free" | "pro" | "studio", string> = {
  free: "Fast · included",
  pro: "Higher fidelity",
  studio: "Flagship",
};


// Collectible Editorial tokens. Studio's interactive accent is terracotta with
// gold-foil selection rings — on-system with the rest of the app. `studioDeep`/
// `studioInk` are the ONLY indigo left: they paint the dark "screening room"
// preview panel (intentional), never buttons or badges.
const T = {
  field: "#ECE4D4", paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", ink70: "#3A3024",
  muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", creamOn: "#FCE9CF", cta1: "#F49B2A", cta2: "#E27D0C",
  // `studio` is the interactive accent — retoned indigo → terracotta so every
  // eyebrow/badge/action reads on-system. Dark preview panel keeps its indigo.
  studio: "#BE4F28", studioDeep: "#3E3470", studioInk: "#191334",
  thrive: "#5C8A4E",
  foil: "#E8C77E", foilDeep: "#C8932F",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};

// 🔥 badge is a scarcity cue — it only means anything on a few cards. Cap it
// at the first 3 trending templates; the rest drop the category flag entirely.
const TRENDING_BADGE_IDS = new Set(
  TEMPLATES.filter(t => t.category === "trending").map(t => t.id).slice(0, 3)
);

// Printed color band for template cards with no captured example art — the
// template's own swatch when it has one, else a category tone from the warm
// editorial palette (never a gray void).
const CATEGORY_BAND: Record<StudioTemplate["category"], string> = {
  trending:    "linear-gradient(90deg,#BE4F28,#E8C77E)",
  celebration: "linear-gradient(90deg,#F49B2A,#E8C77E)",
  everyday:    "linear-gradient(90deg,#5C8A4E,#E8C77E)",
  cinematic:   "linear-gradient(90deg,#211A12,#C8932F)",
  social:      "linear-gradient(90deg,#E27D0C,#BE4F28)",
  fantasy:     "linear-gradient(90deg,#3E3470,#C8932F)",
};

// Style swatches stay inside the warm editorial palette as printed sample chips
// — the style is differentiated by its icon + label, not a rainbow.
const STYLES = [
  { id: "cinematic",      icon: "film-reel", label: "Cinematic",  hint: "Hollywood", swatch: "linear-gradient(135deg,#211A12 0%,#3A3024 55%,#6B4FA0 100%)" },
  { id: "anime",          icon: "sparkling", label: "Anime",      hint: "Japan",     swatch: "linear-gradient(135deg,#FBF6EC 0%,#9E72E8 100%)" },
  { id: "photorealistic", icon: "compass",   label: "Photoreal",  hint: "Real",      swatch: "linear-gradient(135deg,#E7DDCC 0%,#7A6E5A 100%)" },
  { id: "watercolor",     icon: "water2",    label: "Watercolor", hint: "Soft",      swatch: "linear-gradient(135deg,#FAF7F2 0%,#D7C7F0 55%,#9E72E8 100%)" },
  { id: "pixar",          icon: "bear",      label: "3D Toon",    hint: "Toon",      swatch: "linear-gradient(135deg,#9E72E8 0%,#E7DCF6 100%)" },
  { id: "pixel",          icon: "joystick",  label: "Pixel",      hint: "Retro",     swatch: "linear-gradient(135deg,#3A3024 0%,#6B4FA0 100%)" },
];

const PROMPT_IDEAS = [
  "running through cherry blossom petals",
  "wearing a tiny astronaut helmet",
  "dancing on a sunset beach",
  "surfing a giant wave",
  "sleeping on a fluffy cloud",
  "in a cozy autumn cafe",
  "dressed as a detective",
  "flying through a rainbow",
];

// Personality/element-aware prompt starters, so the suggestion chips feel like
// they're "about" the selected pet rather than generic. Falls back to the
// generic ideas above for unknown traits.
const PERSONALITY_PROMPTS: Record<string, string[]> = {
  playful:     ["chasing soap bubbles in a sunlit park", "bouncing through a colorful ball pit"],
  brave:       ["standing heroically on a windswept cliff at dawn", "leading a daring mountain expedition"],
  gentle:      ["napping in a meadow of wildflowers", "wrapped in a cozy blanket by a crackling fire"],
  friendly:    ["sharing a picnic with woodland friends", "waving hello from a flower cart"],
  shy:         ["peeking out from behind autumn leaves", "curled up in a quiet library nook"],
  lazy:        ["lounging in a hammock under palm trees", "sprawled across a warm sunbeam"],
  curious:     ["exploring a glowing crystal cave", "studying a vintage map with a magnifying glass"],
  mischievous: ["sneaking a cookie from the jar", "plotting something with a sly little grin"],
  adventurous: ["sailing a tiny ship across stormy seas", "trekking through an overgrown jungle temple"],
  dramatic:    ["posing under a single spotlight on stage", "cape swirling on a stormy rooftop"],
  wise:        ["meditating atop a misty mountain shrine", "reading ancient scrolls by candlelight"],
  sassy:       ["strutting down a neon fashion runway", "throwing shade in tiny sunglasses"],
};
const ELEMENT_PROMPTS: Record<string, string> = {
  fire:     "wreathed in glowing embers at dusk",
  water:    "splashing through a crystal-clear lagoon",
  grass:    "frolicking in a field of fresh clover",
  electric: "crackling with neon lightning energy",
  ice:      "gliding across a shimmering frozen lake",
  psychic:  "surrounded by softly floating glowing orbs",
  dark:     "cloaked in moonlit shadow and starlight",
  light:    "radiating a warm golden halo",
};
function promptIdeasFor(pet: any): string[] {
  const ideas: string[] = [];
  const pt = pet?.personality_type;
  const el = pet?.element;
  if (pt && PERSONALITY_PROMPTS[pt]) ideas.push(...PERSONALITY_PROMPTS[pt]);
  if (el && ELEMENT_PROMPTS[el]) ideas.push(ELEMENT_PROMPTS[el]);
  for (const g of PROMPT_IDEAS) { if (ideas.length >= 6) break; if (!ideas.includes(g)) ideas.push(g); }
  return ideas.slice(0, 6);
}

// Unauthenticated demo subject = the MY AI PET mascot, so the try-before-signup
// experience is on-brand (a real pet portrait, not a placeholder).
const DEMO_PET: Pet = { id: -1, name: "Dordor", avatar_url: "/mascot.jpg", species: 0, level: 5 };

type View = "idle" | "generating" | "done" | "error";

export default function PetStudioPro({ onCreditsChange }: { onCreditsChange?: (c: number | null) => void } = {}) {
  // In-place sign-in: open the app's wallet/SIWE connect modal without leaving
  // Studio (the header pill / demo prompts used to navigate to "/" and dump the
  // user off the page, losing all Studio state). The /studio route has no
  // WalletGate, so we also drive the SIWE signature + workspace reload here.
  const { openConnectModal } = useConnectModal();
  const { isConnected, address } = useAccount();
  const { isAuthenticated, isAuthenticating, authenticate, error: authError } = useAuth();
  // Sign-in must never be a dead button. RainbowKit's openConnectModal is
  // UNDEFINED while a wallet is already connected — so for a connected user
  // with no app session (SIWE signature rejected, or session expired) the old
  // `openConnectModal?.()` was a silent no-op. In that state, re-trigger the
  // SIWE signature directly; `signInFlow` gates the visible progress/failure
  // feedback so it only shows for user-initiated sign-ins.
  const [signInFlow, setSignInFlow] = useState(false);
  const openSignIn = () => {
    setSignInFlow(true);
    if (isConnected && address) {
      // Connected wallet, but the user is looking at a Sign-in control — the
      // session is missing, expired, or stale. Re-run the SIWE signature and
      // reload the workspace on completion: a stale token can keep
      // `isAuthenticated` true throughout, so the auth-flip reload effect
      // below would never fire for this path.
      void authenticate().then(() => loadWorkspace());
    } else {
      openConnectModal?.();
    }
  };
  useEffect(() => { if (isAuthenticated && !isAuthenticating && !authError) setSignInFlow(false); }, [isAuthenticated, isAuthenticating, authError]);

  const [pets, setPets] = useState<Pet[] | null>(null);
  const [petId, setPetId] = useState<number | null>(null);
  const [models, setModels] = useState<StudioModel[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [history, setHistory] = useState<Generation[]>([]);
  // User's real subscription tier (server-enforced). Defaults to "free" — the
  // honest fail-safe: everything the server would 403 stays locked in the UI.
  const [userTier, setUserTier] = useState<"free" | "pro" | "studio">("free");

  const [styleId, setStyleId] = useState<string>("cinematic");
  const [prompt, setPrompt] = useState("");
  // Director — expands a rough one-line idea into a full cinematic video prompt.
  // Interactive: "Direct it" first asks a sheet of creative questions
  // (phase:"questions"), then compiles the answers into the final prompt
  // (phase:"final").
  const [directorIdea, setDirectorIdea] = useState("");
  const [directorBusy, setDirectorBusy] = useState(false);       // questions phase in flight
  const [directorError, setDirectorError] = useState<string | null>(null);
  // The Director endpoint is auth-only (401 for guests) and has no demo
  // fallback like Generate does — so a signed-out click surfaces a sign-in
  // prompt instead of a silent/generic failure.
  const [directorNeedsAuth, setDirectorNeedsAuth] = useState(false);
  const [directorQuestions, setDirectorQuestions] = useState<DirectorQuestion[] | null>(null);
  // Per-question state: the picked option + a free-text override. Effective
  // answer = override.trim() || option (see effectiveAnswer below).
  const [directorAnswers, setDirectorAnswers] = useState<Record<string, { option: string; override: string }>>({});
  const [directorFinalBusy, setDirectorFinalBusy] = useState(false); // final phase in flight
  const [directorSheetError, setDirectorSheetError] = useState<string | null>(null);
  // Output type drives the default model + which models we surface.
  // Image-first by default: best margin (~10×) and instant feedback.
  const [outputKind, setOutputKind] = useState<"image" | "video">("image");
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  // Default to the free-tier Grok engines. The provider response remains the
  // source of truth for every additional engine's price and availability.
  const [chosenModelId, setChosenModelId] = useState<string>("grok-imagine");
  const [modelOpen, setModelOpen] = useState(false);
  // Memory seeds — the pet's daydream insights, offered as prompt starters so
  // a generation can be grounded in something the pet actually "remembers"
  // about the owner. The Memory→Video bridge.
  const [memorySeeds, setMemorySeeds] = useState<string[]>([]);

  const [view, setView] = useState<View>("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [avatarSaved, setAvatarSaved] = useState(false);
  // Inline failure flash when the avatar/card-art PATCH is rejected (401/403/4xx/
  // 5xx) — a click that fails must never be a silent no-op.
  const [avatarError, setAvatarError] = useState(false);
  const [resultIsDemo, setResultIsDemo] = useState(false);
  // generationId of the current result — powers the public Share link (/c/<id>).
  const [lastGenId, setLastGenId] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareBusyId, setShareBusyId] = useState<number | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  // ×N variations of the current image result. Each entry keeps its OWN
  // generationId so sharing a variation shares that exact artwork (item #11).
  const [variations, setVariations] = useState<{ url: string; genId: number }[]>([]);
  const [varRunning, setVarRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The last error came from a 402 — offer the purchase path, not just "retry".
  const [errorIs402, setErrorIs402] = useState(false);
  // Real upstream progress (0..1) from the poll route when the provider reports
  // it; null → the UI falls back to a clearly-labeled time estimate (item #25).
  const [genProgress, setGenProgress] = useState<number | null>(null);
  // Studio-Pro V1: the client-side reel editor (opens over the workspace, no
  // route change). Gated on having ≥1 real generated clip to import.
  const [editorOpen, setEditorOpen] = useState(false);
  // "View all" history gallery overlay (item #19).
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [gallery, setGallery] = useState<Generation[] | null>(null);
  const [galleryCopiedId, setGalleryCopiedId] = useState<number | null>(null);
  const [galleryAvatarId, setGalleryAvatarId] = useState<number | null>(null);
  // Gallery-row counterpart of avatarError — flashes on the row whose set-avatar failed.
  const [galleryAvatarErrId, setGalleryAvatarErrId] = useState<number | null>(null);
  // Terracotta flash when the balance drops (item #20).
  const [creditFlash, setCreditFlash] = useState(false);
  const prevCreditsRef = useRef<number | null>(null);
  // Gold-foil highlight on the template card whose scene is currently loaded.
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  // Season Rewards actually granted by the server for the current result
  // (pointsAwarded from the generate/poll response). null = server didn't
  // report (nothing is shown) — we never fabricate a grant client-side.
  const [lastPointsAwarded, setLastPointsAwarded] = useState<number | null>(null);

  // Single write-path for the balance so the host page (StudioWithNav → Nav)
  // stays in sync with every spend (item #20-6).
  const updateCredits = (c: number | null) => {
    setCredits(c);
    onCreditsChange?.(c);
  };

  // Generations are private by default. Sharing is an explicit server-side
  // publication action before any public link is copied.
  const publishAndCopy = async (generationId: number): Promise<boolean> => {
    if (!window.confirm("Publish this creation and its prompt publicly? It can appear in Community and anyone with the link can view it.")) {
      return false;
    }
    setShareBusyId(generationId);
    setShareError(null);
    try {
      const response = await fetch(`/api/social/publish/${generationId}`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not publish this creation");
      const link = typeof body.url === "string"
        ? body.url
        : `${window.location.origin}/c/${generationId}`;
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        window.open(link, "_blank", "noreferrer");
      }
      return true;
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Could not publish this creation");
      return false;
    } finally {
      setShareBusyId(null);
    }
  };

  const creditAnim = useCountUp(credits ?? 0, 500);
  useEffect(() => {
    const prev = prevCreditsRef.current;
    prevCreditsRef.current = credits;
    if (prev != null && credits != null && credits < prev) {
      setCreditFlash(true);
      const t = setTimeout(() => setCreditFlash(false), 600);
      return () => clearTimeout(t);
    }
  }, [credits]);

  const modelMenuRef = useRef<HTMLDivElement>(null);
  // Focus target for the "START HERE" guidance bar (empty-prompt state) —
  // clicking it jumps the user straight into the prompt box.
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const pet = pets?.find(p => p.id === petId) || null;
  // An un-renamed pet still carries its species default name ("Cat", "Dog"…),
  // which reads as a hardcoded placeholder in the header — fall back to a
  // neutral phrase until the owner gives it a real name.
  const SPECIES_DEFAULT_NAMES = ["Cat", "Dog", "Parrot", "Turtle", "Hamster", "Rabbit", "Fox", "Pomeranian"];
  const petDisplayName = pet?.name && !SPECIES_DEFAULT_NAMES.includes(pet.name) ? pet.name : "your pet";

  // Season status label for the mission strip — NEVER a date or countdown
  // while SEASON_SCHEDULED is false (an unscheduled season has no real dates).
  const seasonChipLabel = (() => {
    if (!SEASON_SCHEDULED) return "SEASON 1 · STARTING SOON";
    const p = seasonPhase();
    return p === "live" ? "SEASON 1 · LIVE" : p === "ended" ? "SEASON 1 · ENDED" : "SEASON 1 · SCHEDULED";
  })();

  // One-tap starting points: build a full scene prompt from the pet's context
  // and flip to video (where templates shine). User can still edit after.
  const applyTemplate = (t: StudioTemplate) => {
    const p = pet as any;
    const ctx = {
      name: pet?.name || "your pet",
      species: p?.personality_modifiers?.species_name || undefined,
      personalityType: p?.personality_type || undefined,
      appearanceDesc: p?.appearance_desc || undefined,
      avatarUrl: pet?.avatar_url || undefined,
    };
    setPrompt(t.buildPrompt(ctx));
    setActiveTemplateId(t.id);
    setOutputKind("video");
    setStyleId("cinematic");
    if (t.aspect) setAspect(t.aspect);
    // Prefer the template's engine (e.g. image-to-video keeps the pet's exact
    // likeness — "just swap the character") when it's available + unlocked. The
    // outputKind effect leaves a valid same-kind model untouched.
    const sm = models.find((m) => m.id === t.suggestedModelId);
    if (sm && !sm.comingSoon && !tierLocked(sm)) setChosenModelId(sm.id);
  };

  const chosenModel = models.find(m => m.id === chosenModelId);
  // Models filtered by the current output type (image vs video)
  const visibleModels = useMemo(
    () => models.filter(m => m.kind === outputKind),
    [models, outputKind]
  );

  // D3: the server 403s any model above the user's subscription tier and no
  // membership is on sale yet — so those engines are locked in the picker,
  // never dangled as selectable.
  const tierLocked = (m: StudioModel) => TIER_RANK[m.tier] > TIER_RANK[userTier];

  // Real generated media the editor can import: the current result + every
  // completed History row that has a file. Deduped by URL, current result first.
  const editorClips: EditorSourceClip[] = useMemo(() => {
    const out: EditorSourceClip[] = [];
    const seen = new Set<string>();
    const push = (url: string | null | undefined, kind: "video" | "image", id: string, label?: string) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      out.push({ id, url, kind, label });
    };
    if (view === "done" && resultUrl && resultUrl !== "__demo__") {
      push(resultUrl, /\.(mp4|webm)$/i.test(resultUrl) ? "video" : "image", `cur-${lastGenId ?? "0"}`, "Latest");
    }
    for (const g of history) {
      if (g.video_path && /\.(mp4|webm)$/i.test(g.video_path)) push(g.video_path, "video", `g${g.id}`, g.prompt || undefined);
      else if (g.photo_path) push(g.photo_path, "image", `g${g.id}`, g.prompt || undefined);
    }
    return out;
  }, [view, resultUrl, lastGenId, history]);
  const canOpenEditor = !isDemo && editorClips.length > 0;

  // Fetch the selected pet's daydream insights as Memory→Video seeds.
  useEffect(() => {
    if (!petId || petId < 0) { setMemorySeeds([]); return; }
    let cancelled = false;
    fetch(`/api/pets/${petId}/daydream`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.insights) return;
        setMemorySeeds(d.insights.map((i: any) => i.insight).filter(Boolean).slice(0, 3));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [petId]);

  // If user flips output kind and the current model is wrong-kind (or sits
  // behind the membership tier gate), snap to a good default for the new kind.
  useEffect(() => {
    const current = models.find(m => m.id === chosenModelId);
    if (!current) return;
    if (current.kind !== outputKind || tierLocked(current)) {
      const defaultId = outputKind === "image" ? "grok-imagine" : "grok-imagine-video";
      const exists = models.find(m => m.id === defaultId && !m.comingSoon && !tierLocked(m));
      if (exists) setChosenModelId(defaultId);
      else {
        // Fall back to the first generatable model in the new kind
        const first = models.find(m => m.kind === outputKind && !m.comingSoon && !tierLocked(m));
        if (first) setChosenModelId(first.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputKind, models, chosenModelId, userTier]);

  // ── Load pets + credits + history + tier. Re-runnable so a mid-session
  // sign-in (via the in-place connect modal) swaps the demo pet for the user's
  // real pets without a full page reload. ──
  const loadWorkspace = () => {
    (async () => {
      try {
        const r = await fetch("/api/pets", { headers: getAuthHeaders() });
        if (r.ok) {
          const d = await r.json();
          const list: Pet[] = (d?.pets || []).map((p: any) => ({
            id: p.id, name: p.name, avatar_url: p.avatar_url, species: p.species, level: p.level,
          }));
          if (list.length) {
            setPets(list); setPetId(list[0].id); setIsDemo(false);
            return;
          }
        }
        setPets([DEMO_PET]); setPetId(DEMO_PET.id); setIsDemo(true);
      } catch {
        setPets([DEMO_PET]); setPetId(DEMO_PET.id); setIsDemo(true);
      }
    })();

    // Authed-only reads: a signed-out guest has no token, so skip these on
    // mount rather than firing a guaranteed-401 before the user has interacted.
    if (!getAuthHeaders().Authorization) return;

    fetch("/api/studio/generate", { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.credits != null) updateCredits(d.credits);
        if (Array.isArray(d?.generations)) setHistory(d.generations.slice(0, 12));
      })
      .catch(() => {});

    // D3: read the real subscription tier so the picker locks exactly what the
    // server's gateModel would 403. Failure keeps the fail-safe "free".
    fetch("/api/studio/subscription", { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.tier === "pro" || d?.tier === "studio") setUserTier(d.tier); })
      .catch(() => {});
  };

  // Providers list is public — fetch once regardless of auth. Also loads the
  // workspace on first mount.
  useEffect(() => {
    fetch("/api/studio/providers")
      .then(r => r.ok ? r.json() : null)
      .then(d => setModels(d?.models || []))
      .catch(() => {});
    loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll-overlap fix: the global Nav is FIXED and grows taller when its
  // items wrap (~85px at ≤1240px viewports vs the 60px this page used to
  // assume) — so the header + sticky rails were sliding UNDER the nav while
  // scrolling. Measure the real nav height and drive every clearance
  // (root padding, sticky offsets) off the --studio-nav-h CSS var.
  useEffect(() => {
    const nav = document.querySelector("nav");
    if (!nav) return;
    const sync = () => {
      document.documentElement.style.setProperty(
        "--studio-nav-h",
        `${Math.ceil(nav.getBoundingClientRect().height)}px`,
      );
    };
    sync();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(nav);
    window.addEventListener("resize", sync);
    return () => { ro?.disconnect(); window.removeEventListener("resize", sync); };
  }, []);

  // In-place sign-in flow (no WalletGate on /studio): once a wallet connects,
  // prompt the SIWE signature exactly once per address. Mirrors WalletGate.
  const autoAuthRef = useRef<string | null>(null);
  useEffect(() => {
    if (isConnected && address && !isAuthenticated && !isAuthenticating && autoAuthRef.current !== address) {
      autoAuthRef.current = address;
      authenticate();
    }
    if (!isConnected) autoAuthRef.current = null;
  }, [isConnected, address, isAuthenticated, isAuthenticating, authenticate]);

  // When auth flips true mid-session, reload so the demo pet is replaced by the
  // user's real pets/credits/history. Skips the initial mount (loadWorkspace
  // already ran above) via a first-run guard.
  const authReloadRef = useRef(false);
  useEffect(() => {
    if (!authReloadRef.current) { authReloadRef.current = true; return; }
    if (isAuthenticated) loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // "Make one like this" handoff (Community → Studio): read the stashed prompt
  // once on mount, then clear it so a refresh doesn't re-apply it.
  // (Same key/shape as PetGenerate's studio_prefill reader.)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("studio_prefill");
      if (raw) {
        const seed = JSON.parse(raw);
        if (seed?.prompt) setPrompt(String(seed.prompt));
        if (seed?.genType === "image" || seed?.genType === "video") setOutputKind(seed.genType);
        sessionStorage.removeItem("studio_prefill");
      }
    } catch {}
  }, []);

  // Item #12(1): while any history row is still in flight, re-poll history on
  // an 8s interval so pending tiles resolve instead of pulsing forever.
  const hasPendingHistory = history.some(g => g.status === "pending" || g.status === "running");
  useEffect(() => {
    if (!hasPendingHistory) return;
    const t = setInterval(() => refreshHistory(), 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPendingHistory]);

  // ── Click outside model menu ──
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModelOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [modelOpen]);

  // Esc closes the Director question sheet (unless a final compile is running).
  useEffect(() => {
    if (!directorQuestions) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !directorFinalBusy) { setDirectorQuestions(null); setDirectorSheetError(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [directorQuestions, directorFinalBusy]);

  useEffect(() => {
    if (!galleryOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setGalleryOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [galleryOpen]);

  const buildFullPrompt = (): string => {
    const base = prompt.trim();
    if (!base) return "";
    const style = STYLES.find(s => s.id === styleId);
    const styleSuffix = style ? `, ${style.label.toLowerCase()} style` : "";
    const subject = pet?.name ? `${pet.name} ` : "";
    // Avoid double-prefixing if user already named the pet
    const hasName = pet?.name && base.toLowerCase().startsWith(pet.name.toLowerCase());
    return hasName ? `${base}${styleSuffix}` : `${subject}${base}${styleSuffix}`;
  };

  const canGenerate = !!pet && !!chosenModel && prompt.trim().length > 0 && view !== "generating";

  // Director phase 1 — POST the rough one-line idea, get back a sheet of
  // creative decisions (mood, lighting, palette, camera, audio, ending, forbid…)
  // and open the question sheet with each default pre-selected.
  const directIt = async () => {
    const idea = directorIdea.trim();
    if (!idea || directorBusy) return;
    // Guests have no session: the Director endpoint 401s and there's no demo
    // fallback, so prompt sign-in instead of firing a POST we know will fail.
    if (isDemo) { setDirectorNeedsAuth(true); setDirectorError(null); return; }
    setDirectorBusy(true);
    setDirectorError(null);
    setDirectorNeedsAuth(false);
    try {
      const r = await fetch("/api/studio/prompt-director", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          phase: "questions",
          idea,
          petId: pet && pet.id > 0 ? pet.id : undefined,
          aspect,
          durationSec: 12,
        }),
      });
      // Session expired / not signed in mid-session — surface the sign-in path,
      // not a generic error.
      if (r.status === 401 || r.status === 403) { setDirectorNeedsAuth(true); return; }
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(data?.questions) || data.questions.length === 0) {
        setDirectorError(data?.error || "Couldn't reach the Director. Try again.");
        return;
      }
      const qs: DirectorQuestion[] = data.questions;
      // Seed each answer with the model's recommended default.
      const seed: Record<string, { option: string; override: string }> = {};
      for (const q of qs) seed[q.id] = { option: q.default || q.options[0] || "", override: "" };
      setDirectorQuestions(qs);
      setDirectorAnswers(seed);
      setDirectorSheetError(null);
    } catch {
      setDirectorError("Network error. Try again.");
    } finally {
      setDirectorBusy(false);
    }
  };

  const closeDirectorSheet = () => {
    setDirectorQuestions(null);
    setDirectorSheetError(null);
  };

  // The answer we'll actually send for a question: a free-text override wins,
  // otherwise the picked option pill.
  const effectiveAnswer = (id: string): string => {
    const a = directorAnswers[id];
    if (!a) return "";
    return a.override.trim() || a.option;
  };

  // Director phase 2 — compile the answers into the ultra-detailed prompt.
  // `decideEverything` skips the user's picks entirely and lets the LLM decide
  // every craft decision (the "Ask me nothing" path).
  const runDirectorFinal = async (decideEverything = false) => {
    const idea = directorIdea.trim();
    if (!idea || directorFinalBusy) return;
    setDirectorFinalBusy(true);
    setDirectorSheetError(null);
    try {
      const answers = decideEverything || !directorQuestions
        ? []
        : directorQuestions
            .map((q) => ({ id: q.id, answer: effectiveAnswer(q.id) }))
            .filter((a) => a.answer.trim().length > 0);
      const r = await fetch("/api/studio/prompt-director", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          phase: "final",
          idea,
          petId: pet && pet.id > 0 ? pet.id : undefined,
          aspect,
          durationSec: 12,
          answers,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.prompt) {
        setDirectorSheetError(data?.error || "Couldn't compile the prompt. Try again.");
        return;
      }
      setPrompt(String(data.prompt));
      // The Director writes VIDEO prompts — nudge the output to video so the
      // detailed shot list actually gets used (the outputKind effect snaps the
      // engine to a valid video model).
      setOutputKind("video");
      closeDirectorSheet();
      // Bring the now-filled prompt into view for editing.
      promptRef.current?.focus();
    } catch {
      setDirectorSheetError("Network error. Try again.");
    } finally {
      setDirectorFinalBusy(false);
    }
  };

  // Item #8: out-of-credits is a purchase moment, not a dead end.
  const runCost = chosenModel?.creditsPerRun ?? null;
  const insufficient = !isDemo && credits != null && runCost != null && credits < runCost;
  // Season Rewards the server ACTUALLY pays per completed run — mirrors
  // awardPointsCapped("studio_gen", kind==="video" ? 20 : 10, DAILY_POINT_CAPS.
  // studio_gen) in /api/studio/generate (immediate path) and its poll route
  // (queued path). Change those routes first if these numbers ever move.
  const runReward = chosenModel?.kind === "video" ? 20 : 10;
  const STUDIO_PTS_DAILY_CAP = 120; // mirrors DAILY_POINT_CAPS.studio_gen

  // Per-generation sentinel + mount guard. Every async write in generate()
  // checks it's still the active job AND still mounted before applying, so
  // switching pet/model/output mid-flight (or navigating away) can't let a
  // stale poll stomp the preview/credits or setState after unmount.
  const jobSeqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Shared poll loop (generate + reload-restore). Only GETs an EXISTING
  // generationId — polling can never re-submit or re-charge. Captures the real
  // upstream progress for the preview when the provider reports one.
  const pollJob = async (
    jobId: number,
    kind: "image" | "video",
    isActive: () => boolean,
  ): Promise<{ status: "completed"; url: string; pointsAwarded?: number } | { status: "failed"; error: string } | { status: "timeout" } | null> => {
    // Grok video can run past the stated "~30–90s"; poll longer for video so a
    // slow-but-valid job isn't surfaced as a timeout failure while it actually
    // finishes (and lands in History). Image stays at 180s — plenty.
    const maxPolls = kind === "video" ? 120 : 60; // ×3s = 360s / 180s
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 3000));
      if (!isActive()) return null; // pet/model switched or unmounted — stop polling
      const r2 = await fetch(`/api/studio/generate/${jobId}`, { headers: getAuthHeaders() }).catch(() => null);
      if (!r2?.ok) continue;
      let d2: any;
      try { d2 = await r2.json(); } catch { continue; } // tolerate one bad body, keep polling
      if (!isActive()) return null;
      if (typeof d2.progress === "number") setGenProgress(d2.progress);
      if (d2.status === "completed") return { status: "completed", url: d2.url, pointsAwarded: typeof d2.pointsAwarded === "number" ? d2.pointsAwarded : undefined };
      if (d2.status === "failed")    return { status: "failed", error: d2.error || "Generation failed" };
    }
    return { status: "timeout" };
  };

  const generate = async () => {
    if (!canGenerate || !pet) return;
    const myJob = ++jobSeqRef.current;
    const isActive = () => jobSeqRef.current === myJob && mountedRef.current;
    // Snapshot the submitted model so the loop never reads later-changed state.
    const submittedModel = chosenModel;
    const submittedModelId = chosenModelId;
    const submittedKind: "image" | "video" = submittedModel?.kind === "video" ? "video" : "image";
    const finalPrompt = buildFullPrompt();

    setView("generating");
    setError(null);
    setErrorIs402(false);
    setGenProgress(null);
    setResultUrl(null);
    setResultIsDemo(false);
    setLastGenId(null);
    setLastPointsAwarded(null);
    setVariations([]);
    setVarRunning(false);

    try {
      if (isDemo) {
        await new Promise(r => setTimeout(r, 1800));
        if (!isActive()) return;
        setResultUrl("__demo__");
        setResultIsDemo(true);
        setView("done");
        return;
      }

      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ modelId: submittedModelId, petId: pet.id, prompt: finalPrompt, aspect }),
      });
      const data = await res.json().catch(() => ({}));
      if (!isActive()) return;
      if (!res.ok) {
        if (res.status === 402) setErrorIs402(true);
        setError(data?.error || "Generation failed");
        setView("error");
        return;
      }
      // Only when a number, so an out-of-order response can't stomp a newer
      // (lower) balance with a stale (higher) one.
      if (typeof data.creditsRemaining === "number") updateCredits(data.creditsRemaining);

      if (typeof data.generationId === "number") setLastGenId(data.generationId);

      if (data.status === "completed" && data.url) {
        if (typeof data.pointsAwarded === "number") setLastPointsAwarded(data.pointsAwarded);
        setResultUrl(data.url); setView("done"); refreshHistory(); return;
      }

      const jobId = data.generationId;
      // Persist the pointer so a reload/section-switch can resume THIS job.
      if (typeof jobId === "number") saveActiveJob({ jobId, prompt: finalPrompt, kind: submittedKind });
      const out = await pollJob(jobId, submittedKind, isActive);
      if (!out) return; // superseded/unmounted — entry stays stored for restore
      if (out.status === "completed") {
        clearActiveJob();
        if (typeof out.pointsAwarded === "number") setLastPointsAwarded(out.pointsAwarded);
        setResultUrl(out.url); setView("done"); refreshHistory(); return;
      }
      if (out.status === "failed") {
        clearActiveJob();
        setError(out.error); setView("error"); return;
      }
      setError("Timed out waiting for result. Check History.");
      setView("error");
    } catch (e: any) {
      if (!isActive()) return;
      setError(e?.message || "Generation failed"); setView("error");
    }
  };

  // Item #12(2): on mount, if a stored job is still pending, restore the
  // generating state and resume polling the SAME generationId (re-poll only —
  // never re-submits, never double-charges).
  useEffect(() => {
    const stored = readActiveJob();
    if (!stored) return;
    // Entries older than 30 min are stale — history polling owns them now.
    if (stored.ts && Date.now() - stored.ts > 30 * 60_000) { clearActiveJob(); return; }
    const myJob = ++jobSeqRef.current;
    const isActive = () => jobSeqRef.current === myJob && mountedRef.current;
    const kind: "image" | "video" = stored.kind === "video" ? "video" : "image";
    if (stored.prompt) { const p = stored.prompt; setPrompt(prev => prev || p); }
    setOutputKind(kind);
    setGenProgress(null);
    setError(null);
    setErrorIs402(false);
    setLastGenId(stored.jobId);
    setView("generating");
    (async () => {
      // Immediate pre-check: an already-finished job restores instantly, and a
      // job we can no longer see (signed out / not ours / gone) drops back to
      // idle instead of spinning through a doomed poll loop.
      const r0 = await fetch(`/api/studio/generate/${stored.jobId}`, { headers: getAuthHeaders() }).catch(() => null);
      if (!isActive()) return;
      if (r0 && [401, 403, 404].includes(r0.status)) {
        clearActiveJob();
        setView("idle");
        setLastGenId(null);
        return;
      }
      if (r0?.ok) {
        const d0: any = await r0.json().catch(() => null);
        if (!isActive()) return;
        if (d0?.status === "completed" && d0.url) {
          clearActiveJob();
          setResultUrl(d0.url); setView("done"); refreshHistory(); return;
        }
        if (d0?.status === "failed") {
          clearActiveJob();
          setError(d0.error || "Generation failed"); setView("error"); return;
        }
        if (typeof d0?.progress === "number") setGenProgress(d0.progress);
      }
      const out = await pollJob(stored.jobId, kind, isActive);
      if (!out) return;
      if (out.status === "completed") {
        clearActiveJob();
        if (typeof out.pointsAwarded === "number") setLastPointsAwarded(out.pointsAwarded);
        setResultUrl(out.url); setView("done"); refreshHistory(); return;
      }
      if (out.status === "failed") {
        clearActiveJob();
        setError(out.error); setView("error"); return;
      }
      setError("Timed out waiting for result. Check History.");
      setView("error");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshHistory = () => {
    fetch("/api/studio/generate", { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (Array.isArray(d?.generations)) setHistory(d.generations.slice(0, 12));
      })
      .catch(() => {});
  };

  const reusePrompt = (g: Generation) => {
    if (g.prompt) setPrompt(g.prompt);
    if (g.video_path || g.photo_path) {
      setResultUrl(g.video_path || g.photo_path);
      setResultIsDemo(false);
      setError(null);
      setErrorIs402(false);
      setVariations([]);
      // An old creation reopened from History earned its points when it was
      // made — never re-show a stale "+pts recorded" chip on it.
      setLastPointsAwarded(null);
      // g.id IS the generationId — without this, Share silently vanishes for
      // anything reopened from the Recent strip (item #11-3).
      setLastGenId(g.id);
      setView("done");
    }
  };

  // Set an image as the pet's avatar — which is ALSO the art the TCG card
  // renders from (lib/tcg/card.ts reads pet.avatar_url). Shared by the result
  // actions and the gallery overlay.
  const setImageAsAvatar = async (url: string): Promise<boolean> => {
    if (!pet || pet.id < 0) return false;
    // PATCH accepts only an absolute, scheme-valid URL (safeUrlOrEmpty rejects
    // bare /uploads paths), so resolve relative results first.
    const abs = /^https?:\/\//i.test(url)
      ? url
      : `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
    try {
      const res = await fetch(`/api/pets/${pet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ avatar_url: abs }),
      });
      if (res.ok) {
        setPets(ps => (ps ? ps.map(p => (p.id === pet.id ? { ...p, avatar_url: abs } : p)) : ps));
        return true;
      }
    } catch { /* non-blocking */ }
    return false;
  };

  // Item #19: full-history gallery from the existing endpoint (up to 50 rows,
  // failed runs included with their real error_message).
  const openGallery = () => {
    setGalleryOpen(true);
    setGallery(null);
    fetch("/api/studio/generate?limit=50", { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setGallery(Array.isArray(d?.generations) ? d.generations : []))
      .catch(() => setGallery([]));
  };

  // Remix: keep the subject/prompt, jump to a fresh style, and return to compose
  // so one tap turns a finished result into a new variation (drives another gen).
  const remix = (promptOverride?: string) => {
    if (promptOverride) setPrompt(promptOverride);
    setStyleId(prev => {
      const i = STYLES.findIndex(s => s.id === prev);
      return STYLES[(i + 1) % STYLES.length].id;
    });
    setResultUrl(null);
    setView("idle");
  };

  // Animate: generate a NEW short video from the SAME prompt (not an img2v of
  // the shown still — the studio backend re-renders from text, anchored on the
  // pet). Flips to video output — the outputKind effect snaps the engine to
  // grok-imagine-video (free tier, pet-anchored) — and returns to compose so
  // the user confirms the spend. Copy below is kept honest about this.
  const animateThis = () => {
    setOutputKind("video");
    setResultUrl(null);
    setVariations([]);
    setLastGenId(null);
    setView("idle");
  };

  // ×4 variations of the current image: four independent paid generations. To
  // make them genuinely DIFFERENT (and not four identical paid calls), each run
  // appends a distinct composition/lighting hint to the same base prompt so the
  // model explores a different take. Sequential so we never burst the
  // rate-limit; each shows as it lands.
  const VARIATION_HINTS = [
    "three-quarter angle, soft natural lighting",
    "front-on framing, dramatic rim light",
    "low angle hero shot, warm golden tones",
    "candid off-center composition, cool cinematic lighting",
  ];
  const generateVariations = async () => {
    if (!pet || isDemo || varRunning) return;
    const model = chosenModel;
    if (!model || model.kind !== "image") return;
    // Item #11/#8-4: upfront balance check — never fire paid POSTs we already
    // know will 402 partway through the run.
    const needed = model.creditsPerRun * 4;
    if (credits != null && credits < needed) {
      setErrorIs402(true);
      setError(`4 variations need ${needed} credits — you have ${credits}.`);
      return;
    }
    // Same sentinel pattern as generate(): leaving Studio (or starting a new
    // generation) mid-run stops all further paid POSTs and state writes.
    const myJob = ++jobSeqRef.current;
    const isActive = () => jobSeqRef.current === myJob && mountedRef.current;
    setVarRunning(true);
    setVariations([]);
    setError(null);
    setErrorIs402(false);
    const basePrompt = buildFullPrompt();
    const got: { url: string; genId: number }[] = [];
    for (let i = 0; i < 4; i++) {
      // distinct per-take hint so each of the 4 charges yields a different image
      const finalPrompt = `${basePrompt} — variation ${i + 1}: ${VARIATION_HINTS[i]}`;
      try {
        const res = await fetch("/api/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ modelId: model.id, petId: pet.id, prompt: finalPrompt, aspect }),
        });
        const data = await res.json().catch(() => ({}));
        if (!isActive()) return;
        if (!res.ok) {
          if (res.status === 402) setErrorIs402(true);
          setError(data?.error || "Variation run failed");
          break;
        }
        if (typeof data.creditsRemaining === "number") updateCredits(data.creditsRemaining);
        const genId: number | null = typeof data.generationId === "number" ? data.generationId : null;
        let url: string | null = null;
        if (data.status === "completed" && data.url) url = data.url;
        else if (data.generationId) {
          for (let p = 0; p < 40; p++) {
            await new Promise(r => setTimeout(r, 3000));
            if (!isActive()) return;
            const r2 = await fetch(`/api/studio/generate/${data.generationId}`, { headers: getAuthHeaders() }).catch(() => null);
            if (!r2?.ok) continue;
            const d2 = await r2.json().catch(() => null);
            if (!isActive()) return;
            if (d2?.status === "completed") { url = d2.url; break; }
            if (d2?.status === "failed") break;
          }
        }
        // Keep each variation's own generationId so sharing a selected tile
        // links to THAT artwork, not the original (item #11-2).
        if (url && genId != null) { got.push({ url, genId }); setVariations([...got]); }
      } catch { break; }
    }
    if (!isActive()) return;
    setVarRunning(false);
    refreshHistory();
  };

  return (
    <div className="studio-root" style={{
      position: "relative",
      minHeight: "calc(100vh - 60px)",
      background: T.field, color: T.ink,
      fontFamily: T.body,
      // Top/side padding lives in the .studio-root CSS rule so it can track the
      // MEASURED fixed-nav height (--studio-nav-h) — the nav wraps taller at
      // narrow widths and used to overlap this page while scrolling.
    }}>
      {/* editorial surface dressing (absolute layers; content sits above at zIndex 2) */}
      <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1460, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Header ── */}
        <div className="mp-enter" style={{
          display: "flex", alignItems: "center", gap: 14, paddingBottom: 4,
          flexWrap: "wrap",
        }}>
          <span style={{ display: "inline-flex" }}><Icon name="film-reel" size={40} /></span>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontFamily: T.m, fontWeight: 700,
              letterSpacing: "0.14em", color: T.studio, marginBottom: 6, textTransform: "uppercase",
            }}>PRO PET STUDIO</div>
            <h1 style={{
              fontSize: 46, fontFamily: T.disp, fontWeight: 800, letterSpacing: "-0.025em",
              margin: 0, lineHeight: 1.05, color: T.ink,
            }}>
              Make {petDisplayName} a star
            </h1>
          </div>
          {isDemo && (() => {
            // authed-but-petless gets an Adopt CTA, not a sign-in wall they've passed.
            const authed = typeof window !== "undefined" && !!localStorage.getItem("petagen_jwt");
            const pillStyle: React.CSSProperties = {
              padding: "10px 16px", borderRadius: 12, fontSize: 13,
              background: T.paper, color: T.studio,
              border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
              fontWeight: 700, textDecoration: "none",
              fontFamily: T.m, letterSpacing: "0.08em", textTransform: "uppercase",
              display: "inline-flex", alignItems: "center", gap: 7,
            };
            return authed ? (
              <a href="/?section=my%20pet" style={pillStyle}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <ellipse cx="6" cy="9.5" rx="1.8" ry="2.4" />
                  <ellipse cx="10.3" cy="6.6" rx="1.8" ry="2.5" />
                  <ellipse cx="13.7" cy="6.6" rx="1.8" ry="2.5" />
                  <ellipse cx="18" cy="9.5" rx="1.8" ry="2.4" />
                  <path d="M12 11.5c-2.7 0-5 2.1-5 4.4 0 1.7 1.4 2.6 3 2.6.9 0 1.4-.4 2-.4s1.1.4 2 .4c1.6 0 3-.9 3-2.6 0-2.3-2.3-4.4-5-4.4Z" />
                </svg>Adopt a pet to star →
              </a>
            ) : (
              // Opens the wallet/SIWE connect modal in place — no navigation, so
              // the prompt/preview and any in-progress Studio state survive.
              <button type="button" onClick={openSignIn} style={{ ...pillStyle, cursor: "pointer" }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <path d="M9 18h6" /><path d="M10 21h4" />
                  <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.4 1 2.5h6c0-1.1.3-1.8 1-2.5A6 6 0 0 0 12 3Z" />
                </svg>DEMO · Sign in →
              </button>
            );
          })()}
          {canOpenEditor && (
            <button
              onClick={() => setEditorOpen(true)}
              title="Assemble your clips into a reel — trim, sequence, caption, music, export (all in your browser)"
              className="mp-enter"
              style={{
                padding: "10px 16px", borderRadius: 12, fontSize: 13, cursor: "pointer",
                background: T.paper, color: T.studio, border: `1px solid ${T.studio}`,
                boxShadow: "var(--ed-shadow-card)", fontWeight: 700,
                fontFamily: T.m, letterSpacing: "0.08em", textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 7,
              }}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2.5" y="5" width="19" height="14" rx="2" />
                <path d="M2.5 9h19M8 5v14" /><path d="M5.2 7h.01M5.2 12h.01M5.2 17h.01" />
              </svg>
              Assemble
            </button>
          )}
          <Pill
            label="CREDITS"
            value={credits == null ? "—" : String(creditAnim)}
            valueColor={creditFlash ? T.terra : undefined}
          />
        </div>

        {/* ── Mission strip: why you're here + what every action pays. The pts
            values mirror what the server actually grants (see runReward);
            no season dates or countdowns render while unscheduled. ── */}
        <div className="mp-enter-1" style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 14,
          boxShadow: "var(--ed-shadow-card)", padding: "10px 14px",
        }}>
          <span style={{
            fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.14em",
            color: T.studio, textTransform: "uppercase", flexShrink: 0,
          }}>Studio mission</span>
          <span style={{ fontFamily: T.body, fontSize: 13, color: T.ink70, flex: "1 1 240px", minWidth: 0, lineHeight: 1.45 }}>
            Put {petDisplayName} in scenes worth sharing — every completed generation pays Season Rewards points.
          </span>
          <span title={`Per completed image · daily cap ${STUDIO_PTS_DAILY_CAP} studio pts · non-financial loyalty points`} style={missionChip}>+10 pts / image</span>
          <span title={`Per completed video · daily cap ${STUDIO_PTS_DAILY_CAP} studio pts · non-financial loyalty points`} style={missionChip}>+20 pts / video</span>
          <span title="Points earned now are pre-season points — they carry into Season 1" style={{
            ...missionChip, background: "rgba(200,147,47,0.16)", color: "#8A6420",
          }}>{seasonChipLabel}</span>
        </div>

        {/* ── PRO workspace: template rail · canvas stage · inspector ── */}
        <div className="studio-workspace">
          {/* ═══ ZONE 1 — TEMPLATE LIBRARY (browse rail, sticky on desktop;
              stacks LAST on mobile so the canvas leads) ═══ */}
          <aside className="studio-zone-rail mp-enter-2">
            <div style={{
              background: T.paper, borderRadius: 16, padding: 12,
              border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <span style={{ ...panelLabel, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Icon name="sparkling" size={12} /> TEMPLATE LIBRARY
                </span>
                <span style={{ fontFamily: T.m, fontSize: 13, color: T.muted2 }}>{TEMPLATES.length}</span>
              </div>
              <div style={{ fontSize: 13, color: T.muted2, fontFamily: T.body, lineHeight: 1.45 }}>
                One tap loads a full scene for {petDisplayName} — then hit Generate.
              </div>
              <div className="studio-template-list">
                {TEMPLATES.map((t) => {
                  const ex = TEMPLATE_EXAMPLES[t.id];
                  const vid = TEMPLATE_EXAMPLE_VIDEOS[t.id];
                  const isActive = activeTemplateId === t.id;
                  const catLabel = t.category === "trending"
                    ? (TRENDING_BADGE_IDS.has(t.id) ? "🔥 trending" : "")
                    : t.category;
                  const tooltip = t.beats?.length ? `${t.title} — ${t.beats.join(" → ")}` : t.description;
                  return (
                    <button
                      key={t.id}
                      className="ed-card-hover"
                      onClick={() => applyTemplate(t)}
                      title={tooltip}
                      // Motion previews on fine-pointer hover only; touch keeps the poster.
                      onPointerEnter={vid ? (e) => {
                        if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
                        e.currentTarget.querySelector("video")?.play().catch(() => {});
                      } : undefined}
                      onPointerLeave={vid ? (e) => {
                        const v = e.currentTarget.querySelector("video");
                        if (v) { v.pause(); v.currentTime = 0; }
                      } : undefined}
                      style={{
                        width: "100%", textAlign: "left", padding: 0, borderRadius: 12,
                        overflow: "hidden", background: T.paper, cursor: "pointer",
                        display: "flex", flexDirection: "column",
                        // gold-foil ring marks the template currently in use
                        border: isActive ? `1.5px solid ${T.foilDeep}` : `1px solid ${T.hair}`,
                        boxShadow: isActive
                          ? "0 0 0 3px rgba(200,147,47,0.20), var(--ed-shadow-card)"
                          : "var(--ed-shadow-card)",
                      }}
                    >
                      {vid ? (
                        <div style={{ position: "relative", height: 86, overflow: "hidden" }}>
                          <video
                            src={vid} poster={ex} loop muted playsInline preload="metadata"
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          />
                          <span style={{ ...cardTag, position: "absolute", top: 6, right: 6 }}>▸ MOTION</span>
                          {catLabel && <span style={{ ...cardTag, position: "absolute", left: 6, bottom: 6 }}>{catLabel}</span>}
                        </div>
                      ) : ex ? (
                        <div style={{ position: "relative", height: 86, background: `url(${ex}) center/cover no-repeat` }}>
                          {catLabel && <span style={{ ...cardTag, position: "absolute", left: 6, bottom: 6 }}>{catLabel}</span>}
                        </div>
                      ) : t.swatch ? (
                        <TemplateMnemonic swatch={t.swatch} emoji={t.emoji} catLabel={catLabel} height={86} />
                      ) : (
                        <div style={{
                          position: "relative", height: 86, background: T.inset,
                          borderBottom: `1px solid ${T.hair}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <span aria-hidden style={{
                            fontSize: 30, lineHeight: 1,
                            filter: "grayscale(1) sepia(.6) saturate(2.4) hue-rotate(-16deg) opacity(.92)",
                          }}>{t.emoji}</span>
                          <span aria-hidden style={{
                            position: "absolute", left: 0, right: 0, bottom: 0, height: 8,
                            background: t.swatch || CATEGORY_BAND[t.category],
                          }} />
                        </div>
                      )}
                      <div style={{ padding: "8px 10px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            fontSize: 13, fontFamily: T.disp, fontWeight: 700,
                            color: isActive ? T.terra : T.ink,
                            flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{t.emoji} {t.title}</span>
                          {isActive && (
                            <span style={{
                              fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                              color: "#8A6420", background: "rgba(200,147,47,0.16)",
                              padding: "2px 6px", borderRadius: 999, flexShrink: 0,
                            }}>IN USE</span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 13, color: T.muted2, marginTop: 3, lineHeight: 1.4,
                          display: "-webkit-box", WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical", overflow: "hidden",
                        }}>{t.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* ═══ ZONE 2 — THE STAGE: dark canvas + film-strip + prompt console
              + the Generate action (canvas-first on mobile) ═══ */}
          <div className="studio-zone-stage" style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {/* STAGE — the screening room: a deep ink-navy mount with gold-foil
              registration marks so previews pop like projected film. The only
              dark surface in the app (intentional; everything else is paper). */}
          <div className="mp-enter-1 studio-stage" style={{
            position: "relative",
            background: "linear-gradient(175deg,#241D45 0%,#191334 58%,#120E26 100%)",
            borderRadius: 20, padding: 16,
            border: "1px solid rgba(232,199,126,.30)",
            boxShadow: "0 30px 60px -38px rgba(18,14,38,.85), inset 0 1px 0 rgba(252,233,207,.06)",
          }}>
            {/* monitor bar: live readout of the frame you're about to render */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, marginBottom: 12, paddingInline: 2, flexWrap: "wrap",
            }}>
              <span style={{
                fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.16em",
                color: T.foil, textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 7,
              }}>
                <span aria-hidden className={view === "generating" ? "studio-pulse" : undefined} style={{
                  width: 8, height: 8, borderRadius: 999, display: "inline-block",
                  background: view === "generating" ? T.cta1 : "rgba(232,199,126,.75)",
                }} />
                STAGE · {aspect}
              </span>
              <span style={{
                fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.08em",
                color: "rgba(252,233,207,.72)", textTransform: "uppercase",
              }}>{chosenModel?.displayName || "—"} · {outputKind}</span>
            </div>
            <div style={{
              position: "relative",
              aspectRatio: aspect.replace(":", " / "), borderRadius: 12, overflow: "hidden",
              background: `radial-gradient(120% 100% at 50% 30%, ${T.studioDeep}, ${T.studioInk})`,
              boxShadow: "inset 0 0 0 1px rgba(232,199,126,.22)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {view === "idle" && (
                <PreviewIdle pet={pet} isDemo={isDemo} />
              )}
              {view === "generating" && <PreviewGenerating kind={outputKind} progress={genProgress} isDemo={isDemo} />}
              {view === "done" && resultUrl && resultUrl !== "__demo__" && (
                /\.(mp4|webm)$/i.test(resultUrl)
                  ? <video src={resultUrl} controls autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "contain", animation: "studioPop .5s cubic-bezier(.2,1.3,.4,1)" }} />
                  : <img src={resultUrl} alt="result" style={{ width: "100%", height: "100%", objectFit: "contain", animation: "studioPop .5s cubic-bezier(.2,1.3,.4,1)" }} />
              )}
              {view === "done" && resultIsDemo && (
                <PreviewDemo pet={pet} prompt={buildFullPrompt()} onSignIn={openSignIn} />
              )}
              {view === "error" && (
                <div style={{ color: "white", textAlign: "center", padding: 30 }}>
                  <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}>
                    <svg width={40} height={40} viewBox="0 0 24 24" fill="none"
                      stroke={T.cta1} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                      aria-hidden="true">
                      <path d="M10.3 3.2 1.7 18a2 2 0 0 0 1.7 3h17.2a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 16, fontFamily: T.disp, fontWeight: 700, marginBottom: 6 }}>Generation failed</div>
                  <div style={{ fontSize: 13, color: "rgba(252,233,207,.95)", maxWidth: 380, margin: "0 auto 16px" }}>{error}</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                    {/* Item #8-2: a 402 needs a purchase path — "Try again" alone
                        just re-fails forever. */}
                    {errorIs402 && (
                      <a href="/?section=home&scroll=pricing" style={{
                        padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer",
                        background: `linear-gradient(180deg,${T.cta1},${T.cta2})`, color: T.ink,
                        fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
                        textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
                      }}>Credit purchases are paused →</a>
                    )}
                    <button onClick={() => generate()} style={errorIs402 ? btnGhostOnDark : {
                      padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer",
                      background: `linear-gradient(180deg,${T.cta1},${T.cta2})`, color: T.ink,
                      fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}><RetryGlyph size={13} /> Try again</button>
                    <button onClick={() => setView("idle")} style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6 }}><PencilGlyph size={13} /> Edit prompt</button>
                  </div>
                </div>
              )}
            </div>

            {/* Result actions */}
            {view === "done" && resultUrl && resultUrl !== "__demo__" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
                {/* Reward receipt — the server-confirmed Season pts this run
                    actually granted (0 = daily cap reached; never fabricated). */}
                {lastPointsAwarded != null && (
                  <span
                    role="status"
                    title={lastPointsAwarded > 0
                      ? "Season Rewards recorded for this generation (non-financial loyalty points)"
                      : `Daily studio cap (${STUDIO_PTS_DAILY_CAP} pts) reached — this run earned 0 today`}
                    style={{
                      padding: "7px 12px", borderRadius: 999,
                      fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
                      background: lastPointsAwarded > 0 ? "rgba(92,138,78,0.22)" : "rgba(252,233,207,0.12)",
                      color: lastPointsAwarded > 0 ? "#BFE3AF" : "rgba(252,233,207,.85)",
                      border: `1px solid ${lastPointsAwarded > 0 ? "rgba(146,196,125,.45)" : "rgba(252,233,207,.30)"}`,
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <SparkGlyph size={11} />
                    {lastPointsAwarded > 0 ? `+${lastPointsAwarded} pts recorded` : "Daily pts cap reached"}
                  </span>
                )}
                <button
                  onClick={() => remix()}
                  aria-label="Remix this in a new style"
                  title="Same pet, new style — tweak & generate again"
                  className="mp-enter"
                  style={{
                    padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer",
                    background: `linear-gradient(180deg,${T.cta1},${T.cta2})`, color: T.ink,
                    fontFamily: T.body, fontSize: 13, fontWeight: 700,
                    boxShadow: "var(--ed-shadow-card)",
                    display: "inline-flex", alignItems: "center", gap: 7,
                  }}
                ><svg width={15} height={15} viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true">
                    <circle cx="13.5" cy="6.5" r=".7" fill="currentColor" />
                    <circle cx="17.5" cy="10.5" r=".7" fill="currentColor" />
                    <circle cx="8.5" cy="7.5" r=".7" fill="currentColor" />
                    <circle cx="6.5" cy="12.5" r=".7" fill="currentColor" />
                    <path d="M12 2a10 10 0 1 0 0 20 2.5 2.5 0 0 0 2-4 2.5 2.5 0 0 1 2-4h2a4 4 0 0 0 4-4 10 10 0 0 0-10-8Z" />
                  </svg>Remix (new style)</button>
                {!isDemo && pet && pet.id > 0 && !/\.(mp4|webm)$/i.test(resultUrl) && (
                  <button
                    onClick={animateThis}
                    title="Generate a new short video from this same prompt (a fresh render anchored on your pet — not an animation of this exact still)"
                    className="mp-enter"
                    style={{
                      padding: "9px 16px", borderRadius: 10, border: `1px solid ${T.studio}`, cursor: "pointer",
                      background: T.paper, color: T.studio, boxShadow: "var(--ed-shadow-card)",
                      fontFamily: T.body, fontSize: 13, fontWeight: 700,
                      display: "inline-flex", alignItems: "center", gap: 7,
                      animationDelay: "50ms",
                    }}
                  ><svg width={15} height={15} viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                      aria-hidden="true">
                      <rect x="2.5" y="6" width="13" height="12" rx="2" />
                      <path d="M15.5 10l6-3v10l-6-3z" />
                    </svg>Video from prompt</button>
                )}
                {!isDemo && (
                  <button
                    onClick={() => setEditorOpen(true)}
                    className="mp-enter"
                    title="Open the client-side editor: trim, sequence, caption, add music, export a reel"
                    style={{
                      padding: "9px 16px", borderRadius: 10, border: `1px solid ${T.studio}`, cursor: "pointer",
                      background: "rgba(190,79,40,0.08)", color: T.studio, boxShadow: "var(--ed-shadow-card)",
                      fontFamily: T.body, fontSize: 13, fontWeight: 700,
                      display: "inline-flex", alignItems: "center", gap: 7, animationDelay: "60ms",
                    }}
                  ><svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 9h19M8 5v14" />
                    </svg>Edit &amp; assemble</button>
                )}
                <button onClick={() => { setView("idle"); setResultUrl(null); }} className="mp-enter ed-wipe" style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, animationDelay: "100ms" }}><RetryGlyph size={13} /> Start over</button>
                {!isDemo && pet && pet.id > 0 && !/\.(mp4|webm)$/i.test(resultUrl) && (
                  <>
                    <button
                      onClick={async () => {
                        // The TCG card renders from pet.avatar_url, so this one
                        // PATCH also updates the card art (item #25-6).
                        const ok = await setImageAsAvatar(resultUrl);
                        if (ok) {
                          setAvatarError(false);
                          setAvatarSaved(true);
                          setTimeout(() => setAvatarSaved(false), 4000);
                        } else {
                          setAvatarError(true);
                          setTimeout(() => setAvatarError(false), 4000);
                        }
                      }}
                      className="mp-enter"
                      style={{
                        ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, animationDelay: "150ms",
                        ...(avatarError ? { color: T.terra, borderColor: T.terra } : null),
                      }}
                      title="Use this image as your pet's profile picture AND their trading-card art (improves identity lock on future generations)"
                    >{avatarError ? "Couldn't update card art — try again" : avatarSaved ? "✓ Card art updated" : (
                      <>
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                          aria-hidden="true">
                          <path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z" />
                        </svg>Set as avatar &amp; card art
                      </>
                    )}</button>
                    {avatarSaved && (
                      <a href="/?section=cards" style={{ ...btnGhost, color: T.studio, borderColor: T.studio, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        View card →
                      </a>
                    )}
                  </>
                )}
                {!isDemo && lastGenId != null && (
                  <button
                    onClick={async () => {
                      if (await publishAndCopy(lastGenId)) {
                        setShareCopied(true);
                        setTimeout(() => setShareCopied(false), 2200);
                      }
                    }}
                    disabled={shareBusyId === lastGenId}
                    className="mp-enter"
                    style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, animationDelay: "200ms" }}
                    title="Publish this creation and prompt, then copy its public link"
                  >{shareBusyId === lastGenId ? "Publishing…" : shareCopied ? "✓ Link copied" : (
                    <>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                        aria-hidden="true">
                        <path d="M9.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 1 0-5-5l-1.2 1.2" />
                        <path d="M14.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 1 0 5 5l1.2-1.2" />
                      </svg>Publish &amp; share
                    </>
                  )}</button>
                )}
                {shareError && (
                  <span role="alert" style={{ width: "100%", color: T.terra, fontSize: 13 }}>
                    {shareError}{shareError.includes("Public profile") ? <> · <a href="/?section=sovereignty" style={{ color: "inherit", fontWeight: 700 }}>Open Data Sovereignty</a></> : null}
                  </span>
                )}
                {!isDemo && pet && pet.id > 0 && chosenModel?.kind === "image" && !/\.(mp4|webm)$/i.test(resultUrl) && (() => {
                  // Item #8-4/#25-2: chosenModel is guaranteed here — real cost,
                  // never "0 cr"; disable honestly when the balance can't cover 4.
                  const varCost = chosenModel.creditsPerRun * 4;
                  const varInsufficient = credits != null && credits < varCost;
                  return (
                    <button
                      onClick={generateVariations}
                      disabled={varRunning || varInsufficient}
                      className="mp-enter"
                      style={{
                        ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6,
                        cursor: varRunning ? "wait" : varInsufficient ? "not-allowed" : "pointer",
                        // 0.8 keeps the label ≥4.5:1 on paper — 0.6 washed it out.
                        opacity: varRunning || varInsufficient ? 0.8 : 1,
                        animationDelay: "250ms",
                      }}
                      title={varInsufficient
                        ? `4 variations cost ${varCost} credits — you have ${credits}`
                        : `4 separate paid image runs (${varCost} cr) — each completed one earns +10 Season pts, up to the daily cap of ${STUDIO_PTS_DAILY_CAP}`}
                    ><SparkGlyph size={12} /> {varRunning
                      ? "Generating…"
                      : varInsufficient
                      ? `4 variations — needs ${varCost} cr, you have ${credits}`
                      : `4 variations · ${varCost} cr · up to +40 pts`}</button>
                  );
                })()}
                <div style={{ flex: 1 }} />
                <a href={resultUrl} download className="mp-enter ed-wipe" style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, animationDelay: "300ms" }}><DownloadGlyph size={13} /> Download</a>
                <a href={resultUrl} target="_blank" rel="noreferrer" className="mp-enter ed-wipe" style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, animationDelay: "350ms" }}><ExternalGlyph size={13} /> Open</a>
              </div>
            )}

            {/* Variations grid — each tile swaps into the main result on click */}
            {view === "done" && (varRunning || variations.length > 0 || error) && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontFamily: T.m, letterSpacing: "0.14em", color: T.foil, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                  <SparkGlyph size={11} /> VARIATIONS{varRunning ? ` · ${variations.length}/4…` : ""}
                </div>
                {/* Item #11-1: a mid-run failure used to be swallowed (view stays
                    "done") — surface the server's real reason right here. */}
                {error && !varRunning && (
                  <div style={{
                    marginBottom: 8, padding: "8px 11px", borderRadius: 9,
                    background: T.inset, border: `1px solid ${T.hair}`,
                    fontSize: 13, color: T.terra, fontWeight: 600, fontFamily: T.body,
                    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                  }}>
                    <span>{error}</span>
                    {errorIs402 && (
                      <a href="/?section=home&scroll=pricing" style={{ color: T.terra, fontWeight: 700, textDecoration: "underline" }}>View credit status →</a>
                    )}
                  </div>
                )}
                {(varRunning || variations.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(66px, 1fr))", gap: 8 }}>
                  {variations.map((v, i) => (
                    <button key={i} onClick={() => { setResultUrl(v.url); setLastGenId(v.genId); setVariations([]); }} className="mp-lift" title="Use this variation" style={{
                      padding: 4, background: T.paper, borderRadius: 10, overflow: "hidden",
                      border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
                      cursor: "pointer", aspectRatio: "1 / 1",
                      animation: "studioPop .4s cubic-bezier(.2,1.3,.4,1) both",
                    }}>
                      <span style={{ display: "block", width: "100%", height: "100%", borderRadius: 7, boxShadow: "inset 0 0 0 1.5px rgba(184,130,44,.5)", background: `url(${v.url}) center/cover no-repeat` }} />
                    </button>
                  ))}
                  {varRunning && Array.from({ length: Math.max(0, 4 - variations.length) }).map((_, i) => (
                    <div key={`s${i}`} className="studio-pulse" style={{
                      border: `1px solid ${T.hair}`, borderRadius: 10, aspectRatio: "1 / 1",
                      background: T.inset, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, color: T.mono,
                    }}>◌</div>
                  ))}
                </div>
                )}
              </div>
            )}

            {/* ── FILM STRIP — recent takes as frames on the stage. Click a
                frame to reload it; VIEW ALL opens the full album. ── */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8, paddingInline: 2 }}>
                <span style={{
                  fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.16em",
                  color: T.foil, textTransform: "uppercase",
                }}>FILM STRIP · RECENT TAKES</span>
                {!isDemo && history.length > 0 && (
                  <button onClick={openGallery} className="ed-underline-slide" style={{
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
                    color: T.foil, textTransform: "uppercase",
                  }}>VIEW ALL →</button>
                )}
              </div>
              <div className="studio-filmstrip">
                {history.length > 0 ? history.map(g => (
                  <button
                    key={g.id}
                    onClick={() => reusePrompt(g)}
                    title={g.prompt || "(no prompt)"}
                    aria-label={g.prompt ? `View: ${g.prompt}` : "View creation"}
                    style={{
                      width: 118, height: 64, borderRadius: 6, overflow: "hidden",
                      border: "1px solid rgba(252,233,207,.24)", background: "#191334",
                      cursor: "pointer", padding: 0, display: "block", flexShrink: 0,
                    }}
                  >
                    {g.video_path && /\.(mp4|webm)$/i.test(g.video_path)
                      ? <video src={g.video_path} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : (g.photo_path || g.video_path)
                      ? <img src={g.photo_path || g.video_path || ""} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{
                          width: "100%", height: "100%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                          color: (g.status === "pending" || g.status === "running") ? "rgba(252,233,207,.8)" : "#F0A282",
                        }} className={(g.status === "pending" || g.status === "running") ? "studio-pulse" : undefined}>
                          {(g.status === "pending" || g.status === "running") ? "RENDERING" : g.status === "failed" ? "FAILED" : "?"}
                        </span>}
                  </button>
                )) : (
                  <span style={{
                    color: "rgba(252,233,207,.78)", fontFamily: T.m, fontSize: 13,
                    padding: "10px 6px", whiteSpace: "nowrap",
                  }}>No takes yet — every completed generation lands on this strip.</span>
                )}
              </div>
            </div>
          </div>

        {/* ── Prompt console — under the stage, so the order you work in is
              see the frame → say what to make → generate. ── */}
        <div className="mp-enter-3" style={{
          background: T.paper, borderRadius: 16, padding: 18,
          border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
        }}>
          <div style={panelLabel}>WHAT TO MAKE</div>
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            aria-label="Prompt — what your pet should be doing"
            placeholder={`What should ${petDisplayName} be doing? e.g. "running through cherry blossoms"`}
            style={{
              marginTop: 10, width: "100%", minHeight: 78, padding: "14px 16px",
              borderRadius: 12, border: `1px solid ${T.hair}`,
              fontSize: 16, fontFamily: T.body,
              lineHeight: 1.5, resize: "vertical", background: T.inset,
              color: T.ink,
            }}
          />

          {/* Guest CTA — anchored right under the prompt (next to the preview),
              not stranded at the very bottom below the whole template gallery.
              Runs the free demo preview; the sign-in link opens the connect
              modal in place. Authed users get the real Generate CTA further down. */}
          {isDemo && (
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => { if (prompt.trim()) generate(); else promptRef.current?.focus(); }}
                disabled={view === "generating"}
                className="studio-cta"
                style={{
                  width: "100%", padding: "14px 20px", borderRadius: 14, border: "none",
                  background: prompt.trim()
                    ? "linear-gradient(135deg,#D2643A,#BE4F28)"
                    : T.inset,
                  color: prompt.trim() ? "#FCE9CF" : T.muted2,
                  fontFamily: T.disp, fontWeight: 800, fontSize: 16,
                  letterSpacing: "0.01em",
                  cursor: view === "generating" ? "progress" : "pointer",
                  boxShadow: prompt.trim() ? "0 16px 32px -20px rgba(190,79,40,.7)" : "none",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9,
                }}
              >
                {view === "generating"
                  ? "Previewing…"
                  : prompt.trim()
                  ? "Preview a demo (free) →"
                  : "Write a prompt to preview →"}
              </button>
              <div style={{
                marginTop: 8, fontSize: 13, fontFamily: T.body, color: T.muted,
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6,
              }}>
                <span>No sign-in needed to preview — previews are free and earn no points.</span>
                <button type="button" onClick={openSignIn} style={{
                  border: "none", background: "none", padding: 0, cursor: "pointer",
                  fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.06em",
                  color: T.terra, textTransform: "uppercase",
                }}>Sign in to generate for real →</button>
                <span>Real generations earn Season Rewards: +10 / image · +20 / video.</span>
              </div>
            </div>
          )}

          {/* ── Director ── Turn a rough one-liner into a full cinematic video
              prompt. Sits right under the textarea: type an idea → "Direct it"
              → the detailed, editable prompt lands in the box above. */}
          <div style={{
            marginTop: 12, padding: "12px 14px", borderRadius: 12,
            background: T.inset, border: `1px solid ${T.hair}`,
            boxShadow: "var(--ed-shadow-card)",
          }}>
            <div style={{
              fontSize: 13, fontFamily: T.m, fontWeight: 700,
              letterSpacing: "0.1em", color: T.studio, marginBottom: 8,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <Icon name="film-reel" size={12} /> DIRECTOR
              <span style={{
                fontFamily: T.body, fontWeight: 500, letterSpacing: 0,
                color: T.muted, textTransform: "none", fontSize: 13,
              }}>— one line in → it asks what to decide → a full cinematic prompt out</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={directorIdea}
                onChange={(e) => { setDirectorIdea(e.target.value); if (directorError) setDirectorError(null); if (directorNeedsAuth) setDirectorNeedsAuth(false); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); directIt(); } }}
                aria-label="One-line idea for the Director"
                placeholder={`One-line idea — e.g. "${petDisplayName} chasing fireflies at dusk"`}
                disabled={directorBusy}
                style={{
                  flex: "1 1 220px", minWidth: 0, padding: "11px 14px",
                  borderRadius: 10, border: `1px solid ${T.hair}`,
                  fontSize: 15, fontFamily: T.body, background: T.paper,
                  color: T.ink,
                }}
              />
              <button
                onClick={directIt}
                disabled={directorBusy || directorIdea.trim().length === 0}
                style={{
                  padding: "11px 18px", borderRadius: 10, border: "none",
                  background: directorBusy || directorIdea.trim().length === 0 ? T.hair : T.studio,
                  color: directorBusy || directorIdea.trim().length === 0 ? T.muted : "#fff",
                  fontWeight: 700, fontSize: 14, fontFamily: T.body,
                  cursor: directorBusy || directorIdea.trim().length === 0 ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {directorBusy ? "Thinking…" : "Direct it"}
              </button>
            </div>
            {directorError && (
              <div style={{ marginTop: 8, fontSize: 13, fontFamily: T.body, color: T.terra }}>
                {directorError}
              </div>
            )}
            {directorNeedsAuth && (
              <div style={{
                marginTop: 8, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
                fontSize: 13, fontFamily: T.body, color: T.terra,
              }}>
                <span>Sign in to use the Director.</span>
                <button type="button" onClick={openSignIn} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 9, border: "none", cursor: "pointer",
                  background: T.studio, color: "#fff",
                  fontFamily: T.m, fontWeight: 700, fontSize: 12,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  boxShadow: "var(--ed-shadow-card)",
                }}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true">
                    <path d="M9 18h6" /><path d="M10 21h4" />
                    <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.4 1 2.5h6c0-1.1.3-1.8 1-2.5A6 6 0 0 0 12 3Z" />
                  </svg>
                  Sign in →
                </button>
              </div>
            )}
          </div>

          {/* Lowest-friction starting points (personality/element-aware), placed
              right under the prompt so a new user's fastest path to a valid
              prompt is the first thing they see — not buried under templates. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            <span style={{
              fontSize: 13, fontFamily: T.m, fontWeight: 700,
              color: T.mono, letterSpacing: "0.1em",
              alignSelf: "center", marginRight: 4,
            }}>TRY:</span>
            {promptIdeasFor(pet).map((idea, i) => (
              <button key={i} onClick={() => setPrompt(idea)} style={suggestionChip}>
                {idea}
              </button>
            ))}
          </div>
          {/* Memory → Video: scenes grounded in what the pet remembers about
              you. Only shows when the pet has daydreamed something. */}
          {memorySeeds.length > 0 && (
            <div style={{
              marginTop: 12, padding: "12px 14px", borderRadius: 12,
              background: T.inset,
              border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
            }}>
              <div style={{
                fontSize: 13, fontFamily: T.m,
                color: T.studio, letterSpacing: "0.1em", fontWeight: 700, marginBottom: 8,
                display: "flex", alignItems: "center", gap: 6,
              }}><svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <path d="M7.5 5A5.5 5.5 0 0 1 18 7.2 4 4 0 0 1 17 15H8A4.5 4.5 0 0 1 7.5 5Z" />
                  <circle cx="5" cy="18.5" r="1.6" /><circle cx="8.5" cy="21.5" r="1" />
                </svg>FROM {(pet?.name || "YOUR PET").toUpperCase()}'S MEMORY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {memorySeeds.map((seed, i) => (
                  <button key={i} onClick={() => setPrompt(seed)} style={{
                    textAlign: "left", padding: "9px 12px", borderRadius: 10,
                    background: T.paper, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
                    fontSize: 13, color: T.ink, cursor: "pointer", lineHeight: 1.45,
                    fontFamily: T.body,
                  }}>{seed}</button>
                ))}
              </div>
            </div>
          )}

          {/* Pet-LoRA: train this pet's exact face (renders only when the
              feature is enabled server-side and a real pet is selected). */}
          {pet && !isDemo && (
            <PetLoraPanel petId={pet.id} petName={pet.name} />
          )}
        </div>{/* /prompt console */}

        {/* ── Generate (authed) — the real spend, right under the console so
            mobile reads canvas → prompt → action. Guest demo CTA lives up by
            the prompt. Cost AND reward are stated on the action itself. ── */}
        {!isDemo && (insufficient && runCost != null && view !== "generating" ? (
          // Out of credits links to the honest credit-options section. Purchase
          // rails are currently paused, so the CTA must not promise a checkout.
          <a
            href="/?section=home&scroll=pricing"
            className="mp-enter-4 studio-cta"
            style={{
              ...generateBtn,
              display: "block", textAlign: "center", textDecoration: "none",
              background: `linear-gradient(180deg,${T.cta1},${T.cta2})`,
              color: T.ink,
              boxShadow: "0 20px 40px -22px rgba(226,125,12,.8)",
            }}
          >
            Not enough credits — purchases are paused →
            <span style={{
              display: "block", fontSize: 13, fontFamily: T.m, fontWeight: 700,
              letterSpacing: "0.06em", marginTop: 4,
            }}>this run costs {runCost} cr, you have {credits}</span>
          </a>
        ) : !!pet && !!chosenModel && view !== "generating" && !prompt.trim() ? (
          // The ONLY blocker is the empty prompt — that's guidance, not a
          // disabled action. Full-opacity "start here" bar (never a washed
          // 45%-opacity button); clicking it focuses the prompt box.
          <button
            onClick={() => {
              const el = promptRef.current;
              if (!el) return;
              el.focus({ preventScroll: true });
              el.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="mp-enter-4 studio-start-here"
            aria-label="Write a prompt to enable Generate"
            style={{
              width: "100%", padding: "16px 22px", borderRadius: 16,
              background: T.paper, cursor: "pointer",
              border: `1.5px dashed ${T.studio}`,
              boxShadow: "var(--ed-shadow-card)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
              textAlign: "left", fontFamily: T.body,
            }}
          >
            <span aria-hidden style={{
              width: 38, height: 38, borderRadius: 11, flexShrink: 0,
              background: "rgba(190,79,40,0.12)", color: T.studio,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}><PencilGlyph size={17} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{
                display: "block", fontFamily: T.m, fontSize: 13, fontWeight: 700,
                letterSpacing: "0.16em", color: T.studio, textTransform: "uppercase",
                marginBottom: 3,
              }}>START HERE</span>
              <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: T.ink, lineHeight: 1.4 }}>
                Write what {petDisplayName} should be doing — or tap a template in the library
              </span>
            </span>
          </button>
        ) : (
        <div className="mp-enter-4">
        <button onClick={generate} disabled={!canGenerate} className="studio-cta" style={{
          ...generateBtn,
          cursor: canGenerate ? "pointer" : view === "generating" ? "progress" : "not-allowed",
          // Never fade the whole button: a genuinely-disabled state keeps
          // FULL-opacity text on a muted (deeper) surface so the label stays
          // readable — no grey-on-grey wash.
          ...(canGenerate || view === "generating" ? {} : {
            background: "#8C4A2E", color: "rgba(252,233,207,.95)",
            boxShadow: "0 12px 24px -18px rgba(140,74,46,.5)",
          }),
        }}>
          {view === "generating"
            ? (outputKind === "image" ? "Generating…" : "Generating… ~1–2 min")
            : !chosenModel
            // Item #25-2: never advertise a 0-credit run while engines load.
            ? "Loading engines…"
            : !pet
            ? "Loading pets…"
            : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                <PlayGlyph size={16} />
                {/* Cost AND reward on the action itself — the reward mirrors
                    exactly what the server grants (runReward). */}
                <span>Generate · {chosenModel.creditsPerRun} cr · earns +{runReward} pts</span>
              </span>
            )}
        </button>
        {/* Honest reward footnote for the spend action */}
        {!!chosenModel && !!pet && view !== "generating" && (
          <div style={{
            marginTop: 8, fontSize: 13, fontFamily: T.m, color: T.muted2,
            display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center",
            textAlign: "center", lineHeight: 1.5,
          }}>
            <span>Season Rewards: +10 / image · +20 / video per completed run</span>
            <span>· daily cap {STUDIO_PTS_DAILY_CAP} pts</span>
            {credits != null && credits >= chosenModel.creditsPerRun && (
              <span>· balance covers {Math.floor(credits / Math.max(1, chosenModel.creditsPerRun))} run{Math.floor(credits / Math.max(1, chosenModel.creditsPerRun)) === 1 ? "" : "s"}</span>
            )}
          </div>
        )}
        </div>
        ))}
          </div>{/* /studio-zone-stage */}

          {/* ═══ ZONE 3 — INSPECTOR: generation settings + run card + live
              queue (sticky on desktop, like a real tool's right panel) ═══ */}
          <aside className="studio-zone-inspector mp-enter-3" style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            {/* Pet */}
            <Panel label="SUBJECT" className="mp-enter-2">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(pets || []).map(p => {
                  const selected = p.id === petId;
                  return (
                    <button key={p.id} onClick={() => setPetId(p.id)} style={{
                      ...petChip,
                      background: selected ? "rgba(200,147,47,0.10)" : T.paper,
                      // gold-foil ring marks the selection
                      border: selected ? `1.5px solid ${T.foilDeep}` : `1px solid ${T.hair}`,
                      boxShadow: selected ? "0 0 0 3px rgba(200,147,47,0.18)" : "none",
                    }}>
                      {p.avatar_url
                        ? <img src={p.avatar_url} alt={p.name} style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover", boxShadow: "inset 0 0 0 1.5px rgba(184,130,44,.5)" }} />
                        : <img src="/mascot.jpg" alt="" style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover", opacity: 0.9, boxShadow: "inset 0 0 0 1.5px rgba(184,130,44,.5)" }} />}
                      <span style={{ fontSize: 13, fontFamily: T.disp, fontWeight: 700 }}>{p.name}</span>
                      {selected ? (
                        <span style={{
                          fontSize: 13, color: T.terra, fontWeight: 700, letterSpacing: "0.08em",
                          fontFamily: T.m,
                        }}>✓ SELECTED</span>
                      ) : (
                        <span style={{
                          fontSize: 13, color: T.muted2,
                          fontFamily: T.m,
                        }}>Lv{p.level}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Panel>

            {/* Style */}
            <Panel label="STYLE" className="mp-enter-3">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {STYLES.map(s => {
                  const sel = s.id === styleId;
                  const ex = STYLE_EXAMPLES[s.id];
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStyleId(s.id)}
                      style={{
                        padding: 3, borderRadius: 12, cursor: "pointer",
                        background: T.paper,
                        border: `1px solid ${T.hair}`,
                        // selected = gold-foil ring (soft), never a hard offset shadow
                        boxShadow: sel ? `0 0 0 2px ${T.foilDeep}, var(--ed-shadow-card)` : "var(--ed-shadow-card)",
                        transition: "box-shadow 140ms ease",
                      }}>
                      {/* Real Grok example art (gradient fallback) framed as a
                          printed sample chip: gold keyline, cream margin. */}
                      <div style={{
                        height: 58, borderRadius: 8, overflow: "hidden",
                        boxShadow: "inset 0 0 0 1.5px rgba(184,130,44,.5)",
                        background: ex ? `url(${ex}) center/cover no-repeat` : s.swatch,
                        display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
                        padding: 6,
                      }}>
                        <span style={{
                          display: "inline-flex",
                          filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.55))",
                        }}><Icon name={s.icon} size={ex ? 18 : 26} /></span>
                      </div>
                      <div style={{
                        padding: "6px 4px 2px", textAlign: "center",
                        fontSize: 13, fontFamily: T.disp, fontWeight: 700, lineHeight: 1.2,
                        color: sel ? T.terra : T.ink,
                      }}>{s.label}</div>
                    </button>
                  );
                })}
              </div>
            </Panel>

            {/* Output type toggle */}
            <Panel label="OUTPUT" className="mp-enter-4">
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
                padding: 4, borderRadius: 12, background: T.inset, border: `1px solid ${T.hair}`,
              }}>
                {(["image", "video"] as const).map(k => {
                  const sel = outputKind === k;
                  return (
                    <button key={k} onClick={() => setOutputKind(k)} style={{
                      padding: "9px 0", borderRadius: 9, border: "none",
                      background: sel ? T.terra : "transparent",
                      color: sel ? T.creamOn : T.muted2,
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                      fontFamily: T.body,
                      boxShadow: sel ? "var(--ed-shadow-card)" : "none",
                      letterSpacing: "0.02em",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}>
                      <Icon name={k === "image" ? "compass" : "film-reel"} size={16} style={{ opacity: sel ? 1 : 0.55 }} />
                      {k === "image" ? "Image" : "Video"}
                    </button>
                  );
                })}
              </div>
            </Panel>

            {/* Aspect ratio — only the fal engines (Kling/Seedance/Wan/FLUX) honor
                aspect_ratio; Grok renders a fixed ratio, so don't show a dead control. */}
            {chosenModel?.backend === "fal" && (
            <Panel label="ASPECT" className="mp-enter-4">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, padding: 4, borderRadius: 12, background: T.inset, border: `1px solid ${T.hair}` }}>
                {(["16:9", "9:16", "1:1"] as const).map(a => {
                  const sel = aspect === a;
                  return (
                    <button key={a} onClick={() => setAspect(a)} style={{
                      padding: "9px 0", borderRadius: 9, border: "none",
                      background: sel ? T.terra : "transparent",
                      color: sel ? T.creamOn : T.muted2,
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                      fontFamily: T.m, letterSpacing: "0.04em",
                      boxShadow: sel ? "var(--ed-shadow-card)" : "none",
                    }}>{a === "16:9" ? "▭ 16:9" : a === "9:16" ? "▯ 9:16" : "◻ 1:1"}</button>
                  );
                })}
              </div>
            </Panel>
            )}

            {/* Duration — honest: every current engine renders a FIXED native
                clip length (the backend ignores a custom duration), so this is
                surfaced as a locked spec, never a slider that lies. */}
            {outputKind === "video" && chosenModel && (
              <Panel label="CLIP LENGTH" className="mp-enter-5">
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                  padding: "10px 12px", borderRadius: 12, background: T.inset, border: `1px solid ${T.hair}`,
                }}>
                  <span style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 20, color: T.ink }}>
                    {chosenModel.maxDurationSec}s
                  </span>
                  <span style={{ fontFamily: T.m, fontSize: 13, color: T.muted2, textAlign: "right", lineHeight: 1.4 }}>
                    per clip on {chosenModel.displayName} —<br />chain clips in Assemble for longer reels
                  </span>
                </div>
              </Panel>
            )}

            {/* Engine (model picker) */}
            <Panel label="ENGINE" className="mp-enter-5">
              <div style={{ position: "relative" }} ref={modelMenuRef}>
                <button onClick={() => setModelOpen(o => !o)} style={engineBtn}>
                  <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontFamily: T.disp, fontWeight: 700, color: T.ink }}>
                      {chosenModel?.displayName || "—"}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                      {chosenModel && <ModelBadges model={chosenModel} compact />}
                    </div>
                  </div>
                  <span style={{ fontSize: 13, color: T.muted, marginLeft: 8 }}>{modelOpen ? "▴" : "▾"}</span>
                </button>

                {modelOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    background: T.paper, borderRadius: 12, padding: 6,
                    border: `1px solid ${T.hair}`,
                    boxShadow: "var(--ed-shadow-card)",
                    zIndex: 20, maxHeight: 400, overflowY: "auto",
                  }}>
                    {(["free", "pro", "studio"] as const).map(tierKey => {
                      const group = visibleModels.filter(m => m.tier === tierKey);
                      if (group.length === 0) return null;
                      return (
                        <div key={tierKey} style={{ marginBottom: 2 }}>
                          <div style={{
                            padding: "7px 8px 4px", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
                          }}>
                            <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: T.mono, textTransform: "uppercase" }}>
                              {tierKey === "free" ? "Free" : tierKey === "pro" ? "Pro tier" : "Studio tier"}
                            </span>
                            <span style={{ fontFamily: T.m, fontSize: 13, color: T.muted2 }}>{TIER_QUALITY[tierKey]}</span>
                          </div>
                          {group.map(m => {
                      const sel = m.id === chosenModelId;
                      // D3: two distinct locks, both matching server reality —
                      // comingSoon (unfunded backend) and membership tier (the
                      // generate route 403s these; no membership is purchasable
                      // yet, so selling the selection would be a lie).
                      const memberLocked = !m.comingSoon && tierLocked(m);
                      const locked = !!m.comingSoon || memberLocked;
                      return (
                        <button key={m.id}
                          onClick={() => { if (locked) return; setChosenModelId(m.id); setModelOpen(false); }}
                          disabled={locked}
                          style={{
                            position: "relative",
                            width: "100%", textAlign: "left", padding: 10, borderRadius: 10,
                            background: sel ? "rgba(200,147,47,0.12)" : "transparent",
                            // gold-foil ring on the chosen engine
                            boxShadow: sel ? `inset 0 0 0 1.5px ${T.foilDeep}` : "none",
                            border: "none",
                            cursor: locked ? "not-allowed" : "pointer",
                            opacity: locked ? 0.6 : 1,
                            color: T.ink,
                            fontFamily: T.body,
                          }}
                          title={memberLocked
                            ? "Membership tier — memberships aren't available yet"
                            : locked ? `Coming ${m.comingSoonEta || "soon"}` : ""}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <strong style={{ fontSize: 13, fontFamily: T.disp, fontWeight: 700, color: sel ? T.terra : T.ink }}>{m.displayName}</strong>
                            {locked && <span style={{
                              padding: "2px 7px", borderRadius: 999,
                              fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
                              fontFamily: T.m,
                              background: T.inset, color: T.muted2,
                              display: "inline-flex", alignItems: "center", gap: 4,
                            }}><svg width={9} height={9} viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                                aria-hidden="true">
                                <rect x="5" y="11" width="14" height="10" rx="2" />
                                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                              </svg>{memberLocked ? "MEMBERSHIP — NOT YET AVAILABLE" : (m.comingSoonEta || "SOON")}</span>}
                            {!locked && <ModelBadges model={m} compact />}
                          </div>
                          <div style={{
                            fontSize: 13, color: T.muted2, marginTop: 4,
                            fontFamily: T.m,
                          }}>
                            {m.kind === "video" ? `${m.maxDurationSec}s · ` : ""}{m.maxResolution} · {m.creditsPerRun} cr
                          </div>
                        </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {chosenModel && <ModelSpecStrip model={chosenModel} />}
              {chosenModel?.supportsImageRef && pet?.avatar_url && (
                <div style={{
                  marginTop: 8, padding: "7px 10px", borderRadius: 8,
                  background: "rgba(92,138,78,0.08)",
                  border: "1px solid rgba(92,138,78,0.22)",
                  fontSize: 13, color: T.thrive,
                  fontFamily: T.m, fontWeight: 700, letterSpacing: "0.04em",
                }}>
                  ✓ uses {pet.name}'s photo to guide the look
                </div>
              )}
            </Panel>

            {/* ── RUN CARD: exactly what this run will cost and pay. Cost comes
                from providers.ts via the API; the reward mirrors the server's
                awardPointsCapped grant (runReward) — never a made-up number. ── */}
            <Panel label="RUN CARD" className="mp-enter-5">
              {isDemo ? (
                <div style={{ fontSize: 13, color: T.muted2, fontFamily: T.body, lineHeight: 1.5 }}>
                  Demo mode — previews are free and earn no points. Sign in to
                  generate for real and earn Season Rewards (+10 image · +20 video).
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <RunCardRow k="Engine" v={chosenModel?.displayName || "—"} />
                  <RunCardRow k="Cost" v={runCost != null ? `${runCost} cr` : "—"} />
                  <RunCardRow k="Reward" v={`+${runReward} pts`} accent="thrive" note={`cap ${STUDIO_PTS_DAILY_CAP}/day`} />
                  <RunCardRow k="Balance" v={credits != null ? `${credits} cr` : "—"} accent={insufficient ? "terra" : undefined} />
                  <div style={{ fontSize: 13, color: T.muted, fontFamily: T.body, lineHeight: 1.45, marginTop: 2 }}>
                    Points are non-financial Season Rewards standing.
                    {!SEASON_SCHEDULED && " Season 1 is starting soon — points earned now carry in."}
                  </div>
                </div>
              )}
            </Panel>

            {/* ── Render queue: live progress for the in-flight job + any
                pending server jobs. Real backend state, never faked. ── */}
            {!isDemo && (view === "generating" || history.some(g => g.status === "pending" || g.status === "running")) && (
              <RenderQueue
                generating={view === "generating"}
                kind={outputKind}
                progress={genProgress}
                pending={history.filter(g => g.status === "pending" || g.status === "running")}
              />
            )}
          </aside>
        </div>{/* /studio-workspace */}

        {/* ── Exploration notes: honest research directions — no dates, no
            commitments (D5). Below the actionable flow so it doesn't push the
            Generate CTA + recent work down on first load. Static — a pro tool
            doesn't scroll-animate its panels over each other. ── */}
        <div style={{
          marginTop: 12,
          background: T.paper,
          color: T.ink, borderRadius: 18, padding: "22px 24px",
          border: `1px solid ${T.hair}`,
          boxShadow: "var(--ed-shadow-card)",
        }}>
          <div style={{
            fontSize: 13, fontFamily: T.m,
            letterSpacing: "0.14em", color: T.studio, marginBottom: 10, fontWeight: 700, textTransform: "uppercase",
          }}>EXPLORING</div>
          <div style={{ fontSize: 22, fontFamily: T.disp, fontWeight: 800, letterSpacing: "-0.015em", marginBottom: 6 }}>
            Beyond prompts — what we&rsquo;re researching
          </div>
          <div style={{ fontSize: 14, color: T.muted2, marginBottom: 18, maxWidth: 560 }}>
            Directions we&rsquo;re exploring because Studio sits on your pet&rsquo;s
            memory ledger and persona. Research notes, not commitments — no dates
            attached; things ship only when they&rsquo;re real.
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 10,
          }}>
            <RoadmapItem
              icon="film-reel"
              title="Auto Memory Recap"
              body="Could your pet's week become a short video built straight from the memory ledger, no prompt needed? We're prototyping."
            />
            <RoadmapItem
              icon="rocket"
              title="Daily Content Bot"
              body="A fresh pet photo waiting for you each morning, auto-posted to your gallery. Under exploration."
            />
            <RoadmapItem
              icon="extension-icon"
              title="Pet Anchor API"
              body="An identity-preserving pet API other pet-tech builders could use. Early B2B research."
            />
            <RoadmapItem
              icon="coins"
              title="Collectible-linked perks"
              body="Early research: could owned pet collectibles unlock engine perks? Nothing designed or promised yet."
            />
            <RoadmapItem
              icon="shopping-cart"
              title="Shared identity models"
              body="Studying whether owners could ever share or license their pet's trained identity model. Idea stage only."
            />
          </div>
        </div>
      </div>

      {/* ── Director question sheet (phase:"questions" → phase:"final"): the
          full list of creative decisions, each with option pills + a free-text
          override. "Ask me nothing" hands every decision to the LLM. ── */}
      {directorQuestions && (
        <div
          onClick={() => { if (!directorFinalBusy) closeDirectorSheet(); }}
          role="dialog"
          aria-modal="true"
          aria-label="Director — decide the shots"
          style={{
            // Above the fixed Nav (zIndex 100) — at 85 the nav bar painted OVER
            // this sheet and overlapped its content while scrolling it.
            position: "fixed", inset: 0, zIndex: 112,
            background: "rgba(0,0,0,.5)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: 18, overflowY: "auto",
            animation: "edScrimIn 160ms ease both",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: T.paper, borderRadius: 18, padding: 22,
              border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-float)",
              width: "min(720px, 100%)", margin: "24px 0",
              animation: "edPanelIn 260ms cubic-bezier(.2,.8,.2,1) both",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontFamily: T.m, fontWeight: 700,
                  letterSpacing: "0.14em", color: T.studio, textTransform: "uppercase", marginBottom: 6,
                }}>DIRECTOR · DECIDE THE SHOTS</div>
                <h2 style={{
                  fontSize: 24, fontFamily: T.disp, fontWeight: 800, margin: 0,
                  lineHeight: 1.1, color: T.ink, letterSpacing: "-0.02em",
                }}>Here is everything to decide</h2>
                <p style={{ fontSize: 13, color: T.muted, margin: "6px 0 0", fontFamily: T.body, lineHeight: 1.5 }}>
                  Pick a suggestion or type your own. Anything you skip, the Director decides.
                </p>
              </div>
              <button
                onClick={closeDirectorSheet}
                disabled={directorFinalBusy}
                aria-label="Close"
                style={{
                  flexShrink: 0, width: 34, height: 34, borderRadius: 10,
                  border: `1px solid ${T.hair}`, background: T.paper, color: T.ink70,
                  cursor: directorFinalBusy ? "default" : "pointer", fontSize: 18, lineHeight: 1,
                  fontFamily: T.body,
                }}
              >×</button>
            </div>

            {/* Top action: skip everything */}
            <button
              onClick={() => runDirectorFinal(true)}
              disabled={directorFinalBusy}
              style={{
                width: "100%", marginTop: 14, marginBottom: 16,
                padding: "12px 14px", borderRadius: 12,
                border: `1px dashed ${T.studio}`, background: "rgba(190,79,40,0.06)",
                color: T.studio, fontWeight: 700, fontSize: 14, fontFamily: T.body,
                cursor: directorFinalBusy ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Icon name="sparkling" size={14} /> Ask me nothing — decide everything
            </button>

            {/* Questions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {directorQuestions.map((q, qi) => {
                const a = directorAnswers[q.id] || { option: q.default, override: "" };
                const overriding = a.override.trim().length > 0;
                return (
                  <div key={q.id} style={{
                    padding: "14px 16px", borderRadius: 14,
                    background: T.inset, border: `1px solid ${T.hair}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      {q.topic && (
                        <span style={{
                          fontSize: 13, fontFamily: T.m, fontWeight: 700, letterSpacing: "0.08em",
                          color: T.mono, textTransform: "uppercase",
                        }}>{qi + 1}. {q.topic}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontFamily: T.body, fontWeight: 700, color: T.ink, margin: "6px 0 2px", lineHeight: 1.4 }}>
                      {q.question}
                    </div>
                    {q.whyItMatters && (
                      <div style={{ fontSize: 13, color: T.muted, fontFamily: T.body, lineHeight: 1.45, marginBottom: 10 }}>
                        {q.whyItMatters}
                      </div>
                    )}
                    {/* Option pills */}
                    {q.options.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        {q.options.map((opt, oi) => {
                          const active = !overriding && a.option === opt;
                          return (
                            <button
                              key={oi}
                              onClick={() => setDirectorAnswers(prev => ({ ...prev, [q.id]: { option: opt, override: "" } }))}
                              aria-pressed={active}
                              style={{
                                padding: "7px 12px", borderRadius: 999,
                                border: `1px solid ${active ? T.terra : T.hair}`,
                                background: active ? T.terra : T.paper,
                                color: active ? T.creamOn : T.ink70,
                                fontSize: 13, fontWeight: 700, fontFamily: T.body,
                                cursor: "pointer", lineHeight: 1.3,
                              }}
                            >{opt}</button>
                          );
                        })}
                      </div>
                    )}
                    {/* Free-text override */}
                    <input
                      value={a.override}
                      onChange={(e) => setDirectorAnswers(prev => ({
                        ...prev,
                        [q.id]: { option: (prev[q.id]?.option ?? q.default) || "", override: e.target.value },
                      }))}
                      aria-label={`Your own answer for: ${q.topic || q.question}`}
                      placeholder="…or type your own"
                      style={{
                        width: "100%", padding: "9px 12px", borderRadius: 10,
                        border: `1px solid ${overriding ? T.terra : T.hair}`,
                        background: T.paper, color: T.ink, fontSize: 13, fontFamily: T.body,
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {directorSheetError && (
              <div style={{ marginTop: 14, fontSize: 13, fontFamily: T.body, color: T.terra }}>
                {directorSheetError}
              </div>
            )}

            {/* Footer actions */}
            <div style={{
              display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap",
              position: "sticky", bottom: -22, background: T.paper,
              paddingTop: 12, borderTop: `1px solid ${T.hair}`,
            }}>
              <button
                onClick={() => runDirectorFinal(false)}
                disabled={directorFinalBusy}
                style={{
                  flex: "1 1 220px",
                  padding: "13px 18px", borderRadius: 12, border: "none",
                  background: directorFinalBusy ? T.hair : T.studio,
                  color: directorFinalBusy ? T.muted : "#fff",
                  fontWeight: 800, fontSize: 15, fontFamily: T.body,
                  cursor: directorFinalBusy ? "default" : "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {directorFinalBusy ? "Writing the prompt…" : "Build the cinematic prompt →"}
              </button>
              <button
                onClick={closeDirectorSheet}
                disabled={directorFinalBusy}
                style={{ ...btnGhost, padding: "13px 18px", cursor: directorFinalBusy ? "default" : "pointer" }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Studio-Pro V1 client-side reel editor (all rendering on-device;
          server stays idle — see StudioEditor.tsx / editorEngine.ts). ── */}
      <StudioEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        clips={editorClips}
        credits={credits}
        userTier={userTier}
      />

      {/* ── "View all" gallery overlay (item #19): the full 50-row history the
          endpoint already returns, failed paid runs shown honestly. ── */}
      {galleryOpen && (
        <div
          onClick={() => setGalleryOpen(false)}
          style={{
            // Above the fixed Nav (zIndex 100) — at 80 the nav bar painted OVER
            // the gallery and overlapped its content while scrolling it.
            position: "fixed", inset: 0, zIndex: 110,
            background: "rgba(0,0,0,.5)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 18,
            animation: "edScrimIn 160ms ease both",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="All creations"
            onClick={e => e.stopPropagation()}
            style={{
              background: T.paper, borderRadius: 18, padding: 20,
              border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-float)",
              width: "min(980px, 100%)", maxHeight: "86vh", overflowY: "auto",
              animation: "edPanelIn 260ms cubic-bezier(.2,.8,.2,1) both",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div style={panelLabel}>
                ALL CREATIONS{gallery != null ? ` · ${gallery.length}` : ""}
              </div>
              <button onClick={() => setGalleryOpen(false)} aria-label="Close gallery" style={{
                background: "none", border: "none", cursor: "pointer", padding: 4,
                color: T.muted2, display: "inline-flex",
              }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <path d="M5 5l14 14M19 5 5 19" />
                </svg>
              </button>
            </div>

            {gallery == null ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="ed-skeleton" style={{ height: 200, borderRadius: 12, border: `1px solid ${T.hair}` }} />
                ))}
              </div>
            ) : gallery.length === 0 ? (
              <div style={{ padding: "26px 8px", fontSize: 14, color: T.muted2, fontFamily: T.body }}>
                Nothing here yet — your generations will collect in this album.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
                {gallery.map((g, i) => {
                  const media = g.video_path || g.photo_path;
                  const isVid = !!g.video_path && /\.(mp4|webm)$/i.test(g.video_path);
                  const failed = g.status === "failed";
                  const inFlight = g.status === "pending" || g.status === "running";
                  const dateStr = new Date(g.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  return (
                    <div key={g.id} className="mp-enter" style={{
                      background: T.inset, borderRadius: 12, overflow: "hidden",
                      border: `1px solid ${T.hair}`,
                      display: "flex", flexDirection: "column",
                      animationDelay: `${Math.min(i, 12) * 40}ms`,
                    }}>
                      {failed ? (
                        // Honest failure: real error_message + a retry path.
                        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 7, minHeight: 120 }}>
                          <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: T.terra, display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: T.terra, display: "inline-block" }} />FAILED
                          </span>
                          <span style={{ fontSize: 13, color: T.ink70, lineHeight: 1.45 }}>
                            {g.error_message || "This run failed before producing a result."}
                          </span>
                          {g.prompt && (
                            <button onClick={() => { reusePrompt(g); setGalleryOpen(false); }} style={{
                              alignSelf: "flex-start", marginTop: "auto",
                              padding: "6px 11px", borderRadius: 8, cursor: "pointer",
                              border: `1px solid ${T.hair}`, background: T.paper,
                              color: T.ink70, fontSize: 13, fontWeight: 700, fontFamily: T.body,
                            }}>Retry prompt</button>
                          )}
                        </div>
                      ) : inFlight ? (
                        <div className="ed-skeleton" style={{ height: 130, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: T.muted2 }}>RENDERING…</span>
                        </div>
                      ) : media ? (
                        isVid
                          ? <video src={g.video_path || ""} poster={g.photo_path || undefined} muted playsInline preload="metadata" style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                          : <img src={media} alt="" style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ height: 130, display: "flex", alignItems: "center", justifyContent: "center", color: T.mono }}>?</div>
                      )}

                      <div style={{ padding: "9px 11px 11px", display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
                        {g.prompt && (
                          <div style={{
                            fontSize: 13, color: T.ink70, lineHeight: 1.4,
                            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                            overflow: "hidden",
                          }}>{g.prompt}</div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: T.muted2, textTransform: "uppercase" }}>{dateStr}</span>
                          {typeof g.credits_charged === "number" && g.credits_charged > 0 && (
                            <span style={{
                              fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
                              padding: "1px 6px", borderRadius: 999,
                              background: T.paper, border: `1px solid ${T.hair}`, color: T.muted2,
                            }}>{g.credits_charged} cr</span>
                          )}
                        </div>
                        {!failed && !inFlight && media && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: "auto" }}>
                            <button onClick={() => { reusePrompt(g); setGalleryOpen(false); }} style={galleryActionBtn}>Reuse</button>
                            <button onClick={async () => {
                              if (await publishAndCopy(g.id)) {
                                setGalleryCopiedId(g.id);
                                setTimeout(() => setGalleryCopiedId(c => (c === g.id ? null : c)), 2200);
                              }
                            }} disabled={shareBusyId === g.id} title="Publish this creation and prompt, then copy its public link" style={galleryActionBtn}>
                              {shareBusyId === g.id ? "Publishing…" : galleryCopiedId === g.id ? "✓ Copied" : "Publish & share"}
                            </button>
                            <a href={media} download style={{ ...galleryActionBtn, textDecoration: "none" }}>Download</a>
                            {!isDemo && pet && pet.id > 0 && !isVid && g.photo_path && (
                              <button onClick={async () => {
                                const ok = await setImageAsAvatar(g.photo_path!);
                                if (ok) { setGalleryAvatarId(g.id); setTimeout(() => setGalleryAvatarId(c => (c === g.id ? null : c)), 2600); }
                                else { setGalleryAvatarErrId(g.id); setTimeout(() => setGalleryAvatarErrId(c => (c === g.id ? null : c)), 2600); }
                              }} style={galleryAvatarErrId === g.id ? { ...galleryActionBtn, color: T.terra, borderColor: T.terra } : galleryActionBtn}>{galleryAvatarErrId === g.id ? "Couldn't update — retry" : galleryAvatarId === g.id ? "✓ Card art" : "Set as avatar"}</button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sign-in progress / failure feedback — a click on any "Sign in" control
          must produce a visible state change. Shows while the SIWE signature is
          pending in the wallet, and stays up with a Retry if it was rejected
          or failed, until dismissed or signed in. */}
      {signInFlow && (isAuthenticating || !!authError) && (
        <div role="status" style={{
          position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 320,
          display: "flex", alignItems: "center", gap: 12, maxWidth: "min(92vw, 500px)",
          background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 12,
          boxShadow: "var(--ed-shadow-card)", padding: "12px 14px 12px 16px",
          fontFamily: T.body, fontSize: 13.5, color: T.ink,
        }}>
          {isAuthenticating ? (
            <span style={{ minWidth: 0 }}>Check your wallet — approve the signature to sign in.</span>
          ) : (
            <>
              <span style={{ minWidth: 0, color: T.terra }}>Sign-in didn&apos;t complete — the wallet signature was rejected or failed.</span>
              <button type="button" onClick={openSignIn} style={{
                flexShrink: 0, padding: "8px 14px", borderRadius: 9, border: "none", cursor: "pointer",
                background: T.studio, color: "#fff", fontFamily: T.m, fontWeight: 700,
                fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
              }}>Retry</button>
            </>
          )}
          <button type="button" aria-label="Dismiss sign-in notice" onClick={() => setSignInFlow(false)} style={{
            flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer",
            background: T.inset, color: T.muted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
          }}>✕</button>
        </div>
      )}

      <style>{`
        @keyframes studioPulseKf { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
        .studio-pulse { animation: studioPulseKf 1.6s ease-in-out infinite; }
        @keyframes studioPop { 0%{transform:scale(.92);opacity:0} 60%{transform:scale(1.02)} 100%{transform:scale(1);opacity:1} }
        .studio-cta { position: relative; overflow: hidden; }
        .studio-start-here { transition: transform 140ms ease; }
        .studio-start-here:hover { transform: translateY(-1.5px); }
        .studio-start-here:active { transform: translateY(1px) scale(.995); }
        .studio-cta:hover:not(:disabled) { transform: translateY(-1.5px); box-shadow: 0 26px 48px -24px rgba(190,79,40,.55); }
        .studio-cta:active:not(:disabled) { transform: translateY(1px) scale(.995); transition-duration: 80ms; }
        .studio-cta::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(100deg, transparent 30%, rgba(255,247,230,.18) 50%, transparent 70%);
          background-size: 300% 100%;
          animation: edFoilShift 6s linear infinite;
          pointer-events: none;
        }
        @keyframes studioQueueIndet { 0% { transform: translateX(-60%); } 100% { transform: translateX(260%); } }
        .studio-queue-indet { animation: studioQueueIndet 1.4s ease-in-out infinite; }
        @keyframes studioMnemonicDrift { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-6%,0); } }
        @keyframes studioSafelight { 0%,100% { opacity: .5; } 50% { opacity: .8; } }
        .studio-safelight { animation: studioSafelight 2.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .studio-cta::after { animation: none; }
          .studio-cta:hover:not(:disabled), .studio-cta:active:not(:disabled) { transform: none; }
          .studio-start-here:hover, .studio-start-here:active { transform: none; }
          .studio-queue-indet { animation: none; }
          .studio-mnemonic { animation: none !important; }
          .studio-safelight { animation: none; }
        }

        /* ── Nav clearance: the fixed nav wraps TALLER at narrow widths, so
           every offset tracks the MEASURED height (--studio-nav-h) instead of
           a hardcoded 60px that let content slide under the bar. ── */
        .studio-root { padding: calc(var(--studio-nav-h, 60px) + 34px) 24px 60px; }
        @media (max-width: 640px) { .studio-root { padding-left: 14px; padding-right: 14px; } }

        /* ── PRO workspace: template rail · canvas stage · inspector ── */
        .studio-workspace {
          display: grid;
          grid-template-columns: 248px minmax(0, 1fr) 332px;
          gap: 18px; align-items: start;
        }
        .studio-zone-rail, .studio-zone-inspector {
          position: sticky;
          top: calc(var(--studio-nav-h, 60px) + 16px);
          max-height: calc(100vh - var(--studio-nav-h, 60px) - 32px);
          overflow-y: auto; overscroll-behavior: contain;
          scrollbar-width: thin; min-width: 0;
        }
        .studio-template-list { display: flex; flex-direction: column; gap: 10px; }
        @media (max-width: 1320px) {
          .studio-workspace { grid-template-columns: 212px minmax(0, 1fr) 300px; }
        }
        @media (max-width: 1080px) {
          /* Stacked, canvas-first: stage → inspector → template library */
          .studio-workspace { grid-template-columns: 1fr; gap: 16px; }
          .studio-zone-rail, .studio-zone-inspector { position: static; max-height: none; overflow: visible; }
          .studio-zone-stage { order: 1; }
          .studio-zone-inspector { order: 2; }
          .studio-zone-rail { order: 3; }
          .studio-template-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); }
        }

        /* gold-foil registration marks on the stage corners */
        .studio-stage::before, .studio-stage::after {
          content: ""; position: absolute; width: 14px; height: 14px;
          border: 1.5px solid rgba(232,199,126,.55); pointer-events: none;
        }
        .studio-stage::before { top: 8px; left: 8px; border-right: none; border-bottom: none; border-top-left-radius: 6px; }
        .studio-stage::after { bottom: 8px; right: 8px; border-left: none; border-top: none; border-bottom-right-radius: 6px; }

        /* film-strip: sprocket rows are painted on the CONTAINER background
           (not the scrolling content) so they frame the strip at any scroll */
        .studio-filmstrip {
          display: flex; gap: 9px; overflow-x: auto; align-items: center;
          padding: 17px 12px; border-radius: 12px;
          background-color: #0D0A1C;
          background-image:
            repeating-linear-gradient(90deg, rgba(252,233,207,.20) 0 7px, transparent 7px 18px),
            repeating-linear-gradient(90deg, rgba(252,233,207,.20) 0 7px, transparent 7px 18px);
          background-size: 100% 5px, 100% 5px;
          background-position: 0 6px, 0 calc(100% - 6px);
          background-repeat: no-repeat;
          box-shadow: inset 0 0 0 1px rgba(232,199,126,.18);
          scrollbar-width: thin;
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──

function PreviewIdle({ pet, isDemo }: { pet: Pet | null; isDemo?: boolean }) {
  const named = !!pet?.name && !["Cat", "Dog", "Parrot", "Turtle", "Hamster", "Rabbit", "Fox", "Pomeranian"].includes(pet.name);
  const who = named ? pet!.name : "your pet";
  // <480px the 16:9 plate is only ~170px tall — the full 210px collectible
  // overflows the dark panel and covers the PREVIEW label. Compact mode lays
  // a smaller frame beside the copy instead (padded below the label).
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      display: "flex", flexDirection: compact ? "row" : "column",
      alignItems: "center", justifyContent: "center",
      gap: compact ? 14 : 22, overflow: "hidden",
      padding: compact ? "38px 18px 16px" : 30,
    }}>
      {/* The pet, presented as a tilted foil-stamped collectible floating on the
          indigo studio scene (holo + gloss baked into CollectibleFrame). */}
      {pet?.avatar_url ? (
        <div style={{ flexShrink: 0 }}>
          <CollectibleFrame
            photoUrl={pet.avatar_url}
            level={pet.level}
            width={compact ? 96 : 210}
            tilt={-3}
            seal={!compact}
            float={!compact}
          />
        </div>
      ) : !compact ? (
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><Icon name="film-reel" size={56} style={{ opacity: 0.6 }} /></div>
      ) : null}
      <div style={{ position: "relative", textAlign: compact ? "left" : "center", minWidth: 0 }}>
        <div style={{
          fontSize: compact ? 17 : 24, fontFamily: "var(--ed-disp)", fontWeight: 800, color: "#FCE9CF",
          letterSpacing: "-0.02em", marginBottom: compact ? 5 : 8,
        }}>
          {pet ? (named ? `${who} is ready` : "Ready to create") : "Pick a pet"}
        </div>
        <div style={{
          fontSize: compact ? 13 : 14, color: "rgba(252,233,207,0.92)",
          maxWidth: 320, margin: compact ? 0 : "0 auto", lineHeight: compact ? 1.45 : 1.55,
        }}>
          Pick a style, write a prompt, hit <strong>{isDemo ? "Preview" : "Generate"}</strong>{" "}
          — and put {who} in any scene you can imagine.
        </div>
      </div>
    </div>
  );
}

function PreviewGenerating({ kind, progress, isDemo }: { kind: "image" | "video"; progress?: number | null; isDemo?: boolean }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const lines = kind === "image"
    ? ["Painting your pet…", "Adding detail…", "Almost there…"]
    : ["Setting the scene…", "Rendering frames…", "Adding motion…", "Almost there…"];
  const line = lines[Math.min(Math.floor(secs / 6), lines.length - 1)];
  const total = kind === "image" ? 12 : 90;
  // Item #25-1: prefer the REAL upstream progress (0..1 from the poll route)
  // when the provider reports one; otherwise fall back to a wall-clock figure
  // that is explicitly labeled as an estimate — never dressed up as telemetry.
  const real = typeof progress === "number" && progress > 0
    ? Math.max(1, Math.min(100, Math.round(progress * 100)))
    : null;
  const est = Math.min(95, Math.round((secs / total) * 100));
  const pct = real ?? est;
  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* darkroom safelight: a slow amber-red wash over the plate while the
          print develops — decorative only, killed by prefers-reduced-motion */}
      <div aria-hidden className="studio-safelight" style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(120% 95% at 50% 18%, rgba(190,64,30,.34), rgba(120,34,18,.10) 55%, transparent 78%)",
      }} />
      <div style={{ position: "relative", color: "#FCE9CF", textAlign: "center", padding: 28, width: "100%", maxWidth: 330 }}>
        <div style={{ fontFamily: "var(--ed-m)", fontWeight: 700, fontSize: 13, letterSpacing: "0.18em", color: "rgba(252,233,207,.85)", textTransform: "uppercase" }}>Darkroom · Developing</div>
        <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 22, marginTop: 6, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>Generating · {secs}s</div>
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "rgba(252,233,207,.95)", marginTop: 6 }}>{line}</div>
        {/* Determinate strip on the developing plate. The ONLY motion: this bar
            advancing, the status line swapping, and the safelight breathing. */}
        <div style={{ marginTop: 16, height: 12, borderRadius: 999, background: "rgba(252,233,207,0.14)", border: "1px solid rgba(252,233,207,0.4)", overflow: "hidden", maxWidth: 260, marginInline: "auto" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#F49B2A,#E27D0C)", transition: "width 1s linear" }} />
        </div>
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "rgba(252,233,207,.85)", marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
          {real != null ? `${pct}%` : `≈${pct}% · est.`} · {kind === "video" ? "keep this page open" : "rendering"}
        </div>
        {real == null && (
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "rgba(252,233,207,.85)", marginTop: 3 }}>
            time estimate, not job progress
          </div>
        )}
        {/* Reward context on the develop plate: what this run pays when it
            lands — same numbers the server grants (see runReward). A DEMO
            preview is free and pays nothing, so it says exactly that. */}
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "rgba(232,199,126,.9)", marginTop: 10, fontWeight: 700, letterSpacing: "0.06em" }}>
          {isDemo
            ? "Demo preview — free · earns no points"
            : `Pays +${kind === "video" ? 20 : 10} Season pts on completion · daily cap applies`}
        </div>
      </div>
    </div>
  );
}

// A real render queue: the in-flight job (live % when the provider reports it)
// plus any History rows still pending/running on the backend. These are genuine
// server jobs — nothing here is faked telemetry.
function RenderQueue({ generating, kind, progress, pending }: {
  generating: boolean; kind: "image" | "video"; progress: number | null; pending: Generation[];
}) {
  const pct = typeof progress === "number" && progress > 0 ? Math.max(2, Math.min(99, Math.round(progress * 100))) : null;
  const rows: { label: string; sub: string; pct: number | null; active: boolean }[] = [];
  if (generating) {
    rows.push({
      label: kind === "image" ? "Rendering image" : "Rendering video",
      sub: pct != null ? `${pct}%` : (kind === "video" ? "~1–2 min · keep this page open" : "usually ~10s"),
      pct, active: true,
    });
  }
  for (const g of pending) {
    rows.push({ label: g.prompt ? g.prompt.slice(0, 42) : "Queued generation", sub: g.status === "running" ? "rendering" : "in queue", pct: null, active: false });
  }
  if (rows.length === 0) return null;
  return (
    <div className="mp-enter" style={{
      marginTop: 6, background: T.paper, borderRadius: 14, padding: 14,
      border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={panelLabel}>RENDER QUEUE</div>
        <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.studio, letterSpacing: "0.08em" }}>{rows.length} ACTIVE</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span aria-hidden style={{
              width: 9, height: 9, borderRadius: 999, flexShrink: 0,
              background: r.active ? T.cta2 : T.mono,
            }} className={r.active ? "studio-pulse" : undefined} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.body, fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
              <div style={{ height: 6, borderRadius: 999, background: T.inset, border: `1px solid ${T.hair}`, overflow: "hidden", marginTop: 4 }}>
                <div className={r.pct == null ? "studio-queue-indet" : undefined} style={{
                  height: "100%",
                  width: r.pct != null ? `${r.pct}%` : "40%",
                  background: r.active ? "linear-gradient(90deg,#F49B2A,#E27D0C)" : T.mono,
                  transition: "width 1s linear",
                }} />
              </div>
            </div>
            <span style={{ fontFamily: T.m, fontSize: 13, color: T.muted2, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{r.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewDemo({ pet, prompt, onSignIn }: { pet: Pet | null; prompt: string; onSignIn?: () => void }) {
  return (
    <div style={{
      color: "white", padding: "26px 30px", width: "100%",
      display: "flex", flexDirection: "column", justifyContent: "center", height: "100%",
    }}>
      <div style={{
        fontSize: 13, fontFamily: "var(--ed-m)", fontWeight: 700,
        letterSpacing: "0.14em", color: "rgba(252,233,207,.85)", marginBottom: 12, textTransform: "uppercase",
      }}>DEMO · WOULD GENERATE</div>
      <div style={{ fontSize: 22, fontFamily: "var(--ed-disp)", fontWeight: 800, color: "#FCE9CF", marginBottom: 8, lineHeight: 1.3 }}>
        A scene starring {pet?.name || "your pet"}
      </div>
      <div style={{
        fontSize: 14, color: "rgba(252,233,207,0.92)", fontFamily: "var(--ed-m)",
        marginBottom: 18, lineHeight: 1.5,
      }}>"{prompt}"</div>
      <button type="button" onClick={onSignIn} style={{
        alignSelf: "flex-start", border: "none", cursor: "pointer",
        padding: "10px 18px", borderRadius: 10,
        background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
        color: "#211A12", fontWeight: 800, fontSize: 13,
        fontFamily: "var(--ed-disp)",
        boxShadow: "0 14px 26px -14px rgba(226,125,12,.8)",
        display: "inline-flex", alignItems: "center", gap: 7,
      }}><svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />
        </svg>Sign in to generate for real →</button>
    </div>
  );
}

// D5: research notes only — no ETAs, no quarter pills, no shipping promises.
function RoadmapItem({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="ed-card-hover" style={{
      background: T.inset,
      border: `1px solid ${T.hair}`,
      borderRadius: 12, padding: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ display: "inline-flex" }}><Icon name={icon} size={20} /></span>
        <span style={{
          padding: "2px 7px", borderRadius: 999,
          fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
          fontFamily: T.m,
          background: "rgba(200,147,47,0.16)", color: "#8A6420",
        }}>RESEARCH</span>
      </div>
      <div style={{ fontSize: 14, fontFamily: T.disp, fontWeight: 700, marginBottom: 4, color: T.ink }}>{title}</div>
      <div style={{ fontSize: 13, color: T.muted2, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

// A looping "what you get" motion-mnemonic for templates without a captured
// example clip: the template's own gradient with the emoji drifting + a soft
// travelling light sweep, so the card reads as motion (a preview of the vibe)
// rather than a dead poster. Purely decorative CSS — killed under
// prefers-reduced-motion via the .studio-mnemonic rule in the style block.
function TemplateMnemonic({ swatch, emoji, catLabel, height = 140 }: { swatch: string; emoji: string; catLabel: string; height?: number }) {
  const drifters = [
    { left: "18%", top: "24%", size: 16, delay: "0s", dur: "3.2s" },
    { left: "66%", top: "18%", size: 12, delay: "0.5s", dur: "3.8s" },
    { left: "44%", top: "52%", size: 30, delay: "0.2s", dur: "3.4s" },
    { left: "80%", top: "58%", size: 14, delay: "0.9s", dur: "4.1s" },
  ];
  return (
    <div style={{ position: "relative", height, background: swatch, overflow: "hidden" }}>
      {/* travelling light sweep */}
      <span aria-hidden className="studio-mnemonic" style={{
        position: "absolute", inset: "-20%",
        background: "linear-gradient(115deg, transparent 38%, rgba(255,247,230,.28) 50%, transparent 62%)",
        backgroundSize: "220% 100%",
        animation: "edFoilShift 5.5s linear infinite",
      }} />
      {drifters.map((d, i) => (
        <span key={i} aria-hidden className="studio-mnemonic" style={{
          position: "absolute", left: d.left, top: d.top, fontSize: d.size, lineHeight: 1,
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
          animation: `studioMnemonicDrift ${d.dur} ease-in-out ${d.delay} infinite`,
          opacity: i === 2 ? 1 : 0.85,
        }}>{emoji}</span>
      ))}
      <span style={{ ...cardTag, position: "absolute", top: 7, left: 9 }}>▸ PREVIEW</span>
      {catLabel && (
      <span style={{ ...cardTag, position: "absolute", right: 9, bottom: 8 }}>{catLabel}</span>
      )}
    </div>
  );
}

// Hand-drawn-style inline glyphs (currentColor) replacing the old dingbat
// characters (⟳ ✎ ▶ ✦ ↓ ↗) so buttons match the rest of the icon set.
const RetryGlyph = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
  </svg>
);
const PencilGlyph = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16.5 3.8a2.3 2.3 0 0 1 3.7 2.7l-.8 1L15 3.1l1.5.7Z" />
    <path d="M15 3.1 4.6 13.5 3 21l7.5-1.6L20.9 9" />
  </svg>
);
const PlayGlyph = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4.8c0-1 1.1-1.7 2-1.2l11 6.4c.9.5.9 1.9 0 2.4L9 18.8c-.9.5-2-.2-2-1.2V4.8Z" />
  </svg>
);
const SparkGlyph = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5c.5 4.4 2 6.6 6.5 7.5-4.5 1.4-6 3.6-6.5 8-.5-4.4-2-6.6-6.5-8 4.5-.9 6-3.1 6.5-7.5Z" />
    <path d="M19 15.5c.2 1.9.9 2.8 2.7 3.2-1.8.6-2.5 1.5-2.7 3.3-.2-1.8-.9-2.7-2.7-3.3 1.8-.4 2.5-1.3 2.7-3.2Z" />
  </svg>
);
const DownloadGlyph = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.5V15" /><path d="m7.5 10.8 4.5 4.5 4.5-4.5" />
    <path d="M4 16.5v2.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
  </svg>
);
const ExternalGlyph = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 4.5h5.5V10" /><path d="M19.2 4.8 10.5 13.5" />
    <path d="M19.5 14v4.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5" />
  </svg>
);

// Small flat badge glyphs that match the mono pill style (currentColor, 9px).
const AudioGlyph = () => (
  <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" />
  </svg>
);
const AnchorGlyph = () => (
  <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="5" r="2.4" /><path d="M12 7.4V21" />
    <path d="M5 13a7 7 0 0 0 14 0" /><path d="M8 11H5v2M19 13v-2h-3" />
  </svg>
);

function ModelBadges({ model, compact }: { model: StudioModel; compact?: boolean }) {
  const badges: { label: string; bg: string; fg: string; icon?: React.ReactNode }[] = [];
  if (model.id === "veo-3") badges.push({ label: "AUDIO", bg: "rgba(200,147,47,0.16)", fg: "#8A6420", icon: <AudioGlyph /> });
  if (model.supportsImageRef) badges.push({ label: "ANCHOR", bg: "rgba(190,79,40,0.10)", fg: T.terra, icon: <AnchorGlyph /> });
  if (model.maxResolution.includes("1080") || model.maxResolution === "4K")
    badges.push({ label: `${model.maxResolution}`, bg: "rgba(92,138,78,0.12)", fg: T.thrive });
  if (model.maxDurationSec >= 8) badges.push({ label: `${model.maxDurationSec}s`, bg: "rgba(154,123,78,0.14)", fg: T.muted2 });
  if (model.tier !== "free") badges.push({ label: model.tier.toUpperCase(), bg: T.inset, fg: T.ink70 });

  return (
    <>
      {badges.slice(0, compact ? 3 : 5).map((b, i) => (
        <span key={i} style={{
          padding: "2px 7px", borderRadius: 999,
          fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
          fontFamily: T.m,
          background: b.bg, color: b.fg,
          display: "inline-flex", alignItems: "center", gap: 3,
        }}>{b.icon}{b.label}</span>
      ))}
    </>
  );
}

// Compact, honest spec read-out for the chosen engine — pulls straight from
// providers.ts so quality/cost never drift from what the server actually charges.
function ModelSpecStrip({ model }: { model: StudioModel }) {
  const cells: { k: string; v: string }[] = [
    { k: "Resolution", v: model.maxResolution },
    { k: model.kind === "video" ? "Clip length" : "Output", v: model.kind === "video" ? `${model.maxDurationSec}s` : "Still image" },
    { k: "Cost", v: `${model.creditsPerRun} cr` },
  ];
  return (
    <div style={{
      marginTop: 8, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
    }}>
      {cells.map(c => (
        <div key={c.k} style={{
          padding: "7px 9px", borderRadius: 9, background: T.inset, border: `1px solid ${T.hair}`,
        }}>
          <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: T.mono, textTransform: "uppercase" }}>{c.k}</div>
          <div style={{ fontFamily: T.disp, fontSize: 14, fontWeight: 700, color: T.ink, marginTop: 1 }}>{c.v}</div>
        </div>
      ))}
    </div>
  );
}

// One line of the RUN CARD — a printed spec row: mono key, bold value.
function RunCardRow({ k, v, note, accent }: { k: string; v: string; note?: string; accent?: "thrive" | "terra" }) {
  const valueColor = accent === "thrive" ? T.thrive : accent === "terra" ? T.terra : T.ink;
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
      padding: "7px 10px", borderRadius: 9, background: T.inset, border: `1px solid ${T.hair}`,
    }}>
      <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: T.mono, textTransform: "uppercase", flexShrink: 0 }}>{k}</span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
        <span style={{ fontFamily: T.disp, fontSize: 14, fontWeight: 700, color: valueColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
        {note && <span style={{ fontFamily: T.m, fontSize: 12, color: T.muted2, flexShrink: 0 }}>{note}</span>}
      </span>
    </div>
  );
}

function Panel({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      background: T.paper, borderRadius: 16, padding: 14,
      border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
    }}>
      <div style={panelLabel}>{label}</div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Pill({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      padding: "6px 12px", borderRadius: 10,
      background: T.paper, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
      display: "flex", alignItems: "baseline", gap: 8,
    }}>
      <span style={{
        fontSize: 13, fontFamily: T.m,
        color: T.mono, letterSpacing: "0.1em", fontWeight: 700,
      }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 700, fontFamily: T.m, fontVariantNumeric: "tabular-nums",
        color: valueColor, transition: "color 200ms ease",
      }}>{value}</span>
    </div>
  );
}

// ── Styles ──

const tag: React.CSSProperties = {
  padding: "3px 9px", borderRadius: 999,
  background: "rgba(190,79,40,0.10)", color: T.terra,
  fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
  fontFamily: T.m,
};

const panelLabel: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, letterSpacing: "0.14em",
  textTransform: "uppercase", color: T.mono,
  fontFamily: T.m,
};

// Reward chips on the mission strip — printed mono tags, values mirror the
// server grant (see runReward).
const missionChip: React.CSSProperties = {
  fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
  padding: "4px 10px", borderRadius: 999,
  background: "#F5EFE2", color: "#3A3024",
  border: "1px solid rgba(33,26,18,.13)",
  flexShrink: 0,
};

// Corner tag over template imagery (▸ MOTION / category / ▸ PREVIEW). A solid
// ink scrim chip — a bare drop-shadow washed out over light photography.
const cardTag: React.CSSProperties = {
  fontSize: 12, fontFamily: T.m, letterSpacing: "0.1em", fontWeight: 700,
  textTransform: "uppercase", color: "#FCE9CF",
  background: "rgba(33,26,18,.72)", padding: "3px 7px", borderRadius: 7,
  lineHeight: 1.1,
};

const petChip: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "6px 10px 6px 6px", borderRadius: 12,
  cursor: "pointer", color: T.ink,
  fontFamily: T.body,
  transition: "all 140ms ease",
};

const engineBtn: React.CSSProperties = {
  width: "100%", display: "flex", alignItems: "center",
  padding: "12px 14px", borderRadius: 12,
  background: T.paper, border: `1px solid ${T.hair}`,
  cursor: "pointer", fontFamily: T.body,
  color: T.ink, textAlign: "left",
};

const suggestionChip: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 999,
  border: `1px solid ${T.hair}`,
  background: T.paper, fontSize: 13, fontWeight: 600,
  color: T.ink70, cursor: "pointer",
  fontFamily: T.body,
};

const btnGhost: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 14px", borderRadius: 10,
  border: `1px solid ${T.hair}`, background: T.paper,
  color: T.ink70, fontWeight: 700, fontSize: 13, cursor: "pointer",
  fontFamily: T.body, textDecoration: "none",
};

// Ghost variant readable on the dark error plate (used when the primary slot
// is taken by the Get-credits purchase CTA).
const btnGhostOnDark: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "9px 18px", borderRadius: 10,
  border: "1px solid rgba(252,233,207,0.4)", background: "transparent",
  color: "#FCE9CF", fontWeight: 700, fontSize: 13, cursor: "pointer",
  fontFamily: T.m, letterSpacing: "0.04em",
};

// Compact action chip used on gallery-overlay cards.
const galleryActionBtn: React.CSSProperties = {
  padding: "5px 9px", borderRadius: 8,
  border: `1px solid ${T.hair}`, background: T.paper,
  color: T.ink70, fontWeight: 700, fontSize: 13, cursor: "pointer",
  fontFamily: T.body, textDecoration: "none", lineHeight: 1.2,
};

const generateBtn: React.CSSProperties = {
  width: "100%", padding: "18px 24px",
  borderRadius: 16, border: "none",
  background: "linear-gradient(135deg,#D2643A,#BE4F28)",
  color: "#FCE9CF", fontWeight: 800, fontSize: 19,
  fontFamily: "var(--ed-disp)",
  boxShadow: "0 20px 40px -22px rgba(190,79,40,.6)",
  letterSpacing: "0.01em",
  transition: "transform 140ms ease, box-shadow 140ms ease",
};

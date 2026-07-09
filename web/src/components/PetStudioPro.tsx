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
import { getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";
import CollectibleFrame from "@/components/editorial/CollectibleFrame";
import PetLoraPanel from "@/components/PetLoraPanel";
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


// Collectible Editorial tokens. Studio's section signature is indigo-purple
// (#6B4FA0) — used for the eyebrow, active/selected states and the Generate CTA.
const T = {
  field: "#ECE4D4", paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", ink70: "#3A3024",
  muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", creamOn: "#FCE9CF", cta1: "#F49B2A", cta2: "#E27D0C",
  studio: "#6B4FA0", studioDeep: "#3E3470", studioInk: "#191334",
  thrive: "#5C8A4E",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};

// Style swatches stay inside the warm editorial palette as printed sample chips
// — the style is differentiated by its icon + label, not a rainbow.
const STYLES = [
  { id: "cinematic",      icon: "film-reel", label: "Cinematic",  hint: "Hollywood", swatch: "linear-gradient(135deg,#211A12 0%,#3A3024 55%,#6B4FA0 100%)" },
  { id: "anime",          icon: "sparkling", label: "Anime",      hint: "Japan",     swatch: "linear-gradient(135deg,#FBF6EC 0%,#9E72E8 100%)" },
  { id: "photorealistic", icon: "compass",   label: "Photoreal",  hint: "Real",      swatch: "linear-gradient(135deg,#E7DDCC 0%,#7A6E5A 100%)" },
  { id: "watercolor",     icon: "water2",    label: "Watercolor", hint: "Soft",      swatch: "linear-gradient(135deg,#FAF7F2 0%,#D7C7F0 55%,#9E72E8 100%)" },
  { id: "pixar",          icon: "bear",      label: "3D Pixar",   hint: "Toon",      swatch: "linear-gradient(135deg,#9E72E8 0%,#E7DCF6 100%)" },
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
const DEMO_PET: Pet = { id: -1, name: "Mochi", avatar_url: "/mascot.jpg", species: 0, level: 5 };

type View = "idle" | "generating" | "done" | "error";

export default function PetStudioPro({ onCreditsChange }: { onCreditsChange?: (c: number | null) => void } = {}) {
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
  // Output type drives the default model + which models we surface.
  // Image-first by default: best margin (~10×) and instant feedback.
  const [outputKind, setOutputKind] = useState<"image" | "video">("image");
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  // Studio is Grok-only for now (fal account unfunded — see GROK_ONLY in
  // lib/studio/providers.ts): image → grok-imagine, video → grok-imagine-video.
  const [chosenModelId, setChosenModelId] = useState<string>("grok-imagine");
  const [modelOpen, setModelOpen] = useState(false);
  // Memory seeds — the pet's daydream insights, offered as prompt starters so
  // a generation can be grounded in something the pet actually "remembers"
  // about the owner. The Memory→Video bridge.
  const [memorySeeds, setMemorySeeds] = useState<string[]>([]);

  const [view, setView] = useState<View>("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [avatarSaved, setAvatarSaved] = useState(false);
  const [resultIsDemo, setResultIsDemo] = useState(false);
  // generationId of the current result — powers the public Share link (/c/<id>).
  const [lastGenId, setLastGenId] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
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
  // "View all" history gallery overlay (item #19).
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [gallery, setGallery] = useState<Generation[] | null>(null);
  const [galleryCopiedId, setGalleryCopiedId] = useState<number | null>(null);
  const [galleryAvatarId, setGalleryAvatarId] = useState<number | null>(null);
  // Terracotta flash when the balance drops (item #20).
  const [creditFlash, setCreditFlash] = useState(false);
  const prevCreditsRef = useRef<number | null>(null);

  // Single write-path for the balance so the host page (StudioWithNav → Nav)
  // stays in sync with every spend (item #20-6).
  const updateCredits = (c: number | null) => {
    setCredits(c);
    onCreditsChange?.(c);
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

  // ── Load pets + models + credits + history ──
  useEffect(() => {
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

    fetch("/api/studio/providers")
      .then(r => r.ok ? r.json() : null)
      .then(d => setModels(d?.models || []))
      .catch(() => {});

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Item #8: out-of-credits is a purchase moment, not a dead end.
  const runCost = chosenModel?.creditsPerRun ?? null;
  const insufficient = !isDemo && credits != null && runCost != null && credits < runCost;

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
  ): Promise<{ status: "completed"; url: string } | { status: "failed"; error: string } | { status: "timeout" } | null> => {
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
      if (d2.status === "completed") return { status: "completed", url: d2.url };
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
        setResultUrl(data.url); setView("done"); refreshHistory(); return;
      }

      const jobId = data.generationId;
      // Persist the pointer so a reload/section-switch can resume THIS job.
      if (typeof jobId === "number") saveActiveJob({ jobId, prompt: finalPrompt, kind: submittedKind });
      const out = await pollJob(jobId, submittedKind, isActive);
      if (!out) return; // superseded/unmounted — entry stays stored for restore
      if (out.status === "completed") {
        clearActiveJob();
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
    <div style={{
      position: "relative",
      minHeight: "calc(100vh - 60px)",
      background: T.field, color: T.ink,
      fontFamily: T.body,
      // Top: clear the fixed nav (60px) + breathing room.
      padding: "100px 24px 60px",
    }}>
      {/* editorial surface dressing (absolute layers; content sits above at zIndex 2) */}
      <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

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
            return (
              <a href={authed ? "/?section=my%20pet" : "/"} style={{
                padding: "10px 16px", borderRadius: 12, fontSize: 13,
                background: T.paper, color: T.studio,
                border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
                fontWeight: 700, textDecoration: "none",
                fontFamily: T.m, letterSpacing: "0.08em", textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 7,
              }}>{authed ? (
                <>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <ellipse cx="6" cy="9.5" rx="1.8" ry="2.4" />
                    <ellipse cx="10.3" cy="6.6" rx="1.8" ry="2.5" />
                    <ellipse cx="13.7" cy="6.6" rx="1.8" ry="2.5" />
                    <ellipse cx="18" cy="9.5" rx="1.8" ry="2.4" />
                    <path d="M12 11.5c-2.7 0-5 2.1-5 4.4 0 1.7 1.4 2.6 3 2.6.9 0 1.4-.4 2-.4s1.1.4 2 .4c1.6 0 3-.9 3-2.6 0-2.3-2.3-4.4-5-4.4Z" />
                  </svg>Adopt a pet to star →
                </>
              ) : (
                <>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true">
                    <path d="M9 18h6" /><path d="M10 21h4" />
                    <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.4 1 2.5h6c0-1.1.3-1.8 1-2.5A6 6 0 0 0 12 3Z" />
                  </svg>DEMO · Sign in →
                </>
              )}</a>
            );
          })()}
          <Pill
            label="CREDITS"
            value={credits == null ? "—" : String(creditAnim)}
            valueColor={creditFlash ? T.terra : undefined}
          />
        </div>

        {/* ── Two-column workspace ── */}
        <div className="studio-pro-grid" style={{
          display: "grid", gap: 16, alignItems: "start",
          gridTemplateColumns: "minmax(0, 1fr) 340px",
        }}>
          {/* LEFT column = preview + prompt (the two things you edit in sequence),
              so the short preview no longer strands an empty gap beside the taller
              controls column. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {/* PREVIEW — the collectible plate: an indigo studio scene on a cream
              paper mount with a soft floating shadow (never a hard offset). */}
          <div className="mp-enter-1" style={{
            position: "relative",
            background: T.paper, borderRadius: 18, padding: 13,
            border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
          }}>
            {/* PREVIEW mono label, top-left on the mount */}
            <div style={{
              position: "absolute", top: 22, left: 26, zIndex: 5,
              fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.14em",
              color: "rgba(252,233,207,.85)", textTransform: "uppercase",
              pointerEvents: "none",
            }}>PREVIEW</div>
            <div style={{
              position: "relative",
              aspectRatio: aspect.replace(":", " / "), borderRadius: 12, overflow: "hidden",
              background: `radial-gradient(120% 100% at 50% 30%, ${T.studioDeep}, ${T.studioInk})`,
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {view === "idle" && (
                <PreviewIdle pet={pet} />
              )}
              {view === "generating" && <PreviewGenerating kind={outputKind} progress={genProgress} />}
              {view === "done" && resultUrl && resultUrl !== "__demo__" && (
                /\.(mp4|webm)$/i.test(resultUrl)
                  ? <video src={resultUrl} controls autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "contain", animation: "studioPop .5s cubic-bezier(.2,1.3,.4,1)" }} />
                  : <img src={resultUrl} alt="result" style={{ width: "100%", height: "100%", objectFit: "contain", animation: "studioPop .5s cubic-bezier(.2,1.3,.4,1)" }} />
              )}
              {view === "done" && resultIsDemo && (
                <PreviewDemo pet={pet} prompt={buildFullPrompt()} />
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
                        background: `linear-gradient(180deg,${T.cta1},${T.cta2})`, color: "#FFF8EE",
                        fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
                        textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
                      }}>Get credits →</a>
                    )}
                    <button onClick={() => generate()} style={errorIs402 ? btnGhostOnDark : {
                      padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer",
                      background: `linear-gradient(180deg,${T.cta1},${T.cta2})`, color: "#FFF8EE",
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
                <button
                  onClick={() => remix()}
                  aria-label="Remix this in a new style"
                  title="Same pet, new style — tweak & generate again"
                  className="mp-enter"
                  style={{
                    padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer",
                    background: `linear-gradient(180deg,${T.cta1},${T.cta2})`, color: "#FFF8EE",
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
                <button onClick={() => { setView("idle"); setResultUrl(null); }} className="mp-enter ed-wipe" style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, animationDelay: "100ms" }}><RetryGlyph size={13} /> Start over</button>
                {!isDemo && pet && pet.id > 0 && !/\.(mp4|webm)$/i.test(resultUrl) && (
                  <>
                    <button
                      onClick={async () => {
                        // The TCG card renders from pet.avatar_url, so this one
                        // PATCH also updates the card art (item #25-6).
                        const ok = await setImageAsAvatar(resultUrl);
                        if (ok) {
                          setAvatarSaved(true);
                          setTimeout(() => setAvatarSaved(false), 4000);
                        }
                      }}
                      className="mp-enter"
                      style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, animationDelay: "150ms" }}
                      title="Use this image as your pet's profile picture AND their trading-card art (improves identity lock on future generations)"
                    >{avatarSaved ? "✓ Card art updated" : (
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
                      const link = `${window.location.origin}/c/${lastGenId}`;
                      try { await navigator.clipboard.writeText(link); setShareCopied(true); setTimeout(() => setShareCopied(false), 2200); }
                      catch { window.open(link, "_blank", "noreferrer"); }
                    }}
                    className="mp-enter"
                    style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, animationDelay: "200ms" }}
                    title="Copy a public share link to this creation"
                  >{shareCopied ? "✓ Link copied" : (
                    <>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                        aria-hidden="true">
                        <path d="M9.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 1 0-5-5l-1.2 1.2" />
                        <path d="M14.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 1 0 5 5l1.2-1.2" />
                      </svg>Share
                    </>
                  )}</button>
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
                        : `Generate 4 fresh takes of this prompt (costs ${varCost} credits)`}
                    ><SparkGlyph size={12} /> {varRunning
                      ? "Generating…"
                      : varInsufficient
                      ? `4 variations — needs ${varCost} cr, you have ${credits}`
                      : `4 variations · ${varCost} cr`}</button>
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
                <div style={{ fontSize: 13, fontFamily: T.m, letterSpacing: "0.14em", color: T.mono, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
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
                      <a href="/?section=home&scroll=pricing" style={{ color: T.terra, fontWeight: 700, textDecoration: "underline" }}>Get credits →</a>
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

          </div>

        {/* ── Prompt block — lives in the LEFT column under the preview, so the
              two things you touch in order (see the pet → say what to make) stack
              together and don't strand a gap beside the taller controls. ── */}
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
            <Reveal dir="left">
              <PetLoraPanel petId={pet.id} petName={pet.name} />
            </Reveal>
          )}

          {/* Templates — one tap loads a full, pet-anchored scene + flips to
              video. The card art previews the vibe; tap, then hit Generate. */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <span style={{
                fontSize: 13, fontFamily: T.m,
                letterSpacing: "0.14em", color: T.studio, fontWeight: 700, textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}><Icon name="sparkling" size={12} /> TEMPLATES</span>
              <span style={{ fontSize: 13, fontFamily: T.m, color: T.muted2 }}>
                one tap → a full scene · 🔥 trending up top
              </span>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10,
            }}>
              {TEMPLATES.map((t, i) => {
                const ex = TEMPLATE_EXAMPLES[t.id];
                const vid = TEMPLATE_EXAMPLE_VIDEOS[t.id];
                // Cream paper chip for the emoji mark — printed, not floating.
                const emojiChip: React.CSSProperties = {
                  fontSize: 13, lineHeight: 1, background: T.paper,
                  border: `1px solid ${T.hair}`, borderRadius: 8, padding: "3px 6px",
                };
                const catLabel = t.category === "trending" ? "🔥 trending" : t.category;
                // Hover tooltip: the shot-by-shot beats when we have them, else
                // fall back to the card's own concrete description.
                const tooltip = t.beats?.length ? `${t.title} — ${t.beats.join(" → ")}` : t.description;
                return (
                  <Reveal key={t.id} dir="up" delay={Math.min(i, 8) * 70}>
                  <button
                    className="ed-card-hover"
                    onClick={() => applyTemplate(t)}
                    title={tooltip}
                    // Item #25-4: no autoplaying wall of videos — motion previews
                    // on a fine-pointer hover only; touch keeps the poster.
                    onPointerEnter={vid ? (e) => {
                      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
                      e.currentTarget.querySelector("video")?.play().catch(() => {});
                    } : undefined}
                    onPointerLeave={vid ? (e) => {
                      const v = e.currentTarget.querySelector("video");
                      if (v) { v.pause(); v.currentTime = 0; }
                    } : undefined}
                    style={{
                      width: "100%", height: "100%",
                      textAlign: "left", padding: 0, borderRadius: 14, overflow: "hidden",
                      border: `1px solid ${T.hair}`, background: T.paper, cursor: "pointer",
                      boxShadow: "var(--ed-shadow-card)",
                      display: "flex", flexDirection: "column",
                    }}
                  >
                    {vid ? (
                      <div style={{ position: "relative", height: 92, overflow: "hidden" }}>
                        <video
                          src={vid} poster={ex} loop muted playsInline preload="metadata"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                        <span style={{ ...emojiChip, position: "absolute", left: 9, bottom: 7 }}>{t.emoji}</span>
                        <span style={{
                          position: "absolute", top: 7, right: 8,
                          fontSize: 13, fontFamily: T.m,
                          letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase",
                          color: "white", filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.75))",
                        }}>▸ MOTION</span>
                        <span style={{
                          position: "absolute", right: 9, bottom: 8,
                          fontSize: 13, fontFamily: T.m,
                          letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase",
                          color: "white", filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.75))",
                        }}>{catLabel}</span>
                      </div>
                    ) : ex ? (
                      <div style={{
                        height: 92, background: `url(${ex}) center/cover no-repeat`,
                        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
                        padding: "8px 9px",
                      }}>
                        <span style={emojiChip}>{t.emoji}</span>
                        <span style={{
                          fontSize: 13, fontFamily: T.m,
                          letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase",
                          color: "white", filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.75))",
                        }}>{catLabel}</span>
                      </div>
                    ) : t.swatch ? (
                      // No captured example yet — a generated-look poster in the
                      // template's own palette + a big glyph, so the card still
                      // reads as "here's the vibe" instead of a blank tile.
                      <div style={{
                        height: 92, background: t.swatch,
                        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
                        padding: "8px 9px", position: "relative",
                      }}>
                        <span style={{ fontSize: 30, lineHeight: 1, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}>{t.emoji}</span>
                        <span style={{
                          position: "absolute", top: 7, left: 9,
                          fontSize: 13, fontFamily: T.m,
                          letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase",
                          color: "white", filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.55))",
                        }}>PREVIEW</span>
                        <span style={{
                          position: "absolute", right: 9, bottom: 8,
                          fontSize: 13, fontFamily: T.m,
                          letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase",
                          color: "white", filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.55))",
                        }}>{catLabel}</span>
                      </div>
                    ) : (
                      <div style={{
                        height: 62,
                        background: T.inset, borderBottom: `1px solid ${T.hair}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        position: "relative",
                      }}>
                        <span style={{ ...emojiChip, fontSize: 20, padding: "4px 8px" }}>{t.emoji}</span>
                        <span style={{
                          position: "absolute", top: 7, right: 8,
                          fontSize: 13, fontFamily: T.m,
                          letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase",
                          color: T.studio,
                        }}>{catLabel}</span>
                      </div>
                    )}
                    <div style={{ padding: "9px 11px 11px" }}>
                      <div style={{ fontSize: 13, fontFamily: T.disp, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>
                        {t.title}
                      </div>
                      <div style={{ fontSize: 13, color: T.muted2, marginTop: 3, lineHeight: 1.45 }}>
                        {t.description}
                      </div>
                    </div>
                  </button>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
          </div>{/* /studio-left */}

          {/* CONTROLS */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Pet */}
            <Panel label="SUBJECT" className="mp-enter-2">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(pets || []).map(p => {
                  const selected = p.id === petId;
                  return (
                    <button key={p.id} onClick={() => setPetId(p.id)} style={{
                      ...petChip,
                      background: selected ? "rgba(107,79,160,0.08)" : T.paper,
                      border: selected ? `1.5px solid ${T.studio}` : `1px solid ${T.hair}`,
                      boxShadow: selected ? "0 0 0 3px rgba(107,79,160,0.12)" : "none",
                    }}>
                      {p.avatar_url
                        ? <img src={p.avatar_url} alt={p.name} style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover", boxShadow: "inset 0 0 0 1.5px rgba(184,130,44,.5)" }} />
                        : <img src="/mascot.jpg" alt="" style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover", opacity: 0.9, boxShadow: "inset 0 0 0 1.5px rgba(184,130,44,.5)" }} />}
                      <span style={{ fontSize: 13, fontFamily: T.disp, fontWeight: 700 }}>{p.name}</span>
                      {selected ? (
                        <span style={{
                          fontSize: 13, color: T.studio, fontWeight: 700, letterSpacing: "0.08em",
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
                        // selected = purple ring (soft), never a hard offset shadow
                        boxShadow: sel ? `0 0 0 2px ${T.studio}, var(--ed-shadow-card)` : "var(--ed-shadow-card)",
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
                        color: sel ? T.studio : T.ink,
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
                      background: sel ? T.studio : "transparent",
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
                      background: sel ? T.studio : "transparent",
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
                    {visibleModels.map(m => {
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
                            background: sel ? "rgba(107,79,160,0.10)" : "transparent",
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
                            <strong style={{ fontSize: 13, fontFamily: T.disp, fontWeight: 700, color: sel ? T.studio : T.ink }}>{m.displayName}</strong>
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
                )}
              </div>
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
          </div>
        </div>

        {/* ── Generate ── */}
        {insufficient && runCost != null && view !== "generating" ? (
          // Item #8-1: out of credits is a purchase moment, not a dead button.
          // Links to the home Pricing section (App.tsx reads scroll=pricing).
          <a
            href="/?section=home&scroll=pricing"
            className="mp-enter-4 studio-cta"
            style={{
              ...generateBtn,
              display: "block", textAlign: "center", textDecoration: "none",
              background: `linear-gradient(180deg,${T.cta1},${T.cta2})`,
              color: "#FFF8EE",
              boxShadow: "0 20px 40px -22px rgba(226,125,12,.8)",
            }}
          >
            Not enough credits — get more →
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
              background: "rgba(107,79,160,0.12)", color: T.studio,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}><PencilGlyph size={17} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{
                display: "block", fontFamily: T.m, fontSize: 13, fontWeight: 700,
                letterSpacing: "0.16em", color: T.studio, textTransform: "uppercase",
                marginBottom: 3,
              }}>START HERE</span>
              <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: T.ink, lineHeight: 1.4 }}>
                Write what {petDisplayName} should be doing — or tap a template above
              </span>
            </span>
          </button>
        ) : (
        <button onClick={generate} disabled={!canGenerate} className="mp-enter-4 studio-cta" style={{
          ...generateBtn,
          cursor: canGenerate ? "pointer" : view === "generating" ? "progress" : "not-allowed",
          // Never fade the whole button: a genuinely-disabled state keeps
          // FULL-opacity text on a muted (deeper) surface so the label stays
          // readable — no grey-on-grey wash.
          ...(canGenerate || view === "generating" ? {} : {
            background: T.studioDeep, color: "rgba(252,233,207,.95)",
            boxShadow: "0 12px 24px -18px rgba(25,19,52,.5)",
          }),
        }}>
          {view === "generating"
            ? (outputKind === "image" ? "Generating…" : "Generating… ~1–2 min")
            : !chosenModel
            // Item #25-2: never advertise a 0-credit run while engines load.
            ? "Loading engines…"
            : !pet
            ? "Loading pets…"
            : isDemo
            ? "Preview a demo (free) →"
            : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                <PlayGlyph size={16} />
                <span>
                  Generate · {chosenModel.creditsPerRun} credits
                  {credits != null && credits >= chosenModel.creditsPerRun
                    ? ` · you have ${creditAnim} (enough for ${Math.floor(credits / Math.max(1, chosenModel.creditsPerRun))} run${Math.floor(credits / Math.max(1, chosenModel.creditsPerRun)) === 1 ? "" : "s"})`
                    : ""}
                </span>
              </span>
            )}
        </button>
        )}

        {/* ── Recent history strip — scroll-reveals from below ── */}
        {history.length > 0 ? (
          <Reveal dir="up" style={{ marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <div style={panelLabel}>RECENT</div>
              {!isDemo && (
                <button onClick={openGallery} className="ed-underline-slide" style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
                  color: T.studio, textTransform: "uppercase",
                }}>VIEW ALL →</button>
              )}
            </div>
            <div style={{
              display: "flex", gap: 10, overflowX: "auto",
              paddingBottom: 8,
            }}>
              {history.map(g => (
                <div key={g.id} style={{ position: "relative", flexShrink: 0 }}>
                  <button onClick={() => reusePrompt(g)} className="mp-lift" style={{
                    width: 140, height: 80, borderRadius: 12, overflow: "hidden",
                    border: `1px solid ${T.hair}`, background: T.paper,
                    cursor: "pointer", padding: 0, display: "block",
                    boxShadow: "var(--ed-shadow-card)",
                  }} title={g.prompt || "(no prompt)"} aria-label={g.prompt ? `View: ${g.prompt}` : "View creation"}>
                    {g.video_path && /\.(mp4|webm)$/i.test(g.video_path)
                      ? <video src={g.video_path} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : (g.photo_path || g.video_path)
                      ? <img src={g.photo_path || g.video_path || ""} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{
                          width: "100%", height: "100%",
                          background: T.inset,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 18, color: T.mono,
                        }}>{(g.status === "pending" || g.status === "running")
                          ? <svg width={20} height={20} viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                              className="studio-pulse" aria-label="Pending">
                              <path d="M6 3h12" /><path d="M6 21h12" />
                              <path d="M7 3c0 4 3.5 6 5 9-1.5 3-5 5-5 9" />
                              <path d="M17 3c0 4-3.5 6-5 9 1.5 3 5 5 5 9" />
                            </svg>
                          : g.status === "failed"
                          ? <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: T.terra }}>FAILED</span>
                          : "?"}</div>}
                  </button>
                  {g.prompt && (
                    <button
                      onClick={() => remix(g.prompt)}
                      aria-label="Remix in a new style"
                      title="Remix — same prompt, new style"
                      style={{
                        position: "absolute", top: 4, right: 4,
                        width: 24, height: 24, borderRadius: 8, border: "none",
                        background: T.studio, color: T.creamOn,
                        fontSize: 13, cursor: "pointer", padding: 0, lineHeight: 1,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 4px 10px -4px rgba(62,52,112,.7)",
                      }}
                    ><svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
                        aria-hidden="true">
                        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
                      </svg></button>
                  )}
                </div>
              ))}
            </div>
          </Reveal>
        ) : (
          <Reveal dir="up" style={{
            marginTop: 6, padding: "22px 24px",
            background: T.paper,
            border: `1px dashed ${T.hair}`,
            borderRadius: 14,
            display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex" }}><Icon name="film-reel" size={28} /></div>
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ ...panelLabel, marginBottom: 4 }}>RECENT</div>
              <div style={{ fontSize: 14, color: T.muted2, fontWeight: 500 }}>
                Your generations will appear here. Click any to reuse the prompt.
              </div>
            </div>
          </Reveal>
        )}

        {/* ── Exploration notes: honest research directions — no dates, no
            commitments (D5). Below the actionable flow so it doesn't push the
            Generate CTA + recent work down on first load. Pops in on scroll. ── */}
        <Reveal dir="pop" style={{
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
        </Reveal>
      </div>

      {/* ── "View all" gallery overlay (item #19): the full 50-row history the
          endpoint already returns, failed paid runs shown honestly. ── */}
      {galleryOpen && (
        <div
          onClick={() => setGalleryOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 80,
            background: "rgba(0,0,0,.5)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 18,
            animation: "edScrimIn 160ms ease both",
          }}
        >
          <div
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
                              const link = `${window.location.origin}/c/${g.id}`;
                              try { await navigator.clipboard.writeText(link); setGalleryCopiedId(g.id); setTimeout(() => setGalleryCopiedId(c => (c === g.id ? null : c)), 2200); }
                              catch { window.open(link, "_blank", "noreferrer"); }
                            }} style={galleryActionBtn}>{galleryCopiedId === g.id ? "✓ Copied" : "Share"}</button>
                            <a href={media} download style={{ ...galleryActionBtn, textDecoration: "none" }}>Download</a>
                            {!isDemo && pet && pet.id > 0 && !isVid && g.photo_path && (
                              <button onClick={async () => {
                                const ok = await setImageAsAvatar(g.photo_path!);
                                if (ok) { setGalleryAvatarId(g.id); setTimeout(() => setGalleryAvatarId(c => (c === g.id ? null : c)), 2600); }
                              }} style={galleryActionBtn}>{galleryAvatarId === g.id ? "✓ Card art" : "Set as avatar"}</button>
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

      <style>{`
        @keyframes studioPulseKf { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
        .studio-pulse { animation: studioPulseKf 1.6s ease-in-out infinite; }
        @keyframes studioPop { 0%{transform:scale(.92);opacity:0} 60%{transform:scale(1.02)} 100%{transform:scale(1);opacity:1} }
        .studio-cta { position: relative; overflow: hidden; }
        .studio-start-here { transition: transform 140ms ease; }
        .studio-start-here:hover { transform: translateY(-1.5px); }
        .studio-start-here:active { transform: translateY(1px) scale(.995); }
        .studio-cta:hover:not(:disabled) { transform: translateY(-1.5px); box-shadow: 0 26px 48px -24px rgba(62,52,112,.9); }
        .studio-cta:active:not(:disabled) { transform: translateY(1px) scale(.995); transition-duration: 80ms; }
        .studio-cta::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(100deg, transparent 30%, rgba(255,247,230,.18) 50%, transparent 70%);
          background-size: 300% 100%;
          animation: edFoilShift 6s linear infinite;
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .studio-cta::after { animation: none; }
          .studio-cta:hover:not(:disabled), .studio-cta:active:not(:disabled) { transform: none; }
          .studio-start-here:hover, .studio-start-here:active { transform: none; }
        }
        @media (max-width: 880px) {
          .studio-pro-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──

function PreviewIdle({ pet }: { pet: Pet | null }) {
  const named = !!pet?.name && !["Cat", "Dog", "Parrot", "Turtle", "Hamster", "Rabbit", "Fox", "Pomeranian"].includes(pet.name);
  const who = named ? pet!.name : "your pet";
  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 22, overflow: "hidden", padding: 30,
    }}>
      {/* The pet, presented as a tilted foil-stamped collectible floating on the
          indigo studio scene (holo + gloss baked into CollectibleFrame). */}
      {pet?.avatar_url ? (
        <CollectibleFrame
          photoUrl={pet.avatar_url}
          level={pet.level}
          width={210}
          tilt={-3}
        />
      ) : (
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><Icon name="film-reel" size={56} style={{ opacity: 0.6 }} /></div>
      )}
      <div style={{ position: "relative", textAlign: "center" }}>
        <div style={{
          fontSize: 24, fontFamily: "var(--ed-disp)", fontWeight: 800, color: "#FCE9CF",
          letterSpacing: "-0.02em", marginBottom: 8,
        }}>
          {pet ? (named ? `${who} is ready` : "Ready to create") : "Pick a pet"}
        </div>
        <div style={{
          fontSize: 14, color: "rgba(252,233,207,0.92)",
          maxWidth: 320, margin: "0 auto", lineHeight: 1.55,
        }}>
          Pick a style, write a prompt, hit <strong>Generate</strong>{" "}
          — and put {who} in any scene you can imagine.
        </div>
      </div>
    </div>
  );
}

function PreviewGenerating({ kind, progress }: { kind: "image" | "video"; progress?: number | null }) {
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
    <div style={{ color: "#FCE9CF", textAlign: "center", padding: 28, width: "100%", maxWidth: 320 }}>
      <div style={{ fontFamily: "var(--ed-m)", fontWeight: 700, fontSize: 13, letterSpacing: "0.16em", color: "rgba(252,233,207,.85)", textTransform: "uppercase" }}>Developing</div>
      <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 22, marginTop: 6, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>Generating · {secs}s</div>
      <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "rgba(252,233,207,.95)", marginTop: 6 }}>{line}</div>
      {/* Determinate strip on the developing plate. The ONLY motion: this bar
          advancing and the status line swapping. */}
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
    </div>
  );
}

function PreviewDemo({ pet, prompt }: { pet: Pet | null; prompt: string }) {
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
      <a href="/" style={{
        alignSelf: "flex-start",
        padding: "10px 18px", borderRadius: 10,
        background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
        color: "#FFF8EE", fontWeight: 800, fontSize: 13,
        textDecoration: "none",
        fontFamily: "var(--ed-disp)",
        boxShadow: "0 14px 26px -14px rgba(226,125,12,.8)",
        display: "inline-flex", alignItems: "center", gap: 7,
      }}><svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />
        </svg>Sign in to generate for real →</a>
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
          background: "rgba(107,79,160,0.12)", color: T.studio,
        }}>RESEARCH</span>
      </div>
      <div style={{ fontSize: 14, fontFamily: T.disp, fontWeight: 700, marginBottom: 4, color: T.ink }}>{title}</div>
      <div style={{ fontSize: 13, color: T.muted2, lineHeight: 1.5 }}>{body}</div>
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
  if (model.id === "veo-3") badges.push({ label: "AUDIO", bg: "rgba(158,114,232,0.14)", fg: "#9E72E8", icon: <AudioGlyph /> });
  if (model.supportsImageRef) badges.push({ label: "ANCHOR", bg: "rgba(107,79,160,0.12)", fg: T.studio, icon: <AnchorGlyph /> });
  if (model.maxResolution.includes("1080") || model.maxResolution === "4K")
    badges.push({ label: `${model.maxResolution}`, bg: "rgba(92,138,78,0.12)", fg: T.thrive });
  if (model.maxDurationSec >= 8) badges.push({ label: `${model.maxDurationSec}s`, bg: "rgba(62,143,224,0.12)", fg: "#3E8FE0" });
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
  background: "rgba(107,79,160,0.12)", color: T.studio,
  fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
  fontFamily: T.m,
};

const panelLabel: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, letterSpacing: "0.14em",
  textTransform: "uppercase", color: T.mono,
  fontFamily: T.m,
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
  background: "linear-gradient(135deg,#7D5FB8,#6B4FA0)",
  color: "#FCE9CF", fontWeight: 800, fontSize: 19,
  fontFamily: "var(--ed-disp)",
  boxShadow: "0 20px 40px -22px rgba(62,52,112,.8)",
  letterSpacing: "0.01em",
  transition: "transform 140ms ease, box-shadow 140ms ease",
};

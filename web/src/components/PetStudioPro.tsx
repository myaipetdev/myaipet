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
import PetLoraPanel from "@/components/PetLoraPanel";
import { TEMPLATES, type StudioTemplate } from "@/lib/studio/templates";
import { STYLE_EXAMPLES, TEMPLATE_EXAMPLES } from "@/lib/studio/example-assets";
import { TEMPLATE_EXAMPLE_VIDEOS } from "@/lib/studio/example-videos";

interface Pet { id: number; name: string; avatar_url: string | null; species: number; level: number; }
interface StudioModel {
  id: string; displayName: string; provider: string; kind: "image" | "video";
  supportsImageRef: boolean; maxDurationSec: number; maxResolution: string;
  tier: "free" | "pro" | "studio"; creditsPerRun: number; description: string;
  comingSoon?: boolean; comingSoonEta?: string;
}
interface Generation {
  id: number; status: string; prompt: string | null;
  photo_path: string | null; video_path: string | null;
  created_at: string;
}


const STYLES = [
  { id: "cinematic",      emoji: "🎬", label: "Cinematic",  hint: "Hollywood", swatch: "linear-gradient(135deg,#0f172a 0%,#334155 55%,#b45309 100%)" },
  { id: "anime",          emoji: "✨", label: "Anime",      hint: "Japan",     swatch: "linear-gradient(135deg,#f472b6 0%,#a855f7 60%,#6366f1 100%)" },
  { id: "photorealistic", emoji: "📷", label: "Photoreal",  hint: "Real",      swatch: "linear-gradient(135deg,#475569 0%,#94a3b8 60%,#cbd5e1 100%)" },
  { id: "watercolor",     emoji: "🎨", label: "Watercolor", hint: "Soft",      swatch: "linear-gradient(135deg,#fde68a 0%,#fda4af 50%,#a5b4fc 100%)" },
  { id: "pixar",          emoji: "🧸", label: "3D Pixar",   hint: "Toon",      swatch: "linear-gradient(135deg,#38bdf8 0%,#818cf8 50%,#fbbf24 100%)" },
  { id: "pixel",          emoji: "👾", label: "Pixel",      hint: "Retro",     swatch: "linear-gradient(135deg,#22c55e 0%,#0ea5e9 50%,#7c3aed 100%)" },
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

// Unauthenticated demo subject = the MY AI PET mascot, so the try-before-signup
// experience is on-brand (a real pet portrait, not a placeholder).
const DEMO_PET: Pet = { id: -1, name: "Mochi", avatar_url: "/mascot.jpg", species: 0, level: 5 };

type View = "idle" | "generating" | "done" | "error";

export default function PetStudioPro() {
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [petId, setPetId] = useState<number | null>(null);
  const [models, setModels] = useState<StudioModel[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [history, setHistory] = useState<Generation[]>([]);

  const [styleId, setStyleId] = useState<string>("cinematic");
  const [prompt, setPrompt] = useState("");
  // Output type drives the default model + which models we surface.
  // Image-first by default: best margin (~10×) and instant feedback.
  const [outputKind, setOutputKind] = useState<"image" | "video">("image");
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
  const [resultIsDemo, setResultIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelMenuRef = useRef<HTMLDivElement>(null);
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
  };

  const chosenModel = models.find(m => m.id === chosenModelId);
  // Models filtered by the current output type (image vs video)
  const visibleModels = useMemo(
    () => models.filter(m => m.kind === outputKind),
    [models, outputKind]
  );

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

  // If user flips output kind and the current model is wrong-kind, snap to a
  // good default for the new kind.
  useEffect(() => {
    const current = models.find(m => m.id === chosenModelId);
    if (!current) return;
    if (current.kind !== outputKind) {
      const defaultId = outputKind === "image" ? "grok-imagine" : "grok-imagine-video";
      const exists = models.find(m => m.id === defaultId && !m.comingSoon);
      if (exists) setChosenModelId(defaultId);
      else {
        // Fall back to the first non-comingSoon model in the new kind
        const first = models.find(m => m.kind === outputKind && !m.comingSoon);
        if (first) setChosenModelId(first.id);
      }
    }
  }, [outputKind, models, chosenModelId]);

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
        if (d?.credits != null) setCredits(d.credits);
        if (Array.isArray(d?.generations)) setHistory(d.generations.slice(0, 12));
      })
      .catch(() => {});
  }, []);

  // ── Click outside model menu ──
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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

  const canGenerate = !!pet && prompt.trim().length > 0 && view !== "generating";

  // Per-generation sentinel + mount guard. Every async write in generate()
  // checks it's still the active job AND still mounted before applying, so
  // switching pet/model/output mid-flight (or navigating away) can't let a
  // stale poll stomp the preview/credits or setState after unmount.
  const jobSeqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const generate = async () => {
    if (!canGenerate || !pet) return;
    const myJob = ++jobSeqRef.current;
    const isActive = () => jobSeqRef.current === myJob && mountedRef.current;
    // Snapshot the submitted model so the loop never reads later-changed state.
    const submittedModel = chosenModel;
    const submittedModelId = chosenModelId;
    const finalPrompt = buildFullPrompt();

    setView("generating");
    setError(null);
    setResultUrl(null);
    setResultIsDemo(false);

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
        body: JSON.stringify({ modelId: submittedModelId, petId: pet.id, prompt: finalPrompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!isActive()) return;
      if (!res.ok) { setError(data?.error || "Generation failed"); setView("error"); return; }
      // Functional + only when a number, so an out-of-order response can't stomp
      // a newer (lower) balance with a stale (higher) one.
      setCredits(c => (typeof data.creditsRemaining === "number" ? data.creditsRemaining : c));

      if (data.status === "completed" && data.url) {
        setResultUrl(data.url); setView("done"); refreshHistory(); return;
      }

      const jobId = data.generationId;
      // Grok video can run past the stated "~30–90s"; poll longer for video so a
      // slow-but-valid job isn't surfaced as a timeout failure while it actually
      // finishes (and lands in History). Image stays at 180s — plenty.
      const maxPolls = submittedModel?.kind === "video" ? 120 : 60; // ×3s = 360s / 180s
      for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, 3000));
        if (!isActive()) return; // pet/model switched or unmounted — stop polling
        const r2 = await fetch(`/api/studio/generate/${jobId}`, { headers: getAuthHeaders() }).catch(() => null);
        if (!r2?.ok) continue;
        let d2: any;
        try { d2 = await r2.json(); } catch { continue; } // tolerate one bad body, keep polling
        if (!isActive()) return;
        if (d2.status === "completed") { setResultUrl(d2.url); setView("done"); refreshHistory(); return; }
        if (d2.status === "failed")    { setError(d2.error || "Generation failed"); setView("error"); return; }
      }
      if (!isActive()) return;
      setError("Timed out waiting for result. Check History.");
      setView("error");
    } catch (e: any) {
      if (!isActive()) return;
      setError(e?.message || "Generation failed"); setView("error");
    }
  };

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
      setView("done");
    }
  };

  return (
    <div style={{
      minHeight: "calc(100vh - 60px)",
      background: "#faf7f2", color: "#1a1a2e",
      fontFamily: "'Space Grotesk', sans-serif",
      // Top: clear the fixed nav (60px) + breathing room.
      padding: "100px 24px 60px",
    }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14, paddingBottom: 4,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 36 }}>🎬</span>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.18em", color: "#b45309", marginBottom: 4,
            }}>PRO VIDEO STUDIO</div>
            <h1 style={{
              fontSize: 36, fontWeight: 800, letterSpacing: "-0.025em",
              margin: 0, lineHeight: 1.1,
            }}>
              Make {petDisplayName} a star
            </h1>
          </div>
          {isDemo && (
            <a href="/" style={{
              padding: "10px 16px", borderRadius: 12, fontSize: 13,
              background: "rgba(59,130,246,0.10)", color: "#1e3a8a",
              border: "1px solid rgba(59,130,246,0.25)",
              fontWeight: 800, textDecoration: "none",
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em",
            }}>💡 DEMO · Sign in →</a>
          )}
          <Pill label="CREDITS" value={credits == null ? "—" : String(credits)} />
        </div>

        {/* ── Two-column workspace ── */}
        <div className="studio-pro-grid" style={{
          display: "grid", gap: 16,
          gridTemplateColumns: "minmax(0, 1fr) 340px",
        }}>
          {/* PREVIEW */}
          <div style={{
            background: "white", borderRadius: 16, padding: 14,
            border: "1px solid rgba(0,0,0,0.06)",
          }}>
            <div style={{
              position: "relative",
              aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden",
              background: "linear-gradient(135deg,#0f172a,#1e293b)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {view === "idle" && (
                <PreviewIdle pet={pet} />
              )}
              {view === "generating" && <PreviewGenerating kind={outputKind} />}
              {view === "done" && resultUrl && resultUrl !== "__demo__" && (
                /\.(mp4|webm)$/i.test(resultUrl)
                  ? <video src={resultUrl} controls autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  : <img src={resultUrl} alt="result" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              )}
              {view === "done" && resultIsDemo && (
                <PreviewDemo pet={pet} prompt={buildFullPrompt()} />
              )}
              {view === "error" && (
                <div style={{ color: "white", textAlign: "center", padding: 30 }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>⚠</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Generation failed</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", maxWidth: 380, margin: "0 auto" }}>{error}</div>
                </div>
              )}
            </div>

            {/* Result actions */}
            {view === "done" && resultUrl && resultUrl !== "__demo__" && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <a href={resultUrl} download style={btnGhost}>↓ Download</a>
                <a href={resultUrl} target="_blank" rel="noreferrer" style={btnGhost}>↗ Open</a>
                <div style={{ flex: 1 }} />
                <button onClick={() => { setView("idle"); setResultUrl(null); }} style={btnGhost}>⟳ New</button>
              </div>
            )}

            {/* Inspiration — fills the idle space with real example art; tap to load it. */}
            {view === "idle" && (
              <div style={{ marginTop: 12 }}>
                <div style={{
                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.14em", color: "rgba(26,26,46,0.5)", fontWeight: 700, marginBottom: 8,
                }}>✨ WHAT YOU CAN MAKE</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {TEMPLATES.slice(0, 4).map(t => {
                    const ex = TEMPLATE_EXAMPLES[t.id];
                    if (!ex) return null;
                    return (
                      <button key={t.id} onClick={() => applyTemplate(t)} className="mp-lift" title={t.title} style={{
                        padding: 0, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, overflow: "hidden",
                        cursor: "pointer", aspectRatio: "1 / 1",
                        background: `url(${ex}) center/cover no-repeat`,
                      }} />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* CONTROLS */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Pet */}
            <Panel label="SUBJECT">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(pets || []).map(p => {
                  const selected = p.id === petId;
                  return (
                    <button key={p.id} onClick={() => setPetId(p.id)} style={{
                      ...petChip,
                      background: selected ? "rgba(245,158,11,0.10)" : "white",
                      border: selected ? "2px solid #f59e0b" : "1px solid rgba(0,0,0,0.08)",
                    }}>
                      {p.avatar_url
                        ? <img src={p.avatar_url} alt={p.name} style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover" }} />
                        : <img src="/mascot.jpg" alt="" style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover", opacity: 0.9 }} />}
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                      <span style={{
                        fontSize: 10, color: "rgba(26,26,46,0.5)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>Lv{p.level}</span>
                    </button>
                  );
                })}
              </div>
            </Panel>

            {/* Style */}
            <Panel label="STYLE">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {STYLES.map(s => {
                  const sel = s.id === styleId;
                  const ex = STYLE_EXAMPLES[s.id];
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStyleId(s.id)}
                      className="mp-lift"
                      style={{
                        padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer",
                        background: "white",
                        border: sel ? "2px solid #f59e0b" : "1px solid rgba(0,0,0,0.08)",
                        boxShadow: sel
                          ? "0 6px 18px rgba(245,158,11,0.22)"
                          : "0 1px 2px rgba(0,0,0,0.02)",
                        transition: "all 200ms cubic-bezier(0.2,0.8,0.2,1)",
                      }}>
                      {/* Real Grok example art (gradient fallback) so each style
                          reads at a glance, not just as a label. */}
                      <div style={{
                        height: 60,
                        background: ex ? `url(${ex}) center/cover no-repeat` : s.swatch,
                        display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
                        padding: 6,
                      }}>
                        <span style={{
                          fontSize: ex ? 14 : 22,
                          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))",
                          transform: sel ? "scale(1.14)" : "scale(1)",
                          transition: "transform 220ms cubic-bezier(0.2,0.8,0.2,1)",
                        }}>{s.emoji}</span>
                      </div>
                      <div style={{
                        padding: "7px 4px", textAlign: "center",
                        fontSize: 12, fontWeight: 800, lineHeight: 1.2,
                        color: sel ? "#b45309" : "#1a1a2e",
                      }}>{s.label}</div>
                    </button>
                  );
                })}
              </div>
            </Panel>

            {/* Output type toggle */}
            <Panel label="OUTPUT">
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
                padding: 4, borderRadius: 12, background: "rgba(0,0,0,0.04)",
              }}>
                {(["image", "video"] as const).map(k => {
                  const sel = outputKind === k;
                  return (
                    <button key={k} onClick={() => setOutputKind(k)} style={{
                      padding: "9px 0", borderRadius: 9, border: "none",
                      background: sel ? "white" : "transparent",
                      color: sel ? "#1a1a2e" : "rgba(26,26,46,0.5)",
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                      fontFamily: "'Space Grotesk',sans-serif",
                      boxShadow: sel ? "0 1px 0 rgba(0,0,0,0.04)" : "none",
                      letterSpacing: "0.02em",
                    }}>
                      {k === "image" ? "📷 Image" : "🎬 Video"}
                    </button>
                  );
                })}
              </div>
            </Panel>

            {/* Engine (model picker) */}
            <Panel label="ENGINE">
              <div style={{ position: "relative" }} ref={modelMenuRef}>
                <button onClick={() => setModelOpen(o => !o)} style={engineBtn}>
                  <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>
                      {chosenModel?.displayName || "—"}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                      {chosenModel && <ModelBadges model={chosenModel} compact />}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: "rgba(26,26,46,0.5)", marginLeft: 8 }}>{modelOpen ? "▴" : "▾"}</span>
                </button>

                {modelOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    background: "white", borderRadius: 12, padding: 6,
                    border: "1px solid rgba(0,0,0,0.10)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                    zIndex: 20, maxHeight: 400, overflowY: "auto",
                  }}>
                    {visibleModels.map(m => {
                      const sel = m.id === chosenModelId;
                      const locked = !!m.comingSoon;
                      return (
                        <button key={m.id}
                          onClick={() => { if (locked) return; setChosenModelId(m.id); setModelOpen(false); }}
                          disabled={locked}
                          style={{
                            position: "relative",
                            width: "100%", textAlign: "left", padding: 10, borderRadius: 10,
                            background: sel ? "rgba(245,158,11,0.10)" : "transparent",
                            border: "none",
                            cursor: locked ? "not-allowed" : "pointer",
                            opacity: locked ? 0.6 : 1,
                            color: "#1a1a2e",
                            fontFamily: "'Space Grotesk',sans-serif",
                          }}
                          title={locked ? `Coming ${m.comingSoonEta || "soon"}` : ""}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <strong style={{ fontSize: 13 }}>{m.displayName}</strong>
                            {locked && <span style={{
                              padding: "2px 7px", borderRadius: 999,
                              fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                              fontFamily: "'JetBrains Mono', monospace",
                              background: "rgba(0,0,0,0.06)", color: "rgba(26,26,46,0.55)",
                            }}>🔒 {m.comingSoonEta || "SOON"}</span>}
                            {!locked && <ModelBadges model={m} compact />}
                          </div>
                          <div style={{
                            fontSize: 11, color: "rgba(26,26,46,0.55)", marginTop: 4,
                            fontFamily: "'JetBrains Mono', monospace",
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
                  background: "rgba(22,163,74,0.08)",
                  border: "1px solid rgba(22,163,74,0.20)",
                  fontSize: 12, color: "#15803d",
                  fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                }}>
                  ✓ {pet.name}'s photo locks character
                </div>
              )}
            </Panel>
          </div>
        </div>

        {/* ── Prompt block (full width below) ── */}
        <div style={{
          background: "white", borderRadius: 16, padding: 18,
          border: "1px solid rgba(0,0,0,0.06)",
        }}>
          <div style={panelLabel}>WHAT TO MAKE</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`What should ${pet?.name || "your pet"} be doing? e.g. "running through cherry blossoms"`}
            style={{
              marginTop: 10, width: "100%", minHeight: 78, padding: "14px 16px",
              borderRadius: 12, border: "1px solid rgba(0,0,0,0.10)",
              fontSize: 16, fontFamily: "'Space Grotesk',sans-serif",
              lineHeight: 1.5, resize: "vertical", background: "rgba(0,0,0,0.02)",
              color: "#1a1a2e",
            }}
          />
          {/* Memory → Video: scenes grounded in what the pet remembers about
              you. Only shows when the pet has daydreamed something. */}
          {memorySeeds.length > 0 && (
            <div style={{
              marginTop: 12, padding: "12px 14px", borderRadius: 12,
              background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(245,158,11,0.04))",
              border: "1px solid rgba(139,92,246,0.18)",
            }}>
              <div style={{
                fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                color: "#6d28d9", letterSpacing: "0.1em", fontWeight: 800, marginBottom: 8,
              }}>💭 FROM {(pet?.name || "YOUR PET").toUpperCase()}'S MEMORY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {memorySeeds.map((seed, i) => (
                  <button key={i} onClick={() => setPrompt(seed)} className="mp-lift" style={{
                    textAlign: "left", padding: "9px 12px", borderRadius: 10,
                    background: "white", border: "1px solid rgba(139,92,246,0.16)",
                    fontSize: 13, color: "#1a1a2e", cursor: "pointer", lineHeight: 1.45,
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}>{seed}</button>
                ))}
              </div>
            </div>
          )}

          {/* Pet-LoRA: train this pet's exact face (renders only when the
              feature is enabled server-side and a real pet is selected). */}
          {pet && !isDemo && <PetLoraPanel petId={pet.id} petName={pet.name} />}

          {/* Templates — one tap loads a full, pet-anchored scene + flips to
              video. The card art previews the vibe; tap, then hit Generate. */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <span style={{
                fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.14em", color: "#7e22ce", fontWeight: 800,
              }}>✨ TEMPLATES</span>
              <span style={{ fontSize: 11, color: "rgba(26,26,46,0.5)" }}>
                one tap → a full scene
              </span>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10,
            }}>
              {TEMPLATES.slice(0, 8).map(t => {
                const color = ({
                  celebration: "#f59e0b", everyday: "#3b82f6", cinematic: "#8b5cf6",
                  social: "#ec4899", fantasy: "#6366f1",
                } as Record<string, string>)[t.category] || "#8b5cf6";
                const ex = TEMPLATE_EXAMPLES[t.id];
                const vid = TEMPLATE_EXAMPLE_VIDEOS[t.id];
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="mp-lift"
                    style={{
                      textAlign: "left", padding: 0, borderRadius: 14, overflow: "hidden",
                      border: `1px solid ${color}33`, background: "white", cursor: "pointer",
                      display: "flex", flexDirection: "column",
                    }}
                  >
                    {vid ? (
                      <div style={{ position: "relative", height: 92, overflow: "hidden" }}>
                        <video
                          src={vid} poster={ex} autoPlay loop muted playsInline preload="metadata"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                        <span style={{ position: "absolute", left: 9, bottom: 7, fontSize: 18, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}>{t.emoji}</span>
                        <span style={{
                          position: "absolute", right: 9, bottom: 8,
                          fontSize: 8, fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: "0.1em", fontWeight: 800, textTransform: "uppercase",
                          color: "white", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))",
                        }}>{t.category}</span>
                      </div>
                    ) : ex ? (
                      <div style={{
                        height: 92, background: `url(${ex}) center/cover no-repeat`,
                        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
                        padding: "8px 9px",
                      }}>
                        <span style={{ fontSize: 18, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}>{t.emoji}</span>
                        <span style={{
                          fontSize: 8, fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: "0.1em", fontWeight: 800, textTransform: "uppercase",
                          color: "white", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))",
                        }}>{t.category}</span>
                      </div>
                    ) : (
                      <div style={{
                        height: 62,
                        background: `linear-gradient(135deg, ${color}26, ${color}0d)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 30, position: "relative",
                      }}>
                        <span>{t.emoji}</span>
                        <span style={{
                          position: "absolute", top: 7, right: 8,
                          fontSize: 8, fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: "0.1em", fontWeight: 800, textTransform: "uppercase",
                          color, opacity: 0.85,
                        }}>{t.category}</span>
                      </div>
                    )}
                    <div style={{ padding: "9px 11px 11px" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.01em" }}>
                        {t.title}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(26,26,46,0.55)", marginTop: 3, lineHeight: 1.4 }}>
                        {t.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
            <span style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: "rgba(26,26,46,0.55)", letterSpacing: "0.06em",
              alignSelf: "center", marginRight: 4,
            }}>TRY:</span>
            {PROMPT_IDEAS.slice(0, 6).map((idea, i) => (
              <button key={i} onClick={() => setPrompt(idea)} style={suggestionChip}>
                {idea}
              </button>
            ))}
          </div>
        </div>

        {/* ── Generate ── */}
        <button onClick={generate} disabled={!canGenerate} style={{
          ...generateBtn,
          opacity: canGenerate ? 1 : 0.45,
          cursor: canGenerate ? "pointer" : "not-allowed",
        }}>
          {view === "generating"
            ? (outputKind === "image" ? "Generating…" : "Generating… 30 – 90s")
            : `▶  Generate · ${chosenModel?.creditsPerRun ?? 0} credits · ${outputKind === "image" ? "~5s" : "~30s"}`}
        </button>

        {/* ── Roadmap: what's next for Studio ── */}
        <div style={{
          marginTop: 12,
          background: "linear-gradient(135deg, rgba(245,158,11,0.05), rgba(139,92,246,0.04) 60%, white)",
          color: "#1a1a2e", borderRadius: 18, padding: "22px 24px",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 2px 14px rgba(15,23,42,0.04)",
        }}>
          <div style={{
            fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.18em", color: "#b45309", marginBottom: 10, fontWeight: 700,
          }}>COMING TO STUDIO</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.015em", marginBottom: 6 }}>
            Beyond prompts — features only we can build
          </div>
          <div style={{ fontSize: 14, color: "rgba(26,26,46,0.6)", marginBottom: 18, maxWidth: 560 }}>
            Stuff other AI tools can't do because they don't have your pet's
            memory ledger, persona, or the rest of the PetClaw graph.
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 10,
          }}>
            <RoadmapItem
              emoji="🎞"
              eta="Q3 2026"
              title="Auto Memory Recap"
              body="Your pet's week → 30s video. Built from the memory ledger. No prompt needed."
            />
            <RoadmapItem
              emoji="🤖"
              eta="Q3 2026"
              title="Daily Content Bot"
              body="Wake up to a fresh pet photo every day. Auto-posted to your gallery."
            />
            <RoadmapItem
              emoji="🛠"
              eta="Q4 2026"
              title="Pet Anchor API"
              body="PuLID-based pet identity API for other pet-tech builders. B2B."
            />
            <RoadmapItem
              emoji="🪙"
              eta="Q4 2026"
              title="NFT-Gated Premium"
              body="Own a PETContent NFT → free access to premium engines. Exploring."
            />
            <RoadmapItem
              emoji="🛍"
              eta="2027"
              title="Pet LoRA Marketplace"
              body="Train a LoRA on your pet, list it as an NFT. Others use 'your' Sparky."
            />
          </div>
        </div>

        {/* ── Recent history strip ── */}
        {history.length > 0 ? (
          <div style={{ marginTop: 6 }}>
            <div style={{ ...panelLabel, marginBottom: 10 }}>RECENT</div>
            <div style={{
              display: "flex", gap: 10, overflowX: "auto",
              paddingBottom: 8,
            }}>
              {history.map(g => (
                <button key={g.id} onClick={() => reusePrompt(g)} className="mp-lift" style={{
                  flexShrink: 0,
                  width: 140, height: 80, borderRadius: 12, overflow: "hidden",
                  border: "1px solid rgba(0,0,0,0.08)", background: "white",
                  cursor: "pointer", padding: 0,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                }} title={g.prompt || "(no prompt)"}>
                  {g.video_path && /\.(mp4|webm)$/i.test(g.video_path)
                    ? <video src={g.video_path} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : (g.photo_path || g.video_path)
                    ? <img src={g.photo_path || g.video_path || ""} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{
                        width: "100%", height: "100%",
                        background: "rgba(0,0,0,0.05)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 18, color: "rgba(26,26,46,0.35)",
                      }}>{g.status === "pending" ? "⏳" : "?"}</div>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            marginTop: 6, padding: "22px 24px",
            background: "rgba(0,0,0,0.02)",
            border: "1px dashed rgba(0,0,0,0.12)",
            borderRadius: 14,
            display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
          }}>
            <div style={{ fontSize: 28 }}>🎞</div>
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ ...panelLabel, marginBottom: 4 }}>RECENT</div>
              <div style={{ fontSize: 14, color: "rgba(26,26,46,0.65)", fontWeight: 500 }}>
                Your generations will appear here. Click any to reuse the prompt.
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes studioSpinKf { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        .studio-spin { animation: studioSpinKf 2s linear infinite; display: inline-block; }
        @keyframes studioPulseKf { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
        .studio-pulse { animation: studioPulseKf 1.6s ease-in-out infinite; }
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
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      {/* Soft pet portrait filling the canvas — gives the empty state a hero
          instead of a tiny film-strip icon. Stays under text via opacity. */}
      {pet?.avatar_url && (
        <img src={pet.avatar_url} alt={pet.name} style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%", objectFit: "cover",
          opacity: 0.35, filter: "blur(2px) saturate(1.1)",
        }} />
      )}
      {/* Gradient floor so text stays readable over any photo */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(15,23,42,0.0) 0%, rgba(15,23,42,0.70) 100%)",
      }} />
      <div style={{ position: "relative", textAlign: "center", padding: 30 }}>
        {!pet?.avatar_url && (
          <div style={{ fontSize: 56, marginBottom: 12, opacity: 0.6 }}>🎞</div>
        )}
        <div style={{
          fontSize: 28, fontWeight: 800, color: "white",
          letterSpacing: "-0.02em", marginBottom: 8,
        }}>
          {pet ? (named ? `${who} is ready` : "Ready to create") : "Pick a pet"}
        </div>
        <div style={{
          fontSize: 15, color: "rgba(255,255,255,0.78)",
          maxWidth: 320, margin: "0 auto", lineHeight: 1.55,
        }}>
          Pick a style, write a prompt, hit <strong>Generate</strong>{" "}
          — and put {who} in any scene you can imagine.
        </div>
      </div>
    </div>
  );
}

function PreviewGenerating({ kind }: { kind: "image" | "video" }) {
  return (
    <div style={{ color: "white", textAlign: "center", padding: 30 }}>
      <div className="studio-spin" style={{ fontSize: 44, marginBottom: 14 }}>🎞</div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>Generating</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
        {kind === "image" ? "Just a few seconds…" : "30 – 90 seconds. Don't close the page."}
      </div>
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
        fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.14em", color: "#fbbf24", marginBottom: 12,
      }}>DEMO · WOULD GENERATE</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, lineHeight: 1.3 }}>
        A scene starring {pet?.name || "your pet"}
      </div>
      <div style={{
        fontSize: 14, color: "rgba(255,255,255,0.78)", fontFamily: "'JetBrains Mono', monospace",
        marginBottom: 18, lineHeight: 1.5,
      }}>"{prompt}"</div>
      <a href="/" style={{
        alignSelf: "flex-start",
        padding: "10px 18px", borderRadius: 10,
        background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
        color: "white", fontWeight: 800, fontSize: 13,
        textDecoration: "none",
        fontFamily: "'Space Grotesk',sans-serif",
      }}>⚡ Sign in to generate for real →</a>
    </div>
  );
}

function RoadmapItem({ emoji, eta, title, body }: { emoji: string; eta: string; title: string; body: string }) {
  return (
    <div style={{
      background: "white",
      border: "1px solid rgba(0,0,0,0.06)",
      borderRadius: 12, padding: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <span style={{
          padding: "2px 7px", borderRadius: 999,
          fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
          fontFamily: "'JetBrains Mono', monospace",
          background: "rgba(245,158,11,0.14)", color: "#b45309",
        }}>{eta}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4, color: "#1a1a2e" }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(26,26,46,0.6)", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function ModelBadges({ model, compact }: { model: StudioModel; compact?: boolean }) {
  const badges: { label: string; bg: string; fg: string }[] = [];
  if (model.id === "veo-3") badges.push({ label: "🎵 AUDIO", bg: "rgba(168,85,247,0.14)", fg: "#7e22ce" });
  if (model.supportsImageRef) badges.push({ label: "🎭 ANCHOR", bg: "rgba(245,158,11,0.14)", fg: "#b45309" });
  if (model.maxResolution.includes("1080") || model.maxResolution === "4K")
    badges.push({ label: `${model.maxResolution}`, bg: "rgba(22,163,74,0.10)", fg: "#15803d" });
  if (model.maxDurationSec >= 8) badges.push({ label: `${model.maxDurationSec}s`, bg: "rgba(59,130,246,0.10)", fg: "#1e3a8a" });
  if (model.tier !== "free") badges.push({ label: model.tier.toUpperCase(), bg: "rgba(0,0,0,0.06)", fg: "#1a1a2e" });

  return (
    <>
      {badges.slice(0, compact ? 3 : 5).map((b, i) => (
        <span key={i} style={{
          padding: "2px 7px", borderRadius: 999,
          fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
          fontFamily: "'JetBrains Mono', monospace",
          background: b.bg, color: b.fg,
        }}>{b.label}</span>
      ))}
    </>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", borderRadius: 16, padding: 14,
      border: "1px solid rgba(0,0,0,0.06)",
    }}>
      <div style={panelLabel}>{label}</div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "6px 12px", borderRadius: 10,
      background: "white", border: "1px solid rgba(0,0,0,0.08)",
      display: "flex", alignItems: "baseline", gap: 8,
    }}>
      <span style={{
        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
        color: "rgba(26,26,46,0.5)", letterSpacing: "0.1em",
      }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

// ── Styles ──

const tag: React.CSSProperties = {
  padding: "3px 9px", borderRadius: 999,
  background: "rgba(245,158,11,0.14)", color: "#b45309",
  fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
  fontFamily: "'JetBrains Mono', monospace",
};

const panelLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: "0.14em",
  textTransform: "uppercase", color: "rgba(26,26,46,0.55)",
  fontFamily: "'JetBrains Mono', monospace",
};

const petChip: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "6px 10px 6px 6px", borderRadius: 12,
  cursor: "pointer", color: "#1a1a2e",
  fontFamily: "'Space Grotesk',sans-serif",
  transition: "all 140ms ease",
};

const engineBtn: React.CSSProperties = {
  width: "100%", display: "flex", alignItems: "center",
  padding: "12px 14px", borderRadius: 12,
  background: "white", border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif",
  color: "#1a1a2e", textAlign: "left",
};

const suggestionChip: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "white", fontSize: 12, fontWeight: 600,
  color: "#1a1a2e", cursor: "pointer",
  fontFamily: "'Space Grotesk',sans-serif",
};

const btnGhost: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 14px", borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)", background: "white",
  color: "#1a1a2e", fontWeight: 700, fontSize: 12, cursor: "pointer",
  fontFamily: "'Space Grotesk',sans-serif", textDecoration: "none",
};

const generateBtn: React.CSSProperties = {
  width: "100%", padding: "20px 24px",
  borderRadius: 16, border: "none",
  background: "linear-gradient(135deg,#fbbf24,#f59e0b 70%,#ea580c)",
  color: "white", fontWeight: 800, fontSize: 19,
  fontFamily: "'Space Grotesk',sans-serif",
  boxShadow: "0 10px 32px rgba(245,158,11,0.40), inset 0 1px 0 rgba(255,255,255,0.25)",
  letterSpacing: "0.01em",
  transition: "transform 140ms ease, box-shadow 140ms ease",
};

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

interface Pet { id: number; name: string; avatar_url: string | null; species: number; level: number; }
interface StudioModel {
  id: string; displayName: string; provider: string; kind: "image" | "video";
  supportsImageRef: boolean; maxDurationSec: number; maxResolution: string;
  tier: "free" | "pro" | "studio"; creditsPerRun: number; description: string;
}
interface Generation {
  id: number; status: string; prompt: string | null;
  photo_path: string | null; video_path: string | null;
  created_at: string;
}

const PET_EMOJIS = ["🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶"];

const STYLES = [
  { id: "cinematic",     emoji: "🎬", label: "Cinematic",   hint: "Hollywood" },
  { id: "anime",         emoji: "✨", label: "Anime",       hint: "Japan" },
  { id: "photorealistic", emoji: "📷", label: "Photoreal",  hint: "Real" },
  { id: "watercolor",    emoji: "🎨", label: "Watercolor",  hint: "Soft" },
  { id: "pixar",         emoji: "🧸", label: "3D Pixar",    hint: "Toon" },
  { id: "pixel",         emoji: "👾", label: "Pixel",       hint: "Retro" },
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

const DEMO_PET: Pet = { id: -1, name: "Sparky", avatar_url: null, species: 0, level: 5 };

type View = "idle" | "generating" | "done" | "error";

export default function PetStudioPro() {
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [petId, setPetId] = useState<number | null>(null);
  const [models, setModels] = useState<StudioModel[]>([]);
  const [credits, setCredits] = useState(0);
  const [isDemo, setIsDemo] = useState(false);
  const [history, setHistory] = useState<Generation[]>([]);

  const [styleId, setStyleId] = useState<string>("cinematic");
  const [prompt, setPrompt] = useState("");
  const [chosenModelId, setChosenModelId] = useState<string>("kling-image-to-video");
  const [modelOpen, setModelOpen] = useState(false);

  const [view, setView] = useState<View>("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultIsDemo, setResultIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelMenuRef = useRef<HTMLDivElement>(null);
  const pet = pets?.find(p => p.id === petId) || null;
  const chosenModel = models.find(m => m.id === chosenModelId);

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
      .then(d => setModels((d?.models || []).filter((m: StudioModel) => m.kind === "video")))
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

  const generate = async () => {
    if (!canGenerate || !pet) return;
    const finalPrompt = buildFullPrompt();
    setView("generating");
    setError(null);
    setResultUrl(null);
    setResultIsDemo(false);

    if (isDemo) {
      await new Promise(r => setTimeout(r, 1800));
      setResultUrl("__demo__");
      setResultIsDemo(true);
      setView("done");
      return;
    }

    try {
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ modelId: chosenModelId, petId: pet.id, prompt: finalPrompt }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || "Generation failed"); setView("error"); return; }
      setCredits(data.creditsRemaining ?? credits);

      if (data.status === "completed" && data.url) {
        setResultUrl(data.url); setView("done"); refreshHistory(); return;
      }

      const jobId = data.generationId;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const r2 = await fetch(`/api/studio/generate/${jobId}`, { headers: getAuthHeaders() }).catch(() => null);
        if (!r2?.ok) continue;
        const d2 = await r2.json();
        if (d2.status === "completed") { setResultUrl(d2.url); setView("done"); refreshHistory(); return; }
        if (d2.status === "failed")    { setError(d2.error || "Generation failed"); setView("error"); return; }
      }
      setError("Timed out waiting for result. Check History.");
      setView("error");
    } catch (e: any) {
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
      padding: "28px 24px 60px",
    }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, paddingBottom: 4,
        }}>
          <span style={{ fontSize: 26 }}>🎬</span>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.015em", margin: 0 }}>
            Studio
          </h1>
          <span style={tag}>PRO VIDEO</span>
          <div style={{ flex: 1 }} />
          {isDemo && (
            <a href="/" style={{
              padding: "8px 14px", borderRadius: 10, fontSize: 12,
              background: "rgba(59,130,246,0.10)", color: "#1e3a8a",
              border: "1px solid rgba(59,130,246,0.25)",
              fontWeight: 700, textDecoration: "none",
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em",
            }}>💡 DEMO · Sign in →</a>
          )}
          <Pill label="CREDITS" value={String(credits)} />
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
              {view === "generating" && <PreviewGenerating />}
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
                        : <span style={{
                            width: 26, height: 26, borderRadius: 7,
                            background: "rgba(245,158,11,0.10)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 15,
                          }}>{PET_EMOJIS[p.species] || "🐾"}</span>}
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {STYLES.map(s => {
                  const sel = s.id === styleId;
                  return (
                    <button key={s.id} onClick={() => setStyleId(s.id)} style={{
                      ...styleCard,
                      background: sel ? "rgba(245,158,11,0.10)" : "white",
                      border: sel ? "2px solid #f59e0b" : "1px solid rgba(0,0,0,0.08)",
                    }}>
                      <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 4 }}>{s.emoji}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{s.label}</div>
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
                    zIndex: 20, maxHeight: 380, overflowY: "auto",
                  }}>
                    {models.map(m => {
                      const sel = m.id === chosenModelId;
                      return (
                        <button key={m.id} onClick={() => { setChosenModelId(m.id); setModelOpen(false); }} style={{
                          width: "100%", textAlign: "left", padding: 10, borderRadius: 10,
                          background: sel ? "rgba(245,158,11,0.10)" : "transparent",
                          border: "none", cursor: "pointer", color: "#1a1a2e",
                          fontFamily: "'Space Grotesk',sans-serif",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <strong style={{ fontSize: 13 }}>{m.displayName}</strong>
                            <ModelBadges model={m} compact />
                          </div>
                          <div style={{
                            fontSize: 11, color: "rgba(26,26,46,0.55)", marginTop: 4,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {m.maxDurationSec}s · {m.maxResolution} · {m.creditsPerRun} cr
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
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
            ? "Generating… 30 – 90s"
            : `▶  Generate · ${chosenModel?.creditsPerRun ?? 0} credits · ~30s`}
        </button>

        {/* ── Recent history strip ── */}
        {history.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ ...panelLabel, marginBottom: 8 }}>RECENT</div>
            <div style={{
              display: "flex", gap: 8, overflowX: "auto",
              paddingBottom: 6,
            }}>
              {history.map(g => (
                <button key={g.id} onClick={() => reusePrompt(g)} style={{
                  flexShrink: 0,
                  width: 120, height: 68, borderRadius: 10, overflow: "hidden",
                  border: "1px solid rgba(0,0,0,0.08)", background: "white",
                  cursor: "pointer", padding: 0,
                }} title={g.prompt || "(no prompt)"}>
                  {g.video_path || g.photo_path
                    ? <img src={g.video_path || g.photo_path || ""} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
  return (
    <div style={{ color: "rgba(255,255,255,0.85)", textAlign: "center", padding: 30 }}>
      {pet?.avatar_url ? (
        <img src={pet.avatar_url} alt={pet.name} style={{
          width: 80, height: 80, borderRadius: 16, objectFit: "cover",
          marginBottom: 14, opacity: 0.78,
        }} />
      ) : (
        <div style={{ fontSize: 48, marginBottom: 10, opacity: 0.6 }}>🎞</div>
      )}
      <div style={{ fontSize: 17, fontWeight: 700 }}>{pet ? `${pet.name} is ready` : "Pick a pet"}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
        Pick a style + write a prompt → Generate
      </div>
    </div>
  );
}

function PreviewGenerating() {
  return (
    <div style={{ color: "white", textAlign: "center", padding: 30 }}>
      <div className="studio-spin" style={{ fontSize: 44, marginBottom: 14 }}>🎞</div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>Generating</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
        30 – 90 seconds. Don't close the page.
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
        A 5-second video starring {pet?.name || "your pet"}
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

const styleCard: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  padding: "12px 6px", borderRadius: 10,
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
  width: "100%", padding: "16px",
  borderRadius: 14, border: "none",
  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  color: "white", fontWeight: 800, fontSize: 16,
  fontFamily: "'Space Grotesk',sans-serif",
  boxShadow: "0 6px 20px rgba(245,158,11,0.35)",
  letterSpacing: "0.02em",
};

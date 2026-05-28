"use client";

/**
 * Pet Studio — the video gen pivot.
 *
 * Three columns on desktop, stacked on mobile:
 *   1. LEFT: Pet selector + reference image preview ("your character")
 *   2. CENTER: Template gallery → click → prompt + model picker + Generate
 *   3. RIGHT: History strip (recent generations, click to play)
 *
 * Below: subscription tier strip (Free / Pro / Studio) for upsell.
 *
 * The story: pick your pet → pick a vibe → 60s later you have a sharable clip.
 */

import { useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

interface StudioModel {
  id: string; displayName: string; provider: string; kind: "image" | "video";
  supportsImageRef: boolean; maxDurationSec: number; maxResolution: string;
  tier: "free" | "pro" | "studio"; creditsPerRun: number; description: string;
}

interface TierLimits {
  monthlyVideoLimit: number; monthlyImageLimit: number;
  maxResolution: string; editorAccess: boolean; pricePerMonthUsd: number;
}

interface Template {
  id: string; category: string; title: string; emoji: string;
  description: string; suggestedModelId: string; previewPrompt: string; duration: number;
}

interface Generation {
  id: number; status: string; prompt: string | null;
  photo_path: string | null; video_path: string | null;
  error_message: string | null; created_at: string;
}

interface Pet { id: number; name: string; avatar_url: string | null; species: number; level: number; }

export default function PetStudio() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState<number | null>(null);
  const [models, setModels] = useState<StudioModel[]>([]);
  const [tiers, setTiers] = useState<Record<string, TierLimits>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<Generation[]>([]);
  const [credits, setCredits] = useState(0);

  const [chosenTemplate, setChosenTemplate] = useState<Template | null>(null);
  const [chosenModelId, setChosenModelId] = useState<string>("kling-image-to-video");
  const [customDirection, setCustomDirection] = useState("");
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<{ id: number; status: string; url?: string } | null>(null);

  const pet = pets.find(p => p.id === petId);
  const chosenModel = models.find(m => m.id === chosenModelId);

  // ── Load pets, models, templates ──
  useEffect(() => {
    fetch("/api/pets", { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list: Pet[] = (d?.pets || []).map((p: any) => ({
          id: p.id, name: p.name, avatar_url: p.avatar_url, species: p.species, level: p.level,
        }));
        setPets(list);
        if (list.length && !petId) setPetId(list[0].id);
      })
      .catch(() => {});

    fetch("/api/studio/providers")
      .then(r => r.ok ? r.json() : null)
      .then(d => { setModels(d?.models || []); setTiers(d?.tiers || {}); })
      .catch(() => {});

    refreshHistory();
  }, []);

  // ── Refresh templates whenever the active pet changes (personalized prompts) ──
  useEffect(() => {
    const url = petId ? `/api/studio/templates?petId=${petId}` : "/api/studio/templates";
    fetch(url, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => setTemplates(d?.templates || []))
      .catch(() => {});
  }, [petId]);

  const refreshHistory = () => {
    fetch("/api/studio/generate", { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setHistory(d?.generations || []);
        setCredits(d?.credits || 0);
      })
      .catch(() => {});
  };

  // ── Generate ──
  const generate = async () => {
    if (generating) return;
    if (!chosenTemplate && !customDirection.trim()) {
      setStatusMsg("Pick a template or write a prompt first.");
      return;
    }
    setGenerating(true);
    setStatusMsg("Submitting…");
    setActiveJob(null);

    try {
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          modelId: chosenModelId,
          petId,
          templateId: chosenTemplate?.id,
          prompt: chosenTemplate ? undefined : customDirection,
          customDirection: chosenTemplate ? customDirection : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(data?.error || "Generation failed");
        if (res.status === 402) {
          setStatusMsg(`Need ${data.required} credits (you have ${data.credits}). Buy more on the home page Pricing section.`);
        }
        return;
      }
      setCredits(data.creditsRemaining ?? credits);
      if (data.status === "completed") {
        setActiveJob({ id: data.generationId, status: "completed", url: data.url });
        setStatusMsg("Ready ✨");
        refreshHistory();
      } else {
        setActiveJob({ id: data.generationId, status: "running" });
        setStatusMsg("Generating… this usually takes 30-90s.");
        pollJob(data.generationId);
      }
    } catch (e: any) {
      setStatusMsg(e?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const pollJob = async (genId: number) => {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const r = await fetch(`/api/studio/generate/${genId}`, { headers: getAuthHeaders() }).catch(() => null);
      if (!r?.ok) continue;
      const d = await r.json();
      if (d.status === "completed") {
        setActiveJob({ id: d.generationId, status: "completed", url: d.url });
        setStatusMsg("Ready ✨");
        refreshHistory();
        return;
      }
      if (d.status === "failed") {
        setActiveJob({ id: d.generationId, status: "failed" });
        setStatusMsg(d.error || "Generation failed");
        return;
      }
    }
    setStatusMsg("Still working — refresh History to check later.");
  };

  const availableForKind = useMemo(() => {
    const kind = chosenTemplate ? "video" : "video"; // video-first for now
    return models.filter(m => m.kind === kind);
  }, [models, chosenTemplate]);

  // Sync default model when template picked
  useEffect(() => {
    if (chosenTemplate?.suggestedModelId && models.some(m => m.id === chosenTemplate.suggestedModelId)) {
      setChosenModelId(chosenTemplate.suggestedModelId);
    }
  }, [chosenTemplate, models]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #faf7f2 0%, #fff8eb 60%, #faf7f2 100%)",
      padding: "40px 24px 80px", fontFamily: "'Space Grotesk', sans-serif", color: "#1a1a2e",
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <span style={pill}>PET STUDIO · BETA</span>
          <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", margin: "10px 0 6px", lineHeight: 1.1 }}>
            Make a video starring {pet?.name || "your pet"}.
          </h1>
          <p style={{ fontSize: 15, color: "rgba(26,26,46,0.65)", maxWidth: 720, lineHeight: 1.55 }}>
            Pick a vibe. We send your pet through Kling, Veo, Wan, MiniMax — premium video models, one subscription.
            <span style={{ color: "#b45309", fontWeight: 600 }}> Credits: {credits}</span>
          </p>
        </div>

        {/* 3-column main */}
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 280px", gap: 18 }} className="studio-grid">
          {/* ── LEFT: pet selector ── */}
          <div style={col}>
            <SectionLabel>YOUR CHARACTER</SectionLabel>
            {pets.length === 0 ? (
              <div style={empty}>Adopt a pet first to start the studio.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {pets.map(p => (
                  <button key={p.id} onClick={() => setPetId(p.id)} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 12, cursor: "pointer",
                    border: petId === p.id ? "2px solid #f59e0b" : "1px solid rgba(0,0,0,0.08)",
                    background: petId === p.id ? "rgba(245,158,11,0.08)" : "white",
                    transition: "all 160ms ease",
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, overflow: "hidden",
                      background: "rgba(0,0,0,0.04)", flexShrink: 0,
                    }}>
                      {p.avatar_url ? <img src={p.avatar_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 20 }}>🐾</div>}
                    </div>
                    <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div style={{ fontSize: 10, fontFamily: "mono", color: "rgba(26,26,46,0.5)" }}>Lv.{p.level}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {pet?.avatar_url && (
              <div style={{ marginTop: 14 }}>
                <SectionLabel>REFERENCE PHOTO</SectionLabel>
                <div style={{
                  aspectRatio: "1/1", borderRadius: 12, overflow: "hidden",
                  background: "rgba(0,0,0,0.04)", marginTop: 8,
                }}>
                  <img src={pet.avatar_url} alt={pet.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(26,26,46,0.5)", marginTop: 6, fontFamily: "mono" }}>
                  Sent to image-anchored models as first frame.
                </div>
              </div>
            )}
          </div>

          {/* ── CENTER: template gallery + prompt + generate ── */}
          <div style={col}>
            {!chosenTemplate ? (
              <>
                <SectionLabel>PICK A TEMPLATE</SectionLabel>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 10, marginTop: 8,
                }}>
                  {templates.map(t => (
                    <button key={t.id} onClick={() => setChosenTemplate(t)} style={{
                      padding: 14, borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)",
                      background: "white", textAlign: "left", cursor: "pointer",
                      display: "flex", flexDirection: "column", gap: 6,
                      transition: "transform 160ms ease, box-shadow 160ms ease",
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 20px rgba(0,0,0,0.08)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = ""; }}
                    >
                      <div style={{ fontSize: 26 }}>{t.emoji}</div>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: "rgba(26,26,46,0.55)", lineHeight: 1.4 }}>{t.description}</div>
                      <div style={{ fontSize: 9, fontFamily: "mono", color: "rgba(26,26,46,0.4)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {t.category} · {t.duration}s
                      </div>
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 16, textAlign: "center" }}>
                  <button onClick={() => { setChosenTemplate(null); setCustomDirection(""); }} style={{
                    padding: "10px 18px", borderRadius: 10, border: "1px dashed rgba(26,26,46,0.2)",
                    background: "transparent", color: "rgba(26,26,46,0.65)", fontSize: 13, cursor: "pointer",
                  }}>
                    or write a freeform prompt below
                  </button>
                  <textarea
                    value={customDirection}
                    onChange={e => setCustomDirection(e.target.value)}
                    placeholder={`Describe a scene starring ${pet?.name || "your pet"}…`}
                    style={{
                      width: "100%", marginTop: 10, padding: 14, borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.1)", fontSize: 14,
                      fontFamily: "'Space Grotesk',sans-serif", resize: "vertical", minHeight: 80,
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 28 }}>{chosenTemplate.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{chosenTemplate.title}</div>
                    <div style={{ fontSize: 11, color: "rgba(26,26,46,0.5)" }}>{chosenTemplate.description}</div>
                  </div>
                  <button onClick={() => setChosenTemplate(null)} style={{
                    padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)",
                    background: "white", fontSize: 11, cursor: "pointer", color: "#1a1a2e",
                  }}>← back to templates</button>
                </div>

                <SectionLabel>PROMPT PREVIEW (auto-built)</SectionLabel>
                <div style={{
                  padding: 14, borderRadius: 10, background: "rgba(0,0,0,0.03)",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  color: "rgba(26,26,46,0.75)", lineHeight: 1.55,
                  border: "1px solid rgba(0,0,0,0.05)", marginTop: 6,
                }}>{chosenTemplate.previewPrompt}</div>

                <SectionLabel style={{ marginTop: 14 }}>CUSTOM DIRECTION (optional)</SectionLabel>
                <textarea
                  value={customDirection}
                  onChange={e => setCustomDirection(e.target.value)}
                  placeholder='e.g. "wearing a red bowtie" or "soft synthwave music vibe"'
                  style={{
                    width: "100%", marginTop: 6, padding: 12, borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.1)", fontSize: 13,
                    fontFamily: "'Space Grotesk',sans-serif", resize: "vertical", minHeight: 60,
                  }}
                />

                <SectionLabel style={{ marginTop: 14 }}>MODEL</SectionLabel>
                <select
                  value={chosenModelId}
                  onChange={e => setChosenModelId(e.target.value)}
                  style={{
                    width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.12)", fontSize: 13, background: "white",
                    fontFamily: "'Space Grotesk',sans-serif",
                  }}
                >
                  {availableForKind.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} · {m.tier.toUpperCase()} · {m.creditsPerRun} cr · {m.maxDurationSec}s {m.maxResolution}
                    </option>
                  ))}
                </select>
                {chosenModel && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "rgba(26,26,46,0.5)", lineHeight: 1.5 }}>
                    {chosenModel.description}
                    {chosenModel.supportsImageRef && pet?.avatar_url && (
                      <div style={{ marginTop: 4, color: "#16a34a", fontWeight: 600 }}>
                        ✓ Will use {pet.name}'s photo as character anchor
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={generate}
                  disabled={generating || (!chosenTemplate && !customDirection.trim())}
                  style={{
                    marginTop: 16, width: "100%", padding: "14px",
                    borderRadius: 12, border: "none",
                    background: generating ? "rgba(245,158,11,0.5)" : "linear-gradient(135deg,#fbbf24,#f59e0b)",
                    color: "white", fontSize: 15, fontWeight: 800, cursor: generating ? "wait" : "pointer",
                    boxShadow: generating ? "none" : "0 4px 16px rgba(245,158,11,0.32)",
                    fontFamily: "'Space Grotesk',sans-serif",
                  }}>
                  {generating ? "Generating…" : `Generate · ${chosenModel?.creditsPerRun ?? 0} credits`}
                </button>

                {statusMsg && (
                  <div style={{
                    marginTop: 12, padding: "10px 14px", borderRadius: 10,
                    background: activeJob?.status === "failed" ? "rgba(220,38,38,0.06)" :
                                activeJob?.status === "completed" ? "rgba(22,163,74,0.06)" :
                                "rgba(245,158,11,0.06)",
                    border: `1px solid ${activeJob?.status === "failed" ? "rgba(220,38,38,0.18)" :
                                          activeJob?.status === "completed" ? "rgba(22,163,74,0.18)" :
                                          "rgba(245,158,11,0.18)"}`,
                    fontSize: 13, fontFamily: "'Space Grotesk',sans-serif",
                    color: activeJob?.status === "failed" ? "#dc2626" :
                           activeJob?.status === "completed" ? "#16a34a" : "#b45309",
                  }}>
                    {statusMsg}
                  </div>
                )}

                {activeJob?.status === "completed" && activeJob.url && (
                  <div style={{
                    marginTop: 16, padding: 14, borderRadius: 12,
                    background: "white", border: "1px solid rgba(0,0,0,0.06)",
                  }}>
                    {activeJob.url.match(/\.(mp4|webm)$/i)
                      ? <video src={activeJob.url} controls style={{ width: "100%", borderRadius: 8 }} />
                      : <img src={activeJob.url} alt="result" style={{ width: "100%", borderRadius: 8 }} />}
                    <div style={{ marginTop: 10, fontSize: 12, color: "rgba(26,26,46,0.6)", display: "flex", gap: 8 }}>
                      <a href={activeJob.url} target="_blank" rel="noreferrer" style={{ color: "#b45309", fontWeight: 700 }}>Open ↗</a>
                      <span style={{ color: "rgba(26,26,46,0.3)" }}>·</span>
                      <a href={activeJob.url} download style={{ color: "#b45309", fontWeight: 700 }}>Download</a>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── RIGHT: history ── */}
          <div style={col}>
            <SectionLabel>RECENT</SectionLabel>
            {history.length === 0 ? (
              <div style={empty}>No generations yet. Try a template.</div>
            ) : (
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {history.slice(0, 12).map(g => (
                  <div key={g.id} style={{
                    padding: "10px 12px", borderRadius: 10,
                    background: "white", border: "1px solid rgba(0,0,0,0.06)",
                    display: "flex", gap: 10, alignItems: "center",
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 8, overflow: "hidden",
                      background: "rgba(0,0,0,0.04)", flexShrink: 0,
                    }}>
                      {g.photo_path && <img src={g.photo_path} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 11 }}>
                      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.status === "completed" ? "✓" : g.status === "failed" ? "✗" : "⏳"} {g.prompt?.slice(0, 40) || "(empty)"}
                      </div>
                      <div style={{ fontFamily: "mono", color: "rgba(26,26,46,0.45)", marginTop: 2 }}>
                        {new Date(g.created_at).toLocaleString()}
                      </div>
                    </div>
                    {g.video_path && (
                      <a href={g.video_path} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 700, color: "#b45309" }}>↗</a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Tier strip ── */}
        <div style={{ marginTop: 36 }}>
          <SectionLabel>SUBSCRIPTION TIERS</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
            {Object.entries(tiers).map(([tierName, limits]) => (
              <div key={tierName} style={{
                padding: 18, borderRadius: 14, background: "white",
                border: tierName === "pro" ? "2px solid #f59e0b" : "1px solid rgba(0,0,0,0.06)",
                position: "relative",
              }}>
                {tierName === "pro" && (
                  <div style={{
                    position: "absolute", top: -10, right: 14,
                    background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "white",
                    fontSize: 10, padding: "3px 10px", borderRadius: 999,
                    fontWeight: 700, fontFamily: "mono", letterSpacing: "0.06em",
                  }}>POPULAR</div>
                )}
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(26,26,46,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>{tierName}</div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
                  ${limits.pricePerMonthUsd}<span style={{ fontSize: 13, fontWeight: 500, color: "rgba(26,26,46,0.5)" }}>/mo</span>
                </div>
                <ul style={{ marginTop: 10, fontSize: 12, color: "rgba(26,26,46,0.7)", lineHeight: 1.8, listStyle: "none", padding: 0 }}>
                  <li>· {limits.monthlyVideoLimit} videos / mo</li>
                  <li>· {limits.monthlyImageLimit} images / mo</li>
                  <li>· Up to {limits.maxResolution}</li>
                  <li>· {limits.editorAccess ? "✓ In-browser editor" : "— editor (Pro+)"}</li>
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .studio-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const col: React.CSSProperties = {
  padding: 18, borderRadius: 16, background: "white",
  border: "1px solid rgba(0,0,0,0.06)",
};
const pill: React.CSSProperties = {
  display: "inline-block", padding: "5px 14px", borderRadius: 999,
  background: "rgba(245,158,11,0.10)", color: "#b45309",
  fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
  textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace",
};
const empty: React.CSSProperties = {
  fontSize: 12, color: "rgba(26,26,46,0.4)", fontStyle: "italic", padding: "12px 0",
};
function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
      textTransform: "uppercase", color: "rgba(26,26,46,0.5)",
      fontFamily: "'JetBrains Mono', monospace", ...style,
    }}>{children}</div>
  );
}

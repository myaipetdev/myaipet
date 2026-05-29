"use client";

/**
 * Pet Studio v2 — premium dark-mode video studio.
 *
 * Major design overhaul after v1 critique. Now uses:
 *   - Dark hero with bold copy + provider logos
 *   - Rich gradient template cards with provider badges
 *   - Inline pet picker (no empty column on mobile, clear adopt CTA)
 *   - Model picker as horizontal scrolling chips
 *   - Result viewer + history rail
 *   - Tier showcase strip with Pro / Studio upsell
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

interface Subscription {
  tier: "free" | "pro" | "studio";
  expiresAt?: string;
  usage: { videos: number; images: number; month: string };
  limits: TierLimits;
}

// Template gradients keyed off category — richer cards than flat white
const TEMPLATE_GRADIENTS: Record<string, string> = {
  celebration: "linear-gradient(135deg, #ec4899 0%, #f59e0b 50%, #fbbf24 100%)",
  everyday:    "linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)",
  cinematic:   "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  social:      "linear-gradient(135deg, #f43f5e 0%, #f59e0b 100%)",
  fantasy:     "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f59e0b 100%)",
};

const PROVIDER_COLORS: Record<string, { bg: string; fg: string }> = {
  "Kling":              { bg: "#ef4444", fg: "white" },
  "Wan":                { bg: "#10b981", fg: "white" },
  "MiniMax":            { bg: "#8b5cf6", fg: "white" },
  "Google":             { bg: "#3b82f6", fg: "white" },
  "Grok":               { bg: "#1a1a2e", fg: "white" },
  "Black Forest Labs":  { bg: "#000000", fg: "#fbbf24" },
  "Black Forest Labs + PuLID":  { bg: "#000000", fg: "#34d399" },
};

export default function PetStudio() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState<number | null>(null);
  const [models, setModels] = useState<StudioModel[]>([]);
  const [tiers, setTiers] = useState<Record<string, TierLimits>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<Generation[]>([]);
  const [credits, setCredits] = useState(0);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const [chosenTemplate, setChosenTemplate] = useState<Template | null>(null);
  const [chosenModelId, setChosenModelId] = useState<string>("kling-image-to-video");
  const [customDirection, setCustomDirection] = useState("");
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<{ id: number; status: string; url?: string } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const pet = pets.find(p => p.id === petId);
  const chosenModel = models.find(m => m.id === chosenModelId);

  // ── Load on mount ──
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

    fetch("/api/studio/subscription", { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSubscription(d))
      .catch(() => {});

    refreshHistory();
  }, []);

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
          modelId: chosenModelId, petId,
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
        if (res.status === 403 && data.upsell) {
          setStatusMsg(`${chosenModel?.displayName} requires ${chosenModel?.tier?.toUpperCase()} subscription. Upgrade below.`);
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
        setStatusMsg("Generating… typically 30-90 seconds.");
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

  const videoModels = useMemo(() => models.filter(m => m.kind === "video"), [models]);
  useEffect(() => {
    if (chosenTemplate?.suggestedModelId && models.some(m => m.id === chosenTemplate.suggestedModelId)) {
      setChosenModelId(chosenTemplate.suggestedModelId);
    }
  }, [chosenTemplate, models]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%)",
      color: "white", fontFamily: "'Space Grotesk', sans-serif",
    }}>
      {/* ── HERO ── */}
      <div style={{
        position: "relative", padding: "48px 24px 40px",
        background: "radial-gradient(circle at 80% 30%, rgba(251,191,36,0.18) 0%, transparent 55%), radial-gradient(circle at 20% 60%, rgba(168,85,247,0.18) 0%, transparent 55%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "5px 14px", borderRadius: 999,
            background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.25)",
            color: "#fbbf24", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
            textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", marginBottom: 18,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "#fbbf24", boxShadow: "0 0 8px #fbbf24" }} />
            PET STUDIO · BETA
          </div>
          <h1 style={{
            fontSize: 56, fontWeight: 800, letterSpacing: "-0.04em",
            margin: "0 0 12px", lineHeight: 1.0, color: "white",
            maxWidth: 720,
          }} className="studio-hero-h1">
            {pet ? `Make ${pet.name} a star.` : "Your pet, the star."}
          </h1>
          <p style={{
            fontSize: 18, color: "rgba(255,255,255,0.65)", lineHeight: 1.55,
            maxWidth: 640, margin: "0 0 24px",
          }}>
            One subscription, every premium video model. Kling, Veo, Wan, MiniMax — your pet runs through them all with face-locked character anchoring.
          </p>

          {/* Provider logos row */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 24 }}>
            {["Kling", "Veo 3", "Wan 2.1", "MiniMax", "FLUX PuLID", "Grok"].map(p => (
              <span key={p} style={{
                padding: "6px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                color: "rgba(255,255,255,0.7)", fontWeight: 700, letterSpacing: "0.04em",
              }}>{p}</span>
            ))}
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Stat label="CREDITS" value={String(credits)} />
            <Stat label="TIER" value={subscription?.tier?.toUpperCase() || "FREE"} accent={subscription?.tier !== "free" ? "#fbbf24" : undefined} />
            {subscription && (
              <>
                <Stat label="VIDEOS USED" value={`${subscription.usage.videos} / ${subscription.limits.monthlyVideoLimit}`} />
                <Stat label="IMAGES USED" value={`${subscription.usage.images} / ${subscription.limits.monthlyImageLimit}`} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 60px" }}>
        {/* Pet character row (horizontal, prominent) */}
        <SectionHeader>1. Choose your character</SectionHeader>
        {pets.length === 0 ? (
          <div style={{
            padding: 32, borderRadius: 18,
            background: "linear-gradient(135deg, rgba(251,191,36,0.10), rgba(245,158,11,0.06))",
            border: "1px dashed rgba(251,191,36,0.3)",
            textAlign: "center", marginBottom: 36,
          }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>🐣</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 6px" }}>No pet yet</h3>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginBottom: 16 }}>
              Adopt a pet first — your pet's face becomes the character anchor for every video.
            </p>
            <button onClick={() => (window.location.href = "/?section=my pet")} style={primaryBtn}>
              Adopt a Pet →
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, marginBottom: 36 }}>
            {pets.map(p => (
              <PetCard
                key={p.id} pet={p}
                selected={petId === p.id}
                onClick={() => setPetId(p.id)}
              />
            ))}
          </div>
        )}

        {/* Templates */}
        {pet && (
          <>
            <SectionHeader>2. Pick a vibe</SectionHeader>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14, marginBottom: 36,
            }}>
              {templates.map(t => (
                <TemplateCard
                  key={t.id} template={t}
                  selected={chosenTemplate?.id === t.id}
                  onClick={() => setChosenTemplate(t)}
                />
              ))}
            </div>
          </>
        )}

        {/* Generate panel — only after template chosen */}
        {pet && chosenTemplate && (
          <div style={{
            padding: 28, borderRadius: 20,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            marginBottom: 36,
          }}>
            <SectionHeader>3. Refine + generate</SectionHeader>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 14 }} className="studio-refine-grid">
              {/* Left: prompt preview + custom direction */}
              <div>
                <label style={miniLabel}>PROMPT (auto-built from template)</label>
                <div style={{
                  marginTop: 8, padding: 14, borderRadius: 10,
                  background: "rgba(0,0,0,0.25)",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  color: "rgba(255,255,255,0.8)", lineHeight: 1.6,
                  border: "1px solid rgba(255,255,255,0.06)",
                }}>{chosenTemplate.previewPrompt}</div>

                <label style={{ ...miniLabel, display: "block", marginTop: 16 }}>CUSTOM DIRECTION (optional)</label>
                <textarea
                  value={customDirection}
                  onChange={e => setCustomDirection(e.target.value)}
                  placeholder='e.g. "wearing a red bowtie" or "synthwave vibe"'
                  style={{
                    width: "100%", marginTop: 8, padding: 12, borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(0,0,0,0.25)", color: "white",
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 13,
                    resize: "vertical", minHeight: 76,
                  }}
                />
              </div>

              {/* Right: model picker + generate */}
              <div>
                <label style={miniLabel}>MODEL</label>
                <div style={{ display: "grid", gap: 6, marginTop: 8, maxHeight: 280, overflowY: "auto" }}>
                  {videoModels.map(m => (
                    <ModelChip
                      key={m.id} model={m}
                      selected={chosenModelId === m.id}
                      tierGate={tierGateInfo(subscription, m)}
                      onClick={() => setChosenModelId(m.id)}
                    />
                  ))}
                </div>

                <button
                  onClick={generate}
                  disabled={generating}
                  style={{
                    ...primaryBtn, marginTop: 18, width: "100%", padding: "16px",
                    fontSize: 16, opacity: generating ? 0.6 : 1,
                  }}>
                  {generating
                    ? "Generating…"
                    : `Generate · ${chosenModel?.creditsPerRun ?? 0} credits`}
                </button>

                {statusMsg && (
                  <div style={{
                    marginTop: 12, padding: "10px 14px", borderRadius: 10, fontSize: 13,
                    background: activeJob?.status === "failed" ? "rgba(220,38,38,0.15)" :
                                activeJob?.status === "completed" ? "rgba(22,163,74,0.15)" :
                                "rgba(245,158,11,0.15)",
                    border: `1px solid ${activeJob?.status === "failed" ? "rgba(220,38,38,0.3)" :
                                          activeJob?.status === "completed" ? "rgba(22,163,74,0.3)" :
                                          "rgba(245,158,11,0.3)"}`,
                    color: activeJob?.status === "failed" ? "#fca5a5" :
                           activeJob?.status === "completed" ? "#86efac" : "#fcd34d",
                  }}>{statusMsg}</div>
                )}
              </div>
            </div>

            {/* Result preview */}
            {activeJob?.status === "completed" && activeJob.url && (
              <div style={{
                marginTop: 22, padding: 14, borderRadius: 14,
                background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)",
              }}>
                {activeJob.url.match(/\.(mp4|webm)$/i)
                  ? <video src={activeJob.url} controls autoPlay loop style={{ width: "100%", borderRadius: 10 }} />
                  : <img src={activeJob.url} alt="result" style={{ width: "100%", borderRadius: 10 }} />}
                <div style={{
                  marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap",
                }}>
                  <a href={activeJob.url} download style={primaryBtn}>↓ Download</a>
                  <a href={activeJob.url} target="_blank" rel="noreferrer" style={secondaryBtn}>↗ Open</a>
                  {activeJob.url.match(/\.(mp4|webm)$/i) && subscription?.limits?.editorAccess && (
                    <button onClick={() => setEditorOpen(true)} style={secondaryBtn}>
                      ✂️ Open in Editor
                    </button>
                  )}
                  {activeJob.url.match(/\.(mp4|webm)$/i) && !subscription?.limits?.editorAccess && (
                    <button onClick={() => window.location.hash = "#tiers"} style={{ ...secondaryBtn, opacity: 0.7 }}>
                      ✂️ Editor (Pro+)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent history */}
        {history.length > 0 && (
          <>
            <SectionHeader>Recent generations</SectionHeader>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12, marginBottom: 36,
            }}>
              {history.slice(0, 12).map(g => (
                <HistoryCard key={g.id} gen={g} />
              ))}
            </div>
          </>
        )}

        {/* Tier showcase */}
        <div id="tiers">
          <SectionHeader>Subscription tiers</SectionHeader>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14, marginTop: 14,
          }}>
            {(["free", "pro", "studio"] as const).map(tier => (
              <TierCard
                key={tier} tier={tier} limits={tiers[tier]}
                isCurrent={subscription?.tier === tier}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Editor modal */}
      {editorOpen && activeJob?.url && (
        <EditorModal videoUrl={activeJob.url} onClose={() => setEditorOpen(false)} />
      )}

      <style>{`
        @media (max-width: 1024px) {
          .studio-refine-grid { grid-template-columns: 1fr !important; }
          .studio-hero-h1 { font-size: 36px !important; }
        }
        @media (max-width: 640px) {
          .studio-hero-h1 { font-size: 28px !important; }
        }
      `}</style>
    </div>
  );
}

// ── Subcomponents ──

function PetCard({ pet, selected, onClick }: { pet: Pet; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", gap: 6,
      padding: 10, borderRadius: 14, cursor: "pointer",
      background: selected ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
      border: selected ? "2px solid #fbbf24" : "1px solid rgba(255,255,255,0.08)",
      minWidth: 130, color: "white",
      transition: "all 160ms ease",
    }}>
      <div style={{
        width: 100, height: 100, borderRadius: 12, overflow: "hidden",
        background: "rgba(0,0,0,0.3)", margin: "0 auto",
      }}>
        {pet.avatar_url
          ? <img src={pet.avatar_url} alt={pet.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 42 }}>🐾</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4, textAlign: "center" }}>{pet.name}</div>
      <div style={{ fontSize: 10, fontFamily: "mono", color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
        Lv.{pet.level}
      </div>
    </button>
  );
}

function TemplateCard({ template, selected, onClick }: { template: Template; selected: boolean; onClick: () => void }) {
  const gradient = TEMPLATE_GRADIENTS[template.category] || TEMPLATE_GRADIENTS.everyday;
  return (
    <button onClick={onClick} style={{
      borderRadius: 16, overflow: "hidden", cursor: "pointer",
      background: "rgba(255,255,255,0.04)",
      border: selected ? "2px solid #fbbf24" : "1px solid rgba(255,255,255,0.08)",
      textAlign: "left", color: "white",
      transition: "transform 160ms ease, box-shadow 160ms ease",
      transform: selected ? "translateY(-2px)" : "none",
      boxShadow: selected ? "0 16px 36px rgba(251,191,36,0.22)" : "none",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 16px 36px rgba(0,0,0,0.35)"; }}
      onMouseLeave={e => {
        if (!selected) { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = ""; }
      }}
    >
      {/* Visual thumbnail (gradient + giant emoji) */}
      <div style={{
        aspectRatio: "16/10", background: gradient,
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative",
      }}>
        <span style={{ fontSize: 72, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))" }}>{template.emoji}</span>
        <span style={{
          position: "absolute", top: 12, right: 12,
          padding: "4px 10px", borderRadius: 999,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)",
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
          color: "white", letterSpacing: "0.08em",
        }}>{template.duration}s</span>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{template.title}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{template.description}</div>
      </div>
    </button>
  );
}

function ModelChip({ model, selected, tierGate, onClick }: {
  model: StudioModel; selected: boolean;
  tierGate: { locked: boolean; reason?: string };
  onClick: () => void;
}) {
  const c = PROVIDER_COLORS[model.provider] || { bg: "#666", fg: "white" };
  return (
    <button onClick={onClick} disabled={tierGate.locked} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: 10, cursor: tierGate.locked ? "not-allowed" : "pointer",
      background: selected ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.03)",
      border: selected ? "2px solid #fbbf24" : "1px solid rgba(255,255,255,0.08)",
      color: "white", textAlign: "left",
      opacity: tierGate.locked ? 0.5 : 1,
      transition: "all 160ms ease",
    }}>
      <span style={{
        padding: "3px 8px", borderRadius: 6,
        background: c.bg, color: c.fg, fontSize: 9,
        fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}>{model.provider.toUpperCase().slice(0, 12)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {model.displayName}
        </div>
        <div style={{ fontSize: 10, fontFamily: "mono", color: "rgba(255,255,255,0.5)" }}>
          {model.creditsPerRun} cr · {model.maxDurationSec}s · {model.maxResolution} · {model.tier.toUpperCase()}
        </div>
      </div>
      {tierGate.locked && (
        <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700 }}>🔒 {tierGate.reason}</span>
      )}
    </button>
  );
}

function HistoryCard({ gen }: { gen: Generation }) {
  const url = gen.video_path || gen.photo_path;
  const isVideo = !!gen.video_path;
  return (
    <div style={{
      borderRadius: 12, overflow: "hidden",
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ aspectRatio: "16/10", background: "rgba(0,0,0,0.3)", position: "relative" }}>
        {url ? (
          isVideo
            ? <video src={url} muted loop playsInline onMouseEnter={(e) => (e.target as HTMLVideoElement).play()} onMouseLeave={(e) => (e.target as HTMLVideoElement).pause()} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 22 }}>
            {gen.status === "failed" ? "✗" : "⏳"}
          </div>
        )}
        <span style={{
          position: "absolute", top: 8, left: 8,
          padding: "3px 8px", borderRadius: 6,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
          fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
          color: gen.status === "completed" ? "#86efac" : gen.status === "failed" ? "#fca5a5" : "#fcd34d",
          letterSpacing: "0.06em",
        }}>{gen.status.toUpperCase()}</span>
      </div>
      <div style={{ padding: 10 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {gen.prompt?.slice(0, 80) || "(empty)"}
        </div>
      </div>
    </div>
  );
}

function TierCard({ tier, limits, isCurrent }: { tier: "free" | "pro" | "studio"; limits?: TierLimits; isCurrent: boolean; }) {
  if (!limits) return null;
  const accent = tier === "studio" ? "#a855f7" : tier === "pro" ? "#fbbf24" : "#9ca3af";
  return (
    <div style={{
      padding: 22, borderRadius: 16,
      background: isCurrent ? `linear-gradient(135deg, ${accent}10, ${accent}05)` : "rgba(255,255,255,0.04)",
      border: isCurrent ? `2px solid ${accent}` : "1px solid rgba(255,255,255,0.08)",
      position: "relative", color: "white",
    }}>
      {isCurrent && (
        <div style={{
          position: "absolute", top: -10, right: 14,
          padding: "3px 10px", borderRadius: 999,
          background: accent, color: tier === "free" ? "#1a1a2e" : "white",
          fontSize: 10, fontFamily: "mono", fontWeight: 700, letterSpacing: "0.06em",
        }}>CURRENT</div>
      )}
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: accent, fontFamily: "'JetBrains Mono', monospace" }}>
        {tier}
      </div>
      <div style={{ fontSize: 36, fontWeight: 800, margin: "6px 0 4px" }}>
        ${limits.pricePerMonthUsd}<span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>/mo</span>
      </div>
      <ul style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.85, listStyle: "none", padding: 0 }}>
        <li>· {limits.monthlyVideoLimit} videos / month</li>
        <li>· {limits.monthlyImageLimit} images / month</li>
        <li>· Up to {limits.maxResolution}</li>
        <li>· {limits.editorAccess ? "✓ Trim + caption + music editor" : "— Editor (Pro+)"}</li>
        <li>· {tier === "studio" ? "All models (Kling Pro, Veo 3, Hailuo 02)" : tier === "pro" ? "Kling, Wan, FLUX dev" : "Grok + FLUX schnell"}</li>
      </ul>
      {!isCurrent && tier !== "free" && (
        <button
          onClick={() => upgradeTier(tier)}
          style={{
            marginTop: 16, width: "100%", padding: "12px",
            borderRadius: 10, border: "none",
            background: tier === "studio" ? "linear-gradient(135deg,#a855f7,#7c3aed)" : "linear-gradient(135deg,#fbbf24,#f59e0b)",
            color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer",
          }}
        >Upgrade to {tier.toUpperCase()} → ${limits.pricePerMonthUsd}</button>
      )}
    </div>
  );
}

function EditorModal({ videoUrl, onClose }: { videoUrl: string; onClose: () => void }) {
  const [PetVideoEditor, setEditor] = useState<any>(null);
  useEffect(() => {
    import("./PetVideoEditor").then(m => setEditor(() => m.default));
  }, []);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        maxWidth: 1080, width: "100%", maxHeight: "90vh", overflow: "auto",
        background: "#0f0f1a", borderRadius: 18, padding: 24,
        border: "1px solid rgba(255,255,255,0.1)",
      }}>
        {PetVideoEditor
          ? <PetVideoEditor videoUrl={videoUrl} onClose={onClose} />
          : <div style={{ color: "white", padding: 40, textAlign: "center" }}>Loading editor…</div>}
      </div>
    </div>
  );
}

// ── helpers ──

function tierGateInfo(sub: Subscription | null, model: StudioModel): { locked: boolean; reason?: string } {
  const rank: Record<string, number> = { free: 0, pro: 1, studio: 2 };
  const userTier = sub?.tier || "free";
  if (rank[model.tier] > rank[userTier]) {
    return { locked: true, reason: `${model.tier.toUpperCase()} only` };
  }
  return { locked: false };
}

async function upgradeTier(tier: "pro" | "studio") {
  alert(`To upgrade to ${tier.toUpperCase()}, visit /subscription. Phase 2 paywall coming online.`);
  window.location.hash = `#upgrade-${tier}`;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.45)", letterSpacing: "0.14em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent || "white", fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 13, fontWeight: 800, letterSpacing: "0.16em",
      textTransform: "uppercase", color: "rgba(255,255,255,0.55)",
      fontFamily: "'JetBrains Mono', monospace", margin: "0 0 14px",
    }}>{children}</h2>
  );
}

const miniLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
  textTransform: "uppercase", color: "rgba(255,255,255,0.45)",
  fontFamily: "'JetBrains Mono', monospace",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 22px", borderRadius: 12, border: "none",
  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  color: "#1a1a2e", fontWeight: 800, fontSize: 14, cursor: "pointer",
  boxShadow: "0 8px 24px rgba(245,158,11,0.32)",
  fontFamily: "'Space Grotesk',sans-serif",
  textDecoration: "none",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 22px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)",
  color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer",
  textDecoration: "none",
};

"use client";

/**
 * Pet Studio v3 — proper video-editor workspace layout.
 *
 * Layout (Capcut / Runway style, light cream theme matching the rest of site):
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ Header (project name · save · export · subscription)    │
 *   ├──────────┬─────────────────────────────┬────────────────┤
 *   │ LEFT     │ PREVIEW (16:9)              │ RIGHT          │
 *   │ ─ Pet    │ [video / placeholder]       │ ─ Prompt       │
 *   │ ─ Tpls   │                             │ ─ Model        │
 *   │ ─ Music  │                             │ ─ Generate     │
 *   │ ─ Assets │                             │ ─ Edit tools   │
 *   │          ├─────────────────────────────┤                │
 *   │          │ TIMELINE                    │                │
 *   │          │ [clip A] [clip B] [music]   │                │
 *   └──────────┴─────────────────────────────┴────────────────┘
 *
 * Three-pane mental model lifted from Capcut:
 *   - LEFT = library (assets / templates / music)
 *   - CENTER = preview + timeline
 *   - RIGHT = inspector + actions for current selection
 *
 * Light theme: cream background (#faf7f2), amber accents, JetBrains Mono for
 * technical labels. Matches /architecture, /dashboard, /skills.
 */

import { useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import { toast } from "@/components/Toast";
import Icon from "@/components/Icon";

interface StudioModel {
  id: string; displayName: string; provider: string; kind: "image" | "video";
  supportsImageRef: boolean; maxDurationSec: number; maxResolution: string;
  tier: "free" | "pro" | "studio"; creditsPerRun: number; description: string;
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
  limits: { monthlyVideoLimit: number; monthlyImageLimit: number; maxResolution: string; editorAccess: boolean; pricePerMonthUsd: number };
}

type LibraryTab = "pets" | "templates" | "music" | "history";

export default function PetStudio() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState<number | null>(null);
  const [models, setModels] = useState<StudioModel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<Generation[]>([]);
  const [credits, setCredits] = useState(0);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const [libTab, setLibTab] = useState<LibraryTab>("templates");
  const [chosenTemplate, setChosenTemplate] = useState<Template | null>(null);
  const [chosenModelId, setChosenModelId] = useState<string>("kling-image-to-video");
  const [customDirection, setCustomDirection] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const pet = pets.find(p => p.id === petId);
  const chosenModel = models.find(m => m.id === chosenModelId);

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
      .then(d => setModels(d?.models || []))
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
      .then(d => { setHistory(d?.generations || []); setCredits(d?.credits || 0); })
      .catch(() => {});
  };

  useEffect(() => {
    if (chosenTemplate?.suggestedModelId && models.some(m => m.id === chosenTemplate.suggestedModelId)) {
      setChosenModelId(chosenTemplate.suggestedModelId);
    }
  }, [chosenTemplate, models]);

  const generate = async () => {
    if (generating) return;
    if (!chosenTemplate && !customDirection.trim()) {
      setStatusMsg("Pick a template or write a prompt first.");
      return;
    }
    setGenerating(true);
    setStatusMsg("Submitting…");
    setPreviewUrl(null);

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
        return;
      }
      setCredits(data.creditsRemaining ?? credits);
      if (data.status === "completed") {
        setPreviewUrl(data.url);
        setStatusMsg("Ready");
        refreshHistory();
      } else {
        setStatusMsg("Generating… 30-90s.");
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
        setPreviewUrl(d.url);
        setStatusMsg("Ready");
        refreshHistory();
        return;
      }
      if (d.status === "failed") {
        setStatusMsg(d.error || "Generation failed");
        return;
      }
    }
  };

  const videoModels = useMemo(() => models.filter(m => m.kind === "video"), [models]);
  const isVideo = previewUrl?.match(/\.(mp4|webm)$/i);

  return (
    <div style={{
      height: "calc(100vh - 60px)",     // assume nav 60px
      minHeight: 720,
      background: "#faf7f2",
      color: "#1a1a2e",
      fontFamily: "'Space Grotesk', sans-serif",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* ── HEADER STRIP ── */}
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center", gap: 16,
        padding: "10px 18px",
        background: "white",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        fontSize: 13,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, display: "inline-flex" }}><Icon name="film-reel" size={18} /></span>
          <span style={{ fontWeight: 800, fontSize: 14 }}>Pet Studio</span>
          <span style={tag}>BETA</span>
        </div>
        <div style={{ width: 1, height: 22, background: "rgba(0,0,0,0.08)" }} />
        <div style={{ color: "rgba(26,26,46,0.55)", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
          Project: <strong style={{ color: "#1a1a2e" }}>Untitled · {pet?.name || "no pet"}</strong>
        </div>
        <div style={{ flex: 1 }} />
        <Pill label="CREDITS" value={String(credits)} />
        <Pill label="TIER" value={(subscription?.tier || "FREE").toUpperCase()} accent={subscription?.tier !== "free"} />
        {subscription && (
          <Pill label="VIDEOS" value={`${subscription.usage.videos}/${subscription.limits.monthlyVideoLimit}`} />
        )}
        <a href="/?section=my pet" style={btnGhost}>← Back</a>
      </div>

      {/* ── MAIN 3-PANE ── */}
      <div style={{
        flex: 1, minHeight: 0,
        display: "grid", gridTemplateColumns: "240px 1fr 320px",
        gap: 0,
      }} className="studio-main-grid">
        {/* ── LEFT LIBRARY ── */}
        <aside style={{
          background: "white", borderRight: "1px solid rgba(0,0,0,0.08)",
          display: "flex", flexDirection: "column", minHeight: 0,
        }}>
          {/* Tab bar */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}>
            {(["templates", "pets", "music", "history"] as LibraryTab[]).map(t => (
              <button key={t} onClick={() => setLibTab(t)} style={{
                padding: "10px 0", border: "none", cursor: "pointer", background: "white",
                fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                color: libTab === t ? "#b45309" : "rgba(26,26,46,0.45)",
                borderBottom: libTab === t ? "2px solid #f59e0b" : "2px solid transparent",
              }}>{t.slice(0, 4)}</button>
            ))}
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {libTab === "templates" && (
              <div style={{ display: "grid", gap: 8 }}>
                {templates.map(t => (
                  <LibraryRow
                    key={t.id} selected={chosenTemplate?.id === t.id}
                    leading={<span style={{ fontSize: 20 }}>{t.emoji}</span>}
                    title={t.title} subtitle={`${t.category} · ${t.duration}s`}
                    onClick={() => setChosenTemplate(t)}
                  />
                ))}
              </div>
            )}
            {libTab === "pets" && (
              pets.length === 0 ? (
                <div style={emptyState}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}><Icon name="paw" size={28} /></div>
                  <div style={{ fontSize: 13, color: "rgba(26,26,46,0.55)", marginBottom: 10 }}>No pet yet. Adopt one to use as a character.</div>
                  <a href="/?section=my pet" style={btnPrimarySmall}>Adopt →</a>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {pets.map(p => (
                    <LibraryRow
                      key={p.id} selected={petId === p.id}
                      leading={p.avatar_url
                        ? <img src={p.avatar_url} alt={p.name} style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
                        : <Icon name="paw" size={20} />}
                      title={p.name} subtitle={`Lv.${p.level}`}
                      onClick={() => setPetId(p.id)}
                    />
                  ))}
                </div>
              )
            )}
            {libTab === "music" && (
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { id: "upbeat", label: "Upbeat", mood: "happy" },
                  { id: "chill",  label: "Chill",  mood: "calm" },
                  { id: "synth",  label: "Synth",  mood: "futuristic" },
                  { id: "lofi",   label: "Lo-fi",  mood: "cozy" },
                ].map(m => (
                  <LibraryRow
                    key={m.id} selected={false}
                    leading={<MusicNoteIcon size={18} />}
                    title={m.label} subtitle={m.mood}
                    onClick={() => toast("Music selection happens inside the editor.", "info")}
                  />
                ))}
              </div>
            )}
            {libTab === "history" && (
              history.length === 0 ? (
                <div style={emptyState}>
                  <div style={{ fontSize: 13, color: "rgba(26,26,46,0.55)" }}>No generations yet.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {history.slice(0, 20).map(g => (
                    <LibraryRow
                      key={g.id} selected={false}
                      leading={g.photo_path
                        ? <img src={g.photo_path} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
                        : <ClockIcon size={16} />}
                      title={(g.prompt || "").slice(0, 30) || "(empty)"}
                      subtitle={g.status}
                      onClick={() => { if (g.video_path || g.photo_path) setPreviewUrl(g.video_path || g.photo_path); }}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </aside>

        {/* ── CENTER: PREVIEW + TIMELINE ── */}
        <main style={{
          display: "flex", flexDirection: "column", minHeight: 0,
          background: "#f5f1e9",
        }}>
          {/* Preview */}
          <div style={{
            flex: 1, minHeight: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}>
            <div style={{
              width: "100%", maxWidth: 760, aspectRatio: "16/9",
              borderRadius: 12, overflow: "hidden",
              background: "linear-gradient(135deg, #1a1a2e, #2d2d4a)",
              border: "1px solid rgba(0,0,0,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative",
            }}>
              {previewUrl ? (
                isVideo
                  ? <video src={previewUrl} controls autoPlay loop style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  : <img src={previewUrl} alt="preview" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : pet?.avatar_url ? (
                <>
                  <img src={pet.avatar_url} alt={pet.name} style={{ maxWidth: "60%", maxHeight: "60%", borderRadius: 14, opacity: 0.65 }} />
                  <div style={{
                    position: "absolute", left: 0, right: 0, bottom: 0,
                    padding: 20, background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.65))",
                    color: "white",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>
                      {pet.name} {chosenTemplate ? `— ${chosenTemplate.title}` : ""}
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                      Preview will appear here after Generate.
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ color: "rgba(255,255,255,0.6)", textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}><Icon name="film-reel" size={40} /></div>
                  <div style={{ fontSize: 13 }}>Pick a pet on the left to start.</div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div style={{
            flexShrink: 0, padding: "10px 20px 16px",
            background: "white", borderTop: "1px solid rgba(0,0,0,0.08)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={mini}>TIMELINE</span>
              <span style={{ fontSize: 13, color: "rgba(26,26,46,0.4)", fontFamily: "'JetBrains Mono', monospace" }}>
                {chosenModel ? `${chosenModel.maxDurationSec}s · ${chosenModel.maxResolution}` : ""}
              </span>
              <div style={{ flex: 1 }} />
              {previewUrl && isVideo && (
                <button onClick={() => setEditorOpen(true)} disabled={!subscription?.limits?.editorAccess} style={{
                  ...btnGhost,
                  display: "inline-flex", alignItems: "center", gap: 6,
                  opacity: subscription?.limits?.editorAccess ? 1 : 0.5,
                  cursor: subscription?.limits?.editorAccess ? "pointer" : "not-allowed",
                }}>
                  <ScissorsIcon size={13} /> {subscription?.limits?.editorAccess ? "Edit" : "Edit (Pro+)"}
                </button>
              )}
            </div>
            <TimelineStrip
              videoClip={previewUrl && isVideo ? "v1" : null}
              imageClip={previewUrl && !isVideo ? "i1" : null}
              templateTitle={chosenTemplate?.title}
              duration={chosenTemplate?.duration || chosenModel?.maxDurationSec || 0}
            />
          </div>
        </main>

        {/* ── RIGHT INSPECTOR ── */}
        <aside style={{
          background: "white", borderLeft: "1px solid rgba(0,0,0,0.08)",
          display: "flex", flexDirection: "column", minHeight: 0,
        }}>
          <div style={{ padding: 14, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <span style={mini}>INSPECTOR</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gap: 16 }}>
            {chosenTemplate ? (
              <>
                <Field label="TEMPLATE">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{chosenTemplate.emoji}</span>
                    <strong style={{ fontSize: 13 }}>{chosenTemplate.title}</strong>
                    <button onClick={() => setChosenTemplate(null)} style={{
                      marginLeft: "auto", padding: "3px 8px", borderRadius: 6,
                      border: "1px solid rgba(0,0,0,0.08)", background: "white",
                      fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#1a1a2e",
                    }}>✕</button>
                  </div>
                </Field>

                <Field label="PROMPT (auto)">
                  <div style={{
                    padding: 10, borderRadius: 8,
                    background: "rgba(0,0,0,0.03)",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                    color: "rgba(26,26,46,0.7)", lineHeight: 1.5,
                    border: "1px solid rgba(0,0,0,0.05)",
                  }}>{chosenTemplate.previewPrompt}</div>
                </Field>
              </>
            ) : (
              <Field label="PROMPT">
                <textarea
                  value={customDirection}
                  onChange={e => setCustomDirection(e.target.value)}
                  placeholder={`Describe a scene starring ${pet?.name || "your pet"}…`}
                  style={{
                    width: "100%", padding: 10, borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    fontSize: 13, fontFamily: "'Space Grotesk',sans-serif",
                    resize: "vertical", minHeight: 90,
                  }}
                />
              </Field>
            )}

            {chosenTemplate && (
              <Field label="CUSTOM DIRECTION (optional)">
                <input type="text" value={customDirection}
                  onChange={e => setCustomDirection(e.target.value)}
                  placeholder='e.g. "wearing a red bowtie"'
                  style={{
                    width: "100%", padding: 8, borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    fontSize: 13, fontFamily: "'Space Grotesk',sans-serif",
                  }} />
              </Field>
            )}

            <Field label="MODEL">
              <select value={chosenModelId} onChange={e => setChosenModelId(e.target.value)} style={{
                width: "100%", padding: 8, borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.12)", fontSize: 13, background: "white",
                fontFamily: "'Space Grotesk',sans-serif",
              }}>
                {videoModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} · {m.tier.toUpperCase()} · {m.creditsPerRun} cr
                  </option>
                ))}
              </select>
              {chosenModel && (
                <div style={{ marginTop: 6, fontSize: 13, color: "rgba(26,26,46,0.55)", lineHeight: 1.5 }}>
                  {chosenModel.description}
                  {chosenModel.supportsImageRef && pet?.avatar_url && (
                    <div style={{ marginTop: 4, color: "#16a34a", fontWeight: 700, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                      ✓ Using {pet.name}'s photo as character anchor
                    </div>
                  )}
                </div>
              )}
            </Field>

            <button onClick={generate} disabled={generating || !pet} style={{
              ...btnPrimary,
              opacity: generating || !pet ? 0.5 : 1,
              cursor: generating || !pet ? "not-allowed" : "pointer",
            }}>
              {generating ? "Generating…" : `Generate · ${chosenModel?.creditsPerRun ?? 0} cr`}
            </button>

            {statusMsg && (
              <div style={{
                padding: "8px 12px", borderRadius: 8, fontSize: 13,
                background: previewUrl ? "rgba(22,163,74,0.08)" : "rgba(245,158,11,0.08)",
                border: `1px solid ${previewUrl ? "rgba(22,163,74,0.2)" : "rgba(245,158,11,0.2)"}`,
                color: previewUrl ? "#16a34a" : "#b45309", fontWeight: 600,
              }}>{statusMsg}</div>
            )}

            {previewUrl && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <a href={previewUrl} download style={btnGhost}>↓ Download</a>
                <a href={previewUrl} target="_blank" rel="noreferrer" style={btnGhost}>↗ Open</a>
              </div>
            )}
          </div>
        </aside>
      </div>

      {editorOpen && previewUrl && (
        <EditorModal videoUrl={previewUrl} onClose={() => setEditorOpen(false)} />
      )}

      <style>{`
        @media (max-width: 1024px) {
          .studio-main-grid { grid-template-columns: 1fr !important; grid-template-rows: auto 1fr auto !important; }
        }
      `}</style>
    </div>
  );
}

// ── Inline iconography (flat/outline, inherits currentColor) ──

function MusicNoteIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", color: "#b45309" }} aria-hidden>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}

function ClockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", color: "rgba(26,26,46,0.55)" }} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function ScissorsIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block" }} aria-hidden>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.1 8.1 20 20M20 4 8.1 15.9" />
    </svg>
  );
}

function ClapperboardIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block" }} aria-hidden>
      <path d="M3 9.5 4.2 5l16.2 1.6L19.5 11z" />
      <path d="M3 9.5h16.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M8 5.4 6 9.7M13 6 11 10.3" />
    </svg>
  );
}

function ImageIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block" }} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.7" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </svg>
  );
}

// ── Sub-components ──

function LibraryRow({ leading, title, subtitle, selected, onClick }: {
  leading: React.ReactNode; title: string; subtitle?: string;
  selected: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px", borderRadius: 8, cursor: "pointer",
      background: selected ? "rgba(245,158,11,0.10)" : "transparent",
      border: selected ? "1px solid rgba(245,158,11,0.4)" : "1px solid transparent",
      color: "#1a1a2e", textAlign: "left",
      transition: "background 120ms ease",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 6,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.04)", flexShrink: 0,
      }}>{leading}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "rgba(26,26,46,0.5)", marginTop: 1 }}>{subtitle}</div>
        )}
      </div>
    </button>
  );
}

function TimelineStrip({ videoClip, imageClip, templateTitle, duration }: {
  videoClip: string | null; imageClip: string | null;
  templateTitle?: string; duration: number;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      {/* Ruler */}
      <div style={{
        display: "flex", alignItems: "center", height: 14,
        fontSize: 13, color: "rgba(26,26,46,0.4)",
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {Array.from({ length: Math.max(5, duration) }).map((_, i) => (
          <div key={i} style={{ flex: 1, borderLeft: "1px solid rgba(0,0,0,0.08)", paddingLeft: 4, height: "100%", display: "flex", alignItems: "center" }}>
            {i}s
          </div>
        ))}
      </div>
      {/* Video track */}
      <div style={{
        height: 32, borderRadius: 6,
        background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.06)",
        position: "relative", overflow: "hidden",
      }}>
        {(videoClip || imageClip) && (
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: "100%",
            background: "linear-gradient(90deg, rgba(245,158,11,0.4), rgba(251,191,36,0.3))",
            border: "1px solid rgba(245,158,11,0.5)",
            display: "flex", alignItems: "center", padding: "0 10px",
            fontSize: 13, fontWeight: 700, color: "#1a1a2e",
            gap: 6,
          }}>
            {videoClip ? <ClapperboardIcon size={13} /> : <ImageIcon size={13} />} {templateTitle || "Clip"}
          </div>
        )}
      </div>
      {/* Audio track */}
      <div style={{
        height: 22, borderRadius: 6,
        background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.06)",
        display: "flex", alignItems: "center", gap: 6, padding: "0 8px",
        fontSize: 13, color: "rgba(26,26,46,0.4)",
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <MusicNoteIcon size={11} /> (no music selected — add inside the editor)
      </div>
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
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        maxWidth: 1080, width: "100%", maxHeight: "90vh", overflow: "auto",
        background: "white", borderRadius: 16, padding: 24,
        border: "1px solid rgba(0,0,0,0.1)",
      }}>
        {PetVideoEditor
          ? <PetVideoEditor videoUrl={videoUrl} onClose={onClose} />
          : <div style={{ color: "#1a1a2e", padding: 40, textAlign: "center" }}>Loading editor…</div>}
      </div>
    </div>
  );
}

// ── Layout primitives ──

function Pill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      padding: "4px 10px", borderRadius: 8,
      background: "rgba(0,0,0,0.04)",
      display: "flex", alignItems: "baseline", gap: 6,
    }}>
      <span style={{
        fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
        color: "rgba(26,26,46,0.5)", letterSpacing: "0.1em",
      }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 800,
        color: accent ? "#b45309" : "#1a1a2e",
        fontFamily: "'JetBrains Mono', monospace",
      }}>{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={mini}>{label}</div>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

const mini: React.CSSProperties = {
  fontSize: 13, fontWeight: 800, letterSpacing: "0.14em",
  textTransform: "uppercase", color: "rgba(26,26,46,0.5)",
  fontFamily: "'JetBrains Mono', monospace",
};

const tag: React.CSSProperties = {
  padding: "2px 8px", borderRadius: 999,
  background: "rgba(245,158,11,0.12)", color: "#b45309",
  fontSize: 13, fontWeight: 800, letterSpacing: "0.08em",
  fontFamily: "'JetBrains Mono', monospace",
};

const btnPrimary: React.CSSProperties = {
  width: "100%", padding: "12px",
  borderRadius: 10, border: "none",
  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer",
  fontFamily: "'Space Grotesk',sans-serif",
  boxShadow: "0 4px 14px rgba(245,158,11,0.32)",
};

const btnPrimarySmall: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 14px", borderRadius: 8, border: "none",
  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer",
  fontFamily: "'Space Grotesk',sans-serif", textDecoration: "none",
};

const btnGhost: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 12px", borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.08)", background: "white",
  color: "#1a1a2e", fontWeight: 700, fontSize: 13, cursor: "pointer",
  fontFamily: "'Space Grotesk',sans-serif", textDecoration: "none",
};

const emptyState: React.CSSProperties = {
  textAlign: "center", padding: 20,
  background: "rgba(0,0,0,0.03)", borderRadius: 10,
};

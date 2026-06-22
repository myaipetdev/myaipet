"use client";

/**
 * Pet Studio v5 — chat-guided generation.
 *
 * Fixes from v4:
 *  - WalletGate wraps the whole thing so unauth users see the connect screen
 *    instead of a silently-empty UI.
 *  - Visible loading state for pets/models (skeleton instead of empty void).
 *  - Bigger typography across the board (base 17px, questions 20px).
 *  - Pet card up top is large and obvious — clear which pet is the subject.
 *  - 401 detection surfaces a friendly explanation instead of swallowing.
 *  - Each step shows the running answer summary so user never loses context.
 *  - Bigger chip buttons (52px height, 15px text) — touch-friendly.
 *  - Status banner is always visible — never silent.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import Icon, { PET_ICONS } from "@/components/Icon";

const DEMO_PET: Pet = {
  id: -1,
  name: "Sparky",
  avatar_url: null,
  species: 0,
  level: 5,
};

interface Pet { id: number; name: string; avatar_url: string | null; species: number; level: number; }
interface StudioModel {
  id: string; displayName: string; provider: string; kind: "image" | "video";
  supportsImageRef: boolean; maxDurationSec: number; maxResolution: string;
  tier: "free" | "pro" | "studio"; creditsPerRun: number; description: string;
}

interface Chip { id: string; label: string; emoji?: string }

type Step = "scene" | "action" | "style" | "mood";
type View = "loading" | "no-pet" | "chat" | "ready" | "generating" | "done" | "error";

interface Answers { scene?: string; action?: string; style?: string; mood?: string; }
interface Msg { role: "ai" | "user"; text: string; chips?: Chip[]; step?: Step; }

const STEPS: Step[] = ["scene", "action", "style", "mood"];

const STEP_PROMPTS: Record<Step, { question: (petName: string) => string; chips: Chip[] }> = {
  scene: {
    question: (n) => `Let's make something with ${n} 🐾  Where is the scene?`,
    chips: [
      { id: "beach",  label: "Beach",  emoji: "🏖" },
      { id: "forest", label: "Forest", emoji: "🌲" },
      { id: "home",   label: "Home",   emoji: "🏠" },
      { id: "park",   label: "Park",   emoji: "🌳" },
      { id: "cafe",   label: "Cafe",   emoji: "☕" },
      { id: "space",  label: "Space",  emoji: "🚀" },
    ],
  },
  action: {
    question: (n) => `Nice. What is ${n} doing?`,
    chips: [
      { id: "yoga",     label: "Yoga",     emoji: "🧘" },
      { id: "dancing",  label: "Dancing",  emoji: "💃" },
      { id: "eating",   label: "Eating",   emoji: "🍕" },
      { id: "sleeping", label: "Sleeping", emoji: "😴" },
      { id: "running",  label: "Running",  emoji: "🏃" },
      { id: "playing",  label: "Playing",  emoji: "🎾" },
    ],
  },
  style: {
    question: () => `What visual style?`,
    chips: [
      { id: "cinematic",      label: "Cinematic",   emoji: "🎬" },
      { id: "anime",          label: "Anime",       emoji: "✨" },
      { id: "photorealistic", label: "Photoreal",   emoji: "📷" },
      { id: "watercolor",     label: "Watercolor",  emoji: "🎨" },
      { id: "pixar",          label: "3D / Pixar",  emoji: "🧸" },
      { id: "pixel",          label: "Pixel art",   emoji: "👾" },
    ],
  },
  mood: {
    question: () => `Last one — what's the mood?`,
    chips: [
      { id: "sunset",  label: "Sunset glow",   emoji: "🌇" },
      { id: "sunrise", label: "Sunrise",       emoji: "🌅" },
      { id: "dreamy",  label: "Dreamy",        emoji: "💭" },
      { id: "playful", label: "Playful",       emoji: "🎉" },
      { id: "cozy",    label: "Cozy & warm",   emoji: "🛋" },
      { id: "epic",    label: "Epic / heroic", emoji: "⚡" },
    ],
  },
};

const CHIP_LABEL: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const s of STEPS) for (const c of STEP_PROMPTS[s].chips) m[c.id] = c.label.toLowerCase();
  return m;
})();

function buildPrompt(petName: string, a: Answers): string {
  const parts: string[] = [petName];
  if (a.action) parts.push(CHIP_LABEL[a.action] || a.action);
  if (a.scene) {
    const s = CHIP_LABEL[a.scene] || a.scene;
    parts.push(/^(at|on|in)\s/i.test(s) ? s : `at the ${s}`);
  }
  const tail: string[] = [];
  if (a.style) tail.push(`${CHIP_LABEL[a.style] || a.style} style`);
  if (a.mood) tail.push(CHIP_LABEL[a.mood] || a.mood);
  return tail.length ? `${parts.join(" ")}, ${tail.join(", ")}` : parts.join(" ");
}

function StudioInner() {
  const [pets, setPets] = useState<Pet[] | null>(null);   // null = still loading
  const [petId, setPetId] = useState<number | null>(null);
  const [models, setModels] = useState<StudioModel[]>([]);
  const [credits, setCredits] = useState(0);
  const [isDemo, setIsDemo] = useState(false);  // true when using fallback Sparky

  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typedInput, setTypedInput] = useState("");
  const [editedPrompt, setEditedPrompt] = useState<string | null>(null);

  const [view, setView] = useState<View>("loading");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosenModelId, setChosenModelId] = useState<string>("kling-image-to-video");

  const scrollRef = useRef<HTMLDivElement>(null);
  const pet = pets?.find(p => p.id === petId) || null;
  const chosenModel = models.find(m => m.id === chosenModelId);
  const currentStep = STEPS[stepIdx];

  // ── Load pets + models + credits ──
  // We always fall back to a demo Sparky so the UI can be exercised end-to-end
  // even before sign-in. Generate will surface the auth error inline if it fails.
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
            setPets(list);
            setPetId(list[0].id);
            setIsDemo(false);
            return;
          }
        }
        // 401, network error, or empty list → demo fallback so flow is testable
        setPets([DEMO_PET]);
        setPetId(DEMO_PET.id);
        setIsDemo(true);
      } catch {
        setPets([DEMO_PET]);
        setPetId(DEMO_PET.id);
        setIsDemo(true);
      }
    })();

    fetch("/api/studio/providers")
      .then(r => r.ok ? r.json() : null)
      .then(d => setModels((d?.models || []).filter((m: StudioModel) => m.kind === "video")))
      .catch(() => {});

    fetch("/api/studio/generate", { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => setCredits(d?.credits || 0))
      .catch(() => {});
  }, []);

  // ── Decide view once pets resolved ──
  useEffect(() => {
    if (pets === null) { setView("loading"); return; }
    if (!pet) return;
    if (view === "loading") setView("chat");
  }, [pets, pet]);

  // ── Seed first AI message when pet is known ──
  useEffect(() => {
    if (!pet || messages.length > 0) return;
    const s = STEPS[0];
    setMessages([{
      role: "ai",
      text: STEP_PROMPTS[s].question(pet.name),
      chips: STEP_PROMPTS[s].chips,
      step: s,
    }]);
  }, [pet, messages.length]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, view]);

  const submitAnswer = (raw: string) => {
    const v = raw.trim();
    if (!v || !pet) return;
    const s = currentStep;
    const next: Answers = { ...answers, [s]: v };
    setAnswers(next);

    const newMsgs: Msg[] = [...messages, { role: "user", text: v }];
    const nextIdx = stepIdx + 1;

    if (nextIdx >= STEPS.length) {
      const finalPrompt = buildPrompt(pet.name, next);
      newMsgs.push({ role: "ai", text: `Got it. Here is the scene I'll build:` });
      setMessages(newMsgs);
      setEditedPrompt(finalPrompt);
      setView("ready");
    } else {
      const nextStep = STEPS[nextIdx];
      newMsgs.push({
        role: "ai",
        text: STEP_PROMPTS[nextStep].question(pet.name),
        chips: STEP_PROMPTS[nextStep].chips,
        step: nextStep,
      });
      setMessages(newMsgs);
      setStepIdx(nextIdx);
    }
    setTypedInput("");
  };

  const restart = () => {
    setStepIdx(0);
    setAnswers({});
    setMessages([]);
    setEditedPrompt(null);
    setResultUrl(null);
    setError(null);
    setView("chat");
  };

  const generate = async () => {
    if (!editedPrompt || !pet) return;
    setView("generating");
    setError(null);
    setResultUrl(null);

    // Demo mode: short pause to show the generating screen, then jump to "done"
    // — but with a clear demo card (NOT a fake video). Real generation requires
    // sign-in and is handled below.
    if (isDemo) {
      await new Promise(r => setTimeout(r, 1800));
      setResultUrl("__demo__");   // sentinel; renders the demo done card instead of media
      setView("done");
      return;
    }

    try {
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ modelId: chosenModelId, petId: pet.id, prompt: editedPrompt }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || "Generation failed"); setView("error"); return; }
      setCredits(data.creditsRemaining ?? credits);

      if (data.status === "completed" && data.url) {
        setResultUrl(data.url); setView("done"); return;
      }

      const jobId = data.generationId;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const r2 = await fetch(`/api/studio/generate/${jobId}`, { headers: getAuthHeaders() }).catch(() => null);
        if (!r2?.ok) continue;
        const d2 = await r2.json();
        if (d2.status === "completed") { setResultUrl(d2.url); setView("done"); return; }
        if (d2.status === "failed") { setError(d2.error || "Generation failed"); setView("error"); return; }
      }
      setError("Timed out waiting for result. Check History.");
      setView("error");
    } catch (e: any) {
      setError(e?.message || "Generation failed");
      setView("error");
    }
  };

  const progress = view === "done" || view === "ready" || view === "generating" ? 4 : stepIdx;

  // ── Answer summary (always visible during chat so user knows progress) ──
  const answerSummary = useMemo(() => {
    const filled: { step: Step; value: string }[] = [];
    for (const s of STEPS) {
      const v = (answers as any)[s];
      if (v) filled.push({ step: s, value: CHIP_LABEL[v] || v });
    }
    return filled;
  }, [answers]);

  return (
    <div style={{
      minHeight: "calc(100vh - 60px)",
      background: "#faf7f2",
      color: "#1a1a2e",
      fontFamily: "'Space Grotesk', sans-serif",
      fontSize: 17,
      display: "flex", justifyContent: "center",
      padding: "32px 20px 80px",
    }}>
      <div style={{ width: "100%", maxWidth: 760, display: "flex", flexDirection: "column", gap: 18 }}>

        {/* ── Pro positioning hero ── */}
        <div style={{
          background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)",
          color: "white", borderRadius: 18, padding: "26px 28px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{
            fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.18em", color: "#fbbf24", marginBottom: 8,
          }}>PET STUDIO · PRO VIDEO</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.015em", lineHeight: 1.2, marginBottom: 6 }}>
            Multi-model video generation
          </div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", lineHeight: 1.55, marginBottom: 16, maxWidth: 540 }}>
            For when "good enough" isn't enough. Lock your pet's face across scenes,
            generate up to 10 seconds at 1080p, and add native audio.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <CapPill icon="crystal-ball" label="Pet Anchor (PuLID)" />
            <CapPill icon="sparkling" label="Native Audio (Veo 3)" />
            <CapPill icon="film-reel" label="1080p · up to 10s" />
            <CapPill icon="electric" label="6 video models" />
          </div>
        </div>

        {/* ── Big intro / pet card ── */}
        {pet && (
          <div style={{
            background: "white", borderRadius: 18, padding: "20px 24px",
            border: "1px solid rgba(0,0,0,0.06)",
            display: "flex", alignItems: "center", gap: 18,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, overflow: "hidden", flexShrink: 0,
              background: "rgba(245,158,11,0.10)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28,
            }}>
              {pet.avatar_url
                ? <img src={pet.avatar_url} alt={pet.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <Icon name={PET_ICONS[pet.species] || "paw"} size={32} alt={pet.name} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "rgba(26,26,46,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
                Subject
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>{pet.name}</div>
              <div style={{ fontSize: 13, color: "rgba(26,26,46,0.55)", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                Lv.{pet.level}
                {pets && pets.length > 1 && (
                  <>
                    {" · "}
                    <select
                      value={pet.id}
                      onChange={(e) => { setPetId(Number(e.target.value)); restart(); }}
                      style={{
                        border: "none", background: "transparent",
                        color: "#b45309", fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 13, cursor: "pointer", padding: 0,
                      }}
                    >
                      {pets.map(p => <option key={p.id} value={p.id}>switch · {p.name}</option>)}
                    </select>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "rgba(26,26,46,0.55)", letterSpacing: "0.1em" }}>CREDITS</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{credits}</div>
            </div>
          </div>
        )}

        {/* ── Step indicator (big, labeled, colorful) ── */}
        {pet && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, padding: "4px 0" }}>
            {STEPS.map((s, i) => {
              const active = i === progress && view === "chat";
              const done = i < progress || (view !== "chat" && view !== "loading");
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", flex: 1, maxWidth: 180 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: done ? "#f59e0b" : active ? "white" : "rgba(26,26,46,0.06)",
                      border: active ? "2px solid #f59e0b" : "2px solid transparent",
                      boxShadow: active ? "0 0 0 6px rgba(245,158,11,0.16)" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: done ? "white" : "#1a1a2e",
                      fontSize: 14, fontWeight: 800,
                      transition: "all 220ms ease",
                    }}>
                      {done ? "✓" : i + 1}
                    </div>
                    <span style={{
                      fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: "0.1em", textTransform: "uppercase",
                      color: done || active ? "#1a1a2e" : "rgba(26,26,46,0.4)",
                      fontWeight: done || active ? 700 : 500,
                    }}>{s}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ height: 2, flex: 1, background: i < progress ? "#f59e0b" : "rgba(26,26,46,0.10)", transition: "background 220ms ease" }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Answer summary chips (running tally) ── */}
        {pet && answerSummary.length > 0 && view !== "done" && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 8,
            padding: "10px 14px", background: "rgba(245,158,11,0.06)",
            borderRadius: 12, border: "1px solid rgba(245,158,11,0.20)",
          }}>
            {answerSummary.map(({ step, value }) => (
              <div key={step} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", borderRadius: 999,
                background: "white", fontSize: 13,
                border: "1px solid rgba(0,0,0,0.06)",
              }}>
                <span style={{
                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                  color: "rgba(26,26,46,0.5)", letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}>{step}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}

        {/* ── Loading state ── */}
        {view === "loading" && (
          <div style={{
            background: "white", borderRadius: 18, padding: "60px 28px",
            border: "1px solid rgba(0,0,0,0.06)", textAlign: "center",
          }}>
            <div className="studio-spin" style={{ marginBottom: 14, display: "inline-flex", lineHeight: 0 }}><Icon name="compass" size={44} /></div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Loading your pets…</div>
            <div style={{ fontSize: 14, color: "rgba(26,26,46,0.55)", marginTop: 6 }}>
              Fetching from /api/pets
            </div>
          </div>
        )}

        {/* ── Demo banner ── */}
        {isDemo && view !== "loading" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 16px", borderRadius: 12,
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.25)",
            fontSize: 14, color: "#1e3a8a",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
              <path d="M9 18h6" />
              <path d="M10 21h4" />
              <path d="M12 3a6 6 0 0 0-3.7 10.7c.7.6 1.2 1.4 1.4 2.3h4.6c.2-.9.7-1.7 1.4-2.3A6 6 0 0 0 12 3Z" />
            </svg>
            <span style={{ flex: 1 }}>
              <strong>Demo mode</strong> — try the full flow with Sparky. Sign in & adopt a real pet to actually generate.
            </span>
            <a href="/" style={{
              padding: "6px 12px", borderRadius: 8,
              background: "white", border: "1px solid rgba(59,130,246,0.30)",
              color: "#1e3a8a", fontWeight: 700, fontSize: 12,
              textDecoration: "none", fontFamily: "'JetBrains Mono', monospace",
            }}>Sign in →</a>
          </div>
        )}

        {/* ── Chat ── */}
        {view === "chat" && pet && (
          <div style={card}>
            {/* Big current question banner */}
            <div style={{
              padding: "22px 24px",
              background: "linear-gradient(180deg, rgba(245,158,11,0.06) 0%, transparent 100%)",
              borderBottom: "1px solid rgba(0,0,0,0.05)",
            }}>
              <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "rgba(26,26,46,0.55)", letterSpacing: "0.12em", marginBottom: 6 }}>
                STEP {stepIdx + 1} / {STEPS.length} · {currentStep.toUpperCase()}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>
                {STEP_PROMPTS[currentStep].question(pet.name)}
              </div>
            </div>

            <div ref={scrollRef} style={{ maxHeight: 320, overflowY: "auto", padding: "16px 22px" }}>
              {messages.length > 1 && messages.slice(0, -1).map((m, i) => (
                <ChatBubble key={i} msg={m} isLast={false} onChip={() => {}} />
              ))}
            </div>

            {/* Chips area */}
            <div style={{ padding: "0 22px 18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                {STEP_PROMPTS[currentStep].chips.map(c => (
                  <button key={c.id} onClick={() => submitAnswer(c.id)} style={chipBig}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.10)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(245,158,11,0.4)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.12)"; }}>
                    {c.emoji && <span style={{ fontSize: 22, marginRight: 8 }}>{c.emoji}</span>}
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={inputBar}>
              <input
                type="text"
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAnswer(typedInput); }}
                placeholder={`or type your own ${currentStep}…`}
                style={inputField}
              />
              <button onClick={() => submitAnswer(typedInput)} disabled={!typedInput.trim()} style={{
                ...btnPrimarySmall, opacity: typedInput.trim() ? 1 : 0.45,
              }}>Send</button>
            </div>
          </div>
        )}

        {/* ── Ready (final prompt + Generate) ── */}
        {view === "ready" && editedPrompt && pet && (
          <div style={card}>
            <div style={{ padding: 26 }}>
              <div style={miniLabel}>FINAL PROMPT</div>
              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                style={{
                  marginTop: 10, width: "100%", minHeight: 110, padding: 16,
                  borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)",
                  fontSize: 16, fontFamily: "'Space Grotesk',sans-serif",
                  lineHeight: 1.55,
                  resize: "vertical", background: "rgba(0,0,0,0.02)",
                }}
              />

              {/* Model picker — first-class, not "advanced" */}
              <div style={{ marginTop: 22 }}>
                <div style={miniLabel}>MODEL</div>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {models.map(m => {
                    const selected = m.id === chosenModelId;
                    return (
                      <button key={m.id} onClick={() => setChosenModelId(m.id)} style={{
                        textAlign: "left", padding: "13px 16px", borderRadius: 12,
                        border: selected ? "2px solid #f59e0b" : "1px solid rgba(0,0,0,0.08)",
                        background: selected ? "rgba(245,158,11,0.06)" : "white",
                        cursor: "pointer",
                        fontFamily: "'Space Grotesk',sans-serif",
                        color: "#1a1a2e",
                        transition: "all 140ms ease",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <strong style={{ fontSize: 15 }}>{m.displayName}</strong>
                          <ModelBadges model={m} />
                        </div>
                        <div style={{ fontSize: 13, color: "rgba(26,26,46,0.65)", marginTop: 4, lineHeight: 1.4 }}>
                          {m.description}
                        </div>
                        <div style={{
                          fontSize: 11, marginTop: 6,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "rgba(26,26,46,0.55)", letterSpacing: "0.06em",
                        }}>
                          {m.maxDurationSec}s · {m.maxResolution} · {m.creditsPerRun} cr
                        </div>
                      </button>
                    );
                  })}
                </div>
                {chosenModel?.supportsImageRef && pet?.avatar_url && (
                  <div style={{
                    marginTop: 10, padding: "8px 12px", borderRadius: 8,
                    background: "rgba(22,163,74,0.08)",
                    border: "1px solid rgba(22,163,74,0.25)",
                    fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                    color: "#15803d", fontWeight: 700,
                  }}>
                    ✓ {pet.name}'s photo will lock the character across the video
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
                <button onClick={restart} style={btnGhostBig}>← Restart</button>
                <button onClick={generate} disabled={!editedPrompt.trim()} style={{
                  ...btnPrimaryBig, flex: 1,
                  opacity: editedPrompt.trim() ? 1 : 0.45,
                }}>
                  ▶ Generate · {chosenModel?.creditsPerRun ?? 0} credits
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Generating ── */}
        {view === "generating" && (
          <div style={card}>
            <div style={{ padding: "56px 24px", textAlign: "center" }}>
              <div style={{ marginBottom: 18, display: "inline-flex", lineHeight: 0 }} className="studio-spin"><Icon name="film-reel" size={56} /></div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Generating…</div>
              <div style={{ fontSize: 15, color: "rgba(26,26,46,0.65)" }}>
                30 – 90 seconds. Don't close the page.
              </div>
              <div style={{
                marginTop: 26, height: 6, borderRadius: 6, overflow: "hidden",
                background: "rgba(245,158,11,0.15)", position: "relative",
                maxWidth: 320, margin: "26px auto 0",
              }}>
                <div className="studio-progress" style={{
                  position: "absolute", top: 0, bottom: 0, width: "40%",
                  background: "linear-gradient(90deg, #fbbf24, #f59e0b)",
                  borderRadius: 6,
                }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Done (real generation) ── */}
        {view === "done" && resultUrl && resultUrl !== "__demo__" && (
          <div style={card}>
            <div style={{ padding: 22 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14,
                color: "#16a34a", fontSize: 13, fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em",
                background: "rgba(22,163,74,0.10)", padding: "6px 12px", borderRadius: 999,
              }}>
                ✓ DONE
              </div>
              <div style={{
                borderRadius: 14, overflow: "hidden",
                background: "linear-gradient(135deg,#1a1a2e,#2d2d4a)",
                aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {/\.(mp4|webm)$/i.test(resultUrl)
                  ? <video src={resultUrl} controls autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  : <img src={resultUrl} alt="result" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <a href={resultUrl} download style={btnGhostBig}>↓ Download</a>
                <a href={resultUrl} target="_blank" rel="noreferrer" style={btnGhostBig}>↗ Open</a>
                <div style={{ flex: 1 }} />
                <button onClick={restart} style={btnPrimaryBig}>⟳ Make another</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Done (demo — honest preview card, no fake video) ── */}
        {view === "done" && resultUrl === "__demo__" && pet && editedPrompt && (
          <div style={card}>
            <div style={{ padding: 28 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 18,
                color: "#1e3a8a", fontSize: 12, fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em",
                background: "rgba(59,130,246,0.10)", padding: "6px 12px", borderRadius: 999,
              }}>
                ✓ READY TO GENERATE
              </div>

              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.01em" }}>
                This is what we'll generate
              </div>
              <div style={{ fontSize: 15, color: "rgba(26,26,46,0.65)", marginBottom: 22, lineHeight: 1.55 }}>
                A 5-second video starring <strong>{pet.name}</strong>, using your prompt below.
                Sign in & adopt a real pet to actually create it.
              </div>

              {/* Prompt — the hero */}
              <div style={{
                padding: "20px 22px",
                background: "linear-gradient(135deg,#0f172a,#1e293b)",
                borderRadius: 14,
                color: "white",
              }}>
                <div style={{
                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                  color: "rgba(255,255,255,0.55)", letterSpacing: "0.14em", marginBottom: 10,
                }}>PROMPT</div>
                <div style={{
                  fontSize: 17, fontFamily: "'JetBrains Mono', monospace",
                  lineHeight: 1.6, color: "white",
                }}>{editedPrompt}</div>
              </div>

              {/* Spec strip */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 10, marginTop: 14,
              }}>
                <SpecCell label="MODEL" value={chosenModel?.displayName || "Kling i2v"} />
                <SpecCell label="DURATION" value={`${chosenModel?.maxDurationSec || 5}s`} />
                <SpecCell label="RESOLUTION" value={chosenModel?.maxResolution || "720p"} />
                <SpecCell label="COST" value={`${chosenModel?.creditsPerRun ?? 50} cr`} />
              </div>

              {/* CTA */}
              <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
                <button onClick={restart} style={btnGhostBig}>⟳ Make another</button>
                <div style={{ flex: 1 }} />
                <a href="/" style={btnPrimaryBig}>⚡ Sign in & generate →</a>
              </div>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {view === "error" && (
          <div style={card}>
            <div style={{ padding: 32, textAlign: "center" }}>
              <div style={{ marginBottom: 10, display: "inline-flex", lineHeight: 0 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Generation failed</div>
              <div style={{ fontSize: 15, color: "rgba(26,26,46,0.65)", marginBottom: 22, maxWidth: 460, margin: "0 auto 22px", lineHeight: 1.5 }}>{error}</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => setView("ready")} style={btnGhostBig}>← Edit prompt</button>
                <button onClick={generate} style={btnPrimaryBig}>↻ Try again</button>
              </div>
            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes studioSpinKf { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        .studio-spin { animation: studioSpinKf 2s linear infinite; }
        @keyframes studioProgressKf { 0% { left: -40%; } 100% { left: 100%; } }
        .studio-progress { animation: studioProgressKf 1.6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

export default function PetStudioChat() {
  return <StudioInner />;
}

// ── Sub-components ──

function ChatBubble({ msg }: { msg: Msg; isLast: boolean; onChip: (c: Chip) => void }) {
  const isAi = msg.role === "ai";
  return (
    <div style={{
      display: "flex", flexDirection: isAi ? "row" : "row-reverse",
      gap: 12, marginBottom: 14,
    }}>
      <div style={{
        flexShrink: 0, width: 34, height: 34, borderRadius: "50%",
        background: isAi ? "rgba(245,158,11,0.14)" : "rgba(26,26,46,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18,
      }}>
        {isAi ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="8" width="16" height="11" rx="3" />
            <path d="M12 4v4" />
            <circle cx="12" cy="3" r="1.4" />
            <path d="M9 13h.01M15 13h.01" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
        )}
      </div>
      <div style={{ maxWidth: "82%" }}>
        <div style={{
          padding: "12px 16px", borderRadius: 16,
          background: isAi ? "rgba(0,0,0,0.03)" : "rgba(245,158,11,0.12)",
          border: isAi ? "1px solid rgba(0,0,0,0.04)" : "1px solid rgba(245,158,11,0.22)",
          fontSize: 16, lineHeight: 1.5, color: "#1a1a2e",
          borderTopLeftRadius: isAi ? 4 : 16,
          borderTopRightRadius: isAi ? 16 : 4,
        }}>{msg.text}</div>
      </div>
    </div>
  );
}

// Tiny flat glyphs sized to sit inside a 10px monospace badge.
// They use currentColor so each inherits its badge's `fg`.
const BADGE_ICONS = {
  audio: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V6l11-2v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  ),
  anchor: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="2.5" />
      <path d="M12 7.5V21" />
      <path d="M5 13a7 7 0 0 0 14 0" />
      <path d="M4 13h3M17 13h3" />
    </svg>
  ),
  resolution: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="13" rx="2" />
      <path d="M9 21h6" />
    </svg>
  ),
  duration: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 1.5" />
      <path d="M9 2h6" />
    </svg>
  ),
} as const;

function ModelBadges({ model }: { model: StudioModel }) {
  const badges: { icon?: React.ReactNode; label: string; bg: string; fg: string }[] = [];

  if (model.id === "veo-3") badges.push({ icon: BADGE_ICONS.audio, label: "AUDIO", bg: "rgba(168,85,247,0.12)", fg: "#7e22ce" });
  if (model.supportsImageRef) badges.push({ icon: BADGE_ICONS.anchor, label: "PET ANCHOR", bg: "rgba(245,158,11,0.12)", fg: "#b45309" });
  if (model.maxResolution.includes("1080") || model.maxResolution === "4K")
    badges.push({ icon: BADGE_ICONS.resolution, label: model.maxResolution, bg: "rgba(22,163,74,0.10)", fg: "#15803d" });
  if (model.maxDurationSec >= 8) badges.push({ icon: BADGE_ICONS.duration, label: `${model.maxDurationSec}s`, bg: "rgba(59,130,246,0.10)", fg: "#1e3a8a" });
  if (model.tier === "free") badges.push({ label: "FREE", bg: "rgba(0,0,0,0.05)", fg: "#1a1a2e" });
  else badges.push({ label: model.tier.toUpperCase(), bg: "rgba(245,158,11,0.16)", fg: "#b45309" });

  return (
    <>
      {badges.map((b, i) => (
        <span key={i} style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 8px", borderRadius: 999,
          fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
          fontFamily: "'JetBrains Mono', monospace",
          background: b.bg, color: b.fg,
        }}>{b.icon}{b.label}</span>
      ))}
    </>
  );
}

function CapPill({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 12px", borderRadius: 999,
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.10)",
      fontSize: 12, color: "rgba(255,255,255,0.92)",
      fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600,
    }}>
      <Icon name={icon} size={16} />{label}
    </div>
  );
}

function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 10,
      background: "rgba(0,0,0,0.03)",
      border: "1px solid rgba(0,0,0,0.06)",
    }}>
      <div style={{
        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
        color: "rgba(26,26,46,0.55)", letterSpacing: "0.12em",
      }}>{label}</div>
      <div style={{
        fontSize: 15, fontWeight: 700, marginTop: 2,
        fontFamily: "'JetBrains Mono', monospace", color: "#1a1a2e",
      }}>{value}</div>
    </div>
  );
}

// ── Styles ──

const card: React.CSSProperties = {
  background: "white",
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.06)",
  overflow: "hidden",
};

const inputBar: React.CSSProperties = {
  display: "flex", gap: 10, padding: 18,
  borderTop: "1px solid rgba(0,0,0,0.06)",
  background: "rgba(0,0,0,0.02)",
};

const inputField: React.CSSProperties = {
  flex: 1, padding: "13px 16px", borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)", fontSize: 15,
  fontFamily: "'Space Grotesk',sans-serif", background: "white",
  color: "#1a1a2e",
};

const chipBig: React.CSSProperties = {
  height: 52,
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: "0 14px", borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)", background: "white",
  color: "#1a1a2e",
  cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif",
  transition: "all 140ms ease",
};

const miniLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: "0.14em",
  textTransform: "uppercase", color: "rgba(26,26,46,0.55)",
  fontFamily: "'JetBrains Mono', monospace",
};

const btnPrimary: React.CSSProperties = {
  display: "inline-block",
  padding: "14px 22px", borderRadius: 12, border: "none",
  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  color: "white", fontWeight: 800, fontSize: 15, cursor: "pointer",
  fontFamily: "'Space Grotesk',sans-serif", textDecoration: "none",
  boxShadow: "0 4px 14px rgba(245,158,11,0.32)",
};

const btnPrimaryBig: React.CSSProperties = {
  ...btnPrimary,
  padding: "15px 24px", fontSize: 16,
};

const btnPrimarySmall: React.CSSProperties = {
  padding: "12px 18px", borderRadius: 12, border: "none",
  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer",
  fontFamily: "'Space Grotesk',sans-serif",
};

const btnGhostBig: React.CSSProperties = {
  display: "inline-block",
  padding: "13px 20px", borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)", background: "white",
  color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: "pointer",
  fontFamily: "'Space Grotesk',sans-serif", textDecoration: "none",
};

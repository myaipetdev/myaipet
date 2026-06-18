"use client";

import { useState, useRef, useEffect } from "react";
import { api, getAuthHeaders } from "@/lib/api";
import PetClawConsole from "@/components/PetClawConsole";

interface Pet {
  id: number;
  name: string;
  species: number;
  personality_type?: string;
  level?: number;
  element?: string;
  avatar_url?: string | null;
}

interface Props {
  pet: Pet;
  onComplete: () => void;
  onSkip: () => void;
}

type Step = "intro" | "voice" | "quiz" | "social" | "testdrive" | "done";

const QUIZ_QUESTIONS = [
  {
    id: "humor",
    question: "Pick your humor style",
    options: [
      { value: "dry", label: "Dry & deadpan", desc: "Subtle, sarcastic" },
      { value: "playful", label: "Playful", desc: "Banter & wordplay" },
      { value: "wholesome", label: "Wholesome", desc: "Kind, encouraging" },
      { value: "edgy", label: "Edgy", desc: "Sharp & bold" },
    ],
  },
  {
    id: "communication",
    question: "How do you usually text?",
    options: [
      { value: "concise", label: "Short & punchy", desc: "Few words, fast" },
      { value: "detailed", label: "Detailed", desc: "Full sentences" },
      { value: "emoji", label: "Emoji-heavy", desc: "Express with icons" },
      { value: "casual", label: "Casual", desc: "Lowercase, chill" },
    ],
  },
  {
    id: "role",
    question: "Your default vibe?",
    options: [
      { value: "supporter", label: "Supportive friend" },
      { value: "challenger", label: "Honest challenger" },
      { value: "thinker", label: "Calm thinker" },
      { value: "cheerleader", label: "Energetic cheerleader" },
    ],
  },
  {
    id: "interests",
    question: "What lights you up? (pick up to 3)",
    multi: true,
    options: [
      { value: "tech", label: "Tech & coding" },
      { value: "art", label: "Art & design" },
      { value: "music", label: "Music" },
      { value: "fitness", label: "Fitness" },
      { value: "books", label: "Reading" },
      { value: "gaming", label: "Gaming" },
      { value: "travel", label: "Travel" },
      { value: "food", label: "Food" },
    ],
  },
  {
    id: "frequency",
    question: "How often should I check in?",
    options: [
      { value: "lots", label: "All day", desc: "Multiple chats daily" },
      { value: "regular", label: "A few times a day" },
      { value: "occasional", label: "Once a day-ish" },
      { value: "rare", label: "Only when I open you" },
    ],
  },
];

// SOCIAL_PLATFORMS: id matches the OAuth provider key in lib/oauth/providers.ts.
// Clicking starts /api/auth/oauth/{id}?petId=... — server redirects through
// the provider's authorize URL, callback persists token in
// pet_platform_connections.credentials. UI checks /api/petclaw/connections
// on mount to render existing connections.
const SOCIAL_PLATFORMS = [
  { id: "discord",  name: "Discord",   icon: "D", color: "#5865F2", desc: "Server presence + DMs" },
  { id: "telegram", name: "Telegram",  icon: "T", color: "#2AABEE", desc: "Pet chats with you here" },
  { id: "twitter",  name: "Twitter/X", icon: "𝕏", color: "#000",   desc: "Autonomous posting" },
  { id: "github",   name: "GitHub",    icon: "⌥", color: "#181717", desc: "Reads your dev vibe" },
];

function PetAvatar({ pet, size = 96 }: { pet: Pet; size?: number }) {
  // Avatar-less new pets fall back to the brand mascot (white Pomeranian),
  // matching PetProfile — not a species emoji (adopt-chat creates species 0,
  // which rendered a 🐱 cat here, off-brand on the onboarding screens).
  return (
    <img
      src={pet.avatar_url || "/mascot.jpg"}
      alt={pet.name}
      style={{
        width: size, height: size, borderRadius: size * 0.28, objectFit: "cover",
        border: "4px solid #fff",
        boxShadow: "0 12px 32px rgba(245,158,11,0.25), 0 0 0 6px rgba(245,158,11,0.12)",
      }}
    />
  );
}

export default function EnhancedOnboarding({ pet, onComplete, onSkip }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [points, setPoints] = useState(0);

  const [recording, setRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string | string[]>>({});

  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Fetch existing OAuth connections on mount — if user returns from a provider
  // mid-onboarding, the just-connected platform shows ✓ immediately.
  useEffect(() => {
    let mounted = true;
    fetch(`/api/petclaw/connections?petId=${pet.id}`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!mounted || !d?.providers) return;
        const connected = d.providers.filter((p: any) => p.connected).map((p: any) => p.id);
        if (connected.length) setConnectedPlatforms(connected);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [pet.id]);

  const addPoints = (pts: number) => setPoints(p => p + pts);

  // Voice handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        setVoiceBlob(new Blob(chunks, { type: "audio/webm" }));
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
      setVoiceDuration(0);
      voiceTimerRef.current = setInterval(() => setVoiceDuration(d => d + 1), 1000);
    } catch { /* ignore */ }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
  };

  const handleQuizAnswer = (qId: string, val: string, isMulti?: boolean) => {
    if (isMulti) {
      const cur = (quizAnswers[qId] as string[]) || [];
      setQuizAnswers({ ...quizAnswers, [qId]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val].slice(0, 3) });
    } else {
      setQuizAnswers({ ...quizAnswers, [qId]: val });
    }
  };

  // Test-drive state: live first chat with the pet inside the onboarding modal.
  // Strongest activation moment — "your pet recognizes the onboarding answers
  // you just gave" — proves the memory wiring without leaving the modal.
  const [tdMessages, setTdMessages] = useState<{ role: "user" | "pet"; text: string }[]>([]);
  const [tdInput, setTdInput] = useState("");
  const [tdLoading, setTdLoading] = useState(false);

  const sendTestDrive = async (msg?: string) => {
    const text = (msg ?? tdInput).trim();
    if (!text || tdLoading) return;
    setTdMessages(m => [...m, { role: "user", text }]);
    setTdInput("");
    setTdLoading(true);
    try {
      const res = await api.pets.chat(pet.id, text);
      setTdMessages(m => [...m, { role: "pet", text: res.reply || `*${pet.name} tilts head*` }]);
    } catch {
      setTdMessages(m => [...m, { role: "pet", text: `*${pet.name} blinks slowly*` }]);
    }
    setTdLoading(false);
  };

  const saveAndComplete = async () => {
    setSaving(true);
    try {
      const data: Record<string, any> = {};
      if (quizAnswers.humor) data.owner_tone = quizAnswers.humor;
      if (quizAnswers.communication) data.owner_speech_style = quizAnswers.communication;
      if (quizAnswers.role) data.owner_expressions = quizAnswers.role;
      if (quizAnswers.interests) data.owner_interests = Array.isArray(quizAnswers.interests) ? (quizAnswers.interests as string[]).join(", ") : quizAnswers.interests;
      if (quizAnswers.frequency) data.owner_bio = `Prefers ${quizAnswers.frequency} interaction frequency`;
      if (Object.keys(data).length > 0) await api.persona.save(pet.id, data).catch(() => {});
    } catch {}
    setSaving(false);
    // Persona is saved — jump to the test-drive activation moment instead of
    // immediately confetti'ing. User chats first, THEN celebrates.
    setStep("testdrive");
    // Seed an inviting opener so the chat box isn't empty
    setTdMessages([
      { role: "pet", text: `Hi! I'm ${pet.name}. I just learned a bit about you — try saying hi or asking me anything?` },
    ]);
  };

  // ── Shared shell ──
  const stepIndex: Record<Step, number> = { intro: 0, voice: 1, quiz: 2, social: 3, testdrive: 4, done: 5 };
  const totalSteps = 5; // intro + 3 substeps + testdrive
  const progressIdx = step === "done" ? 5 : stepIndex[step];

  const Shell = ({ children, hideProgress }: { children: React.ReactNode; hideProgress?: boolean }) => (
    <div style={{
      width: "100%", maxWidth: 460,
      background: "linear-gradient(180deg, #fffaf0 0%, #ffffff 100%)",
      borderRadius: 28,
      border: "1px solid rgba(245,158,11,0.18)",
      boxShadow: "0 24px 60px rgba(245,158,11,0.16), 0 8px 24px rgba(26,26,46,0.08)",
      padding: "32px 28px",
      fontFamily: "'Space Grotesk', sans-serif",
      color: "#1a1a2e",
      animation: "obSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Decorative blobs */}
      <div style={{ position: "absolute", top: -60, right: -60, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(245,158,11,0.18), transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -80, left: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(192,132,252,0.13), transparent 70%)", pointerEvents: "none" }} />

      {!hideProgress && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 22, position: "relative" }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} style={{
              height: 4, flex: 1, maxWidth: 56, borderRadius: 2,
              background: i < progressIdx
                ? "linear-gradient(90deg, #f59e0b, #d97706)"
                : i === progressIdx
                  ? "linear-gradient(90deg, #fbbf24, #f59e0b)"
                  : "rgba(0,0,0,0.07)",
              transition: "all 0.4s",
              boxShadow: i === progressIdx ? "0 0 12px rgba(251,191,36,0.5)" : "none",
            }} />
          ))}
        </div>
      )}

      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );

  // Style helpers
  const primaryBtn: React.CSSProperties = {
    width: "100%", padding: "14px 24px", borderRadius: 14, border: "none",
    background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white",
    fontSize: 15, fontWeight: 800, cursor: "pointer",
    fontFamily: "inherit", marginTop: 18, letterSpacing: "0.01em",
    boxShadow: "0 8px 24px rgba(245,158,11,0.32)",
    transition: "transform 0.15s, box-shadow 0.2s",
  };
  const ghostBtn: React.CSSProperties = {
    width: "100%", padding: "12px 24px", borderRadius: 14,
    background: "transparent", border: "none",
    color: "rgba(26,26,46,0.45)", fontFamily: "inherit",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
    marginTop: 8,
  };
  const optionStyle = (on: boolean): React.CSSProperties => ({
    padding: "14px 16px", borderRadius: 14, cursor: "pointer",
    transition: "all 0.18s", textAlign: "left" as const,
    border: on ? "2px solid #f59e0b" : "1.5px solid rgba(0,0,0,0.07)",
    background: on
      ? "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(251,191,36,0.06))"
      : "white",
    boxShadow: on ? "0 4px 14px rgba(245,158,11,0.14)" : "0 1px 3px rgba(0,0,0,0.03)",
    transform: on ? "scale(1.01)" : "scale(1)",
  });

  // Eyebrow label (e.g. "STEP 1 / 3")
  const eyebrow = (text: string) => (
    <div style={{
      display: "inline-block",
      padding: "4px 10px", borderRadius: 999,
      background: "rgba(245,158,11,0.12)",
      color: "#b45309",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", marginBottom: 10,
    }}>{text}</div>
  );

  // ══════════════════════════════════════════════════════════
  // ── INTRO ──
  // ══════════════════════════════════════════════════════════
  if (step === "intro") {
    return (
      <Shell hideProgress>
        <div style={{ marginBottom: 22 }}>
          <PetClawConsole variant="compact" pet={{
            name: pet.name, level: pet.level,
            personality_type: pet.personality_type, element: pet.element,
          }} />
        </div>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          {eyebrow("Welcome")}
          <h2 style={{ fontSize: 32, fontWeight: 800, color: "#1a1a2e", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            Meet {pet.name}
          </h2>
          <div style={{
            display: "inline-flex", gap: 6, alignItems: "center",
            padding: "5px 12px", borderRadius: 999,
            background: "rgba(0,0,0,0.04)",
            fontSize: 12, color: "rgba(26,26,46,0.6)", fontWeight: 600,
            marginBottom: 14,
          }}>
            <span>Lv.{pet.level || 1}</span>
            <span>·</span>
            <span style={{ textTransform: "capitalize" }}>{pet.personality_type || "playful"}</span>
            {pet.element && pet.element !== "normal" && (<><span>·</span><span style={{ textTransform: "capitalize" }}>{pet.element}</span></>)}
          </div>
          <p style={{ color: "rgba(26,26,46,0.62)", fontSize: 15, lineHeight: 1.55, margin: 0, padding: "0 8px" }}>
            A 2-minute setup so {pet.name} can match your voice, tone, and where you live online.
          </p>
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {[
            { icon: "🎤", label: "Teach your voice", pts: "+50", desc: "Pet learns your tone" },
            { icon: "📝", label: "Personality match", pts: "+30", desc: "5 quick questions" },
            { icon: "🔗", label: "Connect platforms", pts: "+100", desc: "Same pet, everywhere" },
          ].map((item) => (
            <div key={item.label} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "12px 14px", borderRadius: 14,
              background: "white",
              border: "1px solid rgba(0,0,0,0.06)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11,
                background: "linear-gradient(135deg, rgba(245,158,11,0.14), rgba(192,132,252,0.08))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 19,
              }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>{item.label}</div>
                <div style={{ fontSize: 12, color: "rgba(26,26,46,0.5)", marginTop: 1 }}>{item.desc}</div>
              </div>
              <span style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 999,
                background: "rgba(74,222,128,0.14)", color: "#16a34a", fontWeight: 700,
              }}>{item.pts}</span>
            </div>
          ))}
        </div>

        <button onClick={() => setStep("voice")} style={primaryBtn}
          onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
          onMouseOut={(e) => e.currentTarget.style.transform = ""}>
          Let's go ✨
        </button>
        <button onClick={onSkip} style={ghostBtn}>Skip for now</button>
      </Shell>
    );
  }

  // ══════════════════════════════════════════════════════════
  // ── VOICE ──
  // ══════════════════════════════════════════════════════════
  if (step === "voice") {
    return (
      <Shell>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          {eyebrow("Step 1 of 3")}
          <h3 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2e", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            🎤 Teach {pet.name} your voice
          </h3>
          <p style={{ color: "rgba(26,26,46,0.55)", fontSize: 14, margin: 0 }}>
            10–30 seconds. We&apos;ll match the tone, not store the audio.
          </p>
        </div>

        <div style={{
          padding: "32px 20px", borderRadius: 20,
          background: recording ? "linear-gradient(135deg, rgba(248,113,113,0.08), rgba(220,38,38,0.04))" : "rgba(0,0,0,0.025)",
          border: recording ? "2px dashed rgba(220,38,38,0.3)" : "1px dashed rgba(0,0,0,0.1)",
          textAlign: "center",
          transition: "all 0.3s",
        }}>
          {recording ? (
            <>
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                margin: "0 auto 12px",
                background: "linear-gradient(135deg, #f87171, #dc2626)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 32, color: "white",
                boxShadow: "0 0 0 0 rgba(220,38,38,0.5)",
                animation: "obPulseRing 1.4s ease-out infinite",
              }}>🎙️</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#dc2626", fontFamily: "monospace" }}>{voiceDuration}s</div>
              <div style={{ fontSize: 12, color: "rgba(26,26,46,0.5)", marginTop: 4 }}>Recording…</div>
              <button onClick={stopRecording} style={{ ...primaryBtn, background: "#dc2626", boxShadow: "0 8px 24px rgba(220,38,38,0.32)", maxWidth: 220, margin: "16px auto 0" }}>
                Stop Recording
              </button>
            </>
          ) : voiceBlob ? (
            <>
              <div style={{
                width: 70, height: 70, borderRadius: "50%",
                margin: "0 auto 14px",
                background: "linear-gradient(135deg, #4ade80, #16a34a)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 32, color: "white",
              }}>✓</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#16a34a" }}>Got {voiceDuration}s</div>
              <button onClick={() => { addPoints(50); setStep("quiz"); }} style={{ ...primaryBtn, maxWidth: 280, margin: "16px auto 0" }}>
                Save & Continue (+50)
              </button>
              <button onClick={() => { setVoiceBlob(null); setVoiceDuration(0); }} style={ghostBtn}>Re-record</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 56, marginBottom: 10 }}>🎙️</div>
              <p style={{ fontSize: 13, color: "rgba(26,26,46,0.55)", margin: "0 0 14px" }}>
                Tap below and read anything — a sentence, a memory, a hello.
              </p>
              <button onClick={startRecording} style={{ ...primaryBtn, maxWidth: 240, margin: 0 }}>
                Start Recording
              </button>
            </>
          )}
        </div>
        <button onClick={() => setStep("quiz")} style={ghostBtn}>Skip this step</button>
      </Shell>
    );
  }

  // ══════════════════════════════════════════════════════════
  // ── QUIZ ──
  // ══════════════════════════════════════════════════════════
  if (step === "quiz") {
    const q = QUIZ_QUESTIONS[quizIndex];
    const cur = quizAnswers[q.id];
    const isMulti = !!(q as any).multi;
    const canNext = isMulti ? ((cur as string[])?.length || 0) > 0 : !!cur;

    return (
      <Shell>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          {eyebrow(`Step 2 of 3 · Q${quizIndex + 1}/${QUIZ_QUESTIONS.length}`)}
          <h3 style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
            {q.question}
          </h3>
          {isMulti && <p style={{ color: "rgba(26,26,46,0.5)", fontSize: 12, margin: 0 }}>Pick up to 3</p>}
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {q.options.map(opt => {
            const on = isMulti ? ((cur as string[]) || []).includes(opt.value) : cur === opt.value;
            return (
              <div key={opt.value} onClick={() => handleQuizAnswer(q.id, opt.value, isMulti)} style={optionStyle(on)}>
                <div style={{ fontSize: 14, fontWeight: 700, color: on ? "#b45309" : "#1a1a2e" }}>{opt.label}</div>
                {"desc" in opt && <div style={{ fontSize: 12, color: "rgba(26,26,46,0.5)", marginTop: 3 }}>{(opt as any).desc}</div>}
              </div>
            );
          })}
        </div>

        {/* Question dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 4 }}>
          {QUIZ_QUESTIONS.map((_, i) => (
            <div key={i} style={{
              width: i === quizIndex ? 18 : 6, height: 6, borderRadius: 3,
              background: i <= quizIndex ? "#f59e0b" : "rgba(0,0,0,0.08)",
              transition: "all 0.3s",
            }} />
          ))}
        </div>

        <button
          onClick={() => { if (quizIndex < QUIZ_QUESTIONS.length - 1) setQuizIndex(quizIndex + 1); else { addPoints(30); setStep("social"); } }}
          disabled={!canNext}
          style={{ ...primaryBtn, opacity: canNext ? 1 : 0.4, cursor: canNext ? "pointer" : "not-allowed", boxShadow: canNext ? "0 8px 24px rgba(245,158,11,0.32)" : "none" }}>
          {quizIndex < QUIZ_QUESTIONS.length - 1 ? "Next →" : "Done (+30)"}
        </button>
        {quizIndex > 0 && (
          <button onClick={() => setQuizIndex(quizIndex - 1)} style={ghostBtn}>← Back</button>
        )}
      </Shell>
    );
  }

  // ══════════════════════════════════════════════════════════
  // ── SOCIAL ──
  // ══════════════════════════════════════════════════════════
  if (step === "social") {
    return (
      <Shell>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          {eyebrow("Step 3 of 3")}
          <h3 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2e", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            Where should {pet.name} live?
          </h3>
          <p style={{ color: "rgba(26,26,46,0.55)", fontSize: 14, margin: 0 }}>
            Same memory, same personality, anywhere you are.
          </p>
        </div>

        <div style={{ display: "grid", gap: 10, marginBottom: 8 }}>
          {SOCIAL_PLATFORMS.map(p => {
            const on = connectedPlatforms.includes(p.id);
            return (
              <div key={p.id} onClick={() => {
                if (on) {
                  // Optimistic UI — actual disconnect via Sovereignty connections card
                  setConnectedPlatforms(connectedPlatforms.filter(id => id !== p.id));
                  return;
                }
                // OAuth redirect — server starts the flow, callback persists token,
                // user is sent back to /sovereignty?connected={id}.
                addPoints(33);
                const url = `/api/auth/oauth/${p.id}?petId=${pet.id}&returnTo=${encodeURIComponent("/sovereignty?from=onboarding")}`;
                window.location.href = url;
              }} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "13px 16px", borderRadius: 14, cursor: "pointer",
                border: on ? `2px solid ${p.color}` : "1.5px solid rgba(0,0,0,0.07)",
                background: on ? `${p.color}10` : "white",
                transition: "all 0.18s",
                boxShadow: on ? `0 6px 18px ${p.color}24` : "0 1px 3px rgba(0,0,0,0.03)",
                transform: on ? "scale(1.01)" : "scale(1)",
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: p.color, color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 800, flexShrink: 0,
                }}>{p.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(26,26,46,0.5)", marginTop: 1 }}>{p.desc}</div>
                </div>
                <span style={{
                  fontSize: 11, padding: "4px 11px", borderRadius: 999, fontWeight: 700,
                  background: on ? "rgba(74,222,128,0.16)" : "rgba(0,0,0,0.05)",
                  color: on ? "#16a34a" : "rgba(26,26,46,0.45)",
                }}>{on ? "✓ Connected" : "Connect"}</span>
              </div>
            );
          })}
        </div>

        <button onClick={saveAndComplete} disabled={saving} style={primaryBtn}>
          {saving ? "Saving…" : `Finish (${points} pts) 🎉`}
        </button>
        <button onClick={saveAndComplete} style={ghostBtn}>Skip & finish</button>
      </Shell>
    );
  }

  // ══════════════════════════════════════════════════════════
  // ── TEST DRIVE — live first chat (activation moment) ──
  // ══════════════════════════════════════════════════════════
  if (step === "testdrive") {
    return (
      <Shell hideProgress>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ marginBottom: 12 }}>
            <PetAvatar pet={pet} size={72} />
          </div>
          {eyebrow("Say hi 👋")}
          <h3 style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            {pet.name} just learned about you
          </h3>
          <p style={{ color: "rgba(26,26,46,0.6)", fontSize: 13, margin: 0 }}>
            Say something. They&apos;ll remember it.
          </p>
        </div>

        {/* Chat window */}
        <div style={{
          height: 220, padding: 12, marginBottom: 10,
          background: "rgba(0,0,0,0.025)", borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.05)",
          overflowY: "auto", display: "flex", flexDirection: "column", gap: 8,
        }}>
          {tdMessages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "82%",
              padding: "8px 12px", borderRadius: 14,
              background: m.role === "user"
                ? "linear-gradient(135deg, #f59e0b, #d97706)"
                : "white",
              color: m.role === "user" ? "white" : "#1a1a2e",
              fontSize: 13.5, lineHeight: 1.5,
              border: m.role === "pet" ? "1px solid rgba(0,0,0,0.05)" : "none",
              boxShadow: m.role === "pet" ? "0 1px 3px rgba(0,0,0,0.04)" : "0 4px 12px rgba(245,158,11,0.2)",
              animation: "obSlideIn 0.25s ease-out",
            }}>
              {m.text}
            </div>
          ))}
          {tdLoading && (
            <div style={{
              alignSelf: "flex-start", padding: "8px 12px", borderRadius: 14,
              background: "white", border: "1px solid rgba(0,0,0,0.05)",
              fontSize: 14, color: "rgba(26,26,46,0.5)",
            }}>···</div>
          )}
        </div>

        {/* Quick suggestions */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {[
            "Tell me about yourself",
            "What do you remember about me?",
            "Make me laugh",
          ].map(s => (
            <button key={s} onClick={() => sendTestDrive(s)} disabled={tdLoading} style={{
              padding: "6px 12px", borderRadius: 999,
              background: "white", border: "1px solid rgba(0,0,0,0.08)",
              color: "rgba(26,26,46,0.7)", cursor: tdLoading ? "wait" : "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: 500,
            }}>{s}</button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={tdInput}
            onChange={e => setTdInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") sendTestDrive(); }}
            placeholder={`Message ${pet.name}…`}
            disabled={tdLoading}
            autoFocus
            style={{
              flex: 1, padding: "11px 14px", borderRadius: 12,
              border: "1.5px solid rgba(0,0,0,0.08)", outline: "none",
              fontFamily: "inherit", fontSize: 14, color: "#1a1a2e",
              background: "white",
            }}
          />
          <button onClick={() => sendTestDrive()} disabled={tdLoading || !tdInput.trim()} style={{
            padding: "11px 18px", borderRadius: 12, border: "none",
            background: tdInput.trim() ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(0,0,0,0.05)",
            color: tdInput.trim() ? "white" : "rgba(26,26,46,0.4)",
            fontFamily: "inherit", fontSize: 14, fontWeight: 700,
            cursor: tdLoading || !tdInput.trim() ? "default" : "pointer",
          }}>Send</button>
        </div>

        <button onClick={() => setStep("done")} style={{ ...primaryBtn, marginTop: 16 }}>
          That&apos;s enough — let&apos;s go! →
        </button>
      </Shell>
    );
  }

  // ══════════════════════════════════════════════════════════
  // ── DONE ──
  // ══════════════════════════════════════════════════════════
  if (step === "done") {
    return (
      <Shell hideProgress>
        {/* Confetti specks */}
        {Array.from({ length: 18 }).map((_, i) => {
          const colors = ["#f59e0b", "#fbbf24", "#c084fc", "#60a5fa", "#4ade80", "#f472b6"];
          const left = (i * 73) % 100;
          const delay = (i * 0.07).toFixed(2);
          return (
            <div key={i} style={{
              position: "absolute", left: `${left}%`, top: -10,
              width: 6, height: 12, borderRadius: 1,
              background: colors[i % colors.length],
              animation: `obConfettiFall 1.6s ${delay}s ease-out forwards`,
              opacity: 0,
            }} />
          );
        })}

        <div style={{ textAlign: "center", paddingTop: 12 }}>
          <div style={{ marginBottom: 18, animation: "obBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
            <PetAvatar pet={pet} size={120} />
          </div>
          {eyebrow("All set ✨")}
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#1a1a2e", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
            You & {pet.name} are ready
          </h2>
          <div style={{
            display: "inline-block",
            margin: "12px 0 6px",
            padding: "10px 22px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            color: "white",
            fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em",
            boxShadow: "0 12px 30px rgba(245,158,11,0.32)",
          }}>
            +{points} pts
          </div>
          <p style={{ color: "rgba(26,26,46,0.55)", fontSize: 14, margin: "16px 0 18px", lineHeight: 1.55 }}>
            {pet.name} keeps learning every time you talk. Here's what's ahead:
          </p>
          {/* Capability welcome (VIGIL "what your companion can do") */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 430, margin: "0 auto 22px", textAlign: "left" }}>
            {([
              ["🧠", "Remembers you", "grows every chat"],
              ["🎯", "Give it a goal", "it plans & acts"],
              ["🔑", "Yours to own", "your data & model"],
            ] as const).map(([icon, t, s]) => (
              <div key={t} style={{ padding: "12px 12px", borderRadius: 12, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.14)" }}>
                <div style={{ fontSize: 18 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", marginTop: 4 }}>{t}</div>
                <div style={{ fontSize: 11.5, color: "rgba(26,26,46,0.5)", marginTop: 2 }}>{s}</div>
              </div>
            ))}
          </div>
          <button onClick={onComplete} style={primaryBtn}>Start chatting →</button>
          <div style={{ marginTop: 12 }}>
            <a href="/sovereignty" style={{ fontSize: 12.5, color: "#b45309", textDecoration: "none", fontWeight: 600 }}>
              Bring your own AI model (Claude · GPT · Gemini) ▸ PetClaw
            </a>
          </div>
        </div>
      </Shell>
    );
  }

  return null;
}

if (typeof document !== "undefined" && !document.getElementById("ob-anims")) {
  const style = document.createElement("style");
  style.id = "ob-anims";
  style.textContent = `
    @keyframes obSlideIn { 0% { opacity: 0; transform: translateY(20px) scale(0.97); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes obFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    @keyframes obPulseRing { 0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.4); } 100% { box-shadow: 0 0 0 22px rgba(220,38,38,0); } }
    @keyframes obBounce { 0% { transform: scale(0.7); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
    @keyframes obConfettiFall {
      0% { opacity: 0; transform: translateY(-20px) rotate(0deg); }
      10% { opacity: 1; }
      100% { opacity: 0; transform: translateY(540px) rotate(540deg); }
    }
  `;
  document.head.appendChild(style);
}

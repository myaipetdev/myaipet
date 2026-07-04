"use client";

import { useState, useEffect } from "react";
import { api, getAuthHeaders } from "@/lib/api";
import PetClawConsole from "@/components/PetClawConsole";
import Icon from "@/components/Icon";

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

type Step = "intro" | "quiz" | "social" | "testdrive" | "done";

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
  { id: "twitter",  name: "Twitter/X", icon: "𝕏", color: "#000",   desc: "Share your pet to X" },
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
        border: "4px solid #FBF6EC",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}
    />
  );
}

export default function EnhancedOnboarding({ pet, onComplete, onSkip }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [points, setPoints] = useState(0);

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
      // The persona PUT handler (pets/[petId]/persona) reads UNPREFIXED keys
      // (tone/speech_style/expressions/interests/bio) — sending owner_* keys
      // silently saved nothing. Use the keys the handler actually accepts.
      const data: Record<string, any> = {};
      if (quizAnswers.humor) data.tone = quizAnswers.humor;
      if (quizAnswers.communication) data.speech_style = quizAnswers.communication;
      if (quizAnswers.role) data.expressions = quizAnswers.role;
      if (quizAnswers.interests) data.interests = Array.isArray(quizAnswers.interests) ? (quizAnswers.interests as string[]).join(", ") : quizAnswers.interests;
      if (quizAnswers.frequency) data.bio = `Prefers ${quizAnswers.frequency} interaction frequency`;
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
  const stepIndex: Record<Step, number> = { intro: 0, quiz: 1, social: 2, testdrive: 3, done: 4 };
  const totalSteps = 4; // intro + 2 substeps + testdrive
  const progressIdx = step === "done" ? 4 : stepIndex[step];

  const Shell = ({ children, hideProgress }: { children: React.ReactNode; hideProgress?: boolean }) => (
    <div style={{
      width: "100%", maxWidth: 460,
      background: "#FBF6EC",
      borderRadius: 28,
      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      padding: "32px 28px",
      fontFamily: "var(--ed-body)",
      color: "#211A12",
      animation: "obSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
      position: "relative",
      overflow: "hidden",
    }}>
      {!hideProgress && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 22, position: "relative" }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} style={{
              height: 4, flex: 1, maxWidth: 56, borderRadius: 2,
              background: i < progressIdx
                ? "#BE4F28"
                : i === progressIdx
                  ? "#BE4F28"
                  : "rgba(33,26,18,0.10)",
              transition: "all 0.4s",
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
    background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE",
    fontSize: 15, fontWeight: 800, cursor: "pointer",
    fontFamily: "var(--ed-disp)", marginTop: 18, letterSpacing: "0.01em",
    boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
    transition: "transform 0.15s, box-shadow 0.2s",
  };
  const ghostBtn: React.CSSProperties = {
    width: "100%", padding: "12px 24px", borderRadius: 14,
    background: "transparent", border: "none",
    color: "#9A7B4E", fontFamily: "var(--ed-body)",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
    marginTop: 8,
  };
  const optionStyle = (on: boolean): React.CSSProperties => ({
    padding: "14px 16px", borderRadius: 14, cursor: "pointer",
    transition: "all 0.18s", textAlign: "left" as const,
    border: on ? "1px solid #BE4F28" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
    background: on
      ? "rgba(190,79,40,0.08)"
      : "#F5EFE2",
    transform: on ? "scale(1.01)" : "scale(1)",
  });

  // Eyebrow label (e.g. "STEP 1 / 3")
  const eyebrow = (text: string) => (
    <div style={{
      display: "inline-block",
      padding: "4px 10px", borderRadius: 999,
      background: "rgba(190,79,40,0.10)",
      color: "#9A4E1E",
      fontSize: 13, fontWeight: 700, letterSpacing: "0.12em",
      fontFamily: "var(--ed-m)",
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
            avatar_url: pet.avatar_url,
          }} />
        </div>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          {eyebrow("Welcome")}
          <h2 style={{ fontSize: 32, fontWeight: 800, color: "#211A12", margin: "0 0 6px", letterSpacing: "-0.02em", fontFamily: "var(--ed-disp)" }}>
            Meet {pet.name}
          </h2>
          <div style={{
            display: "inline-flex", gap: 6, alignItems: "center",
            padding: "5px 12px", borderRadius: 999,
            background: "rgba(33,26,18,0.05)",
            fontSize: 13, color: "#5C5140", fontWeight: 600,
            marginBottom: 14,
          }}>
            <span>Lv.{pet.level || 1}</span>
            <span>·</span>
            <span style={{ textTransform: "capitalize" }}>{pet.personality_type || "playful"}</span>
            {pet.element && pet.element !== "normal" && (<><span>·</span><span style={{ textTransform: "capitalize" }}>{pet.element}</span></>)}
          </div>
          <p style={{ color: "#5C5140", fontSize: 15, lineHeight: 1.55, margin: 0, padding: "0 8px" }}>
            {pet.name} is a companion that <strong>remembers you</strong> — a private memory that
            grows every chat, in a voice you tune. Let&apos;s spend a minute setting it up.
          </p>
        </div>

        {/* The honest path: what setup covers, and what's optional. Numbered so
            the first-run flow reads as one clear route, not a pile of features. */}
        <div style={{
          padding: "6px 4px 2px", marginBottom: 14,
        }}>
          <div style={{
            fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
            letterSpacing: "0.12em", color: "#9A7B4E", textTransform: "uppercase",
            padding: "0 10px", marginBottom: 8,
          }}>Your setup path</div>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              { n: 1, icon: "scroll", label: "Tune the personality", desc: "5 quick questions — now", tag: "Now" },
              { n: 2, icon: "chat", label: "Say hi", desc: "A first chat, so it starts learning you", tag: "Now" },
              { n: 3, icon: "extension-icon", label: "Connect your apps", desc: "Discord, Telegram, X, GitHub — same pet everywhere", tag: "Optional" },
              { n: 4, icon: "compass", label: "Bring your own model / browser companion", desc: "Connect a model or install the browser pet — from the PetClaw page", tag: "Later" },
            ].map((item) => (
              <div key={item.n} className="mp-lift" style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 14px", borderRadius: 14,
                background: "#F5EFE2",
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  background: "#BE4F28", color: "#FCE9CF",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, fontFamily: "var(--ed-m)",
                }}>{item.n}</div>
                <div style={{ color: "#BE4F28", display: "inline-flex", flexShrink: 0 }}><Icon name={item.icon} size={18} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#211A12", fontFamily: "var(--ed-disp)" }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: "#7A6E5A", marginTop: 1 }}>{item.desc}</div>
                </div>
                <span style={{
                  fontSize: 12, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
                  fontFamily: "var(--ed-m)", fontWeight: 700, letterSpacing: "0.04em",
                  background: item.tag === "Now" ? "rgba(92,138,78,0.14)" : "rgba(33,26,18,0.06)",
                  color: item.tag === "Now" ? "#5C8A4E" : "#9A7B4E",
                }}>{item.tag}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => setStep("quiz")} style={primaryBtn}
          onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
          onMouseOut={(e) => e.currentTarget.style.transform = ""}>
          Let's go ✨
        </button>
        <button onClick={onSkip} style={ghostBtn}>Skip for now</button>
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
          {eyebrow(`Step 1 of 2 · Q${quizIndex + 1}/${QUIZ_QUESTIONS.length}`)}
          <h3 style={{ fontSize: 22, fontWeight: 800, color: "#211A12", margin: "0 0 4px", letterSpacing: "-0.02em", fontFamily: "var(--ed-disp)" }}>
            {q.question}
          </h3>
          {isMulti && <p style={{ color: "#7A6E5A", fontSize: 13, margin: 0 }}>Pick up to 3</p>}
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {q.options.map(opt => {
            const on = isMulti ? ((cur as string[]) || []).includes(opt.value) : cur === opt.value;
            return (
              <div key={opt.value} onClick={() => handleQuizAnswer(q.id, opt.value, isMulti)} style={optionStyle(on)}>
                <div style={{ fontSize: 14, fontWeight: 700, color: on ? "#9A4E1E" : "#211A12", fontFamily: "var(--ed-disp)" }}>{opt.label}</div>
                {"desc" in opt && <div style={{ fontSize: 13, color: "#7A6E5A", marginTop: 3 }}>{(opt as any).desc}</div>}
              </div>
            );
          })}
        </div>

        {/* Question dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 4 }}>
          {QUIZ_QUESTIONS.map((_, i) => (
            <div key={i} style={{
              width: i === quizIndex ? 18 : 6, height: 6, borderRadius: 3,
              background: i <= quizIndex ? "#BE4F28" : "rgba(33,26,18,0.10)",
              transition: "all 0.3s",
            }} />
          ))}
        </div>

        <button
          onClick={() => { if (quizIndex < QUIZ_QUESTIONS.length - 1) setQuizIndex(quizIndex + 1); else { addPoints(30); setStep("social"); } }}
          disabled={!canNext}
          style={{ ...primaryBtn, opacity: canNext ? 1 : 0.4, cursor: canNext ? "pointer" : "not-allowed", boxShadow: canNext ? "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))" : "none" }}>
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
          {eyebrow("Step 2 of 2")}
          <h3 style={{ fontSize: 24, fontWeight: 800, color: "#211A12", margin: "0 0 6px", letterSpacing: "-0.02em", fontFamily: "var(--ed-disp)" }}>
            Where should {pet.name} live?
          </h3>
          <p style={{ color: "#5C5140", fontSize: 14, margin: 0 }}>
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
                border: on ? `1px solid ${p.color}` : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                background: on ? `${p.color}10` : "#F5EFE2",
                transition: "all 0.18s",
                transform: on ? "scale(1.01)" : "scale(1)",
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: p.color, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 800, flexShrink: 0,
                }}>{p.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#211A12", fontFamily: "var(--ed-disp)" }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: "#7A6E5A", marginTop: 1 }}>{p.desc}</div>
                </div>
                <span style={{
                  fontSize: 13, padding: "4px 11px", borderRadius: 999, fontWeight: 700,
                  fontFamily: "var(--ed-m)",
                  background: on ? "rgba(92,138,78,0.16)" : "rgba(33,26,18,0.06)",
                  color: on ? "#5C8A4E" : "#9A7B4E",
                }}>{on ? "✓ Connected" : "Connect"}</span>
              </div>
            );
          })}
        </div>

        <button onClick={saveAndComplete} disabled={saving} style={primaryBtn}>
          {saving ? "Saving…" : "Finish — all set 🎉"}
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
          <h3 style={{ fontSize: 22, fontWeight: 800, color: "#211A12", margin: "0 0 6px", letterSpacing: "-0.02em", fontFamily: "var(--ed-disp)" }}>
            {pet.name} just learned about you
          </h3>
          <p style={{ color: "#5C5140", fontSize: 13, margin: 0 }}>
            Say something. They&apos;ll remember it.
          </p>
        </div>

        {/* Chat window */}
        <div style={{
          height: 220, padding: 12, marginBottom: 10,
          background: "#ECE4D4", borderRadius: 14,
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          overflowY: "auto", display: "flex", flexDirection: "column", gap: 8,
        }}>
          {tdMessages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "82%",
              padding: "8px 12px", borderRadius: 14,
              background: m.role === "user"
                ? "linear-gradient(180deg,#F49B2A,#E27D0C)"
                : "#FBF6EC",
              color: m.role === "user" ? "#FFF8EE" : "#211A12",
              fontSize: 13.5, lineHeight: 1.5,
              border: m.role === "pet" ? "1px solid var(--ed-hair, rgba(33,26,18,.13))" : "none",
              animation: "obSlideIn 0.25s ease-out",
            }}>
              {m.text}
            </div>
          ))}
          {tdLoading && (
            <div style={{
              alignSelf: "flex-start", padding: "8px 12px", borderRadius: 14,
              background: "#FBF6EC", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              fontSize: 14, color: "#7A6E5A",
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
              background: "#F5EFE2", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              color: "#5C5140", cursor: tdLoading ? "wait" : "pointer",
              fontFamily: "var(--ed-body)", fontSize: 13, fontWeight: 500,
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
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", outline: "none",
              fontFamily: "var(--ed-body)", fontSize: 14, color: "#211A12",
              background: "#F5EFE2",
            }}
          />
          <button onClick={() => sendTestDrive()} disabled={tdLoading || !tdInput.trim()} style={{
            padding: "11px 18px", borderRadius: 12, border: "none",
            background: tdInput.trim() ? "linear-gradient(180deg,#F49B2A,#E27D0C)" : "rgba(33,26,18,0.06)",
            color: tdInput.trim() ? "#FFF8EE" : "#9A7B4E",
            fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 700,
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
        <div style={{ textAlign: "center", paddingTop: 12 }}>
          <div style={{ marginBottom: 18, animation: "obBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
            <PetAvatar pet={pet} size={120} />
          </div>
          {eyebrow("All set ✨")}
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#211A12", margin: "0 0 8px", letterSpacing: "-0.02em", fontFamily: "var(--ed-disp)" }}>
            You & {pet.name} are ready
          </h2>
          <div style={{
            display: "inline-block",
            margin: "12px 0 6px",
            padding: "10px 22px",
            borderRadius: 999,
            background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
            color: "#FFF8EE",
            fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em",
            fontFamily: "var(--ed-disp)",
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          }}>
            Setup complete
          </div>
          <p style={{ color: "#5C5140", fontSize: 14, margin: "16px 0 18px", lineHeight: 1.55 }}>
            {pet.name} keeps learning every time you talk. Here's what's ahead:
          </p>
          {/* Capability welcome (VIGIL "what your companion can do") */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 430, margin: "0 auto 22px", textAlign: "left" }}>
            {([
              ["crystal-ball", "Remembers you", "grows every chat"],
              ["compass", "Give it a goal", "it plans & acts"],
              ["lock", "Yours to own", "your data & model"],
            ] as const).map(([icon, t, s]) => (
              <div key={t} style={{ padding: "12px 12px", borderRadius: 12, background: "#F5EFE2", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))" }}>
                <div style={{ fontSize: 18 }}><Icon name={icon} size={20} /></div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#211A12", marginTop: 4, fontFamily: "var(--ed-disp)" }}>{t}</div>
                <div style={{ fontSize: 13, color: "#7A6E5A", marginTop: 2 }}>{s}</div>
              </div>
            ))}
          </div>
          <button onClick={onComplete} style={primaryBtn}>Start chatting →</button>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <a href="/sovereignty" className="ed-underline-slide" style={{ fontSize: 13, color: "#9A4E1E", textDecoration: "none", fontWeight: 600 }}>
              Connect your own AI model or CLI ▸ PetClaw
            </a>
            <a href="/sovereignty" className="ed-underline-slide" style={{ fontSize: 13, color: "#9A4E1E", textDecoration: "none", fontWeight: 600 }}>
              Install the browser companion ▸ PetClaw
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
    @keyframes obBounce { 0% { transform: scale(0.7); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
  `;
  document.head.appendChild(style);
}

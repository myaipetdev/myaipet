"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api";

/**
 * Enhanced Onboarding — After pet adoption
 * Centered on the PET (not owner selfie)
 * Steps: Meet Pet → Name Your Pet's Voice → Personality Quiz → Connect Platforms → Done
 */

interface Props {
  pet: any;
  onComplete: () => void;
  onSkip: () => void;
}

type Step = "intro" | "voice" | "quiz" | "social" | "done";

const QUIZ_QUESTIONS = [
  {
    id: "humor",
    question: "How should your pet be funny?",
    options: [
      { value: "meme", label: "Meme Lord 🤣", desc: "Internet humor, memes, references" },
      { value: "warm", label: "Warm & Wholesome 🥰", desc: "Sweet, supportive, dad jokes" },
      { value: "sarcastic", label: "Sarcastic 😏", desc: "Dry wit, clever comebacks" },
      { value: "chaotic", label: "Chaotic Energy 🤪", desc: "Random, unpredictable, wild" },
    ],
  },
  {
    id: "communication",
    question: "How should your pet talk?",
    options: [
      { value: "brief", label: "Short & Sweet 💬", desc: "1-2 sentences, to the point" },
      { value: "detailed", label: "Detailed 📝", desc: "Thoughtful, longer responses" },
      { value: "emoji-heavy", label: "Emoji Lover 😍✨🔥", desc: "Express through emojis" },
      { value: "chill", label: "Super Chill 😎", desc: "Relaxed, lowercase, vibes" },
    ],
  },
  {
    id: "role",
    question: "What role should your pet play?",
    options: [
      { value: "companion", label: "Best Friend 🤝", desc: "Always there, casual chat" },
      { value: "coach", label: "Life Coach 💪", desc: "Motivates, pushes you forward" },
      { value: "entertainer", label: "Entertainer 🎭", desc: "Makes you laugh, tells stories" },
      { value: "mentor", label: "Wise Mentor 🧙", desc: "Thoughtful advice, deep talks" },
    ],
  },
  {
    id: "interests",
    question: "What should your pet care about? (pick 3)",
    multi: true,
    options: [
      { value: "crypto", label: "Crypto & Web3" }, { value: "gaming", label: "Gaming" },
      { value: "music", label: "Music" }, { value: "coding", label: "Coding" },
      { value: "art", label: "Art & Design" }, { value: "food", label: "Food & Cooking" },
      { value: "fitness", label: "Fitness" }, { value: "travel", label: "Travel" },
      { value: "anime", label: "Anime & Manga" }, { value: "memes", label: "Memes & Culture" },
      { value: "science", label: "Science" }, { value: "business", label: "Business" },
    ],
  },
  {
    id: "frequency",
    question: "How often should your pet reach out?",
    options: [
      { value: "rarely", label: "When I talk first 🤫", desc: "Quiet, responds only" },
      { value: "sometimes", label: "Sometimes 💭", desc: "Occasional thoughts and check-ins" },
      { value: "often", label: "Often 💬", desc: "Regular messages throughout the day" },
      { value: "always", label: "Always There 🫂", desc: "Constant companion, never stops" },
    ],
  },
];

const SOCIAL_PLATFORMS = [
  { id: "telegram", name: "Telegram", icon: "T", color: "#2AABEE", desc: "Chat on Telegram" },
  { id: "twitter", name: "Twitter/X", icon: "𝕏", color: "#000", desc: "Post & interact on X" },
  { id: "discord", name: "Discord", icon: "D", color: "#5865F2", desc: "Join your servers" },
];

// Pet avatar component used throughout
function PetAvatar({ pet, size = 80 }: { pet: any; size?: number }) {
  if (pet.avatar_url) {
    return (
      <img src={pet.avatar_url} alt={pet.name}
        style={{ width: size, height: size, borderRadius: size * 0.25, objectFit: "cover",
          border: "3px solid rgba(245,158,11,0.4)",
          boxShadow: "0 8px 30px rgba(245,158,11,0.2)" }} />
    );
  }
  const emojis = ["🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶"];
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.25,
      background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(139,92,246,0.1))",
      border: "3px solid rgba(245,158,11,0.3)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.5 }}>
      {emojis[pet.species] || "🐾"}
    </div>
  );
}

export default function EnhancedOnboarding({ pet, onComplete, onSkip }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [points, setPoints] = useState(0);

  // Voice state
  const [recording, setRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Quiz state
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string | string[]>>({});

  // Social state
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

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

  // Quiz handlers
  const handleQuizAnswer = (qId: string, val: string, isMulti?: boolean) => {
    if (isMulti) {
      const cur = (quizAnswers[qId] as string[]) || [];
      setQuizAnswers({ ...quizAnswers, [qId]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val].slice(0, 3) });
    } else {
      setQuizAnswers({ ...quizAnswers, [qId]: val });
    }
  };

  // Save
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
    setStep("done");
  };

  // Styles
  const card: React.CSSProperties = {
    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(24px)",
    borderRadius: 24, padding: 36, maxWidth: 460, margin: "0 auto",
    border: "1px solid rgba(255,255,255,0.08)", color: "#fff",
    fontFamily: "'Space Grotesk', sans-serif",
  };
  const btn1: React.CSSProperties = {
    padding: "14px 28px", borderRadius: 14, border: "none",
    background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff",
    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    width: "100%", marginTop: 16, transition: "transform .2s",
  };
  const btn2: React.CSSProperties = { ...btn1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#999" };
  const optStyle = (on: boolean): React.CSSProperties => ({
    padding: "14px 16px", borderRadius: 12, cursor: "pointer", transition: "all .2s", textAlign: "left" as const,
    border: on ? "2px solid #f59e0b" : "1px solid rgba(255,255,255,0.08)",
    background: on ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.03)",
  });

  // ── INTRO: Meet your pet ──
  if (step === "intro") {
    return (
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <PetAvatar pet={pet} size={120} />
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#f59e0b", marginBottom: 4 }}>
            {pet.name} is here!
          </h2>
          <p style={{ color: "#888", fontSize: 13 }}>
            Lv.{pet.level || 1} · {pet.personality_type || "playful"} · {pet.element || "normal"}
          </p>
          <p style={{ color: "#aaa", fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
            Let's teach {pet.name} how to be the perfect companion for you.
          </p>
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
          {[
            { icon: "🎤", label: "Teach your voice", pts: "+50", desc: `${pet.name} learns your tone` },
            { icon: "📝", label: "Personality match", pts: "+30", desc: "5 quick questions" },
            { icon: "🔗", label: "Connect platforms", pts: "+100", desc: `${pet.name} goes everywhere with you` },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0" }}>{item.label}</div>
                <div style={{ fontSize: 10, color: "#666" }}>{item.desc}</div>
              </div>
              <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>{item.pts}</span>
            </div>
          ))}
        </div>

        <button onClick={() => setStep("voice")} style={btn1}>Let's go! ✨</button>
        <button onClick={onSkip} style={{ ...btn2, marginTop: 8 }}>Skip for now</button>
      </div>
    );
  }

  // ── VOICE: Teach your pet your voice ──
  if (step === "voice") {
    return (
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <PetAvatar pet={pet} size={64} />
          <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.1em", marginTop: 12 }}>STEP 1 / 3</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>🎤 Teach {pet.name} your voice</h3>
          <p style={{ color: "#888", fontSize: 13 }}>Record 10-30 seconds so {pet.name} can match your tone</p>
        </div>

        <div style={{ textAlign: "center", padding: 20 }}>
          {recording ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 12, animation: "pulse 1.5s infinite" }}>🔴</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#f87171", fontFamily: "monospace" }}>{voiceDuration}s</div>
              <button onClick={stopRecording} style={{ ...btn1, background: "#dc2626", marginTop: 16 }}>Stop Recording</button>
            </>
          ) : voiceBlob ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 14, color: "#4ade80" }}>Recorded {voiceDuration}s</div>
              <button onClick={() => { addPoints(50); setStep("quiz"); }} style={btn1}>Save & Continue (+50 pts) ✨</button>
              <button onClick={() => { setVoiceBlob(null); setVoiceDuration(0); }} style={{ ...btn2, marginTop: 8 }}>Re-record</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎙️</div>
              <button onClick={startRecording} style={btn1}>Start Recording</button>
            </>
          )}
        </div>
        <button onClick={() => setStep("quiz")} style={{ ...btn2, marginTop: 8 }}>Skip</button>
        <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  // ── QUIZ: Personality match ──
  if (step === "quiz") {
    const q = QUIZ_QUESTIONS[quizIndex];
    const cur = quizAnswers[q.id];
    const isMulti = !!(q as any).multi;
    const canNext = isMulti ? ((cur as string[])?.length || 0) > 0 : !!cur;

    return (
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <PetAvatar pet={pet} size={48} />
          <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.1em", marginTop: 10 }}>
            STEP 2 / 3 — Q{quizIndex + 1}/{QUIZ_QUESTIONS.length}
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>{q.question}</h3>
          {isMulti && <p style={{ color: "#888", fontSize: 12 }}>Select up to 3</p>}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {q.options.map(opt => {
            const on = isMulti ? ((cur as string[]) || []).includes(opt.value) : cur === opt.value;
            return (
              <div key={opt.value} onClick={() => handleQuizAnswer(q.id, opt.value, isMulti)} style={optStyle(on)}>
                <div style={{ fontSize: 14, fontWeight: 600, color: on ? "#f59e0b" : "#e0e0e0" }}>{opt.label}</div>
                {"desc" in opt && <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{(opt as any).desc}</div>}
              </div>
            );
          })}
        </div>

        <button onClick={() => { if (quizIndex < QUIZ_QUESTIONS.length - 1) setQuizIndex(quizIndex + 1); else { addPoints(30); setStep("social"); } }}
          disabled={!canNext} style={{ ...btn1, opacity: canNext ? 1 : 0.4, cursor: canNext ? "pointer" : "not-allowed" }}>
          {quizIndex < QUIZ_QUESTIONS.length - 1 ? "Next →" : "Done! (+30 pts) ✨"}
        </button>

        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
          {QUIZ_QUESTIONS.map((_, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: 4, background: i <= quizIndex ? "#f59e0b" : "rgba(255,255,255,0.1)" }} />
          ))}
        </div>
      </div>
    );
  }

  // ── SOCIAL: Connect platforms ──
  if (step === "social") {
    return (
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <PetAvatar pet={pet} size={48} />
          <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.1em", marginTop: 10 }}>STEP 3 / 3</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>🔗 Where should {pet.name} live?</h3>
          <p style={{ color: "#888", fontSize: 13 }}>{pet.name} can follow you across platforms</p>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {SOCIAL_PLATFORMS.map(p => {
            const on = connectedPlatforms.includes(p.id);
            return (
              <div key={p.id} onClick={() => { if (!on) { setConnectedPlatforms([...connectedPlatforms, p.id]); addPoints(33); } }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12, cursor: "pointer",
                  border: on ? `2px solid ${p.color}` : "1px solid rgba(255,255,255,0.08)",
                  background: on ? `${p.color}10` : "rgba(255,255,255,0.03)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: p.color, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800 }}>{p.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>{p.desc}</div>
                </div>
                <span style={{ fontSize: 12, color: on ? "#4ade80" : "#666" }}>{on ? "✓" : "Connect"}</span>
              </div>
            );
          })}
        </div>

        <button onClick={saveAndComplete} disabled={saving} style={btn1}>
          {saving ? "Saving..." : `Complete (+${points} pts total) 🎉`}
        </button>
        <button onClick={saveAndComplete} style={{ ...btn2, marginTop: 8 }}>Skip & Finish</button>
      </div>
    );
  }

  // ── DONE ──
  if (step === "done") {
    return (
      <div style={card}>
        <div style={{ textAlign: "center" }}>
          <div style={{ marginBottom: 16 }}><PetAvatar pet={pet} size={100} /></div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#f59e0b", marginBottom: 8 }}>You & {pet.name} are ready!</h2>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#f59e0b", padding: "8px 0", fontFamily: "monospace" }}>+{points} pts</div>
          <p style={{ color: "#666", fontSize: 12, marginBottom: 20 }}>{pet.name} will keep learning from every interaction.</p>
          <button onClick={onComplete} style={btn1}>Start Chatting with {pet.name} →</button>
        </div>
      </div>
    );
  }

  return null;
}

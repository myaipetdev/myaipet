"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api";

/**
 * Enhanced Onboarding — Step 2 after pet adoption
 * Collects: Selfie, Voice, Personality Quiz, Social Connect
 * Each step awards points, all steps optional
 */

interface Props {
  pet: any;
  onComplete: () => void;
  onSkip: () => void;
}

type Step = "intro" | "selfie" | "voice" | "quiz" | "social" | "done";

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
      { value: "crypto", label: "Crypto & Web3" },
      { value: "gaming", label: "Gaming" },
      { value: "music", label: "Music" },
      { value: "coding", label: "Coding" },
      { value: "art", label: "Art & Design" },
      { value: "food", label: "Food & Cooking" },
      { value: "fitness", label: "Fitness" },
      { value: "travel", label: "Travel" },
      { value: "anime", label: "Anime & Manga" },
      { value: "memes", label: "Memes & Culture" },
      { value: "science", label: "Science" },
      { value: "business", label: "Business" },
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
  { id: "twitter", name: "Twitter/X", icon: "𝕏", color: "#000", desc: "Analyze your tweets to learn your style" },
  { id: "telegram", name: "Telegram", icon: "T", color: "#2AABEE", desc: "Connect bot to chat on your behalf" },
  { id: "discord", name: "Discord", icon: "D", color: "#5865F2", desc: "Join your servers and interact" },
];

export default function EnhancedOnboarding({ pet, onComplete, onSkip }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [points, setPoints] = useState(0);

  // Selfie state
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  // Saving
  const [saving, setSaving] = useState(false);

  const addPoints = (pts: number) => setPoints(p => p + pts);

  // ── Selfie handlers ──
  const handleSelfie = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelfieFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setSelfiePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const saveSelfie = async () => {
    if (!selfieFile) return;
    addPoints(50);
    setStep("voice");
  };

  // ── Voice handlers ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setVoiceBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
      setVoiceDuration(0);
      voiceTimerRef.current = setInterval(() => setVoiceDuration(d => d + 1), 1000);
    } catch {
      alert("Microphone access required for voice recording");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
  };

  const saveVoice = async () => {
    if (!voiceBlob) return;
    addPoints(50);
    setStep("quiz");
  };

  // ── Quiz handlers ──
  const handleQuizAnswer = (questionId: string, value: string, isMulti?: boolean) => {
    if (isMulti) {
      const current = (quizAnswers[questionId] as string[]) || [];
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value].slice(0, 3);
      setQuizAnswers({ ...quizAnswers, [questionId]: updated });
    } else {
      setQuizAnswers({ ...quizAnswers, [questionId]: value });
    }
  };

  const nextQuizQuestion = () => {
    if (quizIndex < QUIZ_QUESTIONS.length - 1) {
      setQuizIndex(quizIndex + 1);
    } else {
      addPoints(30);
      setStep("social");
    }
  };

  // ── Save all to persona ──
  const saveAllAndComplete = async () => {
    setSaving(true);
    try {
      const personaData: Record<string, any> = {};

      // Map quiz answers to persona fields
      if (quizAnswers.humor) personaData.owner_tone = quizAnswers.humor;
      if (quizAnswers.communication) personaData.owner_speech_style = quizAnswers.communication;
      if (quizAnswers.role) personaData.owner_expressions = quizAnswers.role;
      if (quizAnswers.interests) {
        personaData.owner_interests = Array.isArray(quizAnswers.interests)
          ? (quizAnswers.interests as string[]).join(", ")
          : quizAnswers.interests;
      }
      if (quizAnswers.frequency) {
        personaData.owner_bio = `Prefers ${quizAnswers.frequency} interaction frequency`;
      }

      // Save persona
      if (Object.keys(personaData).length > 0) {
        await api.persona.save(pet.id, personaData).catch(() => {});
      }

      // Upload selfie if provided
      if (selfieFile) {
        const formData = new FormData();
        formData.append("file", selfieFile);
        try {
          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          if (uploadRes.ok) {
            const { url } = await uploadRes.json();
            await api.pets.update(pet.id, { owner_selfie_url: url }).catch(() => {});
          }
        } catch {}
      }

      addPoints(10); // completion bonus
    } catch {}
    setSaving(false);
    setStep("done");
  };

  // ── Styles ──
  const cardStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.4)",
    backdropFilter: "blur(20px)",
    borderRadius: 20,
    padding: 32,
    maxWidth: 480,
    margin: "0 auto",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#fff",
    fontFamily: "'Space Grotesk', sans-serif",
  };

  const btnPrimary: React.CSSProperties = {
    padding: "14px 28px",
    borderRadius: 14,
    border: "none",
    background: "linear-gradient(135deg, #f59e0b, #d97706)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    width: "100%",
    marginTop: 16,
  };

  const btnSecondary: React.CSSProperties = {
    ...btnPrimary,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#999",
  };

  const optionStyle = (selected: boolean): React.CSSProperties => ({
    padding: "14px 16px",
    borderRadius: 12,
    border: selected ? "2px solid #f59e0b" : "1px solid rgba(255,255,255,0.08)",
    background: selected ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.03)",
    cursor: "pointer",
    transition: "all 0.2s",
    textAlign: "left" as const,
  });

  // ── Render ──

  if (step === "intro") {
    return (
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>
            {pet.avatar_url
              ? <img src={pet.avatar_url} alt="" style={{ width: 80, height: 80, borderRadius: 20, objectFit: "cover" }} />
              : "🐾"
            }
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#f59e0b", marginBottom: 8 }}>
            Meet {pet.name}!
          </h2>
          <p style={{ color: "#999", fontSize: 14, lineHeight: 1.6 }}>
            Let's make {pet.name} truly yours. The more you share, the better your companion understands you.
          </p>
        </div>

        <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          {[
            { icon: "🤳", label: "Upload Selfie", pts: "+50 pts", desc: "Your pet knows your face" },
            { icon: "🎤", label: "Voice Sample", pts: "+50 pts", desc: "Your pet learns your tone" },
            { icon: "📝", label: "Personality Quiz", pts: "+30 pts", desc: "5 quick questions" },
            { icon: "🔗", label: "Connect Socials", pts: "+100 pts", desc: "Auto-learn your style" },
          ].map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", borderRadius: 12,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <span style={{ fontSize: 24 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "#666" }}>{item.desc}</div>
              </div>
              <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>{item.pts}</span>
            </div>
          ))}
        </div>

        <button onClick={() => setStep("selfie")} style={btnPrimary}>
          Let's Go! ✨
        </button>
        <button onClick={onSkip} style={{ ...btnSecondary, marginTop: 8 }}>
          Skip for now
        </button>
      </div>
    );
  }

  if (step === "selfie") {
    return (
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>STEP 1 / 4</div>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>🤳 Owner Selfie</h3>
          <p style={{ color: "#888", fontSize: 13 }}>Your pet wants to know what you look like!</p>
        </div>

        {selfiePreview ? (
          <div style={{ textAlign: "center" }}>
            <img src={selfiePreview} alt="selfie" style={{ width: 160, height: 160, borderRadius: 20, objectFit: "cover", border: "3px solid #f59e0b" }} />
            <button onClick={saveSelfie} style={btnPrimary}>Save & Continue (+50 pts) ✨</button>
          </div>
        ) : (
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: "2px dashed rgba(245,158,11,0.3)", borderRadius: 16, padding: 40,
              textAlign: "center", cursor: "pointer", background: "rgba(245,158,11,0.03)",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 8 }}>📸</div>
            <div style={{ color: "#999", fontSize: 13 }}>Tap to upload a selfie</div>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handleSelfie} style={{ display: "none" }} />
        <button onClick={() => setStep("voice")} style={{ ...btnSecondary, marginTop: 8 }}>Skip</button>
      </div>
    );
  }

  if (step === "voice") {
    return (
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>STEP 2 / 4</div>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>🎤 Voice Sample</h3>
          <p style={{ color: "#888", fontSize: 13 }}>Record 10-30 seconds so your pet learns your tone</p>
        </div>

        <div style={{ textAlign: "center", padding: 20 }}>
          {recording ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 12, animation: "pulse 1.5s infinite" }}>🔴</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#f87171", fontFamily: "monospace" }}>{voiceDuration}s</div>
              <button onClick={stopRecording} style={{ ...btnPrimary, background: "#dc2626", marginTop: 16 }}>Stop Recording</button>
            </>
          ) : voiceBlob ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 14, color: "#4ade80" }}>Recorded {voiceDuration}s</div>
              <button onClick={saveVoice} style={btnPrimary}>Save & Continue (+50 pts) ✨</button>
              <button onClick={() => { setVoiceBlob(null); setVoiceDuration(0); }} style={{ ...btnSecondary, marginTop: 8 }}>Re-record</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎙️</div>
              <button onClick={startRecording} style={btnPrimary}>Start Recording</button>
            </>
          )}
        </div>
        <button onClick={() => setStep("quiz")} style={{ ...btnSecondary, marginTop: 8 }}>Skip</button>
        <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (step === "quiz") {
    const q = QUIZ_QUESTIONS[quizIndex];
    const currentAnswer = quizAnswers[q.id];
    const isMulti = !!(q as any).multi;
    const canProceed = isMulti ? ((currentAnswer as string[])?.length || 0) > 0 : !!currentAnswer;

    return (
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>
            STEP 3 / 4 — Question {quizIndex + 1}/{QUIZ_QUESTIONS.length}
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{q.question}</h3>
          {isMulti && <p style={{ color: "#888", fontSize: 12 }}>Select up to 3</p>}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {q.options.map(opt => {
            const selected = isMulti
              ? ((currentAnswer as string[]) || []).includes(opt.value)
              : currentAnswer === opt.value;
            return (
              <div
                key={opt.value}
                onClick={() => handleQuizAnswer(q.id, opt.value, isMulti)}
                style={optionStyle(selected)}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: selected ? "#f59e0b" : "#e0e0e0" }}>
                  {opt.label}
                </div>
                {"desc" in opt && (
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{(opt as any).desc}</div>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={nextQuizQuestion} disabled={!canProceed} style={{
          ...btnPrimary, opacity: canProceed ? 1 : 0.4, cursor: canProceed ? "pointer" : "not-allowed",
        }}>
          {quizIndex < QUIZ_QUESTIONS.length - 1 ? "Next →" : "Done! (+30 pts) ✨"}
        </button>

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
          {QUIZ_QUESTIONS.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: 4,
              background: i <= quizIndex ? "#f59e0b" : "rgba(255,255,255,0.1)",
            }} />
          ))}
        </div>
      </div>
    );
  }

  if (step === "social") {
    return (
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>STEP 4 / 4</div>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>🔗 Connect Socials</h3>
          <p style={{ color: "#888", fontSize: 13 }}>Your pet auto-learns your style from your posts</p>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {SOCIAL_PLATFORMS.map(p => {
            const connected = connectedPlatforms.includes(p.id);
            return (
              <div
                key={p.id}
                onClick={() => {
                  if (!connected) {
                    setConnectedPlatforms([...connectedPlatforms, p.id]);
                    addPoints(33);
                  }
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 16px", borderRadius: 12, cursor: "pointer",
                  border: connected ? `2px solid ${p.color}` : "1px solid rgba(255,255,255,0.08)",
                  background: connected ? `${p.color}10` : "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: p.color, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 800,
                }}>{p.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>{p.desc}</div>
                </div>
                <span style={{ fontSize: 12, color: connected ? "#4ade80" : "#666" }}>
                  {connected ? "✓ Connected" : "Connect"}
                </span>
              </div>
            );
          })}
        </div>

        <button onClick={saveAllAndComplete} disabled={saving} style={btnPrimary}>
          {saving ? "Saving..." : `Complete Setup (+${points} pts total) 🎉`}
        </button>
        <button onClick={saveAllAndComplete} style={{ ...btnSecondary, marginTop: 8 }}>Skip & Finish</button>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div style={cardStyle}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#f59e0b", marginBottom: 8 }}>
            All Set!
          </h2>
          <p style={{ color: "#999", fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
            {pet.name} is ready to be your companion.
          </p>
          <div style={{
            fontSize: 32, fontWeight: 800, color: "#f59e0b",
            padding: "12px 0", fontFamily: "monospace",
          }}>
            +{points} pts earned
          </div>
          <p style={{ color: "#666", fontSize: 12, marginBottom: 20 }}>
            Your pet will keep learning from every interaction.
          </p>
          <button onClick={onComplete} style={btnPrimary}>
            Start Chatting with {pet.name} →
          </button>
        </div>
      </div>
    );
  }

  return null;
}

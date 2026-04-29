"use client";

import { useState, useEffect, useRef } from "react";
import { useConfig } from "wagmi";
import { api, getAuthHeaders } from "@/lib/api";
import { signAction } from "@/lib/signAction";
import { useRecordAdoption, isPETActivityEnabled, useCheckBnbBalance } from "@/hooks/usePETActivity";
import EnhancedOnboarding from "@/components/EnhancedOnboarding";

const PET_SPECIES = ["Cat","Dog","Parrot","Turtle","Hamster","Rabbit","Fox","Pomeranian"];
const PET_EMOJIS = ["🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶"];

function getSpeciesName(pet: any): string {
  const mods = pet.personality_modifiers;
  if (mods && typeof mods === "object" && (mods as any).species_name) return (mods as any).species_name;
  return "Pet";
}

const PERSONALITIES = [
  { id: "friendly", label: "Friendly", emoji: "🤗", desc: "Warm & approachable" },
  { id: "playful", label: "Playful", emoji: "🎉", desc: "Energetic & fun" },
  { id: "shy", label: "Shy", emoji: "🙈", desc: "Gentle & cautious" },
  { id: "brave", label: "Brave", emoji: "🦁", desc: "Confident & bold" },
  { id: "lazy", label: "Lazy", emoji: "😴", desc: "Chill & relaxed" },
  { id: "curious", label: "Curious", emoji: "🔍", desc: "Always exploring" },
  { id: "mischievous", label: "Mischievous", emoji: "😈", desc: "Sneaky troublemaker" },
  { id: "gentle", label: "Gentle", emoji: "🕊️", desc: "Calm & peaceful" },
  { id: "adventurous", label: "Adventurous", emoji: "🗺️", desc: "Born explorer" },
  { id: "dramatic", label: "Dramatic", emoji: "🎭", desc: "Main character energy" },
  { id: "wise", label: "Wise", emoji: "🦉", desc: "Thoughtful & mature" },
  { id: "sassy", label: "Sassy", emoji: "💅", desc: "Diva attitude" },
];

const INTERACTIONS = [
  { type: "feed", label: "Feed", icon: "🍖", color: "#4ade80", desc: "Reduce hunger" },
  { type: "play", label: "Play", icon: "⚽", color: "#60a5fa", desc: "Boost happiness" },
  { type: "talk", label: "Talk", icon: "💬", color: "#c084fc", desc: "Build bond" },
  { type: "pet", label: "Pet", icon: "🤚", color: "#f472b6", desc: "Show affection" },
  { type: "walk", label: "Walk", icon: "🚶", color: "#fbbf24", desc: "Gain energy" },
  { type: "train", label: "Train", icon: "🎓", color: "#f97316", desc: "Gain experience" },
];

const MOOD_CONFIG: any = {
  ecstatic: { emoji: "🤩", color: "#fbbf24", label: "Ecstatic" },
  happy: { emoji: "😊", color: "#4ade80", label: "Happy" },
  neutral: { emoji: "😐", color: "#94a3b8", label: "Neutral" },
  sad: { emoji: "😢", color: "#60a5fa", label: "Sad" },
  exhausted: { emoji: "😴", color: "#8b5cf6", label: "Exhausted" },
  starving: { emoji: "🤤", color: "#f97316", label: "Starving" },
  grumpy: { emoji: "😤", color: "#f87171", label: "Grumpy" },
  tired: { emoji: "😪", color: "#a78bfa", label: "Tired" },
  hungry: { emoji: "😋", color: "#fbbf24", label: "Hungry" },
};

function AnimatedStatBar({ label, value, color, max = 100, icon }: any) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDisplayValue(value), 50);
    return () => clearTimeout(timer);
  }, [value]);

  const pct = Math.min(100, (displayValue / max) * 100);
  const isLow = pct < 25;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
        <span style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.5)", display: "flex", alignItems: "center", gap: 4 }}>
          {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
          {label}
        </span>
        <span style={{
          fontFamily: "mono", fontSize: 10, color,
          animation: isLow ? "pulse 1.5s ease-in-out infinite" : "none",
        }}>
          {displayValue}/{max}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          width: `${pct}%`,
          transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: `0 0 12px ${color}40`,
          position: "relative",
        }}>
          {pct > 10 && (
            <div style={{
              position: "absolute", right: 0, top: 0, bottom: 0, width: 8,
              background: `linear-gradient(90deg, transparent, ${color})`,
              borderRadius: "0 3px 3px 0", opacity: 0.6,
            }} />
          )}
        </div>
      </div>
    </div>
  );
}


function CreatePetModal({ onClose, onCreated }: any) {
  const wagmiConfig = useConfig();
  const { checkBnb, switchToBsc } = useCheckBnbBalance();
  const { recordAdoption: parentRecordAdoption } = useRecordAdoption();
  const [mode, setMode] = useState<"choose" | "chat" | "upload">("choose");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Hey there! Let's create your dream pet together. What kind of pet are you imagining?" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [petData, setPetData] = useState<{ name: string; species_name: string; personality: string; custom_traits: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload mode state
  const [uploadName, setUploadName] = useState("");
  const [uploadSpecies, setUploadSpecies] = useState("");
  const [uploadPersonality, setUploadPersonality] = useState("friendly");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg = { role: "user" as const, text: text.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/pets/adopt-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ messages: newMessages }),
      });
      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: "ai", text: data.reply }]);
      if (data.petReady && data.petData) {
        setPetData(data.petData);
      }
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: "ai", text: "Oops, something went wrong. Could you try again?" }]);
    }
    setChatLoading(false);
  };

  const [adoptError, setAdoptError] = useState<string | null>(null);

  const handleAdopt = async () => {
    if (!petData || creating) return;
    setCreating(true);
    setAdoptError(null);

    try {
      // Step 1: Switch to BSC
      if (isPETActivityEnabled()) {
        try { await switchToBsc(); } catch {
          setAdoptError("❌ BSC 네트워크로 전환해주세요");
          setCreating(false);
          return;
        }
      }

      // Step 2: On-chain recording FIRST (user pays gas)
      if (isPETActivityEnabled()) {
        const speciesName = petData.species_name || "Pet";
        await parentRecordAdoption(petData.name, speciesName);
      }

      // Step 3: Wallet signature
      const { message: signedMessage, signature } = await signAction(
        wagmiConfig,
        `Adopt pet: ${petData.name} (${petData.species_name || "Pet"})`,
      );

      // Step 4: Create pet in DB
      const res = await fetch("/api/pets/adopt-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ messages: chatMessages, action: "create", petData, signedMessage, signature }),
      });
      if (!res.ok) throw new Error("Failed to create pet");
      const pet = await res.json();

      // Step 5: Generate avatar
      try {
        const avatarRes = await api.pets.generateAvatar(0, petData.personality, petData.species_name, petData.custom_traits);
        if (avatarRes.avatar_url) {
          await api.pets.update(pet.id, { avatar_url: avatarRes.avatar_url });
          pet.avatar_url = avatarRes.avatar_url;
        }
      } catch (avatarErr: any) {
        console.error("Avatar generation failed:", avatarErr);
      }

      onCreated(pet);
      onClose();
    } catch (e: any) {
      console.error("[Adopt] Error:", e);
      const raw = (e?.shortMessage || e?.message || "").toLowerCase();
      const msg = raw.includes("insufficient") || raw.includes("fund")
        ? "BNB 잔액이 부족합니다. BSC 지갑에 BNB를 충전해주세요."
        : raw.includes("reject") || raw.includes("denied") || raw.includes("user refused")
        ? "트랜잭션이 거부되었습니다"
        : e.message || "입양에 실패했습니다";
      setAdoptError(`❌ ${msg}`);
    }
    setCreating(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setUploadPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUploadAdopt = async () => {
    if (!uploadName.trim() || !uploadFile || creating) return;
    setCreating(true);
    try {
      // Step 1: Switch to BSC
      if (isPETActivityEnabled()) {
        try { await switchToBsc(); } catch {}
      }

      // Step 2: On-chain recording
      if (isPETActivityEnabled()) {
        const speciesName = uploadSpecies.trim() || "Pet";
        await parentRecordAdoption(uploadName.trim(), speciesName);
      }

      // Request wallet signature before adoption
      const { message: signedMessage, signature } = await signAction(
        wagmiConfig,
        `Adopt pet: ${uploadName.trim()} (${uploadSpecies.trim() || "Pet"})`,
      );

      // Upload photo first
      const formData = new FormData();
      formData.append("file", uploadFile);
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { ...getAuthHeaders() },
        body: formData,
      });
      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || "Photo upload failed");
      }
      const { url: avatarUrl } = await uploadRes.json();

      // Create pet via adopt-chat
      const adoptPetData = {
        name: uploadName.trim(),
        species_name: uploadSpecies.trim() || "Pet",
        personality: uploadPersonality,
        custom_traits: "",
      };
      const res = await fetch("/api/pets/adopt-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ messages: [], action: "create", petData: adoptPetData, signedMessage, signature }),
      });
      if (!res.ok) throw new Error("Failed to create pet");
      const pet = await res.json();

      // Set uploaded photo as avatar
      await api.pets.update(pet.id, { avatar_url: avatarUrl });
      pet.avatar_url = avatarUrl;

      onCreated(pet);
      onClose();
    } catch (e: any) {
      setAdoptError("❌ " + (e.message || "입양에 실패했습니다"));
    }
    setCreating(false);
  };

  const PERS = [
    { id: "friendly", label: "Friendly", emoji: "🤗" },
    { id: "playful", label: "Playful", emoji: "🎉" },
    { id: "shy", label: "Shy", emoji: "🙈" },
    { id: "brave", label: "Brave", emoji: "🦁" },
    { id: "lazy", label: "Lazy", emoji: "😴" },
    { id: "curious", label: "Curious", emoji: "🔍" },
    { id: "mischievous", label: "Mischievous", emoji: "😈" },
    { id: "gentle", label: "Gentle", emoji: "🕊" },
    { id: "adventurous", label: "Adventurous", emoji: "🗺" },
    { id: "dramatic", label: "Dramatic", emoji: "🎭" },
    { id: "wise", label: "Wise", emoji: "🦉" },
    { id: "sassy", label: "Sassy", emoji: "💅" },
  ];

  // ── MODE: Choose ──
  if (mode === "choose") {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)",
      }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
          background: "white", borderRadius: 24, width: 420, maxWidth: "95vw",
          boxShadow: "0 24px 80px rgba(0,0,0,0.15)", animation: "slideIn 0.3s ease-out",
          padding: 32, textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🥚</div>
          <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 800, color: "#1a1a2e", margin: "0 0 6px" }}>
            Adopt a Pet
          </h3>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(26,26,46,0.5)", margin: "0 0 28px" }}>
            Choose how you'd like to create your companion
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => setMode("chat")} style={{
              padding: "18px 24px", borderRadius: 16,
              background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(139,92,246,0.03))",
              border: "1px solid rgba(139,92,246,0.2)", cursor: "pointer",
              textAlign: "left", transition: "all 0.2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28, width: 44, textAlign: "center" }}>🤖</div>
                <div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>
                    Create with AI
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "rgba(26,26,46,0.5)", marginTop: 2 }}>
                    Chat with AI to design your dream pet from scratch
                  </div>
                </div>
              </div>
            </button>

            <button onClick={() => setMode("upload")} style={{
              padding: "18px 24px", borderRadius: 16,
              background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.03))",
              border: "1px solid rgba(245,158,11,0.2)", cursor: "pointer",
              textAlign: "left", transition: "all 0.2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28, width: 44, textAlign: "center" }}>📸</div>
                <div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>
                    Upload My Pet's Photo
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "rgba(26,26,46,0.5)", marginTop: 2 }}>
                    Use a real photo of your pet as their avatar
                  </div>
                </div>
              </div>
            </button>
          </div>

          <button onClick={onClose} style={{
            marginTop: 20, background: "none", border: "none", cursor: "pointer",
            fontFamily: "mono", fontSize: 12, color: "rgba(26,26,46,0.35)",
          }}>Cancel</button>
        </div>
      </div>
    );
  }

  // ── MODE: Upload ──
  if (mode === "upload") {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)",
      }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
          background: "white", borderRadius: 24, width: 440, maxWidth: "95vw", maxHeight: "90vh",
          boxShadow: "0 24px 80px rgba(0,0,0,0.15)", animation: "slideIn 0.3s ease-out",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "18px 24px", borderBottom: "1px solid rgba(0,0,0,0.06)",
            background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.03))",
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          }}>
            <button onClick={() => setMode("choose")} style={{
              background: "rgba(0,0,0,0.05)", border: "none", borderRadius: 8,
              width: 32, height: 32, cursor: "pointer", fontSize: 14, color: "rgba(26,26,46,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>←</button>
            <div>
              <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
                📸 Upload Pet Photo
              </h3>
            </div>
          </div>

          {/* Form */}
          <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Photo Upload */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: uploadPreview ? "none" : "2px dashed rgba(245,158,11,0.3)",
                borderRadius: 16, padding: uploadPreview ? 16 : 32,
                cursor: "pointer", textAlign: "center",
                background: uploadPreview ? "transparent" : "rgba(245,158,11,0.03)",
                transition: "all 0.2s", position: "relative",
              }}
            >
              {uploadPreview ? (
                <img src={uploadPreview} alt="Preview" style={{
                  maxWidth: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 16,
                  display: "block", margin: "0 auto",
                }} />
              ) : (
                <>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>
                    Tap to upload your pet's photo
                  </div>
                  <div style={{ fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.4)", marginTop: 4 }}>
                    JPG, PNG up to 10MB
                  </div>
                </>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: "none" }} />
            </div>

            {/* Upload / pet validation error — shown right below the photo */}
            {adoptError && (
              <div style={{
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 12, padding: "10px 14px",
                color: "#dc2626", fontSize: 13, fontWeight: 600,
                fontFamily: "'Space Grotesk',sans-serif", textAlign: "center",
              }}>
                {adoptError}
              </div>
            )}

            {/* Name */}
            <div>
              <label style={{ fontFamily: "mono", fontSize: 10, fontWeight: 600, color: "rgba(26,26,46,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Pet Name *
              </label>
              <input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="What's your pet's name?"
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)",
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600,
                  outline: "none", marginTop: 6, boxSizing: "border-box",
                }}
              />
            </div>

            {/* Species */}
            <div>
              <label style={{ fontFamily: "mono", fontSize: 10, fontWeight: 600, color: "rgba(26,26,46,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Species
              </label>
              <input value={uploadSpecies} onChange={e => setUploadSpecies(e.target.value)} placeholder="e.g. Golden Retriever, Persian Cat, Dragon..."
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)",
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
                  outline: "none", marginTop: 6, boxSizing: "border-box",
                }}
              />
            </div>

            {/* Personality */}
            <div>
              <label style={{ fontFamily: "mono", fontSize: 10, fontWeight: 600, color: "rgba(26,26,46,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Personality
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {PERS.map(p => (
                  <button key={p.id} onClick={() => setUploadPersonality(p.id)} style={{
                    padding: "6px 12px", borderRadius: 20, fontSize: 12, fontFamily: "'Space Grotesk',sans-serif",
                    border: uploadPersonality === p.id ? "2px solid #f59e0b" : "1px solid rgba(0,0,0,0.08)",
                    background: uploadPersonality === p.id ? "rgba(245,158,11,0.1)" : "rgba(0,0,0,0.02)",
                    color: uploadPersonality === p.id ? "#b45309" : "rgba(26,26,46,0.6)",
                    fontWeight: uploadPersonality === p.id ? 700 : 400,
                    cursor: "pointer", transition: "all 0.15s",
                  }}>
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Adopt button */}
          <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
            <button
              onClick={handleUploadAdopt}
              disabled={!uploadName.trim() || !uploadFile || creating}
              style={{
                width: "100%", padding: "14px", borderRadius: 14, border: "none", cursor: "pointer",
                background: uploadName.trim() && uploadFile
                  ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(0,0,0,0.06)",
                color: uploadName.trim() && uploadFile ? "white" : "rgba(26,26,46,0.3)",
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
                boxShadow: uploadName.trim() && uploadFile ? "0 0 24px rgba(245,158,11,0.3)" : "none",
                transition: "all 0.2s",
              }}
            >
              {creating ? "Creating..." : "🐣 Adopt!"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── MODE: Chat ──
  const quickSuggestions = [
    "I want a brave dragon!",
    "A cute fluffy cat please!",
    "Something mysterious...",
    "Surprise me!",
  ];
  const showSuggestions = chatMessages.length <= 1 && !chatLoading;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white",
        borderRadius: 24, border: "1px solid rgba(0,0,0,0.06)",
        width: 480, maxWidth: "95vw", maxHeight: "85vh",
        boxShadow: "0 24px 80px rgba(0,0,0,0.15)",
        animation: "slideIn 0.3s ease-out",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 24px", borderBottom: "1px solid rgba(0,0,0,0.06)",
          background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(139,92,246,0.02))",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <button onClick={() => setMode("choose")} style={{
            background: "rgba(0,0,0,0.05)", border: "none", borderRadius: 8,
            width: 32, height: 32, cursor: "pointer", fontSize: 14, color: "rgba(26,26,46,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>←</button>
          <div>
            <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
              🤖 Create with AI
            </h3>
            <p style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.4)", margin: "2px 0 0" }}>
              Describe your dream pet — AI will bring it to life
            </p>
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px 20px",
          display: "flex", flexDirection: "column", gap: 10, minHeight: 0,
        }}>
          {chatMessages.map((msg, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}>
              <div style={{
                maxWidth: "80%", padding: "10px 14px",
                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: msg.role === "user"
                  ? "linear-gradient(135deg, #7c3aed, #6d28d9)"
                  : "rgba(0,0,0,0.04)",
                color: msg.role === "user" ? "white" : "#1a1a2e",
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, lineHeight: 1.5,
                border: msg.role === "user" ? "none" : "1px solid rgba(0,0,0,0.06)",
              }}>
                {msg.text}
              </div>
            </div>
          ))}

          {chatLoading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{
                padding: "10px 18px", borderRadius: "16px 16px 16px 4px",
                background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.06)",
              }}>
                <span style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.4)" }}>
                  <span style={{ display: "inline-block", animation: "pulse 1s infinite" }}>...</span>
                </span>
              </div>
            </div>
          )}

          {/* Pet Preview */}
          {petData && !creating && (
            <div style={{
              margin: "8px 0", padding: "18px 22px", borderRadius: 18,
              background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(245,158,11,0.06))",
              border: "2px solid rgba(139,92,246,0.2)",
              boxShadow: "0 0 40px rgba(139,92,246,0.1)",
              animation: "slideIn 0.3s ease-out",
            }}>
              <div style={{ fontFamily: "mono", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.15em", color: "#7c3aed", marginBottom: 10 }}>
                ✨ YOUR NEW COMPANION
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 800, color: "#1a1a2e", marginBottom: 4, letterSpacing: "-0.02em" }}>
                {petData.name}
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(26,26,46,0.5)", marginBottom: 10, fontWeight: 500 }}>
                {petData.species_name}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontFamily: "mono", background: "rgba(139,92,246,0.12)", color: "#7c3aed", fontWeight: 600 }}>
                  {petData.personality}
                </span>
              </div>
              {petData.custom_traits && (
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "rgba(26,26,46,0.5)", marginTop: 6, fontStyle: "italic" }}>
                  "{petData.custom_traits}"
                </div>
              )}
              <button onClick={handleAdopt} disabled={creating} style={{
                width: "100%", marginTop: 16, padding: "13px", borderRadius: 14, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                color: "white", fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
                boxShadow: "0 0 30px rgba(124,58,237,0.3)", transition: "all 0.2s",
              }}>
                {creating ? "Generating avatar..." : "🐣 Adopt!"}
              </button>
              {adoptError && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 8, textAlign: "center", fontWeight: 600 }}>{adoptError}</div>}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        {showSuggestions && (
          <div style={{ padding: "0 20px 8px", display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
            {quickSuggestions.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s)} style={{
                padding: "6px 12px", borderRadius: 20, border: "1px solid rgba(139,92,246,0.2)",
                background: "rgba(139,92,246,0.05)", cursor: "pointer",
                fontFamily: "mono", fontSize: 11, color: "#7c3aed",
                transition: "all 0.2s", whiteSpace: "nowrap",
              }}>{s}</button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: "12px 16px", borderTop: "1px solid rgba(0,0,0,0.06)",
          display: "flex", gap: 8, alignItems: "center", background: "rgba(0,0,0,0.01)", flexShrink: 0,
        }}>
          <input
            value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput); } }}
            placeholder="Describe your dream pet..." autoFocus disabled={chatLoading || creating}
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)",
              background: "white", fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
              outline: "none", color: "#1a1a2e",
            }}
          />
          <button onClick={() => sendMessage(chatInput)} disabled={!chatInput.trim() || chatLoading || creating}
            style={{
              width: 40, height: 40, borderRadius: 12, border: "none",
              background: chatInput.trim() && !chatLoading ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "rgba(0,0,0,0.05)",
              color: chatInput.trim() && !chatLoading ? "white" : "rgba(26,26,46,0.25)",
              cursor: chatInput.trim() && !chatLoading ? "pointer" : "default",
              fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s", flexShrink: 0,
            }}
          >➤</button>
        </div>
      </div>
    </div>
  );
}

const MOOD_PHRASES: Record<string, string[]> = {
  happy: ["Life is great!", "I love you!", "Yay!"],
  ecstatic: ["Life is great!", "I love you!", "Yay!"],
  sad: ["I'm lonely...", "Play with me?", "..."],
  starving: ["So hungry...", "Feed me!", "\uD83C\uDF56?"],
  hungry: ["So hungry...", "Feed me!", "\uD83C\uDF56?"],
  exhausted: ["*yawns*", "Sleepy...", "zzz..."],
  tired: ["*yawns*", "Sleepy...", "zzz..."],
  neutral: ["...", "Hmm", "*looks around*"],
  grumpy: ["Hmph!", "Leave me alone", "..."],
};

const MOOD_ANIMATIONS: Record<string, string> = {
  happy: "moodBounce 1.2s ease-in-out infinite",
  ecstatic: "moodBounce 1.2s ease-in-out infinite",
  sad: "moodSway 2s ease-in-out infinite",
  exhausted: "moodPulse 2.5s ease-in-out infinite",
  tired: "moodPulse 2.5s ease-in-out infinite",
  starving: "moodShake 0.6s ease-in-out infinite",
  hungry: "moodShake 0.6s ease-in-out infinite",
  grumpy: "moodVibrate 0.3s linear infinite",
  neutral: "none",
};

function PetAvatar({ pet, mood, size = 80 }: any) {
  const moodCfg = MOOD_CONFIG[mood] || MOOD_CONFIG.neutral;
  const hasAvatar = pet.avatar_url;
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [bubbleVisible, setBubbleVisible] = useState(false);

  useEffect(() => {
    const phrases = MOOD_PHRASES[mood] || MOOD_PHRASES.neutral;
    let idx = 0;
    let showTimeout: ReturnType<typeof setTimeout>;
    let hideTimeout: ReturnType<typeof setTimeout>;

    const cycle = () => {
      setBubbleText(phrases[idx % phrases.length]);
      setBubbleVisible(true);
      idx++;
      hideTimeout = setTimeout(() => {
        setBubbleVisible(false);
      }, 3000);
      showTimeout = setTimeout(cycle, 8000);
    };

    showTimeout = setTimeout(cycle, 2000);
    return () => { clearTimeout(showTimeout); clearTimeout(hideTimeout); };
  }, [mood]);

  const moodAnim = MOOD_ANIMATIONS[mood] || "none";

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <style>{`
        @keyframes moodBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes moodSway {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        @keyframes moodPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.9); opacity: 0.7; }
        }
        @keyframes moodShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        @keyframes moodVibrate {
          0% { transform: translateX(0); }
          25% { transform: translateX(-1px); }
          50% { transform: translateX(1px); }
          75% { transform: translateX(-1px); }
          100% { transform: translateX(0); }
        }
        @keyframes bubbleFade {
          0% { opacity: 0; transform: translateY(4px) scale(0.9); }
          15% { opacity: 1; transform: translateY(0) scale(1); }
          85% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-2px) scale(0.95); }
        }
      `}</style>
      {/* Mood speech bubble */}
      {bubbleVisible && bubbleText && (
        <div style={{
          position: "absolute", top: -28, left: "50%", transform: "translateX(-50%)",
          background: "white", borderRadius: 8, padding: "3px 8px",
          fontFamily: "monospace", fontSize: 9, color: "rgba(26,26,46,0.7)",
          boxShadow: "0 1px 6px rgba(0,0,0,0.1)", border: "1px solid rgba(0,0,0,0.06)",
          whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none",
          animation: "bubbleFade 3s ease-in-out forwards",
        }}>
          {bubbleText}
        </div>
      )}
      <div style={{
        width: size, height: size, borderRadius: size * 0.3,
        background: "rgba(0,0,0,0.02)",
        border: `2px solid ${moodCfg.color}30`,
        overflow: "hidden",
        boxShadow: `0 2px 12px rgba(0,0,0,0.08), 0 0 ${size * 0.4}px ${moodCfg.color}15`,
        transition: "all 0.5s ease",
        animation: "petFloat 6s ease-in-out infinite",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {hasAvatar ? (
          <img src={pet.avatar_url} alt={pet.name} style={{
            width: "100%", height: "100%", objectFit: "cover",
          }} />
        ) : (
          <span style={{ fontSize: size * 0.5 }}>{PET_EMOJIS[pet.species] || "🐾"}</span>
        )}
      </div>
      <div style={{
        position: "absolute", bottom: -4, right: -4,
        fontSize: size * 0.25, background: "white",
        borderRadius: "50%", width: size * 0.35, height: size * 0.35,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${moodCfg.color}30`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        animation: moodAnim,
      }}>
        {moodCfg.emoji}
      </div>
    </div>
  );
}

function PetThumb({ pet, size = 28 }: { pet: any; size?: number }) {
  if (pet.avatar_url) {
    return <img src={pet.avatar_url} alt={pet.name} style={{ width: size, height: size, borderRadius: size * 0.3, objectFit: "cover" }} />;
  }
  return (
    <span style={{
      width: size, height: size, borderRadius: size * 0.3,
      background: "rgba(251,191,36,0.1)", display: "inline-flex",
      alignItems: "center", justifyContent: "center", fontSize: size * 0.6,
    }}>
      {PET_EMOJIS[pet.species] || "🐾"}
    </span>
  );
}

export default function PetProfile() {
  const [pets, setPets] = useState<any[]>([]);
  const [activePet, setActivePet] = useState<any>(null);
  const [petStatus, setPetStatus] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<any>(null);
  const [chainToast, setChainToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const showError = (msg: string) => { setErrorToast(msg); setTimeout(() => setErrorToast(null), 4000); };
  const { recordAdoption: parentRecordAdoption } = useRecordAdoption();
  const [interacting, setInteracting] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [responseAnim, setResponseAnim] = useState(false);
  const [evoStatus, setEvoStatus] = useState<any>(null);
  const [evolving, setEvolving] = useState(false);
  const [evoResult, setEvoResult] = useState<any>(null);
  const [petSlots, setPetSlots] = useState(1);
  const [slotPrices, setSlotPrices] = useState<number[]>([0, 50, 100, 200, 500]);
  const [unlockingSlot, setUnlockingSlot] = useState(false);
  const [showRelease, setShowRelease] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: string; text: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPets();
    loadBalance();
  }, []);

  const loadBalance = async () => {
    try {
      const data = await api.credits.balance();
      setBalance(data.balance ?? data.credits ?? 0);
    } catch { setBalance(null); }
  };

  const loadPets = async () => {
    try {
      const data = await api.pets.list();
      const list = data.pets || data;
      setPets(list);
      if (data.pet_slots) setPetSlots(data.pet_slots);
      if (data.slot_prices) setSlotPrices(data.slot_prices);
      if (list.length > 0 && !activePet) {
        setActivePet(list[0]);
        loadPetStatus(list[0].id);
        loadEvoStatus(list[0].id);
      }
    } catch (e) {
      setPets([]);
    }
    setLoading(false);
  };

  const handleUnlockSlot = async () => {
    setUnlockingSlot(true);
    try {
      await api.pets.unlockSlot();
      await loadPets();
      await loadBalance();
    } catch (e: any) {
      showError(e.message);
    }
    setUnlockingSlot(false);
  };

  const handleRelease = async () => {
    if (!activePet || releasing) return;
    setReleasing(true);
    try {
      await api.pets.release(activePet.id);
      setActivePet(null);
      setPetStatus(null);
      setShowRelease(false);
      await loadPets();
    } catch (e: any) {
      showError(e.message);
    }
    setReleasing(false);
  };

  const loadPetStatus = async (petId: number) => {
    try {
      const status = await api.pets.get(petId);
      setPetStatus(status);
    } catch (e) {
      // status fetch failed, use activePet data as fallback
    }
  };

  const loadEvoStatus = async (petId: number) => {
    try {
      const evo = await api.evolution.status(petId);
      setEvoStatus(evo);
    } catch (e) {
      setEvoStatus(null);
    }
  };

  const handleEvolve = async () => {
    if (!activePet || evolving) return;
    setEvolving(true);
    setEvoResult(null);
    try {
      const result = await api.evolution.evolve(activePet.id);
      setEvoResult(result);
      await loadPetStatus(activePet.id);
      await loadEvoStatus(activePet.id);
      await loadPets();
      await loadBalance();
    } catch (e: any) {
      alert(e.message || "Evolution failed");
    }
    setEvolving(false);
  };

  const handleInteract = async (type: string) => {
    if (!activePet || interacting) return;
    setInteracting(type);
    setResponseAnim(false);
    try {
      const result = await api.pets.interact(activePet.id, type);
      // Map API response format to UI format
      setLastResponse({
        response_text: result.interaction?.response || result.response_text || "...",
        stat_changes: result.interaction?.effects || result.stat_changes || {},
        memory_created: result.interaction?.leveled_up ? `${activePet.name} leveled up!` : null,
      });
      setResponseAnim(true);
      await loadPetStatus(activePet.id);
      await loadEvoStatus(activePet.id);
      await loadPets();
    } catch (e: any) {
      setLastResponse({ response_text: e.message || "Interaction failed", stat_changes: {} });
      setResponseAnim(true);
    }
    setTimeout(() => setInteracting(null), 300);
  };

  const handleChat = async () => {
    if (!activePet || !chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const res = await api.pets.chat(activePet.id, msg);
      setChatMessages(prev => [...prev, { role: "pet", text: res.reply }]);
      await loadPetStatus(activePet.id);
      await loadPets();
    } catch {
      setChatMessages(prev => [...prev, { role: "pet", text: `*${activePet.name} tilts head confused*` }]);
    }
    setChatLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const selectPet = (pet: any) => {
    setActivePet(pet);
    setLastResponse(null);
    setEvoResult(null);
    loadPetStatus(pet.id);
    loadEvoStatus(pet.id);
  };

  if (loading) {
    return (
      <div style={{ padding: "140px 40px", textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, border: "2px solid rgba(245,158,11,0.2)",
          borderTopColor: "#f59e0b", borderRadius: "50%",
          animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ fontFamily: "mono", fontSize: 12, color: "rgba(26,26,46,0.35)" }}>Loading your pets...</div>
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div style={{ padding: "120px 40px", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
        <style>{`
          @keyframes eggBounce {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            25% { transform: translateY(-8px) rotate(-5deg); }
            50% { transform: translateY(0) rotate(0deg); }
            75% { transform: translateY(-4px) rotate(5deg); }
          }
          @keyframes petFloat {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            25% { transform: translateY(-12px) rotate(3deg); }
            75% { transform: translateY(8px) rotate(-3deg); }
          }
        `}</style>
        <div style={{ fontSize: 80, marginBottom: 20, animation: "eggBounce 2s ease-in-out infinite" }}>🥚</div>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 30, color: "#1a1a2e", marginBottom: 10 }}>
          No Pets Yet
        </h2>
        <p style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.5)", marginBottom: 8, lineHeight: 1.8 }}>
          Adopt your first AI pet! They&apos;ll grow, learn your patterns, and develop a unique personality over time.
        </p>
        <div style={{ fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.35)", marginBottom: 32, lineHeight: 1.7 }}>
          Feed them, play with them, talk to them — every interaction matters.
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none", borderRadius: 14,
          padding: "15px 40px", fontFamily: "mono", fontSize: 14, fontWeight: 600, color: "white", cursor: "pointer",
          boxShadow: "0 0 40px rgba(245,158,11,0.3), 0 8px 24px rgba(0,0,0,0.1)",
          transition: "transform 0.2s",
        }}>
          Adopt Your First Pet
        </button>
        {showOnboarding && (
          <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.7)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
            <EnhancedOnboarding
              pet={showOnboarding}
              onComplete={() => setShowOnboarding(null)}
              onSkip={() => setShowOnboarding(null)}
            />
          </div>
        )}
        {showCreate && <CreatePetModal onClose={() => setShowCreate(false)} onCreated={async (pet: any) => {
          setPets([pet]); setActivePet(pet); loadPetStatus(pet.id);
          setShowOnboarding(pet); // Show enhanced onboarding after adoption
          if (isPETActivityEnabled()) {
            try {
              setChainToast("⛓️ 온체인 기록 중...");
              const speciesName = pet.personality_modifiers?.species_name || PET_SPECIES[pet.species] || "Pet";
              await parentRecordAdoption(pet.name, speciesName);
              setChainToast("✅ 온체인 기록 완료!");
              setTimeout(() => setChainToast(null), 3000);
            } catch (e: any) {
              console.error("[PETActivity] Full error:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
              const raw = (e?.shortMessage || e?.message || "").toLowerCase();
              const msg = raw.includes("insufficient") || raw.includes("bnb") || raw.includes("fund")
                ? "BNB 잔액이 부족합니다"
                : raw.includes("reject") || raw.includes("denied") || raw.includes("user refused")
                ? "트랜잭션이 거부되었습니다"
                : raw.includes("chain") || raw.includes("network")
                ? "BSC 네트워크로 전환해주세요"
                : `온체인 기록 실패: ${e?.shortMessage || e?.message || "알 수 없는 오류"}`;
              setChainToast(`❌ ${msg}`);
              setTimeout(() => setChainToast(null), 6000);
            }
          }
        }} />}
      </div>
    );
  }

  const pet = petStatus || activePet;
  const mood = pet.current_mood || "neutral";
  const moodCfg = MOOD_CONFIG[mood] || MOOD_CONFIG.neutral;
  const expNeeded = pet.level * 100;

  return (
    <div style={{ padding: "16px", maxWidth: 960, margin: "0 auto", paddingTop: 80 }}>
      {/* On-chain recording overlay */}
      {chainToast && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0,0,0,0.5)",
        }}>
          <div style={{
            background: "white",
            borderRadius: 20,
            padding: "40px 60px",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#x26d3;&#xfe0f;</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a" }}>{chainToast}</div>
            <div style={{ fontSize: 14, color: "#888", marginTop: 8 }}>{chainToast?.startsWith("❌") ? "지갑을 닫으면 자동으로 사라집니다" : "지갑에서 확인해주세요"}</div>
          </div>
        </div>
      )}
      {errorToast && (
        <div style={{
          position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, background: "#1a1a2e", color: "white",
          padding: "14px 28px", borderRadius: 14,
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600,
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          animation: "slideDown 0.3s ease",
        }}>
          {errorToast}
        </div>
      )}
      <style>{`
        @keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        @keyframes petFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-8px) rotate(2deg); }
          75% { transform: translateY(6px) rotate(-2deg); }
        }
        @keyframes responseSlide {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes statPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Pet selector bar */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 24, alignItems: "center",
        padding: "4px", background: "rgba(0,0,0,0.02)", borderRadius: 14,
        overflowX: "auto", flexWrap: "nowrap",
        border: "1px solid rgba(0,0,0,0.06)",
      }}>
        {pets.map((p: any) => (
          <button key={p.id} onClick={() => selectPet(p)} style={{
            background: activePet?.id === p.id ? "rgba(251,191,36,0.1)" : "transparent",
            border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s",
          }}>
            <PetThumb pet={p} />
            <div style={{ textAlign: "left" }}>
              <div style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600,
                color: activePet?.id === p.id ? "#b45309" : "rgba(26,26,46,0.5)",
              }}>
                {p.name}
              </div>
              <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)" }}>
                Lv.{p.level} {getSpeciesName(p)}
              </div>
            </div>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {pets.length < petSlots ? (
          <button onClick={() => setShowCreate(true)} style={{
            background: "rgba(0,0,0,0.02)", border: "1px dashed rgba(0,0,0,0.12)",
            borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontFamily: "mono", fontSize: 11,
            color: "rgba(26,26,46,0.35)", transition: "all 0.2s",
          }}>+ Adopt New</button>
        ) : petSlots < 5 ? (
          <button onClick={handleUnlockSlot} disabled={unlockingSlot} style={{
            background: "rgba(251,191,36,0.08)", border: "1px dashed rgba(251,191,36,0.3)",
            borderRadius: 10, padding: "10px 18px", cursor: unlockingSlot ? "wait" : "pointer",
            fontFamily: "mono", fontSize: 11, color: "#b45309", transition: "all 0.2s",
          }}>
            🔓 Unlock Slot ({slotPrices[petSlots] || 500} $PET)
          </button>
        ) : null}
        <span style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.3)" }}>
          {pets.length}/{petSlots} slots
        </span>
        {balance !== null && (<>
          <div style={{
            fontFamily: "mono", fontSize: 11, padding: "6px 14px", borderRadius: 10,
            background: "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.04))",
            border: "1px solid rgba(251,191,36,0.2)",
            color: "#b45309", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
          }} onClick={() => { const el = document.querySelector(".pricing-root"); if (el) el.scrollIntoView({ behavior: "smooth" }); }}>
            <span style={{ fontSize: 13 }}>🪙</span> {balance.toLocaleString()} $PET
          </div>
        </>)}
      </div>

      <div className="desktop-grid" style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20 }}>
        {/* Left: Pet card */}
        <div style={{
          background: "rgba(255,255,255,0.8)",
          borderRadius: 20, border: "1px solid rgba(0,0,0,0.06)", padding: 28,
          position: "relative", overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{
            position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
            width: 200, height: 200, borderRadius: "50%",
            background: moodCfg.color, opacity: 0.06, filter: "blur(60px)",
            transition: "background 0.5s",
          }} />

          <div style={{ textAlign: "center", marginBottom: 24, position: "relative" }}>
            <PetAvatar pet={pet} mood={mood} size={100} />
            <h2 style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, color: "#1a1a2e",
              margin: "16px 0 8px", fontWeight: 800, letterSpacing: "-0.02em",
            }}>
              {pet.name}
            </h2>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{
                fontFamily: "mono", fontSize: 10, padding: "3px 10px", borderRadius: 10,
                background: "rgba(251,191,36,0.1)", color: "#b45309",
                border: "1px solid rgba(251,191,36,0.2)",
              }}>
                Lv.{pet.level}
              </span>
              <span style={{
                fontFamily: "mono", fontSize: 10, padding: "3px 10px", borderRadius: 10,
                background: "rgba(139,92,246,0.08)", color: "#7c3aed",
                border: "1px solid rgba(139,92,246,0.15)",
              }}>
                {pet.personality_type}
              </span>
              <span style={{
                fontFamily: "mono", fontSize: 10, padding: "3px 10px", borderRadius: 10,
                background: `${moodCfg.color}12`, color: moodCfg.color,
                border: `1px solid ${moodCfg.color}25`,
              }}>
                {moodCfg.emoji} {moodCfg.label}
              </span>
            </div>
          </div>

          {/* Appearance description */}
          {pet.avatar_url && (
            <div style={{
              marginBottom: 12, padding: "8px 12px", borderRadius: 10,
              background: pet.appearance_desc ? "rgba(74,222,128,0.06)" : "rgba(245,158,11,0.08)",
              border: `1px solid ${pet.appearance_desc ? "rgba(74,222,128,0.15)" : "rgba(245,158,11,0.2)"}`,
            }}>
              {editingDesc ? (
                <div>
                  <input
                    value={descInput}
                    onChange={(e) => setDescInput(e.target.value)}
                    placeholder="e.g. small black chihuahua with big ears"
                    style={{
                      width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)",
                      fontFamily: "mono", fontSize: 10, outline: "none", boxSizing: "border-box", marginBottom: 6,
                    }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={async () => {
                      try {
                        await api.pets.updateDesc(pet.id, descInput);
                        await loadPetStatus(pet.id);
                        await loadPets();
                        setEditingDesc(false);
                      } catch (e: any) { alert(e.message); }
                    }} style={{
                      padding: "4px 12px", borderRadius: 6, border: "none",
                      background: "#f59e0b", color: "white", fontFamily: "mono", fontSize: 10, cursor: "pointer",
                    }}>Save</button>
                    <button onClick={() => setEditingDesc(false)} style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)",
                      background: "white", fontFamily: "mono", fontSize: 10, cursor: "pointer",
                    }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => { setDescInput(pet.appearance_desc || ""); setEditingDesc(true); }}
                  style={{ cursor: "pointer" }}>
                  <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.4)", marginBottom: 2 }}>
                    {pet.appearance_desc ? "APPEARANCE" : "⚠️ ADD APPEARANCE (required for AI generation)"}
                  </div>
                  <div style={{ fontFamily: "mono", fontSize: 10, color: pet.appearance_desc ? "rgba(26,26,46,0.6)" : "#b45309" }}>
                    {pet.appearance_desc || "Tap to describe your pet's look"}
                  </div>
                </div>
              )}
            </div>
          )}

          <AnimatedStatBar label="Happiness" value={pet.happiness} color="#f472b6" icon="💖" />
          <AnimatedStatBar label="Energy" value={pet.energy} color="#60a5fa" icon="⚡" />
          <AnimatedStatBar label="Hunger" value={pet.hunger} color="#fbbf24" icon="🍖" />
          <AnimatedStatBar label="Bond" value={pet.bond_level} color="#c084fc" icon="🤝" />
          <AnimatedStatBar label="EXP" value={pet.experience} color="#4ade80" max={expNeeded} icon="✨" />

          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 10,
            background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)",
            display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.35)" }}>
              Total Interactions
            </span>
            <span style={{ fontFamily: "mono", fontSize: 10, color: "#b45309", fontWeight: 600 }}>
              {pet.total_interactions}
            </span>
          </div>

          {!showRelease ? (
            <button onClick={() => setShowRelease(true)} style={{
              marginTop: 10, width: "100%", padding: "8px", borderRadius: 8,
              background: "transparent", border: "1px solid rgba(220,38,38,0.1)",
              fontFamily: "mono", fontSize: 10, color: "rgba(220,38,38,0.4)",
              cursor: "pointer", transition: "all 0.2s",
            }}>
              Release {pet.name}
            </button>
          ) : (
            <div style={{
              marginTop: 10, padding: 12, borderRadius: 10,
              background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.15)",
            }}>
              <div style={{ fontFamily: "mono", fontSize: 11, color: "#dc2626", marginBottom: 8 }}>
                Release {pet.name}? This cannot be undone.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleRelease} disabled={releasing} style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: "none",
                  background: "#dc2626", color: "white", fontFamily: "mono",
                  fontSize: 11, fontWeight: 600, cursor: releasing ? "wait" : "pointer",
                }}>
                  {releasing ? "..." : "Confirm"}
                </button>
                <button onClick={() => setShowRelease(false)} style={{
                  flex: 1, padding: "8px", borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.1)", background: "white",
                  fontFamily: "mono", fontSize: 11, cursor: "pointer",
                }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Interactions */}
          <div style={{
            background: "rgba(255,255,255,0.8)", borderRadius: 18,
            border: "1px solid rgba(0,0,0,0.06)", padding: 22,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}>
            <div style={{
              fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.5)", marginBottom: 14,
              textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600,
            }}>
              Interact with <span style={{ fontWeight: 700, color: "#1a1a2e" }}>{pet.name}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {INTERACTIONS.map(i => (
                <button key={i.type} onClick={() => i.type === "talk" ? setShowChat(true) : handleInteract(i.type)}
                  disabled={!!interacting}
                  style={{
                    background: interacting === i.type ? `${i.color}15` : "rgba(0,0,0,0.02)",
                    border: interacting === i.type ? `1px solid ${i.color}40` : "1px solid rgba(0,0,0,0.06)",
                    borderRadius: 12, padding: "14px 8px", cursor: interacting ? "wait" : "pointer",
                    transition: "all 0.2s",
                    opacity: interacting && interacting !== i.type ? 0.4 : 1,
                    transform: interacting === i.type ? "scale(0.95)" : "scale(1)",
                    boxShadow: interacting === i.type ? `0 0 16px ${i.color}25` : "none",
                  }}>
                  <div style={{
                    fontSize: 26, marginBottom: 4,
                    animation: interacting === i.type ? "statPop 0.3s ease" : "none",
                  }}>{i.icon}</div>
                  <div style={{ fontFamily: "mono", fontSize: 11, color: i.color, fontWeight: 600 }}>{i.label}</div>
                  <div style={{ fontFamily: "mono", fontSize: 8, color: "rgba(26,26,46,0.4)", marginTop: 2 }}>{i.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Response */}
          {lastResponse && (
            <div style={{
              background: "linear-gradient(135deg, rgba(74,222,128,0.06), rgba(74,222,128,0.03))",
              borderRadius: 16, border: "1px solid rgba(74,222,128,0.15)", padding: 18,
              animation: responseAnim ? "responseSlide 0.4s ease-out" : "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(251,191,36,0.1)", fontSize: 20,
                  animation: "petFloat 3s ease-in-out infinite",
                }}>
                  {pet.avatar_url ? (
                    <img src={pet.avatar_url} alt={pet.name} style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} />
                  ) : (
                    PET_EMOJIS[pet.species] || "🐾"
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(26,26,46,0.7)",
                    lineHeight: 1.6, margin: "0 0 10px",
                  }}>
                    &quot;{lastResponse.response_text}&quot;
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.entries(lastResponse.stat_changes || {}).filter(([, v]: any) => v !== 0).map(([k, v]: any) => (
                      <span key={k} style={{
                        fontFamily: "mono", fontSize: 10, padding: "3px 8px", borderRadius: 8,
                        background: v > 0 ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                        color: v > 0 ? "#16a34a" : "#dc2626",
                        border: v > 0 ? "1px solid rgba(74,222,128,0.2)" : "1px solid rgba(248,113,113,0.2)",
                        animation: "statPop 0.4s ease",
                      }}>
                        {k} {v > 0 ? "+" : ""}{v}
                      </span>
                    ))}
                  </div>
                  {lastResponse.memory_created && (
                    <div style={{
                      marginTop: 8, fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.35)",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <span style={{ fontSize: 10 }}>💭</span>
                      {lastResponse.memory_created}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Evolution */}
          {evoStatus && (
            <div style={{
              background: "rgba(255,255,255,0.8)", borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.06)", padding: 22,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{
                fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.5)", marginBottom: 14,
                textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600,
              }}>
                Evolution
              </div>

              {/* Stage Progress */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16 }}>
                {evoStatus.all_stages?.map((s: any, i: number) => {
                  const isCurrent = s.stage === evoStatus.current_stage?.stage;
                  const isPast = s.stage < evoStatus.current_stage?.stage;
                  const isFuture = s.stage > evoStatus.current_stage?.stage;
                  return (
                    <div key={s.stage} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center", flex: 1,
                        opacity: isFuture ? 0.35 : 1,
                      }}>
                        <div style={{
                          width: isCurrent ? 40 : 32, height: isCurrent ? 40 : 32,
                          borderRadius: "50%",
                          background: isCurrent
                            ? "linear-gradient(135deg, #fbbf24, #f59e0b)"
                            : isPast
                              ? "linear-gradient(135deg, #4ade80, #22c55e)"
                              : "rgba(0,0,0,0.04)",
                          border: isCurrent ? "2px solid #f59e0b" : isPast ? "2px solid #22c55e" : "2px solid rgba(0,0,0,0.08)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: isCurrent ? 18 : 14,
                          boxShadow: isCurrent ? "0 0 20px rgba(251,191,36,0.4)" : "none",
                          transition: "all 0.3s",
                        }}>
                          {isPast ? "✓" : s.icon}
                        </div>
                        <div style={{
                          fontFamily: "mono", fontSize: 8, marginTop: 4,
                          color: isCurrent ? "#b45309" : isPast ? "#16a34a" : "rgba(26,26,46,0.3)",
                          fontWeight: isCurrent ? 700 : 400,
                        }}>
                          {s.name}
                        </div>
                        <div style={{
                          fontFamily: "mono", fontSize: 7,
                          color: "rgba(26,26,46,0.25)",
                        }}>
                          Lv.{s.minLevel}
                        </div>
                      </div>
                      {i < evoStatus.all_stages.length - 1 && (
                        <div style={{
                          height: 2, flex: 1, minWidth: 8,
                          background: isPast ? "#22c55e" : "rgba(0,0,0,0.06)",
                          borderRadius: 1, marginTop: -14,
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Current Stage Info */}
              <div style={{
                padding: "12px 16px", borderRadius: 12,
                background: "linear-gradient(135deg, rgba(251,191,36,0.06), rgba(245,158,11,0.03))",
                border: "1px solid rgba(251,191,36,0.15)", marginBottom: 14,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>
                      {evoStatus.current_stage?.icon} {evoStatus.current_stage?.name} Stage
                    </div>
                    <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.4)", marginTop: 2 }}>
                      Level {evoStatus.level}
                      {evoStatus.next_stage && ` · Need Lv.${evoStatus.next_stage.minLevel} for ${evoStatus.next_stage.name}`}
                      {!evoStatus.next_stage && " · Max Evolution Reached!"}
                    </div>
                  </div>
                  {evoStatus.next_stage && (
                    <div style={{
                      fontFamily: "mono", fontSize: 10, padding: "4px 10px", borderRadius: 8,
                      background: evoStatus.can_evolve ? "rgba(74,222,128,0.1)" : "rgba(0,0,0,0.04)",
                      color: evoStatus.can_evolve ? "#16a34a" : "rgba(26,26,46,0.35)",
                      border: evoStatus.can_evolve ? "1px solid rgba(74,222,128,0.2)" : "1px solid rgba(0,0,0,0.06)",
                    }}>
                      {evoStatus.can_evolve ? "Ready!" : `${evoStatus.level}/${evoStatus.next_stage.minLevel}`}
                    </div>
                  )}
                </div>

                {/* Level progress bar to next evolution */}
                {evoStatus.next_stage && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        background: evoStatus.can_evolve
                          ? "linear-gradient(90deg, #4ade80, #22c55e)"
                          : "linear-gradient(90deg, #fbbf24, #f59e0b)",
                        width: `${Math.min(100, (evoStatus.level / evoStatus.next_stage.minLevel) * 100)}%`,
                        transition: "width 0.8s ease",
                      }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Evolve Button */}
              {evoStatus.next_stage && (
                <button onClick={handleEvolve} disabled={!evoStatus.can_evolve || evolving} style={{
                  width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: evoStatus.can_evolve ? "pointer" : "not-allowed",
                  background: evoStatus.can_evolve
                    ? "linear-gradient(135deg, #f59e0b, #d97706)"
                    : "rgba(0,0,0,0.04)",
                  color: evoStatus.can_evolve ? "white" : "rgba(26,26,46,0.25)",
                  fontFamily: "mono", fontSize: 13, fontWeight: 600,
                  boxShadow: evoStatus.can_evolve ? "0 0 24px rgba(245,158,11,0.25)" : "none",
                  transition: "all 0.2s",
                  opacity: evolving ? 0.7 : 1,
                }}>
                  {evolving ? "Evolving..." : evoStatus.can_evolve
                    ? `Evolve to ${evoStatus.next_stage.icon} ${evoStatus.next_stage.name}`
                    : `Reach Lv.${evoStatus.next_stage.minLevel} to Evolve`}
                </button>
              )}

              {/* Evolution Result */}
              {evoResult && (
                <div style={{
                  marginTop: 12, padding: "14px 16px", borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.04))",
                  border: "1px solid rgba(251,191,36,0.2)",
                  animation: "responseSlide 0.4s ease-out",
                }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600, color: "#b45309", marginBottom: 6 }}>
                    {evoResult.new_stage?.icon} Evolved to {evoResult.new_stage?.name}!
                  </div>
                  {evoResult.skills_unlocked?.length > 0 && (
                    <div style={{ fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.5)", marginBottom: 4 }}>
                      New skills: {evoResult.skills_unlocked.join(", ")}
                    </div>
                  )}
                  <div style={{ fontFamily: "mono", fontSize: 10, color: "#16a34a" }}>
                    +{evoResult.credits_earned} credits earned!
                  </div>
                </div>
              )}

              {/* Skills */}
              {evoStatus.skills?.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{
                    fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.4)", marginBottom: 8,
                    textTransform: "uppercase", letterSpacing: "0.1em",
                  }}>
                    Unlocked Skills
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {evoStatus.skills.map((s: any) => (
                      <span key={s.skill_key} style={{
                        fontFamily: "mono", fontSize: 11, padding: "5px 12px", borderRadius: 10,
                        background: "rgba(139,92,246,0.08)", color: "#7c3aed",
                        border: "1px solid rgba(139,92,246,0.15)",
                        fontWeight: 500,
                      }}>
                        {s.skill_key}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Memories Timeline */}
          {petStatus?.recent_memories?.length > 0 && (
            <div style={{
              background: "rgba(255,255,255,0.8)", borderRadius: 16,
              border: "1px solid rgba(0,0,0,0.06)", padding: 20, flex: 1,
              overflow: "auto", maxHeight: 280,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{
                fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.5)", marginBottom: 14,
                textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600,
              }}>
                Memory Timeline
              </div>
              <div style={{ position: "relative", paddingLeft: 20 }}>
                <div style={{
                  position: "absolute", left: 5, top: 4, bottom: 4, width: 1,
                  background: "rgba(0,0,0,0.08)",
                }} />
                {petStatus.recent_memories.slice(0, 8).map((m: any, i: number) => (
                  <div key={m.id} style={{
                    position: "relative", paddingBottom: 14, paddingLeft: 8,
                  }}>
                    <div style={{
                      position: "absolute", left: -18, top: 4,
                      width: 8, height: 8, borderRadius: "50%",
                      background: m.memory_type === "milestone" ? "#fbbf24"
                        : m.memory_type === "generation" ? "#4ade80"
                        : "#8b5cf6",
                      boxShadow: `0 0 6px ${m.memory_type === "milestone" ? "#fbbf2440" : m.memory_type === "generation" ? "#4ade8040" : "#8b5cf640"}`,
                    }} />
                    <div style={{
                      fontFamily: "'Space Grotesk',sans-serif", fontSize: 12,
                      color: "rgba(26,26,46,0.65)", lineHeight: 1.5,
                    }}>
                      {m.content}
                    </div>
                    <div style={{
                      fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.3)", marginTop: 3,
                      display: "flex", gap: 8,
                    }}>
                      <span>{m.emotion}</span>
                      <span>importance: {m.importance}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreate && <CreatePetModal onClose={() => setShowCreate(false)} onCreated={async (pet: any) => {
          loadPets();
          if (isPETActivityEnabled() && pet?.name) {
            try {
              setChainToast("⛓️ 온체인 기록 중...");
              const speciesName = pet.personality_modifiers?.species_name || PET_SPECIES[pet.species] || "Pet";
              await parentRecordAdoption(pet.name, speciesName);
              setChainToast("✅ 온체인 기록 완료!");
              setTimeout(() => setChainToast(null), 3000);
            } catch (e: any) {
              console.error("[PETActivity] Full error:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
              const raw = (e?.shortMessage || e?.message || "").toLowerCase();
              const msg = raw.includes("insufficient") || raw.includes("bnb") || raw.includes("fund")
                ? "BNB 잔액이 부족합니다"
                : raw.includes("reject") || raw.includes("denied") || raw.includes("user refused")
                ? "트랜잭션이 거부되었습니다"
                : raw.includes("chain") || raw.includes("network")
                ? "BSC 네트워크로 전환해주세요"
                : `온체인 기록 실패: ${e?.shortMessage || e?.message || "알 수 없는 오류"}`;
              setChainToast(`❌ ${msg}`);
              setTimeout(() => setChainToast(null), 6000);
            }
          }
        }} />}

      {/* Chat Modal */}
      {showChat && activePet && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(8px)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={() => setShowChat(false)}>
          <div style={{
            background: "#faf7f2", borderRadius: 24, width: 420, maxWidth: "95vw",
            maxHeight: "80vh", display: "flex", flexDirection: "column",
            boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden",
            animation: "slideIn 0.3s ease-out",
          }} onClick={e => e.stopPropagation()}>
            {/* Chat Header */}
            <div style={{
              padding: "16px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", gap: 12,
              background: "linear-gradient(135deg, rgba(251,191,36,0.06), rgba(245,158,11,0.03))",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, overflow: "hidden",
                border: "2px solid rgba(251,191,36,0.2)", flexShrink: 0,
              }}>
                {pet.avatar_url ? (
                  <img src={pet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(251,191,36,0.1)", fontSize: 20 }}>
                    {PET_EMOJIS[pet.species] || "🐾"}
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
                  Chat with {pet.name}
                </div>
                <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.4)" }}>
                  {pet.personality_type} · {MOOD_CONFIG[pet.current_mood || "neutral"]?.emoji} {MOOD_CONFIG[pet.current_mood || "neutral"]?.label}
                </div>
              </div>
              <button onClick={() => setShowChat(false)} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 18, color: "rgba(26,26,46,0.3)", padding: 4,
              }}>✕</button>
            </div>

            {/* Chat Messages */}
            <div style={{
              flex: 1, overflowY: "auto", padding: "16px 20px",
              display: "flex", flexDirection: "column", gap: 12,
              minHeight: 300,
            }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>
                    {pet.avatar_url ? (
                      <img src={pet.avatar_url} alt="" style={{ width: 60, height: 60, borderRadius: 16, objectFit: "cover" }} />
                    ) : "🐾"}
                  </div>
                  <div style={{ fontFamily: "mono", fontSize: 12, color: "rgba(26,26,46,0.35)", lineHeight: 1.8 }}>
                    Say hi to {pet.name}!<br/>
                    Your pet responds based on their personality and mood.
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                    {["Hey there! 👋", "How are you?", "I love you!", "Are you hungry?"].map(q => (
                      <button key={q} onClick={() => { setChatInput(q); }} style={{
                        background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)",
                        borderRadius: 20, padding: "5px 12px", cursor: "pointer",
                        fontFamily: "mono", fontSize: 10, color: "#b45309",
                      }}>{q}</button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((msg, i) => (
                <div key={i} style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  gap: 8, alignItems: "flex-end",
                }}>
                  {msg.role === "pet" && (
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                      border: "1.5px solid rgba(251,191,36,0.2)",
                    }}>
                      {pet.avatar_url ? (
                        <img src={pet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(251,191,36,0.1)", fontSize: 14 }}>🐾</div>
                      )}
                    </div>
                  )}
                  <div style={{
                    maxWidth: "75%", padding: "10px 14px", borderRadius: 16,
                    background: msg.role === "user"
                      ? "linear-gradient(135deg, #f59e0b, #d97706)"
                      : "rgba(255,255,255,0.9)",
                    color: msg.role === "user" ? "white" : "#1a1a2e",
                    fontFamily: "mono", fontSize: 12, lineHeight: 1.6,
                    border: msg.role === "pet" ? "1px solid rgba(0,0,0,0.06)" : "none",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    borderBottomRightRadius: msg.role === "user" ? 4 : 16,
                    borderBottomLeftRadius: msg.role === "pet" ? 4 : 16,
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, overflow: "hidden", border: "1.5px solid rgba(251,191,36,0.2)", flexShrink: 0 }}>
                    {pet.avatar_url ? <img src={pet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>🐾</span>}
                  </div>
                  <div style={{
                    padding: "10px 14px", borderRadius: 16, borderBottomLeftRadius: 4,
                    background: "rgba(255,255,255,0.9)", border: "1px solid rgba(0,0,0,0.06)",
                  }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[0, 1, 2].map(d => (
                        <div key={d} style={{
                          width: 6, height: 6, borderRadius: "50%", background: "#d97706",
                          animation: `pulse 1.2s ease-in-out ${d * 0.2}s infinite`,
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div style={{
              padding: "12px 16px", borderTop: "1px solid rgba(0,0,0,0.06)",
              display: "flex", gap: 8, background: "white",
            }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleChat()}
                placeholder={`Message ${pet.name}...`}
                spellCheck={false}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.08)", outline: "none",
                  fontFamily: "mono", fontSize: 12, background: "rgba(0,0,0,0.02)",
                }}
              />
              <button
                onClick={handleChat}
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  padding: "10px 18px", borderRadius: 12, border: "none",
                  background: chatInput.trim() ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(0,0,0,0.04)",
                  color: chatInput.trim() ? "white" : "rgba(26,26,46,0.25)",
                  fontFamily: "mono", fontSize: 12, fontWeight: 600,
                  cursor: chatInput.trim() ? "pointer" : "default",
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

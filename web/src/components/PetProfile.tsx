"use client";

import { useState, useEffect, useRef } from "react";
import { useConfig } from "wagmi";
import { api, getAuthHeaders } from "@/lib/api";
import { signAction } from "@/lib/signAction";
import { useRecordAdoption, isPETActivityEnabled, useCheckBnbBalance } from "@/hooks/usePETActivity";
import EnhancedOnboarding from "@/components/EnhancedOnboarding";
import PetStatRadar, { StatSlotBar } from "@/components/PetStatRadar";
import PetInsightCard from "@/components/PetInsightCard";
import PetGreeting from "@/components/PetGreeting";
import PetDiary from "@/components/PetDiary";
import EvolutionAnimation from "@/components/EvolutionAnimation";
import PaywallModal from "@/components/PaywallModal";
import StatUpgradePanel from "@/components/StatUpgradePanel";

const PET_SPECIES = ["Cat","Dog","Parrot","Turtle","Hamster","Rabbit","Fox","Pomeranian"];

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

// Every interaction has an explicit purpose tag = "what this click earns or unlocks".
// minLevel gates a few interactions behind progression so leveling up matters.
const INTERACTIONS = [
  { type: "feed",  label: "Feed",  icon: "🍖", color: "#4ade80",
    desc: "5/day free · then 0.10 USDT · 7-day streak = NFT", minLevel: 1, purpose: "EARN" },
  { type: "play",  label: "Play",  icon: "⚽", color: "#60a5fa",
    desc: "5/day free · then 0.10 USDT · happiness ↑",        minLevel: 1, purpose: "EARN" },
  { type: "talk",  label: "Talk",  icon: "💬", color: "#c084fc",
    desc: "Memory grows. Bond unlocks chat depth.",            minLevel: 1, purpose: "GROW" },
  { type: "pet",   label: "Pet",   icon: "🤚", color: "#f472b6",
    desc: "Show affection · bond +",                           minLevel: 1, purpose: "BOND" },
  { type: "walk",  label: "Walk",  icon: "🚶", color: "#fbbf24",
    desc: "Recover energy. Unlock at Lv.3.",                   minLevel: 3, purpose: "RESTORE" },
  { type: "train", label: "Train", icon: "🎓", color: "#f97316",
    desc: "Earn XP fast. Unlock at Lv.5.",                     minLevel: 5, purpose: "GROW" },
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
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(26,26,46,0.5)", display: "flex", alignItems: "center", gap: 4 }}>
          {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
          {label}
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color,
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

  // Escape closes the modal — but never mid-adoption, since an on-chain tx is
  // in flight and tearing the UI down would orphan it.
  const closeIfIdle = () => { if (!creating) onClose(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !creating) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating, onClose]);

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
          setAdoptError("❌ Switch to the BSC network");
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create pet");
      }
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
        ? "Not enough BNB — top up your BSC wallet."
        : raw.includes("reject") || raw.includes("denied") || raw.includes("user refused")
        ? "Transaction rejected"
        : e.message || "Adoption failed";
      setAdoptError(`❌ ${msg}`);
    }
    setCreating(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Clear any prior rejection so the warning doesn't stick after the user
    // picks a new image — without this, a rejected non-pet upload keeps its
    // error banner visible even on the next valid attempt.
    setAdoptError(null);
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create pet");
      }
      const pet = await res.json();

      // Set uploaded photo as avatar
      await api.pets.update(pet.id, { avatar_url: avatarUrl });
      pet.avatar_url = avatarUrl;

      onCreated(pet);
      onClose();
    } catch (e: any) {
      setAdoptError("❌ " + (e.message || "Adoption failed"));
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
            fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "rgba(26,26,46,0.35)",
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
      }} onClick={closeIfIdle}>
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
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(26,26,46,0.4)", marginTop: 4 }}>
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
              <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: "rgba(26,26,46,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
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
              <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: "rgba(26,26,46,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
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
              <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: "rgba(26,26,46,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
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
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.14em", color: "#7c3aed", marginBottom: 2,
              fontWeight: 800,
            }}>ADOPTION · CHAT WITH AI</div>
            <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 800, color: "#1a1a2e", margin: 0, letterSpacing: "-0.015em" }}>
              Tell us about your dream pet
            </h3>
            <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(26,26,46,0.55)", margin: "4px 0 0", fontWeight: 500 }}>
              We'll generate a one-of-one avatar from your description.
            </p>
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px 20px",
          display: "flex", flexDirection: "column", gap: 10, minHeight: 0,
        }}>
          {chatMessages.map((msg, i) => (
            <div key={i} className="mp-enter" style={{
              display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              alignItems: "flex-end", gap: 8,
            }}>
              {msg.role !== "user" && (
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, flexShrink: 0,
                  boxShadow: "0 2px 8px rgba(124,58,237,0.25)",
                }}>🤖</div>
              )}
              <div style={{
                maxWidth: "78%", padding: "12px 16px",
                borderRadius: msg.role === "user" ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
                background: msg.role === "user"
                  ? "linear-gradient(135deg, #7c3aed, #6d28d9)"
                  : "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(245,158,11,0.04))",
                color: msg.role === "user" ? "white" : "#1a1a2e",
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, lineHeight: 1.55,
                border: msg.role === "user" ? "none" : "1px solid rgba(139,92,246,0.16)",
                boxShadow: msg.role === "user"
                  ? "0 4px 14px rgba(124,58,237,0.25), inset 0 1px 0 rgba(255,255,255,0.15)"
                  : "0 1px 3px rgba(0,0,0,0.03)",
                fontWeight: 500,
              }}>
                {msg.text}
              </div>
            </div>
          ))}

          {chatLoading && (
            <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 10 }}>
              <div style={{
                padding: "12px 18px", borderRadius: "18px 18px 18px 6px",
                background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(139,92,246,0.02))",
                border: "1px solid rgba(139,92,246,0.18)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{
                  display: "inline-flex", gap: 5, alignItems: "center",
                }}>
                  <span className="ai-typing-dot" style={{ animationDelay: "0s" }} />
                  <span className="ai-typing-dot" style={{ animationDelay: "0.18s" }} />
                  <span className="ai-typing-dot" style={{ animationDelay: "0.36s" }} />
                </span>
                <span style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 14, fontWeight: 600,
                  color: "#7c3aed", letterSpacing: "0.01em",
                }}>
                  thinking
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
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.15em", color: "#7c3aed", marginBottom: 10 }}>
                ✨ YOUR NEW COMPANION
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 800, color: "#1a1a2e", marginBottom: 4, letterSpacing: "-0.02em" }}>
                {petData.name}
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(26,26,46,0.5)", marginBottom: 10, fontWeight: 500 }}>
                {petData.species_name}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: "rgba(139,92,246,0.12)", color: "#7c3aed", fontWeight: 600 }}>
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
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#7c3aed",
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
          <img src="/mascot.jpg" alt={pet.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
  const src = pet.avatar_url || "/mascot.jpg";
  return <img src={src} alt={pet.name} style={{ width: size, height: size, borderRadius: size * 0.3, objectFit: "cover" }} />;
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
  const [paywall, setPaywall] = useState<any>(null);   // PaywallInfo | null
  const [editingDesc, setEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: string; text: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [petRequest, setPetRequest] = useState<any>(null);
  const [comboToast, setComboToast] = useState<{ name: string; description: string; emoji: string } | null>(null);
  // Default to clean stat bars rather than the hexagon radar — the radar
  // looks like a debug screen at first glance, bars communicate immediately.
  const [statsView, setStatsView] = useState<"radar" | "slots">("slots");
  const [combosUnlocked, setCombosUnlocked] = useState<string[]>([]);
  const [evolutionAnim, setEvolutionAnim] = useState<{
    fromStage: { icon: string; name: string };
    toStage: { icon: string; name: string };
    skillsUnlocked: string[];
    creditsEarned: number;
  } | null>(null);

  // Tracks the currently-selected pet so async status/evo loaders can bail if
  // the user switched pets mid-fetch — a slow response for the old pet must not
  // clobber the new pet's stats/evolution/request.
  const activePetIdRef = useRef<number | null>(null);
  useEffect(() => { activePetIdRef.current = activePet?.id ?? null; }, [activePet]);

  // Hydrate the chat thread from the pet's own memory ledger on pet switch, so a
  // returning owner sees continuity instead of a blank thread (the pet "remembers").
  useEffect(() => {
    if (!activePet?.id) { setChatMessages([]); return; }
    let alive = true;
    api.pets.chatHistory(activePet.id)
      .then((d: any) => { if (alive && Array.isArray(d?.messages) && d.messages.length) setChatMessages(d.messages); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activePet?.id]);

  // Escape closes the chat modal — keyboard users can't reach the backdrop or ✕.
  useEffect(() => {
    if (!showChat) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowChat(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showChat]);

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
    } catch (e: any) {
      // A 401 means the session lapsed (token present but server-rejected) —
      // NOT that the user has zero pets. Clear the stale token and reload so the
      // app re-gates to "Connect Wallet" instead of showing the misleading
      // "Adopt Your First Pet" empty state, which would dead-end at create.
      // Scoped to 401 only, so a transient 500/network blip won't sign anyone out.
      if (e?.status === 401 && typeof window !== "undefined") {
        try {
          localStorage.removeItem("petagen_jwt");
          localStorage.removeItem("petagen_user");
        } catch {}
        window.location.reload();
        return;
      }
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
      // Surface the actual API error so users can see what went wrong instead
      // of a silent failure that just looks like the confirm button hung.
      const msg = e?.message || e?.error || "Release failed — try refreshing the page.";
      showError(`Release failed: ${msg}`);
      setShowRelease(false);
    }
    setReleasing(false);
  };

  const loadPetStatus = async (petId: number) => {
    try {
      const status = await api.pets.get(petId);
      if (activePetIdRef.current !== petId) return; // pet switched mid-fetch
      setPetStatus(status);
    } catch (e) {
      // status fetch failed, use activePet data as fallback
    }
    // Load active event request + combo history
    try {
      const res = await fetch(`/api/pets/${petId}/interact`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (activePetIdRef.current !== petId) return; // pet switched mid-fetch
        setPetRequest(data.request || null);
        setCombosUnlocked(data.combos_unlocked || []);
      }
    } catch {}
  };

  const loadEvoStatus = async (petId: number) => {
    try {
      const evo = await api.evolution.status(petId);
      if (activePetIdRef.current !== petId) return; // pet switched mid-fetch
      setEvoStatus(evo);
    } catch (e) {
      if (activePetIdRef.current !== petId) return;
      setEvoStatus(null);
    }
  };

  const handleEvolve = async () => {
    if (!activePet || evolving) return;
    setEvolving(true);
    setEvoResult(null);
    try {
      const prevStage = evoStatus?.current_stage;
      const result = await api.evolution.evolve(activePet.id);
      setEvoResult(result);
      // Trigger gacha-style animation
      if (result.new_stage && prevStage) {
        setEvolutionAnim({
          fromStage: { icon: prevStage.icon || "🥚", name: prevStage.name || "Previous" },
          toStage: { icon: result.new_stage.icon || "✨", name: result.new_stage.name || "Evolved" },
          skillsUnlocked: result.skills_unlocked || [],
          creditsEarned: result.credits_earned || 0,
        });
      }
      await loadPetStatus(activePet.id);
      await loadEvoStatus(activePet.id);
      await loadPets();
      await loadBalance();
    } catch (e: any) {
      showError(e.message || "Evolution failed");
    }
    setEvolving(false);
  };

  const handleInteract = async (type: string) => {
    if (!activePet || interacting) return;
    setInteracting(type);
    setResponseAnim(false);

    // Direct fetch so we can read 402 paywall payload (api.pets.interact wraps
    // errors and would lose the paywall info).
    const callInteract = async (txHash?: string): Promise<any> => {
      const qs = txHash ? `?tx_hash=${txHash}` : "";
      const res = await fetch(`/api/pets/${activePet.id}/interact${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ interaction_type: type }),
      });
      if (res.status === 402) {
        const { paywall: pw } = await res.json();
        // Open paywall modal — feed_extra/play_extra/etc come back here on success
        setPaywall({
          ...pw,
          onPaid: async (newTx: string) => {
            setPaywall(null);
            const retry = await callInteract(newTx);
            if (retry) finishInteract(retry);
          },
        });
        return null;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || "Interaction failed");
      }
      return res.json();
    };

    const finishInteract = (result: any) => {
      setLastResponse({
        response_text: result.interaction?.response || result.response_text || "...",
        stat_changes: result.interaction?.effects || result.stat_changes || {},
        memory_created: result.interaction?.leveled_up ? `${activePet.name} leveled up!` : null,
        combo: result.interaction?.combo,
        request_fulfilled: result.interaction?.request_fulfilled,
        care_streak: result.interaction?.care_streak,
      });
      setResponseAnim(true);
      if (result.interaction?.combo) {
        setComboToast(result.interaction.combo);
        setTimeout(() => setComboToast(null), 4500);
      }
      setPetRequest(result.interaction?.next_request || null);
      loadPetStatus(activePet.id);
      loadEvoStatus(activePet.id);
      loadPets();
    };

    try {
      const result = await callInteract();
      if (result) finishInteract(result);
    } catch (e: any) {
      // Rate-limit (429 "Slow down…") and care-gates are blocked states, not a
      // pet "response" — otherwise a rapid second click rendered the raw 429
      // body as if the pet said it.
      const blocked = !!e.message && (
        e.message.includes("Too hungry") || e.message.includes("Too tired") ||
        e.message.includes("stuffed") || e.message.includes("Slow down") ||
        e.message.includes("Too fast") || e.message.includes("429")
      );
      setLastResponse({
        response_text: blocked && /slow down|too fast|429/i.test(e.message)
          ? `${activePet.name} needs a moment — slow down 🐾`
          : (e.message || "Interaction failed"),
        stat_changes: {},
        blocked,
      });
      setResponseAnim(true);
    }
    // Clear immediately so the button state is honest; the server's own 1500ms
    // cooldown (429) is now surfaced gracefully above instead of as a fake reply.
    setInteracting(null);
  };

  const handleChat = async () => {
    if (!activePet || !chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    const petName = activePet.name; // snapshot to avoid null-deref later
    const petId = activePet.id;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const res = await api.pets.chat(petId, msg);
      setChatMessages(prev => [...prev, { role: "pet", text: res.reply }]);
      try { await loadPetStatus(petId); } catch {}
      try { await loadPets(); } catch {}
    } catch (e: any) {
      const errMsg = e?.message?.includes("429") || e?.message?.includes("exhausted")
        ? `*${petName} looks tired — model credits are out, please try later*`
        : `*${petName} tilts head confused*`;
      setChatMessages(prev => [...prev, { role: "pet", text: errMsg }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const selectPet = (pet: any) => {
    activePetIdRef.current = pet.id; // set eagerly so in-flight loaders for the old pet bail
    setActivePet(pet);
    setLastResponse(null);
    setEvoResult(null);
    setPetRequest(null);      // clear the previous pet's "wants" popup + combos until the new fetch lands
    setCombosUnlocked([]);
    setPetStatus(null);
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
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "rgba(26,26,46,0.35)" }}>Loading your pets...</div>
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
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "rgba(26,26,46,0.5)", marginBottom: 8, lineHeight: 1.8 }}>
          Adopt your first AI pet! They&apos;ll grow, learn your patterns, and develop a unique personality over time.
        </p>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(26,26,46,0.35)", marginBottom: 32, lineHeight: 1.7 }}>
          Feed them, play with them, talk to them — every interaction matters.
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none", borderRadius: 14,
          padding: "15px 40px", fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, color: "white", cursor: "pointer",
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
              setChainToast("⛓️ Recording on-chain…");
              const speciesName = pet.personality_modifiers?.species_name || PET_SPECIES[pet.species] || "Pet";
              await parentRecordAdoption(pet.name, speciesName);
              setChainToast("✅ Saved on-chain");
              setTimeout(() => setChainToast(null), 3000);
            } catch (e: any) {
              console.error("[PETActivity] Full error:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
              const raw = (e?.shortMessage || e?.message || "").toLowerCase();
              const msg = raw.includes("insufficient") || raw.includes("bnb") || raw.includes("fund")
                ? "Not enough BNB"
                : raw.includes("reject") || raw.includes("denied") || raw.includes("user refused")
                ? "Transaction rejected"
                : raw.includes("chain") || raw.includes("network")
                ? "Switch to the BSC network"
                : `On-chain save failed: ${e?.shortMessage || e?.message || "unknown error"}`;
              setChainToast(`❌ ${msg}`);
              setTimeout(() => setChainToast(null), 6000);
            }
          }
        }} />}
      </div>
    );
  }

  const pet = petStatus || activePet;
  // Guard: pet may briefly be null right after release before loadPets resolves the empty list
  if (!pet) {
    return (
      <div style={{ padding: "140px 40px", textAlign: "center", color: "rgba(26,26,46,0.5)" }}>
        Loading...
      </div>
    );
  }
  const mood = pet.current_mood || "neutral";
  const moodCfg = MOOD_CONFIG[mood] || MOOD_CONFIG.neutral;
  const expNeeded = Math.max(1, (pet.level || 1) * 100); // avoid /0 → NaN width in the EXP bar

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
            <div style={{ fontSize: 14, color: "#888", marginTop: 8 }}>{chainToast?.startsWith("❌") ? "Dismiss the wallet to clear this" : "Confirm in your wallet"}</div>
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
      <EvolutionAnimation
        open={!!evolutionAnim}
        onClose={() => setEvolutionAnim(null)}
        petName={activePet?.name || "Your pet"}
        petAvatarUrl={activePet?.avatar_url}
        fromStage={evolutionAnim?.fromStage || { icon: "🥚", name: "" }}
        toStage={evolutionAnim?.toStage || { icon: "✨", name: "" }}
        skillsUnlocked={evolutionAnim?.skillsUnlocked || []}
        creditsEarned={evolutionAnim?.creditsEarned || 0}
      />
      {comboToast && (
        <div style={{
          position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999,
          background: "linear-gradient(135deg, #f59e0b, #d97706)",
          color: "white",
          padding: "18px 32px", borderRadius: 18,
          fontFamily: "'Space Grotesk',sans-serif",
          boxShadow: "0 12px 40px rgba(245,158,11,0.4)",
          animation: "comboBurst 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
          textAlign: "center",
          minWidth: 280,
        }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>{comboToast.emoji}</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.85, marginBottom: 4 }}>
            ✦ Combo Activated ✦
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
            {comboToast.name}
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.92 }}>
            {comboToast.description}
          </div>
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
        @keyframes comboBurst {
          0% { opacity: 0; transform: translateX(-50%) scale(0.6) translateY(-30px); }
          60% { opacity: 1; transform: translateX(-50%) scale(1.05) translateY(0); }
          100% { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
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
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(26,26,46,0.35)" }}>
                Lv.{p.level} {getSpeciesName(p)}
              </div>
            </div>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {pets.length < petSlots ? (
          <button onClick={() => setShowCreate(true)} style={{
            background: "rgba(0,0,0,0.02)", border: "1px dashed rgba(0,0,0,0.12)",
            borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: "rgba(26,26,46,0.35)", transition: "all 0.2s",
          }}>+ Adopt New</button>
        ) : petSlots < 5 ? (
          <button onClick={handleUnlockSlot} disabled={unlockingSlot} style={{
            background: "rgba(251,191,36,0.08)", border: "1px dashed rgba(251,191,36,0.3)",
            borderRadius: 10, padding: "10px 18px", cursor: unlockingSlot ? "wait" : "pointer",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#b45309", transition: "all 0.2s",
          }}>
            🔓 Unlock Slot ({slotPrices[petSlots] || 500} credits)
          </button>
        ) : null}
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(26,26,46,0.3)" }}>
          {pets.length}/{petSlots} slots
        </span>
        {balance !== null && (<>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11, padding: "6px 14px", borderRadius: 10,
            background: "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.04))",
            border: "1px solid rgba(251,191,36,0.2)",
            color: "#b45309", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
          }} onClick={() => { const el = document.querySelector(".pricing-root"); if (el) el.scrollIntoView({ behavior: "smooth" }); }}>
            <span style={{ fontSize: 13 }}>🪙</span> {balance.toLocaleString()} credits
          </div>
        </>)}
      </div>

      {/* Daily-rhythm greeting — time + mood aware, surfaces "while you were away". */}
      <PetGreeting
        petId={pet.id}
        petName={pet.name}
        mood={mood}
        accent={moodCfg.color}
        lastInteractionAt={pet.last_interaction_at}
      />

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
            <PetAvatar pet={pet} mood={mood} size={140} />
            {/* If the pet still has the default species name ("Cat"/"Dog"…),
                surface a clear rename CTA. Generic names kill the emotional
                lock-in we're trying to build. */}
            {PET_SPECIES.includes(pet.name) && (
              <div style={{
                margin: "14px auto 0", maxWidth: 280,
                padding: "10px 14px",
                background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(139,92,246,0.06))",
                border: "1px solid rgba(168,85,247,0.30)",
                borderRadius: 12, textAlign: "center",
              }}>
                <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 700, marginBottom: 6 }}>
                  ✨ Give them a real name
                </div>
                <button
                  className="mp-btn-primary mp-lift"
                  onClick={async () => {
                    const newName = window.prompt(
                      `What should we call this ${pet.name.toLowerCase()}?\n(2-20 letters)`,
                      ""
                    );
                    if (!newName) return;
                    const trimmed = newName.trim().slice(0, 20);
                    if (trimmed.length < 2) { showError("Pick a name with at least 2 letters."); return; }
                    try {
                      const r = await fetch(`/api/pets/${pet.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                        body: JSON.stringify({ name: trimmed }),
                      });
                      if (!r.ok) { showError("Couldn't save — try again?"); return; }
                      window.location.reload();
                    } catch { showError("Network error"); }
                  }}
                  style={{
                    width: "100%", padding: "10px 16px", fontSize: 14,
                    background: "linear-gradient(135deg,#a855f7,#7c3aed)",
                    boxShadow: "0 6px 16px rgba(124,58,237,0.30), inset 0 1px 0 rgba(255,255,255,0.25)",
                  }}
                >Name them →</button>
              </div>
            )}
            <h2 style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, color: "#1a1a2e",
              margin: "18px 0 10px", fontWeight: 800, letterSpacing: "-0.025em",
            }}>
              {pet.name}
            </h2>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: "3px 10px", borderRadius: 10,
                background: "rgba(251,191,36,0.1)", color: "#b45309",
                border: "1px solid rgba(251,191,36,0.2)",
              }}>
                Lv.{pet.level}
              </span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: "3px 10px", borderRadius: 10,
                background: "rgba(139,92,246,0.08)", color: "#7c3aed",
                border: "1px solid rgba(139,92,246,0.15)",
              }}>
                {pet.personality_type}
              </span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: "3px 10px", borderRadius: 10,
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
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, outline: "none", boxSizing: "border-box", marginBottom: 6,
                    }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={async () => {
                      try {
                        await api.pets.updateDesc(pet.id, descInput);
                        await loadPetStatus(pet.id);
                        await loadPets();
                        setEditingDesc(false);
                      } catch (e: any) { showError(e.message); }
                    }} style={{
                      padding: "4px 12px", borderRadius: 6, border: "none",
                      background: "#f59e0b", color: "white", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: "pointer",
                    }}>Save</button>
                    <button onClick={() => setEditingDesc(false)} style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)",
                      background: "white", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: "pointer",
                    }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => { setDescInput(pet.appearance_desc || ""); setEditingDesc(true); }}
                  style={{ cursor: "pointer" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(26,26,46,0.4)", marginBottom: 2 }}>
                    {pet.appearance_desc ? "APPEARANCE" : "⚠️ ADD APPEARANCE (required for AI generation)"}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: pet.appearance_desc ? "rgba(26,26,46,0.6)" : "#b45309" }}>
                    {pet.appearance_desc || "Tap to describe your pet's look"}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View toggle */}
          <div style={{ display: "flex", gap: 4, marginBottom: 14, padding: 3, borderRadius: 10, background: "rgba(0,0,0,0.04)" }}>
            {(["slots", "radar"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setStatsView(v)}
                style={{
                  flex: 1, padding: "6px 10px", borderRadius: 8,
                  background: statsView === v ? "white" : "transparent",
                  border: "none", cursor: "pointer",
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700,
                  color: statsView === v ? "#1a1a2e" : "rgba(26,26,46,0.5)",
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  boxShadow: statsView === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {v === "slots" ? "Stats" : "Hexagon"}
              </button>
            ))}
          </div>

          {statsView === "radar" ? (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <PetStatRadar
                size={260}
                stats={[
                  { label: "Happy", value: pet.happiness, color: "#f472b6", icon: "💖" },
                  { label: "Energy", value: pet.energy, color: "#60a5fa", icon: "⚡" },
                  { label: "Hunger", value: 100 - pet.hunger, color: "#fbbf24", icon: "🍖" },
                  { label: "Bond", value: pet.bond_level, color: "#c084fc", icon: "🤝" },
                  { label: "EXP", value: Math.min(100, (pet.experience % 100)), color: "#4ade80", icon: "✨" },
                  { label: "Level", value: Math.min(100, pet.level * 5), color: "#f59e0b", icon: "🌟" },
                ]}
              />
            </div>
          ) : (
            <div>
              <StatSlotBar label="Happy" value={pet.happiness} color="#f472b6" icon="💖" warning={pet.happiness < 30} />
              <StatSlotBar label="Energy" value={pet.energy} color="#60a5fa" icon="⚡" warning={pet.energy < 15} />
              <StatSlotBar label="Hunger" value={pet.hunger} color="#fbbf24" icon="🍖" warning={pet.hunger >= 80} />
              <StatSlotBar label="Bond" value={pet.bond_level} color="#c084fc" icon="🤝" />
              <StatSlotBar label="EXP" value={pet.experience} max={expNeeded} color="#4ade80" icon="✨" />
            </div>
          )}

          {/* Combo collection */}
          {combosUnlocked.length > 0 && (
            <div style={{
              marginTop: 12, padding: "10px 12px", borderRadius: 10,
              background: "linear-gradient(135deg, rgba(245,158,11,0.05), rgba(192,132,252,0.05))",
              border: "1px solid rgba(245,158,11,0.15)",
            }}>
              <div style={{ fontSize: 10, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: "rgba(26,26,46,0.5)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                ✨ Combos Discovered
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {combosUnlocked.map((c) => (
                  <span key={c} style={{
                    fontSize: 10, padding: "3px 9px", borderRadius: 6,
                    background: "rgba(245,158,11,0.12)", color: "#b45309",
                    fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
                  }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 10,
            background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)",
            display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(26,26,46,0.35)" }}>
              Total Interactions
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#b45309", fontWeight: 600 }}>
              {pet.total_interactions}
            </span>
          </div>

          {/* Care Streak badge — surfaces multi-day consistent care.
              Hits a NFT auto-mint every 7 days (see lib/petclaw/nft-mint.ts). */}
          {(pet as any).care_streak > 0 && (
            <div style={{
              marginTop: 10, padding: "10px 14px", borderRadius: 10,
              background: `linear-gradient(135deg, rgba(245,158,11,${Math.min(0.18, (pet as any).care_streak * 0.025)}), rgba(220,38,38,${Math.min(0.10, (pet as any).care_streak * 0.015)}))`,
              border: `1px solid rgba(245,158,11,${Math.min(0.45, 0.15 + (pet as any).care_streak * 0.03)})`,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>🔥</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#b45309", letterSpacing: "-0.01em" }}>
                    {(pet as any).care_streak}-day care streak
                  </div>
                  <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "rgba(180,83,9,0.7)", marginTop: 1 }}>
                    {(pet as any).care_streak % 7 === 0
                      ? "NFT minted! ✨"
                      : `Next NFT at day ${Math.ceil((pet as any).care_streak / 7) * 7}`}
                  </div>
                </div>
              </div>
              <div style={{
                fontSize: 9, padding: "3px 8px", borderRadius: 999,
                background: "rgba(180,83,9,0.12)", color: "#b45309",
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: "0.08em",
              }}>EARN</div>
            </div>
          )}

          {/* Power Training + Battle are paused. The pet identity / memory /
              streak loop is the product; on-chain stat fighting was the wrong
              direction. Code is preserved for reference but hidden. */}

          {!showRelease ? (
            <button onClick={() => setShowRelease(true)} style={{
              marginTop: 10, width: "100%", padding: "8px", borderRadius: 8,
              background: "transparent", border: "1px solid rgba(220,38,38,0.1)",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(220,38,38,0.4)",
              cursor: "pointer", transition: "all 0.2s",
            }}>
              Release {pet.name}
            </button>
          ) : (
            <div style={{
              marginTop: 10, padding: 12, borderRadius: 10,
              background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.15)",
            }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#dc2626", marginBottom: 8 }}>
                Release {pet.name}? This cannot be undone.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleRelease} disabled={releasing} style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: "none",
                  background: "#dc2626", color: "white", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11, fontWeight: 600, cursor: releasing ? "wait" : "pointer",
                }}>
                  {releasing ? "..." : "Confirm"}
                </button>
                <button onClick={() => setShowRelease(false)} style={{
                  flex: 1, padding: "8px", borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)", background: "white",
                  color: "#1a1a2e", fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  fontWeight: 600, cursor: "pointer",
                }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Pet event request popup */}
          {petRequest && petRequest.type && (
            <div style={{
              background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(192,132,252,0.10))",
              borderRadius: 16, border: "1px solid rgba(245,158,11,0.3)",
              padding: 16, position: "relative", overflow: "hidden",
              animation: "responseSlide 0.4s ease-out",
            }}>
              <div style={{
                position: "absolute", top: 8, right: 12,
                fontSize: 9, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
                color: "#b45309", letterSpacing: "0.08em", textTransform: "uppercase",
                background: "rgba(245,158,11,0.15)", padding: "2px 8px", borderRadius: 6,
              }}>
                💭 Pet Wants
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: INTERACTIONS.find((i) => i.type === petRequest.type)?.color || "#f59e0b",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, flexShrink: 0,
                  boxShadow: "0 4px 12px rgba(245,158,11,0.3)",
                }}>
                  {INTERACTIONS.find((i) => i.type === petRequest.type)?.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 14, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
                    color: "#1a1a2e", marginBottom: 2,
                  }}>
                    "{petRequest.message}"
                  </div>
                  <div style={{
                    fontSize: 11, fontFamily: "'Space Grotesk',sans-serif",
                    color: "rgba(26,26,46,0.55)",
                  }}>
                    Fulfill within 30min for bonus +happy +bond +exp
                  </div>
                </div>
                <button
                  onClick={() => handleInteract(petRequest.type)}
                  disabled={!!interacting}
                  style={{
                    padding: "8px 16px", borderRadius: 10, border: "none",
                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                    color: "white", fontFamily: "'Space Grotesk',sans-serif",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Do it!
                </button>
              </div>
            </div>
          )}

          {/* Interactions */}
          <div style={{
            background: "rgba(255,255,255,0.8)", borderRadius: 18,
            border: "1px solid rgba(0,0,0,0.06)", padding: 22,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(26,26,46,0.5)", marginBottom: 14,
              textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600,
            }}>
              Interact with <span style={{ fontWeight: 700, color: "#1a1a2e" }}>{pet.name}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {INTERACTIONS.map(i => {
                // Gating logic — match server-side rules + level-gate
                const tooHungry = pet.hunger >= 80 && (i.type === "play" || i.type === "walk" || i.type === "train");
                const tooTired = pet.energy < 15 && (i.type === "play" || i.type === "walk" || i.type === "train");
                const tooFull = pet.hunger <= 5 && i.type === "feed";
                const levelLocked = pet.level < (i.minLevel || 1);
                const blocked = tooHungry || tooTired || tooFull || levelLocked;
                const blockReason = levelLocked ? `Unlocks at Lv.${i.minLevel}`
                  : tooHungry ? "Too hungry"
                  : tooTired ? "Too tired"
                  : tooFull ? "Stuffed!" : "";
                const isRequested = petRequest?.type === i.type;
                return (
                  <button key={i.type} onClick={() => i.type === "talk" ? setShowChat(true) : handleInteract(i.type)}
                    disabled={!!interacting || blocked}
                    title={blocked ? blockReason : i.desc}
                    className={blocked ? "" : "mp-lift"}
                    style={{
                      position: "relative",
                      background: blocked ? "rgba(220,38,38,0.04)" : interacting === i.type ? `${i.color}15` : isRequested ? `${i.color}10` : "white",
                      border: blocked ? "1px solid rgba(220,38,38,0.18)" : interacting === i.type ? `1px solid ${i.color}40` : isRequested ? `2px solid ${i.color}80` : "1px solid rgba(0,0,0,0.07)",
                      borderRadius: 14, padding: "16px 8px",
                      cursor: blocked ? "not-allowed" : interacting ? "wait" : "pointer",
                      opacity: blocked ? 0.55 : interacting && interacting !== i.type ? 0.4 : 1,
                      transform: interacting === i.type ? "scale(0.95)" : "scale(1)",
                      boxShadow: interacting === i.type ? `0 0 16px ${i.color}25` : isRequested ? `0 0 14px ${i.color}30` : "0 1px 2px rgba(0,0,0,0.02)",
                      animation: isRequested && !interacting ? "statPop 1.5s ease infinite" : "none",
                    }}>
                    {isRequested && !blocked && (
                      <div style={{
                        position: "absolute", top: -6, right: -6,
                        background: "#f59e0b", color: "white",
                        fontSize: 10, padding: "2px 6px", borderRadius: 6,
                        fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
                        boxShadow: "0 2px 6px rgba(245,158,11,0.4)",
                      }}>!</div>
                    )}
                    {/* Purpose tag (top-left) — "what does this click DO" */}
                    {!blocked && (i as any).purpose && (
                      <div style={{
                        position: "absolute", top: 4, left: 4,
                        fontSize: 7, padding: "2px 5px", borderRadius: 4,
                        background: "rgba(0,0,0,0.05)", color: "rgba(26,26,46,0.55)",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 700, letterSpacing: "0.06em",
                      }}>{(i as any).purpose}</div>
                    )}
                    {/* Lock icon if level-gated */}
                    {levelLocked && (
                      <div style={{
                        position: "absolute", top: 6, right: 6, fontSize: 12,
                      }}>🔒</div>
                    )}
                    <div style={{
                      fontSize: 26, marginBottom: 4,
                      animation: interacting === i.type ? "statPop 0.3s ease" : "none",
                      filter: blocked ? "grayscale(0.7)" : "none",
                    }}>{i.icon}</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: blocked ? "#dc2626" : i.color, fontWeight: 700 }}>{i.label}</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, color: blocked ? "#dc2626" : "rgba(26,26,46,0.45)", marginTop: 2, fontWeight: blocked ? 600 : 400 }}>
                      {blocked ? blockReason : i.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Response */}
          {lastResponse && (
            <div style={{
              background: lastResponse.blocked
                ? "linear-gradient(135deg, rgba(220,38,38,0.06), rgba(220,38,38,0.03))"
                : lastResponse.combo
                  ? "linear-gradient(135deg, rgba(245,158,11,0.10), rgba(192,132,252,0.08))"
                  : "linear-gradient(135deg, rgba(74,222,128,0.06), rgba(74,222,128,0.03))",
              borderRadius: 16,
              border: lastResponse.blocked
                ? "1px solid rgba(220,38,38,0.2)"
                : lastResponse.combo
                  ? "1px solid rgba(245,158,11,0.3)"
                  : "1px solid rgba(74,222,128,0.15)",
              padding: 18,
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
                  <img src={pet.avatar_url || "/mascot.jpg"} alt={pet.name} style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} />
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
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: "3px 8px", borderRadius: 8,
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
                      marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(26,26,46,0.35)",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <span style={{ fontSize: 10 }}>💭</span>
                      {lastResponse.memory_created}
                    </div>
                  )}
                  {lastResponse.combo && (
                    <div style={{
                      marginTop: 10, padding: "8px 12px", borderRadius: 10,
                      background: "rgba(245,158,11,0.15)",
                      border: "1px solid rgba(245,158,11,0.3)",
                      fontFamily: "'Space Grotesk',sans-serif", fontSize: 12,
                      color: "#b45309", fontWeight: 700,
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ fontSize: 16 }}>{lastResponse.combo.emoji}</span>
                      <span>{lastResponse.combo.name} — {lastResponse.combo.description}</span>
                    </div>
                  )}
                  {lastResponse.request_fulfilled && (
                    <div style={{
                      marginTop: 10, padding: "6px 10px", borderRadius: 8,
                      background: "rgba(74,222,128,0.12)",
                      fontFamily: "'Space Grotesk',sans-serif", fontSize: 11,
                      color: "#16a34a", fontWeight: 700,
                    }}>
                      ✓ Pet's request fulfilled — bonus stats applied!
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
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(26,26,46,0.5)", marginBottom: 14,
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
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 8, marginTop: 4,
                          color: isCurrent ? "#b45309" : isPast ? "#16a34a" : "rgba(26,26,46,0.3)",
                          fontWeight: isCurrent ? 700 : 400,
                        }}>
                          {s.name}
                        </div>
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 7,
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
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(26,26,46,0.4)", marginTop: 2 }}>
                      Level {evoStatus.level}
                      {evoStatus.next_stage && ` · Need Lv.${evoStatus.next_stage.minLevel} for ${evoStatus.next_stage.name}`}
                      {!evoStatus.next_stage && " · Max Evolution Reached!"}
                    </div>
                  </div>
                  {evoStatus.next_stage && (
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: "4px 10px", borderRadius: 8,
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
                        width: `${Math.max(0, Math.min(100, ((evoStatus.level || 0) / (evoStatus.next_stage.minLevel || 1)) * 100))}%`,
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
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600,
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
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(26,26,46,0.5)", marginBottom: 4 }}>
                      New skills: {evoResult.skills_unlocked.join(", ")}
                    </div>
                  )}
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#16a34a" }}>
                    +{evoResult.credits_earned} credits earned!
                  </div>
                </div>
              )}

              {/* Skills */}
              {evoStatus.skills?.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(26,26,46,0.4)", marginBottom: 8,
                    textTransform: "uppercase", letterSpacing: "0.1em",
                  }}>
                    Unlocked Skills
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {evoStatus.skills.map((s: any) => (
                      <span key={s.skill_key} style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, padding: "5px 12px", borderRadius: 10,
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

          {/* Pet Daydream FIRST — the payoff of the memory ledger ("your pet has
              been thinking about you") should land before the diary/feed loop. */}
          {pet && <PetInsightCard petId={pet.id} petName={pet.name} />}

          {/* Power up — pay-to-boost stats (402 → PaywallModal loop, mounted below). */}
          {pet && <StatUpgradePanel petId={pet.id} onStatsChanged={() => loadPetStatus(pet.id)} />}

          {/* Weekly diary — the pet's own journal of the week with the owner. */}
          {pet && <PetDiary petId={pet.id} petName={pet.name} accent={moodCfg.color} />}

          {/* Memories Timeline — show a beautiful empty state when none exist
              yet so the user knows what's coming. Previously the section just
              vanished, leaving the page feeling incomplete. */}
          {petStatus && (!petStatus.recent_memories || petStatus.recent_memories.length === 0) && pet && (
            <div style={{
              background: "rgba(255,255,255,0.8)", borderRadius: 16,
              border: "1px solid rgba(0,0,0,0.06)", padding: "32px 24px",
              flex: 1, textAlign: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                color: "rgba(26,26,46,0.55)", letterSpacing: "0.14em",
                textTransform: "uppercase", fontWeight: 700, marginBottom: 18,
              }}>
                Memory Timeline
              </div>
              <div style={{ fontSize: 48, marginBottom: 10, opacity: 0.7 }}>📔</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1a1a2e", marginBottom: 6 }}>
                {pet.name}'s memories will live here
              </div>
              <div style={{
                fontSize: 13, color: "rgba(26,26,46,0.55)", lineHeight: 1.55,
                maxWidth: 360, margin: "0 auto",
              }}>
                Every conversation, every moment you spend together is woven into
                a private ledger only the two of you can see. Start chatting to
                make the first one.
              </div>
            </div>
          )}
          {petStatus?.recent_memories?.length > 0 && (
            <div style={{
              background: "rgba(255,255,255,0.8)", borderRadius: 16,
              border: "1px solid rgba(0,0,0,0.06)", padding: 20, flex: 1,
              overflow: "auto", maxHeight: 280,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(26,26,46,0.5)", marginBottom: 14,
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
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(26,26,46,0.3)", marginTop: 3,
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
              setChainToast("⛓️ Recording on-chain…");
              const speciesName = pet.personality_modifiers?.species_name || PET_SPECIES[pet.species] || "Pet";
              await parentRecordAdoption(pet.name, speciesName);
              setChainToast("✅ Saved on-chain");
              setTimeout(() => setChainToast(null), 3000);
            } catch (e: any) {
              console.error("[PETActivity] Full error:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
              const raw = (e?.shortMessage || e?.message || "").toLowerCase();
              const msg = raw.includes("insufficient") || raw.includes("bnb") || raw.includes("fund")
                ? "Not enough BNB"
                : raw.includes("reject") || raw.includes("denied") || raw.includes("user refused")
                ? "Transaction rejected"
                : raw.includes("chain") || raw.includes("network")
                ? "Switch to the BSC network"
                : `On-chain save failed: ${e?.shortMessage || e?.message || "unknown error"}`;
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
                <img src={pet.avatar_url || "/mascot.jpg"} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
                  Chat with {pet.name}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(26,26,46,0.4)" }}>
                  {pet.personality_type} · {MOOD_CONFIG[pet.current_mood || "neutral"]?.emoji} {MOOD_CONFIG[pet.current_mood || "neutral"]?.label}
                </div>
              </div>
              <button onClick={() => setShowChat(false)} aria-label="Close chat" style={{
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
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "rgba(26,26,46,0.35)", lineHeight: 1.8 }}>
                    Say hi to {pet.name}!<br/>
                    Your pet responds based on their personality and mood.
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                    {["Hey there! 👋", "How are you?", "I love you!", "Are you hungry?"].map(q => (
                      <button key={q} onClick={() => { setChatInput(q); }} style={{
                        background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)",
                        borderRadius: 20, padding: "5px 12px", cursor: "pointer",
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#b45309",
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
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.6,
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
                    padding: "12px 16px", borderRadius: 16, borderBottomLeftRadius: 4,
                    background: "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))",
                    border: "1px solid rgba(245,158,11,0.20)",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[0, 1, 2].map(d => (
                        <span key={d} className="ai-typing-dot" style={{
                          background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
                          animationDelay: `${d * 0.18}s`,
                        }} />
                      ))}
                    </div>
                    <span style={{
                      fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
                      fontWeight: 600, color: "#b45309",
                    }}>{pet.name} is thinking</span>
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
                disabled={chatLoading}
                autoFocus
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.08)", outline: "none",
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 13,
                  background: chatLoading ? "rgba(0,0,0,0.04)" : "white",
                  color: "#1a1a2e",
                }}
              />
              <button
                onClick={handleChat}
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  padding: "10px 18px", borderRadius: 12, border: "none",
                  background: chatInput.trim() ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(0,0,0,0.04)",
                  color: chatInput.trim() ? "white" : "rgba(26,26,46,0.25)",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
                  cursor: chatInput.trim() ? "pointer" : "default",
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paywall modal — opens whenever any paid action returns 402 */}
      <PaywallModal info={paywall} onClose={() => setPaywall(null)} />
    </div>
  );
}

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
import WardrobeCard from "@/components/WardrobeCard";
import MemoryJournal from "@/components/MemoryJournal";
import ExpressionPack from "@/components/ExpressionPack";
import Icon from "@/components/Icon";
import { moodToExpressionKey } from "@/lib/moodPortraits";

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
  { type: "talk",  label: "Talk",  icon: "💬", color: "#9E72E8",
    desc: "Memory grows. Bond unlocks chat depth.",            minLevel: 1, purpose: "GROW" },
  { type: "pet",   label: "Pet",   icon: "🤚", color: "#f472b6",
    desc: "Show affection · bond +",                           minLevel: 1, purpose: "BOND" },
  { type: "walk",  label: "Walk",  icon: "🚶", color: "#BE4F28",
    desc: "Recover energy. Unlock at Lv.3.",                   minLevel: 3, purpose: "RESTORE" },
  { type: "train", label: "Train", icon: "🎓", color: "#f97316",
    desc: "Earn XP fast. Unlock at Lv.5.",                     minLevel: 5, purpose: "GROW" },
];

const MOOD_CONFIG: any = {
  ecstatic: { emoji: "🤩", color: "#C8932F", label: "Ecstatic" },
  happy: { emoji: "😊", color: "#4ade80", label: "Happy" },
  neutral: { emoji: "😐", color: "#94a3b8", label: "Neutral" },
  sad: { emoji: "😢", color: "#60a5fa", label: "Sad" },
  exhausted: { emoji: "😴", color: "#9E72E8", label: "Exhausted" },
  starving: { emoji: "🤤", color: "#f97316", label: "Starving" },
  grumpy: { emoji: "😤", color: "#f87171", label: "Grumpy" },
  tired: { emoji: "😪", color: "#a78bfa", label: "Tired" },
  hungry: { emoji: "😋", color: "#BE4F28", label: "Hungry" },
};

function bondTier(b: number): string {
  if (b >= 100) return "Soulmate";
  if (b >= 75) return "Best Friend";
  if (b >= 50) return "Close Friend";
  if (b >= 25) return "Friend";
  return "Stranger";
}

// Short, human reason for the current mood, derived from the most pressing stat.
function moodReason(pet: any): string {
  if (pet.hunger >= 80) return "hasn't eaten in a while";
  if (pet.energy < 15) return "running low on energy";
  if (pet.happiness < 30) return "could use some company";
  if (pet.happiness >= 80 && pet.energy >= 50 && pet.hunger < 40) return "thriving right now";
  if (pet.hunger >= 60) return "getting a little hungry";
  if (pet.energy < 35) return "a bit tired";
  return "doing just fine";
}

// localStorage key for the per-pet, per-(local)-day care checklist.
function careDayKey(pid: number): string {
  const d = new Date();
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `aipet_care_${pid}_${local}`;
}

// Ambient "mood made visible" — emotes that drift up around the portrait so the
// fixed birth image still reads as a living, feeling creature.
const MOOD_EMOTE: Record<string, { emote: string; count: number }> = {
  ecstatic:  { emote: "✨", count: 3 },
  happy:     { emote: "💖", count: 2 },
  neutral:   { emote: "·",  count: 0 },
  sad:       { emote: "💧", count: 1 },
  exhausted: { emote: "💤", count: 2 },
  starving:  { emote: "💧", count: 2 },
  grumpy:    { emote: "💢", count: 2 },
  tired:     { emote: "💤", count: 1 },
  hungry:    { emote: "🍖", count: 1 },
};

// One-shot reaction the portrait plays when you care for it (type → motion + burst).
const REACTION_CFG: Record<string, { anim: string; burst: string }> = {
  feed:  { anim: "petReactBounce", burst: "🍖" },
  play:  { anim: "petReactBounce", burst: "🎉" },
  pet:   { anim: "petReactWiggle", burst: "💖" },
  talk:  { anim: "petReactWiggle", burst: "💬" },
  walk:  { anim: "petReactBounce", burst: "🐾" },
  train: { anim: "petReactWiggle", burst: "⭐" },
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
        <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A", display: "flex", alignItems: "center", gap: 4 }}>
          {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
          {label}
        </span>
        <span style={{
          fontFamily: "var(--ed-m)", fontSize: 12, color,
          animation: isLow ? "pulse 1.5s ease-in-out infinite" : "none",
        }}>
          {displayValue}/{max}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(33,26,18,0.08)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          width: `${pct}%`,
          transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
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

  // MANUAL fallback: best-effort parse of name/species/personality from the
  // user's chat turns, so "Just create my pet" works even when the LLM never
  // emitted [PET_READY] (Grok down/slow/untagged). The server backfills any
  // remaining defaults; this just seeds whatever we can cheaply infer.
  const inferPetDataFromChat = (): { name: string; species_name: string; personality: string; custom_traits: string } => {
    const userTurns = chatMessages.filter(m => m.role === "user").map(m => m.text);
    const joined = userTurns.join(" ");
    const PERSONALITIES = ["friendly", "playful", "shy", "brave", "lazy", "curious", "mischievous", "gentle", "adventurous", "dramatic", "wise", "sassy"];
    const personality = PERSONALITIES.find(p => joined.toLowerCase().includes(p)) || "";
    // First user turn is the most likely to carry a name/species description.
    const custom_traits = userTurns[0] ? userTurns[0].slice(0, 200) : "";
    return { name: "", species_name: "", personality, custom_traits };
  };

  const handleAdopt = async (manual = false) => {
    // In manual mode we proceed even without petData — the server fills defaults.
    if (creating) return;
    if (!manual && !petData) return;
    const effectiveData = petData || (manual ? inferPetDataFromChat() : null);
    if (!effectiveData) return;
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
        const speciesName = effectiveData.species_name || "Pet";
        await parentRecordAdoption(effectiveData.name || "Buddy", speciesName);
      }

      // Step 3: Wallet signature
      const { message: signedMessage, signature } = await signAction(
        wagmiConfig,
        `Adopt pet: ${effectiveData.name || "Buddy"} (${effectiveData.species_name || "Pet"})`,
      );

      // Step 4: Create pet in DB
      const res = await fetch("/api/pets/adopt-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ messages: chatMessages, action: "create", petData: effectiveData, manual, signedMessage, signature }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create pet");
      }
      const pet = await res.json();

      // Step 5: Generate avatar (use the server-created pet's resolved fields,
      // since manual fallback may have backfilled name/personality on the server)
      try {
        const avatarRes = await api.pets.generateAvatar(
          0,
          pet.personality_type || effectiveData.personality,
          effectiveData.species_name,
          effectiveData.custom_traits,
        );
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
          background: "#FBF6EC", borderRadius: 24, width: 420, maxWidth: "95vw",
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))", animation: "slideIn 0.3s ease-out",
          padding: 32, textAlign: "center",
        }}>
          <div style={{ marginBottom: 16, lineHeight: 0 }}><Icon name="paw" size={48} /></div>
          <h3 style={{ fontFamily: "var(--ed-disp)", fontSize: 22, fontWeight: 800, color: "#211A12", margin: "0 0 6px" }}>
            Adopt a Pet
          </h3>
          <p style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#7A6E5A", margin: "0 0 28px" }}>
            Choose how you'd like to create your companion
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => setMode("chat")} style={{
              padding: "18px 24px", borderRadius: 16,
              background: "rgba(107,79,160,0.06)",
              border: "1px solid rgba(107,79,160,0.2)", cursor: "pointer",
              textAlign: "left", transition: "all 0.2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 44, textAlign: "center", lineHeight: 0 }}><Icon name="sparkling" size={28} /></div>
                <div>
                  <div style={{ fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 700, color: "#211A12" }}>
                    Create with AI
                  </div>
                  <div style={{ fontFamily: "var(--ed-body)", fontSize: 12, color: "#7A6E5A", marginTop: 2 }}>
                    Chat with AI to design your dream pet from scratch
                  </div>
                </div>
              </div>
            </button>

            <button onClick={() => setMode("upload")} style={{
              padding: "18px 24px", borderRadius: 16,
              background: "rgba(190,79,40,0.06)",
              border: "1px solid rgba(190,79,40,0.2)", cursor: "pointer",
              textAlign: "left", transition: "all 0.2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 44, textAlign: "center", display: "flex", justifyContent: "center" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#BE4F28" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
                    <circle cx="12" cy="13" r="3.2" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 700, color: "#211A12" }}>
                    Upload My Pet's Photo
                  </div>
                  <div style={{ fontFamily: "var(--ed-body)", fontSize: 12, color: "#7A6E5A", marginTop: 2 }}>
                    Use a real photo of your pet as their avatar
                  </div>
                </div>
              </div>
            </button>
          </div>

          <button onClick={onClose} style={{
            marginTop: 20, background: "none", border: "none", cursor: "pointer",
            fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E",
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
          background: "#FBF6EC", borderRadius: 24, width: 440, maxWidth: "95vw", maxHeight: "90vh",
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))", animation: "slideIn 0.3s ease-out",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "18px 24px", borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            background: "rgba(190,79,40,0.06)",
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          }}>
            <button onClick={() => setMode("choose")} style={{
              background: "rgba(33,26,18,0.05)", border: "none", borderRadius: 8,
              width: 32, height: 32, cursor: "pointer", fontSize: 14, color: "#7A6E5A",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>←</button>
            <div>
              <h3 style={{ fontFamily: "var(--ed-disp)", fontSize: 18, fontWeight: 700, color: "#211A12", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#BE4F28" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
                  <circle cx="12" cy="13" r="3.2" />
                </svg>
                Upload Pet Photo
              </h3>
            </div>
          </div>

          {/* Form */}
          <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Photo Upload */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: uploadPreview ? "none" : "2px dashed rgba(190,79,40,0.3)",
                borderRadius: 16, padding: uploadPreview ? 16 : 32,
                cursor: "pointer", textAlign: "center",
                background: uploadPreview ? "transparent" : "rgba(190,79,40,0.04)",
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
                  <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#BE4F28" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
                      <circle cx="12" cy="13" r="3.2" />
                    </svg>
                  </div>
                  <div style={{ fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 600, color: "#211A12" }}>
                    Tap to upload your pet's photo
                  </div>
                  <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", marginTop: 4 }}>
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
                fontFamily: "var(--ed-body)", textAlign: "center",
              }}>
                {adoptError}
              </div>
            )}

            {/* Name */}
            <div>
              <label style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 600, color: "#7A6E5A", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Pet Name *
              </label>
              <input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="What's your pet's name?"
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                  background: "#F5EFE2",
                  fontFamily: "var(--ed-body)", fontSize: 15, fontWeight: 600, color: "#211A12",
                  outline: "none", marginTop: 6, boxSizing: "border-box",
                }}
              />
            </div>

            {/* Species */}
            <div>
              <label style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 600, color: "#7A6E5A", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Species
              </label>
              <input value={uploadSpecies} onChange={e => setUploadSpecies(e.target.value)} placeholder="e.g. Golden Retriever, Persian Cat, Dragon..."
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                  background: "#F5EFE2",
                  fontFamily: "var(--ed-body)", fontSize: 14, color: "#211A12",
                  outline: "none", marginTop: 6, boxSizing: "border-box",
                }}
              />
            </div>

            {/* Personality */}
            <div>
              <label style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 600, color: "#7A6E5A", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Personality
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {PERS.map(p => (
                  <button key={p.id} onClick={() => setUploadPersonality(p.id)} style={{
                    padding: "6px 12px", borderRadius: 20, fontSize: 12, fontFamily: "var(--ed-body)",
                    border: uploadPersonality === p.id ? "1px solid #BE4F28" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                    background: uploadPersonality === p.id ? "rgba(190,79,40,0.1)" : "rgba(33,26,18,0.03)",
                    color: uploadPersonality === p.id ? "#9A4E1E" : "#5C5140",
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
          <div style={{ padding: "16px 24px", borderTop: "1px solid var(--ed-hair, rgba(33,26,18,.13))", flexShrink: 0 }}>
            <button
              onClick={handleUploadAdopt}
              disabled={!uploadName.trim() || !uploadFile || creating}
              style={{
                width: "100%", padding: "14px", borderRadius: 14, border: "none", cursor: "pointer",
                background: uploadName.trim() && uploadFile
                  ? "linear-gradient(180deg,#F49B2A,#E27D0C)" : "rgba(33,26,18,0.06)",
                color: uploadName.trim() && uploadFile ? "#FFF8EE" : "#9A7B4E",
                fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 700,
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
  // Manual escape hatch: once the user has had a couple of exchanges but the LLM
  // still hasn't produced a ready-to-adopt pet (Grok slow / down / never tagged),
  // surface a "Just create my pet" affordance so they're never dead-ended.
  const userTurnCount = chatMessages.filter(m => m.role === "user").length;
  const showManualCreate = !petData && !creating && userTurnCount >= 2;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)",
    }} onClick={closeIfIdle}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#FBF6EC",
        borderRadius: 24, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        width: 480, maxWidth: "95vw", maxHeight: "85vh",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        animation: "slideIn 0.3s ease-out",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 24px", borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          background: "rgba(107,79,160,0.05)",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <button onClick={() => setMode("choose")} style={{
            background: "rgba(33,26,18,0.05)", border: "none", borderRadius: 8,
            width: 32, height: 32, cursor: "pointer", fontSize: 14, color: "#7A6E5A",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 12, fontFamily: "var(--ed-m)",
              letterSpacing: "0.14em", color: "#6B4FA0", marginBottom: 2,
              fontWeight: 800, textTransform: "uppercase",
            }}>ADOPTION · CHAT WITH AI</div>
            <h3 style={{ fontFamily: "var(--ed-disp)", fontSize: 22, fontWeight: 800, color: "#211A12", margin: 0, letterSpacing: "-0.015em" }}>
              Tell us about your dream pet
            </h3>
            <p style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", margin: "4px 0 0", fontWeight: 500 }}>
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
                  background: "#6B4FA0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, flexShrink: 0,
                }}>🤖</div>
              )}
              <div style={{
                maxWidth: "78%", padding: "12px 16px",
                borderRadius: msg.role === "user" ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
                background: msg.role === "user"
                  ? "#6B4FA0"
                  : "#F5EFE2",
                color: msg.role === "user" ? "#FFF8EE" : "#211A12",
                fontFamily: "var(--ed-body)", fontSize: 15, lineHeight: 1.55,
                border: msg.role === "user" ? "none" : "1px solid rgba(107,79,160,0.16)",
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
                background: "#F5EFE2",
                border: "1px solid rgba(107,79,160,0.18)",
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
                  fontFamily: "var(--ed-body)",
                  fontSize: 14, fontWeight: 600,
                  color: "#6B4FA0", letterSpacing: "0.01em",
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
              background: "rgba(107,79,160,0.06)",
              border: "1px solid rgba(107,79,160,0.2)",
              animation: "slideIn 0.3s ease-out",
            }}>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "#6B4FA0", marginBottom: 10 }}>
                ✨ YOUR NEW COMPANION
              </div>
              <div style={{ fontFamily: "var(--ed-disp)", fontSize: 24, fontWeight: 800, color: "#211A12", marginBottom: 4, letterSpacing: "-0.02em" }}>
                {petData.name}
              </div>
              <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#7A6E5A", marginBottom: 10, fontWeight: 500 }}>
                {petData.species_name}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontFamily: "var(--ed-m)", background: "rgba(107,79,160,0.12)", color: "#6B4FA0", fontWeight: 600 }}>
                  {petData.personality}
                </span>
              </div>
              {petData.custom_traits && (
                <div style={{ fontFamily: "var(--ed-body)", fontSize: 12, color: "#7A6E5A", marginTop: 6, fontStyle: "italic" }}>
                  "{petData.custom_traits}"
                </div>
              )}
              <button onClick={() => handleAdopt(false)} disabled={creating} style={{
                width: "100%", marginTop: 16, padding: "13px", borderRadius: 14, border: "none", cursor: "pointer",
                background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
                color: "#FFF8EE", fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 700,
                transition: "all 0.2s",
              }}>
                {creating ? "Generating avatar..." : "🐣 Adopt!"}
              </button>
              {adoptError && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 8, textAlign: "center", fontWeight: 600 }}>{adoptError}</div>}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Manual create fallback — never dead-end if the AI hasn't finalized */}
        {showManualCreate && (
          <div style={{ padding: "0 20px 8px", flexShrink: 0 }}>
            <button onClick={() => handleAdopt(true)} disabled={creating} style={{
              width: "100%", padding: "11px", borderRadius: 12, cursor: creating ? "default" : "pointer",
              border: "1px solid rgba(107,79,160,0.3)", background: "rgba(107,79,160,0.06)",
              color: "#6B4FA0", fontFamily: "var(--ed-disp)", fontSize: 13.5, fontWeight: 700,
              transition: "all 0.2s",
            }}>
              {creating ? "Creating…" : "✨ Just create my pet"}
            </button>
            <div style={{ textAlign: "center", fontSize: 12, color: "#9A7B4E", marginTop: 5, fontFamily: "var(--ed-body)" }}>
              We'll use what you've told us so far — you can refine details anytime.
            </div>
            {adoptError && <div style={{ color: "#ef4444", fontSize: 12.5, marginTop: 6, textAlign: "center", fontWeight: 600 }}>{adoptError}</div>}
          </div>
        )}

        {/* Suggestions */}
        {showSuggestions && (
          <div style={{ padding: "0 20px 8px", display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
            {quickSuggestions.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s)} style={{
                padding: "6px 12px", borderRadius: 20, border: "1px solid rgba(107,79,160,0.2)",
                background: "rgba(107,79,160,0.06)", cursor: "pointer",
                fontFamily: "var(--ed-m)", fontSize: 12, color: "#6B4FA0",
                transition: "all 0.2s", whiteSpace: "nowrap",
              }}>{s}</button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: "12px 16px", borderTop: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          display: "flex", gap: 8, alignItems: "center", background: "rgba(33,26,18,0.02)", flexShrink: 0,
        }}>
          <input
            value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput); } }}
            placeholder="Describe your dream pet..." autoFocus disabled={chatLoading || creating}
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 12, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              background: "#F5EFE2", fontFamily: "var(--ed-body)", fontSize: 14,
              outline: "none", color: "#211A12",
            }}
          />
          <button onClick={() => sendMessage(chatInput)} disabled={!chatInput.trim() || chatLoading || creating}
            style={{
              width: 40, height: 40, borderRadius: 12, border: "none",
              background: chatInput.trim() && !chatLoading ? "#6B4FA0" : "rgba(33,26,18,0.05)",
              color: chatInput.trim() && !chatLoading ? "#FFF8EE" : "#9A7B4E",
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

// Lightweight section divider — gives the (long) pet card visual hierarchy so
// the stacked cards read as grouped sections instead of a flat wall.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 24, marginBottom: 4, paddingTop: 14,
      borderTop: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700,
      letterSpacing: "0.14em", textTransform: "uppercase", color: "#7A6E5A",
    }}>{children}</div>
  );
}

function PetAvatar({ pet, mood, size = 80, reaction, equipped, moodPortraits }: any) {
  const moodCfg = MOOD_CONFIG[mood] || MOOD_CONFIG.neutral;
  // Real facial expression for this mood if the owner generated one; else the base identity image.
  const exprKey = moodToExpressionKey(mood);
  const moodImg = exprKey && moodPortraits ? moodPortraits[exprKey] : null;
  const imgSrc = moodImg || pet.avatar_url || "/mascot.jpg";
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  // One-shot reaction (portrait motion + burst emote); `n` nonce so repeats re-fire.
  const [react, setReact] = useState<{ anim: string; burst: string; n: number } | null>(null);
  const fireReact = (cfg: { anim: string; burst: string }) => setReact({ ...cfg, n: Date.now() });

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

  // Play a one-shot reaction whenever the parent signals a fresh interaction.
  useEffect(() => {
    if (!reaction?.type) return;
    fireReact(REACTION_CFG[reaction.type] || REACTION_CFG.pet);
  }, [reaction?.n]);

  // Auto-clear any reaction after it plays (covers care-driven and tap-driven).
  useEffect(() => {
    if (!react) return;
    const t = setTimeout(() => setReact(null), 900);
    return () => clearTimeout(t);
  }, [react?.n]);

  const moodAnim = MOOD_ANIMATIONS[mood] || "none";
  const moodEmote = MOOD_EMOTE[mood] || MOOD_EMOTE.neutral;

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
        @keyframes petBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        @keyframes emoteDrift {
          0% { opacity: 0; transform: translateY(2px) scale(0.5); }
          25% { opacity: 1; transform: translateY(-10px) scale(1); }
          80% { opacity: 0.85; transform: translateY(-28px) scale(1); }
          100% { opacity: 0; transform: translateY(-44px) scale(0.8); }
        }
        @keyframes petReactBounce {
          0% { transform: translateY(0) scale(1); }
          30% { transform: translateY(-13px) scale(1.07); }
          60% { transform: translateY(0) scale(0.96); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes petReactWiggle {
          0%, 100% { transform: rotate(0); }
          20% { transform: rotate(-8deg); }
          60% { transform: rotate(8deg); }
          85% { transform: rotate(-3deg); }
        }
        @keyframes burstPop {
          0% { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.3); }
          30% { opacity: 1; transform: translateX(-50%) translateY(-14px) scale(1.3); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-44px) scale(1); }
        }
      `}</style>
      {/* Mood speech bubble */}
      {bubbleVisible && bubbleText && (
        <div style={{
          position: "absolute", top: -28, left: "50%", transform: "translateX(-50%)",
          background: "#FBF6EC", borderRadius: 8, padding: "3px 8px",
          fontFamily: "var(--ed-m)", fontSize: 12, color: "#5C5140",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none",
          animation: "bubbleFade 3s ease-in-out forwards",
        }}>
          {bubbleText}
        </div>
      )}
      {/* Ambient mood emotes — rise from just above the head so the fixed image
          reads as a living, feeling creature. Outer div centers (transform), inner
          div drifts (so the animation's transform doesn't fight the centering). */}
      {moodEmote.count > 0 && Array.from({ length: moodEmote.count }).map((_, i) => {
        const offset = (i - (moodEmote.count - 1) / 2) * 17; // symmetric spread, %
        return (
          <div key={`${mood}-${i}`} style={{
            position: "absolute", top: -size * 0.06, left: `calc(50% + ${offset}%)`,
            transform: "translateX(-50%)", zIndex: 9, pointerEvents: "none",
          }}>
            <div style={{
              fontSize: size * 0.2,
              animation: `emoteDrift ${2.3 + i * 0.45}s ease-out ${i * 0.55}s infinite`,
            }}>
              {moodEmote.emote}
            </div>
          </div>
        );
      })}
      {/* Care-reaction burst */}
      {react && (
        <div style={{
          position: "absolute", top: -6, left: "50%", fontSize: size * 0.34,
          zIndex: 11, pointerEvents: "none", animation: "burstPop 0.9s ease-out forwards",
        }}>
          {react.burst}
        </div>
      )}
      <div
        onClick={() => fireReact({ anim: "petReactWiggle", burst: "💖" })}
        title="boop"
        style={{
        width: size, height: size, borderRadius: size * 0.3,
        background: "rgba(33,26,18,0.03)",
        border: `1px solid ${moodCfg.color}30`,
        overflow: "hidden", cursor: "pointer",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        transition: "all 0.5s ease",
        animation: react ? `${react.anim} 0.85s ease-in-out` : "petFloat 6s ease-in-out infinite",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ width: "100%", height: "100%", animation: "petBreathe 3.4s ease-in-out infinite" }}>
          <img src={imgSrc} alt={pet.name} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "opacity 0.3s" }} />
        </div>
      </div>
      {/* Equipped cosmetics — accessory rests on the head, cosmetic glows in a corner */}
      {equipped?.accessory && (
        <div style={{
          position: "absolute", top: -size * 0.16, left: "50%",
          transform: "translateX(-50%) rotate(-6deg)", fontSize: size * 0.32,
          zIndex: 8, pointerEvents: "none", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.25))",
        }}>{equipped.accessory.icon}</div>
      )}
      {equipped?.cosmetic && (
        <div style={{
          position: "absolute", bottom: -2, left: -4, fontSize: size * 0.26,
          zIndex: 8, pointerEvents: "none", animation: "petBreathe 3s ease-in-out infinite",
        }}>{equipped.cosmetic.icon}</div>
      )}
      <div style={{
        position: "absolute", bottom: -4, right: -4,
        fontSize: size * 0.25, background: "#FBF6EC",
        borderRadius: "50%", width: size * 0.35, height: size * 0.35,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${moodCfg.color}30`,
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
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

// `compact` hides the parts MyPetEditorial already renders (greeting header,
// stat bars, care/interaction row) so the classic tools (wardrobe / memories /
// evolution) can live inside the editorial modal without a duplicate care loop.
// `initialShowCreate` opens the adopt flow immediately (the editorial "+ Adopt"
// chip). Defaults preserve the existing full-page behavior exactly.
export default function PetProfile({ compact = false, initialShowCreate = false }: { compact?: boolean; initialShowCreate?: boolean } = {}) {
  const [pets, setPets] = useState<any[]>([]);
  const [activePet, setActivePet] = useState<any>(null);
  const [petStatus, setPetStatus] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(initialShowCreate);
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
  // Inline pet rename (replaces the old native window.prompt).
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
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
  // Floating "+8💖" stat-delta pops shown briefly after a care interaction.
  const [statPops, setStatPops] = useState<Array<{ id: number; delta: number; color: string; icon: string }>>([]);
  // One-shot signal to make the pet portrait react (bounce/wiggle + burst emote).
  const [petReaction, setPetReaction] = useState<{ type: string; n: number } | null>(null);
  // Equipped cosmetics for the portrait overlay (slot → { icon, key }).
  const [equipped, setEquipped] = useState<Record<string, { icon: string; key: string; category: string }>>({});
  // Generated mood-expression portraits (expression key → image url).
  const [moodPortraits, setMoodPortraits] = useState<Record<string, string>>({});
  // Care actions completed today (client-side per-day tracker, localStorage-backed).
  const [careToday, setCareToday] = useState<string[]>([]);
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

  // Load today's completed care actions for the active pet (resets daily).
  useEffect(() => {
    if (!activePet?.id) { setCareToday([]); return; }
    try { setCareToday(JSON.parse(localStorage.getItem(careDayKey(activePet.id)) || "[]")); }
    catch { setCareToday([]); }
  }, [activePet?.id]);

  // Equipped cosmetics for the portrait overlay (refetched after wardrobe changes).
  const loadEquipped = (pid: number) => {
    fetch(`/api/pets/${pid}/wardrobe`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setEquipped(d.equipped || {}); })
      .catch(() => {});
  };
  useEffect(() => {
    if (activePet?.id) loadEquipped(activePet.id); else setEquipped({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePet?.id]);

  // Generated mood-expression portraits (refetched after the user generates a pack).
  const loadMoodPortraits = (pid: number) => {
    fetch(`/api/pets/${pid}/mood-portrait`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setMoodPortraits(d.moodPortraits || {}); })
      .catch(() => {});
  };
  useEffect(() => {
    if (activePet?.id) loadMoodPortraits(activePet.id); else setMoodPortraits({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const petId = activePet.id; // snapshot: guard async UI writes against a mid-flight pet switch
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
      // If the user switched pets while this interaction was in flight, don't
      // paint pet A's reply/combo/request into pet B's view.
      if (activePetIdRef.current === petId) {
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

        // Floating stat-delta pops — surface the reward of caring, animated.
        const fx = result.interaction?.effects || {};
        const popDefs: Array<{ key: string; color: string; icon: string }> = [
          { key: "happiness", color: "#F0589E", icon: "💖" },
          { key: "bond", color: "#9E72E8", icon: "🤝" },
          { key: "experience", color: "#5C8A4E", icon: "✨" },
          { key: "energy", color: "#3E8FE0", icon: "⚡" },
          { key: "hunger", color: "#BE4F28", icon: "🍖" },
        ];
        const pops = popDefs
          .filter((d) => typeof fx[d.key] === "number" && fx[d.key] !== 0)
          .map((d, i) => ({ id: Date.now() + i, delta: fx[d.key] as number, color: d.color, icon: d.icon }));
        if (pops.length) {
          setStatPops(pops);
          setTimeout(() => setStatPops([]), 1600);
        }
        // Make the portrait itself react to the care.
        setPetReaction({ type, n: Date.now() });
      }

      // Mark this care action done for today (client-side daily checklist).
      try {
        const k = careDayKey(petId);
        const done: string[] = JSON.parse(localStorage.getItem(k) || "[]");
        if (!done.includes(type)) {
          const next = [...done, type];
          localStorage.setItem(k, JSON.stringify(next));
          if (activePetIdRef.current === petId) setCareToday(next);
        }
      } catch {}

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
      if (activePetIdRef.current === petId) {
        setLastResponse({
          response_text: blocked && /slow down|too fast|429/i.test(e.message)
            ? `${activePet.name} needs a moment — slow down 🐾`
            : (e.message || "Interaction failed"),
          stat_changes: {},
          blocked,
        });
        setResponseAnim(true);
      }
    }
    // Clear immediately so the button state is honest; the server's own 1500ms
    // cooldown (429) is now surfaced gracefully above instead of as a fake reply.
    setInteracting(null);
  };

  const handleChat = async (override?: string) => {
    const msg = (override ?? chatInput).trim();
    if (!activePet || !msg || chatLoading) return;
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
          width: 40, height: 40, border: "2px solid rgba(190,79,40,0.2)",
          borderTopColor: "#BE4F28", borderRadius: "50%",
          animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E" }}>Loading your pets...</div>
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
        <div style={{ marginBottom: 20, lineHeight: 0, animation: "eggBounce 2s ease-in-out infinite" }}><Icon name="paw" size={80} /></div>
        <h2 style={{ fontFamily: "var(--ed-disp)", fontSize: 30, color: "#211A12", marginBottom: 10 }}>
          No Pets Yet
        </h2>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", marginBottom: 8, lineHeight: 1.8 }}>
          Adopt your first AI pet! They&apos;ll grow, learn your patterns, and develop a unique personality over time.
        </p>
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", marginBottom: 32, lineHeight: 1.7 }}>
          Feed them, play with them, talk to them — every interaction matters.
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          background: "linear-gradient(180deg,#F49B2A,#E27D0C)", border: "none", borderRadius: 14,
          padding: "15px 40px", fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 600, color: "#FFF8EE", cursor: "pointer",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
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
      <div style={{ padding: "140px 40px", textAlign: "center", color: "#7A6E5A" }}>
        Loading...
      </div>
    );
  }
  const mood = pet.current_mood || "neutral";
  const moodCfg = MOOD_CONFIG[mood] || MOOD_CONFIG.neutral;

  return (
    <div style={{ padding: "16px", maxWidth: 960, margin: "0 auto", paddingTop: compact ? 12 : 80 }}>
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
            background: "#FBF6EC",
            borderRadius: 20,
            padding: "40px 60px",
            textAlign: "center",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#x26d3;&#xfe0f;</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#211A12", fontFamily: "var(--ed-disp)" }}>{chainToast}</div>
            <div style={{ fontSize: 14, color: "#7A6E5A", marginTop: 8, fontFamily: "var(--ed-body)" }}>{chainToast?.startsWith("❌") ? "Dismiss the wallet to clear this" : "Confirm in your wallet"}</div>
          </div>
        </div>
      )}
      {errorToast && (
        <div style={{
          position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, background: "#211A12", color: "#FFF8EE",
          padding: "14px 28px", borderRadius: 14,
          fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 600,
          boxShadow: "var(--ed-shadow-dark, 0 16px 30px -14px rgba(33,26,18,.7))",
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
          background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
          color: "#FFF8EE",
          padding: "18px 32px", borderRadius: 18,
          fontFamily: "var(--ed-disp)",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          animation: "comboBurst 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
          textAlign: "center",
          minWidth: 280,
        }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>{comboToast.emoji}</div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.85, marginBottom: 4 }}>
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
      {/* Floating stat-delta pops after a care interaction */}
      {statPops.length > 0 && (
        <div style={{
          position: "fixed", top: "30%", left: "50%", transform: "translateX(-50%)",
          zIndex: 9998, display: "flex", gap: 16, pointerEvents: "none",
        }}>
          {statPops.map((p, i) => (
            <div key={p.id} style={{
              fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 24,
              color: p.color, textShadow: "0 2px 10px rgba(0,0,0,0.22)",
              animation: "floatUpPop 1.5s ease-out forwards", animationDelay: `${i * 70}ms`,
            }}>
              {p.delta > 0 ? "+" : ""}{p.delta}{p.icon}
            </div>
          ))}
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
        @keyframes floatUpPop {
          0% { opacity: 0; transform: translateY(12px) scale(0.7); }
          25% { opacity: 1; transform: translateY(-4px) scale(1.12); }
          60% { opacity: 1; transform: translateY(-24px) scale(1); }
          100% { opacity: 0; transform: translateY(-58px) scale(0.95); }
        }
      `}</style>

      {/* Pet selector bar */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 24, alignItems: "center",
        padding: "4px", background: "rgba(33,26,18,0.03)", borderRadius: 14,
        overflowX: "auto", flexWrap: "nowrap",
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      }}>
        {pets.map((p: any) => (
          <button key={p.id} onClick={() => selectPet(p)} style={{
            background: activePet?.id === p.id ? "rgba(190,79,40,0.1)" : "transparent",
            border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s",
          }}>
            <PetThumb pet={p} />
            <div style={{ textAlign: "left" }}>
              <div style={{
                fontFamily: "var(--ed-disp)", fontSize: 13, fontWeight: 600,
                color: activePet?.id === p.id ? "#9A4E1E" : "#5C5140",
              }}>
                {p.name}
              </div>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E" }}>
                Lv.{p.level} {getSpeciesName(p)}
              </div>
            </div>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {pets.length < petSlots ? (
          <button onClick={() => setShowCreate(true)} style={{
            background: "rgba(33,26,18,0.03)", border: "1px dashed var(--ed-hair, rgba(33,26,18,.13))",
            borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontFamily: "var(--ed-m)", fontSize: 12,
            color: "#9A7B4E", transition: "all 0.2s",
          }}>+ Adopt New</button>
        ) : petSlots < 5 ? (
          <button onClick={handleUnlockSlot} disabled={unlockingSlot} style={{
            background: "rgba(190,79,40,0.08)", border: "1px dashed rgba(190,79,40,0.3)",
            borderRadius: 10, padding: "10px 18px", cursor: unlockingSlot ? "wait" : "pointer",
            fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A4E1E", transition: "all 0.2s",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <Icon name="lock" size={13} /> Unlock Slot ({slotPrices[petSlots] || 500} credits)
          </button>
        ) : null}
        <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E" }}>
          {pets.length}/{petSlots} slots
        </span>
        {balance !== null && (<>
          <div style={{
            fontFamily: "var(--ed-m)", fontSize: 12, padding: "6px 14px", borderRadius: 10,
            background: "rgba(190,79,40,0.06)",
            border: "1px solid rgba(190,79,40,0.2)",
            color: "#9A4E1E", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
          }} onClick={() => { const el = document.querySelector(".pricing-root"); if (el) el.scrollIntoView({ behavior: "smooth" }); }}>
            <Icon name="coin" size={13} /> {balance.toLocaleString()} credits
          </div>
        </>)}
      </div>

      {/* Daily-rhythm greeting — time + mood aware, surfaces "while you were away". */}
      {!compact && (
        <PetGreeting
          petId={pet.id}
          petName={pet.name}
          mood={mood}
          accent={moodCfg.color}
          lastInteractionAt={pet.last_interaction_at}
        />
      )}

      <div className="desktop-grid" style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20 }}>
        {/* Left: Pet card */}
        <div style={{
          background: "#FBF6EC",
          borderRadius: 20, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", padding: 28,
          position: "relative", overflow: "hidden",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        }}>
          <div style={{ textAlign: "center", marginBottom: 24, position: "relative" }}>
            <PetAvatar pet={pet} mood={mood} size={140} reaction={petReaction} equipped={equipped} moodPortraits={moodPortraits} />
            {/* If the pet still has the default species name ("Cat"/"Dog"…),
                surface a clear rename CTA. Generic names kill the emotional
                lock-in we're trying to build. */}
            {PET_SPECIES.includes(pet.name) && (
              <div style={{
                margin: "14px auto 0", maxWidth: 280,
                padding: "10px 14px",
                background: "rgba(107,79,160,0.08)",
                border: "1px solid rgba(107,79,160,0.30)",
                borderRadius: 12, textAlign: "center",
              }}>
                <div style={{ fontSize: 12, color: "#6B4FA0", fontWeight: 700, marginBottom: 6, fontFamily: "var(--ed-disp)" }}>
                  ✨ Give them a real name
                </div>
                {(() => {
                  const saveName = async () => {
                    const trimmed = nameInput.trim().slice(0, 20);
                    if (trimmed.length < 2) { showError("Pick a name with at least 2 letters."); return; }
                    setSavingName(true);
                    try {
                      const r = await fetch(`/api/pets/${pet.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                        body: JSON.stringify({ name: trimmed }),
                      });
                      if (!r.ok) { showError("Couldn't save — try again?"); setSavingName(false); return; }
                      setNaming(false);
                      setNameInput("");
                      await loadPetStatus(pet.id);
                      await loadPets();
                    } catch { showError("Network error"); }
                    setSavingName(false);
                  };
                  return naming ? (
                    <div>
                      <input
                        autoFocus
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setNaming(false); setNameInput(""); } }}
                        maxLength={20}
                        placeholder={`Name this ${pet.name.toLowerCase()}… (2–20 letters)`}
                        style={{
                          width: "100%", padding: "9px 12px", borderRadius: 9, marginBottom: 6,
                          border: "1px solid rgba(107,79,160,0.4)", outline: "none", boxSizing: "border-box",
                          background: "#F5EFE2",
                          fontFamily: "var(--ed-body)", fontSize: 14, color: "#211A12",
                        }}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="mp-btn-primary mp-lift"
                          onClick={saveName}
                          disabled={savingName || nameInput.trim().length < 2}
                          style={{
                            flex: 1, padding: "9px 16px", fontSize: 14,
                            background: "#6B4FA0", color: "#FFF8EE",
                            fontFamily: "var(--ed-disp)", fontWeight: 700, border: "none", borderRadius: 9,
                            opacity: savingName || nameInput.trim().length < 2 ? 0.55 : 1,
                            cursor: savingName ? "wait" : "pointer",
                          }}
                        >{savingName ? "Saving…" : "Save name"}</button>
                        <button
                          onClick={() => { setNaming(false); setNameInput(""); }}
                          style={{
                            padding: "9px 14px", borderRadius: 9, fontSize: 13, cursor: "pointer",
                            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", background: "#F5EFE2", color: "#5C5140",
                            fontFamily: "var(--ed-body)", fontWeight: 600,
                          }}
                        >Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="mp-btn-primary mp-lift"
                      onClick={() => { setNameInput(""); setNaming(true); }}
                      style={{
                        width: "100%", padding: "10px 16px", fontSize: 14,
                        background: "#6B4FA0", color: "#FFF8EE",
                        fontFamily: "var(--ed-disp)", fontWeight: 700, border: "none", borderRadius: 9,
                      }}
                    >Name them →</button>
                  );
                })()}
              </div>
            )}
            <h2 style={{
              fontFamily: "var(--ed-disp)", fontSize: 32, color: "#211A12",
              margin: "18px 0 10px", fontWeight: 800, letterSpacing: "-0.025em",
            }}>
              {pet.name}
            </h2>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{
                fontFamily: "var(--ed-m)", fontSize: 12, padding: "3px 10px", borderRadius: 10,
                background: "rgba(190,79,40,0.1)", color: "#9A4E1E",
                border: "1px solid rgba(190,79,40,0.2)",
              }}>
                Lv.{pet.level}
              </span>
              <span style={{
                fontFamily: "var(--ed-m)", fontSize: 12, padding: "3px 10px", borderRadius: 10,
                background: "rgba(107,79,160,0.08)", color: "#6B4FA0",
                border: "1px solid rgba(107,79,160,0.15)",
              }}>
                {pet.personality_type}
              </span>
              <span style={{
                fontFamily: "var(--ed-m)", fontSize: 12, padding: "3px 10px", borderRadius: 10,
                background: `${moodCfg.color}12`, color: moodCfg.color,
                border: `1px solid ${moodCfg.color}25`,
              }}>
                {moodCfg.emoji} {moodCfg.label}
              </span>
            </div>
            {/* Progression + mood context */}
            <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", fontFamily: "var(--ed-m)", fontSize: 12, color: "#5C5140" }}>
                <span>✨ {pet.experience % 100}/100 XP → Lv.{pet.level + 1}</span>
                <span>🤝 {bondTier(pet.bond_level)} · {pet.bond_level}/100</span>
              </div>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: moodCfg.color, opacity: 0.85 }}>
                {moodCfg.label} — {moodReason(pet)}
              </div>
            </div>
            <a
              href={`/card/${pet.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mp-lift"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12,
                padding: "8px 16px", borderRadius: 999, textDecoration: "none",
                background: "#211A12", color: "#FFF8EE",
                fontFamily: "var(--ed-disp)", fontSize: 13, fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <rect x="4" y="3" width="16" height="18" rx="2.5" />
                <path d="M12 8.2 13.9 12 12 15.8 10.1 12 12 8.2Z" fill="#fff" stroke="none" />
              </svg>
              Trading Card
            </a>
          </div>

          {/* Appearance description */}
          {pet.avatar_url && (
            <div style={{
              marginBottom: 12, padding: "8px 12px", borderRadius: 10,
              background: pet.appearance_desc ? "rgba(92,138,78,0.08)" : "rgba(190,79,40,0.08)",
              border: `1px solid ${pet.appearance_desc ? "rgba(92,138,78,0.2)" : "rgba(190,79,40,0.2)"}`,
            }}>
              {editingDesc ? (
                <div>
                  <input
                    value={descInput}
                    onChange={(e) => setDescInput(e.target.value)}
                    placeholder="e.g. small black chihuahua with big ears"
                    style={{
                      width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                      background: "#F5EFE2", color: "#211A12",
                      fontFamily: "var(--ed-m)", fontSize: 12, outline: "none", boxSizing: "border-box", marginBottom: 6,
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
                      background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE", fontFamily: "var(--ed-m)", fontSize: 12, cursor: "pointer",
                    }}>Save</button>
                    <button onClick={() => setEditingDesc(false)} style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                      background: "#F5EFE2", color: "#5C5140", fontFamily: "var(--ed-m)", fontSize: 12, cursor: "pointer",
                    }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => { setDescInput(pet.appearance_desc || ""); setEditingDesc(true); }}
                  style={{ cursor: "pointer" }}>
                  <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", marginBottom: 2 }}>
                    {pet.appearance_desc ? "APPEARANCE" : "⚠️ ADD APPEARANCE (required for AI generation)"}
                  </div>
                  <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: pet.appearance_desc ? "#5C5140" : "#9A4E1E" }}>
                    {pet.appearance_desc || "Tap to describe your pet's look"}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View toggle — hidden in compact mode (MyPetEditorial owns the stat rows) */}
          {!compact && (<>
          <div style={{ display: "flex", gap: 4, marginBottom: 14, padding: 3, borderRadius: 10, background: "rgba(33,26,18,0.05)" }}>
            {(["slots", "radar"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setStatsView(v)}
                style={{
                  flex: 1, padding: "6px 10px", borderRadius: 8,
                  background: statsView === v ? "#BE4F28" : "transparent",
                  border: "none", cursor: "pointer",
                  fontFamily: "var(--ed-disp)", fontSize: 12, fontWeight: 700,
                  color: statsView === v ? "#FFF8EE" : "#7A6E5A",
                  letterSpacing: "0.06em", textTransform: "uppercase",
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
                  { label: "Happy", value: pet.happiness, color: "#F0589E", icon: "💖" },
                  { label: "Energy", value: pet.energy, color: "#3E8FE0", icon: "⚡" },
                  { label: "Hunger", value: 100 - pet.hunger, color: "#BE4F28", icon: "🍖" },
                  { label: "Bond", value: pet.bond_level, color: "#9E72E8", icon: "🤝" },
                  { label: "EXP", value: Math.min(100, (pet.experience % 100)), color: "#5C8A4E", icon: "✨" },
                  { label: "Level", value: Math.min(100, pet.level * 5), color: "#C8932F", icon: "🌟" },
                ]}
              />
            </div>
          ) : (
            <div>
              <StatSlotBar label="Happy" value={pet.happiness} color="#F0589E" icon="💖" warning={pet.happiness < 30} />
              <StatSlotBar label="Energy" value={pet.energy} color="#3E8FE0" icon="⚡" warning={pet.energy < 15} />
              <StatSlotBar label="Hunger" value={pet.hunger} color="#BE4F28" icon="🍖" warning={pet.hunger >= 80} />
              <StatSlotBar label="Bond" value={pet.bond_level} color="#9E72E8" icon="🤝" />
              <StatSlotBar label="EXP" value={pet.experience % 100} max={100} color="#5C8A4E" icon="✨" />
            </div>
          )}
          </>)}

          {/* Combo collection */}
          {combosUnlocked.length > 0 && (
            <div style={{
              marginTop: 12, padding: "10px 12px", borderRadius: 10,
              background: "rgba(190,79,40,0.05)",
              border: "1px solid rgba(190,79,40,0.15)",
            }}>
              <div style={{ fontSize: 12, fontFamily: "var(--ed-m)", fontWeight: 700, color: "#7A6E5A", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                ✨ Combos Discovered
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {combosUnlocked.map((c) => (
                  <span key={c} style={{
                    fontSize: 12, padding: "3px 9px", borderRadius: 6,
                    background: "rgba(190,79,40,0.12)", color: "#9A4E1E",
                    fontFamily: "var(--ed-disp)", fontWeight: 700,
                  }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Daily care checklist — client-side per-day tracker of completed care actions */}
          {(() => {
            const careActions = INTERACTIONS.filter((i) => i.type !== "talk" && i.minLevel <= pet.level);
            const doneCount = careActions.filter((a) => careToday.includes(a.type)).length;
            const allDone = doneCount === careActions.length && careActions.length > 0;
            return (
              <div style={{
                marginTop: 12, padding: "10px 12px", borderRadius: 10,
                background: "rgba(92,138,78,0.06)", border: "1px solid rgba(92,138,78,0.18)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontFamily: "var(--ed-m)", fontWeight: 700, color: "#7A6E5A", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    ✅ Today&apos;s Care
                  </span>
                  <span style={{ fontSize: 12, fontFamily: "var(--ed-m)", fontWeight: 700, color: allDone ? "#5C8A4E" : "#9A7B4E" }}>
                    {doneCount}/{careActions.length}{allDone ? " · all done! 🎉" : ""}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {careActions.map((a) => {
                    const done = careToday.includes(a.type);
                    return (
                      <div key={a.type} style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 8,
                        background: done ? "rgba(92,138,78,0.16)" : "rgba(33,26,18,0.03)",
                        border: `1px solid ${done ? "rgba(92,138,78,0.3)" : "var(--ed-hair, rgba(33,26,18,.13))"}`,
                        opacity: done ? 1 : 0.65,
                      }}>
                        <span style={{ fontSize: 12 }}>{done ? "✓" : a.icon}</span>
                        <span style={{ fontSize: 12, fontFamily: "var(--ed-m)", fontWeight: 600, color: done ? "#5C8A4E" : "#5C5140" }}>{a.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <SectionLabel>Progress</SectionLabel>

          <div style={{
            marginTop: 8, padding: "10px 14px", borderRadius: 10,
            background: "rgba(33,26,18,0.03)", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E" }}>
              Total Interactions
            </span>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A4E1E", fontWeight: 600 }}>
              {pet.total_interactions}
            </span>
          </div>

          {/* Care Streak badge — surfaces multi-day consistent care.
              Hits a NFT auto-mint every 7 days (see lib/petclaw/nft-mint.ts). */}
          {(pet as any).care_streak > 0 && (
            <div style={{
              marginTop: 10, padding: "10px 14px", borderRadius: 10,
              background: `rgba(190,79,40,${Math.min(0.16, 0.05 + (pet as any).care_streak * 0.02)})`,
              border: `1px solid rgba(190,79,40,${Math.min(0.45, 0.15 + (pet as any).care_streak * 0.03)})`,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="fire" size={18} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#9A4E1E", letterSpacing: "-0.01em", fontFamily: "var(--ed-disp)" }}>
                    {(pet as any).care_streak}-day care streak
                  </div>
                  <div style={{ fontSize: 12, fontFamily: "var(--ed-m)", color: "rgba(154,78,30,0.75)", marginTop: 1 }}>
                    {(pet as any).care_streak % 7 === 0
                      ? "Memory NFT earned ✨ (mints at go-live)"
                      : `Next Memory NFT at day ${Math.ceil((pet as any).care_streak / 7) * 7}`}
                  </div>
                </div>
              </div>
              <div style={{
                fontSize: 12, padding: "3px 8px", borderRadius: 999,
                background: "rgba(154,78,30,0.12)", color: "#9A4E1E",
                fontFamily: "var(--ed-m)", fontWeight: 700, letterSpacing: "0.08em",
              }}>EARN</div>
            </div>
          )}

          {/* Achievements — milestones derived client-side from live pet stats */}
          {(() => {
            const ach = [
              { id: "first", icon: "paw", label: "First Bond", earned: pet.total_interactions >= 1, desc: "Meet your pet" },
              { id: "lv5", icon: "medal", label: "Rising Star", earned: pet.level >= 5, desc: "Reach Lv.5" },
              { id: "lv10", icon: "trophy", label: "Veteran", earned: pet.level >= 10, desc: "Reach Lv.10" },
              { id: "lv20", icon: "crown", label: "Elite", earned: pet.level >= 20, desc: "Reach Lv.20" },
              { id: "bond50", icon: "like", label: "Close Friends", earned: pet.bond_level >= 50, desc: "Bond 50+" },
              { id: "bond100", icon: "heart", label: "Soulmate", earned: pet.bond_level >= 100, desc: "Max bond" },
              { id: "evolve", icon: "sparkling", label: "Evolved", earned: ((pet as any).evolution_stage ?? 0) >= 1, desc: "Evolve once" },
              { id: "combo", icon: "diamond", label: "Combo Master", earned: combosUnlocked.length >= 3, desc: "3 combos" },
              { id: "streak7", icon: "fire", label: "Dedicated", earned: ((pet as any).care_streak ?? 0) >= 7, desc: "7-day streak" },
              { id: "social", icon: "chat", label: "Inseparable", earned: pet.total_interactions >= 50, desc: "50 interactions" },
            ];
            const earnedCount = ach.filter((a) => a.earned).length;
            return (
              <div style={{
                marginTop: 10, padding: "10px 12px", borderRadius: 10,
                background: "rgba(107,79,160,0.05)",
                border: "1px solid rgba(107,79,160,0.15)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontFamily: "var(--ed-m)", fontWeight: 700, color: "#7A6E5A", letterSpacing: "0.12em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon name="trophy" size={13} /> Achievements
                  </span>
                  <span style={{ fontSize: 12, fontFamily: "var(--ed-m)", fontWeight: 700, color: "#6B4FA0" }}>
                    {earnedCount}/{ach.length}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 6 }}>
                  {ach.map((a) => (
                    <div key={a.id} title={`${a.label} — ${a.desc}`} style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      padding: "7px 3px", borderRadius: 8, textAlign: "center",
                      background: a.earned ? "rgba(107,79,160,0.1)" : "rgba(33,26,18,0.03)",
                      border: `1px solid ${a.earned ? "rgba(107,79,160,0.25)" : "var(--ed-hair, rgba(33,26,18,.13))"}`,
                      filter: a.earned ? "none" : "grayscale(1)", opacity: a.earned ? 1 : 0.45,
                    }}>
                      <Icon name={a.icon} size={17} />
                      <span style={{ fontSize: 10, fontFamily: "var(--ed-m)", fontWeight: 700, color: a.earned ? "#6B4FA0" : "#7A6E5A", letterSpacing: "-0.02em", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {pet.id > 0 && <SectionLabel>Customize {pet.name}</SectionLabel>}

          {/* Expression Pack — generate real mood faces; portrait swaps by mood */}
          {pet.id > 0 && (
            <ExpressionPack pet={pet} petId={pet.id} moodPortraits={moodPortraits} onChange={() => loadMoodPortraits(pet.id)} />
          )}

          {/* Wardrobe — buy cute cosmetics with credits + wear them on the portrait */}
          {pet.id > 0 && (
            <WardrobeCard petId={pet.id} onChange={() => loadEquipped(pet.id)} />
          )}

          {/* Power Training + Battle are paused. The pet identity / memory /
              streak loop is the product; on-chain stat fighting was the wrong
              direction. Code is preserved for reference but hidden. */}

          {!showRelease ? (
            <button onClick={() => setShowRelease(true)} style={{
              marginTop: 10, width: "100%", padding: "8px", borderRadius: 8,
              background: "transparent", border: "1px solid rgba(220,38,38,0.1)",
              fontFamily: "var(--ed-m)", fontSize: 12, color: "rgba(220,38,38,0.5)",
              cursor: "pointer", transition: "all 0.2s",
            }}>
              Release {pet.name}
            </button>
          ) : (
            <div style={{
              marginTop: 10, padding: 12, borderRadius: 10,
              background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.15)",
            }}>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#dc2626", marginBottom: 8 }}>
                Release {pet.name}? This cannot be undone.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleRelease} disabled={releasing} style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: "none",
                  background: "#dc2626", color: "#FFF8EE", fontFamily: "var(--ed-m)",
                  fontSize: 12, fontWeight: 600, cursor: releasing ? "wait" : "pointer",
                }}>
                  {releasing ? "..." : "Confirm"}
                </button>
                <button onClick={() => setShowRelease(false)} style={{
                  flex: 1, padding: "8px", borderRadius: 8,
                  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", background: "#F5EFE2",
                  color: "#211A12", fontFamily: "var(--ed-m)", fontSize: 12,
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
          {/* Pet event request popup — hidden in compact mode (editorial REMEMBERS box owns it) */}
          {!compact && petRequest && petRequest.type && (
            <div style={{
              background: "rgba(190,79,40,0.08)",
              borderRadius: 16, border: "1px solid rgba(190,79,40,0.3)",
              padding: 16, position: "relative", overflow: "hidden",
              animation: "responseSlide 0.4s ease-out",
            }}>
              <div style={{
                position: "absolute", top: 8, right: 12,
                fontSize: 12, fontFamily: "var(--ed-m)", fontWeight: 700,
                color: "#9A4E1E", letterSpacing: "0.12em", textTransform: "uppercase",
                background: "rgba(190,79,40,0.15)", padding: "2px 8px", borderRadius: 6,
              }}>
                💭 Pet Wants
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: INTERACTIONS.find((i) => i.type === petRequest.type)?.color || "#BE4F28",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, flexShrink: 0,
                }}>
                  {INTERACTIONS.find((i) => i.type === petRequest.type)?.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 14, fontFamily: "var(--ed-disp)", fontWeight: 700,
                    color: "#211A12", marginBottom: 2,
                  }}>
                    "{petRequest.message}"
                  </div>
                  <div style={{
                    fontSize: 12, fontFamily: "var(--ed-body)",
                    color: "#5C5140",
                  }}>
                    Fulfill within 30min for bonus +happy +bond +exp
                  </div>
                </div>
                <button
                  onClick={() => handleInteract(petRequest.type)}
                  disabled={!!interacting}
                  style={{
                    padding: "8px 16px", borderRadius: 10, border: "none",
                    background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
                    color: "#FFF8EE", fontFamily: "var(--ed-disp)",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Do it!
                </button>
              </div>
            </div>
          )}

          {/* Interactions — hidden in compact mode (editorial care tiles own the loop) */}
          {!compact && (
          <div style={{
            background: "#FBF6EC", borderRadius: 18,
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", padding: 22,
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          }}>
            <div style={{
              fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A", marginBottom: 14,
              textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600,
            }}>
              Interact with <span style={{ fontWeight: 700, color: "#211A12" }}>{pet.name}</span>
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
                      background: blocked ? "rgba(220,38,38,0.04)" : interacting === i.type ? `${i.color}15` : isRequested ? `${i.color}10` : "#F5EFE2",
                      border: blocked ? "1px solid rgba(220,38,38,0.18)" : interacting === i.type ? `1px solid ${i.color}40` : isRequested ? `1px solid ${i.color}80` : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                      borderRadius: 14, padding: "16px 8px",
                      cursor: blocked ? "not-allowed" : interacting ? "wait" : "pointer",
                      opacity: blocked ? 0.55 : interacting && interacting !== i.type ? 0.4 : 1,
                      transform: interacting === i.type ? "scale(0.95)" : "scale(1)",
                      animation: isRequested && !interacting ? "statPop 1.5s ease infinite" : "none",
                    }}>
                    {isRequested && !blocked && (
                      <div style={{
                        position: "absolute", top: -6, right: -6,
                        background: "#BE4F28", color: "#FFF8EE",
                        fontSize: 12, padding: "2px 6px", borderRadius: 6,
                        fontFamily: "var(--ed-disp)", fontWeight: 700,
                      }}>!</div>
                    )}
                    {/* Purpose tag (top-left) — "what does this click DO" */}
                    {!blocked && (i as any).purpose && (
                      <div style={{
                        position: "absolute", top: 4, left: 4,
                        fontSize: 10, padding: "2px 5px", borderRadius: 4,
                        background: "rgba(33,26,18,0.05)", color: "#7A6E5A",
                        fontFamily: "var(--ed-m)",
                        fontWeight: 700, letterSpacing: "0.06em",
                      }}>{(i as any).purpose}</div>
                    )}
                    {/* Lock icon if level-gated */}
                    {levelLocked && (
                      <div style={{
                        position: "absolute", top: 6, right: 6, lineHeight: 0,
                      }}><Icon name="lock" size={12} /></div>
                    )}
                    <div style={{
                      fontSize: 26, marginBottom: 4,
                      animation: interacting === i.type ? "statPop 0.3s ease" : "none",
                      filter: blocked ? "grayscale(0.7)" : "none",
                    }}>{i.icon}</div>
                    <div style={{ fontFamily: "var(--ed-disp)", fontSize: 13, color: blocked ? "#dc2626" : i.color, fontWeight: 700 }}>{i.label}</div>
                    <div style={{ fontFamily: "var(--ed-body)", fontSize: 12, color: blocked ? "#dc2626" : "#7A6E5A", marginTop: 2, fontWeight: blocked ? 600 : 400 }}>
                      {blocked ? blockReason : i.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* Response */}
          {lastResponse && (
            <div style={{
              background: lastResponse.blocked
                ? "rgba(220,38,38,0.05)"
                : lastResponse.combo
                  ? "rgba(190,79,40,0.08)"
                  : "rgba(92,138,78,0.06)",
              borderRadius: 16,
              border: lastResponse.blocked
                ? "1px solid rgba(220,38,38,0.2)"
                : lastResponse.combo
                  ? "1px solid rgba(190,79,40,0.3)"
                  : "1px solid rgba(92,138,78,0.18)",
              padding: 18,
              animation: responseAnim ? "responseSlide 0.4s ease-out" : "none",
              boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(190,79,40,0.1)", fontSize: 20,
                  animation: "petFloat 3s ease-in-out infinite",
                }}>
                  <img src={pet.avatar_url || "/mascot.jpg"} alt={pet.name} style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{
                    fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140",
                    lineHeight: 1.6, margin: "0 0 10px",
                  }}>
                    &quot;{lastResponse.response_text}&quot;
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.entries(lastResponse.stat_changes || {}).filter(([, v]: any) => v !== 0).map(([k, v]: any) => {
                      // Hunger is inverted (lower = better): feeding lowers it. Color by
                      // semantic good/bad, and show hunger as "fullness" gained so the
                      // best action (feed) never reads as a red penalty.
                      const good = k === "hunger" ? v < 0 : v > 0;
                      const label = k === "hunger" ? "fullness" : k;
                      const display = k === "hunger" ? -v : v;
                      return (
                        <span key={k} style={{
                          fontFamily: "var(--ed-m)", fontSize: 12, padding: "3px 8px", borderRadius: 8,
                          background: good ? "rgba(92,138,78,0.12)" : "rgba(248,113,113,0.1)",
                          color: good ? "#5C8A4E" : "#dc2626",
                          border: good ? "1px solid rgba(92,138,78,0.24)" : "1px solid rgba(248,113,113,0.2)",
                          animation: "statPop 0.4s ease",
                        }}>
                          {label} {display > 0 ? "+" : ""}{display}
                        </span>
                      );
                    })}
                  </div>
                  {lastResponse.memory_created && (
                    <div style={{
                      marginTop: 8, fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <span style={{ fontSize: 12 }}>💭</span>
                      {lastResponse.memory_created}
                    </div>
                  )}
                  {lastResponse.combo && (
                    <div style={{
                      marginTop: 10, padding: "8px 12px", borderRadius: 10,
                      background: "rgba(190,79,40,0.14)",
                      border: "1px solid rgba(190,79,40,0.3)",
                      fontFamily: "var(--ed-disp)", fontSize: 12,
                      color: "#9A4E1E", fontWeight: 700,
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ fontSize: 16 }}>{lastResponse.combo.emoji}</span>
                      <span>{lastResponse.combo.name} — {lastResponse.combo.description}</span>
                    </div>
                  )}
                  {lastResponse.request_fulfilled && (
                    <div style={{
                      marginTop: 10, padding: "6px 10px", borderRadius: 8,
                      background: "rgba(92,138,78,0.14)",
                      fontFamily: "var(--ed-body)", fontSize: 12,
                      color: "#5C8A4E", fontWeight: 700,
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
              background: "#FBF6EC", borderRadius: 18,
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", padding: 22,
              boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
            }}>
              <div style={{
                fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A", marginBottom: 14,
                textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600,
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
                            ? "linear-gradient(180deg,#F49B2A,#E27D0C)"
                            : isPast
                              ? "#5C8A4E"
                              : "rgba(33,26,18,0.05)",
                          border: isCurrent ? "1px solid #BE4F28" : isPast ? "1px solid #5C8A4E" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: isCurrent ? 18 : 14,
                          color: (isCurrent || isPast) ? "#FFF8EE" : undefined,
                          transition: "all 0.3s",
                        }}>
                          {isPast ? "✓" : s.icon}
                        </div>
                        <div style={{
                          fontFamily: "var(--ed-m)", fontSize: 10, marginTop: 4,
                          color: isCurrent ? "#9A4E1E" : isPast ? "#5C8A4E" : "#9A7B4E",
                          fontWeight: isCurrent ? 700 : 400,
                        }}>
                          {s.name}
                        </div>
                        <div style={{
                          fontFamily: "var(--ed-m)", fontSize: 10,
                          color: "#9A7B4E",
                        }}>
                          Lv.{s.minLevel}
                        </div>
                      </div>
                      {i < evoStatus.all_stages.length - 1 && (
                        <div style={{
                          height: 2, flex: 1, minWidth: 8,
                          background: isPast ? "#5C8A4E" : "rgba(33,26,18,0.08)",
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
                background: "rgba(190,79,40,0.05)",
                border: "1px solid rgba(190,79,40,0.15)", marginBottom: 14,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 600, color: "#211A12" }}>
                      {evoStatus.current_stage?.icon} {evoStatus.current_stage?.name} Stage
                    </div>
                    <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", marginTop: 2 }}>
                      Level {evoStatus.level}
                      {evoStatus.next_stage && ` · Need Lv.${evoStatus.next_stage.minLevel} for ${evoStatus.next_stage.name}`}
                      {!evoStatus.next_stage && " · Max Evolution Reached!"}
                    </div>
                  </div>
                  {evoStatus.next_stage && (
                    <div style={{
                      fontFamily: "var(--ed-m)", fontSize: 12, padding: "4px 10px", borderRadius: 8,
                      background: evoStatus.can_evolve ? "rgba(92,138,78,0.12)" : "rgba(33,26,18,0.04)",
                      color: evoStatus.can_evolve ? "#5C8A4E" : "#9A7B4E",
                      border: evoStatus.can_evolve ? "1px solid rgba(92,138,78,0.24)" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                    }}>
                      {evoStatus.can_evolve ? "Ready!" : `${evoStatus.level}/${evoStatus.next_stage.minLevel}`}
                    </div>
                  )}
                </div>

                {/* Level progress bar to next evolution */}
                {evoStatus.next_stage && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(33,26,18,0.08)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        background: evoStatus.can_evolve
                          ? "#5C8A4E"
                          : "linear-gradient(90deg,#F49B2A,#E27D0C)",
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
                    ? "linear-gradient(180deg,#F49B2A,#E27D0C)"
                    : "rgba(33,26,18,0.04)",
                  color: evoStatus.can_evolve ? "#FFF8EE" : "#9A7B4E",
                  fontFamily: "var(--ed-disp)", fontSize: 13, fontWeight: 600,
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
                  background: "rgba(190,79,40,0.06)",
                  border: "1px solid rgba(190,79,40,0.2)",
                  animation: "responseSlide 0.4s ease-out",
                }}>
                  <div style={{ fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 600, color: "#9A4E1E", marginBottom: 6 }}>
                    {evoResult.new_stage?.icon} Evolved to {evoResult.new_stage?.name}!
                  </div>
                  {evoResult.skills_unlocked?.length > 0 && (
                    <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A", marginBottom: 4 }}>
                      New skills: {evoResult.skills_unlocked.join(", ")}
                    </div>
                  )}
                  <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#5C8A4E" }}>
                    +{evoResult.credits_earned} credits earned!
                  </div>
                </div>
              )}

              {/* Skills */}
              {evoStatus.skills?.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{
                    fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", marginBottom: 8,
                    textTransform: "uppercase", letterSpacing: "0.12em",
                  }}>
                    Unlocked Skills
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {evoStatus.skills.map((s: any) => (
                      <span key={s.skill_key} style={{
                        fontFamily: "var(--ed-m)", fontSize: 12, padding: "5px 12px", borderRadius: 10,
                        background: "rgba(107,79,160,0.08)", color: "#6B4FA0",
                        border: "1px solid rgba(107,79,160,0.15)",
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

          {/* Your story — what the pet has learned about YOU (the memory moat, felt). */}
          {pet && pet.id > 0 && <MemoryJournal petId={pet.id} petName={pet.name} />}

          {/* Power up — pay-to-boost stats (402 → PaywallModal loop, mounted below). */}
          {pet && <StatUpgradePanel petId={pet.id} onStatsChanged={() => loadPetStatus(pet.id)} />}

          {/* Weekly diary — the pet's own journal of the week with the owner. */}
          {pet && <PetDiary petId={pet.id} petName={pet.name} accent={moodCfg.color} />}

          {/* Memories Timeline — show a beautiful empty state when none exist
              yet so the user knows what's coming. Previously the section just
              vanished, leaving the page feeling incomplete. */}
          {petStatus && (!petStatus.recent_memories || petStatus.recent_memories.length === 0) && pet && (
            <div style={{
              background: "#FBF6EC", borderRadius: 16,
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", padding: "32px 24px",
              flex: 1, textAlign: "center",
              boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
            }}>
              <div style={{
                fontFamily: "var(--ed-m)", fontSize: 12,
                color: "#7A6E5A", letterSpacing: "0.14em",
                textTransform: "uppercase", fontWeight: 700, marginBottom: 18,
              }}>
                Memory Timeline
              </div>
              <div style={{ marginBottom: 10, opacity: 0.7, lineHeight: 0 }}><Icon name="scroll" size={48} /></div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#211A12", marginBottom: 6, fontFamily: "var(--ed-disp)" }}>
                {pet.name}'s memories will live here
              </div>
              <div style={{
                fontSize: 13, color: "#5C5140", lineHeight: 1.55, fontFamily: "var(--ed-body)",
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
              background: "#FBF6EC", borderRadius: 16,
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", padding: 20, flex: 1,
              overflow: "auto", maxHeight: 280,
              boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
            }}>
              <div style={{
                fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A", marginBottom: 14,
                textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600,
              }}>
                Memory Timeline
              </div>
              <div style={{ position: "relative", paddingLeft: 20 }}>
                <div style={{
                  position: "absolute", left: 5, top: 4, bottom: 4, width: 1,
                  background: "rgba(33,26,18,0.1)",
                }} />
                {petStatus.recent_memories.slice(0, 8).map((m: any, i: number) => (
                  <div key={m.id} style={{
                    position: "relative", paddingBottom: 14, paddingLeft: 8,
                  }}>
                    <div style={{
                      position: "absolute", left: -18, top: 4,
                      width: 8, height: 8, borderRadius: "50%",
                      background: m.memory_type === "milestone" ? "#C8932F"
                        : m.memory_type === "generation" ? "#5C8A4E"
                        : "#6B4FA0",
                    }} />
                    <div style={{
                      fontFamily: "var(--ed-body)", fontSize: 12,
                      color: "#5C5140", lineHeight: 1.5,
                    }}>
                      {m.content}
                    </div>
                    <div style={{
                      fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", marginTop: 3,
                      display: "flex", gap: 8,
                    }}>
                      <span>{m.emotion}</span>
                      {m.importance >= 4 && <span title="key memory">★ key</span>}
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
            background: "#FBF6EC", borderRadius: 24, width: 420, maxWidth: "95vw",
            maxHeight: "80vh", display: "flex", flexDirection: "column",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))", overflow: "hidden",
            animation: "slideIn 0.3s ease-out",
          }} onClick={e => e.stopPropagation()}>
            {/* Chat Header */}
            <div style={{
              padding: "16px 20px", borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              display: "flex", alignItems: "center", gap: 12,
              background: "rgba(190,79,40,0.05)",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, overflow: "hidden",
                border: "1px solid rgba(190,79,40,0.2)", flexShrink: 0,
              }}>
                <img src={pet.avatar_url || "/mascot.jpg"} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 600, color: "#211A12" }}>
                  Chat with {pet.name}
                </div>
                <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E" }}>
                  {pet.personality_type} · {MOOD_CONFIG[pet.current_mood || "neutral"]?.emoji} {MOOD_CONFIG[pet.current_mood || "neutral"]?.label}
                </div>
              </div>
              <button onClick={() => setShowChat(false)} aria-label="Close chat" style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 18, color: "#9A7B4E", padding: 4,
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
                  <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", lineHeight: 1.8 }}>
                    Say hi to {pet.name}!<br/>
                    Your pet responds based on their personality and mood.
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                    {["Hey there! 👋", "How are you?", "I love you!", "Are you hungry?"].map(q => (
                      <button key={q} onClick={() => handleChat(q)} style={{
                        background: "rgba(190,79,40,0.08)", border: "1px solid rgba(190,79,40,0.15)",
                        borderRadius: 20, padding: "5px 12px", cursor: "pointer",
                        fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A4E1E",
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
                      border: "1px solid rgba(190,79,40,0.2)",
                    }}>
                      {pet.avatar_url ? (
                        <img src={pet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(190,79,40,0.1)", fontSize: 14 }}>🐾</div>
                      )}
                    </div>
                  )}
                  <div style={{
                    maxWidth: "75%", padding: "10px 14px", borderRadius: 16,
                    background: msg.role === "user"
                      ? "linear-gradient(180deg,#F49B2A,#E27D0C)"
                      : "#F5EFE2",
                    color: msg.role === "user" ? "#FFF8EE" : "#211A12",
                    fontFamily: "var(--ed-body)", fontSize: 12, lineHeight: 1.6,
                    border: msg.role === "pet" ? "1px solid var(--ed-hair, rgba(33,26,18,.13))" : "none",
                    borderBottomRightRadius: msg.role === "user" ? 4 : 16,
                    borderBottomLeftRadius: msg.role === "pet" ? 4 : 16,
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(190,79,40,0.2)", flexShrink: 0 }}>
                    {pet.avatar_url ? <img src={pet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>🐾</span>}
                  </div>
                  <div style={{
                    padding: "12px 16px", borderRadius: 16, borderBottomLeftRadius: 4,
                    background: "#F5EFE2",
                    border: "1px solid rgba(190,79,40,0.20)",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[0, 1, 2].map(d => (
                        <span key={d} className="ai-typing-dot" style={{
                          background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
                          animationDelay: `${d * 0.18}s`,
                        }} />
                      ))}
                    </div>
                    <span style={{
                      fontFamily: "var(--ed-disp)", fontSize: 14,
                      fontWeight: 600, color: "#9A4E1E",
                    }}>{pet.name} is thinking</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div style={{
              padding: "12px 16px", borderTop: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              display: "flex", gap: 8, background: "#FBF6EC",
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
                  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", outline: "none",
                  fontFamily: "var(--ed-body)", fontSize: 13,
                  background: chatLoading ? "rgba(33,26,18,0.04)" : "#F5EFE2",
                  color: "#211A12",
                }}
              />
              <button
                onClick={() => handleChat()}
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  padding: "10px 18px", borderRadius: 12, border: "none",
                  background: chatInput.trim() ? "linear-gradient(180deg,#F49B2A,#E27D0C)" : "rgba(33,26,18,0.04)",
                  color: chatInput.trim() ? "#FFF8EE" : "#9A7B4E",
                  fontFamily: "var(--ed-disp)", fontSize: 12, fontWeight: 600,
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

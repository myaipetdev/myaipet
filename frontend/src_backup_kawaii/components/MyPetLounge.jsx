import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { api } from "../api";
import { MOCK_PETS, MOCK_PET_STATUS, MOCK_INTERACT_RESPONSES } from "../mockData";

const PetInstincts = lazy(() => import("./PetInstincts"));
const DreamJournal = lazy(() => import("./DreamJournal"));
const SoulPanel = lazy(() => import("./SoulPanel"));

const PET_IMAGES = [
  "/gallery/pet_cat.jpg", "/gallery/pet_dog.jpg", "/gallery/pet_parrot.jpg",
  "/gallery/pet_turtle.jpg", "/gallery/pet_hamster.jpg", "/gallery/pet_rabbit.jpg",
  "/gallery/pet_fox.jpg", "/gallery/pet_pom.jpg",
];
const PET_SPECIES = ["Cat","Dog","Parrot","Turtle","Hamster","Rabbit","Fox","Pomeranian"];

const MOOD_MAP = {
  ecstatic: { emoji: "🤩", label: "Ecstatic", color: "sun" },
  happy: { emoji: "😊", label: "Happy", color: "mint" },
  neutral: { emoji: "😐", label: "Neutral", color: "lavender" },
  sad: { emoji: "😢", label: "Sad", color: "sky" },
  exhausted: { emoji: "😴", label: "Sleepy", color: "lavender" },
  hungry: { emoji: "😋", label: "Hungry", color: "sun" },
  tired: { emoji: "😪", label: "Tired", color: "lavender" },
};

// ── Stat Bar (Kawaii) ──
function StatBar({ label, value, max = 100, icon, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-base w-7 text-center">{icon}</span>
      <span className="font-body text-xs font-semibold text-[#422D26]/70 w-16">{label}</span>
      <div className="flex-1">
        <div className="h-4 rounded-full bg-cream-dark overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: color,
            }}
          />
        </div>
      </div>
      <span className="font-body text-xs text-[#422D26]/65 font-bold w-10 text-right">
        {value}
      </span>
    </div>
  );
}

// ── Floating Hearts Animation ──
function FloatingHearts({ show }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className="absolute text-2xl"
          style={{
            left: `${25 + Math.random() * 50}%`,
            bottom: "30%",
            animation: `float 1s ease-out forwards`,
            animationDelay: `${i * 0.08}s`,
            opacity: 0,
          }}
        >
          {["💖", "💕", "✨", "💗"][i % 4]}
        </span>
      ))}
    </div>
  );
}

// ── Chat Bubble ──
function ChatBubble({ text, fromPet, petEmoji }) {
  if (!text) return null;
  return (
    <div className={`flex gap-2 mb-2 animate-slide-up ${fromPet ? "" : "flex-row-reverse"}`}>
      {fromPet && (
        <div className="w-8 h-8 rounded-full bg-pink/10 flex items-center justify-center text-lg shrink-0">
          {petEmoji || "🐾"}
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-3xl px-4 py-3 font-body text-sm leading-relaxed
          ${fromPet
            ? "bg-white/90 text-[#422D26]/80 rounded-tl-lg sticker-border"
            : "bg-pink text-white rounded-tr-lg"
          }`}
      >
        {text}
      </div>
    </div>
  );
}

// ── Main Component ──
export default function MyPetLounge() {
  const [pets, setPets] = useState([]);
  const [activePet, setActivePet] = useState(null);
  const [petStatus, setPetStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [interacting, setInteracting] = useState(null);
  const [showHearts, setShowHearts] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [patsLeft, setPatsLeft] = useState(5);
  const [photoState, setPhotoState] = useState(null); // null | "loading" | "done"
  const [innerTab, setInnerTab] = useState("instincts");

  // Load pets (reusing existing API)
  useEffect(() => {
    loadPets();
  }, []);

  const loadPets = async () => {
    try {
      const list = await api.pets.list();
      setPets(list);
      if (list.length > 0) {
        setActivePet(list[0]);
        loadPetStatus(list[0].id);
      }
    } catch {
      setPets(MOCK_PETS);
      setActivePet(MOCK_PETS[0]);
      setPetStatus(MOCK_PET_STATUS);
    }
    setLoading(false);
  };

  const loadPetStatus = async (petId) => {
    try {
      const status = await api.pets.get(petId);
      setPetStatus(status);
    } catch {
      setPetStatus({ ...MOCK_PET_STATUS, ...(MOCK_PETS.find((p) => p.id === petId) || {}) });
    }
  };

  const handlePat = async () => {
    if (!activePet || interacting || patsLeft <= 0) return;
    setInteracting("pet");
    setShowHearts(true);
    setPatsLeft((p) => p - 1);
    setTimeout(() => setShowHearts(false), 1000);

    try {
      const result = await api.pets.interact(activePet.id, "pet");
      setChatMessages((prev) => [...prev, { text: result.response_text, fromPet: true }]);
      loadPetStatus(activePet.id);
    } catch {
      const mock = MOCK_INTERACT_RESPONSES.pet;
      setChatMessages((prev) => [
        ...prev,
        { text: mock.response_text.replace(/Luna/g, activePet.name), fromPet: true },
      ]);
    }
    setTimeout(() => setInteracting(null), 400);
  };

  const handleChat = async () => {
    if (!chatInput.trim() || !activePet) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { text: msg, fromPet: false }]);

    try {
      const result = await api.pets.interact(activePet.id, "talk");
      setChatMessages((prev) => [...prev, { text: result.response_text, fromPet: true }]);
      loadPetStatus(activePet.id);
    } catch {
      const mock = MOCK_INTERACT_RESPONSES.talk;
      setTimeout(() => {
        setChatMessages((prev) => [
          ...prev,
          { text: mock.response_text.replace(/Luna/g, activePet.name), fromPet: true },
        ]);
      }, 800);
    }
  };

  const handlePhotoshoot = async () => {
    if (!activePet || photoState === "loading") return;
    setPhotoState("loading");
    try {
      await api.pets.generate(activePet.id, { style: 0, type: "image" });
    } catch { /* demo */ }
    setTimeout(() => {
      setPhotoState("done");
      setChatMessages((prev) => [
        ...prev,
        { text: `✨ Wow! That was fun! I look so cute in that photo! Can we do another one?`, fromPet: true },
      ]);
      setTimeout(() => setPhotoState(null), 3000);
    }, 2500);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center pt-32 gap-4">
        <div className="text-6xl animate-float">🥚</div>
        <span className="font-body text-sm text-pink/60 font-semibold">Finding your pets...</span>
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className="max-w-md mx-auto px-6 pt-28 text-center">
        <div className="text-7xl mb-6 animate-float">🥚</div>
        <h2 className="font-heading text-2xl text-[#422D26] mb-3">No Pets Yet!</h2>
        <p className="font-body text-sm text-pink/60 mb-8 leading-relaxed">
          Adopt your first AI pet to start playing together. They'll grow, learn, and develop their own personality!
        </p>
        <button className="squishy bg-pink text-white font-heading text-lg px-10 py-4 rounded-full shadow-lg">
          Adopt Your First Pet 🐾
        </button>
      </div>
    );
  }

  const pet = petStatus || activePet;
  const mood = MOOD_MAP[pet.current_mood] || MOOD_MAP.neutral;
  const petImg = PET_IMAGES[pet.species] || PET_IMAGES[0];
  const speciesLabel = PET_SPECIES[pet.species] || "Pet";

  return (
    <div className="max-w-2xl mx-auto px-6 pt-36 pb-28 relative">
      {/* Pet Switcher (if multiple) */}
      {pets.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {pets.map((p) => (
            <button
              key={p.id}
              onClick={() => { setActivePet(p); loadPetStatus(p.id); setChatMessages([]); }}
              className={`squishy shrink-0 flex items-center gap-2 px-3 py-2 rounded-2xl sticker-border transition-all
                ${activePet?.id === p.id ? "bg-pink/10 ring-2 ring-pink/30" : "bg-white/60"}`}
            >
              <img src={PET_IMAGES[p.species] || PET_IMAGES[0]} className="w-8 h-8 rounded-xl object-cover" alt="" />
              <span className={`font-body text-xs font-bold ${activePet?.id === p.id ? "text-pink" : "text-[#422D26]/60"}`}>
                {p.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ═══ PET STAGE ═══ */}
      <div className="relative rounded-[32px] overflow-hidden sticker-border mb-8 bg-gradient-to-b from-sky/10 via-pink/5 to-cream p-8">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full opacity-20 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${mood.color === "sun" ? "#FFD23F" : "#FF86B7"}, transparent)` }} />

        <FloatingHearts show={showHearts} />

        {/* Photoshoot overlay */}
        {photoState === "loading" && (
          <div className="absolute inset-0 z-30 bg-cream/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-[32px]">
            <div className="text-5xl mb-3 animate-wiggle">📸</div>
            <p className="font-heading text-base text-[#422D26]">Grok is dreaming up a scene...</p>
            <p className="font-body text-xs text-pink/60 mt-1">Hold still!</p>
          </div>
        )}

        {/* Pet Avatar */}
        <div className="flex flex-col items-center relative z-10">
          <div
            className="w-48 h-48 rounded-3xl overflow-hidden sticker-border mb-5 animate-pulse-glow bg-pink/5"
            style={{
              animation: "float 4s ease-in-out infinite, pulse-glow 3s ease-in-out infinite",
              border: "3px solid rgba(255,134,183,0.2)",
            }}
          >
            <img src={petImg} alt={pet.name} className="w-full h-full object-contain" />
          </div>

          <h2 className="font-heading text-3xl text-[#422D26] mb-1">{pet.name}</h2>
          <p className="font-body text-sm text-[#422D26]/60 mb-4">{speciesLabel}</p>

          {/* Status Pills */}
          <div className="flex gap-3 flex-wrap justify-center mb-5">
            <span className="font-body text-sm font-bold bg-white/80 text-[#422D26]/70 px-4 py-2 rounded-full sticker-border">
              {mood.emoji} Mood: {mood.label}
            </span>
            <span className="font-body text-sm font-bold bg-sun/15 text-sun-dark px-4 py-2 rounded-full">
              👑 Bond Lvl: {pet.bond_level || 0}
            </span>
            <span className="font-body text-sm font-bold bg-mint/15 text-[#422D26]/65 px-4 py-2 rounded-full">
              Lv.{pet.level} {pet.personality_type}
            </span>
          </div>

          {/* Mini Stats */}
          <div className="w-full max-w-sm space-y-2.5">
            <StatBar label="Happiness" value={pet.happiness} icon="💖" color="linear-gradient(90deg, #FF86B7, #FFB6D5)" />
            <StatBar label="Energy" value={pet.energy} icon="⚡" color="linear-gradient(90deg, #70D6FF, #A8E6FF)" />
            <StatBar label="Hunger" value={pet.hunger} icon="🍖" color="linear-gradient(90deg, #FFD23F, #FFE580)" />
          </div>
        </div>
      </div>

      {/* ═══ ACTION BAR ═══ */}
      <div className="flex gap-3 mb-8">
        {/* Give Pat */}
        <button
          onClick={handlePat}
          disabled={patsLeft <= 0 || !!interacting}
          className={`squishy flex-1 flex flex-col items-center gap-1.5 py-5 rounded-3xl sticker-border relative transition-all
            ${patsLeft > 0
              ? "bg-pink/10 hover:bg-pink/20 active:bg-pink/25"
              : "bg-cream-dark/50 opacity-50 cursor-not-allowed"
            }`}
        >
          <span className={`text-4xl ${interacting === "pet" ? "animate-wiggle" : ""}`}>💖</span>
          <span className="font-heading text-sm text-[#422D26]">Give Pat</span>
          <span className="absolute -top-2 -right-2 bg-pink text-white font-body text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md">
            {patsLeft}
          </span>
        </button>

        {/* Chat */}
        <button
          onClick={() => document.getElementById("chat-input")?.focus()}
          className="squishy flex-1 flex flex-col items-center gap-1.5 py-5 rounded-3xl sticker-border
                     bg-sky/10 hover:bg-sky/20 active:bg-sky/25 transition-all"
        >
          <span className="text-4xl">💬</span>
          <span className="font-heading text-sm text-[#422D26]">Chat</span>
        </button>

        {/* Photoshoot */}
        <button
          onClick={handlePhotoshoot}
          disabled={photoState === "loading"}
          className={`squishy flex-1 flex flex-col items-center gap-1.5 py-5 rounded-3xl sticker-border transition-all
            ${photoState === "loading"
              ? "bg-cream-dark/50 opacity-60"
              : "bg-sun/10 hover:bg-sun/20 active:bg-sun/25"
            }`}
        >
          <span className={`text-4xl ${photoState === "loading" ? "animate-wiggle" : ""}`}>📸</span>
          <span className="font-heading text-sm text-[#422D26]">Photoshoot</span>
          <span className="font-body text-xs text-pink/70">Gen new art</span>
        </button>
      </div>

      {/* ═══ CHAT TERMINAL ═══ */}
      <div className="bg-white/60 backdrop-blur-sm rounded-3xl sticker-border p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">💭</span>
          <span className="font-heading text-base text-[#422D26]">Chat with {pet.name}</span>
        </div>

        {/* Messages */}
        <div className="space-y-2 max-h-60 overflow-y-auto mb-4 px-1">
          {chatMessages.length === 0 && (
            <ChatBubble
              text={`Rawr! Hey there, boss! I'm feeling ${mood.label.toLowerCase()} today. Wanna play or go to the Arena? 😸`}
              fromPet
              petEmoji={mood.emoji}
            />
          )}
          {chatMessages.map((msg, i) => (
            <ChatBubble key={i} {...msg} petEmoji={mood.emoji} />
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-3">
          <input
            id="chat-input"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleChat()}
            placeholder={`Say something to ${pet.name}...`}
            className="flex-1 bg-cream rounded-full px-5 py-3 font-body text-base text-[#422D26]
                       placeholder:text-pink/40 outline-none focus:ring-2 focus:ring-pink/20
                       transition-all"
            style={{ border: "2px solid rgba(255,134,183,0.1)" }}
          />
          <button
            onClick={handleChat}
            disabled={!chatInput.trim()}
            className={`squishy w-12 h-12 rounded-full flex items-center justify-center text-lg
              ${chatInput.trim()
                ? "bg-pink text-white shadow-md"
                : "bg-cream-dark text-pink/40 cursor-not-allowed"
              }`}
          >
            ➤
          </button>
        </div>
      </div>

      {/* ═══ INNER WORLD SECTION ═══ */}
      <div className="my-8 flex items-center gap-3">
        <div className="flex-1 h-px bg-pink/15" />
        <span className="font-heading text-sm text-pink/70 uppercase tracking-widest">Inner World</span>
        <div className="flex-1 h-px bg-pink/15" />
      </div>

      <p className="font-body text-sm text-[#422D26]/60 text-center mb-5 -mt-4 leading-relaxed">
        Explore {pet.name}'s personality, dreams, and inner nature
      </p>

      {/* ═══ INSTINCTS / DREAMS / SOUL TABS ═══ */}
      <div className="bg-white/60 backdrop-blur-sm rounded-3xl sticker-border p-5">
        {/* Tab Buttons */}
        <div className="flex gap-3 mb-5" role="tablist">
          {[
            { key: "instincts", icon: "🧬", label: "Instincts" },
            { key: "dreams", icon: "🌙", label: "Dreams" },
            { key: "soul", icon: "✨", label: "Soul" },
          ].map((tab) => {
            const isActive = innerTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setInnerTab(tab.key)}
                role="tab"
                aria-selected={isActive}
                className={`squishy flex-1 flex items-center justify-center gap-2 font-body text-sm font-bold px-5 py-3 rounded-full transition-all duration-200
                  ${isActive
                    ? "bg-pink text-white shadow-md"
                    : "bg-cream text-[#422D26]/60 hover:text-[#422D26]/60 hover:bg-pink/5"
                  }`}
              >
                <span className="text-base">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <span className="font-body text-sm text-pink/60 font-semibold">Loading...</span>
            </div>
          }
        >
          {innerTab === "instincts" && <PetInstincts petId={activePet?.id} />}
          {innerTab === "dreams" && <DreamJournal petId={activePet?.id} />}
          {innerTab === "soul" && <SoulPanel petId={activePet?.id} />}
        </Suspense>
      </div>
    </div>
  );
}

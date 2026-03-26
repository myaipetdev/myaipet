import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { MOCK_PETS, MOCK_PET_STATUS, MOCK_INTERACT_RESPONSES } from "../mockData";

const PET_SPECIES = ["Cat","Dog","Parrot","Turtle","Hamster","Rabbit","Fox","Pomeranian"];
const PET_EMOJIS = ["🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶"];
const PET_IMAGES = [
  "/gallery/pet_cat.jpg",
  "/gallery/pet_dog.jpg",
  "/gallery/pet_parrot.jpg",
  "/gallery/pet_turtle.jpg",
  "/gallery/pet_hamster.jpg",
  "/gallery/pet_rabbit.jpg",
  "/gallery/pet_fox.jpg",
  "/gallery/pet_pom.jpg",
];
const INTERACTIONS = [
  { type: "feed", label: "Feed", icon: "🍖", color: "#4ade80", desc: "Reduce hunger" },
  { type: "play", label: "Play", icon: "⚽", color: "#60a5fa", desc: "Boost happiness" },
  { type: "talk", label: "Talk", icon: "💬", color: "#c084fc", desc: "Build bond" },
  { type: "pet", label: "Pet", icon: "🤚", color: "#f472b6", desc: "Show affection" },
  { type: "walk", label: "Walk", icon: "🚶", color: "#fbbf24", desc: "Gain energy" },
  { type: "train", label: "Train", icon: "🎓", color: "#f97316", desc: "Gain experience" },
];

const MOOD_CONFIG = {
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

function AnimatedStatBar({ label, value, color, max = 100, icon }) {
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
        <span style={{ fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 4 }}>
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
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
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

function CreatePetModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [species, setSpecies] = useState(0);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0); // 0: name, 1: species

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const pet = await api.pets.create(name.trim(), species);
      onCreated(pet);
      onClose();
    } catch (e) {
      alert(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "linear-gradient(180deg, #1a1a20, #141418)",
        borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)",
        padding: 32, width: 420, maxWidth: "90vw",
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        animation: "slideIn 0.3s ease-out",
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          {step === 0
            ? <div style={{ fontSize: 48, marginBottom: 8 }}>🥚</div>
            : <img src={PET_IMAGES[species]} alt={PET_SPECIES[species]}
                style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover", marginBottom: 8 }} />
          }
          <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, color: "white", marginBottom: 6 }}>
            {step === 0 ? "Name Your Pet" : "Choose Species"}
          </h3>
          <p style={{ fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            {step === 0 ? "Give your new companion a name" : "What kind of pet will they be?"}
          </p>
        </div>

        {step === 0 ? (
          <>
            <input value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && name.trim() && setStep(1)}
              placeholder="Enter a name..."
              autoFocus
              style={{
                width: "100%", padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)", color: "white", fontFamily: "'Space Grotesk',sans-serif",
                fontSize: 16, outline: "none", boxSizing: "border-box", textAlign: "center",
                transition: "border-color 0.2s",
              }}
              onFocus={e => e.target.style.borderColor = "rgba(251,191,36,0.3)"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
            <button onClick={() => name.trim() && setStep(1)} disabled={!name.trim()} style={{
              width: "100%", padding: "13px", borderRadius: 12, border: "none", cursor: "pointer",
              background: name.trim() ? "linear-gradient(135deg,#f59e0b,#d97706)" : "rgba(255,255,255,0.04)",
              color: name.trim() ? "white" : "rgba(255,255,255,0.2)", fontFamily: "mono", fontSize: 13, fontWeight: 600,
              marginTop: 14, transition: "all 0.2s",
            }}>
              Next
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
              {PET_SPECIES.map((s, i) => (
                <button key={s} onClick={() => setSpecies(i)} style={{
                  background: species === i ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.02)",
                  border: species === i ? "2px solid rgba(251,191,36,0.4)" : "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 12, padding: "12px 4px", cursor: "pointer",
                  transition: "all 0.2s", transform: species === i ? "scale(1.05)" : "scale(1)",
                }}>
                  <img src={PET_IMAGES[i]} alt={s}
                    style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", marginBottom: 4 }} />
                  <div style={{
                    fontFamily: "mono", fontSize: 9, fontWeight: 600,
                    color: species === i ? "#fde68a" : "rgba(255,255,255,0.35)",
                  }}>{s}</div>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep(0)} style={{
                flex: 1, padding: "13px", borderRadius: 12, cursor: "pointer",
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.4)", fontFamily: "mono", fontSize: 13,
              }}>
                Back
              </button>
              <button onClick={handleCreate} disabled={loading} style={{
                flex: 2, padding: "13px", borderRadius: 12, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg,#f59e0b,#d97706)",
                color: "white", fontFamily: "mono", fontSize: 13, fontWeight: 600,
                boxShadow: "0 0 24px rgba(245,158,11,0.25)",
              }}>
                {loading ? "Hatching..." : `Adopt ${name}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PetAvatar({ pet, mood, size = 80 }) {
  const moodCfg = MOOD_CONFIG[mood] || MOOD_CONFIG.neutral;
  const imgSrc = PET_IMAGES[pet.species] || PET_IMAGES[0];

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div style={{
        width: size, height: size, borderRadius: size * 0.3,
        background: "rgba(255,255,255,0.02)",
        border: `2px solid ${moodCfg.color}30`,
        overflow: "hidden",
        boxShadow: `0 0 ${size * 0.4}px ${moodCfg.color}15`,
        transition: "all 0.5s ease",
        animation: "petFloat 6s ease-in-out infinite",
      }}>
        <img src={imgSrc} alt={PET_SPECIES[pet.species]} style={{
          width: "100%", height: "100%", objectFit: "cover",
        }} />
      </div>
      <div style={{
        position: "absolute", bottom: -4, right: -4,
        fontSize: size * 0.22, background: "#1a1a20",
        borderRadius: "50%", width: size * 0.3, height: size * 0.3,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${moodCfg.color}30`,
      }}>
        {moodCfg.emoji}
      </div>
    </div>
  );
}

export default function PetProfile() {
  const [pets, setPets] = useState([]);
  const [activePet, setActivePet] = useState(null);
  const [petStatus, setPetStatus] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [interacting, setInteracting] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [responseAnim, setResponseAnim] = useState(false);

  useEffect(() => {
    loadPets();
  }, []);

  const loadPets = async () => {
    try {
      const list = await api.pets.list();
      setPets(list);
      if (list.length > 0 && !activePet) {
        setActivePet(list[0]);
        loadPetStatus(list[0].id);
      }
    } catch (e) {
      // Fallback to mock data
      setPets(MOCK_PETS);
      if (!activePet) {
        setActivePet(MOCK_PETS[0]);
        setPetStatus(MOCK_PET_STATUS);
      }
    }
    setLoading(false);
  };

  const loadPetStatus = async (petId) => {
    try {
      const status = await api.pets.get(petId);
      setPetStatus(status);
    } catch (e) {
      setPetStatus({ ...MOCK_PET_STATUS, ...(MOCK_PETS.find(p => p.id === petId) || {}) });
    }
  };

  const handleInteract = async (type) => {
    if (!activePet || interacting) return;
    setInteracting(type);
    setResponseAnim(false);
    try {
      const result = await api.pets.interact(activePet.id, type);
      setLastResponse(result);
      setResponseAnim(true);
      await loadPetStatus(activePet.id);
      await loadPets();
    } catch (e) {
      // Use mock response
      const mockResp = MOCK_INTERACT_RESPONSES[type] || MOCK_INTERACT_RESPONSES.play;
      setLastResponse({
        ...mockResp,
        response_text: mockResp.response_text.replace(/Luna/g, activePet.name),
        memory_created: mockResp.memory_created.replace(/Luna/g, activePet.name),
      });
      setResponseAnim(true);
    }
    setTimeout(() => setInteracting(null), 300);
  };

  const selectPet = (pet) => {
    setActivePet(pet);
    setLastResponse(null);
    loadPetStatus(pet.id);
  };

  if (loading) {
    return (
      <div style={{ padding: "140px 40px", textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, border: "2px solid rgba(251,191,36,0.2)",
          borderTopColor: "#fbbf24", borderRadius: "50%",
          animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ fontFamily: "mono", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Loading your pets...</div>
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
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 30, color: "white", marginBottom: 10 }}>
          No Pets Yet
        </h2>
        <p style={{ fontFamily: "mono", fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 8, lineHeight: 1.8 }}>
          Adopt your first AI pet! They'll grow, learn your patterns, and develop a unique personality over time.
        </p>
        <div style={{ fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 32, lineHeight: 1.7 }}>
          Feed them, play with them, talk to them — every interaction matters.
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none", borderRadius: 14,
          padding: "15px 40px", fontFamily: "mono", fontSize: 14, fontWeight: 600, color: "white", cursor: "pointer",
          boxShadow: "0 0 40px rgba(245,158,11,0.3), 0 8px 24px rgba(0,0,0,0.3)",
          transition: "transform 0.2s",
        }}>
          Adopt Your First Pet
        </button>
        {showCreate && <CreatePetModal onClose={() => setShowCreate(false)} onCreated={(pet) => { setPets([pet]); setActivePet(pet); loadPetStatus(pet.id); }} />}
      </div>
    );
  }

  const pet = petStatus || activePet;
  const mood = pet.current_mood || "neutral";
  const moodCfg = MOOD_CONFIG[mood] || MOOD_CONFIG.neutral;
  const expNeeded = pet.level * 100;

  return (
    <div style={{ padding: "40px", maxWidth: 960, margin: "0 auto", paddingTop: 100 }}>
      <style>{`
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
        padding: "4px", background: "rgba(255,255,255,0.01)", borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.03)",
      }}>
        {pets.map(p => (
          <button key={p.id} onClick={() => selectPet(p)} style={{
            background: activePet?.id === p.id ? "rgba(251,191,36,0.08)" : "transparent",
            border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s",
          }}>
            <img src={PET_IMAGES[p.species] || PET_IMAGES[0]} alt={PET_SPECIES[p.species]}
              style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }} />
            <div style={{ textAlign: "left" }}>
              <div style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600,
                color: activePet?.id === p.id ? "#fde68a" : "rgba(255,255,255,0.4)",
              }}>
                {p.name}
              </div>
              <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.2)" }}>
                Lv.{p.level} {PET_SPECIES[p.species]}
              </div>
            </div>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {pets.length < 3 && (
          <button onClick={() => setShowCreate(true)} style={{
            background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)",
            borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontFamily: "mono", fontSize: 11,
            color: "rgba(255,255,255,0.25)", transition: "all 0.2s",
          }}>+ Adopt New</button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20 }}>
        {/* Left: Pet card */}
        <div style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.008))",
          borderRadius: 20, border: "1px solid rgba(255,255,255,0.05)", padding: 28,
          position: "relative", overflow: "hidden",
        }}>
          {/* Background mood glow */}
          <div style={{
            position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
            width: 200, height: 200, borderRadius: "50%",
            background: moodCfg.color, opacity: 0.03, filter: "blur(60px)",
            transition: "background 0.5s",
          }} />

          <div style={{ textAlign: "center", marginBottom: 24, position: "relative" }}>
            <PetAvatar pet={pet} mood={mood} size={100} />
            <h2 style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, color: "white",
              margin: "16px 0 6px", fontWeight: 700,
            }}>
              {pet.name}
            </h2>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{
                fontFamily: "mono", fontSize: 10, padding: "3px 10px", borderRadius: 10,
                background: "rgba(251,191,36,0.08)", color: "#fbbf24",
                border: "1px solid rgba(251,191,36,0.15)",
              }}>
                Lv.{pet.level}
              </span>
              <span style={{
                fontFamily: "mono", fontSize: 10, padding: "3px 10px", borderRadius: 10,
                background: "rgba(139,92,246,0.08)", color: "#a78bfa",
                border: "1px solid rgba(139,92,246,0.15)",
              }}>
                {pet.personality_type}
              </span>
              <span style={{
                fontFamily: "mono", fontSize: 10, padding: "3px 10px", borderRadius: 10,
                background: `${moodCfg.color}10`, color: moodCfg.color,
                border: `1px solid ${moodCfg.color}20`,
              }}>
                {moodCfg.emoji} {moodCfg.label}
              </span>
            </div>
          </div>

          {/* Stats */}
          <AnimatedStatBar label="Happiness" value={pet.happiness} color="#f472b6" icon="💖" />
          <AnimatedStatBar label="Energy" value={pet.energy} color="#60a5fa" icon="⚡" />
          <AnimatedStatBar label="Hunger" value={pet.hunger} color="#fbbf24" icon="🍖" />
          <AnimatedStatBar label="Bond" value={pet.bond_level} color="#c084fc" icon="🤝" />
          <AnimatedStatBar label="EXP" value={pet.experience} color="#4ade80" max={expNeeded} icon="✨" />

          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 10,
            background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)",
            display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
              Total Interactions
            </span>
            <span style={{ fontFamily: "mono", fontSize: 10, color: "#fde68a", fontWeight: 600 }}>
              {pet.total_interactions}
            </span>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Interactions */}
          <div style={{
            background: "rgba(255,255,255,0.015)", borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.05)", padding: 22,
          }}>
            <div style={{
              fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 14,
              textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600,
            }}>
              Interact with {pet.name}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {INTERACTIONS.map(i => (
                <button key={i.type} onClick={() => handleInteract(i.type)}
                  disabled={!!interacting}
                  style={{
                    background: interacting === i.type
                      ? `${i.color}15`
                      : "rgba(255,255,255,0.02)",
                    border: interacting === i.type
                      ? `1px solid ${i.color}40`
                      : "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12, padding: "14px 8px", cursor: interacting ? "wait" : "pointer",
                    transition: "all 0.2s",
                    opacity: interacting && interacting !== i.type ? 0.4 : 1,
                    transform: interacting === i.type ? "scale(0.95)" : "scale(1)",
                  }}>
                  <div style={{
                    fontSize: 26, marginBottom: 4,
                    animation: interacting === i.type ? "statPop 0.3s ease" : "none",
                  }}>{i.icon}</div>
                  <div style={{ fontFamily: "mono", fontSize: 11, color: i.color, fontWeight: 600 }}>{i.label}</div>
                  <div style={{ fontFamily: "mono", fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>{i.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Response */}
          {lastResponse && (
            <div style={{
              background: "linear-gradient(135deg, rgba(74,222,128,0.04), rgba(74,222,128,0.02))",
              borderRadius: 16, border: "1px solid rgba(74,222,128,0.12)", padding: 18,
              animation: responseAnim ? "responseSlide 0.4s ease-out" : "none",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <img src={PET_IMAGES[pet.species] || PET_IMAGES[0]} alt={PET_SPECIES[pet.species]}
                  style={{
                    width: 36, height: 36, borderRadius: 10, objectFit: "cover", flexShrink: 0,
                    animation: "petFloat 3s ease-in-out infinite",
                  }}
                />
                <div style={{ flex: 1 }}>
                  <p style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(255,255,255,0.75)",
                    lineHeight: 1.6, margin: "0 0 10px",
                  }}>
                    "{lastResponse.response_text}"
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.entries(lastResponse.stat_changes || {}).filter(([, v]) => v !== 0).map(([k, v]) => (
                      <span key={k} style={{
                        fontFamily: "mono", fontSize: 10, padding: "3px 8px", borderRadius: 8,
                        background: v > 0 ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
                        color: v > 0 ? "#4ade80" : "#f87171",
                        border: v > 0 ? "1px solid rgba(74,222,128,0.15)" : "1px solid rgba(248,113,113,0.15)",
                        animation: "statPop 0.4s ease",
                      }}>
                        {k} {v > 0 ? "+" : ""}{v}
                      </span>
                    ))}
                  </div>
                  {lastResponse.memory_created && (
                    <div style={{
                      marginTop: 8, fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.2)",
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

          {/* Memories Timeline */}
          {petStatus?.recent_memories?.length > 0 && (
            <div style={{
              background: "rgba(255,255,255,0.015)", borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.05)", padding: 20, flex: 1,
              overflow: "auto", maxHeight: 280,
            }}>
              <div style={{
                fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 14,
                textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600,
              }}>
                Memory Timeline
              </div>
              <div style={{ position: "relative", paddingLeft: 20 }}>
                {/* Timeline line */}
                <div style={{
                  position: "absolute", left: 5, top: 4, bottom: 4, width: 1,
                  background: "rgba(255,255,255,0.06)",
                }} />
                {petStatus.recent_memories.slice(0, 8).map((m, i) => (
                  <div key={m.id} style={{
                    position: "relative", paddingBottom: 14, paddingLeft: 8,
                  }}>
                    {/* Timeline dot */}
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
                      color: "rgba(255,255,255,0.55)", lineHeight: 1.5,
                    }}>
                      {m.content}
                    </div>
                    <div style={{
                      fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.15)", marginTop: 3,
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

      {showCreate && <CreatePetModal onClose={() => setShowCreate(false)} onCreated={() => loadPets()} />}
    </div>
  );
}

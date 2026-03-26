import { useState, useEffect } from "react";
import { api } from "../api";
import { MOCK_PETS } from "../mockData";

const PET_EMOJIS = ["🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶"];
const PET_SPECIES = ["Cat","Dog","Parrot","Turtle","Hamster","Rabbit","Fox","Pomeranian"];
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
const STYLES = [
  { name: "Cinematic", icon: "🎬", desc: "Hollywood quality" },
  { name: "Anime", icon: "🎌", desc: "Japanese animation" },
  { name: "Watercolor", icon: "🎨", desc: "Artistic & soft" },
  { name: "3D Render", icon: "💎", desc: "Ultra realistic" },
  { name: "Sketch", icon: "✏️", desc: "Hand-drawn feel" },
];

const PROMPT_SUGGESTIONS = [
  "Playing in a sunny meadow with butterflies",
  "Wearing a tiny astronaut helmet in space",
  "Sleeping peacefully on a cloud",
  "Running through cherry blossom petals",
  "Dressed as a detective solving a mystery",
  "Surfing a giant wave at sunset",
  "Having a tea party in a garden",
  "Flying through a rainbow portal",
];

export default function PetGenerate() {
  const [pets, setPets] = useState([]);
  const [selectedPet, setSelectedPet] = useState(null);
  const [style, setStyle] = useState(0);
  const [duration, setDuration] = useState(5);
  const [prompt, setPrompt] = useState("");
  const [genType, setGenType] = useState("image");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    loadPets();
  }, []);

  // Fake progress during generation
  useEffect(() => {
    if (!generating) { setProgress(0); return; }
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 8 + 2;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [generating]);

  const loadPets = async () => {
    try {
      const list = await api.pets.list();
      setPets(list);
      if (list.length > 0) setSelectedPet(list[0]);
    } catch (e) {
      setPets(MOCK_PETS);
      setSelectedPet(MOCK_PETS[0]);
    }
  };

  const handleGenerate = async () => {
    if (!selectedPet || generating) return;
    setGenerating(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.pets.generate(selectedPet.id, {
        style,
        duration,
        prompt: prompt || undefined,
        type: genType,
      });
      setProgress(100);
      setTimeout(() => setResult(res), 300);
    } catch (e) {
      // Mock result for demo
      setProgress(100);
      setTimeout(() => setResult({
        pet_name: selectedPet.name,
        prompt_used: prompt || `A ${selectedPet.personality_type} ${PET_SPECIES[selectedPet.species]} named ${selectedPet.name} in ${STYLES[style].name.toLowerCase()} style`,
        image_url: null,
      }), 300);
    }
    setGenerating(false);
  };

  const useSuggestion = (s) => {
    setPrompt(`${selectedPet?.name || "My pet"} ${s.toLowerCase()}`);
  };

  const creditCost = genType === "video" ? (duration <= 3 ? 15 : duration <= 5 ? 30 : 60) : 1;

  if (pets.length === 0) {
    return (
      <div style={{ padding: "120px 40px", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
        <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.5 }}>🐾</div>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, color: "white", marginBottom: 12 }}>
          Adopt a Pet First
        </h2>
        <p style={{ fontFamily: "mono", fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.8 }}>
          Go to the "My Pet" tab to adopt your first AI pet, then come back here to generate personalized content.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px", maxWidth: 920, margin: "0 auto", paddingTop: 100 }}>
      <div style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.008))",
        borderRadius: 20, border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "22px 28px", borderBottom: "1px solid rgba(255,255,255,0.04)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🎨</span>
            <div>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600, color: "white" }}>
                Pet Content Studio
              </span>
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <span style={{
                  fontSize: 8, padding: "2px 7px", borderRadius: 8,
                  background: "rgba(251,191,36,0.08)", color: "#fbbf24", fontFamily: "mono", fontWeight: 600,
                  border: "1px solid rgba(251,191,36,0.15)",
                }}>Grok AI</span>
                <span style={{
                  fontSize: 8, padding: "2px 7px", borderRadius: 8,
                  background: "rgba(139,92,246,0.08)", color: "#a78bfa", fontFamily: "mono", fontWeight: 600,
                  border: "1px solid rgba(139,92,246,0.15)",
                }}>Kling 3.0</span>
              </div>
            </div>
          </div>
          <div style={{
            padding: "6px 14px", borderRadius: 10,
            background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)",
          }}>
            <span style={{ fontFamily: "mono", fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>
              {creditCost} credits
            </span>
          </div>
        </div>

        <div style={{ padding: 28 }}>
          <div style={{ display: "flex", gap: 24 }}>
            {/* Left: Pet selection + preview */}
            <div style={{ flex: 1 }}>
              {/* Pet selector */}
              <div style={{ marginBottom: 18 }}>
                <label style={{
                  fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Choose Your Pet
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {pets.map(p => (
                    <button key={p.id} onClick={() => setSelectedPet(p)} style={{
                      background: selectedPet?.id === p.id ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.02)",
                      border: selectedPet?.id === p.id ? "2px solid rgba(251,191,36,0.3)" : "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 12, padding: "10px 14px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s",
                    }}>
                      <img src={PET_IMAGES[p.species] || PET_IMAGES[0]} alt={PET_SPECIES[p.species]}
                        style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }} />
                      <div style={{ textAlign: "left" }}>
                        <div style={{
                          fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600,
                          color: selectedPet?.id === p.id ? "#fde68a" : "rgba(255,255,255,0.4)",
                        }}>
                          {p.name}
                        </div>
                        <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.2)" }}>
                          Lv.{p.level} · {p.personality_type}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview area */}
              {selectedPet && !result && (
                <div style={{
                  background: "rgba(255,255,255,0.015)", borderRadius: 16, padding: 24, textAlign: "center",
                  border: "1px solid rgba(255,255,255,0.04)", minHeight: 240,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  position: "relative", overflow: "hidden",
                }}>
                  {generating ? (
                    <>
                      <img src={PET_IMAGES[selectedPet.species] || PET_IMAGES[0]} alt={PET_SPECIES[selectedPet.species]}
                        style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover", marginBottom: 16, animation: "pulse 1.5s ease-in-out infinite" }} />
                      <div style={{ width: "80%", maxWidth: 200, marginBottom: 12 }}>
                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 2,
                            background: "linear-gradient(90deg, #f59e0b, #fbbf24)",
                            width: `${Math.min(100, progress)}%`,
                            transition: "width 0.5s ease",
                          }} />
                        </div>
                      </div>
                      <div style={{ fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                        {progress < 30 ? "Analyzing pet personality..." :
                         progress < 60 ? "Crafting prompt with Grok AI..." :
                         progress < 85 ? `Generating ${genType}...` :
                         "Almost done..."}
                      </div>
                    </>
                  ) : (
                    <>
                      <img src={PET_IMAGES[selectedPet.species] || PET_IMAGES[0]} alt={PET_SPECIES[selectedPet.species]}
                        style={{ width: 80, height: 80, borderRadius: 20, objectFit: "cover", marginBottom: 10 }} />
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, color: "white", marginBottom: 4, fontWeight: 600 }}>
                        {selectedPet.name}
                      </div>
                      <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 12 }}>
                        {selectedPet.personality_type} · mood: {selectedPet.current_mood}
                      </div>
                      <div style={{
                        fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.15)",
                        maxWidth: 240, lineHeight: 1.6,
                      }}>
                        AI will generate content based on {selectedPet.name}'s unique personality and current mood
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Result */}
              {result && (
                <div style={{
                  borderRadius: 16, overflow: "hidden",
                  border: "1px solid rgba(74,222,128,0.15)",
                  animation: "slideIn 0.4s ease-out",
                }}>
                  {result.image_url && (
                    <img src={result.image_url} alt={result.pet_name}
                      style={{ width: "100%", borderRadius: "16px 16px 0 0" }} />
                  )}
                  <div style={{ padding: 16, background: "rgba(74,222,128,0.03)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%", background: "#4ade80",
                        boxShadow: "0 0 6px rgba(74,222,128,0.5)",
                      }} />
                      <span style={{ fontFamily: "mono", fontSize: 12, color: "#4ade80", fontWeight: 600 }}>
                        Generated Successfully!
                      </span>
                    </div>
                    <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
                      {result.prompt_used?.slice(0, 200)}...
                    </div>
                    <button onClick={() => setResult(null)} style={{
                      marginTop: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 8, padding: "8px 16px", cursor: "pointer",
                      fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.4)",
                    }}>
                      Generate Another
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Controls */}
            <div style={{ width: 320, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Type toggle */}
              <div>
                <label style={{
                  fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Generation Type
                </label>
                <div style={{
                  display: "flex", gap: 4, padding: 3, borderRadius: 10,
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                }}>
                  {[
                    { key: "image", label: "Image", icon: "🖼" },
                    { key: "video", label: "Video", icon: "🎬" },
                  ].map(t => (
                    <button key={t.key} onClick={() => setGenType(t.key)} style={{
                      flex: 1,
                      background: genType === t.key ? "rgba(251,191,36,0.1)" : "transparent",
                      border: "none", borderRadius: 8, padding: "10px",
                      fontFamily: "mono", fontSize: 12,
                      color: genType === t.key ? "#fde68a" : "rgba(255,255,255,0.3)",
                      cursor: "pointer", transition: "all 0.2s",
                    }}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label style={{
                  fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Prompt (Optional)
                </label>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder={`Describe a scene for ${selectedPet?.name || "your pet"}...`}
                  style={{
                    width: "100%", height: 80, borderRadius: 12, background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)", padding: 14, resize: "none",
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "white",
                    outline: "none", boxSizing: "border-box", lineHeight: 1.5,
                    transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = "rgba(251,191,36,0.25)"}
                  onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.06)"}
                />
                {/* Suggestions */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                  {PROMPT_SUGGESTIONS.slice(0, 3).map(s => (
                    <button key={s} onClick={() => useSuggestion(s)} style={{
                      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                      borderRadius: 6, padding: "3px 8px", cursor: "pointer",
                      fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.2)",
                      transition: "all 0.2s",
                    }}>
                      {s.split(" ").slice(0, 3).join(" ")}...
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div>
                <label style={{
                  fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Style
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {STYLES.map((s, idx) => (
                    <button key={s.name} onClick={() => setStyle(idx)} style={{
                      background: style === idx ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.02)",
                      border: style === idx ? "1px solid rgba(251,191,36,0.25)" : "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 10, padding: "8px 12px", cursor: "pointer",
                      transition: "all 0.2s",
                    }}>
                      <div style={{ fontSize: 14, marginBottom: 2 }}>{s.icon}</div>
                      <div style={{
                        fontFamily: "mono", fontSize: 10,
                        color: style === idx ? "#fde68a" : "rgba(255,255,255,0.35)",
                      }}>{s.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration (video only) */}
              {genType === "video" && (
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                      Duration
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[3, 5, 10].map(d => (
                      <button key={d} onClick={() => setDuration(d)} style={{
                        flex: 1, padding: "8px", borderRadius: 8, cursor: "pointer",
                        background: d === duration ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.02)",
                        border: d === duration ? "1px solid rgba(251,191,36,0.25)" : "1px solid rgba(255,255,255,0.04)",
                        fontFamily: "mono", fontSize: 12, fontWeight: 600,
                        color: d === duration ? "#fde68a" : "rgba(255,255,255,0.2)",
                        transition: "all 0.2s",
                      }}>
                        {d}s
                        <div style={{ fontFamily: "mono", fontSize: 8, color: "rgba(255,255,255,0.15)", marginTop: 2 }}>
                          {d <= 3 ? "15 cr" : d <= 5 ? "30 cr" : "60 cr"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  padding: "12px 16px", borderRadius: 12, background: "rgba(248,113,113,0.05)",
                  border: "1px solid rgba(248,113,113,0.15)", display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 14 }}>⚠️</span>
                  <span style={{ fontFamily: "mono", fontSize: 11, color: "#f87171" }}>{error}</span>
                </div>
              )}

              {/* Generate button */}
              <button onClick={handleGenerate} disabled={!selectedPet || generating} style={{
                marginTop: "auto", width: "100%",
                background: generating
                  ? "rgba(255,255,255,0.03)"
                  : "linear-gradient(135deg,#f59e0b,#d97706)",
                border: "none", borderRadius: 12, padding: "14px 0",
                fontFamily: "mono", fontSize: 13, fontWeight: 600,
                color: generating ? "rgba(255,255,255,0.15)" : "white",
                cursor: generating ? "not-allowed" : "pointer",
                boxShadow: generating ? "none" : "0 0 28px rgba(245,158,11,0.25)",
                transition: "all 0.3s",
              }}>
                {generating
                  ? `Generating ${genType}...`
                  : `Generate ${genType === "video" ? "Video" : "Image"} for ${selectedPet?.name || "Pet"}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

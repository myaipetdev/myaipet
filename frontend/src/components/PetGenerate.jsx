import { useState, useEffect, useRef } from "react";
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

const GALLERY_IMAGES = [
  "/gallery/cat_astro.jpg", "/gallery/cat_cloud.jpg", "/gallery/cat_dj.jpg",
  "/gallery/corgi_sunflower.jpg", "/gallery/dog_skate.jpg", "/gallery/fox_autumn.jpg",
  "/gallery/hamster_ship.jpg", "/gallery/pom_hero.jpg", "/gallery/rabbit_tea.jpg",
  "/gallery/turtle_zen.jpg", "/gallery/wolf_moon.jpg", "/gallery/cat_moon.jpg",
  "/gallery/fox_witch.jpg", "/gallery/rabbit_samurai.jpg", "/gallery/dragon_cat.jpg",
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
  const [statusText, setStatusText] = useState("");
  const [history, setHistory] = useState([]);
  const pollRef = useRef(null);

  useEffect(() => {
    loadPets();
    loadHistory();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Animated progress during generation
  useEffect(() => {
    if (!generating) { setProgress(0); return; }
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return prev;
        return prev + Math.random() * 4 + 1;
      });
    }, 600);
    return () => clearInterval(timer);
  }, [generating]);

  const loadPets = async () => {
    try {
      const list = await api.pets.list();
      setPets(list);
      if (list.length > 0) setSelectedPet(list[0]);
    } catch {
      setPets(MOCK_PETS);
      setSelectedPet(MOCK_PETS[0]);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await api.generate.history(1, 6);
      setHistory(data.items || []);
    } catch {
      // no history in demo mode
    }
  };

  // Poll for generation status (video can take time)
  const pollStatus = (generationId) => {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const status = await api.generate.status(generationId);
          if (status.status === "completed") {
            clearInterval(pollRef.current);
            pollRef.current = null;
            resolve(status);
          } else if (status.status === "failed") {
            clearInterval(pollRef.current);
            pollRef.current = null;
            reject(new Error("Generation failed"));
          } else {
            // Update progress text
            if (status.status === "processing") setStatusText("AI is creating your content...");
            else if (status.status === "queued") setStatusText("In queue, waiting...");
          }
          if (attempts > 60) { // 5 min timeout
            clearInterval(pollRef.current);
            pollRef.current = null;
            reject(new Error("Generation timed out"));
          }
        } catch {
          if (attempts > 3) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            reject(new Error("Lost connection"));
          }
        }
      }, 5000);
    });
  };

  const handleGenerate = async () => {
    if (!selectedPet || generating) return;
    setGenerating(true);
    setResult(null);
    setError(null);
    setStatusText("Connecting to AI engine...");

    try {
      // Step 1: Submit generation request
      setStatusText("Analyzing pet personality...");
      const res = await api.pets.generate(selectedPet.id, {
        style,
        duration,
        prompt: prompt || undefined,
        type: genType,
      });

      // Step 2: If completed immediately (image), show result
      if (res.status === "completed" || res.image_url) {
        setProgress(100);
        setStatusText("Done!");
        setTimeout(() => {
          setResult(res);
          setGenerating(false);
          loadHistory();
        }, 400);
        return;
      }

      // Step 3: If queued (video), poll for completion
      if (res.generation_id && (res.status === "queued" || res.status === "processing")) {
        setStatusText("Video is being generated...");
        setProgress(40);
        const completed = await pollStatus(res.generation_id);
        setProgress(100);
        setStatusText("Done!");
        setTimeout(() => {
          setResult(completed);
          setGenerating(false);
          loadHistory();
        }, 400);
        return;
      }

      // Fallback - treat as completed
      setProgress(100);
      setTimeout(() => {
        setResult(res);
        setGenerating(false);
      }, 400);

    } catch (e) {
      // Demo/mock fallback
      const randomImg = GALLERY_IMAGES[Math.floor(Math.random() * GALLERY_IMAGES.length)];
      const isVideo = genType === "video";

      if (isVideo) {
        setStatusText("Generating video frames...");
        setProgress(30);
        await new Promise(r => setTimeout(r, 1200));
        setStatusText("Compositing video...");
        setProgress(60);
        await new Promise(r => setTimeout(r, 1000));
        setStatusText("Rendering final output...");
        setProgress(90);
        await new Promise(r => setTimeout(r, 800));
      } else {
        setStatusText("Generating image...");
        await new Promise(r => setTimeout(r, 600));
      }

      setProgress(100);
      setStatusText("Done!");
      setTimeout(() => {
        setResult({
          pet_name: selectedPet.name,
          prompt_used: prompt || `A ${selectedPet.personality_type} ${PET_SPECIES[selectedPet.species]} named ${selectedPet.name} in ${STYLES[style].name.toLowerCase()} style`,
          image_url: randomImg,
          style_name: STYLES[style].name,
          gen_type: genType,
          duration: isVideo ? duration : undefined,
          demo: true,
        });
        setGenerating(false);
      }, 400);
    }
  };

  const useSuggestion = (s) => {
    setPrompt(`${selectedPet?.name || "My pet"} ${s.toLowerCase()}`);
  };

  const creditCost = genType === "video" ? (duration <= 3 ? 15 : duration <= 5 ? 30 : 60) : 1;

  if (pets.length === 0) {
    return (
      <div style={{ padding: "120px 40px", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
        <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.5 }}>🐾</div>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, color: "#1a1a2e", marginBottom: 12 }}>
          Adopt a Pet First
        </h2>
        <p style={{ fontFamily: "mono", fontSize: 12, color: "rgba(26,26,46,0.5)", lineHeight: 1.8 }}>
          Go to the "My Pet" tab to adopt your first AI pet, then come back here to generate personalized content.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px", maxWidth: 960, margin: "0 auto", paddingTop: 100 }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        @keyframes slideIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes shimmer { 0% { background-position:-200% 0 } 100% { background-position:200% 0 } }
      `}</style>

      <div style={{
        background: "rgba(255,255,255,0.85)",
        borderRadius: 20, border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 28px", borderBottom: "1px solid rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🎨</span>
            <div>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>
                Pet Content Studio
              </span>
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <span style={{
                  fontSize: 8, padding: "2px 7px", borderRadius: 8,
                  background: "rgba(251,191,36,0.1)", color: "#b45309", fontFamily: "mono", fontWeight: 600,
                  border: "1px solid rgba(251,191,36,0.2)",
                }}>Grok AI</span>
                <span style={{
                  fontSize: 8, padding: "2px 7px", borderRadius: 8,
                  background: "rgba(139,92,246,0.08)", color: "#7c3aed", fontFamily: "mono", fontWeight: 600,
                  border: "1px solid rgba(139,92,246,0.15)",
                }}>Kling 3.0</span>
              </div>
            </div>
          </div>
          <div style={{
            padding: "6px 14px", borderRadius: 10,
            background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)",
          }}>
            <span style={{ fontFamily: "mono", fontSize: 11, color: "#b45309", fontWeight: 600 }}>
              🪙 {creditCost} $PET
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
                  fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.45)",
                  textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Choose Your Pet
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {pets.map(p => (
                    <button key={p.id} onClick={() => setSelectedPet(p)} style={{
                      background: selectedPet?.id === p.id ? "rgba(251,191,36,0.1)" : "rgba(0,0,0,0.02)",
                      border: selectedPet?.id === p.id ? "2px solid rgba(251,191,36,0.3)" : "1px solid rgba(0,0,0,0.06)",
                      borderRadius: 12, padding: "10px 14px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s",
                    }}>
                      <img src={PET_IMAGES[p.species] || PET_IMAGES[0]} alt={PET_SPECIES[p.species]}
                        style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }} />
                      <div style={{ textAlign: "left" }}>
                        <div style={{
                          fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600,
                          color: selectedPet?.id === p.id ? "#b45309" : "rgba(26,26,46,0.5)",
                        }}>
                          {p.name}
                        </div>
                        <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)" }}>
                          Lv.{p.level} · {p.personality_type}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview / Generation / Result area */}
              <div style={{
                background: "rgba(0,0,0,0.02)", borderRadius: 16,
                border: "1px solid rgba(0,0,0,0.06)", minHeight: 320,
                position: "relative", overflow: "hidden",
              }}>
                {/* Result */}
                {result ? (
                  <div style={{ animation: "slideIn 0.4s ease-out" }}>
                    {result.video_url ? (
                      <video src={result.video_url} controls autoPlay loop muted playsInline
                        style={{ width: "100%", borderRadius: "16px 16px 0 0", display: "block" }} />
                    ) : result.image_url ? (
                      <img src={result.image_url} alt={result.pet_name}
                        style={{ width: "100%", borderRadius: "16px 16px 0 0", display: "block" }} />
                    ) : null}
                    <div style={{ padding: 18 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%", background: "#4ade80",
                          boxShadow: "0 0 6px rgba(74,222,128,0.5)",
                        }} />
                        <span style={{ fontFamily: "mono", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
                          {result.demo ? "Demo Preview" : "Generated Successfully!"}
                        </span>
                        {result.style_name && (
                          <span style={{
                            fontSize: 9, padding: "2px 8px", borderRadius: 6,
                            background: "rgba(251,191,36,0.1)", color: "#b45309",
                            fontFamily: "mono", fontWeight: 600,
                          }}>{result.style_name}</span>
                        )}
                      </div>
                      <div style={{
                        fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.45)",
                        lineHeight: 1.7, marginBottom: 14,
                        padding: "10px 12px", borderRadius: 8,
                        background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.04)",
                      }}>
                        "{result.prompt_used}"
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setResult(null)} style={{
                          flex: 1, background: "linear-gradient(135deg,#f59e0b,#d97706)",
                          border: "none", borderRadius: 10, padding: "11px",
                          fontFamily: "mono", fontSize: 12, color: "white", cursor: "pointer",
                          fontWeight: 600, boxShadow: "0 0 20px rgba(245,158,11,0.2)",
                        }}>
                          Generate Another
                        </button>
                        {result.image_url && !result.demo && (
                          <a href={result.image_url} download style={{
                            padding: "11px 16px", borderRadius: 10,
                            background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.08)",
                            fontFamily: "mono", fontSize: 12, color: "rgba(26,26,46,0.5)",
                            textDecoration: "none", display: "flex", alignItems: "center",
                          }}>
                            ↓ Save
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ) : generating ? (
                  /* Generating state */
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", padding: 40, minHeight: 320,
                  }}>
                    <div style={{ position: "relative", marginBottom: 24 }}>
                      <img src={PET_IMAGES[selectedPet.species] || PET_IMAGES[0]}
                        alt={PET_SPECIES[selectedPet.species]}
                        style={{
                          width: 80, height: 80, borderRadius: 20, objectFit: "cover",
                          animation: "pulse 2s ease-in-out infinite",
                          border: "3px solid rgba(251,191,36,0.3)",
                        }} />
                      <div style={{
                        position: "absolute", bottom: -4, right: -4,
                        width: 24, height: 24, borderRadius: "50%",
                        background: "linear-gradient(135deg,#f59e0b,#d97706)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, animation: "pulse 1s ease-in-out infinite",
                      }}>
                        {genType === "video" ? "🎬" : "🖼"}
                      </div>
                    </div>
                    <div style={{ width: "70%", maxWidth: 240, marginBottom: 14 }}>
                      <div style={{ height: 5, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 3,
                          background: "linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)",
                          backgroundSize: "200% 100%",
                          animation: "shimmer 1.5s ease-in-out infinite",
                          width: `${Math.min(100, progress)}%`,
                          transition: "width 0.6s ease",
                        }} />
                      </div>
                      <div style={{
                        display: "flex", justifyContent: "space-between", marginTop: 4,
                        fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.3)",
                      }}>
                        <span>{statusText}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                    </div>
                    <div style={{
                      fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
                      color: "rgba(26,26,46,0.6)", fontWeight: 500,
                    }}>
                      Creating {genType} for {selectedPet.name}
                    </div>
                  </div>
                ) : (
                  /* Idle state - pet preview */
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", padding: 40, minHeight: 320,
                  }}>
                    <img src={PET_IMAGES[selectedPet?.species] || PET_IMAGES[0]}
                      alt={PET_SPECIES[selectedPet?.species]}
                      style={{ width: 96, height: 96, borderRadius: 24, objectFit: "cover", marginBottom: 14 }} />
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, color: "#1a1a2e", marginBottom: 4, fontWeight: 600 }}>
                      {selectedPet?.name}
                    </div>
                    <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.4)", marginBottom: 16 }}>
                      {selectedPet?.personality_type} · mood: {selectedPet?.current_mood} · Lv.{selectedPet?.level}
                    </div>
                    <div style={{
                      fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.3)",
                      maxWidth: 280, lineHeight: 1.7, textAlign: "center",
                    }}>
                      AI generates content based on {selectedPet?.name}'s personality and mood.
                      Choose a style and prompt, then hit generate!
                    </div>
                  </div>
                )}
              </div>

              {/* Recent generations */}
              {history.length > 0 && !result && !generating && (
                <div style={{ marginTop: 16 }}>
                  <div style={{
                    fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.4)",
                    marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
                  }}>
                    Recent Creations
                  </div>
                  <div style={{ display: "flex", gap: 6, overflow: "auto" }}>
                    {history.slice(0, 6).map((h, i) => (
                      <div key={h.id || i} style={{
                        width: 72, height: 72, borderRadius: 10, overflow: "hidden",
                        flexShrink: 0, cursor: "pointer", border: "1px solid rgba(0,0,0,0.06)",
                      }} onClick={() => setResult(h)}>
                        {h.photo_url || h.image_url ? (
                          <img src={h.photo_url || h.image_url} alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{
                            width: "100%", height: "100%",
                            background: "rgba(0,0,0,0.03)", display: "flex",
                            alignItems: "center", justifyContent: "center", fontSize: 20,
                          }}>
                            {h.video_url ? "🎬" : "🖼"}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Controls */}
            <div style={{ width: 320, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Type toggle */}
              <div>
                <label style={{
                  fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.45)",
                  textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Generation Type
                </label>
                <div style={{
                  display: "flex", gap: 4, padding: 3, borderRadius: 10,
                  background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)",
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
                      color: genType === t.key ? "#b45309" : "rgba(26,26,46,0.4)",
                      cursor: "pointer", transition: "all 0.2s", fontWeight: genType === t.key ? 600 : 400,
                    }}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label style={{
                  fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.45)",
                  textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Prompt (Optional)
                </label>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder={`Describe a scene for ${selectedPet?.name || "your pet"}...`}
                  maxLength={500}
                  style={{
                    width: "100%", height: 80, borderRadius: 12, background: "rgba(0,0,0,0.02)",
                    border: "1px solid rgba(0,0,0,0.08)", padding: 14, resize: "none",
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "#1a1a2e",
                    outline: "none", boxSizing: "border-box", lineHeight: 1.5,
                    transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = "rgba(245,158,11,0.4)"}
                  onBlur={e => e.target.style.borderColor = "rgba(0,0,0,0.08)"}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {PROMPT_SUGGESTIONS.slice(0, 3).map(s => (
                      <button key={s} onClick={() => useSuggestion(s)} style={{
                        background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)",
                        borderRadius: 6, padding: "3px 8px", cursor: "pointer",
                        fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.4)",
                        transition: "all 0.2s",
                      }}>
                        {s.split(" ").slice(0, 3).join(" ")}...
                      </button>
                    ))}
                  </div>
                  <span style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.25)" }}>
                    {prompt.length}/500
                  </span>
                </div>
              </div>

              {/* Style */}
              <div>
                <label style={{
                  fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.45)",
                  textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Style
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {STYLES.map((s, idx) => (
                    <button key={s.name} onClick={() => setStyle(idx)} style={{
                      background: style === idx ? "rgba(251,191,36,0.1)" : "rgba(0,0,0,0.02)",
                      border: style === idx ? "1px solid rgba(251,191,36,0.25)" : "1px solid rgba(0,0,0,0.06)",
                      borderRadius: 10, padding: "8px 12px", cursor: "pointer",
                      transition: "all 0.2s",
                    }}>
                      <div style={{ fontSize: 14, marginBottom: 2 }}>{s.icon}</div>
                      <div style={{
                        fontFamily: "mono", fontSize: 10,
                        color: style === idx ? "#b45309" : "rgba(26,26,46,0.5)",
                      }}>{s.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration (video only) */}
              {genType === "video" && (
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.1)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.45)", fontWeight: 600 }}>
                      Video Duration
                    </span>
                    <span style={{ fontFamily: "mono", fontSize: 9, color: "#7c3aed" }}>
                      Kling 3.0
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[3, 5, 10].map(d => (
                      <button key={d} onClick={() => setDuration(d)} style={{
                        flex: 1, padding: "8px", borderRadius: 8, cursor: "pointer",
                        background: d === duration ? "rgba(251,191,36,0.1)" : "rgba(0,0,0,0.02)",
                        border: d === duration ? "1px solid rgba(251,191,36,0.25)" : "1px solid rgba(0,0,0,0.06)",
                        fontFamily: "mono", fontSize: 12, fontWeight: 600,
                        color: d === duration ? "#b45309" : "rgba(26,26,46,0.35)",
                        transition: "all 0.2s",
                      }}>
                        {d}s
                        <div style={{ fontFamily: "mono", fontSize: 8, color: "rgba(26,26,46,0.3)", marginTop: 2 }}>
                          🪙 {d <= 3 ? "15" : d <= 5 ? "30" : "60"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  padding: "12px 16px", borderRadius: 12, background: "rgba(248,113,113,0.06)",
                  border: "1px solid rgba(248,113,113,0.15)", display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 14 }}>⚠️</span>
                  <span style={{ fontFamily: "mono", fontSize: 11, color: "#dc2626" }}>{error}</span>
                </div>
              )}

              {/* Generate button */}
              <button onClick={handleGenerate} disabled={!selectedPet || generating} style={{
                marginTop: "auto", width: "100%",
                background: generating
                  ? "rgba(0,0,0,0.04)"
                  : "linear-gradient(135deg,#f59e0b,#d97706)",
                border: "none", borderRadius: 12, padding: "14px 0",
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600,
                color: generating ? "rgba(26,26,46,0.25)" : "white",
                cursor: generating ? "not-allowed" : "pointer",
                boxShadow: generating ? "none" : "0 0 28px rgba(245,158,11,0.25)",
                transition: "all 0.3s",
                letterSpacing: "-0.01em",
              }}>
                {generating
                  ? `Generating ${genType}...`
                  : `✨ Generate ${genType === "video" ? "Video" : "Image"}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

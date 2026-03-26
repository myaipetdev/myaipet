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

const VIDEO_TIERS = [
  {
    key: "budget",
    label: "💰 Budget",
    model: "Hailuo 02 Fast",
    resolution: "768p",
    costPer5s: "$0.10",
    creditMultiplier: 0.5,
    accent: "#22c55e",
    accentBg: "rgba(34,197,94,0.08)",
    accentBorder: "rgba(34,197,94,0.25)",
    accentGlow: "rgba(34,197,94,0.4)",
  },
  {
    key: "standard",
    label: "⚡ Standard",
    model: "Hailuo 02 Standard",
    resolution: "768p",
    costPer5s: "$0.23",
    creditMultiplier: 1,
    accent: "#3b82f6",
    accentBg: "rgba(59,130,246,0.08)",
    accentBorder: "rgba(59,130,246,0.25)",
    accentGlow: "rgba(59,130,246,0.4)",
  },
  {
    key: "premium",
    label: "✨ Premium",
    model: "Kling 3.0 Standard",
    resolution: "1080p",
    costPer5s: "$0.42",
    creditMultiplier: 2,
    badge: "RECOMMENDED",
    accent: "#a855f7",
    accentBg: "rgba(168,85,247,0.08)",
    accentBorder: "rgba(168,85,247,0.25)",
    accentGlow: "rgba(168,85,247,0.45)",
  },
  {
    key: "ultra",
    label: "👑 Ultra",
    model: "Kling 3.0 Pro",
    resolution: "1080p",
    costPer5s: "$0.56",
    creditMultiplier: 3,
    accent: "#eab308",
    accentBg: "rgba(234,179,8,0.08)",
    accentBorder: "rgba(234,179,8,0.25)",
    accentGlow: "rgba(234,179,8,0.45)",
  },
];

// Map tier key to USD cost per 5s for estimation
const TIER_USD = { budget: 0.10, standard: 0.23, premium: 0.42, ultra: 0.56 };

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
  const [tier, setTier] = useState("premium");

  useEffect(() => {
    loadPets();
  }, []);

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

  const selectedTier = VIDEO_TIERS.find(t => t.key === tier) || VIDEO_TIERS[2];

  const baseCredits = duration <= 3 ? 15 : duration <= 5 ? 30 : 60;
  const creditCost = genType === "video"
    ? Math.round(baseCredits * selectedTier.creditMultiplier)
    : 1;

  const estimatedUsd = genType === "video"
    ? (TIER_USD[tier] * (duration / 5)).toFixed(2)
    : null;

  const handleGenerate = async () => {
    if (!selectedPet || generating) return;
    setGenerating(true);
    setResult(null);
    setError(null);
    try {
      const body = {
        style,
        duration,
        prompt: prompt || undefined,
        type: genType,
      };
      if (genType === "video") {
        body.tier = tier;
      }
      const res = await api.pets.generate(selectedPet.id, body);
      setProgress(100);
      setTimeout(() => setResult({
        ...res,
        _tier: tier,
        _model: selectedTier.model,
        _estimatedCost: estimatedUsd,
      }), 300);
    } catch (e) {
      setProgress(100);
      setTimeout(() => {
        setError("Backend server is not connected. Deploy the backend first to enable generation.");
        setResult(null);
      }, 300);
    }
    setGenerating(false);
  };

  const useSuggestion = (s) => {
    setPrompt(`${selectedPet?.name || "My pet"} ${s.toLowerCase()}`);
  };

  if (pets.length === 0) {
    return (
      <div className="max-w-md mx-auto pt-32 px-10 text-center">
        <div className="text-6xl mb-4 opacity-50">🐾</div>
        <h2 className="font-heading text-2xl text-[#422D26] mb-3">Adopt a Pet First</h2>
        <p className="font-body text-xs text-pink/60 leading-relaxed">
          Go to the "My Pet" tab to adopt your first AI pet, then come back here to generate personalized content.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[920px] mx-auto px-6 sm:px-10 pt-32 pb-24">
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl sticker-border overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,134,183,0.08)" }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎨</span>
            <div>
              <span className="font-heading text-base text-[#422D26]">Pet Content Studio</span>
              <div className="flex gap-1.5 mt-1">
                <span className="font-body text-xs font-bold px-2 py-0.5 rounded-full bg-sun/10 text-sun-dark border border-sun/20">
                  Grok AI
                </span>
                <span className="font-body text-xs font-bold px-2 py-0.5 rounded-full bg-lavender/10 text-lavender border border-lavender/20">
                  {genType === "video" ? selectedTier.model : "Kling 3.0"}
                </span>
              </div>
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-2xl bg-sun/10 border border-sun/15">
            <span className="font-body text-xs text-sun-dark font-bold">
              {creditCost} credits
              {estimatedUsd && genType === "video" && (
                <span className="text-sun-dark/60 ml-1">(~{estimatedUsd} USD)</span>
              )}
            </span>
          </div>
        </div>

        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Left: Pet selection + preview */}
            <div className="flex-1">
              {/* Pet selector */}
              <div className="mb-5">
                <label className="font-body text-xs text-pink/70 uppercase tracking-widest font-bold block mb-2">
                  Choose Your Pet
                </label>
                <div className="flex gap-2 flex-wrap">
                  {pets.map(p => (
                    <button key={p.id} onClick={() => setSelectedPet(p)}
                      className={`squishy flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-all
                        ${selectedPet?.id === p.id
                          ? "bg-pink/10 border-2 border-pink/25"
                          : "bg-cream-dark/50 border border-cream-dark hover:bg-cream-dark"
                        }`}>
                      <img src={PET_IMAGES[p.species] || PET_IMAGES[0]} alt={PET_SPECIES[p.species]}
                        className="w-7 h-7 rounded-lg object-cover" />
                      <div className="text-left">
                        <div className={`font-heading text-xs ${selectedPet?.id === p.id ? "text-pink" : "text-[#422D26]/65"}`}>
                          {p.name}
                        </div>
                        <div className="font-body text-xs text-[#422D26]/60">
                          Lv.{p.level} · {p.personality_type}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview area */}
              {selectedPet && !result && (
                <div className="bg-cream-dark/40 rounded-3xl p-6 text-center sticker-border min-h-[240px] flex flex-col items-center justify-center relative overflow-hidden">
                  {generating ? (
                    <>
                      <img src={PET_IMAGES[selectedPet.species] || PET_IMAGES[0]} alt={PET_SPECIES[selectedPet.species]}
                        className="w-16 h-16 rounded-2xl object-cover mb-4 animate-pulse" />
                      <div className="w-4/5 max-w-[200px] mb-3">
                        <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{
                              width: `${Math.min(100, progress)}%`,
                              background: "linear-gradient(90deg, #FF86B7, #FFD23F, #70D6FF)",
                            }} />
                        </div>
                      </div>
                      <div className="font-body text-xs text-pink/60">
                        {progress < 30 ? "Analyzing pet personality..." :
                         progress < 60 ? "Crafting prompt with Grok AI..." :
                         progress < 85 ? `Generating ${genType}${genType === "video" ? ` via ${selectedTier.model}` : ""}...` :
                         "Almost done..."}
                      </div>
                    </>
                  ) : (
                    <>
                      <img src={PET_IMAGES[selectedPet.species] || PET_IMAGES[0]} alt={PET_SPECIES[selectedPet.species]}
                        className="w-20 h-20 rounded-2xl object-cover mb-3 sticker-border" />
                      <div className="font-heading text-xl text-[#422D26] mb-1">{selectedPet.name}</div>
                      <div className="font-body text-xs text-pink/70 mb-3">
                        {selectedPet.personality_type} · mood: {selectedPet.current_mood}
                      </div>
                      <div className="font-body text-xs text-pink/60 max-w-[240px] leading-relaxed">
                        AI will generate content based on {selectedPet.name}'s unique personality and current mood
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Result */}
              {result && (
                <div className="rounded-3xl overflow-hidden sticker-border animate-slide-up"
                  style={{ border: "2px solid rgba(74,222,128,0.2)" }}>
                  {result.image_url && (
                    <img src={result.image_url} alt={result.pet_name} className="w-full rounded-t-3xl" />
                  )}
                  <div className="p-5 bg-mint/5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-[#4ade80]"
                        style={{ boxShadow: "0 0 6px rgba(74,222,128,0.5)" }} />
                      <span className="font-body text-sm text-[#4ade80] font-bold">Generated Successfully!</span>
                    </div>
                    {/* Show model & cost info for video results */}
                    {result._model && genType === "video" && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        <span className="font-body text-xs font-bold px-2 py-0.5 rounded-full border"
                          style={{
                            backgroundColor: (VIDEO_TIERS.find(t => t.key === result._tier) || selectedTier).accentBg,
                            borderColor: (VIDEO_TIERS.find(t => t.key === result._tier) || selectedTier).accentBorder,
                            color: (VIDEO_TIERS.find(t => t.key === result._tier) || selectedTier).accent,
                          }}>
                          Model: {result._model}
                        </span>
                        {result._estimatedCost && (
                          <span className="font-body text-xs font-bold px-2 py-0.5 rounded-full bg-sun/10 text-sun-dark border border-sun/20">
                            Est. cost: ~${result._estimatedCost}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="font-body text-xs text-[#422D26]/65 leading-relaxed">
                      {result.prompt_used?.slice(0, 200)}...
                    </div>
                    <button onClick={() => setResult(null)}
                      className="squishy mt-3 bg-cream-dark/60 hover:bg-cream-dark rounded-2xl px-4 py-2
                        font-body text-xs text-[#422D26]/60 font-bold transition-all">
                      Generate Another
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Controls */}
            <div className="w-full sm:w-[320px] flex flex-col gap-4">
              {/* Type toggle */}
              <div>
                <label className="font-body text-xs text-pink/70 uppercase tracking-widest font-bold block mb-2">
                  Generation Type
                </label>
                <div className="flex gap-1 p-1 rounded-full bg-cream-dark/50 sticker-border">
                  {[
                    { key: "image", label: "Image", icon: "🖼" },
                    { key: "video", label: "Video", icon: "🎬" },
                  ].map(t => (
                    <button key={t.key} onClick={() => setGenType(t.key)}
                      className={`squishy flex-1 py-2.5 rounded-full font-body text-sm font-bold transition-all
                        ${genType === t.key
                          ? "bg-pink text-white shadow-md"
                          : "text-pink/60 hover:text-pink/60"
                        }`}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Video Tier Selector (video only) */}
              {genType === "video" && (
                <div>
                  <label className="font-body text-xs text-pink/70 uppercase tracking-widest font-bold block mb-2">
                    Video Quality Tier
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {VIDEO_TIERS.map(t => {
                      const isSelected = tier === t.key;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setTier(t.key)}
                          className="squishy relative rounded-2xl p-3 text-left transition-all"
                          style={{
                            backgroundColor: isSelected ? t.accentBg : "rgba(255,255,255,0.5)",
                            border: isSelected ? `2px solid ${t.accentBorder}` : "1px solid rgba(255,134,183,0.08)",
                            boxShadow: isSelected ? `0 0 16px ${t.accentGlow}` : "none",
                          }}
                        >
                          {t.badge && (
                            <span
                              className="absolute -top-1.5 right-2 font-body text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: t.accent }}
                            >
                              {t.badge}
                            </span>
                          )}
                          <div
                            className="font-heading text-xs mb-1"
                            style={{ color: isSelected ? t.accent : "#422D26aa" }}
                          >
                            {t.label}
                          </div>
                          <div className="font-body text-xs text-[#422D26]/60 leading-snug">
                            {t.model}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span
                              className="font-body text-xs font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                backgroundColor: isSelected ? t.accentBg : "rgba(0,0,0,0.03)",
                                color: isSelected ? t.accent : "#422D26aa",
                              }}
                            >
                              {t.resolution}
                            </span>
                            <span
                              className="font-body text-xs font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                backgroundColor: isSelected ? t.accentBg : "rgba(0,0,0,0.03)",
                                color: isSelected ? t.accent : "#422D26aa",
                              }}
                            >
                              {t.costPer5s}/5s
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Prompt */}
              <div>
                <label className="font-body text-xs text-pink/70 uppercase tracking-widest font-bold block mb-2">
                  Prompt (Optional)
                </label>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder={`Describe a scene for ${selectedPet?.name || "your pet"}...`}
                  className="w-full h-20 rounded-2xl bg-white/60 border border-pink/10 p-3.5 resize-none
                    font-body text-sm text-[#422D26] outline-none focus:border-pink/30 transition-colors
                    placeholder:text-pink/50" />
                {/* Suggestions */}
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {PROMPT_SUGGESTIONS.slice(0, 3).map(s => (
                    <button key={s} onClick={() => useSuggestion(s)}
                      className="squishy bg-cream-dark/50 hover:bg-cream-dark rounded-full px-2.5 py-1
                        font-body text-xs text-pink/70 hover:text-pink/60 transition-all">
                      {s.split(" ").slice(0, 3).join(" ")}...
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div>
                <label className="font-body text-xs text-pink/70 uppercase tracking-widest font-bold block mb-2">
                  Style
                </label>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map((s, idx) => (
                    <button key={s.name} onClick={() => setStyle(idx)}
                      className={`squishy rounded-2xl px-3 py-2 text-center transition-all
                        ${style === idx
                          ? "bg-pink/10 border-2 border-pink/25"
                          : "bg-cream-dark/50 border border-cream-dark hover:bg-cream-dark"
                        }`}>
                      <div className="text-sm mb-0.5">{s.icon}</div>
                      <div className={`font-body text-xs font-bold ${style === idx ? "text-pink" : "text-[#422D26]/55"}`}>
                        {s.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration (video only) */}
              {genType === "video" && (
                <div className="p-4 rounded-2xl bg-cream-dark/40 sticker-border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-body text-xs text-pink/70 font-bold uppercase tracking-wider">Duration</span>
                  </div>
                  <div className="flex gap-2">
                    {[3, 5, 10].map(d => {
                      const dCredits = (d <= 3 ? 15 : d <= 5 ? 30 : 60) * selectedTier.creditMultiplier;
                      return (
                        <button key={d} onClick={() => setDuration(d)}
                          className={`squishy flex-1 py-2 rounded-xl text-center transition-all
                            ${d === duration
                              ? "bg-pink/10 border-2 border-pink/25"
                              : "bg-white/60 border border-cream-dark hover:bg-white/80"
                            }`}>
                          <div className={`font-heading text-sm ${d === duration ? "text-pink" : "text-[#422D26]/60"}`}>
                            {d}s
                          </div>
                          <div className="font-body text-xs text-pink/60 mt-0.5">
                            {Math.round(dCredits)} cr
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-3 rounded-2xl bg-pink/8 sticker-border flex items-center gap-2">
                  <span className="text-sm">⚠️</span>
                  <span className="font-body text-xs text-pink font-bold">{error}</span>
                </div>
              )}

              {/* Generate button */}
              <button onClick={handleGenerate} disabled={!selectedPet || generating}
                className={`squishy mt-auto w-full rounded-full py-4 font-heading text-base transition-all
                  ${generating
                    ? "bg-cream-dark text-pink/40 cursor-not-allowed"
                    : "bg-pink text-white shadow-lg hover:bg-pink-dark hover:shadow-xl"
                  }`}
                style={generating ? {} : { boxShadow: "0 8px 30px rgba(255,134,183,0.3)" }}>
                {generating
                  ? `Generating ${genType}...`
                  : `Generate ${genType === "video" ? "Video" : "Image"} for ${selectedPet?.name || "Pet"} ✨`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

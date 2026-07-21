"use client";

import { useState, useEffect, useId, useRef } from "react";
import { useConfig } from "wagmi";
import { api } from "@/lib/api";
import { signAction } from "@/lib/signAction";
import { useRecordImageGeneration, useRecordVideoGeneration, isPETActivityEnabled, useCheckBnbBalance } from "@/hooks/usePETActivity";
import { CONTRACTS } from "@/lib/contracts";
import Icon, { PET_ICONS } from "@/components/Icon";

const PET_SPECIES = ["Cat","Dog","Parrot","Turtle","Hamster","Rabbit","Fox","Pomeranian"];
// Pet images removed - using avatar_url from pet data or emoji fallback
const STYLES = [
  { name: "Original", icon: "📷", desc: "Pet's original photo" },
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
  const promptId = useId();
  const wagmiConfig = useConfig();
  const { recordImageGeneration } = useRecordImageGeneration();
  const { recordVideoGeneration } = useRecordVideoGeneration();
  const [chainToast, setChainToast] = useState<string | null>(null);
  const [pets, setPets] = useState<any[]>([]);
  const [loadingPets, setLoadingPets] = useState(true);
  const [petsError, setPetsError] = useState("");
  const [selectedPet, setSelectedPet] = useState<any>(null);
  const [style, setStyle] = useState(0);
  const [duration, setDuration] = useState(5);
  const [prompt, setPrompt] = useState("");
  const [genType, setGenType] = useState("image");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const pollRef = useRef<any>(null);

  useEffect(() => {
    loadPets();
    loadHistory();
    loadBalance();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // "Make one like this" handoff (Community → Create): read the stashed prompt
  // once on mount, then clear it so a refresh doesn't re-apply it.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("studio_prefill");
      if (raw) {
        const seed = JSON.parse(raw);
        if (seed?.prompt) setPrompt(String(seed.prompt));
        if (seed?.genType === "image" || seed?.genType === "video") setGenType(seed.genType);
        sessionStorage.removeItem("studio_prefill");
      }
    } catch {}
  }, []);

  const loadBalance = async () => {
    try {
      const data = await api.credits.balance();
      setBalance(data.credits ?? data.balance ?? null);
    } catch {
      // ignore
    }
  };

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
    setLoadingPets(true);
    setPetsError("");
    try {
      const data = await api.pets.list();
      const list = data.pets || data;
      setPets(list);
      if (list.length > 0) setSelectedPet(list[0]);
    } catch (error: any) {
      setPets([]);
      setPetsError(error?.status === 401 ? "Connect your wallet to load your pets." : "Couldn’t load your pets. Check your connection and try again.");
    } finally {
      setLoadingPets(false);
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
  const pollStatus = (generationId: string) => {
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

  // Record generation on-chain (non-blocking)
  const recordOnChain = async (petId: number) => {
    if (!isPETActivityEnabled()) return;
    try {
      setChainToast("Recording on chain...");
      if (genType === "video") {
        await recordVideoGeneration(petId, style, duration);
      } else {
        await recordImageGeneration(petId, style);
      }
      setChainToast("✅ Recorded on-chain!");
      setTimeout(() => setChainToast(null), 3000);
    } catch (e: any) {
      console.error("[PETActivity] Full error:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
      const raw = (e?.shortMessage || e?.message || "").toLowerCase();
      const msg = raw.includes("insufficient") || raw.includes("bnb") || raw.includes("fund")
        ? "Insufficient BNB balance"
        : raw.includes("reject") || raw.includes("denied") || raw.includes("user refused")
        ? "Transaction rejected"
        : raw.includes("chain") || raw.includes("network")
        ? "Please switch to the BSC network"
        : `On-chain record failed: ${e?.shortMessage || e?.message || "unknown error"}`;
      setChainToast(`❌ ${msg}`);
      setTimeout(() => setChainToast(null), 6000);
    }
  };

  const { checkBnb, switchToBsc } = useCheckBnbBalance();

  const handleGenerate = async () => {
    if (!selectedPet || generating) return;
    if (balance !== null && balance < creditCost) {
      // Pricing only renders on Home, so there's nothing to scroll to here.
      // Purchases are paused; do not send the user toward a checkout that the
      // launch configuration deliberately does not offer.
      setError(`Insufficient credits — need ${creditCost} but have ${balance}. Credit purchases are paused right now.`);
      return;
    }
    setError(null);
    setResult(null);

    // On-chain recording + NFT minting paused — generate flow is now wallet-free during this hold period.
    setGenerating(true);
    setStatusText("Connecting to AI engine...");

    try {
      // Submit generation request (signature optional during hold)
      setStatusText("Analyzing pet personality...");
      const res = await api.pets.generate(selectedPet.id, {
        style,
        duration,
        prompt: prompt || undefined,
        type: genType,
      });

      // Step 2: If completed immediately (image), show result
      if (res.gen_type === "image" || (res.image_url && !res.fal_request_id)) {
        setProgress(100);
        setStatusText("Done!");
        setTimeout(() => {
          setResult(res);
          setGenerating(false);
          loadHistory(); loadBalance();
          // on-chain recording already done before generation
        }, 400);
        return;
      }

      // Step 3: If video is processing, poll for completion
      if (res.id && res.status === "processing") {
        setStatusText("Video is being generated...");
        setProgress(40);
        const completed = await pollStatus(String(res.id));
        setProgress(100);
        setStatusText("Done!");
        setTimeout(() => {
          setResult(completed);
          setGenerating(false);
          loadHistory(); loadBalance();
          // on-chain recording already done before generation
        }, 400);
        return;
      }

      // Fallback - treat as completed
      setProgress(100);
      setTimeout(() => {
        setResult(res);
        setGenerating(false);
        recordOnChain(selectedPet.id);
      }, 400);

    } catch (e: any) {
      console.error("Generation error:", e);
      setGenerating(false);
      setError(e.message || "Generation failed. Please connect your wallet and try again.");
    }
  };

  const applySuggestion = (s: string) => {
    setPrompt(`${selectedPet?.name || "My pet"} ${s.toLowerCase()}`);
  };

  const isOriginal = style === 0;
  // Mirror the server pricing (api/pets/[petId]/generate): original photo = free,
  // image = 5, video = 15/30/60 by duration. (Was hard-coded to 1, so the button
  // and pre-flight check lied about the real cost.)
  const creditCost = (isOriginal && genType === "image")
    ? 0
    : genType === "video"
    ? (duration <= 3 ? 15 : duration <= 5 ? 30 : 60)
    : 5;

  if (loadingPets) {
    return (
      <div role="status" aria-live="polite" style={{ padding: "120px 40px", textAlign: "center", color: "#7A6E5A", fontFamily: "var(--ed-body)" }}>
        Loading your pets…
      </div>
    );
  }

  if (petsError) {
    return (
      <div style={{ padding: "120px 40px", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
        <div role="alert" style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#9A4E1E", lineHeight: 1.6 }}>{petsError}</div>
        <button type="button" onClick={loadPets} style={{ marginTop: 16, padding: "10px 18px", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#211A12", fontWeight: 700, cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div style={{ padding: "120px 40px", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
        <div style={{ marginBottom: 16, opacity: 0.5 }}><Icon name="paw" size={56} /></div>
        <h2 style={{ fontFamily: "var(--ed-disp)", fontSize: 24, color: "#211A12", marginBottom: 12 }}>
          Adopt a Pet First
        </h2>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", lineHeight: 1.8 }}>
          Go to the "My Pet" tab to adopt your first AI pet, then come back here to generate personalized content.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px", maxWidth: 960, margin: "0 auto", paddingTop: 100 }}>
      {/* On-chain recording overlay */}
      {chainToast && (
        <div role="dialog" aria-modal="true" aria-live="polite" aria-label="On-chain transaction status" style={{
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
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#x26d3;&#xfe0f;</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--ed-disp)", color: "#211A12" }}>{chainToast}</div>
            <div style={{ fontSize: 14, fontFamily: "var(--ed-body)", color: "#7A6E5A", marginTop: 8 }}>{chainToast?.startsWith("❌") ? "Dismisses automatically when you close your wallet" : "Please confirm in your wallet"}</div>
          </div>
        </div>
      )}
      <style>{`
        /* pulse + slideIn now come from globals.css (canonical copies) —
           local duplicates used to shadow them page-wide while mounted. */
        @keyframes shimmer { 0% { background-position:-200% 0 } 100% { background-position:200% 0 } }
      `}</style>

      <div style={{
        background: "#FBF6EC",
        borderRadius: 20, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", overflow: "hidden",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 28px", borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="sparkling" size={22} />
            <div>
              <span style={{ fontFamily: "var(--ed-disp)", fontSize: 16, fontWeight: 600, color: "#211A12" }}>
                Pet Content Studio
              </span>
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <span style={{
                  fontSize: 12, padding: "2px 7px", borderRadius: 8,
                  background: "rgba(190,79,40,0.09)", color: "#9A4E1E", fontFamily: "var(--ed-m)", fontWeight: 600,
                  border: "1px solid rgba(190,79,40,0.18)",
                }}>AI IMAGE</span>
                <span style={{
                  fontSize: 12, padding: "2px 7px", borderRadius: 8,
                  background: "rgba(107,79,160,0.08)", color: "#6B4FA0", fontFamily: "var(--ed-m)", fontWeight: 600,
                  border: "1px solid rgba(107,79,160,0.15)",
                }}>AI VIDEO</span>
              </div>
            </div>
          </div>
          <div style={{
            padding: "6px 14px", borderRadius: 10,
            background: "rgba(190,79,40,0.07)", border: "1px solid rgba(190,79,40,0.15)",
          }}>
            <button type="button" style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A4E1E", fontWeight: 600, cursor: "pointer", border: 0, background: "transparent", padding: 0 }}
              onClick={() => { window.location.href = "/"; }}
              title="View credit status on the Home tab"
            >
              <Icon name="coin" size={12} /> {balance !== null ? balance : "—"} credits
            </button>
          </div>
        </div>

        <div style={{ padding: 28 }}>
          <div className="pg-row" style={{ display: "flex", gap: 24 }}>
            {/* Left: Pet selection + preview */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Pet selector */}
              <div style={{ marginBottom: 18 }}>
                <label style={{
                  fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A",
                  textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Choose Your Pet
                </label>
                <div role="group" aria-label="Choose your pet" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {pets.map((p: any) => (
                    <button type="button" key={p.id} aria-pressed={selectedPet?.id === p.id} onClick={() => { setSelectedPet(p); setResult(null); setError(null); setGenerating(false); setProgress(0); }} style={{
                      background: selectedPet?.id === p.id ? "rgba(190,79,40,0.09)" : "#F5EFE2",
                      border: selectedPet?.id === p.id ? "1px solid rgba(190,79,40,0.35)" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                      borderRadius: 12, padding: "10px 14px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s",
                    }}>
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt={PET_SPECIES[p.species]}
                          style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }} />
                      ) : (
                        <span style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(190,79,40,0.09)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name={PET_ICONS[p.species] || "paw"} size={18} /></span>
                      )}
                      <div style={{ textAlign: "left" }}>
                        <div style={{
                          fontFamily: "var(--ed-disp)", fontSize: 13, fontWeight: 600,
                          color: selectedPet?.id === p.id ? "#9A4E1E" : "#5C5140",
                        }}>
                          {p.name}
                        </div>
                        <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A7B4E" }}>
                          Lv.{p.level} · {p.personality_type}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview / Generation / Result area */}
              <div style={{
                background: "#F5EFE2", borderRadius: 16,
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", minHeight: 320,
                position: "relative", overflow: "hidden",
              }}>
                {/* Result — rises in from below (global edRiseIn; the old local
                    slideIn copy had this shape, the canonical one drops from above) */}
                {result ? (
                  <div style={{ animation: "edRiseIn 0.4s ease-out" }}>
                    {(result.video_url || result.video_path) ? (
                      <video src={result.video_url || result.video_path} controls autoPlay loop muted playsInline
                        style={{ width: "100%", borderRadius: "16px 16px 0 0", display: "block" }} />
                    ) : (result.image_url || result.photo_path) ? (
                      <img src={result.image_url || result.photo_path} alt={result.pet_name}
                        style={{ width: "100%", borderRadius: "16px 16px 0 0", display: "block" }} />
                    ) : null}
                    <div style={{ padding: 18 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%", background: "#5C8A4E",
                        }} />
                        <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#5C8A4E", fontWeight: 600 }}>
                          {result.demo ? "Demo Preview" : "Generated Successfully!"}
                        </span>
                        {result.style_name && (
                          <span style={{
                            fontSize: 13, padding: "2px 8px", borderRadius: 6,
                            background: "rgba(190,79,40,0.09)", color: "#9A4E1E",
                            fontFamily: "var(--ed-m)", fontWeight: 600,
                          }}>{result.style_name}</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setResult(null)} style={{
                          flex: 1, background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
                          border: "none", borderRadius: 10, padding: "11px",
                          fontFamily: "var(--ed-disp)", fontSize: 13, color: "#FFF8EE", cursor: "pointer",
                          fontWeight: 600,
                        }}>
                          Generate Another
                        </button>
                        {(result.video_path || result.image_url || result.photo_path) && !result.demo && (
                          <>
                            <button onClick={async () => {
                              try {
                                const isVideo = !!result.video_path;
                                const url = isVideo ? result.video_path : (result.image_url || result.photo_path);
                                const ext = isVideo ? "mp4" : "jpg";
                                const res = await fetch(url);
                                if (!res.ok) throw new Error(`Download failed (${res.status})`);
                                const blob = await res.blob();
                                const a = document.createElement("a");
                                a.href = URL.createObjectURL(blob);
                                a.download = `${selectedPet?.name || "pet"}-${Date.now()}.${ext}`;
                                a.click();
                                URL.revokeObjectURL(a.href);
                              } catch { window.open(result.video_path || result.image_url || result.photo_path, "_blank"); }
                            }} style={{
                              padding: "11px 16px", borderRadius: 10,
                              background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
                              border: "none",
                              fontFamily: "var(--ed-m)", fontSize: 13, color: "#FFF8EE", fontWeight: 600,
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}>
                              ↓ Save
                            </button>
                            <button onClick={() => {
                              const text = encodeURIComponent(`Just generated ${result.style_name || "AI art"} for ${selectedPet?.name || "my pet"} on MY AI PET 🐾`);
                              const url = encodeURIComponent("https://app.myaipet.ai");
                              const tags = encodeURIComponent("MYAIPET,AIArt,PetClaw");
                              window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${tags}`, "_blank", "width=600,height=400");
                            }} style={{
                              padding: "11px 14px", borderRadius: 10,
                              background: "#211A12", border: "none",
                              fontFamily: "var(--ed-disp)", fontSize: 13, color: "#FFF8EE", fontWeight: 700,
                              cursor: "pointer", transition: "all 0.2s",
                            }}>
                              𝕏 Share
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : generating ? (
                  /* Generating state */
                  <div role="status" aria-live="polite" aria-label={`Generating ${genType} for ${selectedPet.name}`} style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", padding: 40, minHeight: 320,
                  }}>
                    <div style={{ position: "relative", marginBottom: 24 }}>
                      {selectedPet.avatar_url ? (
                        <img src={selectedPet.avatar_url}
                          alt={selectedPet.name}
                          style={{
                          width: 80, height: 80, borderRadius: 20, objectFit: "cover",
                          animation: "pulse 2s ease-in-out infinite",
                          border: "1px solid rgba(190,79,40,0.35)",
                        }} />
                      ) : (
                        <span style={{
                          width: 80, height: 80, borderRadius: 20,
                          background: "rgba(190,79,40,0.09)", display: "inline-flex",
                          alignItems: "center", justifyContent: "center",
                          animation: "pulse 2s ease-in-out infinite",
                          border: "1px solid rgba(190,79,40,0.35)",
                        }}><Icon name={PET_ICONS[selectedPet.species] || "paw"} size={48} /></span>
                      )}
                      <div style={{
                        position: "absolute", bottom: -4, right: -4,
                        width: 24, height: 24, borderRadius: "50%",
                        background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, animation: "pulse 1s ease-in-out infinite",
                      }}>
                        {genType === "video" ? "🎬" : "🖼"}
                      </div>
                    </div>
                    <div style={{ width: "70%", maxWidth: 240, marginBottom: 14 }}>
                      <div role="progressbar" aria-label="Generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, progress))} style={{ height: 5, borderRadius: 3, background: "rgba(33,26,18,0.08)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 3,
                          background: "linear-gradient(90deg, #E27D0C, #F49B2A, #E27D0C)",
                          backgroundSize: "200% 100%",
                          animation: "shimmer 1.5s ease-in-out infinite",
                          width: `${Math.min(100, progress)}%`,
                          transition: "width 0.6s ease",
                        }} />
                      </div>
                      <div style={{
                        display: "flex", justifyContent: "space-between", marginTop: 4,
                        fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A7B4E",
                      }}>
                        <span>{statusText}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                    </div>
                    <div style={{
                      fontFamily: "var(--ed-disp)", fontSize: 14,
                      color: "#5C5140", fontWeight: 500,
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
                    {selectedPet?.avatar_url ? (
                      <img src={selectedPet.avatar_url} alt={selectedPet.name}
                        style={{ width: 96, height: 96, borderRadius: 24, objectFit: "cover", marginBottom: 14 }} />
                    ) : (
                      <span style={{ width: 96, height: 96, borderRadius: 24, background: "rgba(190,79,40,0.09)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Icon name={PET_ICONS[selectedPet?.species] || "paw"} size={56} /></span>
                    )}
                    <div style={{ fontFamily: "var(--ed-disp)", fontSize: 22, color: "#211A12", marginBottom: 4, fontWeight: 600 }}>
                      {selectedPet?.name}
                    </div>
                    <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A7B4E", marginBottom: 16 }}>
                      {selectedPet?.personality_type} · mood: {selectedPet?.current_mood} · Lv.{selectedPet?.level}
                    </div>
                    <div style={{
                      fontFamily: "var(--ed-body)", fontSize: 13, color: "#9A7B4E",
                      maxWidth: 280, lineHeight: 1.7, textAlign: "center",
                    }}>
                      AI generates content based on {selectedPet?.name}&apos;s personality and mood.
                      Choose a style and prompt, then hit generate!
                    </div>
                  </div>
                )}
              </div>

              {/* Recent generations */}
              {history.filter((h: any) => h.photo_path || h.photo_url || h.image_url || h.video_path || h.video_url).length > 0 && !result && !generating && (
                <div style={{ marginTop: 16 }}>
                  <div style={{
                    fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A",
                    marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em",
                  }}>
                    Recent Creations
                  </div>
                  <div style={{ display: "flex", gap: 6, overflow: "auto" }}>
                    {history.filter((h: any) => h.photo_path || h.photo_url || h.image_url).slice(0, 6).map((h: any, i: number) => (
                      <button type="button" key={h.id || i} className="recent-thumb" aria-label={`Open recent creation ${i + 1}`} style={{
                        width: 72, height: 72, borderRadius: 10, overflow: "hidden",
                        flexShrink: 0, cursor: "pointer", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", padding: 0,
                      }} onClick={() => setResult(h)}>
                        <img src={h.photo_path || h.photo_url || h.image_url} alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e) => { (e.target as HTMLElement).parentElement!.style.display = "none"; }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Controls */}
            <div className="pg-side" style={{ width: 320, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Type toggle */}
              <div>
                <label style={{
                  fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A",
                  textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Generation Type
                </label>
                <div role="group" aria-label="Generation type" style={{
                  display: "flex", gap: 4, padding: 3, borderRadius: 10,
                  background: "#F5EFE2", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                }}>
                  {[
                    { key: "image", label: "Image", icon: "🖼" },
                    { key: "video", label: "Video", icon: "🎬" },
                  ].map(t => (
                    <button type="button" key={t.key} aria-pressed={genType === t.key} onClick={() => setGenType(t.key)} style={{
                      flex: 1,
                      background: genType === t.key ? "rgba(190,79,40,0.09)" : "transparent",
                      border: "none", borderRadius: 8, padding: "10px",
                      fontFamily: "var(--ed-m)", fontSize: 13,
                      color: genType === t.key ? "#9A4E1E" : "#7A6E5A",
                      cursor: "pointer", transition: "all 0.2s", fontWeight: genType === t.key ? 600 : 400,
                    }}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt — hidden for Original style */}
              {!isOriginal && <div>
                <label htmlFor={promptId} style={{
                  fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A",
                  textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Prompt (Optional)
                </label>
                <textarea id={promptId} value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder={`Describe a scene for ${selectedPet?.name || "your pet"}...`}
                  maxLength={500}
                  style={{
                    width: "100%", height: 80, borderRadius: 12, background: "#F5EFE2",
                    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", padding: 14, resize: "none",
                    fontFamily: "var(--ed-body)", fontSize: 13, color: "#211A12",
                    outline: "none", boxSizing: "border-box", lineHeight: 1.5,
                    transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = "rgba(190,79,40,0.4)"}
                  onBlur={e => e.target.style.borderColor = "var(--ed-hair, rgba(33,26,18,.13))"}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {PROMPT_SUGGESTIONS.slice(0, 3).map(s => (
                      <button key={s} onClick={() => applySuggestion(s)} style={{
                        background: "#F5EFE2", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                        borderRadius: 6, padding: "3px 8px", cursor: "pointer",
                        fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A",
                        transition: "all 0.2s",
                      }}>
                        {s.split(" ").slice(0, 3).join(" ")}...
                      </button>
                    ))}
                  </div>
                  <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A7B4E" }}>
                    {prompt.length}/500
                  </span>
                </div>
              </div>}

              {/* Style */}
              <div>
                <label style={{
                  fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A",
                  textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 8, fontWeight: 600,
                }}>
                  Style
                </label>
                <div role="group" aria-label="Image style" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {STYLES.map((s, idx) => (
                    <button type="button" key={s.name} aria-pressed={style === idx} onClick={() => setStyle(idx)} style={{
                      background: style === idx ? "rgba(190,79,40,0.09)" : "#F5EFE2",
                      border: style === idx ? "1px solid rgba(190,79,40,0.3)" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                      borderRadius: 10, padding: "8px 12px", cursor: "pointer",
                      transition: "all 0.2s",
                    }}>
                      <div style={{ fontSize: 14, marginBottom: 2 }}>{s.icon}</div>
                      <div style={{
                        fontFamily: "var(--ed-m)", fontSize: 13,
                        color: style === idx ? "#9A4E1E" : "#5C5140",
                      }}>{s.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration (video only) */}
              {genType === "video" && (
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "rgba(107,79,160,0.05)", border: "1px solid rgba(107,79,160,0.14)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A", fontWeight: 600 }}>
                      Video Duration
                    </span>
                    <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#6B4FA0" }}>
                      AI Video
                    </span>
                  </div>
                  <div role="group" aria-label="Video duration" style={{ display: "flex", gap: 6 }}>
                    {[3, 5, 10].map(d => (
                      <button type="button" key={d} aria-pressed={d === duration} onClick={() => setDuration(d)} style={{
                        flex: 1, padding: "8px", borderRadius: 8, cursor: "pointer",
                        background: d === duration ? "rgba(190,79,40,0.09)" : "#F5EFE2",
                        border: d === duration ? "1px solid rgba(190,79,40,0.3)" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                        fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 600,
                        color: d === duration ? "#9A4E1E" : "#9A7B4E",
                        transition: "all 0.2s",
                      }}>
                        {d}s
                        <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", marginTop: 2 }}>
                          <Icon name="coin" size={9} /> {d <= 3 ? 15 : d <= 5 ? 30 : 60}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div role="alert" style={{
                  padding: "12px 16px", borderRadius: 12, background: "rgba(190,79,40,0.06)",
                  border: "1px solid rgba(190,79,40,0.18)", display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 14 }}>⚠️</span>
                  <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A4E1E" }}>{error}</span>
                </div>
              )}

              {/* Generate button */}
              <button type="button" onClick={handleGenerate} disabled={!selectedPet || generating} aria-busy={generating} style={{
                marginTop: "auto", width: "100%",
                background: generating
                  ? "rgba(33,26,18,0.06)"
                  : "linear-gradient(180deg,#F49B2A,#E27D0C)",
                border: "none", borderRadius: 12, padding: "14px 0",
                fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 600,
                color: generating ? "#9A7B4E" : "#FFF8EE",
                cursor: generating ? "not-allowed" : "pointer",
                boxShadow: "none",
                transition: "all 0.3s",
                letterSpacing: "-0.01em",
              }}>
                {generating
                  ? `Generating ${genType}...`
                  : isOriginal && genType === "image"
                  ? "📷 Post Original Photo (Free)"
                  : `✨ Generate ${genType === "video" ? "Video" : "Image"} (${creditCost} credits)`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

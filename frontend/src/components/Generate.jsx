import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { LOGO_SRC } from "./Nav";
import { api } from "../api";

const PET_TYPES = ["Cat", "Dog", "Parrot", "Turtle", "Hamster", "Rabbit", "Fox", "Pomeranian"];
const STYLES = ["Cinematic", "Anime", "Watercolor", "3D Render", "Sketch"];
const DURATIONS = ["3s", "5s", "10s"];
const CREDIT_COSTS = { "3s": 15, "5s": 30, "10s": 60 };

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

export default function Generate({ credits, onCreditsChange }) {
  const { isConnected } = useAccount();

  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [petType, setPetType] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("Cinematic");
  const [dur, setDur] = useState("5s");
  const fileRef = useRef(null);
  const pollRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      const r = new FileReader();
      r.onload = (ev) => setPreview(ev.target.result);
      r.readAsDataURL(f);
      setDone(false);
      setResult(null);
      setError(null);
    }
  };

  const handleGen = async () => {
    if (!preview || !file || !isConnected) return;

    const cost = CREDIT_COSTS[dur];
    if (credits < cost) {
      setError(`Insufficient credits. Need ${cost}, have ${credits}.`);
      return;
    }

    setGenerating(true);
    setProgress(0);
    setDone(false);
    setError(null);
    setStatusText("Uploading photo...");

    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("pet_type", petType);
      formData.append("style", STYLES.indexOf(style));
      formData.append("duration", parseInt(dur));
      formData.append("prompt", prompt || "");

      const res = await api.generate.create(formData);
      onCreditsChange?.(credits - cost);

      // Start polling for status
      setStatusText("Processing...");
      setProgress(10);

      pollRef.current = setInterval(async () => {
        try {
          const status = await api.generate.status(res.id);

          if (status.status === "processing") {
            setProgress((p) => Math.min(p + rand(2, 5), 85));
            const progressVal = progress;
            if (progressVal < 25) setStatusText("Analyzing pet features...");
            else if (progressVal < 50) setStatusText("Generating motion...");
            else if (progressVal < 80) setStatusText("Compositing video...");
            else setStatusText("Finalizing...");
          } else if (status.status === "completed") {
            clearInterval(pollRef.current);
            setProgress(100);
            setStatusText("Complete!");
            setGenerating(false);
            setDone(true);
            setResult(status);
          } else if (status.status === "failed") {
            clearInterval(pollRef.current);
            setGenerating(false);
            setError(status.error_message || "Generation failed");
            // Credits should be auto-refunded by backend
            onCreditsChange?.(credits);
          }
        } catch (err) {
          console.error("Poll error:", err);
        }
      }, 5000);
    } catch (err) {
      setGenerating(false);
      setError(err.message || "Failed to start generation");
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const creditCost = CREDIT_COSTS[dur];

  return (
    <div style={{ padding: "40px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{
        background: "rgba(255,255,255,0.015)", borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden",
      }}>
        <div style={{ padding: 28 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
            <img src={LOGO_SRC} alt="" style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover" }} />
            <span style={{ fontFamily: "mono", fontSize: 13, fontWeight: 600, color: "white" }}>AI Video Agent</span>
            <span style={{
              fontSize: 9, padding: "2px 7px", borderRadius: 10,
              background: "rgba(74,222,128,0.08)", color: "#4ade80", fontFamily: "mono",
            }}>
              ● Online
            </span>
          </div>

          <div style={{ display: "flex", gap: 22 }}>
            {/* Upload Area */}
            <div style={{ flex: 1 }}>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  aspectRatio: "1", borderRadius: 14,
                  border: preview ? "none" : "2px dashed rgba(255,255,255,0.06)",
                  background: preview ? "none" : "rgba(255,255,255,0.015)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", overflow: "hidden", position: "relative",
                }}
              >
                {preview ? (
                  <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 14 }} />
                ) : (
                  <>
                    <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.25 }}>📷</div>
                    <span style={{ fontFamily: "mono", fontSize: 12, color: "rgba(255,255,255,0.25)" }}>Drop your pet photo</span>
                    <span style={{ fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.12)", marginTop: 3 }}>JPG, PNG up to 10MB</span>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
              </div>

              {/* Pet type selector */}
              <div style={{ marginTop: 12 }}>
                <label style={{
                  fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block",
                }}>
                  Pet Type
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {PET_TYPES.map((p, i) => (
                    <button
                      key={p}
                      onClick={() => setPetType(i)}
                      style={{
                        background: petType === i ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.02)",
                        border: petType === i ? "1px solid rgba(251,191,36,0.25)" : "1px solid rgba(255,255,255,0.05)",
                        borderRadius: 7, padding: "4px 10px", fontFamily: "mono", fontSize: 10,
                        color: petType === i ? "#fde68a" : "rgba(255,255,255,0.35)",
                        cursor: "pointer", transition: "all 0.2s",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{
                  fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block",
                }}>
                  Prompt (Optional)
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="My cat running through a field..."
                  style={{
                    width: "100%", height: 72, borderRadius: 10,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
                    padding: 12, resize: "none", fontFamily: "mono", fontSize: 12, color: "white",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{
                  fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block",
                }}>
                  Style
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {STYLES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      style={{
                        background: style === s ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.02)",
                        border: style === s ? "1px solid rgba(251,191,36,0.25)" : "1px solid rgba(255,255,255,0.05)",
                        borderRadius: 7, padding: "5px 12px", fontFamily: "mono", fontSize: 11,
                        color: style === s ? "#fde68a" : "rgba(255,255,255,0.35)",
                        cursor: "pointer", transition: "all 0.2s",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{
                display: "flex", gap: 10, alignItems: "center", padding: "10px 14px",
                borderRadius: 10, background: "rgba(255,255,255,0.015)",
                border: "1px solid rgba(255,255,255,0.03)",
              }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "mono" }}>Duration</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {DURATIONS.map((d) => (
                    <span
                      key={d}
                      onClick={() => setDur(d)}
                      style={{
                        padding: "3px 10px", borderRadius: 5, cursor: "pointer",
                        background: d === dur ? "rgba(251,191,36,0.1)" : "transparent",
                        color: d === dur ? "#fde68a" : "rgba(255,255,255,0.25)",
                        fontFamily: "mono", fontSize: 11,
                      }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#fbbf24", fontFamily: "mono" }}>
                  {creditCost} credits
                </span>
              </div>

              <button
                onClick={handleGen}
                disabled={!preview || generating || !isConnected}
                style={{
                  marginTop: "auto",
                  background: (!preview || generating || !isConnected)
                    ? "rgba(255,255,255,0.03)"
                    : "linear-gradient(135deg,#f59e0b,#d97706)",
                  border: "none", borderRadius: 10, padding: "13px 0",
                  fontFamily: "mono", fontSize: 13, fontWeight: 600,
                  color: (!preview || generating || !isConnected) ? "rgba(255,255,255,0.15)" : "white",
                  cursor: (!preview || generating || !isConnected) ? "not-allowed" : "pointer",
                  boxShadow: (!preview || generating || !isConnected) ? "none" : "0 0 24px rgba(245,158,11,0.25)",
                  transition: "all 0.3s", width: "100%",
                }}
              >
                {!isConnected ? "Connect Wallet First" : generating ? "Generating..." : `Generate Video ⚡`}
              </button>
            </div>
          </div>

          {/* Progress */}
          {generating && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  {statusText}
                </span>
                <span style={{ fontFamily: "mono", fontSize: 11, color: "#fbbf24" }}>
                  {Math.min(progress, 100)}%
                </span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.04)" }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  background: "linear-gradient(90deg,#f59e0b,#fbbf24)",
                  width: `${Math.min(progress, 100)}%`, transition: "width 0.3s",
                  boxShadow: "0 0 10px rgba(251,191,36,0.4)",
                }} />
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
                <span style={{ fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.15)" }}>● AI Processing via fal.ai</span>
                <span style={{ fontFamily: "mono", fontSize: 9, color: "rgba(255,255,255,0.15)" }}>● On-chain recording queued</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 22, padding: 16, borderRadius: 10,
              background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)",
            }}>
              <span style={{ fontFamily: "mono", fontSize: 12, color: "#ef4444" }}>❌ {error}</span>
            </div>
          )}

          {/* Done */}
          {done && result && (
            <div style={{
              marginTop: 22, padding: 16, borderRadius: 10,
              background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.08)",
            }}>
              {/* Video Player */}
              {result.video_url && (
                <div style={{ marginBottom: 12, borderRadius: 10, overflow: "hidden" }}>
                  <video
                    src={result.video_url}
                    controls
                    autoPlay
                    loop
                    muted
                    style={{ width: "100%", borderRadius: 10 }}
                  />
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>✅</span>
                <div>
                  <div style={{ fontFamily: "mono", fontSize: 12, color: "#4ade80", fontWeight: 600 }}>
                    Generated & Recorded On-Chain
                  </div>
                  <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>
                    {result.tx_hash
                      ? `TX: ${result.tx_hash.slice(0, 10)}...${result.tx_hash.slice(-6)} · ${result.chain || "Base"}`
                      : "On-chain recording queued"
                    }
                  </div>
                </div>
                {result.tx_hash && (
                  <a
                    href={`https://${result.chain === "bnb" ? "bscscan.com" : "basescan.org"}/tx/${result.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7,
                      padding: "6px 14px", cursor: "pointer", fontFamily: "mono",
                      fontSize: 11, color: "rgba(255,255,255,0.4)", textDecoration: "none",
                    }}
                  >
                    Explorer ↗
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

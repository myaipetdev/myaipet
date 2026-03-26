import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
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

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const creditCost = CREDIT_COSTS[dur];

  return (
    <div className="max-w-[860px] mx-auto px-6 sm:px-10 pt-32 pb-24">
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl sticker-border overflow-hidden">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🎬</span>
            <span className="font-heading text-base text-[#422D26]">AI Video Agent</span>
            <span className="font-body text-xs font-bold px-2 py-0.5 rounded-full bg-mint/10 text-[#4ade80]">
              ● Online
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-6">
            {/* Upload Area */}
            <div className="flex-1">
              <div
                onClick={() => fileRef.current?.click()}
                className={`squishy aspect-square rounded-3xl flex flex-col items-center justify-center cursor-pointer overflow-hidden relative
                  ${preview ? "" : "border-2 border-dashed border-pink/15 bg-cream-dark/40"}`}
              >
                {preview ? (
                  <img src={preview} alt="" className="w-full h-full object-cover rounded-3xl" />
                ) : (
                  <>
                    <div className="text-4xl mb-3 opacity-30">📷</div>
                    <span className="font-body text-sm text-pink/65 font-bold">Drop your pet photo</span>
                    <span className="font-body text-xs text-pink/50 mt-1">JPG, PNG up to 10MB</span>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              </div>

              {/* Pet type selector */}
              <div className="mt-4">
                <label className="font-body text-xs text-pink/65 uppercase tracking-widest font-bold block mb-2">
                  Pet Type
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PET_TYPES.map((p, i) => (
                    <button
                      key={p}
                      onClick={() => setPetType(i)}
                      className={`squishy rounded-xl px-2.5 py-1 font-body text-xs font-bold transition-all
                        ${petType === i
                          ? "bg-pink/10 text-pink border border-pink/25"
                          : "bg-cream-dark/50 text-[#422D26]/55 border border-cream-dark hover:bg-cream-dark"
                        }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex-1 flex flex-col gap-4">
              <div>
                <label className="font-body text-xs text-pink/65 uppercase tracking-widest font-bold block mb-2">
                  Prompt (Optional)
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="My cat running through a field..."
                  className="w-full h-[72px] rounded-2xl bg-white/60 border border-pink/10 p-3
                    resize-none font-body text-sm text-[#422D26] outline-none focus:border-pink/30
                    transition-colors placeholder:text-pink/55"
                />
              </div>

              <div>
                <label className="font-body text-xs text-pink/65 uppercase tracking-widest font-bold block mb-2">
                  Style
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      className={`squishy rounded-xl px-3 py-1.5 font-body text-xs font-bold transition-all
                        ${style === s
                          ? "bg-pink/10 text-pink border border-pink/25"
                          : "bg-cream-dark/50 text-[#422D26]/55 border border-cream-dark hover:bg-cream-dark"
                        }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-cream-dark/40 sticker-border">
                <span className="font-body text-xs text-pink/65 font-bold">Duration</span>
                <div className="flex gap-1">
                  {DURATIONS.map((d) => (
                    <span
                      key={d}
                      onClick={() => setDur(d)}
                      className={`squishy px-3 py-1 rounded-full cursor-pointer font-body text-xs font-bold transition-all
                        ${d === dur
                          ? "bg-pink/10 text-pink"
                          : "text-[#422D26]/60 hover:text-pink/55"
                        }`}
                    >
                      {d}
                    </span>
                  ))}
                </div>
                <span className="ml-auto font-body text-xs text-sun-dark font-bold">
                  {creditCost} credits
                </span>
              </div>

              <button
                onClick={handleGen}
                disabled={!preview || generating || !isConnected}
                className={`squishy mt-auto w-full rounded-full py-3.5 font-heading text-sm transition-all
                  ${(!preview || generating || !isConnected)
                    ? "bg-cream-dark text-pink/20 cursor-not-allowed"
                    : "bg-pink text-white shadow-lg hover:bg-pink-dark hover:shadow-xl"
                  }`}
                style={(!preview || generating || !isConnected) ? {} : { boxShadow: "0 8px 30px rgba(255,134,183,0.3)" }}
              >
                {!isConnected ? "Connect Wallet First" : generating ? "Generating..." : `Generate Video ⚡`}
              </button>
            </div>
          </div>

          {/* Progress */}
          {generating && (
            <div className="mt-6">
              <div className="flex justify-between mb-2">
                <span className="font-body text-xs text-[#422D26]/60">{statusText}</span>
                <span className="font-body text-xs text-pink font-bold">{Math.min(progress, 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-cream-dark overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(progress, 100)}%`,
                    background: "linear-gradient(90deg, #FF86B7, #FFD23F, #70D6FF)",
                  }}
                />
              </div>
              <div className="flex gap-4 mt-2">
                <span className="font-body text-xs text-pink/50 font-semibold">● AI Processing via fal.ai</span>
                <span className="font-body text-xs text-pink/50 font-semibold">● On-chain recording queued</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-6 p-4 rounded-2xl bg-pink/8 sticker-border">
              <span className="font-body text-sm text-pink font-bold">❌ {error}</span>
            </div>
          )}

          {/* Done */}
          {done && result && (
            <div className="mt-6 p-5 rounded-3xl sticker-border animate-slide-up"
              style={{ border: "2px solid rgba(74,222,128,0.2)", background: "rgba(74,222,128,0.03)" }}>
              {result.video_url && (
                <div className="mb-4 rounded-2xl overflow-hidden">
                  <video src={result.video_url} controls autoPlay loop muted className="w-full rounded-2xl" />
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="text-xl">✅</span>
                <div>
                  <div className="font-body text-sm text-[#4ade80] font-bold">Generated & Recorded On-Chain</div>
                  <div className="font-body text-xs text-[#422D26]/60 mt-1">
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
                    className="squishy ml-auto bg-cream-dark/60 hover:bg-cream-dark rounded-2xl px-4 py-2
                      font-body text-xs text-[#422D26]/60 font-bold no-underline transition-all"
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

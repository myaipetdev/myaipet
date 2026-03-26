import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";

// ── Tab Button ──
function TabButton({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`squishy flex items-center gap-1.5 px-4 py-2 rounded-full font-body text-xs font-bold transition-all
        ${active
          ? "bg-pink text-white shadow-md"
          : "bg-white/60 text-[#422D26]/50 hover:bg-white/80 sticker-border"
        }`}
    >
      <span className="text-sm">{icon}</span>
      {label}
    </button>
  );
}

// ── Heart Meter ──
function HeartMeter({ value, max = 100 }) {
  const filled = Math.round((value / max) * 5);
  return (
    <div className="flex gap-1 items-center">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-xl transition-all duration-300 ${i < filled ? "scale-110" : "grayscale opacity-30"}`}
          style={i < filled ? { filter: "none" } : {}}
        >
          {i < filled ? "💖" : "🤍"}
        </span>
      ))}
      <span className="font-body text-xs text-[#422D26]/60 font-bold ml-1">
        {value}/100
      </span>
    </div>
  );
}

// ── Cute Gauge ──
function CuteGauge({ label, value, icon, color, max = 100 }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-lg w-7 text-center">{icon}</span>
      <div className="flex-1">
        <div className="flex justify-between mb-0.5">
          <span className="font-body text-xs font-bold text-[#422D26]/60">{label}</span>
          <span className="font-body text-xs text-[#422D26]/60 font-bold">{value}%</span>
        </div>
        <div className="h-3.5 rounded-full bg-cream-dark overflow-hidden sticker-border">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
            style={{ width: `${pct}%`, background: color }}
          >
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)",
                animation: "progress-shine 2s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Memory Quote Card ──
function MemoryCard({ memory, index }) {
  const colors = [
    { bg: "bg-pink/8", border: "border-pink/15", accent: "text-pink" },
    { bg: "bg-sky/8", border: "border-sky/15", accent: "text-sky-dark" },
    { bg: "bg-lavender/8", border: "border-lavender/15", accent: "text-lavender" },
  ];
  const c = colors[index % 3];
  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-3.5 transition-all hover:scale-[1.02]`}>
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">💭</span>
        <div className="flex-1 min-w-0">
          <p className="font-body text-xs text-[#422D26]/70 leading-relaxed italic">
            "{memory.description || memory.content || memory.text || "A cherished memory..."}"
          </p>
          {memory.emotion && (
            <span className={`inline-block mt-1.5 font-body text-xs font-bold ${c.accent} bg-white/60 px-2 py-0.5 rounded-full`}>
              {memory.emotion}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modifier Tag ──
function ModifierTag({ text }) {
  return (
    <span className="inline-block font-body text-xs font-bold bg-lavender/15 text-lavender px-2.5 py-1 rounded-full">
      {text}
    </span>
  );
}

// ── Chain Badge ──
function ChainBadge({ chain }) {
  const isBase = chain?.toLowerCase() === "base";
  return (
    <span className={`inline-block font-body text-xs font-bold px-2 py-0.5 rounded-full
      ${isBase ? "bg-sky/15 text-sky-dark" : "bg-sun/15 text-sun-dark"}`}>
      {chain || "Base"}
    </span>
  );
}

// ═══════════════════════════════════════════════════
// ── PREVIEW TAB ──
// ═══════════════════════════════════════════════════
function PreviewTab({ petId, petName }) {
  const [soulData, setSoulData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFullSoul, setShowFullSoul] = useState(false);
  const [soulMd, setSoulMd] = useState(null);
  const [loadingMd, setLoadingMd] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSoulData(null);
    setShowFullSoul(false);
    setSoulMd(null);
    api.pets.soulJson(petId)
      .then((data) => setSoulData(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [petId]);

  const handleViewFull = async () => {
    if (soulMd) {
      setShowFullSoul(!showFullSoul);
      return;
    }
    setLoadingMd(true);
    try {
      const text = await api.pets.soul(petId);
      setSoulMd(text);
      setShowFullSoul(true);
    } catch (e) {
      setError(e.message);
    }
    setLoadingMd(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="text-5xl animate-float">🔮</div>
        <span className="font-body text-sm text-pink/60 font-semibold">Reading soul data...</span>
      </div>
    );
  }

  if (error && !soulData) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">😿</div>
        <p className="font-body text-sm text-[#422D26]/50">{error}</p>
      </div>
    );
  }

  const soul = soulData || {};
  const memories = soul.core_memories || soul.memories || [];
  const topMemories = memories.slice(0, 3);
  const modifiers = soul.personality_modifiers || soul.modifiers || soul.traits || [];

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Header Card */}
      <div className="bg-gradient-to-br from-pink/8 via-lavender/5 to-sky/8 rounded-3xl sticker-border p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-pink/15 flex items-center justify-center text-2xl sticker-border">
            🌟
          </div>
          <div>
            <h3 className="font-heading text-lg text-[#422D26]">{soul.name || petName}</h3>
            <div className="flex items-center gap-2">
              <span className="font-body text-xs text-[#422D26]/50 font-semibold">
                {soul.species || "Unknown"} &middot; Lv.{soul.level || 1}
              </span>
            </div>
          </div>
        </div>

        {/* Personality */}
        <div className="mb-3">
          <span className="font-body text-xs font-bold text-[#422D26]/55 uppercase tracking-wider">Personality</span>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="font-body text-sm font-bold text-pink">
              {soul.personality_type || soul.personality || "Mysterious"}
            </span>
            {(Array.isArray(modifiers) ? modifiers : []).map((m, i) => (
              <ModifierTag key={i} text={typeof m === "string" ? m : m.name || m.label} />
            ))}
          </div>
        </div>

        {/* Bond Level */}
        <div>
          <span className="font-body text-xs font-bold text-[#422D26]/55 uppercase tracking-wider">Bond Level</span>
          <div className="mt-1">
            <HeartMeter value={soul.bond_level ?? soul.bond ?? 0} />
          </div>
        </div>
      </div>

      {/* Core Memories */}
      {topMemories.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-base">📖</span>
            <span className="font-heading text-sm text-[#422D26]">Core Memories</span>
          </div>
          <div className="space-y-2">
            {topMemories.map((mem, i) => (
              <MemoryCard key={i} memory={mem} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Vital Signs */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-base">📊</span>
          <span className="font-heading text-sm text-[#422D26]">Vital Signs</span>
        </div>
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl sticker-border p-4 space-y-2.5">
          <CuteGauge
            label="Happiness"
            value={soul.happiness ?? 50}
            icon="💖"
            color="linear-gradient(90deg, #FF86B7, #FFB6D5)"
          />
          <CuteGauge
            label="Energy"
            value={soul.energy ?? 50}
            icon="⚡"
            color="linear-gradient(90deg, #70D6FF, #A8E6FF)"
          />
          <CuteGauge
            label="Hunger"
            value={soul.hunger ?? 50}
            icon="🍖"
            color="linear-gradient(90deg, #FFD23F, #FFE580)"
          />
        </div>
      </div>

      {/* View Full SOUL.md */}
      <button
        onClick={handleViewFull}
        disabled={loadingMd}
        className="squishy w-full py-3.5 rounded-2xl sticker-border bg-[#1e1e2e] text-white font-heading text-sm
                   flex items-center justify-center gap-2 hover:bg-[#2a2a3e] transition-colors"
      >
        {loadingMd ? (
          <>
            <span className="animate-wiggle">📜</span>
            Loading...
          </>
        ) : (
          <>
            <span>📜</span>
            {showFullSoul ? "Hide Full SOUL.md" : "View Full SOUL.md"}
          </>
        )}
      </button>

      {showFullSoul && soulMd && (
        <div className="rounded-2xl overflow-hidden sticker-border animate-slide-up">
          <div className="bg-[#1e1e2e] p-1.5 flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            <span className="font-mono text-xs text-white/40 ml-2">SOUL.md</span>
          </div>
          <pre className="bg-[#1e1e2e] p-4 overflow-x-auto max-h-96 overflow-y-auto">
            <code className="font-mono text-xs text-[#cdd6f4] leading-relaxed whitespace-pre-wrap">
              {soulMd}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ── EXPORT TAB ──
// ═══════════════════════════════════════════════════
function ExportTab({ petId }) {
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.pets.soulExport(petId);
      setResult(data);
    } catch (e) {
      setError(e.message);
    }
    setExporting(false);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const text = await api.pets.soul(petId);
      const blob = new Blob([text], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "SOUL.md";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
    setDownloading(false);
  };

  const truncate = (str, len = 20) =>
    str && str.length > len ? str.slice(0, len) + "..." : str;

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Export Button */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className={`squishy w-full py-5 rounded-3xl sticker-border font-heading text-base flex flex-col items-center gap-2 transition-all
          ${exporting
            ? "bg-lavender/20 text-lavender cursor-wait"
            : "bg-gradient-to-r from-pink/15 via-lavender/15 to-sky/15 hover:from-pink/25 hover:via-lavender/25 hover:to-sky/25 text-[#422D26]"
          }`}
      >
        {exporting ? (
          <>
            <span className="text-4xl animate-float">🌌</span>
            <span className="text-sm">Uploading soul to the stars...</span>
            <span className="font-body text-xs text-lavender/60">This may take a moment</span>
          </>
        ) : (
          <>
            <span className="text-4xl">⛓️</span>
            <span className="text-sm">Export to IPFS + Blockchain</span>
            <span className="font-body text-xs text-[#422D26]/60">Record your pet's essence on-chain</span>
          </>
        )}
      </button>

      {/* Warning */}
      <div className="flex items-start gap-2.5 bg-sun/10 rounded-2xl p-3.5">
        <span className="text-lg mt-0.5">⚠️</span>
        <p className="font-body text-xs text-sun-dark leading-relaxed font-semibold">
          This records your pet's soul permanently on-chain. Once exported, the soul snapshot becomes an immutable record.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-pink/10 rounded-2xl p-3.5 flex items-start gap-2.5">
          <span className="text-lg">😿</span>
          <p className="font-body text-xs text-pink-dark">{error}</p>
        </div>
      )}

      {/* Success Result */}
      {result && (
        <div className="bg-white/70 backdrop-blur-sm rounded-3xl sticker-border p-5 space-y-3 animate-bounce-in">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">✨</span>
            <span className="font-heading text-sm text-[#422D26]">Soul Exported!</span>
          </div>

          <div className="space-y-2.5">
            {/* IPFS CID */}
            <div className="bg-cream rounded-xl p-3">
              <span className="font-body text-xs font-bold text-[#422D26]/55 uppercase tracking-wider">IPFS CID</span>
              <p className="font-mono text-xs text-[#422D26]/70 mt-0.5 break-all">{result.ipfs_cid}</p>
            </div>

            {/* TX Hash */}
            <div className="bg-cream rounded-xl p-3">
              <span className="font-body text-xs font-bold text-[#422D26]/55 uppercase tracking-wider">Transaction</span>
              <a
                href={`https://basescan.org/tx/${result.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-sky-dark hover:text-sky underline mt-0.5 block break-all"
              >
                {result.tx_hash}
              </a>
            </div>

            {/* Version */}
            <div className="bg-cream rounded-xl p-3 flex items-center justify-between">
              <span className="font-body text-xs font-bold text-[#422D26]/55 uppercase tracking-wider">Soul Version</span>
              <span className="font-heading text-sm text-pink">v{result.version || result.soul_version || 1}</span>
            </div>
          </div>
        </div>
      )}

      {/* Download Button */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="squishy w-full py-3.5 rounded-2xl sticker-border bg-white/60 hover:bg-white/80
                   font-heading text-sm text-[#422D26] flex items-center justify-center gap-2 transition-all"
      >
        <span>{downloading ? "⏳" : "💾"}</span>
        {downloading ? "Preparing file..." : "Download SOUL.md"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ── HISTORY TAB ──
// ═══════════════════════════════════════════════════
function HistoryTab({ petId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.pets.soulHistory(petId)
      .then((data) => setHistory(Array.isArray(data) ? data : data.history || data.exports || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [petId]);

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await api.pets.soulVerify(petId);
      setVerifyResult(res);
    } catch (e) {
      setVerifyResult({ match: false, error: e.message });
    }
    setVerifying(false);
  };

  const truncateCid = (cid) => cid ? `${cid.slice(0, 8)}...${cid.slice(-6)}` : "---";

  const formatDate = (dateStr) => {
    if (!dateStr) return "Unknown";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="text-5xl animate-float">📜</div>
        <span className="font-body text-sm text-pink/60 font-semibold">Loading history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">😿</div>
        <p className="font-body text-sm text-[#422D26]/50">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Verify Button */}
      <button
        onClick={handleVerify}
        disabled={verifying}
        className="squishy w-full py-3 rounded-2xl sticker-border bg-mint/10 hover:bg-mint/20
                   font-heading text-sm text-[#422D26] flex items-center justify-center gap-2 transition-all"
      >
        <span>{verifying ? "🔄" : "🔍"}</span>
        {verifying ? "Verifying on-chain..." : "Verify Current Soul"}
      </button>

      {/* Verify Result */}
      {verifyResult && (
        <div className={`rounded-2xl p-3.5 flex items-center gap-2.5 animate-bounce-in
          ${verifyResult.match || verifyResult.verified
            ? "bg-mint/15"
            : "bg-pink/10"
          }`}
        >
          <span className="text-2xl">
            {verifyResult.match || verifyResult.verified ? "✅" : "❌"}
          </span>
          <div>
            <span className="font-heading text-sm text-[#422D26]">
              {verifyResult.match || verifyResult.verified ? "Soul Verified!" : "Mismatch Detected"}
            </span>
            <p className="font-body text-xs text-[#422D26]/50">
              {verifyResult.match || verifyResult.verified
                ? "On-chain soul matches current state"
                : verifyResult.error || "The soul has changed since last export"
              }
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      {history.length === 0 ? (
        <div className="text-center py-10">
          <div className="text-4xl mb-3">🕊️</div>
          <p className="font-body text-sm text-[#422D26]/60">No exports yet</p>
          <p className="font-body text-xs text-[#422D26]/50 mt-1">Export your pet's soul to see history here</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-pink/10 rounded-full" />

          <div className="space-y-3">
            {history.map((entry, i) => (
              <div key={i} className="relative pl-12">
                {/* Timeline dot */}
                <div className="absolute left-3.5 top-4 w-3 h-3 rounded-full bg-pink sticker-border z-10" />

                <div className="bg-white/70 backdrop-blur-sm rounded-2xl sticker-border p-4 hover:bg-white/90 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-heading text-sm text-[#422D26]">
                      v{entry.version || i + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <ChainBadge chain={entry.chain} />
                      <span className="font-body text-xs text-[#422D26]/60">
                        {formatDate(entry.exported_at)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-body text-xs font-bold text-[#422D26]/50 w-8">CID</span>
                      <span className="font-mono text-xs text-[#422D26]/60">{truncateCid(entry.ipfs_cid)}</span>
                    </div>
                    {entry.tx_hash && (
                      <div className="flex items-center gap-2">
                        <span className="font-body text-xs font-bold text-[#422D26]/50 w-8">TX</span>
                        <a
                          href={`https://${entry.chain?.toLowerCase() === "bnb" ? "bscscan.com" : "basescan.org"}/tx/${entry.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-sky-dark hover:underline"
                        >
                          {truncateCid(entry.tx_hash)}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ── IMPORT TAB ──
// ═══════════════════════════════════════════════════
function ImportTab() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.endsWith(".md")) {
      setError("Only .md files are accepted");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsText(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer?.files?.[0];
    handleFile(f);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("soul_file", file);
      const res = await api.pets.soulImport(formData);
      setResult(res);
    } catch (e) {
      setError(e.message);
    }
    setImporting(false);
  };

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragActive(false)}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-3xl border-2 border-dashed p-8 flex flex-col items-center gap-3 transition-all
          ${dragActive
            ? "border-pink bg-pink/8 scale-[1.02]"
            : file
              ? "border-mint/40 bg-mint/5"
              : "border-[#422D26]/10 bg-white/40 hover:border-pink/30 hover:bg-pink/5"
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".md"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="hidden"
        />

        <span className="text-4xl">{file ? "📄" : "🪄"}</span>

        {file ? (
          <>
            <span className="font-heading text-sm text-[#422D26]">{file.name}</span>
            <span className="font-body text-xs text-[#422D26]/60">
              {(file.size / 1024).toFixed(1)} KB &middot; Click to change
            </span>
          </>
        ) : (
          <>
            <span className="font-heading text-sm text-[#422D26]">Drop SOUL.md here</span>
            <span className="font-body text-xs text-[#422D26]/60">or click to browse &middot; .md files only</span>
          </>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="rounded-2xl overflow-hidden sticker-border">
          <div className="bg-[#1e1e2e] p-1.5 flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            <span className="font-mono text-xs text-white/40 ml-2">{file?.name}</span>
          </div>
          <pre className="bg-[#1e1e2e] p-4 overflow-x-auto max-h-48 overflow-y-auto">
            <code className="font-mono text-xs text-[#cdd6f4] leading-relaxed whitespace-pre-wrap">
              {preview}
            </code>
          </pre>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-pink/10 rounded-2xl p-3.5 flex items-start gap-2.5">
          <span className="text-lg">😿</span>
          <p className="font-body text-xs text-pink-dark">{error}</p>
        </div>
      )}

      {/* Import Button */}
      <button
        onClick={handleImport}
        disabled={!file || importing}
        className={`squishy w-full py-4 rounded-2xl sticker-border font-heading text-sm flex items-center justify-center gap-2 transition-all
          ${!file || importing
            ? "bg-cream-dark/50 text-[#422D26]/50 cursor-not-allowed"
            : "bg-gradient-to-r from-lavender/20 to-pink/20 hover:from-lavender/30 hover:to-pink/30 text-[#422D26]"
          }`}
      >
        {importing ? (
          <>
            <span className="animate-wiggle text-xl">🌀</span>
            Resurrecting...
          </>
        ) : (
          <>
            <span className="text-xl">🪄</span>
            Resurrect Pet from Soul
          </>
        )}
      </button>

      {/* Success */}
      {result && (
        <div className="bg-mint/10 rounded-3xl sticker-border p-5 text-center animate-bounce-in">
          <div className="text-4xl mb-2">🎉</div>
          <h4 className="font-heading text-base text-[#422D26] mb-1">Pet Resurrected!</h4>
          <p className="font-body text-xs text-[#422D26]/50 mb-3">
            {result.name || "Your new pet"} has been brought back from the soul file.
          </p>
          {(result.pet_id || result.id) && (
            <a
              href={`/pets/${result.pet_id || result.id}`}
              className="inline-flex items-center gap-1.5 font-body text-xs font-bold text-pink hover:text-pink-dark transition-colors"
            >
              Visit your pet &rarr;
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ── MAIN SOUL PANEL ──
// ═══════════════════════════════════════════════════
export default function SoulPanel({ petId, petName }) {
  const [activeTab, setActiveTab] = useState("preview");

  const tabs = [
    { id: "preview", label: "Preview", icon: "🔮" },
    { id: "export", label: "Export", icon: "⛓️" },
    { id: "history", label: "History", icon: "📜" },
    { id: "import", label: "Import", icon: "🪄" },
  ];

  return (
    <div className="max-w-xl mx-auto">
      {/* Panel Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-lavender/15 flex items-center justify-center text-xl sticker-border">
          🧬
        </div>
        <div>
          <h2 className="font-heading text-xl text-[#422D26]">Soul Panel</h2>
          <p className="font-body text-xs text-[#422D26]/60">{petName}'s digital essence</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            label={tab.label}
            icon={tab.icon}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white/40 backdrop-blur-sm rounded-[28px] sticker-border p-5">
        {activeTab === "preview" && <PreviewTab petId={petId} petName={petName} />}
        {activeTab === "export" && <ExportTab petId={petId} />}
        {activeTab === "history" && <HistoryTab petId={petId} />}
        {activeTab === "import" && <ImportTab />}
      </div>
    </div>
  );
}

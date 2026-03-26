import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

// ── Emotional Tone Mapping ──
const TONE_MAP = {
  joyful:    { emoji: "🌸", label: "Joyful",    bg: "from-pink-400/20 to-amber-300/20" },
  lonely:    { emoji: "🌙", label: "Lonely",    bg: "from-indigo-400/20 to-slate-400/20" },
  creative:  { emoji: "✨", label: "Creative",  bg: "from-violet-400/20 to-cyan-300/20" },
  peaceful:  { emoji: "🍃", label: "Peaceful",  bg: "from-emerald-400/20 to-teal-300/20" },
  nostalgic: { emoji: "🌅", label: "Nostalgic", bg: "from-orange-400/20 to-rose-300/20" },
  anxious:   { emoji: "🌊", label: "Anxious",   bg: "from-slate-400/20 to-blue-400/20" },
  curious:   { emoji: "🔮", label: "Curious",   bg: "from-purple-400/20 to-pink-300/20" },
  playful:   { emoji: "🎪", label: "Playful",   bg: "from-yellow-400/20 to-pink-300/20" },
  brave:     { emoji: "⚔️", label: "Brave",     bg: "from-red-400/20 to-amber-400/20" },
  dreamy:    { emoji: "☁️",  label: "Dreamy",    bg: "from-sky-400/20 to-violet-300/20" },
};

const TRAIT_DESCRIPTIONS = {
  creativity:   "How imaginative and artistic your pet's thinking is",
  social:       "How much your pet enjoys being around others",
  independence: "How self-reliant and autonomous your pet has become",
  resilience:   "How well your pet handles difficult situations",
  curiosity:    "How eager your pet is to explore and learn",
  gentleness:   "How kind and caring your pet is towards others",
  playfulness:  "How fun-loving and energetic your pet tends to be",
};

// ── Floating Stars Background ──
function StarField() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 20 }, (_, i) => (
        <span
          key={i}
          className="absolute text-white/20 animate-sparkle"
          style={{
            left: `${5 + Math.random() * 90}%`,
            top: `${5 + Math.random() * 90}%`,
            fontSize: `${6 + Math.random() * 10}px`,
            animationDelay: `${Math.random() * 4}s`,
            animationDuration: `${2 + Math.random() * 3}s`,
          }}
        >
          {["✦", "✧", "⋆", "·"][i % 4]}
        </span>
      ))}
    </div>
  );
}

// ── Moon Decoration ──
function MoonDecor() {
  return (
    <div className="absolute top-4 right-6 pointer-events-none select-none">
      <div
        className="relative text-4xl animate-float"
        style={{ animationDuration: "6s" }}
      >
        🌙
        <span
          className="absolute -top-2 -left-3 text-xs animate-sparkle"
          style={{ animationDelay: "0.5s" }}
        >
          ✦
        </span>
        <span
          className="absolute -bottom-1 -right-3 text-xs animate-sparkle"
          style={{ animationDelay: "1.2s" }}
        >
          ⋆
        </span>
      </div>
    </div>
  );
}

// ── Stat Change Delta Bar ──
function StatDelta({ label, icon, delta }) {
  const isPositive = delta > 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{icon}</span>
      <span className="font-body text-xs text-white/50 w-14">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${Math.min(100, Math.abs(delta))}%`,
            background: isPositive
              ? "linear-gradient(90deg, #7DFFB3, #70D6FF)"
              : "linear-gradient(90deg, #FF86B7, #FF6B6B)",
          }}
        />
      </div>
      <span
        className={`font-body text-xs font-bold w-10 text-right ${
          isPositive ? "text-mint" : "text-pink"
        }`}
      >
        {isPositive ? "+" : ""}
        {delta}
      </span>
    </div>
  );
}

// ── Personality Trait Bar (-1.0 to 1.0) ──
function TraitBar({ name, value, isDominant }) {
  const percent = ((value + 1) / 2) * 100; // -1→0%, 0→50%, 1→100%
  const isPositive = value >= 0;
  const desc = TRAIT_DESCRIPTIONS[name] || "";

  return (
    <div className={`py-2.5 px-3 rounded-2xl transition-all ${isDominant ? "bg-white/10 ring-1 ring-lavender/30" : ""}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`font-body text-xs font-bold capitalize ${isDominant ? "text-lavender" : "text-white/70"}`}>
          {name}
          {isDominant && <span className="ml-1.5 text-xs text-lavender/70">★ dominant</span>}
        </span>
        <span className={`font-body text-xs font-bold ${isPositive ? "text-mint/80" : "text-pink/80"}`}>
          {value > 0 ? "+" : ""}{value.toFixed(2)}
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-white/10 overflow-hidden">
        {/* Center marker */}
        <div className="absolute left-1/2 top-0 w-px h-full bg-white/20 z-10" />
        {/* Value bar */}
        {isPositive ? (
          <div
            className="absolute top-0 h-full rounded-r-full transition-all duration-700"
            style={{
              left: "50%",
              width: `${(value / 1) * 50}%`,
              background: "linear-gradient(90deg, #7DFFB380, #7DFFB3)",
            }}
          />
        ) : (
          <div
            className="absolute top-0 h-full rounded-l-full transition-all duration-700"
            style={{
              right: "50%",
              width: `${(Math.abs(value) / 1) * 50}%`,
              background: "linear-gradient(270deg, #FF86B780, #FF86B7)",
            }}
          />
        )}
      </div>
      <p className="font-body text-xs text-white/30 mt-1 leading-tight">{desc}</p>
    </div>
  );
}

// ── Personality Evolution Panel ──
function PersonalityEvolution({ petId, onClose }) {
  const [traits, setTraits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.pets
      .personalityEvolution(petId)
      .then((data) => {
        if (!cancelled) setTraits(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [petId]);

  // Find dominant trait
  const dominantTrait =
    traits?.traits &&
    Object.entries(traits.traits).reduce(
      (max, [k, v]) => (Math.abs(v) > Math.abs(max[1]) ? [k, v] : max),
      ["", 0]
    )[0];

  return (
    <div className="animate-slide-up">
      <div className="rounded-3xl p-5 mt-4"
        style={{
          background: "linear-gradient(135deg, #1a1035 0%, #16213e 50%, #0f3460 100%)",
          border: "2px solid rgba(195, 166, 255, 0.15)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(195,166,255,0.1)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧬</span>
            <h3 className="font-heading text-base text-white/90">Personality Evolution</h3>
          </div>
          <button
            onClick={onClose}
            className="squishy w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/20 text-sm transition-all"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center py-8 gap-3">
            <span className="text-3xl animate-float" style={{ animationDuration: "3s" }}>🧬</span>
            <span className="font-body text-xs text-white/30">Analyzing personality...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-6">
            <span className="font-body text-xs text-pink/60">Could not load personality data</span>
          </div>
        )}

        {traits?.traits && (
          <div className="space-y-1">
            {Object.entries(traits.traits).map(([name, value]) => (
              <TraitBar
                key={name}
                name={name}
                value={typeof value === "number" ? value : 0}
                isDominant={name === dominantTrait}
              />
            ))}
          </div>
        )}

        {traits?.description && (
          <p className="font-body text-xs text-white/40 mt-4 leading-relaxed px-1 italic">
            "{traits.description}"
          </p>
        )}
      </div>
    </div>
  );
}

// ── Latest Dream Card ──
function LatestDreamView({ petId }) {
  const [dream, setDream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.pets
      .latestDream(petId)
      .then((data) => {
        if (!cancelled) setDream(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [petId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-16 gap-4">
        <span className="text-5xl animate-float" style={{ animationDuration: "5s" }}>🌙</span>
        <span className="font-body text-sm text-white/30 font-semibold">
          Drifting through dreamland...
        </span>
      </div>
    );
  }

  if (error || !dream) {
    return (
      <div className="flex flex-col items-center py-16 gap-4 text-center px-6">
        <span className="text-5xl animate-float" style={{ animationDuration: "6s" }}>🌙</span>
        <p className="font-body text-sm text-white/40 leading-relaxed max-w-xs">
          Your pet hasn't dreamed yet... Come back after midnight~ 🌙
        </p>
        <p className="font-body text-xs text-white/20">
          Dreams are generated while your pet sleeps
        </p>
      </div>
    );
  }

  const tone = TONE_MAP[dream.emotional_tone?.toLowerCase()] || {
    emoji: "💫",
    label: dream.emotional_tone || "Unknown",
    bg: "from-violet-400/20 to-indigo-400/20",
  };

  const statIcons = {
    energy: "⚡",
    happiness: "💖",
    hunger: "🍖",
    health: "💚",
    bond: "👑",
  };

  return (
    <div className="animate-slide-up">
      {/* Dream Date */}
      <div className="flex items-center justify-center gap-2 mb-5">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <span className="font-body text-xs text-white/35 tracking-widest uppercase">
          {dream.dream_date
            ? new Date(dream.dream_date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "Recent Dream"}
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>

      {/* Emotional Tone Badge */}
      <div className="flex justify-center mb-5">
        <span
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-body text-sm font-bold text-white/80
            bg-gradient-to-r ${tone.bg} backdrop-blur-sm`}
          style={{ border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <span className="text-lg">{tone.emoji}</span>
          {tone.label}
        </span>
      </div>

      {/* Main Dream Summary */}
      <div className="relative px-2 mb-6">
        <div className="absolute -left-1 top-0 text-2xl text-white/10 font-serif">"</div>
        <p
          className="font-body text-[15px] text-white/75 leading-[1.8] text-center px-4"
          style={{ textShadow: "0 0 30px rgba(195, 166, 255, 0.15)" }}
        >
          {dream.summary}
        </p>
        <div className="absolute -right-1 bottom-0 text-2xl text-white/10 font-serif">"</div>
      </div>

      {/* Personality Changes */}
      {dream.personality_changes && Object.keys(dream.personality_changes).length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center mb-5">
          {Object.entries(dream.personality_changes).map(([trait, delta]) => {
            const isPositive = delta > 0;
            return (
              <span
                key={trait}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-body text-xs font-bold"
                style={{
                  background: isPositive ? "rgba(125,255,179,0.12)" : "rgba(255,134,183,0.12)",
                  border: `1px solid ${isPositive ? "rgba(125,255,179,0.2)" : "rgba(255,134,183,0.2)"}`,
                  color: isPositive ? "#7DFFB3" : "#FF86B7",
                }}
              >
                <span className="text-xs">{isPositive ? "▲" : "▼"}</span>
                +{trait}
              </span>
            );
          })}
        </div>
      )}

      {/* Stat Changes */}
      {dream.stat_changes && Object.keys(dream.stat_changes).length > 0 && (
        <div className="space-y-2 mb-5 px-2">
          {Object.entries(dream.stat_changes).map(([stat, delta]) => (
            <StatDelta
              key={stat}
              label={stat}
              icon={statIcons[stat] || "📊"}
              delta={delta}
            />
          ))}
        </div>
      )}

      {/* Significant Events */}
      {dream.significant_events && dream.significant_events.length > 0 && (
        <div className="mt-5 px-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">✨</span>
            <span className="font-body text-xs text-white/35 uppercase tracking-wider">
              Significant Moments
            </span>
          </div>
          <div className="space-y-2">
            {dream.significant_events.map((event, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 py-2 px-3 rounded-2xl bg-white/[0.04]"
                style={{ border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <span
                  className="text-xs mt-0.5 animate-sparkle shrink-0"
                  style={{ animationDelay: `${i * 0.4}s` }}
                >
                  ✦
                </span>
                <span className="font-body text-xs text-white/50 leading-relaxed">
                  {event}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dream History Timeline ──
function DreamHistoryView({ petId }) {
  const [dreams, setDreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [showEvolution, setShowEvolution] = useState(false);

  const loadDreams = useCallback(
    async (p) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.pets.dreams(petId, { page: p });
        const list = data.items || data.results || data || [];
        setDreams(list);
        setHasMore(data.has_more ?? data.next != null ?? list.length >= 10);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [petId]
  );

  useEffect(() => {
    loadDreams(page);
  }, [page, loadDreams]);

  if (loading && dreams.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-4">
        <span className="text-4xl animate-float" style={{ animationDuration: "5s" }}>📖</span>
        <span className="font-body text-sm text-white/30 font-semibold">
          Opening the dream journal...
        </span>
      </div>
    );
  }

  if (error && dreams.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 text-center">
        <span className="text-4xl">📖</span>
        <p className="font-body text-sm text-white/40">No dreams recorded yet</p>
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      {/* Personality Evolution Toggle */}
      <div className="flex justify-center mb-5">
        <button
          onClick={() => setShowEvolution((v) => !v)}
          className="squishy inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-body text-xs font-bold transition-all"
          style={{
            background: showEvolution
              ? "linear-gradient(135deg, rgba(195,166,255,0.2), rgba(112,214,255,0.15))"
              : "rgba(255,255,255,0.06)",
            border: showEvolution
              ? "1px solid rgba(195,166,255,0.3)"
              : "1px solid rgba(255,255,255,0.08)",
            color: showEvolution ? "#C3A6FF" : "rgba(255,255,255,0.45)",
          }}
        >
          <span>🧬</span>
          Personality Evolution
          <span className="text-xs">{showEvolution ? "▲" : "▼"}</span>
        </button>
      </div>

      {showEvolution && <PersonalityEvolution petId={petId} onClose={() => setShowEvolution(false)} />}

      {/* Timeline */}
      <div className="relative pl-6 mt-4">
        {/* Vertical timeline line */}
        <div
          className="absolute left-[9px] top-2 bottom-2 w-px"
          style={{
            background: "linear-gradient(180deg, rgba(195,166,255,0.3), rgba(112,214,255,0.15), transparent)",
          }}
        />

        <div className="space-y-3">
          {dreams.map((dream, idx) => {
            const tone = TONE_MAP[dream.emotional_tone?.toLowerCase()] || {
              emoji: "💫",
              label: dream.emotional_tone || "Dream",
            };
            const isExpanded = expandedId === (dream.id ?? idx);
            const summary = dream.summary || "";
            const truncated = summary.length > 80 ? summary.slice(0, 80) + "..." : summary;

            return (
              <div key={dream.id ?? idx} className="relative">
                {/* Timeline dot */}
                <div
                  className="absolute -left-6 top-4 w-[18px] h-[18px] rounded-full flex items-center justify-center z-10"
                  style={{
                    background: "linear-gradient(135deg, #1a1035, #16213e)",
                    border: "2px solid rgba(195,166,255,0.3)",
                    boxShadow: "0 0 8px rgba(195,166,255,0.15)",
                  }}
                >
                  <span className="text-xs">{tone.emoji}</span>
                </div>

                {/* Dream Card */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : (dream.id ?? idx))}
                  className="w-full text-left rounded-2xl p-4 transition-all duration-300"
                  style={{
                    background: isExpanded
                      ? "rgba(255,255,255,0.07)"
                      : "rgba(255,255,255,0.03)",
                    border: isExpanded
                      ? "1px solid rgba(195,166,255,0.15)"
                      : "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-body text-xs text-white/30 tracking-wider uppercase">
                      {dream.dream_date
                        ? new Date(dream.dream_date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : `Dream ${idx + 1}`}
                    </span>
                    <span className="font-body text-xs text-white/25">
                      {tone.emoji} {tone.label}
                    </span>
                  </div>
                  <p className="font-body text-xs text-white/55 leading-relaxed">
                    {isExpanded ? summary : truncated}
                  </p>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      {dream.personality_changes &&
                        Object.keys(dream.personality_changes).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(dream.personality_changes).map(([trait, delta]) => (
                              <span
                                key={trait}
                                className="px-2 py-1 rounded-full font-body text-xs font-bold"
                                style={{
                                  background: delta > 0 ? "rgba(125,255,179,0.1)" : "rgba(255,134,183,0.1)",
                                  color: delta > 0 ? "#7DFFB3" : "#FF86B7",
                                }}
                              >
                                {delta > 0 ? "▲" : "▼"} {trait}
                              </span>
                            ))}
                          </div>
                        )}
                      {dream.significant_events && dream.significant_events.length > 0 && (
                        <div className="space-y-1.5">
                          {dream.significant_events.map((event, j) => (
                            <div key={j} className="flex items-start gap-2">
                              <span className="text-xs text-lavender/50 mt-1 shrink-0">✦</span>
                              <span className="font-body text-xs text-white/40 leading-relaxed">
                                {event}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-3 mt-6">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="squishy px-4 py-2 rounded-full font-body text-xs font-bold transition-all"
          style={{
            background: page > 1 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
            color: page > 1 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.06)",
            cursor: page <= 1 ? "not-allowed" : "pointer",
          }}
        >
          ← Newer
        </button>
        <span className="font-body text-xs text-white/25">Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore}
          className="squishy px-4 py-2 rounded-full font-body text-xs font-bold transition-all"
          style={{
            background: hasMore ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
            color: hasMore ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.06)",
            cursor: !hasMore ? "not-allowed" : "pointer",
          }}
        >
          Older →
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// ── Main DreamJournal Component ──
// ════════════════════════════════════════
export default function DreamJournal({ petId }) {
  const [view, setView] = useState("latest"); // "latest" | "history"

  if (!petId) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-28 pb-28 text-center">
        <span className="text-5xl animate-float">🌙</span>
        <p className="font-body text-sm text-pink/60 mt-4">Select a pet to view their dreams</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-28 pb-28">
      {/* ═══ DREAM STAGE ═══ */}
      <div
        className="relative rounded-[32px] overflow-hidden p-6"
        style={{
          background: "linear-gradient(165deg, #0d0221 0%, #150b3a 25%, #1a1054 50%, #0f2862 75%, #0c1445 100%)",
          border: "2.5px solid rgba(195, 166, 255, 0.1)",
          boxShadow:
            "0 4px 40px rgba(15, 10, 60, 0.5), 0 0 80px rgba(195, 166, 255, 0.05), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <StarField />
        <MoonDecor />

        {/* Header */}
        <div className="relative z-10 text-center mb-6">
          <h2
            className="font-heading text-2xl text-white/90 mb-1"
            style={{ textShadow: "0 0 20px rgba(195, 166, 255, 0.3)" }}
          >
            Dream Journal
          </h2>
          <p className="font-body text-xs text-white/25 tracking-wider">
            Where memories become stardust
          </p>
        </div>

        {/* View Switcher */}
        <div className="relative z-10 flex justify-center gap-2 mb-6">
          {[
            { key: "latest", label: "Latest Dream", icon: "🌟" },
            { key: "history", label: "Dream History", icon: "📖" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className="squishy flex items-center gap-1.5 px-4 py-2.5 rounded-full font-body text-xs font-bold transition-all"
              style={{
                background:
                  view === tab.key
                    ? "linear-gradient(135deg, rgba(195,166,255,0.2), rgba(112,214,255,0.12))"
                    : "rgba(255,255,255,0.04)",
                border:
                  view === tab.key
                    ? "1px solid rgba(195,166,255,0.25)"
                    : "1px solid rgba(255,255,255,0.06)",
                color: view === tab.key ? "#C3A6FF" : "rgba(255,255,255,0.35)",
                boxShadow:
                  view === tab.key ? "0 0 15px rgba(195,166,255,0.1)" : "none",
              }}
            >
              <span className="text-sm">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10">
          {view === "latest" ? (
            <LatestDreamView petId={petId} />
          ) : (
            <DreamHistoryView petId={petId} />
          )}
        </div>

        {/* Bottom gradient fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
          style={{
            background: "linear-gradient(transparent, rgba(13,2,33,0.5))",
          }}
        />
      </div>
    </div>
  );
}

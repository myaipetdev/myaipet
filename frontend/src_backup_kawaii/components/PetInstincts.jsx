import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

const URGE_CONFIG = {
  CREATE_VIDEO: { icon: "🎬", label: "Create", color: "#FF86B7", glow: "rgba(255,134,183,0.5)" },
  EXPLORE:      { icon: "🗺️", label: "Explore", color: "#70D6FF", glow: "rgba(112,214,255,0.5)" },
  SOCIALIZE:    { icon: "💬", label: "Socialize", color: "#C3A6FF", glow: "rgba(195,166,255,0.5)" },
  REST:         { icon: "😴", label: "Rest", color: "#7DFFB3", glow: "rgba(125,255,179,0.5)" },
  LEARN:        { icon: "📚", label: "Learn", color: "#FFD23F", glow: "rgba(255,210,63,0.5)" },
  PLAY:         { icon: "🎮", label: "Play", color: "#FF86B7", glow: "rgba(255,134,183,0.5)" },
};

const MOOD_EMOJIS = {
  ecstatic: "🤩",
  happy: "😊",
  neutral: "😐",
  sad: "😢",
  exhausted: "😴",
  hungry: "😋",
  tired: "😪",
  excited: "🥳",
  curious: "🧐",
  playful: "😸",
};

// Mock data for demo/fallback
const MOCK_INSTINCTS = {
  urges: [
    { type: "CREATE_VIDEO", intensity: 82, label: "Create a video" },
    { type: "EXPLORE", intensity: 45, label: "Go exploring" },
    { type: "SOCIALIZE", intensity: 67, label: "Talk to friends" },
    { type: "REST", intensity: 20, label: "Take a nap" },
    { type: "LEARN", intensity: 55, label: "Learn something new" },
    { type: "PLAY", intensity: 73, label: "Play a game" },
  ],
  mood: "happy",
  should_act: true,
};

function UrgeBar({ type, intensity, label }) {
  const config = URGE_CONFIG[type] || URGE_CONFIG.PLAY;
  const pct = Math.min(100, Math.max(0, intensity));
  const isHigh = pct > 70;

  return (
    <div className="flex items-center gap-2 group">
      {/* Icon */}
      <span
        className={`text-base w-7 text-center shrink-0 transition-transform duration-300 ${
          isHigh ? "animate-wiggle" : "group-hover:scale-110"
        }`}
      >
        {config.icon}
      </span>

      {/* Bar container */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-body text-xs font-bold text-[#422D26]/60 truncate">
            {config.label}
          </span>
          <span className="font-body text-xs font-bold text-[#422D26]/55 ml-1">
            {pct}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-cream-dark overflow-hidden relative">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out relative"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${config.color}88, ${config.color})`,
              boxShadow: isHigh ? `0 0 12px ${config.glow}` : "none",
              animation: isHigh ? "urge-pulse 1.5s ease-in-out infinite" : "none",
            }}
          >
            {/* Shine effect on high intensity */}
            {isHigh && (
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                  animation: "progress-shine 2s ease-in-out infinite",
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PetInstincts({ petId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInstincts = useCallback(async () => {
    if (!petId) return;
    try {
      const result = await api.pets.instincts(petId);
      setData(result);
    } catch {
      setData(MOCK_INSTINCTS);
    }
    setLoading(false);
  }, [petId]);

  // Initial fetch + auto-refresh every 30s
  useEffect(() => {
    fetchInstincts();
    const interval = setInterval(fetchInstincts, 30000);
    return () => clearInterval(interval);
  }, [fetchInstincts]);

  if (loading || !data) {
    return (
      <div className="bg-white/60 backdrop-blur-sm rounded-3xl sticker-border p-4">
        <div className="flex items-center justify-center gap-2 py-6">
          <span className="text-2xl animate-float">🐾</span>
          <span className="font-body text-xs text-pink/60 font-semibold">
            Reading pet's mind...
          </span>
        </div>
      </div>
    );
  }

  const moodEmoji = MOOD_EMOJIS[data.mood] || "😊";

  // Ensure all 6 urge types are present, even if API returns fewer
  const urgeMap = {};
  (data.urges || []).forEach((u) => {
    urgeMap[u.type] = u;
  });
  const allUrges = Object.keys(URGE_CONFIG).map((type) => ({
    type,
    intensity: urgeMap[type]?.intensity ?? 0,
    label: urgeMap[type]?.label ?? URGE_CONFIG[type].label,
  }));

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-3xl sticker-border p-4 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <span className="font-heading text-sm text-[#422D26]">Instincts</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/80 px-2.5 py-1 rounded-full sticker-border">
          <span className="text-sm">{moodEmoji}</span>
          <span className="font-body text-xs font-bold text-[#422D26]/50 capitalize">
            {data.mood}
          </span>
        </div>
      </div>

      {/* Should Act Banner */}
      {data.should_act && (
        <div
          className="mb-3 px-3 py-2 rounded-2xl text-center animate-slide-up"
          style={{
            background: "linear-gradient(135deg, rgba(255,134,183,0.15), rgba(255,210,63,0.15))",
            animation: "pulse-glow 2s ease-in-out infinite",
            border: "2px solid rgba(255,134,183,0.2)",
          }}
        >
          <span className="font-body text-xs font-bold text-[#422D26]/70">
            ✨ Your pet wants to do something! ✨
          </span>
        </div>
      )}

      {/* Urge Bars */}
      <div className="space-y-2">
        {allUrges.map((urge) => (
          <UrgeBar key={urge.type} {...urge} />
        ))}
      </div>

      {/* Inline keyframes for urge pulse */}
      <style>{`
        @keyframes urge-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }
      `}</style>
    </div>
  );
}

import { useState } from "react";

// ── Heart Slot Tracker ──
function HeartTracker({ used, total, label, sublabel, color = "pink" }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl sticker-border p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-heading text-base text-[#422D26]">{label}</h3>
          <p className="font-body text-xs text-pink/60">{sublabel}</p>
        </div>
        <span className={`font-heading text-lg ${
          used >= total ? "text-pink/60" : color === "pink" ? "text-pink" : "text-sun-dark"
        }`}>
          {total - used}/{total}
        </span>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: total }, (_, i) => {
          const filled = i < total - used;
          return (
            <div
              key={i}
              className={`squishy flex-1 h-10 rounded-2xl flex items-center justify-center text-xl transition-all duration-300
                ${filled
                  ? color === "pink"
                    ? "bg-pink/15 shadow-sm"
                    : "bg-sun/20 shadow-sm"
                  : "bg-cream-dark/60"
                }`}
              style={filled ? {
                animation: `float 3s ease-in-out infinite`,
                animationDelay: `${i * 0.2}s`,
              } : {}}
            >
              {color === "pink"
                ? (filled ? "💖" : "🤍")
                : (filled ? "🦴" : "💨")}
            </div>
          );
        })}
      </div>
      <p className="font-body text-xs text-pink/65 mt-2 text-center">
        {used >= total ? "All used up! Come back tomorrow 🌙" : `Tap on your pet to use!`}
      </p>
    </div>
  );
}

// ── Progress Bar ──
function CrystalProgress({ current, target }) {
  const pct = Math.min(100, (current / target) * 100);

  return (
    <div
      className="bg-white/80 backdrop-blur-sm rounded-3xl sticker-border p-6 relative overflow-hidden"
      style={{ border: "2.5px solid rgba(255,210,63,0.25)" }}
    >
      {/* Background glow */}
      <div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-15 pointer-events-none"
        style={{ background: "radial-gradient(circle, #FFD23F, transparent)" }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl animate-float">🔮</span>
          <div>
            <h3 className="font-heading text-lg text-[#422D26]">Next Pet Incubation</h3>
            <p className="font-body text-xs text-pink/60">Earn crystals to hatch a new pet!</p>
          </div>
        </div>

        {/* Crystal slots */}
        <div className="flex gap-2 my-5 justify-center">
          {Array.from({ length: target }, (_, i) => (
            <div
              key={i}
              className={`squishy w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-all duration-500
                ${i < current
                  ? "bg-sun/25 shadow-md scale-105"
                  : "bg-cream-dark/50"
                }`}
              style={i < current ? {
                animation: `float 2.5s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
              } : {}}
            >
              {i < current ? "💎" : "⬜"}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-5 rounded-full bg-cream-dark overflow-hidden sticker-border mb-3">
          <div
            className="h-full rounded-full relative transition-all duration-1000 ease-out"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #FFD23F, #FF86B7, #70D6FF)",
            }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                animation: "progress-shine 2s ease-in-out infinite",
              }}
            />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="font-heading text-sm text-sun-dark">
            Grok Crystals: {current} / {target}
          </span>
          <span className="font-body text-xs text-pink/65 font-semibold">
            {target - current} more to go!
          </span>
        </div>

        <p className="font-body text-xs text-pink/55 mt-3 text-center bg-sun/8 rounded-2xl py-2 px-3">
          💡 Spend all your Community Treats daily to earn a crystal!
        </p>
      </div>
    </div>
  );
}

// ── Streak Counter ──
function StreakBadge({ days }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl sticker-border p-4 flex items-center gap-4">
      <div className="text-4xl animate-float">🔥</div>
      <div className="flex-1">
        <h3 className="font-heading text-base text-[#422D26]">{days}-Day Streak!</h3>
        <p className="font-body text-xs text-pink/60">Keep it up for bonus rewards</p>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className={`w-3 h-8 rounded-full transition-all ${
              i < days % 7 ? "bg-gradient-to-t from-pink to-sun" : "bg-cream-dark"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Dashboard ──
export default function EnergyDashboard({ onGoToArena }) {
  const [patsUsed, setPatsUsed] = useState(2);
  const [treatsUsed, setTreatsUsed] = useState(4);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-28 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-3xl text-[#422D26] mb-1">Daily Energy & Rewards</h1>
        <p className="font-body text-sm text-pink/60">Your daily quota resets at midnight UTC</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Streak */}
        <StreakBadge days={5} />

        {/* Owner Pats */}
        <HeartTracker
          used={patsUsed}
          total={5}
          label="Owner Pats"
          sublabel="For your pet"
          color="pink"
        />

        {/* Community Treats */}
        <HeartTracker
          used={treatsUsed}
          total={10}
          label="Community Treats"
          sublabel="For the Arena"
          color="sun"
        />

        {/* Crystal Progress */}
        <CrystalProgress current={3} target={7} />

        {/* CTA */}
        <button
          onClick={onGoToArena}
          className="squishy w-full bg-sky text-white font-heading text-lg py-4 rounded-full
                     shadow-lg hover:bg-sky-dark hover:shadow-xl transition-all"
          style={{ boxShadow: "0 8px 30px rgba(112,214,255,0.35)" }}
        >
          Go to Arena to Spend Treats ⚔️
        </button>
      </div>
    </div>
  );
}

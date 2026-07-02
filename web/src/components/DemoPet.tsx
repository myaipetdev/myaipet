"use client";

/**
 * No-wallet demo pet — the funnel fix. A cold visitor who clicks "Adopt" used to
 * hit a wallet wall before feeling anything. Now they meet a living pet they can
 * feed/play/pet (real reactions, no backend), see it remember their care, and
 * THEN get the adopt CTA. Conveys the core "it's alive + remembers me" promise
 * before asking for a wallet.
 *
 * Fully client-side + ephemeral — no API, no persistence. The `cta` slot carries
 * whatever sign-in control the gate wants (Connect / Sign In).
 */

import { useState, type ReactNode } from "react";
import Icon from "@/components/Icon";

const NAME = "Mochi";
const clamp = (n: number) => Math.max(0, Math.min(100, n));

type CareType = "feed" | "play" | "pet";
const CARE: Record<CareType, { label: string; icon: ReactNode; burst: string; anim: string; happiness: number; energy: number; hunger: number; bond: number; mem: string }> = {
  feed: { label: "Feed", icon: <Icon name="chicken" size={18} />, burst: "🍖", anim: "dpBounce", happiness: 6,  energy: 3,   hunger: -22, bond: 1, mem: `You fed ${NAME}` },
  play: { label: "Play", icon: <Icon name="joystick" size={18} />, burst: "🎉", anim: "dpBounce", happiness: 13, energy: -12, hunger: 8,   bond: 2, mem: `You played with ${NAME}` },
  pet:  { label: "Pet",  icon: <Icon name="paw" size={18} />, burst: "💖", anim: "dpWiggle", happiness: 9,  energy: 4,   hunger: 2,   bond: 4, mem: `You pet ${NAME}` },
};

export default function DemoPet({ cta, ctaNote }: { cta?: ReactNode; ctaNote?: string }) {
  const [stats, setStats] = useState({ happiness: 58, energy: 66, hunger: 45, bond: 14 });
  const [react, setReact] = useState<{ anim: string; burst: string; n: number } | null>(null);
  const [pops, setPops] = useState<Array<{ id: number; text: string; color: string }>>([]);
  const [memory, setMemory] = useState<string[]>([]);
  const [cares, setCares] = useState(0);

  const moodEmote = stats.happiness >= 85 ? "✨" : stats.happiness >= 55 ? "💖" : stats.hunger >= 75 ? "🍖" : "·";

  const care = (type: CareType) => {
    const fx = CARE[type];
    setStats((s) => ({
      happiness: clamp(s.happiness + fx.happiness),
      energy: clamp(s.energy + fx.energy),
      hunger: clamp(s.hunger + fx.hunger),
      bond: clamp(s.bond + fx.bond),
    }));
    setReact({ anim: fx.anim, burst: fx.burst, n: Date.now() });
    setTimeout(() => setReact(null), 900);
    const pop = { id: Date.now(), text: `+${fx.happiness}💖`, color: "#f472b6" };
    setPops((p) => [...p, pop]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== pop.id)), 1500);
    setMemory((m) => [fx.mem, ...m].slice(0, 3));
    setCares((c) => c + 1);
  };

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "120px 20px 48px", textAlign: "center" }}>
      <style>{`
        @keyframes dpBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
        @keyframes dpFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        @keyframes dpBounce { 0%{transform:translateY(0) scale(1);} 30%{transform:translateY(-13px) scale(1.07);} 60%{transform:translateY(0) scale(0.96);} 100%{transform:translateY(0) scale(1);} }
        @keyframes dpWiggle { 0%,100%{transform:rotate(0);} 20%{transform:rotate(-8deg);} 60%{transform:rotate(8deg);} 85%{transform:rotate(-3deg);} }
        @keyframes dpBurst { 0%{opacity:0;transform:translateX(-50%) translateY(0) scale(0.3);} 30%{opacity:1;transform:translateX(-50%) translateY(-14px) scale(1.3);} 100%{opacity:0;transform:translateX(-50%) translateY(-44px) scale(1);} }
        @keyframes dpDrift { 0%{opacity:0;transform:translateY(2px) scale(0.5);} 25%{opacity:1;transform:translateY(-10px) scale(1);} 80%{opacity:0.85;transform:translateY(-26px) scale(1);} 100%{opacity:0;transform:translateY(-42px) scale(0.8);} }
        @keyframes dpPop { 0%{opacity:0;transform:translateY(8px) scale(0.7);} 25%{opacity:1;transform:translateY(-4px) scale(1.1);} 100%{opacity:0;transform:translateY(-40px) scale(0.9);} }
      `}</style>

      <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, letterSpacing: "0.14em", color: "#9A4E1E", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>
        TRY IT — NO WALLET NEEDED
      </div>
      <h2 style={{ fontFamily: "var(--ed-disp)", fontSize: 26, fontWeight: 800, color: "#211A12", letterSpacing: "-0.02em", margin: "0 0 4px" }}>
        Meet {NAME} 👋
      </h2>
      <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#7A6E5A", margin: "0 0 22px" }}>
        Care for them and watch them respond. This one&apos;s a demo — adopt to start your own.
      </p>

      {/* Living demo portrait */}
      <div style={{ position: "relative", display: "inline-block", marginBottom: 18 }}>
        {/* floating stat pops */}
        {pops.map((p, i) => (
          <div key={p.id} style={{
            position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
            fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 20, color: p.color,
            zIndex: 11, pointerEvents: "none", textShadow: "0 2px 8px rgba(0,0,0,0.18)",
            animation: "dpPop 1.5s ease-out forwards", marginLeft: i * 4,
          }}>{p.text}</div>
        ))}
        {/* ambient mood emote */}
        {moodEmote !== "·" && (
          <div style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", zIndex: 9, pointerEvents: "none" }}>
            <div style={{ fontSize: 24, animation: "dpDrift 2.4s ease-out infinite" }}>{moodEmote}</div>
          </div>
        )}
        {/* care burst */}
        {react && (
          <div style={{ position: "absolute", top: -6, left: "50%", fontSize: 44, zIndex: 12, pointerEvents: "none", animation: "dpBurst 0.9s ease-out forwards" }}>
            {react.burst}
          </div>
        )}
        <div
          onClick={() => care("pet")}
          title="boop"
          style={{
            width: 150, height: 150, borderRadius: 44, overflow: "hidden", cursor: "pointer",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
            animation: react ? `${react.anim} 0.85s ease-in-out` : "dpFloat 6s ease-in-out infinite",
            display: "flex", alignItems: "center", justifyContent: "center", background: "#F5EFE2",
          }}
        >
          <img src="/mascot.jpg" alt={NAME} style={{ width: "100%", height: "100%", objectFit: "cover", animation: "dpBreathe 3.4s ease-in-out infinite" }} />
        </div>
      </div>

      {/* Stat bars */}
      <div style={{ maxWidth: 320, margin: "0 auto 18px", display: "flex", flexDirection: "column", gap: 7 }}>
        {([
          { k: "happiness", label: "Happy", icon: "heart", color: "#f472b6" },
          { k: "energy", label: "Energy", icon: "electric", color: "#60a5fa" },
          { k: "bond", label: "Bond", icon: "paw", color: "#c084fc" },
        ] as const).map((row) => (
          <div key={row.k}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A", marginBottom: 3 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name={row.icon} size={13} /> {row.label}</span><span>{Math.round((stats as any)[row.k])}</span>
            </div>
            <div style={{ height: 7, background: "#ECE4D4", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(stats as any)[row.k]}%`, background: row.color, borderRadius: 4, transition: "width 0.4s ease" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Care buttons */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14 }}>
        {(Object.keys(CARE) as CareType[]).map((k) => (
          <button key={k} onClick={() => care(k)} className="mp-lift" style={{
            padding: "10px 18px", borderRadius: 12, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", background: "#FBF6EC",
            cursor: "pointer", fontFamily: "var(--ed-disp)", fontWeight: 700, fontSize: 14, color: "#211A12",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 16, display: "inline-flex" }}>{CARE[k].icon}</span>{CARE[k].label}
          </button>
        ))}
      </div>

      {/* Memory ticker — hint at the "it remembers" moat */}
      <div style={{
        maxWidth: 320, margin: "0 auto 24px", minHeight: 34, padding: "8px 12px", borderRadius: 10,
        background: "#F5EFE2", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", textAlign: "left",
      }}>
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A4E1E", letterSpacing: "0.12em", marginBottom: memory.length ? 4 : 0, textTransform: "uppercase" }}>
          {NAME.toUpperCase()} REMEMBERS
        </div>
        {memory.length === 0 ? (
          <div style={{ fontFamily: "var(--ed-body)", fontSize: 12, color: "#9A7B4E", fontStyle: "italic" }}>
            Care for {NAME} and they&apos;ll remember it…
          </div>
        ) : memory.map((m, i) => (
          <div key={i} style={{ fontFamily: "var(--ed-body)", fontSize: 12.5, color: "#5C5140", opacity: 1 - i * 0.3 }}>· {m}</div>
        ))}
      </div>

      {/* Adopt CTA */}
      <div style={{
        position: "sticky", bottom: 0, padding: "16px 18px", borderRadius: 16,
        background: "linear-gradient(135deg, #211A12, #1E1710)", color: "#FFF8EE",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
          {cares >= 2 ? `Adopt to keep ${NAME} growing 🌱` : `Adopt your own pet`}
        </div>
        <div style={{ fontFamily: "var(--ed-body)", fontSize: 12.5, color: "rgba(255,248,238,0.7)", marginBottom: 14 }}>
          {ctaNote || "Sign in with your wallet — no gas, identity only. Your pet remembers you across every session."}
        </div>
        <div style={{ display: "inline-block" }}>{cta}</div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { LOGO_SRC } from "./Nav";

const FLOAT_PETS = [
  { emoji: "🐱", x: 12, y: 20, delay: 0, size: 32 },
  { emoji: "🐕", x: 78, y: 15, delay: 1.2, size: 28 },
  { emoji: "🦜", x: 25, y: 65, delay: 2.4, size: 24 },
  { emoji: "🐢", x: 85, y: 55, delay: 0.8, size: 26 },
  { emoji: "🐹", x: 50, y: 75, delay: 1.8, size: 22 },
  { emoji: "🦊", x: 8, y: 50, delay: 3.0, size: 26 },
  { emoji: "🐰", x: 90, y: 35, delay: 0.4, size: 24 },
  { emoji: "🐶", x: 60, y: 12, delay: 2.0, size: 28 },
];

function FloatingPet({ emoji, x, y, delay, size }) {
  return (
    <div style={{
      position: "absolute", left: `${x}%`, top: `${y}%`,
      fontSize: size, opacity: 0.12,
      animation: `petFloat 6s ease-in-out ${delay}s infinite`,
      pointerEvents: "none", zIndex: 1,
    }}>
      {emoji}
    </div>
  );
}

function Particles() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let particles = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        a: Math.random() * 0.15 + 0.03,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(251,191,36,${p.a})`;
        ctx.fill();
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(251,191,36,${0.03 * (1 - dist / 120)})`;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position: "absolute", inset: 0, width: "100%", height: "100%",
      pointerEvents: "none", zIndex: 0,
    }} />
  );
}

const FEATURES = [
  { icon: "🧬", label: "Pet Growth System", desc: "Evolving personality & stats" },
  { icon: "🎨", label: "Grok AI Generation", desc: "Personalized pet content" },
  { icon: "💬", label: "Social Community", desc: "Share, like & comment" },
  { icon: "🔗", label: "On-Chain Records", desc: "Every action verifiable" },
];

export default function Hero({ onGenerate, onAdopt, txToday }) {
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % FEATURES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      textAlign: "center", padding: "130px 40px 60px", position: "relative",
      minHeight: 560, overflow: "hidden",
    }}>
      <style>{`
        @keyframes petFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-12px) rotate(3deg); }
          75% { transform: translateY(8px) rotate(-3deg); }
        }
        @keyframes logoGlow {
          0%, 100% { box-shadow: 0 0 40px rgba(251,191,36,0.15), 0 8px 32px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 60px rgba(251,191,36,0.3), 0 8px 32px rgba(0,0,0,0.3); }
        }
        @keyframes featureFade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      <Particles />

      {/* Ambient glow */}
      <div style={{
        position: "absolute", width: 500, height: 500, borderRadius: "50%",
        filter: "blur(120px)", opacity: 0.08, background: "#f59e0b",
        top: -80, left: "30%", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", width: 300, height: 300, borderRadius: "50%",
        filter: "blur(100px)", opacity: 0.06, background: "#8b5cf6",
        top: 150, right: "20%", pointerEvents: "none",
      }} />

      {/* Floating pet emojis */}
      {FLOAT_PETS.map((p, i) => (
        <FloatingPet key={i} {...p} />
      ))}

      {/* Live counter badge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 16px",
        borderRadius: 20, background: "rgba(251,191,36,0.06)",
        border: "1px solid rgba(251,191,36,0.12)", marginBottom: 28,
        position: "relative", zIndex: 2,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: "#4ade80",
          boxShadow: "0 0 8px rgba(74,222,128,0.6)",
          animation: "pulse 2s ease-in-out infinite",
        }} />
        <span style={{ fontFamily: "mono", fontSize: 11, color: "#fde68a", fontWeight: 500 }}>
          {txToday} creations today
        </span>
      </div>

      {/* Logo with glow animation */}
      <div style={{ marginBottom: 28, position: "relative", zIndex: 2 }}>
        <img src={LOGO_SRC} alt="mascot" style={{
          width: 100, height: 100, borderRadius: 24, objectFit: "cover",
          border: "3px solid rgba(251,191,36,0.2)",
          animation: "logoGlow 3s ease-in-out infinite",
        }} />
      </div>

      <h1 style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(42px,5.5vw,72px)",
        fontWeight: 700, color: "white", lineHeight: 1.05,
        margin: "0 auto 10px", maxWidth: 700, letterSpacing: "-0.03em",
        position: "relative", zIndex: 2,
      }}>
        Your AI Pet,<br />
        <span style={{
          background: "linear-gradient(135deg,#fbbf24,#f59e0b,#d97706,#fbbf24)",
          backgroundSize: "300% 300%",
          animation: "gradientShift 4s ease infinite",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Alive & Growing
        </span>
      </h1>

      <p style={{
        fontFamily: "mono", fontSize: 14, color: "rgba(255,255,255,0.35)",
        maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.8,
        position: "relative", zIndex: 2,
      }}>
        Adopt an AI pet that grows with you. Generate cinematic content powered by Grok AI.
        Every interaction shapes their personality — every creation lives on-chain.
      </p>

      {/* Feature carousel */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 8, marginBottom: 36,
        position: "relative", zIndex: 2,
      }}>
        {FEATURES.map((f, i) => (
          <button key={i} onClick={() => setActiveFeature(i)} style={{
            background: activeFeature === i
              ? "rgba(251,191,36,0.08)"
              : "rgba(255,255,255,0.015)",
            border: activeFeature === i
              ? "1px solid rgba(251,191,36,0.2)"
              : "1px solid rgba(255,255,255,0.04)",
            borderRadius: 12, padding: "10px 16px", cursor: "pointer",
            transition: "all 0.3s ease", minWidth: 150,
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{f.icon}</div>
            <div style={{
              fontFamily: "mono", fontSize: 10, fontWeight: 600,
              color: activeFeature === i ? "#fde68a" : "rgba(255,255,255,0.4)",
              marginBottom: 2,
            }}>{f.label}</div>
            <div style={{
              fontFamily: "mono", fontSize: 9,
              color: activeFeature === i ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)",
            }}>{f.desc}</div>
          </button>
        ))}
      </div>

      {/* CTA buttons */}
      <div style={{ display: "flex", gap: 14, justifyContent: "center", position: "relative", zIndex: 2 }}>
        <button onClick={onGenerate} style={{
          background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none",
          borderRadius: 12, padding: "14px 36px",
          fontFamily: "mono", fontSize: 13, fontWeight: 600, color: "white", cursor: "pointer",
          boxShadow: "0 0 32px rgba(245,158,11,0.3),inset 0 1px 0 rgba(255,255,255,0.15)",
          transition: "all 0.3s",
        }}>
          Create with AI
        </button>
        <button onClick={onAdopt} style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 12, padding: "14px 36px",
          fontFamily: "mono", fontSize: 13, fontWeight: 600,
          color: "rgba(255,255,255,0.5)", cursor: "pointer", transition: "all 0.3s",
        }}>
          Adopt a Pet
        </button>
      </div>
    </div>
  );
}

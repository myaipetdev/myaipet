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
      fontSize: size, opacity: 0.2,
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
        ctx.fillStyle = `rgba(251,191,36,${p.a * 2})`;
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(251,191,36,${0.06 * (1 - dist / 120)})`;
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

const PILLARS = [
  { icon: "🎬", label: "AI Video Engine", desc: "Personalized content that earns" },
  { icon: "🧬", label: "Evolve & Equip", desc: "Skills, skins & marketplace" },
  { icon: "💬", label: "Social Circle", desc: "Life sharing & network effects" },
  { icon: "🏛️", label: "Memorial System", desc: "Eternal on-chain legacy" },
];

export default function Hero({ onAdopt, onExplore, txToday }) {
  const [activePillar, setActivePillar] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActivePillar(prev => (prev + 1) % PILLARS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      textAlign: "center", padding: "130px 40px 60px", position: "relative",
      minHeight: 580, overflow: "hidden",
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
        filter: "blur(120px)", opacity: 0.06, background: "#f59e0b",
        top: -80, left: "30%", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", width: 300, height: 300, borderRadius: "50%",
        filter: "blur(100px)", opacity: 0.04, background: "#8b5cf6",
        top: 150, right: "20%", pointerEvents: "none",
      }} />

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
        <span style={{ fontFamily: "mono", fontSize: 11, color: "#b45309", fontWeight: 500 }}>
          {txToday} interactions today
        </span>
      </div>

      {/* Logo */}
      <div style={{ marginBottom: 28, position: "relative", zIndex: 2 }}>
        <img src={LOGO_SRC} alt="mascot" style={{
          width: 160, height: 160, borderRadius: 40, objectFit: "cover",
          border: "4px solid rgba(251,191,36,0.25)",
          animation: "logoGlow 3s ease-in-out infinite",
          background: "linear-gradient(135deg, #fef3c7, #fde68a)",
        }} />
      </div>

      {/* Main headline */}
      <h1 style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(36px,5vw,64px)",
        fontWeight: 700, color: "#1a1a2e", lineHeight: 1.1,
        margin: "0 auto 6px", maxWidth: 720, letterSpacing: "-0.03em",
        position: "relative", zIndex: 2,
      }}>
        The Future of Companionship
        <br />
        <span style={{ color: "rgba(26,26,46,0.35)", fontSize: "0.75em" }}>is</span>{" "}
        <span style={{
          background: "linear-gradient(135deg,#fbbf24,#f59e0b,#d97706,#fbbf24)",
          backgroundSize: "300% 300%",
          animation: "gradientShift 4s ease infinite",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          On-Chain
        </span>
      </h1>

      {/* Tagline */}
      <div style={{
        display: "inline-flex", gap: 16, alignItems: "center",
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 600,
        color: "#b45309", marginBottom: 18, position: "relative", zIndex: 2,
        letterSpacing: "0.04em",
      }}>
        <span>🐾 Raise</span>
        <span style={{ color: "rgba(26,26,46,0.15)" }}>·</span>
        <span>Bond</span>
        <span style={{ color: "rgba(26,26,46,0.15)" }}>·</span>
        <span>Earn</span>
      </div>

      <p style={{
        fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.5)",
        maxWidth: 560, margin: "0 auto 34px", lineHeight: 1.8,
        position: "relative", zIndex: 2,
      }}>
        Raise a one-of-a-kind AI pet that grows, evolves, and generates real economic value.
        Every interaction shapes their personality — every creation lives on-chain.
        Welcome to <span style={{ color: "#d97706", fontWeight: 600 }}>CompanionFi</span>.
      </p>

      {/* Ecosystem pillars */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 8, marginBottom: 36,
        position: "relative", zIndex: 2,
      }}>
        {PILLARS.map((f, i) => (
          <button key={i} onClick={() => setActivePillar(i)} style={{
            background: activePillar === i
              ? "rgba(251,191,36,0.12)"
              : "rgba(0,0,0,0.02)",
            border: activePillar === i
              ? "1px solid rgba(251,191,36,0.25)"
              : "1px solid rgba(0,0,0,0.06)",
            borderRadius: 12, padding: "10px 16px", cursor: "pointer",
            transition: "all 0.3s ease", minWidth: 150,
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{f.icon}</div>
            <div style={{
              fontFamily: "mono", fontSize: 10, fontWeight: 600,
              color: activePillar === i ? "#b45309" : "rgba(26,26,46,0.5)",
              marginBottom: 2,
            }}>{f.label}</div>
            <div style={{
              fontFamily: "mono", fontSize: 9,
              color: activePillar === i ? "rgba(26,26,46,0.45)" : "rgba(26,26,46,0.3)",
            }}>{f.desc}</div>
          </button>
        ))}
      </div>

      {/* CTA */}
      <div style={{ display: "flex", gap: 14, justifyContent: "center", position: "relative", zIndex: 2 }}>
        <button onClick={onAdopt} style={{
          background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none",
          borderRadius: 12, padding: "14px 36px",
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, color: "white", cursor: "pointer",
          boxShadow: "0 0 32px rgba(245,158,11,0.3),inset 0 1px 0 rgba(255,255,255,0.15)",
          transition: "all 0.3s",
        }}>
          🐾 Start Raising
        </button>
        <button onClick={onExplore} style={{
          background: "rgba(0,0,0,0.03)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12, padding: "14px 36px",
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600,
          color: "rgba(26,26,46,0.5)", cursor: "pointer", transition: "all 0.3s",
        }}>
          Explore Community
        </button>
      </div>

      {/* Backed by */}
      <div style={{
        marginTop: 44, position: "relative", zIndex: 2,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Strategic Partners
        </span>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          {["Animoca Brands", "Web3 Labs", "Arkstream", "ICC Ventures"].map(name => (
            <span key={name} style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 500,
              color: "rgba(26,26,46,0.3)",
            }}>
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

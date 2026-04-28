"use client";

import { useState, useEffect, useRef } from "react";
import { LOGO_SRC } from "./Nav";
import Icon from "@/components/Icon";
import { MOCK_IMAGES } from "@/lib/mockData";

const FLOAT_PETS = [
  { emoji: "🐱", x: 8, y: 18, delay: 0, size: 38 },
  { emoji: "🐕", x: 82, y: 12, delay: 1.2, size: 34 },
  { emoji: "🦜", x: 18, y: 62, delay: 2.4, size: 30 },
  { emoji: "🐢", x: 88, y: 52, delay: 0.8, size: 32 },
  { emoji: "🐹", x: 45, y: 78, delay: 1.8, size: 28 },
  { emoji: "🦊", x: 5, y: 45, delay: 3.0, size: 32 },
  { emoji: "🐰", x: 92, y: 32, delay: 0.4, size: 30 },
  { emoji: "🐶", x: 65, y: 10, delay: 2.0, size: 34 },
  { emoji: "🌸", x: 15, y: 35, delay: 0.6, size: 22 },
  { emoji: "✨", x: 75, y: 40, delay: 1.5, size: 20 },
  { emoji: "💛", x: 30, y: 80, delay: 2.8, size: 18 },
  { emoji: "🌿", x: 55, y: 20, delay: 3.5, size: 20 },
  { emoji: "☁️", x: 25, y: 8, delay: 0.3, size: 26 },
  { emoji: "☁️", x: 70, y: 5, delay: 1.9, size: 30 },
];

function FloatingPet({ emoji, x, y, delay, size }: any) {
  return (
    <div style={{
      position: "absolute", left: `${x}%`, top: `${y}%`,
      fontSize: size, opacity: 0.35,
      animation: `petFloat 6s ease-in-out ${delay}s infinite`,
      pointerEvents: "none", zIndex: 1,
    }}>
      {emoji}
    </div>
  );
}

function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;
    let particles: any[] = [];

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
  { icon: <Icon name="film-reel" size={20} />, label: "AI Video Engine", desc: "Personalized content that earns" },
  { icon: <Icon name="sparkling" size={20} />, label: "Evolve & Equip", desc: "Skills, skins & marketplace" },
  { icon: <Icon name="chat" size={20} />, label: "Social Circle", desc: "Life sharing & network effects" },
  { icon: <Icon name="trophy" size={20} />, label: "Memorial System", desc: "Eternal on-chain legacy" },
];

export default function Hero({ onAdopt, onExplore, txToday }: any) {
  const [activePillar, setActivePillar] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActivePillar(prev => (prev + 1) % PILLARS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hero-root" style={{
      textAlign: "center", padding: "130px 40px 60px", position: "relative",
      minHeight: 580, overflow: "hidden",
      background: "radial-gradient(ellipse 80% 50% at 50% 20%, rgba(254,243,199,0.5) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 60%, rgba(254,215,170,0.25) 0%, transparent 50%), radial-gradient(ellipse 50% 30% at 20% 70%, rgba(233,213,255,0.2) 0%, transparent 50%)",
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
        @media (max-width: 768px) {
          .hero-root { padding: 100px 16px 40px !important; min-height: auto !important; }
          .hero-pillars { flex-wrap: wrap !important; }
          .hero-pillars button { min-width: 120px !important; flex: 1 1 40% !important; }
          .hero-cta { flex-direction: column !important; gap: 10px !important; }
          .hero-cta button { width: 100% !important; }
          .hero-partners { flex-wrap: wrap !important; justify-content: center !important; }
          .hero-logo-img { width: 110px !important; height: 110px !important; }
        }
        @media (max-width: 480px) {
          .hero-root { padding: 90px 12px 32px !important; }
          .hero-pillars button { min-width: 0 !important; flex: 1 1 45% !important; padding: 8px 10px !important; }
          .hero-logo-img { width: 90px !important; height: 90px !important; }
        }
      `}</style>

      <Particles />

      {/* Ambient glow — warm cozy tones */}
      <div style={{
        position: "absolute", width: 600, height: 600, borderRadius: "50%",
        filter: "blur(140px)", opacity: 0.12, background: "#fbbf24",
        top: -100, left: "25%", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", width: 400, height: 400, borderRadius: "50%",
        filter: "blur(120px)", opacity: 0.08, background: "#f9a8d4",
        top: 200, right: "15%", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", width: 350, height: 350, borderRadius: "50%",
        filter: "blur(100px)", opacity: 0.06, background: "#c4b5fd",
        bottom: 50, left: "10%", pointerEvents: "none",
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
        <img src={LOGO_SRC} alt="mascot" className="hero-logo-img" style={{
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
        <span><Icon name="paw" size={16} /> Raise</span>
        <span style={{ color: "rgba(26,26,46,0.15)" }}>·</span>
        <span>Bond</span>
        <span style={{ color: "rgba(26,26,46,0.15)" }}>·</span>
        <span>Earn</span>
      </div>

      <p style={{
        fontFamily: "mono", fontSize: 20, color: "rgba(26,26,46,0.5)",
        maxWidth: 560, margin: "0 auto 34px", lineHeight: 1.8,
        position: "relative", zIndex: 2,
      }}>
        Raise a one-of-a-kind AI pet that grows, evolves, and generates real economic value.
        Every interaction shapes their personality — every creation lives on-chain.
      </p>

      {/* Ecosystem pillars */}
      <div className="hero-pillars" style={{
        display: "flex", justifyContent: "center", gap: 8, marginBottom: 36,
        position: "relative", zIndex: 2, flexWrap: "wrap",
      }}>
        <style>{`
          .hero-pillar-btn {
            background: rgba(0,0,0,0.02);
            border: 1px solid rgba(0,0,0,0.06);
            border-radius: 12px; padding: 10px 16px; cursor: pointer;
            transition: all 0.3s ease; min-width: 150px;
            opacity: 1; filter: saturate(1);
          }
          .hero-pillars:hover .hero-pillar-btn:not(:hover) {
            opacity: 0.45;
            filter: saturate(0.5);
          }
          .hero-pillar-btn:hover {
            background: rgba(251,191,36,0.08) !important;
            border-color: rgba(251,191,36,0.2) !important;
            transform: translateY(-3px);
            box-shadow: 0 8px 24px rgba(245,158,11,0.12);
            opacity: 1 !important;
            filter: saturate(1) !important;
          }
          .hero-pillar-btn:hover .pillar-label {
            color: #b45309 !important;
          }
          .hero-pillar-btn:hover .pillar-desc {
            color: rgba(26,26,46,0.45) !important;
          }
          .hero-pillar-btn:hover .pillar-icon {
            transform: scale(1.2);
          }
          .hero-pillar-btn.active {
            background: rgba(251,191,36,0.12) !important;
            border-color: rgba(251,191,36,0.25) !important;
            box-shadow: 0 4px 16px rgba(245,158,11,0.1);
          }
        `}</style>
        {PILLARS.map((f, i) => (
          <button key={i} onClick={() => setActivePillar(i)}
            className={`hero-pillar-btn${activePillar === i ? " active" : ""}`}
          >
            <div className="pillar-icon" style={{ fontSize: 18, marginBottom: 4, transition: "transform 0.3s ease" }}>{f.icon}</div>
            <div className="pillar-label" style={{
              fontFamily: "mono", fontSize: 10, fontWeight: 600,
              color: activePillar === i ? "#b45309" : "rgba(26,26,46,0.5)",
              marginBottom: 2, transition: "color 0.3s",
            }}>{f.label}</div>
            <div className="pillar-desc" style={{
              fontFamily: "mono", fontSize: 9,
              color: activePillar === i ? "rgba(26,26,46,0.45)" : "rgba(26,26,46,0.3)",
              transition: "color 0.3s",
            }}>{f.desc}</div>
          </button>
        ))}
      </div>

      {/* CTA */}
      <style>{`
        .hero-cta-primary {
          background: linear-gradient(135deg,#f59e0b,#d97706); border: none;
          border-radius: 12px; padding: 14px 36px;
          font-family: 'Space Grotesk',sans-serif; font-size: 14px; font-weight: 600; color: white; cursor: pointer;
          box-shadow: 0 0 32px rgba(245,158,11,0.3),inset 0 1px 0 rgba(255,255,255,0.15);
          transition: all 0.3s;
        }
        .hero-cta-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 48px rgba(245,158,11,0.45),inset 0 1px 0 rgba(255,255,255,0.15);
          background: linear-gradient(135deg,#d97706,#b45309);
        }
        .hero-cta-secondary {
          background: rgba(0,0,0,0.03);
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 12px; padding: 14px 36px;
          font-family: 'Space Grotesk',sans-serif; font-size: 14px; font-weight: 600;
          color: rgba(26,26,46,0.5); cursor: pointer; transition: all 0.3s;
        }
        .hero-cta-secondary:hover {
          transform: translateY(-2px);
          background: rgba(251,191,36,0.08);
          border-color: rgba(251,191,36,0.2);
          color: #b45309;
          box-shadow: 0 4px 16px rgba(245,158,11,0.1);
        }
      `}</style>
      <div className="hero-cta" style={{ display: "flex", gap: 14, justifyContent: "center", position: "relative", zIndex: 2 }}>
        <button onClick={onAdopt} className="hero-cta-primary">
          <Icon name="paw" size={16} /> Start AI-Pet
        </button>
        <button onClick={onExplore} className="hero-cta-secondary">
          Explore Community
        </button>
      </div>

      {/* ─── Gallery Preview Strip ─── */}
      <div style={{ marginTop: 44, position: "relative", zIndex: 2 }}>
        <style>{`
          @keyframes scrollL { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }
          @keyframes scrollR { 0% { transform: translateX(-50%) } 100% { transform: translateX(0) } }
          .gs-row { display: flex; gap: 10px; overflow: hidden; mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent); }
          .gs-row:hover .gs-track { animation-play-state: paused !important; }
          .gs-track { display: flex; gap: 10px; width: max-content; }
          .gs-card { position: relative; border-radius: 14px; overflow: hidden; flex-shrink: 0; cursor: pointer; transition: transform 0.25s, box-shadow 0.25s; }
          .gs-card:hover { transform: scale(1.04) translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.18); }
          .gs-card:hover .gs-badge { opacity: 1; }
          .gs-badge { position: absolute; bottom: 6px; left: 6px; padding: 2px 7px; border-radius: 6px; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px); font-family: monospace; font-size: 9px; color: #fbbf24; font-weight: 700; letter-spacing: 0.06em; opacity: 0; transition: opacity 0.2s; white-space: nowrap; }
        `}</style>

        <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(26,26,46,0.3)", letterSpacing: "0.12em", textAlign: "center", marginBottom: 16, textTransform: "uppercase" }}>
          Community Creations
        </div>

        {/* Row 1 — tall cards, fast left */}
        <div className="gs-row" style={{ marginBottom: 10 }}>
          <div className="gs-track" style={{ animation: "scrollL 35s linear infinite" }}>
            {[...MOCK_IMAGES.slice(0, 16), ...MOCK_IMAGES.slice(0, 16)].map((img, i) => (
              <div key={i} className="gs-card" style={{ width: 100, height: 130 }}>
                <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <span className="gs-badge">{img.style}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Row 2 — square cards, slow right */}
        <div className="gs-row" style={{ marginBottom: 10 }}>
          <div className="gs-track" style={{ animation: "scrollR 55s linear infinite" }}>
            {[...MOCK_IMAGES.slice(4, 20), ...MOCK_IMAGES.slice(4, 20)].map((img, i) => (
              <div key={i} className="gs-card" style={{ width: 120, height: 120 }}>
                <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <span className="gs-badge">{img.style}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Row 3 — wide-ish, medium left */}
        <div className="gs-row">
          <div className="gs-track" style={{ animation: "scrollL 45s linear infinite" }}>
            {[...MOCK_IMAGES.slice(8), ...MOCK_IMAGES.slice(8)].map((img, i) => (
              <div key={i} className="gs-card" style={{ width: 110, height: 100 }}>
                <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <span className="gs-badge">{img.style}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* spacer */}
      <div style={{ marginTop: 44 }} />

      {/* ─── The Ecosystem Section ─── */}
      <div style={{
        position: "relative", zIndex: 2,
        marginTop: 80, padding: "0 20px",
        maxWidth: 960, marginLeft: "auto", marginRight: "auto",
      }}>
        {/* Season badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 18px", borderRadius: 20,
          background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(217,119,6,0.08))",
          border: "1px solid rgba(245,158,11,0.25)",
          marginBottom: 20,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%", background: "#f59e0b",
            boxShadow: "0 0 10px rgba(245,158,11,0.6)",
            animation: "pulse 2s ease-in-out infinite",
          }} />
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700,
            color: "#b45309", letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            Season 1 Active
          </span>
        </div>

        {/* Section heading */}
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(28px,4vw,42px)",
          fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.02em",
          marginBottom: 10, lineHeight: 1.15,
        }}>
          The Ecosystem
        </h2>
        <p style={{
          fontFamily: "monospace", fontSize: 18, color: "rgba(26,26,46,0.45)",
          maxWidth: 480, margin: "0 auto 40px", lineHeight: 1.7,
        }}>
          One pet. Four dimensions. Infinite possibilities.
        </p>

        {/* Feature cards grid */}
        <style>{`
          .eco-card {
            background: rgba(255,255,255,0.6);
            border: 1px solid rgba(245,158,11,0.1);
            border-radius: 16px;
            padding: 28px 22px;
            text-align: left;
            transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
            backdrop-filter: blur(8px);
            cursor: default;
          }
          .eco-card:hover {
            transform: translateY(-6px);
            border-color: rgba(245,158,11,0.3);
            box-shadow: 0 12px 40px rgba(245,158,11,0.1), 0 4px 16px rgba(0,0,0,0.04);
          }
          .eco-card:hover .eco-icon {
            transform: scale(1.15);
          }
        `}</style>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 16,
        }}>
          {[
            { icon: <Icon name="paw" size={28} />, title: "Raise", desc: "Feed, play, and train your AI pet. Watch them grow from Baby to Legendary." },
            { icon: <Icon name="sparkling" size={28} />, title: "Create", desc: "Generate stunning AI images and videos of your pet in any scene or style." },
            { icon: "💎", title: "Earn", desc: "Climb the leaderboard, farm Airdrop Points, and unlock exclusive rewards." },
            { icon: "🏆", title: "Collect", desc: "Redeem points for real merchandise: mugs, hoodies, figures & more." },
          ].map((card) => (
            <div key={card.title} className="eco-card">
              <div className="eco-icon" style={{
                fontSize: 28, marginBottom: 14,
                transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
              }}>
                {card.icon}
              </div>
              <div style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700,
                color: "#1a1a2e", marginBottom: 8, letterSpacing: "-0.01em",
              }}>
                {card.title}
              </div>
              <div style={{
                fontFamily: "monospace", fontSize: 15, color: "rgba(26,26,46,0.5)",
                lineHeight: 1.65,
              }}>
                {card.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Investment ─── */}
      <div style={{
        position: "relative", zIndex: 2,
        marginTop: 80, padding: "0 20px",
        maxWidth: 960, marginLeft: "auto", marginRight: "auto",
      }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(24px,3.5vw,36px)",
          fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.02em", margin: "0 0 8px",
          textAlign: "center",
        }}>
          Investment
        </h2>

        {/* Lead Investor */}
        <div style={{
          fontFamily: "mono", fontSize: 9, fontWeight: 700, color: "#d97706",
          textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12,
          textAlign: "center", marginTop: 28,
        }}>
          Lead Investor
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12,
          marginBottom: 28, maxWidth: 500, marginLeft: "auto", marginRight: "auto",
        }}>
          {[
            { name: "Amber", logo: "/partners/amber.png" },
            { name: "WAGMI Ventures", logo: "/partners/wagmi.png" },
          ].map(p => (
            <div key={p.name} style={{
              background: "rgba(255,255,255,0.7)", border: "1.5px solid rgba(245,158,11,0.15)",
              borderRadius: 14, padding: "16px 20px",
              display: "flex", alignItems: "center", gap: 12,
              transition: "all 0.3s ease",
            }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(245,158,11,0.35)";
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(245,158,11,0.1)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "rgba(245,158,11,0.15)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <img src={p.logo} alt={p.name} style={{ width: 32, height: 32, borderRadius: 8, objectFit: "contain" }} />
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>
                {p.name}
              </span>
            </div>
          ))}
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10,
          maxWidth: 700, marginLeft: "auto", marginRight: "auto",
        }}>
          {[
            { name: "Animoca Brands", logo: "/partners/animoca.png" },
            { name: "Web3 Labs", logo: "/partners/web3labs.png" },
            { name: "KuCoin Ventures", logo: "/partners/kucoin.png" },
            { name: "ViaBTC", logo: "/partners/viabtc.png" },
            { name: "Arkstream Capital", logo: "/partners/arkstream.png" },
            { name: "ICC Ventures", logo: "/partners/icc.png" },
            { name: "WaterDrip", logo: "/partners/waterdrip.png" },
            { name: "CryptoSen", logo: "/partners/cryptosen.svg" },
          ].map(p => (
            <div key={p.name} style={{
              background: "rgba(255,255,255,0.6)", border: "1px solid rgba(0,0,0,0.05)",
              borderRadius: 12, padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 10,
              transition: "all 0.3s ease",
            }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(255,255,255,0.9)";
                e.currentTarget.style.borderColor = "rgba(251,191,36,0.2)";
                e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(255,255,255,0.6)";
                e.currentTarget.style.borderColor = "rgba(0,0,0,0.05)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <img src={p.logo} alt={p.name} style={{ width: 24, height: 24, borderRadius: 6, objectFit: "contain" }} />
              <span style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600,
                color: "rgba(26,26,46,0.5)",
              }}>
                {p.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Footer CTA ─── */}
      <div style={{
        position: "relative", zIndex: 2,
        marginTop: 80, padding: "0 20px",
        maxWidth: 700, marginLeft: "auto", marginRight: "auto",
      }}>
        <div style={{
          background: "linear-gradient(135deg, rgba(254,243,199,0.6), rgba(254,215,170,0.4))",
          border: "1px solid rgba(245,158,11,0.15)",
          borderRadius: 24, padding: "48px 40px", textAlign: "center",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 16px", borderRadius: 20,
            background: "rgba(255,255,255,0.7)", border: "1px solid rgba(245,158,11,0.15)",
            marginBottom: 20,
          }}>
            <Icon name="chat" size={16} />
            <span style={{ fontFamily: "mono", fontSize: 11, color: "#b45309", fontWeight: 600 }}>
              Join us now
            </span>
          </div>
          <h3 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(18px,3vw,24px)",
            fontWeight: 700, color: "#1a1a2e", lineHeight: 1.4,
            margin: "0 auto 24px", maxWidth: 480,
          }}>
            Seeking launch capital as we are ready to push My AI PET to the next frontier.
          </h3>
          <a
            href="https://x.com/MYAIPETS"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 28px", borderRadius: 14,
              background: "#1a1a2e", color: "white",
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600,
              textDecoration: "none", transition: "all 0.3s ease",
              boxShadow: "0 4px 16px rgba(26,26,46,0.2)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(26,26,46,0.3)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 16px rgba(26,26,46,0.2)";
            }}
          >
            𝕏 @MYAIPETS
          </a>
        </div>
      </div>
    </div>
  );
}

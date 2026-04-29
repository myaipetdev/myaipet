"use client";

import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  petName: string;
  petAvatarUrl?: string | null;
  fromStage: { icon: string; name: string };
  toStage: { icon: string; name: string };
  skillsUnlocked?: string[];
  creditsEarned?: number;
}

/**
 * Gacha-style evolution animation modal.
 * Sequence: black flash → spinning aura → orb crack → reveal new stage → stats.
 */
export default function EvolutionAnimation({
  open,
  onClose,
  petName,
  petAvatarUrl,
  fromStage,
  toStage,
  skillsUnlocked = [],
  creditsEarned = 0,
}: Props) {
  const [phase, setPhase] = useState<"charge" | "burst" | "reveal" | "details">("charge");

  useEffect(() => {
    if (!open) return;
    setPhase("charge");
    const t1 = setTimeout(() => setPhase("burst"), 1400);
    const t2 = setTimeout(() => setPhase("reveal"), 2400);
    const t3 = setTimeout(() => setPhase("details"), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: phase === "charge" ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.95)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "evoFadeIn 0.3s ease",
        overflow: "hidden",
      }}
      onClick={() => phase === "details" && onClose()}
    >
      {/* Light rays burst (during burst + reveal) */}
      {(phase === "burst" || phase === "reveal" || phase === "details") && (
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: `repeating-conic-gradient(
              from 0deg at 50% 50%,
              rgba(251,191,36,0.18) 0deg 8deg,
              transparent 8deg 24deg
            )`,
            animation: "evoRays 6s linear infinite",
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* Confetti specks */}
      {phase === "details" && (
        <>
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = (i / 36) * 360;
            const distance = 300 + Math.random() * 220;
            const colors = ["#f59e0b", "#fbbf24", "#c084fc", "#60a5fa", "#4ade80", "#f472b6"];
            return (
              <div
                key={i}
                style={{
                  position: "absolute", left: "50%", top: "50%",
                  width: 8, height: 14, borderRadius: 2,
                  background: colors[i % colors.length],
                  transform: `rotate(${angle}deg) translateY(-${distance}px)`,
                  animation: `evoConfetti 1.4s ${i * 0.02}s ease-out forwards`,
                  opacity: 0,
                }}
              />
            );
          })}
        </>
      )}

      <div style={{ position: "relative", textAlign: "center", padding: 24 }}>
        {/* Phase: charge — pet glows + spins */}
        {phase === "charge" && (
          <>
            <div style={{
              fontSize: 11, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
              color: "rgba(251,191,36,0.9)", letterSpacing: "0.3em", marginBottom: 28,
              textTransform: "uppercase",
              animation: "evoTextPulse 1.5s ease infinite",
            }}>
              Evolution Beginning...
            </div>
            <div style={{
              position: "relative", width: 200, height: 200, margin: "0 auto",
            }}>
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(251,191,36,0.4), transparent 70%)",
                animation: "evoGlow 1.5s ease infinite",
              }} />
              <div style={{
                position: "absolute", inset: -10, borderRadius: "50%",
                border: "3px solid rgba(251,191,36,0.6)",
                borderTopColor: "transparent",
                animation: "evoSpinFast 0.8s linear infinite",
              }} />
              <div style={{
                position: "absolute", inset: -30, borderRadius: "50%",
                border: "2px solid rgba(192,132,252,0.4)",
                borderRightColor: "transparent",
                animation: "evoSpinSlow 1.6s linear infinite reverse",
              }} />
              <div style={{
                position: "absolute", inset: 20, borderRadius: "50%",
                overflow: "hidden",
                background: "rgba(20,20,40,0.6)",
                border: "3px solid #f59e0b",
                boxShadow: "0 0 60px rgba(251,191,36,0.6), inset 0 0 30px rgba(251,191,36,0.3)",
                animation: "evoShake 0.15s ease infinite",
              }}>
                {petAvatarUrl ? (
                  <img src={petAvatarUrl} alt={petName} style={{
                    width: "100%", height: "100%", objectFit: "cover",
                    filter: "brightness(1.1) saturate(1.3)",
                  }} />
                ) : (
                  <div style={{
                    width: "100%", height: "100%", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 60,
                  }}>{fromStage.icon}</div>
                )}
              </div>
            </div>
            <div style={{
              marginTop: 28, fontSize: 13, fontFamily: "'Space Grotesk',sans-serif",
              color: "rgba(255,255,255,0.6)", fontWeight: 500,
            }}>
              {petName} is changing...
            </div>
          </>
        )}

        {/* Phase: burst — flash */}
        {phase === "burst" && (
          <div style={{
            width: 220, height: 220, borderRadius: "50%",
            background: "radial-gradient(circle, #fff, #fbbf24, #f59e0b, transparent)",
            animation: "evoBurst 1s ease-out forwards",
            boxShadow: "0 0 200px rgba(255,255,255,0.9)",
          }} />
        )}

        {/* Phase: reveal + details */}
        {(phase === "reveal" || phase === "details") && (
          <div style={{ animation: phase === "reveal" ? "evoZoomIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }}>
            <div style={{
              position: "relative", width: 220, height: 220, margin: "0 auto",
            }}>
              <div style={{
                position: "absolute", inset: -60, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(251,191,36,0.45), transparent 65%)",
                animation: "evoBreath 2s ease infinite",
              }} />
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                overflow: "hidden",
                background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                border: "5px solid #fff",
                boxShadow: "0 0 100px rgba(251,191,36,0.7), 0 20px 60px rgba(0,0,0,0.5)",
              }}>
                {petAvatarUrl ? (
                  <img src={petAvatarUrl} alt={petName} style={{
                    width: "100%", height: "100%", objectFit: "cover",
                    filter: "brightness(1.05) saturate(1.2)",
                  }} />
                ) : (
                  <div style={{
                    width: "100%", height: "100%", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 80,
                  }}>{toStage.icon}</div>
                )}
              </div>
              {/* Stage badge */}
              <div style={{
                position: "absolute", bottom: -12, left: "50%",
                transform: "translateX(-50%)",
                background: "linear-gradient(135deg, #1a1a2e, #0a0a14)",
                color: "#fbbf24",
                padding: "6px 18px", borderRadius: 999,
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 800,
                letterSpacing: "0.1em", textTransform: "uppercase",
                border: "2px solid #fbbf24",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                whiteSpace: "nowrap",
              }}>
                {toStage.icon} {toStage.name}
              </div>
            </div>

            <div style={{
              marginTop: 36,
              fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
              color: "#fbbf24", letterSpacing: "0.25em", textTransform: "uppercase",
              opacity: phase === "details" ? 1 : 0,
              transition: "opacity 0.4s",
            }}>
              ✦ Evolution Complete ✦
            </div>
            <div style={{
              fontSize: 38, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800,
              color: "#fff", letterSpacing: "-0.02em", marginTop: 6,
              opacity: phase === "details" ? 1 : 0,
              transition: "opacity 0.4s 0.1s",
            }}>
              {petName}
            </div>
            <div style={{
              fontSize: 16, fontFamily: "'Space Grotesk',sans-serif",
              color: "rgba(255,255,255,0.6)", marginTop: 4,
              opacity: phase === "details" ? 1 : 0,
              transition: "opacity 0.4s 0.2s",
            }}>
              {fromStage.icon} {fromStage.name} → <span style={{ color: "#fbbf24", fontWeight: 700 }}>{toStage.icon} {toStage.name}</span>
            </div>

            {phase === "details" && (
              <>
                {(skillsUnlocked.length > 0 || creditsEarned > 0) && (
                  <div style={{
                    marginTop: 24, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap",
                    opacity: 0, animation: "evoFadeUp 0.5s 0.3s forwards",
                  }}>
                    {skillsUnlocked.length > 0 && (
                      <div style={{
                        padding: "10px 16px", borderRadius: 12,
                        background: "rgba(192,132,252,0.18)",
                        border: "1px solid rgba(192,132,252,0.4)",
                        color: "#c084fc",
                        fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
                      }}>
                        ✨ New Skills: {skillsUnlocked.join(", ")}
                      </div>
                    )}
                    {creditsEarned > 0 && (
                      <div style={{
                        padding: "10px 16px", borderRadius: 12,
                        background: "rgba(74,222,128,0.18)",
                        border: "1px solid rgba(74,222,128,0.4)",
                        color: "#4ade80",
                        fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
                      }}>
                        +{creditsEarned} $PET earned
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={onClose}
                  style={{
                    marginTop: 32,
                    padding: "12px 36px", borderRadius: 999,
                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                    border: "none", color: "white",
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 800,
                    letterSpacing: "0.05em", cursor: "pointer",
                    boxShadow: "0 8px 24px rgba(245,158,11,0.4)",
                    opacity: 0, animation: "evoFadeUp 0.5s 0.5s forwards",
                  }}
                >
                  Continue →
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes evoFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes evoTextPulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
        @keyframes evoGlow {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes evoSpinFast { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes evoSpinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes evoShake {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(-2px, 1px); }
          50% { transform: translate(2px, -1px); }
          75% { transform: translate(-1px, 2px); }
        }
        @keyframes evoBurst {
          0% { transform: scale(0.3); opacity: 1; }
          50% { opacity: 1; }
          100% { transform: scale(3); opacity: 0; }
        }
        @keyframes evoZoomIn {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes evoBreath {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes evoRays { to { transform: rotate(360deg); } }
        @keyframes evoConfetti {
          0% { opacity: 0; transform: rotate(var(--a)) translateY(0); }
          10% { opacity: 1; }
          100% { opacity: 0; transform: rotate(var(--a)) translateY(-340px); }
        }
        @keyframes evoFadeUp {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

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
        background: phase === "charge" ? "rgba(30,23,16,0.90)" : "rgba(30,23,16,0.96)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "evoFadeIn 0.3s ease",
        overflow: "hidden",
      }}
      onClick={() => phase === "details" && onClose()}
    >
      <div style={{ position: "relative", textAlign: "center", padding: 24 }}>
        {/* Phase: charge — pet glows + spins */}
        {phase === "charge" && (
          <>
            <div style={{
              fontSize: 13, fontFamily: "var(--ed-m)", fontWeight: 700,
              color: "#F49B2A", letterSpacing: "0.14em", marginBottom: 28,
              textTransform: "uppercase",
              animation: "evoTextPulse 1.5s ease infinite",
            }}>
              Evolution Beginning...
            </div>
            <div style={{
              position: "relative", width: 200, height: 200, margin: "0 auto",
            }}>
              <div style={{
                position: "absolute", inset: -10, borderRadius: "50%",
                border: "3px solid rgba(190,79,40,0.55)",
                borderTopColor: "transparent",
                animation: "evoSpinFast 0.8s linear infinite",
              }} />
              <div style={{
                position: "absolute", inset: -30, borderRadius: "50%",
                border: "2px solid rgba(158,114,232,0.38)",
                borderRightColor: "transparent",
                animation: "evoSpinSlow 1.6s linear infinite reverse",
              }} />
              <div style={{
                position: "absolute", inset: 20, borderRadius: "50%",
                overflow: "hidden",
                background: "#211A12",
                border: "3px solid #BE4F28",
                boxShadow: "0 20px 40px -26px rgba(80,55,20,.5)",
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
              marginTop: 28, fontSize: 13, fontFamily: "var(--ed-body)",
              color: "rgba(255,248,238,0.62)", fontWeight: 500,
            }}>
              {petName} is changing...
            </div>
          </>
        )}

        {/* Phase: burst — flash */}
        {phase === "burst" && (
          <div style={{
            width: 220, height: 220, borderRadius: "50%",
            background: "radial-gradient(circle, #FFF8EE, #F49B2A, #BE4F28, transparent)",
            animation: "evoBurst 1s ease-out forwards",
          }} />
        )}

        {/* Phase: reveal + details */}
        {(phase === "reveal" || phase === "details") && (
          <div style={{ animation: phase === "reveal" ? "evoZoomIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }}>
            <div style={{
              position: "relative", width: 220, height: 220, margin: "0 auto",
            }}>
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                overflow: "hidden",
                background: "linear-gradient(180deg, #F49B2A, #E27D0C)",
                border: "5px solid #FBF6EC",
                boxShadow: "0 20px 40px -26px rgba(80,55,20,.5)",
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
                background: "#211A12",
                color: "#F49B2A",
                padding: "6px 18px", borderRadius: 999,
                fontFamily: "var(--ed-disp)", fontSize: 13, fontWeight: 800,
                letterSpacing: "0.1em", textTransform: "uppercase",
                border: "1px solid rgba(244,155,42,0.5)",
                boxShadow: "0 20px 40px -26px rgba(80,55,20,.5)",
                whiteSpace: "nowrap",
              }}>
                {toStage.icon} {toStage.name}
              </div>
            </div>

            <div style={{
              marginTop: 36,
              fontSize: 13, fontFamily: "var(--ed-m)", fontWeight: 700,
              color: "#F49B2A", letterSpacing: "0.14em", textTransform: "uppercase",
              opacity: phase === "details" ? 1 : 0,
              transition: "opacity 0.4s",
            }}>
              ✦ Evolution Complete ✦
            </div>
            <div style={{
              fontSize: 38, fontFamily: "var(--ed-disp)", fontWeight: 800,
              color: "#FFF8EE", letterSpacing: "-0.02em", marginTop: 6,
              opacity: phase === "details" ? 1 : 0,
              transition: "opacity 0.4s 0.1s",
            }}>
              {petName}
            </div>
            <div style={{
              fontSize: 16, fontFamily: "var(--ed-body)",
              color: "rgba(255,248,238,0.62)", marginTop: 4,
              opacity: phase === "details" ? 1 : 0,
              transition: "opacity 0.4s 0.2s",
            }}>
              {fromStage.icon} {fromStage.name} → <span style={{ color: "#F49B2A", fontWeight: 700 }}>{toStage.icon} {toStage.name}</span>
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
                        background: "rgba(158,114,232,0.16)",
                        border: "1px solid rgba(158,114,232,0.42)",
                        color: "#9E72E8",
                        fontFamily: "var(--ed-disp)", fontSize: 13, fontWeight: 700,
                        display: "inline-flex", alignItems: "center", gap: 6,
                      }}>
                        <Icon name="sparkling" size={16} /> New Skills: {skillsUnlocked.join(", ")}
                      </div>
                    )}
                    {creditsEarned > 0 && (
                      <div style={{
                        padding: "10px 16px", borderRadius: 12,
                        background: "rgba(92,138,78,0.16)",
                        border: "1px solid rgba(92,138,78,0.42)",
                        color: "#5C8A4E",
                        fontFamily: "var(--ed-disp)", fontSize: 13, fontWeight: 700,
                      }}>
                        +{creditsEarned} credits earned
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={onClose}
                  style={{
                    marginTop: 32,
                    padding: "12px 36px", borderRadius: 999,
                    background: "linear-gradient(180deg, #F49B2A, #E27D0C)",
                    border: "none", color: "#FFF8EE",
                    fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 800,
                    letterSpacing: "0.05em", cursor: "pointer",
                    boxShadow: "0 20px 40px -26px rgba(80,55,20,.5)",
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
        @keyframes evoFadeUp {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

const EVOLUTION_STAGES: Record<string, { name: string; color: string }> = {
  baby:      { name: "Baby",      color: "#a3e635" },
  young:     { name: "Young",     color: "#34d399" },
  adult:     { name: "Adult",     color: "#818cf8" },
  elder:     { name: "Elder",     color: "#c084fc" },
  legendary: { name: "Legendary", color: "#f59e0b" },
};

function getEvolutionFromLevel(level: number): { name: string; color: string } {
  if (level >= 35) return EVOLUTION_STAGES.legendary;
  if (level >= 20) return EVOLUTION_STAGES.elder;
  if (level >= 10) return EVOLUTION_STAGES.adult;
  if (level >= 5)  return EVOLUTION_STAGES.young;
  return EVOLUTION_STAGES.baby;
}

function truncateWallet(wallet: string): string {
  if (!wallet || wallet.length < 10) return wallet || "";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function getRankStyle(rank: number): { bg: string; border: string; color: string; icon: string } {
  if (rank === 1) return { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", color: "#d97706", icon: "\uD83E\uDD47" };
  if (rank === 2) return { bg: "rgba(156,163,175,0.08)", border: "rgba(156,163,175,0.2)", color: "#9ca3af", icon: "\uD83E\uDD48" };
  if (rank === 3) return { bg: "rgba(205,127,50,0.08)", border: "rgba(205,127,50,0.2)", color: "#cd7f32", icon: "\uD83E\uDD49" };
  return { bg: "transparent", border: "rgba(0,0,0,0.06)", color: "rgba(26,26,46,0.35)", icon: "" };
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const data = await api.leaderboard.get();
        if (!cancelled) {
          setEntries(data.leaderboard || []);
          setMyRank(data.myRank || null);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load leaderboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const topThree = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div style={{ padding: "0 16px 60px", maxWidth: 900, margin: "0 auto", paddingTop: 80 }}>
      <style>{`
        @keyframes leaderFadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes crownBounce { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-3px) } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @media (max-width: 768px) {
          .lb-table-row { grid-template-columns: 40px 1fr 80px !important; }
          .lb-table-header { grid-template-columns: 40px 1fr 80px !important; }
          .lb-hide-mobile { display: none !important; }
          .lb-podium {
            flex-direction: column !important;
            align-items: center !important;
          }
          .lb-podium > div {
            max-width: 100% !important;
            width: 100% !important;
            margin-bottom: 0 !important;
            transform: scale(1) !important;
          }
          .lb-podium > div:nth-child(1) { order: 2; }
          .lb-podium > div:nth-child(2) { order: 1; }
          .lb-podium > div:nth-child(3) { order: 3; }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 26 }}>{"\uD83C\uDFC6"}</span>
          <h1 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700,
            color: "#1a1a2e", margin: 0, letterSpacing: "-0.03em",
          }}>
            Leaderboard
          </h1>
        </div>
        <p style={{
          fontFamily: "mono", fontSize: 12, color: "rgba(26,26,46,0.45)",
          margin: 0, marginLeft: 38,
        }}>
          Top pets by Airdrop Points
        </p>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: "flex", gap: 1, background: "rgba(255,255,255,0.7)",
        borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)", marginBottom: 28,
      }}>
        {[
          { label: "Total Participants", value: loading ? "..." : entries.length.toLocaleString() },
          { label: "Season", value: "Season 1" },
          { label: "Reward Pool", value: "100,000 $PET" },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1, padding: "16px 20px", background: "rgba(255,255,255,0.5)",
            borderRight: i < 2 ? "1px solid rgba(0,0,0,0.06)" : "none",
          }}>
            <div style={{
              fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.45)",
              textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4,
            }}>
              {s.label}
            </div>
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700,
              color: "#1a1a2e", letterSpacing: "-0.02em",
            }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* My Rank */}
      {myRank && !loading && (
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "14px 20px", borderRadius: 14, marginBottom: 20,
          background: "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(251,191,36,0.04))",
          border: "1.5px solid rgba(245,158,11,0.2)",
          boxShadow: "0 2px 12px rgba(245,158,11,0.08)",
        }}>
          <div style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
            color: "#d97706", minWidth: 50, textAlign: "center",
          }}>
            #{myRank.rank}
          </div>
          <div style={{
            width: 42, height: 42, borderRadius: 12, overflow: "hidden",
            border: "2px solid rgba(245,158,11,0.2)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(251,191,36,0.06)",
          }}>
            {myRank.pet?.avatar_url ? (
              <img src={myRank.pet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 20 }}>{"\uD83D\uDC3E"}</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>
              {myRank.pet?.name || "My Pet"} <span style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.4)" }}>YOU</span>
            </div>
            <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.4)" }}>
              Lv.{myRank.pet?.level || 1} · {myRank.wallet}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.4)", textTransform: "uppercase" }}>{"\u2B50"} Points</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: "#d97706" }}>
              {(myRank.points || 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Season Reward Tiers — Special Goods */}
      {!loading && !error && entries.length > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
          border: "1.5px solid rgba(245,158,11,0.2)",
          borderRadius: 20,
          padding: "24px 24px 20px",
          marginBottom: 24,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
          }}>
            <span style={{ fontSize: 22 }}>{"\uD83C\uDF81"}</span>
            <div>
              <div style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700,
                color: "#78350f", letterSpacing: "-0.01em",
              }}>
                Exclusive Merch Rewards
              </div>
              <div style={{ fontFamily: "mono", fontSize: 10, color: "#92400e", marginTop: 2 }}>
                Top rankers receive custom merch with your AI pet printed on real products!
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {[
              {
                tier: "\uD83C\uDFC6 #1 Champion",
                reward: "10,000 $PET",
                goods: "Hoodie + 3D Figure + Full Set",
                color: "#f59e0b",
                items: ["\uD83E\uDDE5", "\uD83D\uDDFF", "\u2615", "\uD83D\uDCF1", "\uD83D\uDCD4"],
              },
              {
                tier: "\uD83E\uDD47 Top 3",
                reward: "5,000 $PET",
                goods: "3D Figure + Mug + Phone Case",
                color: "#d97706",
                items: ["\uD83D\uDDFF", "\u2615", "\uD83D\uDCF1", "\uD83D\uDCD4"],
              },
              {
                tier: "\uD83E\uDD48 Top 10",
                reward: "2,000 $PET",
                goods: "Mug + Notebook + Tote Bag",
                color: "#9ca3af",
                items: ["\u2615", "\uD83D\uDCD4", "\uD83D\uDC5C"],
              },
              {
                tier: "\uD83E\uDD49 Top 10%",
                reward: "500 $PET",
                goods: "Sticker Pack + Hair Clip",
                color: "#cd7f32",
                items: ["\uD83C\uDFF7\uFE0F", "\u2728"],
              },
            ].map(t => (
              <div key={t.tier} style={{
                flex: "0 0 auto", minWidth: 180, maxWidth: 220,
                padding: "16px 18px", borderRadius: 16,
                background: "rgba(255,255,255,0.8)",
                border: `1.5px solid ${t.color}30`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}>
                <div style={{
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
                  color: t.color, marginBottom: 6,
                }}>
                  {t.tier}
                </div>
                <div style={{
                  fontFamily: "'Space Mono',monospace", fontSize: 16, fontWeight: 700,
                  color: "#78350f", marginBottom: 4,
                }}>
                  {t.reward}
                </div>
                <div style={{
                  fontFamily: "mono", fontSize: 10, color: "#92400e",
                  marginBottom: 10, lineHeight: 1.4,
                }}>
                  {t.goods}
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {t.items.map((emoji, i) => (
                    <span key={i} style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: `${t.color}10`, border: `1px solid ${t.color}20`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14,
                    }}>
                      {emoji}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 14, padding: "10px 16px", borderRadius: 12,
            background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.1)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>{"\uD83D\uDC3E"}</span>
            <span style={{
              fontFamily: "mono", fontSize: 10, color: "#92400e", lineHeight: 1.5,
            }}>
              All merch is custom-made with your AI pet&apos;s artwork printed directly on the product.
              Notebook covers, phone cases, mugs — your pet becomes real merchandise!
            </span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{
          textAlign: "center", padding: "60px 0",
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, color: "rgba(26,26,46,0.4)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{"\uD83D\uDD04"}</div>
          Loading rankings...
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div style={{
          textAlign: "center", padding: "40px 0",
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: "#f87171",
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{"\u26A0\uFE0F"}</div>
          {error}
        </div>
      )}

      {/* Top 3 Podium — order: 2nd, 1st, 3rd */}
      {!loading && !error && topThree.length > 0 && (() => {
        const podiumOrder = topThree.length >= 3
          ? [topThree[1], topThree[0], topThree[2]]
          : topThree;
        const podiumHeights = [0, 24, 0]; // 1st is elevated

        return (
          <div className="lb-podium" style={{
            display: "flex", gap: 14, marginBottom: 20,
            alignItems: "flex-end", justifyContent: "center",
          }}>
            {podiumOrder.map((entry: any, idx: number) => {
              const rank = entry.rank;
              const isFirst = rank === 1;
              const rs = getRankStyle(rank);
              const evo = entry.pet?.evolution
                ? (EVOLUTION_STAGES[entry.pet.evolution] || getEvolutionFromLevel(entry.pet?.level || 1))
                : getEvolutionFromLevel(entry.pet?.level || 1);
              const elevation = isFirst ? podiumHeights[1] : 0;
              const avatarSize = isFirst ? 76 : 60;

              return (
                <div key={rank} style={{
                  flex: 1, maxWidth: isFirst ? 260 : 220,
                  marginBottom: elevation,
                  background: "rgba(255,255,255,0.9)",
                  borderRadius: 18,
                  border: `1.5px solid ${rs.border}`,
                  padding: "28px 18px 20px",
                  textAlign: "center",
                  position: "relative",
                  boxShadow: isFirst
                    ? "0 8px 30px rgba(245,158,11,0.15)"
                    : "0 2px 12px rgba(0,0,0,0.06)",
                  animation: `leaderFadeUp 0.4s ease-out ${rank * 0.1}s both`,
                  transform: isFirst ? "scale(1.04)" : "scale(1)",
                }}>
                  {/* Crown / Medal */}
                  <div style={{
                    position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)",
                    fontSize: isFirst ? 28 : 22,
                    animation: isFirst ? "crownBounce 2s ease infinite" : "none",
                  }}>
                    {isFirst ? "\uD83D\uDC51" : rs.icon}
                  </div>

                  {/* Rank */}
                  <div style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700,
                    color: rs.color, marginBottom: 10,
                  }}>
                    #{rank}
                  </div>

                  {/* Avatar */}
                  <div style={{
                    width: avatarSize, height: avatarSize,
                    borderRadius: isFirst ? 22 : 16, margin: "0 auto 10px",
                    border: `2.5px solid ${rs.border}`,
                    overflow: "hidden", background: "rgba(251,191,36,0.06)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {entry.pet?.avatar_url ? (
                      <img src={entry.pet.avatar_url} alt={entry.pet?.name || "Pet"}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: isFirst ? 34 : 26 }}>{"\uD83D\uDC3E"}</span>
                    )}
                  </div>

                  {/* Name */}
                  <div style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: isFirst ? 16 : 14, fontWeight: 600,
                    color: "#1a1a2e", marginBottom: 6,
                  }}>
                    {entry.pet?.name || "Unknown"}
                  </div>

                  {/* Level + Evolution */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 8 }}>
                    <span style={{
                      fontFamily: "mono", fontSize: 9, padding: "2px 8px", borderRadius: 6,
                      background: "rgba(245,158,11,0.08)", color: "#b45309",
                      border: "1px solid rgba(245,158,11,0.15)", fontWeight: 600,
                    }}>
                      Lv.{entry.pet?.level || 1}
                    </span>
                    <span style={{
                      fontFamily: "mono", fontSize: 9, padding: "2px 8px", borderRadius: 6,
                      background: `${evo.color}15`, color: evo.color,
                      border: `1px solid ${evo.color}30`, fontWeight: 600,
                    }}>
                      {evo.name}
                    </span>
                  </div>

                  {/* Wallet */}
                  <div style={{
                    fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.3)", marginBottom: 10,
                  }}>
                    {truncateWallet(entry.wallet)}
                  </div>

                  {/* Points */}
                  <div style={{
                    background: isFirst ? "rgba(245,158,11,0.08)" : "rgba(0,0,0,0.02)",
                    borderRadius: 10, padding: "10px 14px",
                    border: isFirst ? "1px solid rgba(245,158,11,0.15)" : "1px solid rgba(0,0,0,0.06)",
                  }}>
                    <div style={{
                      fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.4)",
                      textTransform: "uppercase", marginBottom: 3,
                    }}>
                      {"\u2B50"} Airdrop Points
                    </div>
                    <div style={{
                      fontFamily: "'Space Grotesk',sans-serif", fontSize: isFirst ? 22 : 18, fontWeight: 700,
                      color: "#d97706",
                    }}>
                      {(entry.points || 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Remaining Rankings */}
      {!loading && !error && rest.length > 0 && (
        <div style={{
          background: "rgba(255,255,255,0.8)", borderRadius: 16,
          border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          {/* Table Header */}
          <div className="lb-table-header" style={{
            display: "grid", gridTemplateColumns: "50px 1fr 140px 120px 100px",
            padding: "12px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)",
            background: "rgba(0,0,0,0.015)",
          }}>
            {["Rank", "Pet", "Wallet", "Evolution", "Points"].map((h) => (
              <div key={h} className={h === "Wallet" || h === "Evolution" ? "lb-hide-mobile" : undefined} style={{
                fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)",
                textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
              }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {rest.map((entry: any, i: number) => {
            const evo = entry.pet?.evolution
              ? (EVOLUTION_STAGES[entry.pet.evolution] || getEvolutionFromLevel(entry.pet?.level || 1))
              : getEvolutionFromLevel(entry.pet?.level || 1);

            return (
              <div key={entry.rank} className="lb-table-row" style={{
                display: "grid", gridTemplateColumns: "50px 1fr 140px 120px 100px",
                padding: "12px 18px", alignItems: "center",
                borderBottom: i < rest.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
                background: entry.isMe ? "rgba(245,158,11,0.06)" : i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.01)",
                animation: `leaderFadeUp 0.3s ease-out ${(i + 3) * 0.04}s both`,
                transition: "background 0.2s",
              }}>
                {/* Rank */}
                <div style={{
                  fontFamily: "mono", fontSize: 13, fontWeight: 700,
                  color: "rgba(26,26,46,0.3)",
                }}>
                  {entry.rank}
                </div>

                {/* Pet Info */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    border: "1.5px solid rgba(0,0,0,0.06)", overflow: "hidden",
                    background: "rgba(251,191,36,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {entry.pet?.avatar_url ? (
                      <img
                        src={entry.pet.avatar_url}
                        alt={entry.pet?.name || "Pet"}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ fontSize: 18 }}>{"\uD83D\uDC3E"}</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600,
                      color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {entry.pet?.name || "Unknown"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <span style={{
                        fontFamily: "mono", fontSize: 9, padding: "1px 6px", borderRadius: 4,
                        background: "rgba(245,158,11,0.08)", color: "#b45309", fontWeight: 600,
                      }}>
                        Lv.{entry.pet?.level || 1}
                      </span>
                      {entry.pet?.personality && (
                        <span style={{
                          fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)",
                        }}>
                          {entry.pet.personality}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Wallet */}
                <div className="lb-hide-mobile" style={{
                  fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.4)",
                }}>
                  {truncateWallet(entry.wallet)}
                </div>

                {/* Evolution */}
                <div className="lb-hide-mobile">
                  <span style={{
                    fontFamily: "mono", fontSize: 10, padding: "3px 8px", borderRadius: 6,
                    background: `${evo.color}12`, color: evo.color,
                    border: `1px solid ${evo.color}25`, fontWeight: 600,
                  }}>
                    {evo.name}
                  </span>
                </div>

                {/* Points */}
                <div style={{
                  fontFamily: "mono", fontSize: 13, fontWeight: 700,
                  color: "#d97706", textAlign: "right",
                }}>
                  {"\u2B50"} {(entry.points || 0).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && entries.length === 0 && (
        <div style={{
          textAlign: "center", padding: "60px 0",
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, color: "rgba(26,26,46,0.4)",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{"\uD83C\uDFC6"}</div>
          No rankings yet. Be the first to earn Airdrop Points!
        </div>
      )}

      {/* Evolution Legend */}
      {!loading && !error && entries.length > 0 && (
        <div style={{
          marginTop: 24, padding: "16px 20px", borderRadius: 14,
          background: "rgba(255,255,255,0.6)", border: "1px solid rgba(0,0,0,0.06)",
        }}>
          <div style={{
            fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
          }}>
            Evolution Stages
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { name: "Baby", level: "Lv.1+", color: "#a3e635" },
              { name: "Young", level: "Lv.5+", color: "#34d399" },
              { name: "Adult", level: "Lv.10+", color: "#818cf8" },
              { name: "Elder", level: "Lv.20+", color: "#c084fc" },
              { name: "Legendary", level: "Lv.35+", color: "#f59e0b" },
            ].map((s) => (
              <div key={s.name} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 8,
                background: `${s.color}10`, border: `1px solid ${s.color}20`,
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", background: s.color,
                }} />
                <span style={{ fontFamily: "mono", fontSize: 10, color: s.color, fontWeight: 600 }}>
                  {s.name}
                </span>
                <span style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.3)" }}>
                  {s.level}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

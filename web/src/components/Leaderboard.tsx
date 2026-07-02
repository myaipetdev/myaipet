"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { SEASON_TIERS } from "@/lib/season";

const EVOLUTION_STAGES: Record<string, { name: string; color: string }> = {
  baby:      { name: "Baby",      color: "#a3e635" },
  young:     { name: "Young",     color: "#34d399" },
  adult:     { name: "Adult",     color: "#818cf8" },
  elder:     { name: "Elder",     color: "#c084fc" },
  legendary: { name: "Legendary", color: "#C8932F" },
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
  if (rank === 1) return { bg: "rgba(190,79,40,0.06)", border: "rgba(190,79,40,0.22)", color: "#BE4F28", icon: "\uD83E\uDD47" };
  if (rank === 2) return { bg: "rgba(122,110,90,0.06)", border: "rgba(122,110,90,0.22)", color: "#7A6E5A", icon: "\uD83E\uDD48" };
  if (rank === 3) return { bg: "rgba(154,78,30,0.06)", border: "rgba(154,78,30,0.22)", color: "#9A4E1E", icon: "\uD83E\uDD49" };
  return { bg: "transparent", border: "var(--ed-hair, rgba(33,26,18,.13))", color: "rgba(33,26,18,0.35)", icon: "" };
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
            fontFamily: "var(--ed-disp)", fontSize: 28, fontWeight: 700,
            color: "#211A12", margin: 0, letterSpacing: "-0.03em",
          }}>
            Leaderboard
          </h1>
        </div>
        <p style={{
          fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E",
          margin: 0, marginLeft: 38, textTransform: "uppercase", letterSpacing: ".12em",
        }}>
          Top pets by Season Rewards
        </p>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: "flex", gap: 1, background: "#FBF6EC",
        borderRadius: 14, overflow: "hidden", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))", marginBottom: 28,
      }}>
        {[
          { label: "Total Participants", value: loading ? "..." : entries.length.toLocaleString() },
          { label: "Season", value: "Season 1" },
          { label: "Tiers", value: `${SEASON_TIERS.length} ranks` },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1, padding: "16px 20px", background: "#F5EFE2",
            borderRight: i < 2 ? "1px solid var(--ed-hair, rgba(33,26,18,.13))" : "none",
          }}>
            <div style={{
              fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A",
              textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4,
            }}>
              {s.label}
            </div>
            <div style={{
              fontFamily: "var(--ed-disp)", fontSize: 18, fontWeight: 700,
              color: "#211A12", letterSpacing: "-0.02em",
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
          background: "#FBF6EC",
          border: "1px solid rgba(190,79,40,0.22)",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        }}>
          <div style={{
            fontFamily: "var(--ed-disp)", fontSize: 22, fontWeight: 700,
            color: "#BE4F28", minWidth: 50, textAlign: "center",
          }}>
            #{myRank.rank}
          </div>
          <div style={{
            width: 42, height: 42, borderRadius: 12, overflow: "hidden",
            border: "1px solid rgba(190,79,40,0.22)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "#F5EFE2",
          }}>
            {myRank.pet?.avatar_url ? (
              <img src={myRank.pet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 20 }}>{"\uD83D\uDC3E"}</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 600, color: "#211A12" }}>
              {myRank.pet?.name || "My Pet"} <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E" }}>YOU</span>
            </div>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E" }}>
              Lv.{myRank.pet?.level || 1} · {myRank.wallet}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", textTransform: "uppercase", letterSpacing: ".12em" }}>{"\u2B50"} Points</div>
            <div style={{ fontFamily: "var(--ed-disp)", fontSize: 20, fontWeight: 700, color: "#BE4F28" }}>
              {(myRank.points || 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Season Reward Tiers — single source of truth: lib/season.ts */}
      {!loading && !error && entries.length > 0 && (
        <div style={{
          background: "#FBF6EC",
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          borderRadius: 20,
          padding: "24px 24px 20px",
          marginBottom: 24,
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
          }}>
            <span style={{ fontSize: 22 }}>{"\uD83C\uDF81"}</span>
            <div>
              <div style={{
                fontFamily: "var(--ed-disp)", fontSize: 18, fontWeight: 700,
                color: "#211A12", letterSpacing: "-0.01em",
              }}>
                Season Tiers
              </div>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A4E1E", marginTop: 2 }}>
                Earn Season points to climb tiers. Standing is snapshotted at season close.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {SEASON_TIERS.map(t => {
              const reached = (myRank?.points || 0) >= t.min;
              return (
                <div key={t.key} style={{
                  flex: "0 0 auto", minWidth: 150, maxWidth: 200,
                  padding: "16px 18px", borderRadius: 16,
                  background: "#F5EFE2",
                  border: `1px solid ${t.color}${reached ? "55" : "25"}`,
                  boxShadow: reached ? "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))" : "none",
                  opacity: reached ? 1 : 0.85,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>{t.emoji}</span>
                    <span style={{
                      fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 700,
                      color: t.color,
                    }}>
                      {t.name}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: "var(--ed-m)", fontSize: 15, fontWeight: 700,
                    color: "#211A12", marginBottom: 4,
                  }}>
                    {t.min.toLocaleString()}+ pts
                  </div>
                  <div style={{
                    fontFamily: "var(--ed-m)", fontSize: 13, fontVariantNumeric: "tabular-nums", color: "#9A4E1E", lineHeight: 1.4,
                  }}>
                    {reached ? "Reached" : `${(t.min - (myRank?.points || 0)).toLocaleString()} pts to go`}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{
            marginTop: 14, padding: "10px 16px", borderRadius: 12,
            background: "rgba(190,79,40,0.06)", border: "1px solid rgba(190,79,40,0.13)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>{"\uD83D\uDC3E"}</span>
            <span style={{
              fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A4E1E", lineHeight: 1.5,
            }}>
              Tiers are non-financial standing — your felt status in the season. Higher tiers
              unlock claimable merch with your AI pet&apos;s artwork printed on real products.
            </span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{
          textAlign: "center", padding: "60px 0",
          fontFamily: "var(--ed-body)", fontSize: 15, color: "#7A6E5A",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{"\uD83D\uDD04"}</div>
          Loading rankings...
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div style={{
          textAlign: "center", padding: "40px 0",
          fontFamily: "var(--ed-body)", fontSize: 14, color: "#C0432A",
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
                  background: "#FBF6EC",
                  borderRadius: 18,
                  border: `1px solid ${rs.border}`,
                  padding: "28px 18px 20px",
                  textAlign: "center",
                  position: "relative",
                  boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
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
                    fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 700,
                    color: rs.color, marginBottom: 10,
                  }}>
                    #{rank}
                  </div>

                  {/* Avatar */}
                  <div style={{
                    width: avatarSize, height: avatarSize,
                    borderRadius: isFirst ? 22 : 16, margin: "0 auto 10px",
                    border: `1px solid ${rs.border}`,
                    overflow: "hidden", background: "#F5EFE2",
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
                    fontFamily: "var(--ed-disp)", fontSize: isFirst ? 16 : 14, fontWeight: 600,
                    color: "#211A12", marginBottom: 6,
                  }}>
                    {entry.pet?.name || "Unknown"}
                  </div>

                  {/* Level + Evolution */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 8 }}>
                    <span style={{
                      fontFamily: "var(--ed-m)", fontSize: 12, padding: "2px 8px", borderRadius: 6,
                      background: "rgba(190,79,40,0.08)", color: "#9A4E1E",
                      border: "1px solid rgba(190,79,40,0.15)", fontWeight: 600,
                    }}>
                      Lv.{entry.pet?.level || 1}
                    </span>
                    <span style={{
                      fontFamily: "var(--ed-m)", fontSize: 12, padding: "2px 8px", borderRadius: 6,
                      background: `${evo.color}15`, color: evo.color,
                      border: `1px solid ${evo.color}30`, fontWeight: 600,
                    }}>
                      {evo.name}
                    </span>
                  </div>

                  {/* Wallet */}
                  <div style={{
                    fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", marginBottom: 10,
                  }}>
                    {truncateWallet(entry.wallet)}
                  </div>

                  {/* Points */}
                  <div style={{
                    background: isFirst ? "rgba(190,79,40,0.06)" : "#F5EFE2",
                    borderRadius: 10, padding: "10px 14px",
                    border: isFirst ? "1px solid rgba(190,79,40,0.15)" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                  }}>
                    <div style={{
                      fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E",
                      textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 3,
                    }}>
                      {"\u2B50"} Season Rewards
                    </div>
                    <div style={{
                      fontFamily: "var(--ed-disp)", fontSize: isFirst ? 22 : 18, fontWeight: 700,
                      color: "#BE4F28",
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
          background: "#FBF6EC", borderRadius: 16,
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", overflow: "hidden",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        }}>
          {/* Table Header */}
          <div className="lb-table-header" style={{
            display: "grid", gridTemplateColumns: "50px 1fr 140px 120px 100px",
            padding: "12px 18px", borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            background: "#F5EFE2",
          }}>
            {["Rank", "Pet", "Wallet", "Evolution", "Points"].map((h) => (
              <div key={h} className={h === "Wallet" || h === "Evolution" ? "lb-hide-mobile" : undefined} style={{
                fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A",
                textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600,
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
                borderBottom: i < rest.length - 1 ? "1px solid var(--ed-hair, rgba(33,26,18,.13))" : "none",
                background: entry.isMe ? "rgba(190,79,40,0.06)" : i % 2 === 0 ? "transparent" : "rgba(33,26,18,0.02)",
                animation: `leaderFadeUp 0.3s ease-out ${(i + 3) * 0.04}s both`,
                transition: "background 0.2s",
              }}>
                {/* Rank */}
                <div style={{
                  fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
                  color: "#5C5140", fontVariantNumeric: "tabular-nums",
                }}>
                  {entry.rank}
                </div>

                {/* Pet Info */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", overflow: "hidden",
                    background: "#F5EFE2",
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
                      fontFamily: "var(--ed-disp)", fontSize: 13, fontWeight: 600,
                      color: "#211A12", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {entry.pet?.name || "Unknown"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <span style={{
                        fontFamily: "var(--ed-m)", fontSize: 12, padding: "1px 6px", borderRadius: 4,
                        background: "rgba(190,79,40,0.08)", color: "#9A4E1E", fontWeight: 600,
                      }}>
                        Lv.{entry.pet?.level || 1}
                      </span>
                      {entry.pet?.personality && (
                        <span style={{
                          fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A",
                        }}>
                          {entry.pet.personality}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Wallet */}
                <div className="lb-hide-mobile" style={{
                  fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E",
                }}>
                  {truncateWallet(entry.wallet)}
                </div>

                {/* Evolution */}
                <div className="lb-hide-mobile">
                  <span style={{
                    fontFamily: "var(--ed-m)", fontSize: 12, padding: "3px 8px", borderRadius: 6,
                    background: `${evo.color}12`, color: evo.color,
                    border: `1px solid ${evo.color}25`, fontWeight: 600,
                  }}>
                    {evo.name}
                  </span>
                </div>

                {/* Points */}
                <div style={{
                  fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
                  color: "#BE4F28", textAlign: "right",
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
          fontFamily: "var(--ed-body)", fontSize: 15, color: "#7A6E5A",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{"\uD83C\uDFC6"}</div>
          No rankings yet. Be the first to earn Season Rewards points!
        </div>
      )}

      {/* Evolution Legend */}
      {!loading && !error && entries.length > 0 && (
        <div style={{
          marginTop: 24, padding: "16px 20px", borderRadius: 14,
          background: "#FBF6EC", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        }}>
          <div style={{
            fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A",
            textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10,
          }}>
            Evolution Stages
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { name: "Baby", level: "Lv.1+", color: "#a3e635" },
              { name: "Young", level: "Lv.5+", color: "#34d399" },
              { name: "Adult", level: "Lv.10+", color: "#818cf8" },
              { name: "Elder", level: "Lv.20+", color: "#c084fc" },
              { name: "Legendary", level: "Lv.35+", color: "#C8932F" },
            ].map((s) => (
              <div key={s.name} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 8,
                background: `${s.color}10`, border: `1px solid ${s.color}20`,
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", background: s.color,
                }} />
                <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: s.color, fontWeight: 600 }}>
                  {s.name}
                </span>
                <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "rgba(33,26,18,0.45)" }}>
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

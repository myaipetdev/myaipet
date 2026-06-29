"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";

interface RewardItem {
  id: number;
  name: string;
  points: number;
  levelReq: number;
  emoji: string;
  description: string;
  gradient: string;
  accentColor: string;
  productShape: "mug" | "phone" | "sticker" | "tote" | "hoodie" | "notebook" | "pen" | "clip" | "figure";
  badge?: "LIMITED" | "POPULAR";
  deliveryDays: string;
}

const REWARDS_CATALOG: RewardItem[] = [
  { id: 1, name: "Sticker Pack", points: 500, levelReq: 5, emoji: "🐾", description: "Custom pet sticker set (5 sheets) — glossy vinyl, waterproof", gradient: "linear-gradient(135deg, #F4D9A8 0%, #E2A24C 100%)", accentColor: "#9A4E1E", productShape: "sticker", deliveryDays: "3-5 days" },
  { id: 2, name: "Hair Clip", points: 1000, levelReq: 10, emoji: "✨", description: "Pet-shaped hair accessory — acrylic resin, handcrafted", gradient: "linear-gradient(135deg, #fbcfe8 0%, #f472b6 100%)", accentColor: "#be185d", productShape: "clip", badge: "POPULAR", deliveryDays: "5-7 days" },
  { id: 3, name: "Phone Case", points: 2000, levelReq: 15, emoji: "📱", description: "Custom printed pet phone case — premium TPU, all models", gradient: "linear-gradient(135deg, #bfdbfe 0%, #3b82f6 100%)", accentColor: "#1d4ed8", productShape: "phone", badge: "POPULAR", deliveryDays: "5-7 days" },
  { id: 4, name: "Mug", points: 3000, levelReq: 20, emoji: "☕", description: "Ceramic mug with your pet's portrait — 11oz, dishwasher safe", gradient: "linear-gradient(135deg, #d9f99d 0%, #84cc16 100%)", accentColor: "#4d7c0f", productShape: "mug", badge: "POPULAR", deliveryDays: "5-7 days" },
  { id: 5, name: "Notebook", points: 3500, levelReq: 25, emoji: "📔", description: "Hardcover notebook with pet art — 200 pages, lay-flat binding", gradient: "linear-gradient(135deg, #e9d5ff 0%, #a855f7 100%)", accentColor: "#7e22ce", productShape: "notebook", deliveryDays: "5-7 days" },
  { id: 6, name: "Pen Set", points: 4000, levelReq: 30, emoji: "🖋️", description: "Premium pen set with pet charm — brass body, refillable", gradient: "linear-gradient(135deg, #fecaca 0%, #ef4444 100%)", accentColor: "#b91c1c", productShape: "pen", deliveryDays: "7-10 days" },
  { id: 7, name: "Tote Bag", points: 5000, levelReq: 35, emoji: "👜", description: "Canvas tote with AI pet print — organic cotton, reinforced", gradient: "linear-gradient(135deg, #99f6e4 0%, #14b8a6 100%)", accentColor: "#0f766e", productShape: "tote", deliveryDays: "7-10 days" },
  { id: 8, name: "Hoodie", points: 10000, levelReq: 40, emoji: "🧥", description: "Limited edition pet hoodie — 100% cotton, embroidered", gradient: "linear-gradient(135deg, #c4b5fd 0%, #7c3aed 100%)", accentColor: "#5b21b6", productShape: "hoodie", badge: "LIMITED", deliveryDays: "10-14 days" },
  { id: 9, name: "3D Figure", points: 20000, levelReq: 50, emoji: "🗿", description: "3D printed pet figure — hand-painted, collector's box", gradient: "linear-gradient(135deg, #F4D9A8 0%, #E2A24C 50%, #BE4F28 100%)", accentColor: "#9A4E1E", productShape: "figure", badge: "LIMITED", deliveryDays: "14-21 days" },
];

/* SVG-based product illustrations */
/* Product mockup with pet avatar - clean hero image approach */
function ProductMockupWithAvatar({ shape, avatar, color }: { shape: string; avatar: string; color: string }) {
  const productIcons: Record<string, string> = {
    sticker: "\u{1F3F7}\uFE0F",
    clip: "\u2728",
    phone: "\u{1F4F1}",
    mug: "\u2615",
    notebook: "\u{1F4D4}",
    pen: "\u{1F58B}\uFE0F",
    tote: "\u{1F45C}",
    hoodie: "\u{1F9E5}",
    figure: "\u{1F5FF}",
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 8, height: "100%",
    }}>
      {/* Pet avatar - main visual */}
      <div style={{
        width: 72, height: 72, borderRadius: 18,
        overflow: "hidden", border: "3px solid rgba(255,255,255,0.4)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
      }}>
        <img src={avatar} alt="pet" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      {/* Product type indicator */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 10px", borderRadius: 20,
        background: "rgba(255,255,255,0.25)",
        backdropFilter: "blur(4px)",
        fontSize: 10, color: "rgba(255,255,255,0.9)",
        fontFamily: "var(--ed-m)", fontWeight: 600, letterSpacing: "0.05em",
      }}>
        {productIcons[shape]
          ? <span style={{ fontSize: 12 }}>{productIcons[shape]}</span>
          : <Icon name="paw" size={13} />}
        MY AI PET
      </div>
    </div>
  );
}

function ProductMockup({ item, isLocked, petAvatar, mockupImage }: { item: RewardItem; isLocked: boolean; petAvatar?: string | null; mockupImage?: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: 180,
        background: item.gradient,
        borderRadius: "16px 16px 0 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Shine */}
      {!isLocked && !mockupImage && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 40%, rgba(255,255,255,0.05) 100%)",
          pointerEvents: "none",
        }}/>
      )}

      {/* AI-generated mockup image */}
      {mockupImage ? (
        <img src={mockupImage} alt={item.name} style={{
          width: "100%", height: "100%", objectFit: "cover",
          filter: isLocked ? "saturate(0.4) opacity(0.6)" : "none",
          transition: "filter 0.3s",
        }} />
      ) : petAvatar ? (
        <div style={{
          filter: isLocked ? "saturate(0.4) opacity(0.6)" : "drop-shadow(0 6px 16px rgba(0,0,0,0.2))",
          transition: "filter 0.3s", position: "relative",
        }}>
          <ProductMockupWithAvatar shape={item.productShape} avatar={petAvatar} color={item.accentColor} />
        </div>
      ) : (
        <div style={{
          filter: isLocked ? "saturate(0.4) opacity(0.6)" : "drop-shadow(0 4px 12px rgba(0,0,0,0.15))",
          transition: "filter 0.3s",
        }}>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 8, height: "100%",
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16,
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}>
              <Icon name="paw" size={28} />
            </div>
            <span style={{
              fontSize: 9, color: "rgba(255,255,255,0.7)",
              fontFamily: "var(--ed-m)", fontWeight: 600,
            }}>
              MY AI PET
            </span>
          </div>
        </div>
      )}

      {/* Badge */}
      {item.badge && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          padding: "4px 10px", borderRadius: 6,
          fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
          background: isLocked
            ? "rgba(33,26,18,0.1)"
            : item.badge === "LIMITED"
              ? "#211A12"
              : "linear-gradient(180deg,#F49B2A,#E27D0C)",
          color: isLocked ? "#9A7B4E" : "#FFF8EE",
          boxShadow: isLocked ? "none" : "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          fontFamily: "var(--ed-disp)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {isLocked ? <Icon name="lock" size={12} /> : item.badge}
        </div>
      )}

      {/* Locked overlay for non-badge items */}
      {isLocked && !item.badge && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          width: 28, height: 28, borderRadius: "50%",
          background: "rgba(33,26,18,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>
          <Icon name="lock" size={14} />
        </div>
      )}
    </div>
  );
}

/* Preview modal */
function PreviewOverlay({ item, onClose }: { item: RewardItem; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#FBF6EC",
          borderRadius: 24,
          maxWidth: 420,
          width: "100%",
          overflow: "hidden",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Large preview area */}
        <div
          style={{
            width: "100%",
            height: 260,
            background: item.gradient,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)",
            }}
          />
          <div style={{ filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.2))", transform: "scale(1.3)" }}>
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 8,
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: 16,
                background: "rgba(255,255,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}>
                <Icon name="paw" size={28} />
              </div>
              <span style={{
                fontSize: 9, color: "rgba(255,255,255,0.7)",
                fontFamily: "var(--ed-m)", fontWeight: 600,
              }}>
                MY AI PET
              </span>
            </div>
          </div>
        </div>

        <div style={{ padding: "24px 28px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <h3 style={{
              fontFamily: "var(--ed-disp)",
              fontSize: 22,
              fontWeight: 700,
              color: "#211A12",
              margin: 0,
            }}>
              {item.name}
            </h3>
            {item.badge && (
              <span style={{
                padding: "3px 8px",
                borderRadius: 5,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.08em",
                background: item.badge === "LIMITED" ? "#211A12" : "#BE4F28",
                color: "#FFF8EE",
              }}>
                {item.badge}
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, color: "#5C5140", margin: "0 0 16px", lineHeight: 1.5 }}>
            {item.description}
          </p>
          <div style={{
            background: "rgba(190,79,40,0.06)",
            borderRadius: 12,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}>
            <Icon name="paw" size={28} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#9A4E1E" }}>
                Your pet&apos;s image will be printed on this product
              </div>
              <div style={{ fontSize: 12, color: "#9A4E1E", marginTop: 2 }}>
                AI-generated custom artwork based on your pet
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <Icon name="coin" size={14} />
                <span style={{ fontFamily: "var(--ed-m)", fontSize: 18, fontWeight: 700, color: "#9A4E1E" }}>
                  {item.points.toLocaleString()}
                </span>
                <span style={{ fontSize: 13, color: "#5C5140", marginLeft: 4 }}>points</span>
              </div>
              <div style={{ fontSize: 12, color: "#9A7B4E" }}>
                Est. delivery: {item.deliveryDays}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: "10px 24px",
                borderRadius: 12,
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                background: "#F5EFE2",
                fontSize: 14,
                fontWeight: 600,
                color: "#5C5140",
                cursor: "pointer",
                fontFamily: "var(--ed-disp)",
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const REWARD_TIERS = [
  { tier: "Top 1", minRank: 1, maxRank: 1, color: "#C8932F", icon: "trophy", label: "Champion", allowedItems: [1,2,3,4,5,6,7,8,9] },
  { tier: "Top 3", minRank: 2, maxRank: 3, color: "#BE4F28", icon: "medal", label: "Elite", allowedItems: [1,2,3,4,5,6,7,8,9] },
  { tier: "Top 10", minRank: 4, maxRank: 10, color: "#9ca3af", icon: "medal", label: "Top 10", allowedItems: [1,2,3,4,5,6,7] },
  { tier: "Top 10%", minRank: 11, maxRank: Infinity, color: "#cd7f32", icon: "medal", label: "Top 10%", allowedItems: [1,2,3] },
];

function getUserTier(rank: number | null, totalParticipants: number) {
  if (!rank || rank <= 0) return null;
  for (const t of REWARD_TIERS) {
    if (t.tier === "Top 10%") {
      const cutoff = Math.max(10, Math.ceil(totalParticipants * 0.1));
      if (rank <= cutoff) return t;
    } else if (rank >= t.minRank && rank <= t.maxRank) {
      return t;
    }
  }
  return null;
}

interface StreakData {
  streak: number;
  lastCheckin: string | null;
  checkedInToday: boolean;
  rewards: number[];
  awarded?: number;
}

export default function Rewards() {
  const [redeeming, setRedeeming] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [previewItem, setPreviewItem] = useState<RewardItem | null>(null);
  const [confirmItem, setConfirmItem] = useState<RewardItem | null>(null);
  const [redemptionResult, setRedemptionResult] = useState<{
    redemption_id: number;
    reward_name: string;
    points_spent: number;
    remaining_points: number;
    delivery_estimate: string;
  } | null>(null);
  const [userPoints, setUserPoints] = useState(0);
  const [userLevel, setUserLevel] = useState(1);
  const [petAvatar, setPetAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [mockupImages, setMockupImages] = useState<Record<string, string>>({});
  const [generatingMockups, setGeneratingMockups] = useState(false);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [totalParticipants, setTotalParticipants] = useState(0);

  const userTier = getUserTier(userRank, totalParticipants);

  useEffect(() => {
    const generateMockups = async (petId: number) => {
      setGeneratingMockups(true);
      const types = ["sticker", "clip", "phone", "mug", "notebook", "pen", "tote", "hoodie", "figure"];
      const token = localStorage.getItem("token");
      // Generate one at a time to not overload
      for (const type of types) {
        try {
          const res = await fetch("/api/rewards/mockup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ product_type: type, pet_id: petId }),
          });
          if (res.ok) {
            const data = await res.json();
            setMockupImages(prev => ({ ...prev, [type]: data.image_url }));
          }
        } catch {}
      }
      setGeneratingMockups(false);
    };

    (async () => {
      try {
        const token = localStorage.getItem("token");
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const [petData, userData, streakRes, leaderboardData] = await Promise.all([
          api.pets.list().then(d => d.pets || d).catch(() => []),
          api.credits.balance().catch(() => null),
          fetch("/api/checkin", { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
          api.leaderboard.get(100).catch(() => null),
        ]);
        // Get highest level pet
        let bestPetId: number | null = null;
        if (petData.length > 0) {
          const best = petData.reduce((a: any, b: any) => (b.level > a.level ? b : a), petData[0]);
          setUserLevel(best.level);
          if (best.avatar_url) setPetAvatar(best.avatar_url);
          bestPetId = best.id;
        }
        if (userData) {
          setUserPoints(userData.season_points ?? 0);
        }
        if (streakRes) {
          setStreakData(streakRes);
        }
        // Set ranking info
        if (leaderboardData) {
          setTotalParticipants(leaderboardData.leaderboard?.length || 0);
          if (leaderboardData.myRank) {
            setUserRank(leaderboardData.myRank.rank);
          }
        }
        // Generate mockups in background (don't block page)
        if (bestPetId) {
          generateMockups(bestPetId);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleCheckin = async () => {
    setCheckingIn(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (res.ok) {
        setStreakData(data);
        if (data.awarded) {
          setUserPoints(prev => prev + data.awarded);
          setMessage({ type: "success", text: `Day ${data.streak} check-in! +${data.awarded} Season Rewards points` });
        }
      } else {
        setMessage({ type: "error", text: data.error || "Check-in failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Check-in failed. Please try again." });
    }
    setCheckingIn(false);
  };

  const unlockedCount = REWARDS_CATALOG.filter((r) => userTier?.allowedItems.includes(r.id) && userLevel >= r.levelReq).length;
  const affordableCount = REWARDS_CATALOG.filter((r) => userTier?.allowedItems.includes(r.id) && userLevel >= r.levelReq && userPoints >= r.points).length;
  const progressPct = Math.round((unlockedCount / REWARDS_CATALOG.length) * 100);

  const handleRedeem = async (item: RewardItem) => {
    // Show confirmation dialog first
    setConfirmItem(item);
  };

  const executeRedeem = async (item: RewardItem) => {
    setConfirmItem(null);
    setRedeeming(item.id);
    setMessage(null);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("petagen_jwt");
      const res = await fetch("/api/rewards/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reward_id: item.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUserPoints(data.remaining_points);
        setRedemptionResult(data);
      } else {
        setMessage({ type: "error", text: data.error || "Redemption failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Redemption failed. Please try again." });
    }
    setRedeeming(null);
  };

  const getButtonState = (item: RewardItem) => {
    if (!userTier) return "no_rank";
    if (!userTier.allowedItems.includes(item.id)) return "tier_locked";
    if (userLevel < item.levelReq) return "locked";
    if (userPoints < item.points) return "insufficient";
    return "available";
  };

  if (loading) {
    return (
      <div style={{ padding: "140px 40px", textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: "2px solid rgba(190,79,40,0.2)", borderTopColor: "#BE4F28", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "rgba(33,26,18,0.35)" }}>Loading rewards...</div>
      </div>
    );
  }

  return (
    <section style={styles.wrapper}>
      {/* Preview Modal */}
      {previewItem && (
        <PreviewOverlay item={previewItem} onClose={() => setPreviewItem(null)} />
      )}

      {/* Confirm Redemption Modal */}
      {confirmItem && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: 20,
          }}
          onClick={() => setConfirmItem(null)}
        >
          <div
            style={{
              background: "#FBF6EC", borderRadius: 24, maxWidth: 400, width: "100%",
              overflow: "hidden", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: "100%", height: 80, background: confirmItem.gradient,
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)",
              }}/>
              <span style={{ fontSize: 36 }}>{confirmItem.emoji}</span>
            </div>
            <div style={{ padding: "24px 28px 28px", textAlign: "center" }}>
              <h3 style={{
                fontFamily: "var(--ed-disp)", fontSize: 20, fontWeight: 700,
                color: "#211A12", margin: "0 0 8px",
              }}>
                Confirm Redemption
              </h3>
              <p style={{ fontSize: 14, color: "#5C5140", margin: "0 0 16px", lineHeight: 1.5 }}>
                Redeem <strong>{confirmItem.name}</strong> for{" "}
                <strong>{confirmItem.points.toLocaleString()} points</strong>?
              </p>
              <div style={{
                background: "rgba(190,79,40,0.06)", borderRadius: 12, padding: "12px 16px",
                marginBottom: 20, fontSize: 13, color: "#9A4E1E",
              }}>
                Your balance: {userPoints.toLocaleString()} pts → {(userPoints - confirmItem.points).toLocaleString()} pts
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setConfirmItem(null)}
                  style={{
                    flex: 1, padding: "12px 0", borderRadius: 12,
                    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", background: "#F5EFE2",
                    fontSize: 14, fontWeight: 600, color: "#5C5140", cursor: "pointer",
                    fontFamily: "var(--ed-disp)",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => executeRedeem(confirmItem)}
                  style={{
                    flex: 1, padding: "12px 0", borderRadius: 12, border: "none",
                    background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
                    fontSize: 14, fontWeight: 700, color: "#FFF8EE", cursor: "pointer",
                    fontFamily: "var(--ed-disp)",
                    boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Redemption Success Modal */}
      {redemptionResult && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: 20,
          }}
          onClick={() => setRedemptionResult(null)}
        >
          <div
            style={{
              background: "#FBF6EC", borderRadius: 24, maxWidth: 400, width: "100%",
              overflow: "hidden", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: "100%", padding: "32px 28px", textAlign: "center",
              background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
            }}>
              <div style={{ fontSize: 48, marginBottom: 8, display: "flex", justifyContent: "center" }}>
                <Icon name="sparkling" size={48} />
              </div>
              <h3 style={{
                fontFamily: "var(--ed-disp)", fontSize: 22, fontWeight: 700,
                color: "#065f46", margin: 0,
              }}>
                Redemption Confirmed!
              </h3>
            </div>
            <div style={{ padding: "24px 28px 28px" }}>
              <div style={{
                background: "rgba(16,185,129,0.06)", borderRadius: 12, padding: "16px",
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#211A12", marginBottom: 8 }}>
                  {redemptionResult.reward_name}
                </div>
                <div style={{ fontSize: 13, color: "#5C5140", lineHeight: 1.6 }}>
                  <div>Order #{redemptionResult.redemption_id}</div>
                  <div>Points spent: {redemptionResult.points_spent.toLocaleString()}</div>
                  <div>Est. delivery: {redemptionResult.delivery_estimate}</div>
                </div>
              </div>
              <p style={{
                fontSize: 14, color: "#059669", margin: "0 0 20px", lineHeight: 1.5,
                fontWeight: 500, textAlign: "center",
              }}>
                We&apos;ll contact you for delivery details.
              </p>
              <button
                onClick={() => setRedemptionResult(null)}
                style={{
                  width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  fontSize: 14, fontWeight: 700, color: "#FFF8EE", cursor: "pointer",
                  fontFamily: "var(--ed-disp)",
                  boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <Icon name="gift" size={36} />
          <h2 style={styles.title}>Pet Rewards Shop</h2>
        </div>
        <p style={styles.subtitle}>
          Top rankers get exclusive real merch!
        </p>
      </div>

      {/* Daily Check-In */}
      {streakData && (
        <div style={{
          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
          border: "1px solid rgba(59,130,246,0.15)",
          borderRadius: 20,
          padding: "18px 24px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap" as const,
        }}>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 4, minWidth: 100 }}>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 14, fontWeight: 700, color: "#1e40af", textTransform: "uppercase" as const, letterSpacing: "0.12em" }}>
              Daily Check-In
            </div>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#3b82f6", fontWeight: 600 }}>
              Streak: {streakData.streak} day{streakData.streak !== 1 ? "s" : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, justifyContent: "center" }}>
            {streakData.rewards.map((pts, i) => {
              const dayNum = i + 1;
              const completed = dayNum <= streakData.streak && streakData.checkedInToday
                ? true
                : dayNum < streakData.streak || (dayNum <= streakData.streak && streakData.checkedInToday);
              const isToday = streakData.checkedInToday
                ? dayNum === streakData.streak
                : dayNum === streakData.streak + 1;
              return (
                <div key={dayNum} style={{
                  width: 42, height: 52,
                  borderRadius: 12,
                  display: "flex",
                  flexDirection: "column" as const,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  background: completed
                    ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)"
                    : isToday
                    ? "rgba(59,130,246,0.12)"
                    : "rgba(255,255,255,0.6)",
                  border: isToday && !completed
                    ? "2px solid #3b82f6"
                    : completed
                    ? "2px solid transparent"
                    : "1px solid rgba(59,130,246,0.1)",
                  boxShadow: "none",
                  transition: "all 0.3s ease",
                }}>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: completed ? "#fff" : isToday ? "#2563eb" : "#93c5fd",
                    fontFamily: "var(--ed-m)",
                  }}>
                    {completed ? "\u2713" : `D${dayNum}`}
                  </span>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: completed ? "rgba(255,255,255,0.8)" : isToday ? "#3b82f6" : "#93c5fd",
                  }}>
                    +{pts}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleCheckin}
            disabled={streakData.checkedInToday || checkingIn}
            style={{
              padding: "10px 22px",
              borderRadius: 14,
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "var(--ed-disp)",
              cursor: streakData.checkedInToday ? "default" : "pointer",
              background: streakData.checkedInToday
                ? "rgba(59,130,246,0.1)"
                : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              color: streakData.checkedInToday ? "#93c5fd" : "#fff",
              boxShadow: streakData.checkedInToday ? "none" : "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap" as const,
              opacity: checkingIn ? 0.7 : 1,
            }}
          >
            {checkingIn ? "..." : streakData.checkedInToday ? "Checked In \u2713" : "Check In"}
          </button>
        </div>
      )}

      {/* How It Works */}
      <div style={styles.howItWorks}>
        <h3 style={styles.howTitle}>How It Works</h3>
        <div style={styles.stepsRow}>
          <div style={styles.step}>
            <div style={styles.stepNumber}>1</div>
            <div style={styles.stepText}>
              <div style={styles.stepLabel}>Rank Up</div>
              <div style={styles.stepDesc}>Climb the leaderboard</div>
            </div>
          </div>
          <div style={styles.stepArrow}>&#8594;</div>
          <div style={styles.step}>
            <div style={styles.stepNumber}>2</div>
            <div style={styles.stepText}>
              <div style={styles.stepLabel}>Unlock Tier</div>
              <div style={styles.stepDesc}>Top 10% gets rewards</div>
            </div>
          </div>
          <div style={styles.stepArrow}>&#8594;</div>
          <div style={styles.step}>
            <div style={styles.stepNumber}>3</div>
            <div style={styles.stepText}>
              <div style={styles.stepLabel}>Redeem</div>
              <div style={styles.stepDesc}>We&apos;ll ship your custom merch!</div>
            </div>
          </div>
        </div>
      </div>

      {/* Points Bar */}
      <div style={styles.pointsBar}>
        <div style={styles.pointsLeft}>
          <Icon name="coin" size={32} />
          <div>
            <div style={styles.pointsLabel}>Your Points</div>
            <div style={styles.pointsValue}>{userPoints.toLocaleString()}</div>
          </div>
        </div>
        <div style={styles.pointsRight}>
          <div style={styles.levelBadge}>Lv.{userLevel}</div>
          <div style={styles.pointsMeta}>
            {affordableCount} redeemable &middot; {unlockedCount} unlocked
          </div>
        </div>
      </div>

      {/* Your Ranking Tier */}
      <div style={{
        background: userTier
          ? `linear-gradient(135deg, ${userTier.color}08, ${userTier.color}15)`
          : "linear-gradient(135deg, rgba(107,114,128,0.04), rgba(107,114,128,0.08))",
        border: `1.5px solid ${userTier ? `${userTier.color}30` : "rgba(107,114,128,0.15)"}`,
        borderRadius: 20,
        padding: "20px 28px",
        marginBottom: 24,
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap" as const,
      }}>
        <div style={{ fontSize: 36, display: "flex", alignItems: "center" }}>
          <Icon name={userTier ? userTier.icon : "trophy"} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{
            fontFamily: "var(--ed-m)", fontSize: 11,
            fontWeight: 700, color: userTier ? userTier.color : "#7A6E5A",
            textTransform: "uppercase" as const, letterSpacing: "0.12em", marginBottom: 4,
          }}>
            Your Ranking Tier
          </div>
          {userTier ? (
            <>
              <div style={{
                fontFamily: "var(--ed-disp)", fontSize: 20, fontWeight: 700,
                color: "#211A12",
              }}>
                {userTier.label} — Rank #{userRank}
              </div>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 11, color: "rgba(33,26,18,0.5)", marginTop: 2 }}>
                You can redeem {userTier.allowedItems.length} of {REWARDS_CATALOG.length} rewards
              </div>
            </>
          ) : (
            <>
              <div style={{
                fontFamily: "var(--ed-disp)", fontSize: 18, fontWeight: 700,
                color: "#211A12",
              }}>
                {userRank ? `Rank #${userRank} — Not in top tier yet` : "Unranked"}
              </div>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 11, color: "rgba(33,26,18,0.5)", marginTop: 2 }}>
                Rewards are exclusive to top-ranked players. Keep earning Season Rewards points!
              </div>
            </>
          )}
        </div>
        <div style={{
          display: "flex", gap: 6, flexWrap: "wrap" as const,
        }}>
          {REWARD_TIERS.map(t => (
            <div key={t.tier} style={{
              padding: "6px 12px", borderRadius: 10,
              background: userTier?.tier === t.tier ? `${t.color}20` : "rgba(33,26,18,0.03)",
              border: userTier?.tier === t.tier ? `1.5px solid ${t.color}40` : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              fontFamily: "var(--ed-m)", fontSize: 10, fontWeight: 700,
              color: userTier?.tier === t.tier ? t.color : "rgba(33,26,18,0.3)",
              transition: "all 0.2s",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <Icon name={t.icon} size={12} /> {t.tier}
            </div>
          ))}
        </div>
      </div>

      {/* Status Message */}
      {message && (
        <div
          style={{
            ...styles.message,
            background: message.type === "success" ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            borderColor: message.type === "success" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
            color: message.type === "success" ? "#059669" : "#dc2626",
          }}
        >
          {message.type === "success" ? "✓ " : "✕ "}
          {message.text}
        </div>
      )}

      {/* Rewards Grid */}
      <div style={styles.grid}>
        {REWARDS_CATALOG.map((item) => {
          const state = getButtonState(item);
          const isLocked = state === "locked" || state === "no_rank" || state === "tier_locked";
          const isInsufficient = state === "insufficient";

          return (
            <div
              key={item.id}
              style={{
                ...styles.card,
                ...(isLocked ? styles.cardLocked : {}),
              }}
              onMouseEnter={(e) => {
                if (!isLocked) {
                  e.currentTarget.style.transform = "translateY(-6px)";
                  e.currentTarget.style.boxShadow = "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))";
              }}
            >
              {/* Product Mockup */}
              <ProductMockup item={item} isLocked={isLocked} petAvatar={petAvatar} mockupImage={mockupImages[item.productShape]} />

              {/* Card Body */}
              <div style={styles.cardBody}>
                {/* Item Name */}
                <h3 style={styles.itemName}>{item.name}</h3>

                {/* Points Cost */}
                <div style={styles.costRow}>
                  <Icon name="coin" size={16} />
                  <span style={styles.costValue}>{item.points.toLocaleString()}</span>
                  <span style={styles.costUnit}>pts</span>
                </div>

                {/* Level Badge */}
                <div
                  style={{
                    ...styles.levelReq,
                    background: isLocked ? "rgba(107,114,128,0.08)" : `${item.accentColor}10`,
                    color: isLocked ? "#9ca3af" : item.accentColor,
                    borderColor: isLocked ? "rgba(107,114,128,0.15)" : `${item.accentColor}30`,
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                >
                  <Icon name={isLocked ? "lock" : "sparkling"} size={12} />
                  Lv.{item.levelReq}+
                </div>

                {/* Description */}
                <p style={styles.description}>{item.description}</p>

                {/* Delivery info */}
                <div style={styles.deliveryInfo}>
                  Est. delivery: {item.deliveryDays}
                </div>

                {/* Action Buttons */}
                <div style={styles.buttonRow}>
                  <button
                    style={styles.previewButton}
                    onClick={() => setPreviewItem(item)}
                  >
                    Preview
                  </button>
                  <button
                    style={{
                      ...styles.button,
                      ...(isLocked
                        ? styles.buttonLocked
                        : isInsufficient
                        ? styles.buttonInsufficient
                        : styles.buttonAvailable),
                      ...(redeeming === item.id ? { opacity: 0.7 } : {}),
                    }}
                    disabled={state !== "available" || redeeming !== null}
                    onClick={() => handleRedeem(item)}
                    onMouseEnter={(e) => {
                      if (state === "available") {
                        e.currentTarget.style.background = "linear-gradient(180deg,#E27D0C,#C8650A)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (state === "available") {
                        e.currentTarget.style.background = "linear-gradient(180deg,#F49B2A,#E27D0C)";
                      }
                    }}
                  >
                    {redeeming === item.id
                      ? "..."
                      : state === "no_rank"
                      ? "Rank Up!"
                      : state === "tier_locked"
                      ? "Higher Rank Needed"
                      : isLocked
                      ? "Locked"
                      : isInsufficient
                      ? "Need Points"
                      : "Redeem"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Your Journey */}
      <div style={styles.journey}>
        <h3 style={styles.journeyTitle}>Your Journey</h3>
        <div style={styles.progressOuter}>
          <div
            style={{
              ...styles.progressInner,
              width: `${progressPct}%`,
            }}
          />
        </div>
        <div style={styles.progressLabel}>
          {unlockedCount} of {REWARDS_CATALOG.length} rewards unlocked ({progressPct}%)
        </div>
        <div style={styles.milestonesRow}>
          {REWARDS_CATALOG.map((item) => {
            const unlocked = userLevel >= item.levelReq;
            return (
              <div
                key={item.id}
                style={{
                  ...styles.milestone,
                  opacity: unlocked ? 1 : 0.35,
                }}
                title={`${item.name} — Lv.${item.levelReq}`}
              >
                <span style={{ fontSize: 20 }}>{item.emoji}</span>
                <span style={styles.milestoneLv}>Lv.{item.levelReq}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Inline Styles ─── */

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "80px 16px 60px",
    fontFamily: "var(--ed-body)",
  },

  /* Header */
  header: {
    textAlign: "center",
    marginBottom: 28,
  },
  headerTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 8,
  },
  headerIcon: {
    fontSize: 36,
  },
  title: {
    fontFamily: "var(--ed-disp)",
    fontSize: 32,
    fontWeight: 700,
    color: "#211A12",
    margin: 0,
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: 16,
    color: "#5C5140",
    margin: 0,
    fontWeight: 400,
  },

  /* How It Works */
  howItWorks: {
    background: "#FBF6EC",
    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
    borderRadius: 20,
    padding: "24px 28px",
    marginBottom: 24,
    boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
  },
  howTitle: {
    fontFamily: "var(--ed-m)",
    fontSize: 16,
    fontWeight: 700,
    color: "#9A4E1E",
    margin: "0 0 16px",
    textAlign: "center" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
  },
  stepsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap" as const,
  },
  step: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#F5EFE2",
    borderRadius: 14,
    padding: "12px 18px",
    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
    color: "#FFF8EE",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--ed-m)",
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
  },
  stepText: {},
  stepLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: "#211A12",
  },
  stepDesc: {
    fontSize: 12,
    color: "#7A6E5A",
    marginTop: 1,
  },
  stepArrow: {
    fontSize: 18,
    color: "#9A4E1E",
    fontWeight: 700,
  },

  /* Points Bar */
  pointsBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#FBF6EC",
    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
    borderRadius: 16,
    padding: "16px 24px",
    marginBottom: 28,
    flexWrap: "wrap" as const,
    gap: 12,
    boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
  },
  pointsLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  coinIcon: {
    fontSize: 32,
  },
  pointsLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: "#9A4E1E",
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
    fontFamily: "var(--ed-m)",
  },
  pointsValue: {
    fontFamily: "var(--ed-m)",
    fontSize: 24,
    fontWeight: 700,
    color: "#211A12",
  },
  pointsRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  levelBadge: {
    fontFamily: "var(--ed-m)",
    background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: 700,
    padding: "6px 14px",
    borderRadius: 20,
  },
  pointsMeta: {
    fontSize: 13,
    color: "#7A6E5A",
    fontWeight: 500,
  },

  /* Message */
  message: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid",
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 24,
  },

  /* Grid */
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 24,
    marginBottom: 40,
  },

  /* Card */
  card: {
    background: "#FBF6EC",
    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
    borderRadius: 20,
    overflow: "hidden" as const,
    display: "flex",
    flexDirection: "column" as const,
    boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
    transition: "transform 0.3s ease, box-shadow 0.3s ease",
    cursor: "default",
  },
  cardLocked: {
    opacity: 0.75,
    filter: "saturate(0.5)",
  },
  cardBody: {
    padding: "20px 22px 22px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    textAlign: "center" as const,
    gap: 8,
    flex: 1,
  },

  /* Item Info */
  itemName: {
    fontFamily: "var(--ed-disp)",
    fontSize: 20,
    fontWeight: 700,
    color: "#211A12",
    margin: 0,
    letterSpacing: "-0.01em",
  },
  costRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  costCoin: {
    fontSize: 16,
  },
  costValue: {
    fontFamily: "var(--ed-m)",
    fontSize: 18,
    fontWeight: 700,
    color: "#9A4E1E",
  },
  costUnit: {
    fontSize: 12,
    color: "#9A7B4E",
    fontWeight: 500,
    marginLeft: 2,
  },
  levelReq: {
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 12,
    border: "1px solid",
    letterSpacing: "0.02em",
  },
  description: {
    fontSize: 13,
    color: "#5C5140",
    margin: 0,
    lineHeight: 1.5,
    flex: 1,
  },
  deliveryInfo: {
    fontSize: 11,
    color: "#9A7B4E",
    fontWeight: 500,
    letterSpacing: "0.02em",
  },

  /* Buttons */
  buttonRow: {
    display: "flex",
    gap: 8,
    width: "100%",
    marginTop: 6,
  },
  previewButton: {
    flex: "0 0 auto",
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
    background: "#F5EFE2",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "var(--ed-disp)",
    cursor: "pointer",
    color: "#5C5140",
    transition: "background 0.2s ease",
  },
  button: {
    flex: 1,
    padding: "10px 0",
    borderRadius: 12,
    border: "none",
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "var(--ed-disp)",
    cursor: "pointer",
    transition: "background 0.2s ease, opacity 0.2s ease",
    letterSpacing: "0.01em",
  },
  buttonAvailable: {
    background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
    color: "#FFF8EE",
    boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
  },
  buttonInsufficient: {
    background: "rgba(33,26,18,0.04)",
    color: "#9A7B4E",
    cursor: "not-allowed",
  },
  buttonLocked: {
    background: "rgba(33,26,18,0.04)",
    color: "#9A7B4E",
    cursor: "not-allowed",
  },

  /* Journey */
  journey: {
    background: "#FBF6EC",
    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
    borderRadius: 20,
    padding: "28px 32px",
    boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
  },
  journeyTitle: {
    fontFamily: "var(--ed-disp)",
    fontSize: 20,
    fontWeight: 700,
    color: "#211A12",
    margin: "0 0 16px",
  },
  progressOuter: {
    width: "100%",
    height: 10,
    background: "rgba(33,26,18,0.04)",
    borderRadius: 8,
    overflow: "hidden" as const,
    marginBottom: 8,
  },
  progressInner: {
    height: "100%",
    background: "linear-gradient(90deg,#F49B2A,#E27D0C)",
    borderRadius: 8,
    transition: "width 0.6s ease",
  },
  progressLabel: {
    fontSize: 13,
    color: "#5C5140",
    fontWeight: 500,
    marginBottom: 20,
  },
  milestonesRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 16,
    justifyContent: "center",
  },
  milestone: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 4,
    transition: "opacity 0.3s ease",
  },
  milestoneLv: {
    fontFamily: "var(--ed-m)",
    fontSize: 11,
    fontWeight: 600,
    color: "#9A4E1E",
  },
};

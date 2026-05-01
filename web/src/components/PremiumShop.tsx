"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { PREMIUM_ITEMS, RARITY_COLORS, CATEGORY_LABELS, type PremiumItem } from "@/lib/premium";
import Icon, { SHOP_ICONS, CATEGORY_ICONS } from "@/components/Icon";
import { useDirectUsdtPay } from "@/hooks/useDirectUsdtPay";

export default function PremiumShop() {
  const directPay = useDirectUsdtPay();
  const [category, setCategory] = useState("all");
  const [pets, setPets] = useState<any[]>([]);
  const [selectedPet, setSelectedPet] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string; detail?: any } | null>(null);
  const [gachaAnimation, setGachaAnimation] = useState(false);
  const [confirmItem, setConfirmItem] = useState<PremiumItem | null>(null);
  const [payMethod, setPayMethod] = useState<"credits" | "usdt">("credits");

  useEffect(() => {
    Promise.all([
      api.pets.list().then(d => d.pets || d).catch(() => []),
      api.credits.balance().catch(() => null),
    ]).then(([p, b]) => {
      setPets(p);
      if (p.length > 0) setSelectedPet(p[0]);
      if (b) setBalance(b.credits);
    });
  }, []);

  const handlePurchase = async (item: PremiumItem, extra?: any) => {
    setResult(null);
    setConfirmItem(null);

    const needsPet = ["skill", "evolution", "gacha"].includes(item.category);
    if (needsPet && !selectedPet) {
      setResult({ type: "error", text: "Select a pet first! Adopt one in My Pet." });
      return;
    }

    setPurchasing(item.key);
    if (item.category === "gacha") setGachaAnimation(true);

    try {
      let txHash: string | undefined;
      if (payMethod === "usdt") {
        const r = await directPay.pay(item.priceUSD);
        if ("error" in r) throw new Error(r.error);
        txHash = r.hash;
      }
      const res = await api.shop.purchasePremium(
        item.key, selectedPet?.id, payMethod, extra?.skill_key, extra?.element, txHash
      );

      let text = `${item.emoji} ${item.name} purchased!`;
      if (res.skill_learned) text = `${res.skill_learned.emoji} Learned ${res.skill_learned.name}! (${"★".repeat(res.skill_learned.rarity)})`;
      if (res.skill_upgraded) text = `Skill upgraded to ★${res.skill_upgraded.new_level}!`;
      if (res.new_element) text = `Element changed to ${res.new_element}!`;
      if (res.new_evolution_stage) text = `Evolved to stage ${res.new_evolution_stage}!`;
      if (res.gacha_result) {
        const r = res.reward;
        if (r?.type === "skill") text = `${res.gacha_result === "legendary" ? "LEGENDARY" : "EPIC"}! Got ${r.emoji} ${r.name} (${"★".repeat(r.rarity)})`;
        else if (r?.type === "credits") text = `Got ${r.amount} credits!`;
        else if (r?.type === "item") text = `Got ${r.name}!`;
      }

      setResult({ type: "success", text, detail: res });
      if (res.credits_spent) setBalance(prev => prev !== null ? prev - res.credits_spent : prev);
    } catch (err: any) {
      setResult({ type: "error", text: err.message || "Purchase failed" });
    }

    setPurchasing(null);
    if (item.category === "gacha") setTimeout(() => setGachaAnimation(false), 500);
  };

  const filtered = category === "all" ? PREMIUM_ITEMS : PREMIUM_ITEMS.filter(i => i.category === category);
  const featured = PREMIUM_ITEMS.find(i => i.rarity === "legendary") || PREMIUM_ITEMS[0];

  // Item badges
  const getBadge = (item: PremiumItem) => {
    if (item.rarity === "legendary") return { text: "HOT", color: "#f87171", bg: "rgba(248,113,113,0.15)" };
    if (item.category === "gacha") return { text: "NEW", color: "#4ade80", bg: "rgba(74,222,128,0.15)" };
    if (item.priceCredits && item.priceCredits > 2000) return { text: "LIMITED", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" };
    return null;
  };

  return (
    <div style={{
      padding: "40px", maxWidth: 1000, margin: "0 auto", paddingTop: 100,
      minHeight: "100vh",
      background: "linear-gradient(180deg, #08081a 0%, #0c0c24 30%, #121230 60%, #1a1a38 100%)",
    }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @keyframes gachaShake { 0%,100% { transform: rotate(0deg) } 25% { transform: rotate(-5deg) scale(1.1) } 75% { transform: rotate(5deg) scale(1.1) } }
        @keyframes gachaSpin { 0% { transform: rotateY(0deg) } 100% { transform: rotateY(1080deg) } }
        @keyframes resultPop { 0% { transform: scale(0.8); opacity: 0 } 60% { transform: scale(1.05) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes glowPulse { 0%,100% { box-shadow: 0 0 8px var(--glow) } 50% { box-shadow: 0 0 24px var(--glow) } }
        @keyframes legendaryGlow { 0%,100% { border-color: rgba(245,158,11,0.2) } 50% { border-color: rgba(245,158,11,0.5) } }
        @keyframes epicPulse { 0%,100% { border-color: rgba(192,132,252,0.15) } 50% { border-color: rgba(192,132,252,0.4) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes goldShimmer { 0% { background-position: -300% 0 } 100% { background-position: 300% 0 } }
        @keyframes particleFloat { 0%,100% { transform: translateY(0) rotate(0deg); opacity:0.6 } 50% { transform: translateY(-12px) rotate(180deg); opacity:1 } }
        @keyframes spotlightPulse { 0%,100% { box-shadow: 0 0 40px rgba(245,158,11,0.15), 0 0 80px rgba(245,158,11,0.05) } 50% { box-shadow: 0 0 60px rgba(245,158,11,0.25), 0 0 120px rgba(245,158,11,0.1) } }
        @keyframes pillSelect { from { transform:scaleX(0) } to { transform:scaleX(1) } }
        @keyframes modalFadeIn { from { opacity:0; backdrop-filter:blur(0px) } to { opacity:1; backdrop-filter:blur(12px) } }
        @keyframes modalSlideUp { from { opacity:0; transform:translateY(20px) scale(0.95) } to { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes badgePop { 0%,100% { transform: scale(1) } 50% { transform: scale(1.08) } }
        @keyframes coinSpin { 0% { transform: rotateY(0) } 100% { transform: rotateY(360deg) } }
      `}</style>

      {/* Purchase Confirmation Modal */}
      {confirmItem && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "modalFadeIn 0.3s ease-out",
          backdropFilter: "blur(12px)",
        }} onClick={() => setConfirmItem(null)}>
          <div style={{
            background: "linear-gradient(145deg, rgba(20,20,50,0.98), rgba(15,15,40,0.98))",
            borderRadius: 20, padding: "32px",
            border: "1px solid rgba(245,158,11,0.2)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
            maxWidth: 400, width: "90%",
            animation: "modalSlideUp 0.3s ease-out",
            backdropFilter: "blur(24px)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{
                width: 72, height: 72, borderRadius: 18,
                margin: "0 auto 16px",
                background: `linear-gradient(135deg, ${(RARITY_COLORS[confirmItem.rarity] || RARITY_COLORS.common).text}15, ${(RARITY_COLORS[confirmItem.rarity] || RARITY_COLORS.common).text}05)`,
                border: `1.5px solid ${(RARITY_COLORS[confirmItem.rarity] || RARITY_COLORS.common).text}25`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name={SHOP_ICONS[confirmItem.effect] || "gift"} size={36} />
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 4 }}>
                {confirmItem.name}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
                {confirmItem.description}
              </div>

              {/* Pricing toggle */}
              <div style={{
                display: "flex", gap: 8, justifyContent: "center", marginBottom: 20,
              }}>
                {confirmItem.priceCredits && (
                  <button onClick={() => setPayMethod("credits")} style={{
                    padding: "10px 20px", borderRadius: 12,
                    background: payMethod === "credits" ? "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.08))" : "rgba(255,255,255,0.03)",
                    border: payMethod === "credits" ? "1.5px solid rgba(245,158,11,0.35)" : "1.5px solid rgba(255,255,255,0.06)",
                    color: payMethod === "credits" ? "#f59e0b" : "rgba(255,255,255,0.3)",
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 800,
                    cursor: "pointer", transition: "all 0.25s",
                  }}>
                    <Icon name="coin" size={14} /> {confirmItem.priceCredits?.toLocaleString()}
                  </button>
                )}
                <button onClick={() => setPayMethod("usdt")} style={{
                  padding: "10px 20px", borderRadius: 12,
                  background: payMethod === "usdt" ? "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.08))" : "rgba(255,255,255,0.03)",
                  border: payMethod === "usdt" ? "1.5px solid rgba(139,92,246,0.35)" : "1.5px solid rgba(255,255,255,0.06)",
                  color: payMethod === "usdt" ? "#a78bfa" : "rgba(255,255,255,0.3)",
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 800,
                  cursor: "pointer", transition: "all 0.25s",
                }}>
                  ${confirmItem.priceUSD} USDT
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmItem(null)} style={{
                flex: 1, padding: "12px", borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.4)",
                fontFamily: "monospace", fontSize: 12, fontWeight: 600,
                cursor: "pointer", transition: "all 0.2s",
              }}>
                Cancel
              </button>
              <button onClick={() => handlePurchase(confirmItem)} style={{
                flex: 2, padding: "12px", borderRadius: 12,
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                border: "none",
                color: "#fff",
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(245,158,11,0.3)",
                transition: "all 0.2s",
              }}>
                Confirm Purchase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 800,
            marginBottom: 6,
            background: "linear-gradient(135deg, #f59e0b, #fbbf24, #f59e0b)",
            backgroundSize: "300% 100%",
            animation: "goldShimmer 4s linear infinite",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Premium Shop
          </h2>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            Power up your pet with USDT or credits
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {pets.length > 0 && (
            <select
              value={selectedPet?.id || ""}
              onChange={e => setSelectedPet(pets.find((p: any) => p.id === Number(e.target.value)))}
              style={{
                padding: "8px 14px", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "monospace", fontSize: 12, color: "#fff",
                background: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(8px)",
                cursor: "pointer",
              }}
            >
              {pets.map((p: any) => (
                <option key={p.id} value={p.id} style={{ background: "#1a1a2e", color: "#fff" }}>
                  {p.name} (Lv.{p.level})
                </option>
              ))}
            </select>
          )}
          {balance !== null && (
            <span style={{
              fontFamily: "monospace", fontSize: 13, color: "#f59e0b", fontWeight: 700,
              padding: "8px 18px", borderRadius: 12,
              background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))",
              border: "1px solid rgba(245,158,11,0.2)",
              backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ animation: purchasing ? "coinSpin 0.6s ease" : "none", display: "inline-block" }}><Icon name="coin" size={14} /></span>
              {balance?.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Featured item spotlight */}
      {category === "all" && featured && (
        <div style={{
          marginBottom: 28,
          background: "linear-gradient(145deg, rgba(245,158,11,0.06) 0%, rgba(139,92,246,0.04) 50%, rgba(245,158,11,0.03) 100%)",
          borderRadius: 20,
          border: "1.5px solid rgba(245,158,11,0.15)",
          padding: "32px",
          position: "relative",
          overflow: "hidden",
          animation: "spotlightPulse 4s ease-in-out infinite",
          backdropFilter: "blur(12px)",
        }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(245,158,11,0.35)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(245,158,11,0.15)";
          }}
        >
          {/* Particle effects for legendary */}
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              position: "absolute",
              width: 4, height: 4, borderRadius: "50%",
              background: "#f59e0b",
              opacity: 0.3,
              left: `${15 + i * 14}%`,
              top: `${20 + (i % 3) * 25}%`,
              animation: `particleFloat ${2 + i * 0.3}s ease-in-out ${i * 0.4}s infinite`,
            }} />
          ))}

          {/* Shimmer overlay */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.04) 25%, rgba(245,158,11,0.08) 50%, rgba(245,158,11,0.04) 75%, transparent 100%)",
            backgroundSize: "300% 100%",
            animation: "goldShimmer 5s linear infinite",
            pointerEvents: "none", borderRadius: 20,
          }} />

          <div style={{ display: "flex", alignItems: "center", gap: 24, position: "relative", zIndex: 1 }}>
            <div style={{
              width: 88, height: 88, borderRadius: 22,
              background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))",
              border: "2px solid rgba(245,158,11,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 0 30px rgba(245,158,11,0.15)",
            }}>
              <Icon name={SHOP_ICONS[featured.effect] || "gift"} size={48} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{
                  fontFamily: "monospace", fontSize: 8, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.15em",
                  padding: "3px 10px", borderRadius: 6,
                  background: "rgba(245,158,11,0.15)",
                  color: "#f59e0b",
                  border: "1px solid rgba(245,158,11,0.25)",
                }}>
                  FEATURED
                </span>
                <span style={{
                  fontFamily: "monospace", fontSize: 8, fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "3px 10px", borderRadius: 6,
                  color: (RARITY_COLORS[featured.rarity] || RARITY_COLORS.common).text,
                  background: `${(RARITY_COLORS[featured.rarity] || RARITY_COLORS.common).text}12`,
                  border: `1px solid ${(RARITY_COLORS[featured.rarity] || RARITY_COLORS.common).text}25`,
                }}>
                  {featured.rarity}
                </span>
              </div>
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 800,
                color: "#fff", marginBottom: 4,
              }}>
                {featured.name}
              </div>
              <div style={{
                fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.4)",
                marginBottom: 12, lineHeight: 1.6,
              }}>
                {featured.description}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 800,
                  color: "#f59e0b",
                }}>
                  ${featured.priceUSD.toFixed(featured.priceUSD < 1 ? 2 : 0)}
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 400, marginLeft: 4 }}>USDT</span>
                </div>
                {featured.priceCredits && (
                  <span style={{
                    fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.3)",
                  }}>
                    or <Icon name="coin" size={14} /> {featured.priceCredits.toLocaleString()}
                  </span>
                )}
                <button
                  onClick={() => setConfirmItem(featured)}
                  style={{
                    marginLeft: "auto",
                    padding: "10px 28px", borderRadius: 12, border: "none",
                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                    color: "#fff",
                    fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 4px 20px rgba(245,158,11,0.3)",
                    transition: "all 0.25s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "scale(1.05)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 30px rgba(245,158,11,0.4)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(245,158,11,0.3)";
                  }}
                >
                  Buy Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Result message */}
      {result && (
        <div style={{
          marginBottom: 18, padding: "14px 20px", borderRadius: 14,
          background: result.type === "success"
            ? "linear-gradient(135deg, rgba(74,222,128,0.1), rgba(74,222,128,0.03))"
            : "linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.03))",
          border: result.type === "success" ? "1px solid rgba(74,222,128,0.2)" : "1px solid rgba(239,68,68,0.2)",
          fontFamily: "monospace", fontSize: 13, fontWeight: 600,
          color: result.type === "success" ? "#4ade80" : "#f87171",
          animation: "resultPop 0.3s ease-out",
          backdropFilter: "blur(8px)",
        }}>
          {result.text}
        </div>
      )}

      {/* Category pills with selection animation */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap",
      }}>
        {Object.entries(CATEGORY_LABELS).map(([key, { label, emoji }]) => (
          <button key={key} onClick={() => setCategory(key)} style={{
            background: category === key
              ? "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.06))"
              : "rgba(255,255,255,0.03)",
            border: category === key
              ? "1.5px solid rgba(245,158,11,0.3)"
              : "1.5px solid rgba(255,255,255,0.06)",
            borderRadius: 20, padding: "8px 18px", cursor: "pointer",
            fontFamily: "monospace", fontSize: 11,
            fontWeight: category === key ? 700 : 500,
            color: category === key ? "#f59e0b" : "rgba(255,255,255,0.3)",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            whiteSpace: "nowrap",
            backdropFilter: "blur(8px)",
            position: "relative",
            overflow: "hidden",
          }}
            onMouseEnter={(e) => {
              if (category !== key) {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)";
              }
            }}
            onMouseLeave={(e) => {
              if (category !== key) {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.3)";
              }
            }}
          >
            <Icon name={CATEGORY_ICONS[key] || "shop"} size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Items grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18,
        animation: "fadeUp 0.3s ease-out",
      }}>
        {filtered.map((item) => {
          const rc = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
          const isGacha = item.category === "gacha";
          const isLegendary = item.rarity === "legendary";
          const isEpic = item.rarity === "epic";
          const badge = getBadge(item);

          return (
            <div key={item.key} style={{
              background: `linear-gradient(145deg, ${rc.bg}, rgba(255,255,255,0.01))`,
              borderRadius: 18,
              border: `1.5px solid ${rc.border}`,
              padding: "26px 22px",
              position: "relative",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              // @ts-ignore
              "--glow": rc.glow,
              animation: isLegendary ? "legendaryGlow 2.5s ease-in-out infinite" : isEpic ? "epicPulse 3s ease-in-out infinite" : undefined,
              backdropFilter: "blur(12px)",
              overflow: "hidden",
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-6px) scale(1.01)";
                (e.currentTarget as HTMLElement).style.boxShadow = `0 16px 48px ${rc.glow}, 0 0 20px ${rc.glow}`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "";
              }}
            >
              {/* Animated shimmer for premium items */}
              <div style={{
                position: "absolute", inset: 0,
                background: isLegendary
                  ? "linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.06) 25%, rgba(251,191,36,0.12) 50%, rgba(251,191,36,0.06) 75%, transparent 100%)"
                  : isEpic
                    ? "linear-gradient(90deg, transparent 0%, rgba(192,132,252,0.04) 25%, rgba(192,132,252,0.08) 50%, rgba(192,132,252,0.04) 75%, transparent 100%)"
                    : "none",
                backgroundSize: "200% 100%",
                animation: (isLegendary || isEpic) ? "shimmer 3s linear infinite" : "none",
                pointerEvents: "none", borderRadius: 18,
              }} />

              {/* Particle effects for legendary */}
              {isLegendary && (
                <>
                  {[...Array(4)].map((_, i) => (
                    <div key={i} style={{
                      position: "absolute",
                      width: 3, height: 3, borderRadius: "50%",
                      background: "#fbbf24",
                      left: `${20 + i * 20}%`,
                      top: `${15 + (i % 2) * 50}%`,
                      animation: `particleFloat ${2 + i * 0.5}s ease-in-out ${i * 0.3}s infinite`,
                      pointerEvents: "none",
                    }} />
                  ))}
                </>
              )}

              {/* Rarity badge */}
              <div style={{
                position: "absolute", top: 14, right: 14,
                display: "flex", gap: 6, alignItems: "center",
              }}>
                {badge && (
                  <span style={{
                    fontFamily: "monospace", fontSize: 8, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.1em",
                    padding: "3px 8px", borderRadius: 6,
                    color: badge.color, background: badge.bg,
                    border: `1px solid ${badge.color}30`,
                    animation: "badgePop 2s ease-in-out infinite",
                  }}>
                    {badge.text}
                  </span>
                )}
                <span style={{
                  fontFamily: "monospace", fontSize: 8, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  padding: "3px 10px", borderRadius: 6,
                  color: rc.text, background: `${rc.text}10`,
                  border: `1px solid ${rc.text}20`,
                }}>
                  {item.rarity}
                </span>
              </div>

              {/* Emoji + name */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, position: "relative" }}>
                <div style={{
                  width: 54, height: 54, borderRadius: 14,
                  background: `linear-gradient(135deg, ${rc.text}12, ${rc.text}05)`,
                  border: `1.5px solid ${rc.text}20`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  animation: isGacha && purchasing === item.key ? "gachaShake 0.3s ease infinite" : undefined,
                  boxShadow: isLegendary ? `0 0 16px ${rc.text}20` : "none",
                }}>
                  <Icon name={SHOP_ICONS[item.effect] || "gift"} size={48} />
                </div>
                <div>
                  <div style={{
                    fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700,
                    color: "#fff",
                  }}>
                    {item.name}
                  </div>
                  {item.duration && (
                    <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                      Duration: {item.duration}h
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div style={{
                fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)",
                lineHeight: 1.7, marginBottom: 16, position: "relative",
              }}>
                {item.description}
              </div>

              {/* Price + Buy */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
                <div>
                  <div style={{
                    fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 800,
                    color: "#fff",
                  }}>
                    ${item.priceUSD.toFixed(item.priceUSD < 1 ? 2 : 0)}
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 400, marginLeft: 4 }}>USDT</span>
                  </div>
                  {item.priceCredits && (
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                      or <Icon name="coin" size={14} /> {item.priceCredits.toLocaleString()} credits
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  {/* Credits buy */}
                  {item.priceCredits && (
                    <button
                      onClick={() => setConfirmItem(item)}
                      disabled={purchasing === item.key || (balance !== null && balance < (item.priceCredits || 0))}
                      style={{
                        padding: "9px 18px", borderRadius: 12, border: "none", cursor: "pointer",
                        background: balance !== null && balance >= (item.priceCredits || 0)
                          ? "linear-gradient(135deg, #f59e0b, #d97706)"
                          : "rgba(255,255,255,0.03)",
                        color: balance !== null && balance >= (item.priceCredits || 0) ? "#fff" : "rgba(255,255,255,0.2)",
                        fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                        transition: "all 0.25s",
                        boxShadow: balance !== null && balance >= (item.priceCredits || 0)
                          ? "0 3px 16px rgba(245,158,11,0.25)"
                          : "none",
                      }}
                    >
                      {purchasing === item.key ? "..." : <><Icon name="coin" size={14} /> {item.priceCredits}</>}
                    </button>
                  )}
                  {/* USDT buy */}
                  <button
                    onClick={() => {
                      setConfirmItem(item);
                      setPayMethod("usdt");
                    }}
                    style={{
                      padding: "9px 18px", borderRadius: 12,
                      border: `1.5px solid ${rc.text}30`,
                      background: `${rc.text}06`, cursor: "pointer",
                      color: rc.text, fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                      transition: "all 0.25s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${rc.text}12`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${rc.text}06`; }}
                  >
                    ${item.priceUSD} USDT
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

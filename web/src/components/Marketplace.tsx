"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

const RARITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  common: { bg: "rgba(0,0,0,0.03)", border: "rgba(0,0,0,0.08)", text: "rgba(26,26,46,0.5)" },
  uncommon: { bg: "rgba(74,222,128,0.06)", border: "rgba(74,222,128,0.2)", text: "#16a34a" },
  rare: { bg: "rgba(96,165,250,0.06)", border: "rgba(96,165,250,0.2)", text: "#2563eb" },
  epic: { bg: "rgba(192,132,252,0.06)", border: "rgba(192,132,252,0.2)", text: "#7c3aed" },
  legendary: { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.25)", text: "#b45309" },
};

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "consumable", label: "Consumables" },
  { key: "equipment", label: "Equipment" },
  { key: "accessory", label: "Accessories" },
  { key: "furniture", label: "Furniture" },
  { key: "cosmetic", label: "Cosmetics" },
];

export default function Marketplace() {
  const [items, setItems] = useState<any[]>([]);
  const [pets, setPets] = useState<any[]>([]);
  const [selectedPet, setSelectedPet] = useState<any>(null);
  const [category, setCategory] = useState("all");
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [shopItems, petList, bal] = await Promise.all([
        api.shop.list(),
        api.pets.list().then(d => d.pets || d).catch(() => []),
        api.credits.balance().catch(() => null),
      ]);
      setItems(shopItems);
      setPets(petList);
      if (petList.length > 0) setSelectedPet(petList[0]);
      if (bal) setBalance(bal.credits);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  const handlePurchase = async (item: any) => {
    setMessage(null);
    setPurchasing(item.key);
    try {
      const res = await api.shop.purchase(item.key, selectedPet?.id);
      setMessage({ type: "success", text: `Purchased ${item.name}! ${res.credits_remaining} $PET remaining.` });
      setBalance(res.credits_remaining);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Purchase failed" });
    }
    setPurchasing(null);
  };

  const filtered = category === "all" ? items : items.filter(i => i.category === category);

  if (loading) {
    return (
      <div style={{ padding: "140px 40px", textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, border: "2px solid rgba(245,158,11,0.2)",
          borderTopColor: "#f59e0b", borderRadius: "50%",
          animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ fontFamily: "mono", fontSize: 12, color: "rgba(26,26,46,0.35)" }}>Loading marketplace...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px", maxWidth: 960, margin: "0 auto", paddingTop: 100 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>
            Marketplace
          </h2>
          <p style={{ fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.4)" }}>
            Equip your pet with items, boosts, and cosmetics
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Pet selector */}
          {pets.length > 0 && (
            <select
              value={selectedPet?.id || ""}
              onChange={e => setSelectedPet(pets.find((p: any) => p.id === Number(e.target.value)))}
              style={{
                padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)",
                fontFamily: "mono", fontSize: 12, color: "#1a1a2e", background: "white",
                cursor: "pointer",
              }}
            >
              {pets.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} (Lv.{p.level})</option>
              ))}
            </select>
          )}
          {balance !== null && (
            <span style={{
              fontFamily: "mono", fontSize: 12, color: "#b45309", fontWeight: 600,
              padding: "8px 14px", borderRadius: 10,
              background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)",
            }}>
              🪙 {balance} $PET
            </span>
          )}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          marginBottom: 16, padding: "10px 16px", borderRadius: 10,
          background: message.type === "success" ? "rgba(22,163,74,0.06)" : "rgba(239,68,68,0.06)",
          border: message.type === "success" ? "1px solid rgba(22,163,74,0.15)" : "1px solid rgba(239,68,68,0.15)",
          fontFamily: "mono", fontSize: 11,
          color: message.type === "success" ? "#16a34a" : "#dc2626",
          animation: "slideIn 0.3s ease-out",
        }}>
          {message.text}
        </div>
      )}

      {/* Category filter */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20, padding: 3, borderRadius: 12,
        background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)",
        width: "fit-content",
      }}>
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setCategory(c.key)} style={{
            background: category === c.key ? "rgba(251,191,36,0.12)" : "transparent",
            border: "none", borderRadius: 9, padding: "7px 14px", cursor: "pointer",
            fontFamily: "mono", fontSize: 11, fontWeight: 500,
            color: category === c.key ? "#b45309" : "rgba(26,26,46,0.4)",
            transition: "all 0.2s",
          }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Items grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {filtered.map((item: any) => {
          const rarity = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
          return (
            <div key={item.key} style={{
              background: rarity.bg, borderRadius: 16,
              border: `1px solid ${rarity.border}`, padding: "22px 18px",
              position: "relative", transition: "all 0.2s",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            }}>
              {/* Rarity badge */}
              <div style={{
                position: "absolute", top: 10, right: 10,
                fontFamily: "mono", fontSize: 8, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.08em",
                padding: "2px 8px", borderRadius: 6,
                color: rarity.text, background: `${rarity.text}12`,
                border: `1px solid ${rarity.text}20`,
              }}>
                {item.rarity}
              </div>

              <div style={{ fontSize: 36, marginBottom: 10 }}>{item.icon}</div>
              <div style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600,
                color: "#1a1a2e", marginBottom: 4,
              }}>
                {item.name}
              </div>
              <div style={{
                fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.45)",
                marginBottom: 10, lineHeight: 1.6,
              }}>
                {item.description}
              </div>

              {/* Stat bonuses */}
              {item.stat_bonus && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
                  {Object.entries(item.stat_bonus as Record<string, number>).map(([k, v]) => (
                    <span key={k} style={{
                      fontFamily: "mono", fontSize: 9, padding: "2px 6px", borderRadius: 6,
                      background: Number(v) > 0 ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                      color: Number(v) > 0 ? "#16a34a" : "#dc2626",
                      border: Number(v) > 0 ? "1px solid rgba(74,222,128,0.2)" : "1px solid rgba(248,113,113,0.2)",
                    }}>
                      {k} {Number(v) > 0 ? "+" : ""}{v}
                    </span>
                  ))}
                </div>
              )}

              {/* Category + Price */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{
                  fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.35)",
                  textTransform: "uppercase",
                }}>
                  {item.category}
                </span>
                <span style={{
                  fontFamily: "mono", fontSize: 12, color: "#b45309", fontWeight: 700,
                }}>
                  🪙 {item.price}
                </span>
              </div>

              <button
                onClick={() => handlePurchase(item)}
                disabled={purchasing === item.key || (balance !== null && balance < item.price)}
                style={{
                  width: "100%", marginTop: 12, padding: "10px",
                  borderRadius: 10, border: "none", cursor: purchasing === item.key ? "wait" : "pointer",
                  background: balance !== null && balance < item.price
                    ? "rgba(0,0,0,0.04)"
                    : "linear-gradient(135deg,#f59e0b,#d97706)",
                  color: balance !== null && balance < item.price
                    ? "rgba(26,26,46,0.3)"
                    : "white",
                  fontFamily: "mono", fontSize: 11, fontWeight: 600,
                  transition: "all 0.2s",
                  boxShadow: balance !== null && balance >= item.price
                    ? "0 0 16px rgba(245,158,11,0.15)"
                    : "none",
                }}
              >
                {purchasing === item.key ? "Purchasing..." : balance !== null && balance < item.price ? "Not enough $PET" : "Buy"}
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.35)" }}>
          No items in this category
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { SKILL_DB, ELEMENTS, SKILL_MAP, getSkillUpgradeCost, type Element } from "@/lib/skills";
import Icon from "@/components/Icon";

const RARITY_COLORS: Record<string, { bg: string; border: string; text: string; glow: string; shimmer: string }> = {
  common: { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.4)", glow: "rgba(255,255,255,0.05)", shimmer: "rgba(255,255,255,0.03)" },
  uncommon: { bg: "rgba(74,222,128,0.04)", border: "rgba(74,222,128,0.15)", text: "#4ade80", glow: "rgba(74,222,128,0.1)", shimmer: "rgba(74,222,128,0.06)" },
  rare: { bg: "rgba(96,165,250,0.04)", border: "rgba(96,165,250,0.15)", text: "#60a5fa", glow: "rgba(96,165,250,0.15)", shimmer: "rgba(96,165,250,0.08)" },
  epic: { bg: "rgba(192,132,252,0.04)", border: "rgba(192,132,252,0.15)", text: "#c084fc", glow: "rgba(192,132,252,0.2)", shimmer: "rgba(192,132,252,0.08)" },
  legendary: { bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.2)", text: "#fbbf24", glow: "rgba(251,191,36,0.25)", shimmer: "rgba(251,191,36,0.1)" },
};

const CATEGORIES = [
  { key: "all", label: "All Items", emoji: "" },
  { key: "skills", label: "Skills", emoji: "" },
  { key: "consumable", label: "Consumables", emoji: "" },
  { key: "equipment", label: "Equipment", emoji: "" },
  { key: "accessory", label: "Accessories", emoji: "" },
  { key: "furniture", label: "Furniture", emoji: "" },
  { key: "cosmetic", label: "Cosmetics", emoji: "" },
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
  const [petSkills, setPetSkills] = useState<any[]>([]);
  const [skillMessage, setSkillMessage] = useState<string | null>(null);
  const [purchaseAnim, setPurchaseAnim] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedPet && category === "skills") {
      loadPetSkills(selectedPet.id);
    }
  }, [selectedPet, category]);

  const loadPetSkills = async (petId: number) => {
    try {
      const data = await api.skills.get(petId);
      setPetSkills(data.skills || []);
    } catch {
      setPetSkills([]);
    }
  };

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

  const handleLearnSkill = async (skillKey: string) => {
    if (!selectedPet) return;
    setSkillMessage(null);
    try {
      const res = await api.skills.learn(selectedPet.id, skillKey);
      setSkillMessage(`Learned ${SKILL_MAP[skillKey]?.name}! ${res.credits_spent} credits spent.`);
      setBalance((prev: number | null) => prev !== null ? prev - (res.credits_spent || 0) : prev);
      await loadPetSkills(selectedPet.id);
    } catch (err: any) {
      setSkillMessage(err.message || "Failed to learn skill");
    }
  };

  const handleUpgradeSkill = async (skillKey: string) => {
    if (!selectedPet) return;
    setSkillMessage(null);
    try {
      const res = await api.skills.upgrade(selectedPet.id, skillKey);
      setSkillMessage(`${SKILL_MAP[skillKey]?.name} upgraded to Lv.${res.new_level}!`);
      setBalance((prev: number | null) => prev !== null ? prev - (res.credits_spent || 0) : prev);
      await loadPetSkills(selectedPet.id);
    } catch (err: any) {
      setSkillMessage(err.message || "Failed to upgrade skill");
    }
  };

  const handleEquipSkill = async (skillKey: string, slot?: number) => {
    if (!selectedPet) return;
    try {
      await api.skills.equip(selectedPet.id, skillKey, slot);
      await loadPetSkills(selectedPet.id);
    } catch {}
  };

  const handleUnequipSkill = async (skillKey: string) => {
    if (!selectedPet) return;
    try {
      await api.skills.unequip(selectedPet.id, skillKey);
      await loadPetSkills(selectedPet.id);
    } catch {}
  };

  const handlePurchase = async (item: any) => {
    setMessage(null);
    setPurchasing(item.key);
    setPurchaseAnim(item.key);
    try {
      const res = await api.shop.purchase(item.key, selectedPet?.id);
      setMessage({ type: "success", text: `Purchased ${item.name}! ${res.credits_remaining} $PET remaining.` });
      setBalance(res.credits_remaining);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Purchase failed" });
    }
    setPurchasing(null);
    setTimeout(() => setPurchaseAnim(null), 600);
  };

  const filtered = category === "all" ? items : items.filter(i => i.category === category);

  if (loading) {
    return (
      <div style={{
        padding: "140px 40px", textAlign: "center",
        background: "linear-gradient(180deg, #0a0a1a, #1a1a2e)",
        minHeight: "100vh",
      }}>
        <div style={{
          width: 44, height: 44, border: "3px solid rgba(245,158,11,0.15)",
          borderTopColor: "#f59e0b", borderRadius: "50%",
          animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Loading marketplace...</div>
      </div>
    );
  }

  return (
    <div style={{
      padding: "40px", maxWidth: 1000, margin: "0 auto", paddingTop: 100,
      minHeight: "100vh",
      background: "linear-gradient(180deg, #0a0a1a 0%, #0f0f2e 50%, #1a1a2e 100%)",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes slideIn { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes rarityPulse { 0%,100% { box-shadow: 0 0 8px var(--rarity-glow) } 50% { box-shadow: 0 0 20px var(--rarity-glow) } }
        @keyframes legendaryShimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @keyframes coinFlip { 0% { transform: rotateY(0deg) scale(1) } 50% { transform: rotateY(180deg) scale(1.2) } 100% { transform: rotateY(360deg) scale(1) } }
        @keyframes itemBounce { 0% { transform: scale(1) } 30% { transform: scale(1.15) translateY(-4px) } 60% { transform: scale(0.95) } 100% { transform: scale(1) } }
        @keyframes tabUnderline { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        @keyframes coinPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.08) } }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h2 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 800,
            marginBottom: 6,
            background: "linear-gradient(135deg, #f59e0b, #fbbf24, #f59e0b)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Marketplace
          </h2>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            Equip your pet with items, boosts, and cosmetics
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* Pet selector */}
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
              padding: "8px 16px", borderRadius: 12,
              background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.05))",
              border: "1px solid rgba(245,158,11,0.2)",
              display: "flex", alignItems: "center", gap: 6,
              backdropFilter: "blur(8px)",
              animation: "coinPulse 3s ease infinite",
            }}>
              <span style={{ animation: purchaseAnim ? "coinFlip 0.6s ease" : "none", display: "inline-flex" }}><Icon name="coin" size={14} /></span>
              {balance} $PET
            </span>
          )}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          marginBottom: 16, padding: "12px 18px", borderRadius: 12,
          background: message.type === "success"
            ? "linear-gradient(135deg, rgba(74,222,128,0.1), rgba(74,222,128,0.03))"
            : "linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.03))",
          border: message.type === "success" ? "1px solid rgba(74,222,128,0.2)" : "1px solid rgba(239,68,68,0.2)",
          fontFamily: "monospace", fontSize: 12,
          color: message.type === "success" ? "#4ade80" : "#f87171",
          animation: "slideIn 0.3s ease-out",
          backdropFilter: "blur(8px)",
        }}>
          {message.text}
        </div>
      )}

      {/* Category tabs with underline transition */}
      <div style={{
        display: "flex", gap: 2, marginBottom: 24, padding: 4, borderRadius: 14,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
        width: "fit-content",
        backdropFilter: "blur(8px)",
      }}>
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setCategory(c.key)} style={{
            background: category === c.key ? "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))" : "transparent",
            border: category === c.key ? "1px solid rgba(245,158,11,0.2)" : "1px solid transparent",
            borderRadius: 10, padding: "8px 16px", cursor: "pointer",
            fontFamily: "monospace", fontSize: 11, fontWeight: category === c.key ? 700 : 500,
            color: category === c.key ? "#f59e0b" : "rgba(255,255,255,0.3)",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            position: "relative",
          }}>
            {c.label}
            {/* Active underline indicator */}
            {category === c.key && (
              <div style={{
                position: "absolute", bottom: 2, left: "20%", right: "20%", height: 2,
                background: "#f59e0b", borderRadius: 1,
                animation: "tabUnderline 0.25s ease-out",
                transformOrigin: "center",
              }} />
            )}
          </button>
        ))}
      </div>

      {/* ═══ Skill Shop Tab ═══ */}
      {category === "skills" && selectedPet && (
        <div style={{ marginBottom: 24, animation: "fadeUp 0.3s ease-out" }}>
          {skillMessage && (
            <div style={{
              marginBottom: 16, padding: "12px 18px", borderRadius: 12,
              background: "linear-gradient(135deg, rgba(167,139,250,0.1), rgba(167,139,250,0.03))",
              border: "1px solid rgba(167,139,250,0.2)",
              fontFamily: "monospace", fontSize: 12, color: "#a78bfa",
              animation: "slideIn 0.3s ease-out",
              backdropFilter: "blur(8px)",
            }}>
              {skillMessage}
            </div>
          )}

          {/* Equipped Skills (4 RPG-style slots) */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)",
              marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em",
            }}>
              EQUIPPED SKILLS ({petSkills.filter((s: any) => s.slot !== null).length}/4)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[0, 1, 2, 3].map((slot) => {
                const equipped = petSkills.find((s: any) => s.slot === slot);
                const def = equipped?.def || (equipped ? SKILL_MAP[equipped.skill_key] : null);
                const el = def ? ELEMENTS[def.element as Element] || ELEMENTS.normal : null;
                return (
                  <div key={slot} style={{
                    padding: "16px 12px", borderRadius: 14, textAlign: "center",
                    background: def
                      ? `linear-gradient(145deg, ${el!.color}0a, rgba(255,255,255,0.02))`
                      : "rgba(255,255,255,0.02)",
                    border: def
                      ? `1.5px solid ${el!.color}25`
                      : "1.5px dashed rgba(255,255,255,0.06)",
                    minHeight: 110,
                    backdropFilter: "blur(8px)",
                    transition: "all 0.3s",
                    position: "relative",
                    overflow: "hidden",
                  }}>
                    {def ? (
                      <>
                        <div style={{ fontSize: 28, marginBottom: 6, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}>{def.emoji}</div>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700, color: "#fff" }}>
                          {def.name}
                        </div>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: el!.color, marginBottom: 6 }}>
                          {el!.emoji} {def.element} | {"★".repeat(equipped.level)}
                        </div>
                        <button onClick={() => handleUnequipSkill(equipped.skill_key)} style={{
                          fontFamily: "monospace", fontSize: 9, color: "#f87171",
                          background: "rgba(248,113,113,0.08)",
                          border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6,
                          padding: "3px 10px", cursor: "pointer",
                          transition: "all 0.2s",
                        }}>
                          Unequip
                        </button>
                      </>
                    ) : (
                      <div style={{
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        height: "100%", paddingTop: 16,
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10,
                          border: "1.5px dashed rgba(255,255,255,0.08)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          marginBottom: 8,
                        }}>
                          <span style={{ fontSize: 18, color: "rgba(255,255,255,0.12)" }}>+</span>
                        </div>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.15)" }}>
                          Slot {slot + 1}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Learned but not equipped */}
          {petSkills.filter((s: any) => s.slot === null).length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)",
                marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em",
              }}>
                LEARNED SKILLS (not equipped)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {petSkills.filter((s: any) => s.slot === null).map((s: any) => {
                  const def = s.def || SKILL_MAP[s.skill_key];
                  if (!def) return null;
                  const el = ELEMENTS[def.element as Element] || ELEMENTS.normal;
                  const upgradeCost = getSkillUpgradeCost(s.level, def.rarity);
                  const canUpgrade = s.level < def.maxLevel;
                  return (
                    <div key={s.skill_key} style={{
                      padding: "16px", borderRadius: 14,
                      background: `linear-gradient(145deg, ${el.color}08, rgba(255,255,255,0.02))`,
                      border: `1px solid ${el.color}18`,
                      backdropFilter: "blur(8px)",
                      transition: "all 0.3s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: `${el.color}10`,
                          border: `1px solid ${el.color}20`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <span style={{ fontSize: 22 }}>{def.emoji}</span>
                        </div>
                        <div>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>
                            {def.name}
                          </div>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: el.color }}>
                            {el.emoji} {"★".repeat(s.level)}{"☆".repeat(def.maxLevel - s.level)} | PWR {def.power}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleEquipSkill(s.skill_key)} style={{
                          flex: 1, padding: "7px", borderRadius: 8, border: "none", cursor: "pointer",
                          background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff",
                          fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                          boxShadow: "0 2px 10px rgba(245,158,11,0.2)",
                          transition: "all 0.2s",
                        }}>
                          Equip
                        </button>
                        {canUpgrade && (
                          <button onClick={() => handleUpgradeSkill(s.skill_key)} style={{
                            flex: 1, padding: "7px", borderRadius: 8, cursor: "pointer",
                            background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)",
                            color: "#a78bfa", fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                            transition: "all 0.2s",
                          }}>
                            Lv.{s.level + 1} ({upgradeCost}<Icon name="coin" size={10} />)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available to learn */}
          <div>
            <div style={{
              fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)",
              marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em",
            }}>
              SKILL SHOP -- Buy new skills for {selectedPet.name}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {SKILL_DB
                .filter((s) => {
                  const learned = petSkills.some((ps: any) => ps.skill_key === s.key);
                  return !learned && s.price && s.price > 0 && s.levelReq <= (selectedPet.level || 1) + 5;
                })
                .map((s) => {
                  const el = ELEMENTS[s.element as Element] || ELEMENTS.normal;
                  const canAfford = balance !== null && balance >= (s.price || 0);
                  const meetsLevel = (selectedPet.level || 1) >= s.levelReq;
                  return (
                    <div key={s.key} style={{
                      padding: "16px", borderRadius: 14,
                      background: `linear-gradient(145deg, ${el.color}08, rgba(255,255,255,0.02))`,
                      border: `1px solid ${el.color}15`,
                      opacity: meetsLevel ? 1 : 0.4,
                      backdropFilter: "blur(8px)",
                      transition: "all 0.3s",
                    }}
                      onMouseEnter={(e) => {
                        if (meetsLevel) {
                          (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
                          (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px ${el.color}15`;
                          (e.currentTarget as HTMLElement).style.borderColor = `${el.color}30`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "none";
                        (e.currentTarget as HTMLElement).style.borderColor = `${el.color}15`;
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 42, height: 42, borderRadius: 10,
                            background: `linear-gradient(135deg, ${el.color}15, ${el.color}05)`,
                            border: `1px solid ${el.color}20`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <span style={{ fontSize: 24 }}>{s.emoji}</span>
                          </div>
                          <div>
                            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>
                              {s.name}
                            </div>
                            <div style={{ fontFamily: "monospace", fontSize: 9, color: el.color }}>
                              {el.emoji} {s.element} | {"★".repeat(s.rarity)} | PWR {s.power}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{
                        fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.35)",
                        marginBottom: 10, lineHeight: 1.5,
                      }}>
                        {s.description}
                        {!meetsLevel && <span style={{ color: "#f87171" }}> (Req: Lv.{s.levelReq})</span>}
                      </div>
                      <button
                        onClick={() => handleLearnSkill(s.key)}
                        disabled={!canAfford || !meetsLevel}
                        style={{
                          width: "100%", padding: "9px", borderRadius: 10, border: "none",
                          cursor: canAfford && meetsLevel ? "pointer" : "not-allowed",
                          background: canAfford && meetsLevel
                            ? `linear-gradient(135deg, ${el.color}, ${el.color}cc)`
                            : "rgba(255,255,255,0.03)",
                          color: canAfford && meetsLevel ? "#fff" : "rgba(255,255,255,0.2)",
                          fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                          boxShadow: canAfford && meetsLevel ? `0 2px 12px ${el.color}30` : "none",
                          transition: "all 0.2s",
                        }}
                      >
                        Learn -- <Icon name="coin" size={12} /> {s.price}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Items grid */}
      {category !== "skills" && (
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16,
        animation: "fadeUp 0.3s ease-out",
      }}>
        {filtered.map((item: any) => {
          const rarity = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
          const isLegendary = item.rarity === "legendary";
          const isEpic = item.rarity === "epic";
          const isPurchasing = purchaseAnim === item.key;
          return (
            <div key={item.key} style={{
              background: `linear-gradient(145deg, ${rarity.bg}, rgba(255,255,255,0.01))`,
              borderRadius: 16,
              border: `1.5px solid ${rarity.border}`,
              padding: "24px 20px",
              position: "relative",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              backdropFilter: "blur(12px)",
              overflow: "hidden",
              // @ts-ignore
              "--rarity-glow": rarity.glow,
              animation: isLegendary ? "rarityPulse 2.5s ease-in-out infinite" : isEpic ? "rarityPulse 3s ease-in-out infinite" : undefined,
            } as any}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-6px) scale(1.02)";
                (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px ${rarity.glow}, 0 0 15px ${rarity.glow}`;
                (e.currentTarget as HTMLElement).style.borderColor = rarity.text;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1)";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
                (e.currentTarget as HTMLElement).style.borderColor = rarity.border;
              }}
            >
              {/* Legendary shimmer overlay */}
              {isLegendary && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.06) 25%, rgba(251,191,36,0.12) 50%, rgba(251,191,36,0.06) 75%, transparent 100%)",
                  backgroundSize: "200% 100%",
                  animation: "legendaryShimmer 3s linear infinite",
                  pointerEvents: "none", borderRadius: 16,
                }} />
              )}

              {/* Rarity badge */}
              <div style={{
                position: "absolute", top: 12, right: 12,
                fontFamily: "monospace", fontSize: 8, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.1em",
                padding: "3px 10px", borderRadius: 8,
                color: rarity.text, background: `${rarity.text}12`,
                border: `1px solid ${rarity.text}25`,
              }}>
                {item.rarity}
              </div>

              <div style={{
                fontSize: 40, marginBottom: 12,
                animation: isPurchasing ? "itemBounce 0.5s ease" : undefined,
                filter: isLegendary ? `drop-shadow(0 2px 8px ${rarity.glow})` : "none",
              }}>
                {item.icon}
              </div>
              <div style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
                color: "#fff", marginBottom: 6,
              }}>
                {item.name}
              </div>
              <div style={{
                fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.35)",
                marginBottom: 12, lineHeight: 1.6,
              }}>
                {item.description}
              </div>

              {/* Stat bonuses */}
              {item.stat_bonus && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
                  {Object.entries(item.stat_bonus as Record<string, number>).map(([k, v]) => (
                    <span key={k} style={{
                      fontFamily: "monospace", fontSize: 9, padding: "3px 8px", borderRadius: 6,
                      background: Number(v) > 0 ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
                      color: Number(v) > 0 ? "#4ade80" : "#f87171",
                      border: Number(v) > 0 ? "1px solid rgba(74,222,128,0.15)" : "1px solid rgba(248,113,113,0.15)",
                    }}>
                      {k} {Number(v) > 0 ? "+" : ""}{v}
                    </span>
                  ))}
                </div>
              )}

              {/* Category + Price */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{
                  fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.2)",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  {item.category}
                </span>
                <span style={{
                  fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: "#f59e0b", fontWeight: 800,
                }}>
                  <Icon name="coin" size={14} /> {item.price}
                </span>
              </div>

              <button
                onClick={() => handlePurchase(item)}
                disabled={purchasing === item.key || (balance !== null && balance < item.price)}
                style={{
                  width: "100%", marginTop: 14, padding: "11px",
                  borderRadius: 12, border: "none", cursor: purchasing === item.key ? "wait" : "pointer",
                  background: balance !== null && balance < item.price
                    ? "rgba(255,255,255,0.03)"
                    : "linear-gradient(135deg,#f59e0b,#d97706)",
                  color: balance !== null && balance < item.price
                    ? "rgba(255,255,255,0.2)"
                    : "white",
                  fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: balance !== null && balance >= item.price
                    ? "0 2px 16px rgba(245,158,11,0.25)"
                    : "none",
                }}
              >
                {purchasing === item.key ? "Purchasing..." : balance !== null && balance < item.price ? "Not enough $PET" : "Buy"}
              </button>
            </div>
          );
        })}
      </div>
      )}

      {category !== "skills" && filtered.length === 0 && (
        <div style={{
          textAlign: "center", padding: 80,
          fontFamily: "monospace", fontSize: 13, color: "rgba(255,255,255,0.25)",
        }}>
          No items in this category
        </div>
      )}
    </div>
  );
}

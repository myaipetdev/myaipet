"use client";

import { useState } from "react";

const SECTIONS = [
  { key: "overview", label: "Overview", icon: "📖" },
  { key: "raising", label: "Raising", icon: "🐣" },
  { key: "evolution", label: "Evolution", icon: "⭐" },
  { key: "arena", label: "Arena", icon: "⚔️" },
  { key: "items", label: "Items & Shop", icon: "🛒" },
  { key: "rewards", label: "Rewards", icon: "🎁" },
  { key: "economy", label: "$PET Economy", icon: "🪙" },
];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.8)", borderRadius: 18,
      border: "1px solid rgba(0,0,0,0.06)", padding: "24px 28px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)", marginBottom: 20,
    }}>
      <h3 style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700,
        color: "#1a1a2e", marginBottom: 16,
      }}>{title}</h3>
      {children}
    </div>
  );
}

function StatTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "mono", fontSize: 12 }}>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: "10px 12px",
                  color: j === 0 ? "#1a1a2e" : "rgba(26,26,46,0.6)",
                  fontWeight: j === 0 ? 600 : 400,
                  whiteSpace: j === 0 ? "nowrap" : "normal",
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 8,
      background: `${color}12`, color, border: `1px solid ${color}25`,
      fontFamily: "mono", fontSize: 11, fontWeight: 600, marginRight: 6, marginBottom: 4,
    }}>{children}</span>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.6)", lineHeight: 1.8, marginBottom: 14 }}>{children}</p>;
}

function OverviewSection() {
  return (
    <>
      <SectionCard title="🌍 What is MY AI PET?">
        <P>
          MY AI PET is a Web3 companion raising game where you adopt, raise, and battle AI-powered pets.
          Every interaction shapes your pet&apos;s personality, stats, and evolution path.
        </P>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 8 }}>
          {[
            { icon: "🐣", title: "Adopt", desc: "Create your unique AI pet with custom personality and appearance" },
            { icon: "❤️", title: "Raise", desc: "Feed, play, train — every interaction matters" },
            { icon: "⚔️", title: "Battle", desc: "Compete in the Arena for glory and $PET rewards" },
          ].map(item => (
            <div key={item.title} style={{
              padding: "16px", borderRadius: 14,
              background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.1)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{item.icon}</div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.5)", lineHeight: 1.6 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="🎮 Game Loop">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {["Adopt Pet", "→", "Interact Daily", "→", "Level Up", "→", "Evolve", "→", "Arena Battle", "→", "Earn $PET", "→", "Buy Items", "↩"].map((step, i) => (
            <span key={i} style={{
              fontFamily: "mono", fontSize: step === "→" || step === "↩" ? 14 : 11,
              fontWeight: step === "→" || step === "↩" ? 400 : 600,
              color: step === "→" || step === "↩" ? "#d97706" : "#1a1a2e",
              padding: step === "→" || step === "↩" ? "0" : "6px 14px",
              borderRadius: 8,
              background: step === "→" || step === "↩" ? "transparent" : "rgba(251,191,36,0.08)",
              border: step === "→" || step === "↩" ? "none" : "1px solid rgba(251,191,36,0.15)",
            }}>{step}</span>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

function RaisingSection() {
  return (
    <>
      <SectionCard title="🎯 Interactions">
        <P>You can interact with your pet 6 different ways. Each interaction affects stats differently.</P>
        <StatTable rows={[
          ["🍖 Feed", "Happiness +5, Energy +3, Hunger -25, EXP +5", "Best for reducing hunger"],
          ["⚽ Play", "Happiness +15, Energy -20, Hunger +10, EXP +10", "Best for happiness"],
          ["💬 Talk", "Happiness +8, Energy -3, Hunger +2, EXP +8", "Builds bond"],
          ["🤚 Pet", "Happiness +10, Energy +5, Hunger +2, EXP +5", "Gentle interaction"],
          ["🚶 Walk", "Happiness +12, Energy -15, Hunger +8, EXP +12", "Good all-rounder"],
          ["🎓 Train", "Happiness +3, Energy -25, Hunger +5, EXP +20", "Best for EXP!"],
        ]} />
      </SectionCard>

      <SectionCard title="📊 Stats Guide">
        <P>Your pet has 5 core stats. Keep them balanced for optimal growth!</P>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { icon: "💖", name: "Happiness", desc: "Affects mood and battle HP. Keep above 40 to avoid sadness.", color: "#f472b6" },
            { icon: "⚡", name: "Energy", desc: "Required for Play, Walk, Train. Recovers slowly over time.", color: "#60a5fa" },
            { icon: "🍖", name: "Hunger", desc: "Increases over time. Feed your pet before it reaches 80+!", color: "#fbbf24" },
            { icon: "🤝", name: "Bond", desc: "Deepens through Talk and Pet. Affects battle loyalty.", color: "#c084fc" },
            { icon: "✨", name: "EXP", desc: "100 EXP per level. Train gives the most EXP (+20).", color: "#4ade80" },
          ].map(s => (
            <div key={s.name} style={{
              padding: "12px 14px", borderRadius: 12,
              background: `${s.color}08`, border: `1px solid ${s.color}20`,
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{s.icon}</span>
              <div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: s.color }}>{s.name}</div>
                <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.5)", lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="💡 Pro Tips">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            "Train is the fastest way to level up — use Energy Drinks to keep training!",
            "Feed before hunger hits 80 to prevent mood drops.",
            "Talk and Pet cost almost no energy — great for when energy is low.",
            "Every interaction gives +1 Airdrop Point. Consistency matters!",
            "Level-up grants a bonus +50 Airdrop Points.",
          ].map((tip, i) => (
            <div key={i} style={{
              display: "flex", gap: 8, alignItems: "flex-start",
              fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.55)", lineHeight: 1.7,
            }}>
              <span style={{ color: "#f59e0b", fontWeight: 700, flexShrink: 0 }}>#{i + 1}</span>
              {tip}
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

function EvolutionSection() {
  return (
    <>
      <SectionCard title="🌟 Evolution Stages">
        <P>Your pet evolves through 5 stages. Each evolution unlocks new battle skills and grants 50 credits!</P>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { icon: "🥚", name: "Baby", lv: 1, skills: "—" },
            { icon: "🌱", name: "Young", lv: 5, skills: "Fetch, Sit" },
            { icon: "⭐", name: "Adult", lv: 10, skills: "Guard, Trick" },
            { icon: "👑", name: "Elder", lv: 20, skills: "Inspire, Heal" },
            { icon: "🔱", name: "Legendary", lv: 35, skills: "Transcend" },
          ].map((stage, i, arr) => (
            <div key={stage.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                textAlign: "center", padding: "14px 18px", borderRadius: 14,
                background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)",
                minWidth: 90,
              }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>{stage.icon}</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700, color: "#1a1a2e" }}>{stage.name}</div>
                <div style={{ fontFamily: "mono", fontSize: 9, color: "#b45309" }}>Lv.{stage.lv}+</div>
                <div style={{ fontFamily: "mono", fontSize: 8, color: "rgba(26,26,46,0.4)", marginTop: 4 }}>{stage.skills}</div>
              </div>
              {i < arr.length - 1 && <span style={{ fontSize: 16, color: "#d97706" }}>→</span>}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="⚡ Battle Skills">
        <P>Skills are used in Arena battles. Each skill has different energy costs and effects.</P>
        <StatTable rows={[
          ["Fetch", "Young (Lv.5)", "Basic attack — low energy cost, reliable damage"],
          ["Sit", "Young (Lv.5)", "Defensive stance — reduces incoming damage"],
          ["Guard", "Adult (Lv.10)", "Strong defense — blocks heavy attacks"],
          ["Trick", "Adult (Lv.10)", "Special attack — high damage, higher energy cost"],
          ["Inspire", "Elder (Lv.20)", "Team buff — boosts ATK temporarily"],
          ["Heal", "Elder (Lv.20)", "Restore HP — crucial for survival"],
          ["Transcend", "Legendary (Lv.35)", "Ultimate move — devastating damage, very high cost"],
        ]} />
      </SectionCard>
    </>
  );
}

function ArenaSection() {
  return (
    <>
      <SectionCard title="⚔️ Arena Battle System">
        <P>
          Battle other trainers&apos; pets in turn-based combat! Your pet&apos;s stats determine battle power.
        </P>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "HP", desc: "Based on level + happiness", icon: "❤️" },
            { label: "ATK", desc: "Based on evolution stage + energy", icon: "⚔️" },
            { label: "DEF", desc: "Based on evolution stage + energy", icon: "🛡️" },
            { label: "SPD", desc: "Based on total interactions", icon: "💨" },
          ].map(s => (
            <div key={s.label} style={{
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <div>
                <div style={{ fontFamily: "mono", fontSize: 12, fontWeight: 700, color: "#1a1a2e" }}>{s.label}</div>
                <div style={{ fontFamily: "mono", fontSize: 9, color: "rgba(26,26,46,0.5)" }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="🏆 Arena Rewards">
        <StatTable rows={[
          ["🏅 Victory", "+30 Airdrop Points, +25 EXP", "Win the battle"],
          ["💪 Defeat", "+10 Airdrop Points, +10 EXP", "You still earn!"],
          ["⬆️ Level Up Bonus", "+50 Airdrop Points", "When your pet levels up"],
        ]} />
        <div style={{
          marginTop: 14, padding: "12px 16px", borderRadius: 12,
          background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)",
        }}>
          <P>
            <strong style={{ color: "#b45309" }}>Matchmaking:</strong> You&apos;re matched against opponents within ±3 levels of your pet.
            Higher evolution stages give stat advantages, so evolve early!
          </P>
        </div>
      </SectionCard>
    </>
  );
}

function ItemsSection() {
  return (
    <>
      <SectionCard title="🛒 Item Shop">
        <P>Buy items with $PET credits to boost your pet&apos;s stats, speed up leveling, or equip cool gear.</P>

        <div style={{ fontFamily: "mono", fontSize: 11, fontWeight: 600, color: "rgba(26,26,46,0.5)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Consumables — Use instantly
        </div>
        <StatTable rows={[
          ["🧪 EXP Potion (S)", "50 $PET", "EXP +100"],
          ["🧪 EXP Potion (M)", "120 $PET", "EXP +300"],
          ["🧬 EXP Potion (L)", "280 $PET", "EXP +800"],
          ["🌟 Mega EXP Elixir", "600 $PET", "EXP +2000 (Legendary)"],
          ["⚡ Energy Drink", "30 $PET", "Energy +100"],
          ["🍱 Premium Feast", "45 $PET", "Hunger -80, Happiness +25"],
          ["🎂 Happiness Cake", "60 $PET", "Happiness +40"],
          ["💍 Bond Ring", "150 $PET", "Bond +35"],
          ["💎 Full Restore", "300 $PET", "All stats MAX (Epic)"],
        ]} />

        <div style={{ fontFamily: "mono", fontSize: 11, fontWeight: 600, color: "rgba(26,26,46,0.5)", marginBottom: 10, marginTop: 20, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Equipment & Accessories — Equip to pet
        </div>
        <StatTable rows={[
          ["🏋️ Training Weights", "100 $PET", "Boost EXP gain"],
          ["🍀 Lucky Charm", "200 $PET", "Boost happiness gain"],
          ["🛡️ Battle Armor", "350 $PET", "Arena DEF boost (Epic)"],
          ["⚔️ Dragon Blade", "500 $PET", "Arena ATK boost (Legendary)"],
          ["🎀 Cute Bow", "25 $PET", "Cosmetic + Happiness +3"],
          ["🕶️ Cool Sunglasses", "80 $PET", "Style points"],
          ["👑 Royal Crown", "800 $PET", "Ultimate flex (Legendary)"],
        ]} />

        <div style={{ fontFamily: "mono", fontSize: 11, fontWeight: 600, color: "rgba(26,26,46,0.5)", marginBottom: 10, marginTop: 20, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Furniture & Cosmetics
        </div>
        <StatTable rows={[
          ["🛏️ Cozy Bed", "40 $PET", "Energy recovery boost"],
          ["🏰 Play Tower", "90 $PET", "Happiness boost"],
          ["🪴 Zen Garden", "400 $PET", "All stats boost (Epic)"],
          ["✨ Sparkle Aura", "150 $PET", "Visual effect"],
          ["🔥 Flame Trail", "300 $PET", "Visual effect (Epic)"],
        ]} />
      </SectionCard>

      <SectionCard title="💎 Rarity System">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge color="rgba(26,26,46,0.5)">Common</Badge>
          <Badge color="#16a34a">Uncommon</Badge>
          <Badge color="#2563eb">Rare</Badge>
          <Badge color="#7c3aed">Epic</Badge>
          <Badge color="#b45309">Legendary</Badge>
        </div>
        <P>Higher rarity items have stronger effects and are more exclusive.</P>
      </SectionCard>
    </>
  );
}

function RewardsSection() {
  return (
    <>
      <SectionCard title="🎁 Real Merch Rewards">
        <P>
          Level up your pet and earn Airdrop Points to redeem real physical merchandise —
          custom printed with your pet&apos;s AI-generated artwork!
        </P>
        <StatTable rows={[
          ["🏷️ Sticker Pack", "500 pts, Lv.5+", "Custom pet sticker set (5 sheets)"],
          ["💇 Hair Clip", "1,000 pts, Lv.10+", "Pet-shaped hair accessory"],
          ["📱 Phone Case", "2,000 pts, Lv.15+", "Custom printed pet phone case"],
          ["☕ Mug", "3,000 pts, Lv.20+", "Ceramic mug with pet portrait"],
          ["📓 Notebook", "3,500 pts, Lv.25+", "Hardcover notebook with pet art"],
          ["🖊️ Pen Set", "4,000 pts, Lv.30+", "Premium pen set with pet charm"],
          ["👜 Tote Bag", "5,000 pts, Lv.35+", "Canvas tote with AI pet print"],
          ["🧥 Hoodie", "10,000 pts, Lv.40+", "Limited edition pet hoodie"],
          ["🏆 Figure", "20,000 pts, Lv.50+", "3D printed pet figure (LIMITED)"],
        ]} />
      </SectionCard>

      <SectionCard title="📈 How to Earn Points">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { source: "Each interaction", pts: "+1 pt" },
            { source: "Level up bonus", pts: "+50 pts" },
            { source: "Arena win", pts: "+30 pts" },
            { source: "Arena loss", pts: "+10 pts" },
          ].map(s => (
            <div key={s.source} style={{
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.6)" }}>{s.source}</span>
              <span style={{ fontFamily: "mono", fontSize: 12, fontWeight: 700, color: "#16a34a" }}>{s.pts}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

function EconomySection() {
  return (
    <>
      <SectionCard title="🪙 $PET Token">
        <P>
          $PET is the in-game currency used to purchase items, unlock pet slots, and more.
          It&apos;s also an ERC-20 token on BSC (Binance Smart Chain).
        </P>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div style={{ padding: "14px", borderRadius: 12, background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)" }}>
            <div style={{ fontFamily: "mono", fontSize: 10, color: "#16a34a", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Earn $PET</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {["Evolution rewards (+50 credits)", "Daily interactions", "Arena victories", "Achievement milestones"].map(item => (
                <div key={item} style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.55)", display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ color: "#16a34a" }}>+</span> {item}
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: "14px", borderRadius: 12, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
            <div style={{ fontFamily: "mono", fontSize: 10, color: "#dc2626", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Spend $PET</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {["Shop items & consumables", "Unlock pet slots", "Equipment & cosmetics", "Premium features"].map(item => (
                <div key={item} style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.55)", display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ color: "#dc2626" }}>-</span> {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="💳 Credit Packages">
        <P>Purchase credits with USDT to get $PET tokens for in-game use.</P>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { name: "Starter", price: "$5", credits: "100", pet: "500 PET", color: "#4ade80" },
            { name: "Creator", price: "$20", credits: "500", pet: "2,500 PET", color: "#60a5fa" },
            { name: "Pro", price: "$50", credits: "2,000", pet: "10,000 PET", color: "#c084fc" },
          ].map(plan => (
            <div key={plan.name} style={{
              padding: "18px", borderRadius: 14, textAlign: "center",
              background: `${plan.color}08`, border: `1px solid ${plan.color}20`,
            }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontFamily: "mono", fontSize: 22, fontWeight: 700, color: plan.color, marginBottom: 4 }}>{plan.price}</div>
              <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.5)" }}>{plan.credits} credits</div>
              <div style={{ fontFamily: "mono", fontSize: 10, color: "#b45309", marginTop: 2 }}>{plan.pet}</div>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

const SECTION_COMPONENTS: Record<string, () => React.ReactElement> = {
  overview: OverviewSection,
  raising: RaisingSection,
  evolution: EvolutionSection,
  arena: ArenaSection,
  items: ItemsSection,
  rewards: RewardsSection,
  economy: EconomySection,
};

export default function Guide() {
  const [active, setActive] = useState("overview");
  const ActiveSection = SECTION_COMPONENTS[active] || OverviewSection;

  return (
    <div style={{ padding: "120px 40px 60px", maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700,
          color: "#1a1a2e", marginBottom: 6, display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 28 }}>📖</span> Game Guide
        </h2>
        <p style={{ fontFamily: "mono", fontSize: 12, color: "rgba(26,26,46,0.45)" }}>
          Everything you need to know about raising your AI pet
        </p>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 24, padding: 3, borderRadius: 14,
        background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)",
        overflowX: "auto", flexWrap: "wrap",
      }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setActive(s.key)} style={{
            background: active === s.key ? "rgba(251,191,36,0.12)" : "transparent",
            border: active === s.key ? "1px solid rgba(251,191,36,0.2)" : "1px solid transparent",
            borderRadius: 10, padding: "8px 14px", cursor: "pointer",
            fontFamily: "mono", fontSize: 11, fontWeight: active === s.key ? 600 : 400,
            color: active === s.key ? "#b45309" : "rgba(26,26,46,0.45)",
            transition: "all 0.2s", whiteSpace: "nowrap",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ fontSize: 13 }}>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <ActiveSection />
    </div>
  );
}

"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

const SECTIONS = [
  { key: "overview", label: "Overview", icon: "scroll" },
  { key: "raising", label: "Raising", icon: "chicken" },
  { key: "evolution", label: "Evolution", icon: "sparkling" },
  { key: "arena", label: "Arena", icon: "sword" },
  { key: "items", label: "Items & Shop", icon: "shopping-cart" },
  { key: "rewards", label: "Standing", icon: "trophy" },
  { key: "economy", label: "pts Economy", icon: "coin" },
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
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "mono", fontSize: 13 }}>
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
      fontFamily: "mono", fontSize: 13, fontWeight: 600, marginRight: 6, marginBottom: 4,
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
            { icon: "chicken", title: "Adopt", desc: "Create your unique AI pet with custom personality and appearance" },
            { icon: "heart", title: "Raise", desc: "Feed, play, train — every interaction matters" },
            { icon: "sword", title: "Battle", desc: "Compete in the Arena for glory and pts rewards" },
          ].map(item => (
            <div key={item.title} style={{
              padding: "16px", borderRadius: 14,
              background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.1)",
              textAlign: "center",
            }}>
              <div style={{ marginBottom: 6 }}><Icon name={item.icon} size={28} /></div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.5)", lineHeight: 1.6 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="🎮 Game Loop">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {["Adopt Pet", "→", "Interact Daily", "→", "Level Up", "→", "Evolve", "→", "Arena Battle", "→", "Earn pts", "→", "Buy Items", "↩"].map((step, i) => (
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
            { icon: "heart", name: "Happiness", desc: "Affects mood and battle HP. Keep above 40 to avoid sadness.", color: "#f472b6" },
            { icon: "electric", name: "Energy", desc: "Required for Play, Walk, Train. Recovers slowly over time.", color: "#60a5fa" },
            { icon: "chicken", name: "Hunger", desc: "Increases over time. Feed your pet before it reaches 80+!", color: "#fbbf24" },
            { icon: "like", name: "Bond", desc: "Deepens through Talk and Pet. Affects battle loyalty.", color: "#c084fc" },
            { icon: "sparkling", name: "EXP", desc: "100 EXP per level. Train gives the most EXP (+20).", color: "#4ade80" },
          ].map(s => (
            <div key={s.name} style={{
              padding: "12px 14px", borderRadius: 12,
              background: `${s.color}08`, border: `1px solid ${s.color}20`,
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <span style={{ flexShrink: 0 }}><Icon name={s.icon} size={20} /></span>
              <div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: s.color }}>{s.name}</div>
                <div style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.5)", lineHeight: 1.6 }}>{s.desc}</div>
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
            "Caring for your pet earns Season Points, capped daily — consistency matters!",
            "Level-up grants a bonus +50 Season Points.",
          ].map((tip, i) => (
            <div key={i} style={{
              display: "flex", gap: 8, alignItems: "flex-start",
              fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.55)", lineHeight: 1.7,
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
            { icon: "open-box", name: "Baby", lv: 1, skills: "—" },
            { icon: "grass", name: "Young", lv: 5, skills: "Fetch, Sit" },
            { icon: "sparkling", name: "Adult", lv: 10, skills: "Guard, Trick" },
            { icon: "crown", name: "Elder", lv: 20, skills: "Inspire, Heal" },
            { icon: "trophy", name: "Legendary", lv: 35, skills: "Transcend" },
          ].map((stage, i, arr) => (
            <div key={stage.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                textAlign: "center", padding: "14px 18px", borderRadius: 14,
                background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)",
                minWidth: 90,
              }}>
                <div style={{ marginBottom: 4 }}><Icon name={stage.icon} size={28} /></div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{stage.name}</div>
                <div style={{ fontFamily: "mono", fontSize: 13, color: "#b45309" }}>Lv.{stage.lv}+</div>
                <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.4)", marginTop: 4 }}>{stage.skills}</div>
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
            { label: "HP", desc: "Based on level + happiness", icon: "heart" },
            { label: "ATK", desc: "Based on evolution stage + energy", icon: "sword" },
            { label: "DEF", desc: "Based on evolution stage + energy", icon: "shield" },
            { label: "SPD", desc: "Based on total interactions", icon: "footprints" },
          ].map(s => (
            <div key={s.label} style={{
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span><Icon name={s.icon} size={18} /></span>
              <div>
                <div style={{ fontFamily: "mono", fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{s.label}</div>
                <div style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.5)" }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="🏆 Arena Rewards">
        <StatTable rows={[
          ["🏅 Victory", "+30 Season Points, +25 EXP", "Win the battle"],
          ["💪 Defeat", "+10 Season Points, +10 EXP", "You still earn!"],
          ["⬆️ Level Up Bonus", "+50 Season Points", "When your pet levels up"],
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
        <P>Buy items with pts credits to boost your pet&apos;s stats, speed up leveling, or equip cool gear.</P>

        <div style={{ fontFamily: "mono", fontSize: 13, fontWeight: 600, color: "rgba(26,26,46,0.5)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Consumables — Use instantly
        </div>
        <StatTable rows={[
          ["🧪 EXP Potion (S)", "50 pts", "EXP +100"],
          ["🧪 EXP Potion (M)", "120 pts", "EXP +300"],
          ["🧬 EXP Potion (L)", "280 pts", "EXP +800"],
          ["🌟 Mega EXP Elixir", "600 pts", "EXP +2000 (Legendary)"],
          ["⚡ Energy Drink", "30 pts", "Energy +100"],
          ["🍱 Premium Feast", "45 pts", "Hunger -80, Happiness +25"],
          ["🎂 Happiness Cake", "60 pts", "Happiness +40"],
          ["💍 Bond Ring", "150 pts", "Bond +35"],
          ["💎 Full Restore", "300 pts", "All stats MAX (Epic)"],
        ]} />

        <div style={{ fontFamily: "mono", fontSize: 13, fontWeight: 600, color: "rgba(26,26,46,0.5)", marginBottom: 10, marginTop: 20, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Equipment & Accessories — Equip to pet
        </div>
        <StatTable rows={[
          ["🏋️ Training Weights", "100 pts", "Boost EXP gain"],
          ["🍀 Lucky Charm", "200 pts", "Boost happiness gain"],
          ["🛡️ Battle Armor", "350 pts", "Arena DEF boost (Epic)"],
          ["⚔️ Dragon Blade", "500 pts", "Arena ATK boost (Legendary)"],
          ["🎀 Cute Bow", "25 pts", "Cosmetic + Happiness +3"],
          ["🕶️ Cool Sunglasses", "80 pts", "Style points"],
          ["👑 Royal Crown", "800 pts", "Ultimate flex (Legendary)"],
        ]} />

        <div style={{ fontFamily: "mono", fontSize: 13, fontWeight: 600, color: "rgba(26,26,46,0.5)", marginBottom: 10, marginTop: 20, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Furniture & Cosmetics
        </div>
        <StatTable rows={[
          ["🛏️ Cozy Bed", "40 pts", "Energy recovery boost"],
          ["🏰 Play Tower", "90 pts", "Happiness boost"],
          ["🪴 Zen Garden", "400 pts", "All stats boost (Epic)"],
          ["✨ Sparkle Aura", "150 pts", "Visual effect"],
          ["🔥 Flame Trail", "300 pts", "Visual effect (Epic)"],
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
      <SectionCard title="🏅 Season Standing">
        <P>
          Season Points are a non-financial recognition score — earned by raising and
          creating, capped daily, and frozen when the season closes. Higher tiers are your
          felt status in the community. They carry <strong>no cash value, no token, and no
          redemption path</strong> — now or planned — and confer no claim on equity.
        </P>
      </SectionCard>

      <SectionCard title="📈 How Points Work">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { source: "Care & create (free)", pts: "capped daily" },
            { source: "Level-up bonus", pts: "+50 pts" },
            { source: "Arena / battles", pts: "capped daily" },
            { source: "Paid actions", pts: "no points" },
          ].map(s => (
            <div key={s.source} style={{
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(190,79,40,0.06)", border: "1px solid rgba(190,79,40,0.15)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: "mono", fontSize: 13, color: "rgba(33,26,18,0.6)" }}>{s.source}</span>
              <span style={{ fontFamily: "mono", fontSize: 13, fontWeight: 700, color: "#9A4E1E" }}>{s.pts}</span>
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
      <SectionCard title="🪙 Points Economy">
        <P>
          Points are an in-game recognition score — gained from interactions, evolutions,
          and battles, and spent on items, slots, and premium actions. They are
          loyalty-only: no token, no cash value, and no redemption path — now or planned —
          and confer no claim on equity.
        </P>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div style={{ padding: "14px", borderRadius: 12, background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)" }}>
            <div style={{ fontFamily: "mono", fontSize: 13, color: "#16a34a", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Earn pts</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {["Evolution rewards (+50 credits)", "Daily interactions", "Arena victories", "Achievement milestones"].map(item => (
                <div key={item} style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.55)", display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ color: "#16a34a" }}>+</span> {item}
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: "14px", borderRadius: 12, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
            <div style={{ fontFamily: "mono", fontSize: 13, color: "#dc2626", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Spend pts</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {["Shop items & consumables", "Unlock pet slots", "Equipment & cosmetics", "Premium features"].map(item => (
                <div key={item} style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.55)", display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ color: "#dc2626" }}>-</span> {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="💳 Credit Packages">
        <P>Purchase credits with USDT to spend in-game. Credits convert to pts on use.</P>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { name: "Explorer", price: "$5", credits: "100", pet: "500 pts", color: "#4ade80" },
            { name: "Creator", price: "$20", credits: "500", pet: "2,500 pts", color: "#60a5fa" },
            { name: "Breeder", price: "$50", credits: "2,000", pet: "10,000 pts", color: "#c084fc" },
          ].map(plan => (
            <div key={plan.name} style={{
              padding: "18px", borderRadius: 14, textAlign: "center",
              background: `${plan.color}08`, border: `1px solid ${plan.color}20`,
            }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontFamily: "mono", fontSize: 22, fontWeight: 700, color: plan.color, marginBottom: 4 }}>{plan.price}</div>
              <div style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.5)" }}>{plan.credits} credits</div>
              <div style={{ fontFamily: "mono", fontSize: 13, color: "#b45309", marginTop: 2 }}>{plan.pet}</div>
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
          <Icon name="scroll" size={28} /> Game Guide
        </h2>
        <p style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.45)" }}>
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
            fontFamily: "mono", fontSize: 13, fontWeight: active === s.key ? 600 : 400,
            color: active === s.key ? "#b45309" : "rgba(26,26,46,0.45)",
            transition: "all 0.2s", whiteSpace: "nowrap",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <Icon name={s.icon} size={14} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <ActiveSection />
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Arena from "@/components/Arena";
import { api } from "@/lib/api";

// ── Types ──
interface Pet {
  id: number;
  name: string;
  species: number;
  personality_type: string;
  level: number;
  experience: number;
  happiness: number;
  energy: number;
  hunger: number;
  bond_level: number;
  total_interactions: number;
  current_mood?: string;
  is_active?: boolean;
  avatar_url?: string;
  evolution_stage?: number;
  personality_modifiers?: any;
}

const PET_EMOJIS = [
  "\u{1F431}", "\u{1F415}", "\u{1F99C}", "\u{1F422}", "\u{1F439}", "\u{1F430}", "\u{1F98A}", "\u{1F436}",
];

// ── Keyframes ──
const bootKeyframes = `
@keyframes blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes scanline {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(100vh); }
}
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 8px rgba(100,220,255,0.3), inset 0 0 8px rgba(100,220,255,0.05); }
  50%      { box-shadow: 0 0 18px rgba(100,220,255,0.5), inset 0 0 12px rgba(100,220,255,0.1); }
}
@keyframes activeGlow {
  0%, 100% { box-shadow: 0 0 12px rgba(80,200,120,0.4), inset 0 0 8px rgba(80,200,120,0.08); }
  50%      { box-shadow: 0 0 24px rgba(80,200,120,0.6), inset 0 0 14px rgba(80,200,120,0.12); }
}
@keyframes pixelType {
  from { width: 0; }
  to   { width: 10ch; }
}
@keyframes bootLogoFade {
  0%   { opacity: 0; transform: scale(0.8); }
  40%  { opacity: 1; transform: scale(1.05); }
  60%  { opacity: 1; transform: scale(1); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes bootClick {
  0%   { width: 0; height: 0; opacity: 0; }
  30%  { width: 40px; height: 40px; opacity: 0.6; }
  100% { width: 80px; height: 80px; opacity: 0; }
}
@keyframes bootFlash {
  0%, 70% { opacity: 0; }
  75%     { opacity: 0.15; }
  100%    { opacity: 0; }
}
@keyframes cardHover {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-2px); }
}
@keyframes wildAppear {
  0%   { opacity: 0; transform: scale(0.5) rotate(-10deg); }
  60%  { transform: scale(1.1) rotate(2deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}
@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
}
@keyframes revealLocation {
  0%   { opacity: 0; transform: scale(0.8) translateY(10px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes gymPulse {
  0%   { box-shadow: 0 0 10px rgba(255,167,38,0.3); }
  50%  { box-shadow: 0 0 30px rgba(255,167,38,0.7); }
  100% { box-shadow: 0 0 10px rgba(255,167,38,0.3); }
}
@keyframes gymTargetMove {
  0%   { left: 0%; }
  50%  { left: calc(100% - 20px); }
  100% { left: 0%; }
}
@keyframes resultPop {
  0%   { opacity: 0; transform: scale(0.5); }
  60%  { transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}
`;

const MENU_ITEMS = [
  {
    id: "battle",
    icon: "\u2694\uFE0F",
    title: "Battle Arena",
    desc: "Challenge other trainers",
    available: true,
    accent: "#50c878",
  },
  {
    id: "wild",
    icon: "\u{1F33F}",
    title: "Wild Encounter",
    desc: "Meet wild pets",
    available: false,
    accent: "#6bcf7f",
  },
  {
    id: "explore",
    icon: "\u{1F5FA}\uFE0F",
    title: "Explore",
    desc: "Send your pet on adventures",
    available: false,
    accent: "#64b5f6",
  },
  {
    id: "gym",
    icon: "\u{1F3DB}\uFE0F",
    title: "Gym Challenge",
    desc: "Train your pet's stats",
    available: false,
    accent: "#ffa726",
  },
] as const;

// ── Wild Encounter Data ──
const WILD_PETS = [
  { name: "Mossy Frog", emoji: "\u{1F438}", personality: "shy", rarity: "common" },
  { name: "Shadow Fox", emoji: "\u{1F98A}", personality: "cunning", rarity: "uncommon" },
  { name: "Crystal Bunny", emoji: "\u{1F430}", personality: "gentle", rarity: "rare" },
  { name: "Thunder Pup", emoji: "\u{1F436}", personality: "brave", rarity: "uncommon" },
  { name: "Mystic Owl", emoji: "\u{1F989}", personality: "wise", rarity: "rare" },
  { name: "Flame Lizard", emoji: "\u{1F98E}", personality: "fierce", rarity: "uncommon" },
  { name: "Coral Turtle", emoji: "\u{1F422}", personality: "calm", rarity: "common" },
  { name: "Starlight Cat", emoji: "\u{1F431}", personality: "mysterious", rarity: "rare" },
  { name: "Berry Hamster", emoji: "\u{1F439}", personality: "playful", rarity: "common" },
  { name: "Wind Parrot", emoji: "\u{1F99C}", personality: "chatty", rarity: "uncommon" },
];

const RARITY_COLORS: Record<string, string> = {
  common: "#9e9e9e",
  uncommon: "#4caf50",
  rare: "#ab47bc",
};

// ── Explore Data ──
const EXPLORE_LOCATIONS = [
  { name: "Ancient Ruins", emoji: "\u{1F3DA}\uFE0F", type: "treasure" as const, desc: "Crumbling stones hide forgotten wealth" },
  { name: "Sunlit Meadow", emoji: "\u{1F33B}", type: "rest" as const, desc: "Warm grass and gentle breeze" },
  { name: "Training Dojo", emoji: "\u{1F94B}", type: "training" as const, desc: "A master awaits within" },
  { name: "Crystal Cave", emoji: "\u{1F48E}", type: "treasure" as const, desc: "Glimmering gems line the walls" },
  { name: "Hot Springs", emoji: "\u2668\uFE0F", type: "rest" as const, desc: "Rejuvenating mineral waters" },
  { name: "Obstacle Course", emoji: "\u{1F3CB}\uFE0F", type: "training" as const, desc: "Test your pet's limits" },
  { name: "Pirate Cove", emoji: "\u{1F3F4}\u200D\u2620\uFE0F", type: "treasure" as const, desc: "X marks the spot" },
  { name: "Zen Garden", emoji: "\u{1F33F}", type: "rest" as const, desc: "Inner peace and recovery" },
  { name: "Sparring Ring", emoji: "\u{1F94A}", type: "training" as const, desc: "Practice makes perfect" },
];

// ── Shared Back Button ──
function BackButton({ onClick, accent }: { onClick: () => void; accent: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: `linear-gradient(135deg, ${accent}18 0%, #151520 100%)`,
        border: `1.5px solid ${accent}44`,
        borderRadius: 12,
        padding: "10px 20px",
        color: accent,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        cursor: "pointer",
        marginBottom: 20,
        transition: "all 0.2s ease",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `${accent}88`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `${accent}44`;
      }}
    >
      <span style={{ fontSize: 16 }}>{"\u2190"}</span>
      Back to Adventure
    </button>
  );
}

// ── Pet Selector (shared by wild, explore, gym) ──
function PetSelector({ pets, onSelect, accent, loading }: {
  pets: Pet[];
  onSelect: (pet: Pet) => void;
  accent: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#666", fontSize: 13 }}>
        Loading your pets...
      </div>
    );
  }
  if (pets.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#666", fontSize: 13 }}>
        No pets found. Adopt a pet first!
      </div>
    );
  }
  return (
    <div style={{
      display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap",
    }}>
      {pets.map((pet) => (
        <button
          key={pet.id}
          onClick={() => onSelect(pet)}
          style={{
            background: `linear-gradient(180deg, ${accent}12 0%, #111118 70%)`,
            border: `1.5px solid ${accent}33`,
            borderRadius: 14,
            padding: "16px 20px",
            cursor: "pointer",
            textAlign: "center",
            transition: "all 0.25s ease",
            minWidth: 120,
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = `${accent}88`;
            (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = `${accent}33`;
            (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 6 }}>
            {pet.avatar_url ? (
              <img src={pet.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
            ) : (
              PET_EMOJIS[pet.species] || "\u{1F43E}"
            )}
          </div>
          <div style={{ color: "#e0e0e0", fontSize: 13, fontWeight: 700 }}>{pet.name}</div>
          <div style={{ color: "#666", fontSize: 10, marginTop: 2 }}>Lv.{pet.level}</div>
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════
// ── Wild Encounter Mode ──
// ══════════════════════════════════════════
function WildEncounter({ onBack }: { onBack: () => void }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [wildPet, setWildPet] = useState<(typeof WILD_PETS)[number] | null>(null);
  const [phase, setPhase] = useState<"select" | "encounter" | "result">("select");
  const [result, setResult] = useState<{ action: string; success: boolean; message: string; rewards: string } | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.pets.list()
      .then((data: any) => { if (!cancelled) setPets(data.pets || data || []); })
      .catch(() => {
        if (!cancelled) setPets([
          { id: 1, name: "Luna", species: 0, personality_type: "playful", level: 5, experience: 320, happiness: 85, energy: 72, hunger: 45, bond_level: 68, total_interactions: 47 },
        ]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const startEncounter = useCallback((pet: Pet) => {
    setSelectedPet(pet);
    setWildPet(WILD_PETS[Math.floor(Math.random() * WILD_PETS.length)]);
    setPhase("encounter");
    setResult(null);
  }, []);

  const doAction = useCallback(async (action: "befriend" | "feed" | "flee") => {
    if (!selectedPet || !wildPet || acting) return;
    setActing(true);

    // Success rates influenced by pet stats
    const bondBonus = selectedPet.bond_level / 200; // 0-0.5
    const happyBonus = selectedPet.happiness / 200;
    const rarityPenalty = wildPet.rarity === "rare" ? 0.15 : wildPet.rarity === "uncommon" ? 0.08 : 0;

    let success = false;
    let message = "";
    let rewards = "";
    let interactionType = "pet";

    if (action === "befriend") {
      const rate = 0.55 + bondBonus + happyBonus - rarityPenalty;
      success = Math.random() < rate;
      interactionType = "pet";
      if (success) {
        const expGain = 8 + Math.floor(Math.random() * 8);
        const petReward = Math.random() < 0.35;
        message = `${selectedPet.name} won over the ${wildPet.name}! A new friendship forms.`;
        rewards = `+${expGain} EXP, +5 Bond${petReward ? ", +10 $PET" : ""}`;
      } else {
        message = `The ${wildPet.name} is wary and slips away into the bushes.`;
        rewards = "+3 EXP (encounter bonus)";
      }
    } else if (action === "feed") {
      const rate = 0.7 + happyBonus;
      success = Math.random() < rate;
      interactionType = "feed";
      if (success) {
        const expGain = 5 + Math.floor(Math.random() * 6);
        message = `The ${wildPet.name} happily accepts the food! Your pet's hunger is restored.`;
        rewards = `+${expGain} EXP, Hunger recovered`;
      } else {
        message = `The ${wildPet.name} sniffed the food but wasn't interested.`;
        rewards = "+2 EXP (attempt bonus)";
      }
    } else {
      // Flee always succeeds
      success = true;
      message = `${selectedPet.name} safely retreated from the ${wildPet.name}.`;
      rewards = "+2 EXP (caution bonus)";
      interactionType = "walk";
    }

    // Call the interact API
    try {
      await api.pets.interact(selectedPet.id, interactionType);
    } catch {
      // Continue even if API fails
    }

    setResult({ action, success, message, rewards });
    setPhase("result");
    setActing(false);
  }, [selectedPet, wildPet, acting]);

  const accent = "#6bcf7f";

  return (
    <div>
      <BackButton onClick={onBack} accent={accent} />

      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <h3 style={{ color: "#e0e0e0", fontSize: 18, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
          {"\u{1F33F}"} WILD ENCOUNTER
        </h3>
        <p style={{ color: "#555", fontSize: 11, marginTop: 4, letterSpacing: 0.5 }}>
          {phase === "select" ? "Choose a pet to venture into the wild" : phase === "encounter" ? "A wild pet appeared!" : "Encounter complete"}
        </p>
      </div>

      {phase === "select" && (
        <PetSelector pets={pets} onSelect={startEncounter} accent={accent} loading={loading} />
      )}

      {phase === "encounter" && wildPet && selectedPet && (
        <div style={{
          background: "linear-gradient(180deg, #0a1a0a 0%, #111118 100%)",
          borderRadius: 16,
          padding: "28px 24px",
          border: `1px solid ${accent}22`,
          textAlign: "center",
        }}>
          {/* Wild pet display */}
          <div style={{ animation: "wildAppear 0.6s ease-out", marginBottom: 20 }}>
            <div style={{ fontSize: 64, marginBottom: 8, animation: "bounce 2s ease-in-out infinite" }}>
              {wildPet.emoji}
            </div>
            <div style={{ color: "#e0e0e0", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              {wildPet.name}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 6,
                background: `${RARITY_COLORS[wildPet.rarity]}20`,
                color: RARITY_COLORS[wildPet.rarity],
                border: `1px solid ${RARITY_COLORS[wildPet.rarity]}40`,
                textTransform: "uppercase" as const, letterSpacing: 1,
              }}>
                {wildPet.rarity}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 500, padding: "2px 10px", borderRadius: 6,
                background: "rgba(255,255,255,0.05)",
                color: "#888",
              }}>
                {wildPet.personality}
              </span>
            </div>
          </div>

          {/* Your pet */}
          <div style={{ color: "#555", fontSize: 10, marginBottom: 16, letterSpacing: 1 }}>
            {selectedPet.name} (Lv.{selectedPet.level}) confronts the wild {wildPet.name}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {[
              { key: "befriend" as const, label: "Befriend", emoji: "\u{1F91D}", color: "#6bcf7f", desc: "+EXP, +Bond, $PET chance" },
              { key: "feed" as const, label: "Feed", emoji: "\u{1F356}", color: "#ffa726", desc: "+EXP, Hunger recovery" },
              { key: "flee" as const, label: "Flee", emoji: "\u{1F4A8}", color: "#90a4ae", desc: "Safe retreat, +2 EXP" },
            ].map((act) => (
              <button
                key={act.key}
                onClick={() => doAction(act.key)}
                disabled={acting}
                style={{
                  background: `${act.color}12`,
                  border: `1.5px solid ${act.color}40`,
                  borderRadius: 12,
                  padding: "14px 20px",
                  cursor: acting ? "not-allowed" : "pointer",
                  textAlign: "center",
                  transition: "all 0.2s ease",
                  fontFamily: "inherit",
                  opacity: acting ? 0.5 : 1,
                  minWidth: 110,
                }}
                onMouseEnter={(e) => {
                  if (!acting) (e.currentTarget as HTMLElement).style.borderColor = `${act.color}88`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = `${act.color}40`;
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 4 }}>{act.emoji}</div>
                <div style={{ color: act.color, fontSize: 13, fontWeight: 700 }}>{act.label}</div>
                <div style={{ color: "#555", fontSize: 9, marginTop: 4 }}>{act.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "result" && result && wildPet && (
        <div style={{
          background: "linear-gradient(180deg, #0a1a0a 0%, #111118 100%)",
          borderRadius: 16,
          padding: "32px 24px",
          border: `1px solid ${result.success ? accent : "#f8717122"}`,
          textAlign: "center",
          animation: "fadeIn 0.4s ease-out",
        }}>
          <div style={{
            fontSize: 56, marginBottom: 12,
            animation: "resultPop 0.5s ease-out",
          }}>
            {result.success ? (result.action === "flee" ? "\u{1F4A8}" : "\u2728") : "\u{1F343}"}
          </div>
          <div style={{
            color: result.success ? accent : "#f87171",
            fontSize: 18, fontWeight: 700, marginBottom: 8,
          }}>
            {result.success ? (result.action === "flee" ? "SAFE RETREAT" : "SUCCESS!") : "NO LUCK..."}
          </div>
          <div style={{
            color: "#aaa", fontSize: 13, marginBottom: 16, lineHeight: 1.5, maxWidth: 400, margin: "0 auto 16px",
          }}>
            {result.message}
          </div>
          <div style={{
            display: "inline-block",
            background: `${accent}15`,
            border: `1px solid ${accent}30`,
            borderRadius: 10,
            padding: "8px 20px",
            color: accent,
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 20,
          }}>
            {result.rewards}
          </div>
          <div>
            <button
              onClick={() => { setPhase("encounter"); setWildPet(WILD_PETS[Math.floor(Math.random() * WILD_PETS.length)]); setResult(null); }}
              style={{
                background: `${accent}15`,
                border: `1px solid ${accent}40`,
                borderRadius: 10,
                padding: "10px 24px",
                color: accent,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                marginRight: 10,
                transition: "all 0.2s ease",
              }}
            >
              New Encounter
            </button>
            <button
              onClick={() => { setPhase("select"); setSelectedPet(null); setWildPet(null); setResult(null); }}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                padding: "10px 24px",
                color: "#888",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.2s ease",
              }}
            >
              Change Pet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// ── Explore Mode ──
// ══════════════════════════════════════════
function Explore({ onBack }: { onBack: () => void }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [phase, setPhase] = useState<"select" | "exploring" | "results">("select");
  const [locations, setLocations] = useState<(typeof EXPLORE_LOCATIONS)[number][]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([false, false, false]);
  const [rewards, setRewards] = useState<(string | null)[]>([null, null, null]);
  const [allRevealed, setAllRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.pets.list()
      .then((data: any) => { if (!cancelled) setPets(data.pets || data || []); })
      .catch(() => {
        if (!cancelled) setPets([
          { id: 1, name: "Luna", species: 0, personality_type: "playful", level: 5, experience: 320, happiness: 85, energy: 72, hunger: 45, bond_level: 68, total_interactions: 47 },
        ]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const startExploring = useCallback((pet: Pet) => {
    setSelectedPet(pet);
    // Pick 3 random locations
    const shuffled = [...EXPLORE_LOCATIONS].sort(() => Math.random() - 0.5);
    setLocations(shuffled.slice(0, 3));
    setRevealed([false, false, false]);
    setRewards([null, null, null]);
    setAllRevealed(false);
    setPhase("exploring");
  }, []);

  const revealLocation = useCallback(async (index: number) => {
    if (revealed[index] || !selectedPet) return;

    const loc = locations[index];
    let rewardText = "";
    let interactionType = "walk";

    if (loc.type === "treasure") {
      const petAmount = 5 + Math.floor(Math.random() * 16);
      rewardText = `Found +${petAmount} $PET!`;
      interactionType = "walk";
    } else if (loc.type === "training") {
      const expAmount = 10 + Math.floor(Math.random() * 11);
      rewardText = `Gained +${expAmount} EXP!`;
      interactionType = "train";
    } else {
      const energyRestore = 10 + Math.floor(Math.random() * 11);
      rewardText = `Recovered +${energyRestore} Energy!`;
      interactionType = "pet";
    }

    try {
      await api.pets.interact(selectedPet.id, interactionType);
    } catch {
      // Continue
    }

    const newRevealed = [...revealed];
    newRevealed[index] = true;
    setRevealed(newRevealed);

    const newRewards = [...rewards];
    newRewards[index] = rewardText;
    setRewards(newRewards);

    if (newRevealed.every(Boolean)) {
      setAllRevealed(true);
    }
  }, [revealed, rewards, locations, selectedPet]);

  const accent = "#64b5f6";

  return (
    <div>
      <BackButton onClick={onBack} accent={accent} />

      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <h3 style={{ color: "#e0e0e0", fontSize: 18, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
          {"\u{1F5FA}\uFE0F"} EXPLORE
        </h3>
        <p style={{ color: "#555", fontSize: 11, marginTop: 4, letterSpacing: 0.5 }}>
          {phase === "select" ? "Choose a pet to explore with" : "Tap locations to discover what lies within"}
        </p>
      </div>

      {phase === "select" && (
        <PetSelector pets={pets} onSelect={startExploring} accent={accent} loading={loading} />
      )}

      {phase === "exploring" && selectedPet && (
        <div style={{
          background: "linear-gradient(180deg, #0a0a1e 0%, #111118 100%)",
          borderRadius: 16,
          padding: "24px 20px",
          border: `1px solid ${accent}22`,
        }}>
          <div style={{ color: "#555", fontSize: 10, textAlign: "center", marginBottom: 20, letterSpacing: 1 }}>
            {selectedPet.name} ventures into the unknown...
          </div>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            {locations.map((loc, i) => (
              <button
                key={i}
                onClick={() => revealLocation(i)}
                disabled={revealed[i]}
                style={{
                  width: 150,
                  minHeight: 180,
                  background: revealed[i]
                    ? `linear-gradient(180deg, ${
                        loc.type === "treasure" ? "#1a1a0a" : loc.type === "training" ? "#1a0a1a" : "#0a1a1a"
                      } 0%, #111118 100%)`
                    : "linear-gradient(180deg, #16161e 0%, #111118 100%)",
                  border: revealed[i]
                    ? `1.5px solid ${loc.type === "treasure" ? "#ffa72644" : loc.type === "training" ? "#ab47bc44" : "#4caf5044"}`
                    : `1.5px solid ${accent}33`,
                  borderRadius: 14,
                  padding: "20px 12px",
                  cursor: revealed[i] ? "default" : "pointer",
                  textAlign: "center",
                  transition: "all 0.3s ease",
                  fontFamily: "inherit",
                  animation: revealed[i] ? "revealLocation 0.4s ease-out" : "none",
                }}
                onMouseEnter={(e) => {
                  if (!revealed[i]) (e.currentTarget as HTMLElement).style.borderColor = `${accent}88`;
                }}
                onMouseLeave={(e) => {
                  if (!revealed[i]) (e.currentTarget as HTMLElement).style.borderColor = `${accent}33`;
                }}
              >
                {revealed[i] ? (
                  <>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>{loc.emoji}</div>
                    <div style={{ color: "#e0e0e0", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{loc.name}</div>
                    <div style={{ color: "#666", fontSize: 10, marginBottom: 10, lineHeight: 1.3 }}>{loc.desc}</div>
                    <div style={{
                      background: loc.type === "treasure" ? "#ffa72618" : loc.type === "training" ? "#ab47bc18" : "#4caf5018",
                      border: `1px solid ${loc.type === "treasure" ? "#ffa72640" : loc.type === "training" ? "#ab47bc40" : "#4caf5040"}`,
                      borderRadius: 8,
                      padding: "6px 10px",
                      color: loc.type === "treasure" ? "#ffa726" : loc.type === "training" ? "#ab47bc" : "#4caf50",
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      {rewards[i]}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.3 }}>?</div>
                    <div style={{ color: "#555", fontSize: 12, fontWeight: 600 }}>Unknown</div>
                    <div style={{ color: "#444", fontSize: 10, marginTop: 6 }}>Tap to explore</div>
                  </>
                )}
              </button>
            ))}
          </div>

          {allRevealed && (
            <div style={{ textAlign: "center", marginTop: 24, animation: "fadeIn 0.4s ease-out" }}>
              <div style={{ color: accent, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                Exploration Complete!
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  onClick={() => startExploring(selectedPet)}
                  style={{
                    background: `${accent}15`,
                    border: `1px solid ${accent}40`,
                    borderRadius: 10,
                    padding: "10px 24px",
                    color: accent,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.2s ease",
                  }}
                >
                  Explore Again
                </button>
                <button
                  onClick={() => { setPhase("select"); setSelectedPet(null); }}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10,
                    padding: "10px 24px",
                    color: "#888",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.2s ease",
                  }}
                >
                  Change Pet
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// ── Gym Challenge Mode ──
// ══════════════════════════════════════════
function GymChallenge({ onBack }: { onBack: () => void }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [phase, setPhase] = useState<"select" | "choose_stat" | "challenge" | "result">("select");
  const [stat, setStat] = useState<"Strength" | "Speed" | "Endurance" | null>(null);
  const [targetPos, setTargetPos] = useState(50);
  const [cursorPos, setCursorPos] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; rewards: string } | null>(null);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    api.pets.list()
      .then((data: any) => { if (!cancelled) setPets(data.pets || data || []); })
      .catch(() => {
        if (!cancelled) setPets([
          { id: 1, name: "Luna", species: 0, personality_type: "playful", level: 5, experience: 320, happiness: 85, energy: 72, hunger: 45, bond_level: 68, total_interactions: 47 },
        ]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const chooseStat = useCallback((pet: Pet) => {
    setSelectedPet(pet);
    setPhase("choose_stat");
  }, []);

  const startChallenge = useCallback((chosenStat: "Strength" | "Speed" | "Endurance") => {
    setStat(chosenStat);
    // Random target zone position
    setTargetPos(20 + Math.floor(Math.random() * 60));
    setCursorPos(0);
    setRunning(true);
    setPhase("challenge");
    startTimeRef.current = Date.now();
  }, []);

  // Animate the cursor sweeping back and forth
  useEffect(() => {
    if (phase !== "challenge" || !running) return;

    let raf: number;
    const speed = stat === "Speed" ? 0.12 : stat === "Strength" ? 0.08 : 0.06;

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      // Oscillate 0-100
      const raw = (elapsed * speed) % 200;
      const pos = raw <= 100 ? raw : 200 - raw;
      setCursorPos(pos);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    animRef.current = raf;

    return () => { cancelAnimationFrame(raf); };
  }, [phase, running, stat]);

  const hitTarget = useCallback(async () => {
    if (!running || !selectedPet || !stat) return;
    setRunning(false);
    if (animRef.current) cancelAnimationFrame(animRef.current);

    // Check accuracy: target zone is +/- 8 from targetPos
    const distance = Math.abs(cursorPos - targetPos);
    const success = distance <= 8;
    const close = distance <= 15;

    let interactionType = "train";
    let message = "";
    let rewards = "";

    if (success) {
      message = `Perfect timing! ${selectedPet.name}'s ${stat} has improved significantly!`;
      rewards = `+20 EXP, ${stat} boosted`;
    } else if (close) {
      message = `Almost there! ${selectedPet.name} still gained some experience from the effort.`;
      rewards = "+10 EXP (close attempt)";
    } else {
      message = `Missed the mark. ${selectedPet.name} gets a consolation workout.`;
      rewards = "+5 EXP (consolation)";
      interactionType = "play";
    }

    try {
      await api.pets.interact(selectedPet.id, interactionType);
    } catch {
      // Continue
    }

    setResult({ success, message, rewards });
    setPhase("result");
  }, [running, cursorPos, targetPos, selectedPet, stat]);

  const accent = "#ffa726";

  const STAT_OPTIONS: { key: "Strength" | "Speed" | "Endurance"; emoji: string; color: string; desc: string }[] = [
    { key: "Strength", emoji: "\u{1F4AA}", color: "#f97316", desc: "Power and attack force" },
    { key: "Speed", emoji: "\u26A1", color: "#facc15", desc: "Quick reflexes (faster cursor)" },
    { key: "Endurance", emoji: "\u{1F6E1}\uFE0F", color: "#4ade80", desc: "Stamina and defense" },
  ];

  return (
    <div>
      <BackButton onClick={onBack} accent={accent} />

      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <h3 style={{ color: "#e0e0e0", fontSize: 18, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
          {"\u{1F3DB}\uFE0F"} GYM CHALLENGE
        </h3>
        <p style={{ color: "#555", fontSize: 11, marginTop: 4, letterSpacing: 0.5 }}>
          {phase === "select" ? "Choose a pet to train" :
           phase === "choose_stat" ? "Select a stat to train" :
           phase === "challenge" ? "Hit the target zone!" : "Training complete"}
        </p>
      </div>

      {phase === "select" && (
        <PetSelector pets={pets} onSelect={chooseStat} accent={accent} loading={loading} />
      )}

      {phase === "choose_stat" && selectedPet && (
        <div style={{
          background: "linear-gradient(180deg, #1a1408 0%, #111118 100%)",
          borderRadius: 16,
          padding: "24px 20px",
          border: `1px solid ${accent}22`,
        }}>
          <div style={{ color: "#555", fontSize: 10, textAlign: "center", marginBottom: 20, letterSpacing: 1 }}>
            {selectedPet.name} enters the gym. Choose a training focus:
          </div>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            {STAT_OPTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => startChallenge(s.key)}
                style={{
                  width: 140,
                  background: `${s.color}10`,
                  border: `1.5px solid ${s.color}33`,
                  borderRadius: 14,
                  padding: "20px 14px",
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "all 0.25s ease",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = `${s.color}88`;
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = `${s.color}33`;
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 8 }}>{s.emoji}</div>
                <div style={{ color: s.color, fontSize: 14, fontWeight: 700 }}>{s.key}</div>
                <div style={{ color: "#666", fontSize: 10, marginTop: 4 }}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "challenge" && stat && (
        <div style={{
          background: "linear-gradient(180deg, #1a1408 0%, #111118 100%)",
          borderRadius: 16,
          padding: "28px 24px",
          border: `1px solid ${accent}22`,
          textAlign: "center",
        }}>
          <div style={{
            color: accent, fontSize: 14, fontWeight: 700, marginBottom: 8,
          }}>
            Training: {stat}
          </div>
          <div style={{ color: "#555", fontSize: 11, marginBottom: 24 }}>
            Click when the marker hits the target zone!
          </div>

          {/* Timing bar */}
          <div style={{
            position: "relative",
            width: "100%",
            maxWidth: 400,
            height: 40,
            background: "rgba(255,255,255,0.05)",
            borderRadius: 20,
            margin: "0 auto 24px",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            {/* Target zone */}
            <div style={{
              position: "absolute",
              left: `${targetPos - 8}%`,
              width: "16%",
              height: "100%",
              background: `${accent}30`,
              borderRadius: 20,
              border: `2px solid ${accent}60`,
              animation: "gymPulse 1.5s ease infinite",
            }} />

            {/* Moving cursor */}
            <div style={{
              position: "absolute",
              left: `calc(${cursorPos}% - 3px)`,
              top: 2,
              width: 6,
              height: 36,
              background: "#fff",
              borderRadius: 3,
              boxShadow: "0 0 12px rgba(255,255,255,0.6)",
              transition: "none",
            }} />
          </div>

          <button
            onClick={hitTarget}
            style={{
              background: `linear-gradient(135deg, ${accent}30, ${accent}15)`,
              border: `2px solid ${accent}60`,
              borderRadius: 14,
              padding: "14px 48px",
              color: accent,
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 2,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.1s ease",
              textTransform: "uppercase" as const,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "scale(1)";
            }}
          >
            STRIKE!
          </button>
        </div>
      )}

      {phase === "result" && result && stat && (
        <div style={{
          background: "linear-gradient(180deg, #1a1408 0%, #111118 100%)",
          borderRadius: 16,
          padding: "32px 24px",
          border: `1px solid ${result.success ? accent : "rgba(255,255,255,0.1)"}`,
          textAlign: "center",
          animation: "fadeIn 0.4s ease-out",
        }}>
          <div style={{
            fontSize: 56, marginBottom: 12,
            animation: "resultPop 0.5s ease-out",
          }}>
            {result.success ? "\u{1F3C6}" : "\u{1F4AA}"}
          </div>
          <div style={{
            color: result.success ? accent : "#aaa",
            fontSize: 18, fontWeight: 700, marginBottom: 8,
          }}>
            {result.success ? "PERFECT TRAINING!" : "KEEP PRACTICING!"}
          </div>
          <div style={{
            color: "#aaa", fontSize: 13, marginBottom: 16, lineHeight: 1.5, maxWidth: 400, margin: "0 auto 16px",
          }}>
            {result.message}
          </div>
          <div style={{
            display: "inline-block",
            background: `${accent}15`,
            border: `1px solid ${accent}30`,
            borderRadius: 10,
            padding: "8px 20px",
            color: accent,
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 20,
          }}>
            {result.rewards}
          </div>
          <div>
            <button
              onClick={() => { setPhase("choose_stat"); setResult(null); }}
              style={{
                background: `${accent}15`,
                border: `1px solid ${accent}40`,
                borderRadius: 10,
                padding: "10px 24px",
                color: accent,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                marginRight: 10,
                transition: "all 0.2s ease",
              }}
            >
              Train Again
            </button>
            <button
              onClick={() => { setPhase("select"); setSelectedPet(null); setStat(null); setResult(null); }}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                padding: "10px 24px",
                color: "#888",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.2s ease",
              }}
            >
              Change Pet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// ── Main Adventure Component ──
// ══════════════════════════════════════════
export default function Adventure() {
  const [booted, setBooted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState("");

  // Boot sequence
  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Clock for bottom bar
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    };
    tick();
    const i = setInterval(tick, 30000);
    return () => clearInterval(i);
  }, []);

  const isInMode = selected !== null;

  return (
    <>
      <style>{bootKeyframes}</style>

      <section
        style={{
          paddingTop: 80,
          minHeight: "100vh",
          background: "#0a0a0f",
          fontFamily:
            "'SF Mono', 'Fira Code', 'Courier New', monospace",
        }}
      >
        {/* ── Console + Joy-Con wrapper ── */}
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 16px",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "center",
            gap: 0,
          }}
        >
          {/* ── Left Joy-Con (neon blue) ── */}
          <div
            className="joycon-left"
            style={{
              width: 8,
              minHeight: 500,
              background: "linear-gradient(180deg, #00c8ff 0%, #0088cc 100%)",
              borderRadius: "20px 0 0 20px",
              flexShrink: 0,
              boxShadow: "inset -1px 0 4px rgba(0,200,255,0.3), 0 0 12px rgba(0,200,255,0.15)",
            }}
          />

          {/* ── Console Screen Frame (Switch bezel) ── */}
          <div
            style={{
              flex: 1,
              maxWidth: 900,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Bezel */}
            <div
              style={{
                background: "#1a1a1f",
                borderRadius: 20,
                border: "4px solid #2a2a30",
                overflow: "hidden",
                position: "relative",
                minHeight: 500,
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              {/* Bezel top bar with branding */}
              <div
                style={{
                  background: "#141418",
                  padding: "6px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: "1px solid #222228",
                }}
              >
                {/* Small decorative circles */}
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#50c878",
                    display: "inline-block",
                    opacity: 0.7,
                  }}
                />
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#64dcff",
                    display: "inline-block",
                    opacity: 0.7,
                  }}
                />
                <span
                  style={{
                    color: "#444",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 3,
                    marginLeft: 8,
                    textTransform: "uppercase" as const,
                  }}
                >
                  MY AI PET
                </span>
              </div>

              {/* Scanline overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 5,
                  background:
                    "repeating-linear-gradient(0deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 3px)",
                  mixBlendMode: "overlay",
                }}
              />

              {/* ── Boot Screen (Switch-style) ── */}
              {!booted && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 10,
                    background: "#000",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0,
                  }}
                >
                  {/* Click ring effect */}
                  <div
                    style={{
                      position: "absolute",
                      borderRadius: "50%",
                      border: "2px solid #50c878",
                      animation: "bootClick 0.6s ease-out 0.2s forwards",
                      opacity: 0,
                    }}
                  />
                  {/* Full-screen flash */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "#fff",
                      animation: "bootFlash 1.5s ease forwards",
                    }}
                  />
                  {/* Logo */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                      animation: "bootLogoFade 1s ease 0.3s both",
                    }}
                  >
                    <div style={{ fontSize: 36 }}>{"\u{1F3AE}"}</div>
                    <div
                      style={{
                        color: "#e0e0e0",
                        fontSize: 18,
                        fontWeight: 800,
                        letterSpacing: 6,
                      }}
                    >
                      MY AI PET
                    </div>
                    <div
                      style={{
                        color: "#50c878",
                        fontSize: 10,
                        letterSpacing: 3,
                        marginTop: 2,
                      }}
                    >
                      ADVENTURE
                    </div>
                  </div>
                </div>
              )}

              {/* ── Main Content ── */}
              <div
                style={{
                  padding: "28px 24px 0",
                  opacity: booted ? 1 : 0,
                  transition: "opacity 0.4s ease",
                }}
              >
                {/* Show menu or selected mode */}
                {!isInMode ? (
                  <>
                    {/* Header */}
                    <div style={{ textAlign: "center", marginBottom: 28 }}>
                      <h2
                        style={{
                          color: "#e0e0e0",
                          fontSize: 22,
                          fontWeight: 700,
                          letterSpacing: 2,
                          margin: 0,
                        }}
                      >
                        ADVENTURE
                      </h2>
                      <p
                        style={{
                          color: "#666",
                          fontSize: 12,
                          marginTop: 6,
                          letterSpacing: 1,
                        }}
                      >
                        SELECT YOUR MODE
                      </p>
                    </div>

                    {/* ── Horizontal scrollable card row (Switch game tiles) ── */}
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        overflowX: "auto",
                        overflowY: "hidden",
                        padding: "8px 4px 20px",
                        scrollSnapType: "x mandatory",
                        WebkitOverflowScrolling: "touch",
                        justifyContent: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      {MENU_ITEMS.map((item) => {
                        const isActive = item.available;

                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              if (item.available) {
                                setSelected(item.id);
                              }
                            }}
                            style={{
                              position: "relative",
                              width: 155,
                              minHeight: 210,
                              flexShrink: 0,
                              scrollSnapAlign: "center",
                              background: isActive
                                ? "linear-gradient(180deg, #1a2a1a 0%, #111118 70%)"
                                : "linear-gradient(180deg, #131318 0%, #0f0f14 70%)",
                              border: isActive
                                ? `2px solid ${item.accent}44`
                                : "2px solid #1a1a24",
                              borderRadius: 16,
                              padding: "28px 14px 18px",
                              cursor: isActive ? "pointer" : "default",
                              textAlign: "center",
                              transition: "all 0.25s ease",
                              opacity: 1,
                              animation: isActive
                                ? "glowPulse 3s ease-in-out infinite"
                                : "none",
                              outline: "none",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              overflow: "hidden",
                              transform: isActive ? "scale(1.04)" : "scale(1)",
                            }}
                            onMouseEnter={(e) => {
                              if (isActive) {
                                (e.currentTarget as HTMLElement).style.transform =
                                  "scale(1.08) translateY(-4px)";
                                (e.currentTarget as HTMLElement).style.borderColor =
                                  `${item.accent}88`;
                              }
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.transform =
                                isActive ? "scale(1.04)" : "scale(1)";
                              (e.currentTarget as HTMLElement).style.borderColor =
                                isActive
                                  ? `${item.accent}44`
                                  : "#1a1a24";
                            }}
                          >
                            {/* Coming soon overlay */}
                            {!isActive && (
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  background: "rgba(10,10,15,0.55)",
                                  borderRadius: 14,
                                  zIndex: 2,
                                  display: "flex",
                                  alignItems: "flex-end",
                                  justifyContent: "center",
                                  paddingBottom: 16,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 600,
                                    letterSpacing: 1.5,
                                    color: "#555",
                                    background: "#ffffff08",
                                    padding: "4px 10px",
                                    borderRadius: 6,
                                    border: "1px solid #ffffff10",
                                  }}
                                >
                                  COMING SOON
                                </span>
                              </div>
                            )}

                            {/* Icon (large, centered) */}
                            <div
                              style={{
                                fontSize: 42,
                                marginBottom: 8,
                                filter: isActive ? "none" : "grayscale(0.7)",
                              }}
                            >
                              {item.icon}
                            </div>

                            {/* Title */}
                            <div
                              style={{
                                color: isActive ? "#e0e0e0" : "#555",
                                fontSize: 14,
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                marginBottom: 2,
                              }}
                            >
                              {item.title}
                            </div>

                            {/* Description */}
                            <div
                              style={{
                                color: isActive ? "#888" : "#444",
                                fontSize: 11,
                                lineHeight: 1.4,
                              }}
                            >
                              {item.desc}
                            </div>

                            {/* Status badge (active items only) */}
                            {isActive && (
                              <div
                                style={{
                                  marginTop: 10,
                                  padding: "4px 10px",
                                  borderRadius: 8,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  letterSpacing: 0.8,
                                  background: `${item.accent}18`,
                                  color: item.accent,
                                  border: `1px solid ${item.accent}30`,
                                }}
                              >
                                READY
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : selected === "battle" ? (
                  /* ── Arena mode ── */
                  <div>
                    <BackButton onClick={() => setSelected(null)} accent="#50c878" />
                    <Arena />
                  </div>
                ) : selected === "wild" ? (
                  <WildEncounter onBack={() => setSelected(null)} />
                ) : selected === "explore" ? (
                  <Explore onBack={() => setSelected(null)} />
                ) : selected === "gym" ? (
                  <GymChallenge onBack={() => setSelected(null)} />
                ) : null}
              </div>

              {/* ── Controller Buttons ── */}
              <div style={{
                padding: "12px 24px 8px", display: "flex", justifyContent: "space-between",
                alignItems: "center", opacity: booted ? 1 : 0, transition: "opacity 0.4s ease 0.3s",
              }}>
                {/* D-Pad (Left side) */}
                <div style={{ position: "relative", width: 80, height: 80 }}>
                  {[
                    { label: "\u25B2", top: 0, left: 24, w: 28, h: 24 },
                    { label: "\u25BC", top: 52, left: 24, w: 28, h: 24 },
                    { label: "\u25C0", top: 24, left: 0, w: 24, h: 28 },
                    { label: "\u25B6", top: 24, left: 52, w: 24, h: 28 },
                  ].map(d => (
                    <div key={d.label} style={{
                      position: "absolute", top: d.top, left: d.left, width: d.w, height: d.h,
                      background: "linear-gradient(180deg, #2a2a35, #1e1e28)",
                      border: "1px solid #333340", borderRadius: 4,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#555", fontSize: 10, cursor: "default",
                      userSelect: "none" as const,
                    }}>
                      {d.label}
                    </div>
                  ))}
                  {/* Center of D-pad */}
                  <div style={{
                    position: "absolute", top: 24, left: 24, width: 28, height: 28,
                    background: "#22222c", border: "1px solid #333340", borderRadius: 2,
                  }} />
                </div>

                {/* Center hint text */}
                <div style={{
                  fontFamily: "mono", fontSize: 9, color: "#444", textAlign: "center",
                  letterSpacing: 1,
                }}>
                  {isInMode ? "B = BACK" : "A = SELECT"}
                </div>

                {/* ABXY Buttons (Right side) */}
                <div style={{ position: "relative", width: 80, height: 80 }}>
                  {[
                    { label: "X", top: 0, left: 28, color: "#64b5f6" },
                    { label: "B", top: 52, left: 28, color: "#ffa726", action: () => isInMode && setSelected(null) },
                    { label: "Y", top: 26, left: 2, color: "#66bb6a" },
                    { label: "A", top: 26, left: 54, color: "#ef5350" },
                  ].map(b => (
                    <button key={b.label} onClick={() => b.action?.()}
                      style={{
                        position: "absolute", top: b.top, left: b.left, width: 24, height: 24,
                        borderRadius: "50%",
                        background: `linear-gradient(180deg, ${b.color}33, ${b.color}15)`,
                        border: `1.5px solid ${b.color}55`,
                        color: b.color, fontSize: 10, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: b.action ? "pointer" : "default",
                        fontFamily: "inherit", outline: "none",
                        transition: "all 0.15s ease",
                        boxShadow: `0 0 6px ${b.color}20`,
                      }}
                      onMouseEnter={e => { if (b.action) e.currentTarget.style.boxShadow = `0 0 12px ${b.color}40`; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = `0 0 6px ${b.color}20`; }}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Bottom status bar (Switch-style) ── */}
              <div
                style={{
                  borderTop: "1px solid #1a1a22",
                  padding: "8px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 8,
                  opacity: booted ? 0.7 : 0,
                  transition: "opacity 0.4s ease 0.2s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    color: "#555",
                    fontSize: 11,
                  }}
                >
                  <span title="Settings" style={{ cursor: "default" }}>
                    {"\u2699\uFE0F"}
                  </span>
                  <span title="Controller" style={{ cursor: "default" }}>
                    {"\u{1F3AE}"}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    color: "#555",
                    fontSize: 11,
                    letterSpacing: 1,
                  }}
                >
                  <span title="WiFi">{"\u{1F4F6}"}</span>
                  <span
                    title="Battery"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    {"\u{1F50B}"}
                    <span style={{ fontSize: 9 }}>98%</span>
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 10 }}>
                    {now}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right Joy-Con (neon red) ── */}
          <div
            className="joycon-right"
            style={{
              width: 8,
              minHeight: 500,
              background: "linear-gradient(180deg, #ff3c50 0%, #cc2233 100%)",
              borderRadius: "0 20px 20px 0",
              flexShrink: 0,
              boxShadow: "inset 1px 0 4px rgba(255,60,80,0.3), 0 0 12px rgba(255,60,80,0.15)",
            }}
          />
        </div>
      </section>

      {/* ── Responsive: hide Joy-Cons on mobile, stack cards vertically ── */}
      <style>{`
        @media (max-width: 640px) {
          .joycon-left, .joycon-right {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}

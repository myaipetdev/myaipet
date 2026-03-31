"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

interface BattlePet {
  pet: Pet;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  energy: number;
  maxEnergy: number;
}

interface Skill {
  name: string;
  emoji: string;
  power: number;
  accuracy: number;
  type: "physical" | "special" | "status";
  energyCost: number;
  levelReq: number;
  effect?: string;
  description: string;
}

interface BattleLogEntry {
  turn: number;
  text: string;
  type: "player" | "opponent" | "system" | "critical";
}

// ── Constants ──
const PET_EMOJIS = [
  "🐱", "🐕", "🦜", "🐢", "🐹", "🐰", "🦊", "🐶",
  "🐕‍🦺", "🐶", "🐉", "🦅", "🦄", "🐺", "🐯", "🐼",
  "🐧", "🦉", "🐻", "🐒", "🐍", "🦅", "🐬", "🦈",
  "🦝", "🐾", "🦎", "🐹",
];
const SPECIES_NAMES = [
  "Cat", "Dog", "Parrot", "Turtle", "Hamster", "Rabbit", "Fox", "Pomeranian",
  "Shiba Inu", "Doge", "Dragon", "Phoenix", "Unicorn", "Wolf", "Tiger", "Panda",
  "Penguin", "Owl", "Bear", "Monkey", "Snake", "Eagle", "Dolphin", "Shark",
  "Raccoon", "Red Panda", "Axolotl", "Capybara",
];

const OPPONENT_NAMES = [
  "Shadow", "Thunder", "Blaze", "Frostbite", "Venom", "Spark", "Storm",
  "Phantom", "Razor", "Eclipse", "Cyclone", "Inferno", "Glacier", "Nova",
  "Onyx", "Crimson", "Tempest", "Nebula", "Titan", "Fury",
  "Sakura", "Kaida", "Fang", "Ember", "Riptide", "Nimbus", "Zephyr",
  "Obsidian", "Sable", "Cinder", "Frost", "Borealis", "Jinx", "Basalt",
  "Pyro", "Aqua", "Terra", "Gale", "Nyx", "Solaris",
];

const OPPONENT_OWNERS = [
  "CryptoTrainer", "BattleMaster42", "PetChampion", "ArenaKing",
  "DarkRival", "EliteBreeder", "NeonFighter", "PixelWarrior",
  "BlockBrawler", "ChainChamp",
];

const OPPONENT_PERSONALITIES: Record<string, string[]> = {
  "Shiba Inu": ["brave", "playful"],
  "Doge": ["playful", "lazy"],
  "Dragon": ["brave"],
  "Phoenix": ["brave", "gentle"],
  "Unicorn": ["gentle"],
  "Wolf": ["brave"],
  "Tiger": ["brave"],
  "Panda": ["lazy", "gentle"],
  "Penguin": ["playful", "gentle"],
  "Owl": ["gentle"],
  "Bear": ["brave", "lazy"],
  "Monkey": ["playful"],
  "Snake": ["brave"],
  "Eagle": ["brave"],
  "Dolphin": ["playful", "gentle"],
  "Shark": ["brave"],
  "Raccoon": ["playful"],
  "Red Panda": ["gentle", "playful"],
  "Axolotl": ["gentle", "lazy"],
  "Capybara": ["lazy", "gentle"],
};

const PERSONALITIES = ["brave", "gentle", "playful", "lazy"] as const;

// ── Skills Database ──
const ALL_SKILLS: Skill[] = [
  {
    name: "Cute Attack",
    emoji: "🥺",
    power: 25,
    accuracy: 95,
    type: "special",
    energyCost: 0,
    levelReq: 1,
    effect: "def_down",
    description: "A charm-based attack that lowers opponent defense",
  },
  {
    name: "Scratch",
    emoji: "🐾",
    power: 35,
    accuracy: 90,
    type: "physical",
    energyCost: 0,
    levelReq: 1,
    description: "A basic physical attack with sharp claws",
  },
  {
    name: "Body Slam",
    emoji: "💥",
    power: 60,
    accuracy: 80,
    type: "physical",
    energyCost: 20,
    levelReq: 5,
    description: "A powerful slam that costs energy",
  },
  {
    name: "Dodge",
    emoji: "💨",
    power: 0,
    accuracy: 100,
    type: "status",
    energyCost: 5,
    levelReq: 5,
    effect: "dodge",
    description: "Evade the next attack and recover some HP",
  },
  {
    name: "Fury Swipe",
    emoji: "⚡",
    power: 20,
    accuracy: 85,
    type: "physical",
    energyCost: 15,
    levelReq: 10,
    effect: "multi_hit",
    description: "Hit 2-4 times in rapid succession",
  },
  {
    name: "Intimidate",
    emoji: "😈",
    power: 0,
    accuracy: 90,
    type: "status",
    energyCost: 10,
    levelReq: 10,
    effect: "atk_down",
    description: "Lower opponent ATK with a fearsome look",
  },
  {
    name: "Ultimate Charm",
    emoji: "✨",
    power: 80,
    accuracy: 75,
    type: "special",
    energyCost: 30,
    levelReq: 20,
    description: "An overwhelming special attack with max cuteness",
  },
  {
    name: "Iron Defense",
    emoji: "🛡️",
    power: 0,
    accuracy: 100,
    type: "status",
    energyCost: 15,
    levelReq: 20,
    effect: "def_up",
    description: "Massively boost defense for the next 2 turns",
  },
];

// ── Helpers ──
function getPersonalityModifiers(personality: string) {
  switch (personality) {
    case "brave": return { atk: 1.3, def: 1.0, spd: 1.0, hp: 1.0 };
    case "gentle": return { atk: 1.0, def: 1.3, spd: 1.0, hp: 1.0 };
    case "playful": return { atk: 1.0, def: 1.0, spd: 1.3, hp: 1.0 };
    case "lazy": return { atk: 1.0, def: 1.0, spd: 1.0, hp: 1.3 };
    default: return { atk: 1.1, def: 1.1, spd: 1.1, hp: 1.1 };
  }
}

function buildBattlePet(pet: Pet): BattlePet {
  const mods = getPersonalityModifiers(pet.personality_type);
  const baseHp = pet.level * 10 + pet.happiness;
  const baseAtk = 10 + pet.level * 3;
  const baseDef = 8 + pet.level * 2;
  const baseSpd = 6 + pet.level * 2;

  return {
    pet,
    hp: Math.floor(baseHp * mods.hp),
    maxHp: Math.floor(baseHp * mods.hp),
    atk: Math.floor(baseAtk * mods.atk),
    def: Math.floor(baseDef * mods.def),
    spd: Math.floor(baseSpd * mods.spd),
    energy: 50,
    maxEnergy: 50 + pet.level * 2,
  };
}

function generateOpponent(playerLevel: number): Pet {
  const levelVariance = Math.floor(Math.random() * 5) - 2;
  const level = Math.max(1, playerLevel + levelVariance);
  const species = Math.floor(Math.random() * PET_EMOJIS.length);
  const speciesName = SPECIES_NAMES[species] || "Pet";
  const speciesPersonalities = OPPONENT_PERSONALITIES[speciesName];
  const personality = speciesPersonalities
    ? speciesPersonalities[Math.floor(Math.random() * speciesPersonalities.length)]
    : PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];

  return {
    id: 9000 + Math.floor(Math.random() * 1000),
    name: OPPONENT_NAMES[Math.floor(Math.random() * OPPONENT_NAMES.length)],
    species,
    personality_type: personality,
    level,
    experience: level * 60,
    happiness: 50 + Math.floor(Math.random() * 50),
    energy: 70 + Math.floor(Math.random() * 30),
    hunger: Math.floor(Math.random() * 50),
    bond_level: 40 + Math.floor(Math.random() * 40),
    total_interactions: Math.floor(Math.random() * 100),
    current_mood: "focused",
    is_active: true,
  };
}

function getAvailableSkills(level: number): Skill[] {
  return ALL_SKILLS.filter((s) => s.levelReq <= level);
}

function getHpColor(ratio: number): string {
  if (ratio > 0.5) return "#4ade80";
  if (ratio > 0.25) return "#facc15";
  return "#f87171";
}

function getHpBarGradient(ratio: number): string {
  if (ratio > 0.5) return "linear-gradient(90deg, #22c55e, #4ade80)";
  if (ratio > 0.25) return "linear-gradient(90deg, #eab308, #facc15)";
  return "linear-gradient(90deg, #dc2626, #f87171)";
}

// ── HP Bar Component ──
function HpBar({ current, max, label, level, name }: {
  current: number; max: number; label: string; level: number; name: string;
}) {
  const ratio = Math.max(0, current / max);
  return (
    <div style={{
      background: "rgba(0,0,0,0.6)",
      borderRadius: 12,
      padding: "10px 16px",
      minWidth: 220,
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,0.1)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 14, fontWeight: 700, color: "#fff",
        }}>
          {name}
        </span>
        <span style={{
          fontFamily: "monospace", fontSize: 11, fontWeight: 600,
          color: "rgba(245,158,11,0.9)",
          background: "rgba(245,158,11,0.15)",
          padding: "1px 8px", borderRadius: 6,
        }}>
          Lv.{level}
        </span>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          fontFamily: "monospace", fontSize: 10, fontWeight: 700,
          color: "rgba(255,255,255,0.5)", width: 20,
        }}>
          HP
        </span>
        <div style={{
          flex: 1, height: 10, background: "rgba(255,255,255,0.1)",
          borderRadius: 5, overflow: "hidden", position: "relative",
        }}>
          <div style={{
            height: "100%",
            width: `${ratio * 100}%`,
            background: getHpBarGradient(ratio),
            borderRadius: 5,
            transition: "width 0.5s ease, background 0.5s ease",
            boxShadow: `0 0 8px ${getHpColor(ratio)}40`,
          }} />
        </div>
      </div>
      <div style={{
        fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.5)",
        textAlign: "right", marginTop: 2,
      }}>
        {Math.max(0, current)} / {max}
      </div>
    </div>
  );
}

// ── Battle Log Component ──
function BattleLog({ entries }: { entries: BattleLogEntry[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div
      ref={logRef}
      style={{
        background: "rgba(0,0,0,0.7)",
        borderRadius: 12,
        padding: "12px 16px",
        maxHeight: 140,
        overflowY: "auto",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(8px)",
      }}
    >
      {entries.length === 0 && (
        <div style={{
          fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.3)",
          textAlign: "center", padding: 8,
        }}>
          Battle starting...
        </div>
      )}
      {entries.map((entry, i) => (
        <div
          key={i}
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: 1.6,
            color:
              entry.type === "player" ? "#4ade80" :
              entry.type === "opponent" ? "#f87171" :
              entry.type === "critical" ? "#facc15" :
              "rgba(255,255,255,0.5)",
            animation: i === entries.length - 1 ? "logFadeIn 0.3s ease-out" : undefined,
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.2)", marginRight: 6 }}>
            T{entry.turn}
          </span>
          {entry.text}
        </div>
      ))}
    </div>
  );
}

// ── Skill Button Component ──
function SkillButton({ skill, onClick, disabled, energyAvailable }: {
  skill: Skill;
  onClick: () => void;
  disabled: boolean;
  energyAvailable: number;
}) {
  const cantAfford = skill.energyCost > energyAvailable;
  const isDisabled = disabled || cantAfford;

  const typeColor =
    skill.type === "physical" ? "#f97316" :
    skill.type === "special" ? "#a78bfa" :
    "#38bdf8";

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      title={skill.description}
      style={{
        flex: 1,
        padding: "12px 8px",
        borderRadius: 10,
        cursor: isDisabled ? "not-allowed" : "pointer",
        background: isDisabled
          ? "rgba(255,255,255,0.03)"
          : "rgba(245,158,11,0.12)",
        border: isDisabled
          ? "1px solid rgba(255,255,255,0.05)"
          : "1px solid rgba(245,158,11,0.35)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        transition: "all 0.2s",
        opacity: isDisabled ? 0.4 : 1,
        transform: "scale(1)",
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)";
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.2)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLButtonElement).style.background = isDisabled
          ? "rgba(255,255,255,0.03)"
          : "rgba(245,158,11,0.12)";
      }}
    >
      <span style={{ fontSize: 20 }}>{skill.emoji}</span>
      <span style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        color: isDisabled ? "rgba(255,255,255,0.2)" : "#f59e0b",
      }}>
        {skill.name}
      </span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {skill.power > 0 && (
          <span style={{
            fontFamily: "monospace", fontSize: 9,
            color: typeColor, fontWeight: 600,
          }}>
            PWR {skill.power}
          </span>
        )}
        {skill.energyCost > 0 && (
          <span style={{
            fontFamily: "monospace", fontSize: 9,
            color: cantAfford ? "#f87171" : "rgba(255,255,255,0.3)",
          }}>
            EP {skill.energyCost}
          </span>
        )}
        {skill.power === 0 && skill.energyCost === 0 && (
          <span style={{
            fontFamily: "monospace", fontSize: 9,
            color: "rgba(255,255,255,0.3)",
          }}>
            STATUS
          </span>
        )}
      </div>
    </button>
  );
}

// ── Victory / Defeat Overlay ──
function ResultOverlay({ won, points, onClose }: {
  won: boolean; points: number; onClose: () => void;
}) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 30,
      background: won
        ? "radial-gradient(ellipse at center, rgba(74,222,128,0.15), rgba(0,0,0,0.85))"
        : "radial-gradient(ellipse at center, rgba(248,113,113,0.15), rgba(0,0,0,0.85))",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "resultFadeIn 0.5s ease-out",
      borderRadius: 16,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 64, marginBottom: 12,
          animation: "resultBounce 0.6s ease-out",
        }}>
          {won ? "🏆" : "💀"}
        </div>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 32, fontWeight: 800,
          color: won ? "#4ade80" : "#f87171",
          marginBottom: 8,
          letterSpacing: "-0.03em",
          textShadow: won
            ? "0 0 40px rgba(74,222,128,0.5)"
            : "0 0 40px rgba(248,113,113,0.5)",
        }}>
          {won ? "VICTORY!" : "DEFEATED"}
        </div>
        <div style={{
          fontFamily: "monospace", fontSize: 14,
          color: "rgba(255,255,255,0.5)", marginBottom: 16,
        }}>
          {won
            ? `Your pet fought bravely and earned ${points} points!`
            : "Your pet fought hard. Train more and try again!"}
        </div>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 28, fontWeight: 700,
          color: won ? "#f59e0b" : "rgba(255,255,255,0.3)",
          marginBottom: 24,
        }}>
          {won ? `+${points} PTS` : "+5 PTS"}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(245,158,11,0.15)",
            border: "1px solid rgba(245,158,11,0.4)",
            borderRadius: 12,
            padding: "14px 40px",
            cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 15,
            fontWeight: 700,
            color: "#f59e0b",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.25)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.15)";
          }}
        >
          Return to Arena
        </button>
      </div>
    </div>
  );
}

// ── Phase Enum ──
type Phase = "select" | "matchmaking" | "battle" | "result";

// ══════════════════════════════════════════════════════
// ── Main Arena Component ──
// ══════════════════════════════════════════════════════
export default function Arena() {
  // ── State ──
  const [phase, setPhase] = useState<Phase>("select");
  const [myPets, setMyPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [player, setPlayer] = useState<BattlePet | null>(null);
  const [opponent, setOpponent] = useState<BattlePet | null>(null);
  const [opponentOwner, setOpponentOwner] = useState("");

  const [turn, setTurn] = useState(1);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([]);
  const [battleOver, setBattleOver] = useState(false);
  const [playerWon, setPlayerWon] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [animating, setAnimating] = useState(false);

  // status effects
  const [playerDodging, setPlayerDodging] = useState(false);
  const [opponentDodging, setOpponentDodging] = useState(false);
  const [playerDefBuff, setPlayerDefBuff] = useState(0);
  const [opponentDefBuff, setOpponentDefBuff] = useState(0);

  // animations
  const [playerShake, setPlayerShake] = useState(false);
  const [opponentShake, setOpponentShake] = useState(false);
  const [playerFaint, setPlayerFaint] = useState(false);
  const [opponentFaint, setOpponentFaint] = useState(false);

  // ── Fetch User Pets ──
  useEffect(() => {
    let cancelled = false;
    async function fetchPets() {
      try {
        setLoading(true);
        const data = await api.pets.list();
        if (!cancelled) {
          setMyPets(data.pets || data || []);
        }
      } catch (err: any) {
        if (!cancelled) {
          // Use fallback mock data if API fails
          setMyPets([
            {
              id: 1, name: "Luna", species: 0, personality_type: "playful", level: 5,
              experience: 320, happiness: 85, energy: 72, hunger: 45, bond_level: 68,
              total_interactions: 47, current_mood: "happy", is_active: true,
            },
            {
              id: 2, name: "Mochi", species: 1, personality_type: "brave", level: 8,
              experience: 580, happiness: 78, energy: 60, hunger: 30, bond_level: 55,
              total_interactions: 28, current_mood: "focused", is_active: true,
            },
            {
              id: 3, name: "Pixel", species: 6, personality_type: "gentle", level: 12,
              experience: 920, happiness: 90, energy: 88, hunger: 20, bond_level: 72,
              total_interactions: 65, current_mood: "content", is_active: true,
            },
          ]);
          setError(null); // suppress error since we have fallback
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPets();
    return () => { cancelled = true; };
  }, []);

  // ── Start Battle ──
  const startBattle = useCallback(async (pet: Pet) => {
    setSelectedPet(pet);
    setPhase("matchmaking");

    let opp: Pet;
    let owner: string;

    try {
      // Try to find a real opponent from other users
      const data = await api.arena.findOpponent(pet.level);
      if (data.opponent) {
        opp = {
          id: data.opponent.id,
          name: data.opponent.name,
          level: data.opponent.level,
          species: 0,
          personality_type: data.opponent.personality_type,
          avatar_url: data.opponent.avatar_url,
          happiness: data.opponent.happiness || 70,
          energy: data.opponent.energy || 100,
          hunger: 30,
          bond_level: 0,
          experience: 0,
          total_interactions: data.opponent.total_interactions || 0,
          evolution_stage: data.opponent.evolution_stage || 0,
        };
        owner = data.opponent.wallet || "Trainer";
      } else {
        // Fallback to generated opponent
        opp = generateOpponent(pet.level);
        owner = OPPONENT_OWNERS[Math.floor(Math.random() * OPPONENT_OWNERS.length)];
      }
    } catch {
      opp = generateOpponent(pet.level);
      owner = OPPONENT_OWNERS[Math.floor(Math.random() * OPPONENT_OWNERS.length)];
    }

    setPlayer(buildBattlePet(pet));
    setOpponent(buildBattlePet(opp));
    setOpponentOwner(owner);
    setTurn(1);
    setIsPlayerTurn(true);
    setBattleLog([{
      turn: 0,
      text: `A wild ${opp.name} appears! (${owner}'s pet)`,
      type: "system",
    }]);
    setBattleOver(false);
    setPlayerWon(false);
    setPlayerDodging(false);
    setOpponentDodging(false);
    setPlayerDefBuff(0);
    setOpponentDefBuff(0);
    setPlayerFaint(false);
    setOpponentFaint(false);
    setPhase("battle");
  }, []);

  // ── Report battle result to server ──
  useEffect(() => {
    if (phase === "result" && selectedPet && opponent) {
      api.arena.reportResult(selectedPet.id, opponent.pet.id || 0, playerWon, turn).catch(() => {});
    }
  }, [phase]);

  // ── Add Log Entry ──
  const addLog = useCallback((text: string, type: BattleLogEntry["type"]) => {
    setBattleLog((prev) => [...prev, { turn, text, type }]);
  }, [turn]);

  // ── Calculate Damage ──
  const calcDamage = (
    attackerAtk: number,
    defenderDef: number,
    skillPower: number,
    defBuff: number
  ): number => {
    const effectiveDef = defenderDef * (1 + defBuff * 0.3);
    const baseDmg = Math.max(1, (attackerAtk * skillPower) / (effectiveDef * 2 + 10));
    const variance = 0.85 + Math.random() * 0.3;
    return Math.floor(baseDmg * variance);
  };

  // ── Player Uses Skill ──
  const useSkill = useCallback((skill: Skill) => {
    if (!player || !opponent || battleOver || !isPlayerTurn || animating) return;

    setAnimating(true);

    // Check energy
    if (player.energy < skill.energyCost) {
      addLog("Not enough energy!", "system");
      setAnimating(false);
      return;
    }

    // Deduct energy
    setPlayer((prev) => prev ? { ...prev, energy: prev.energy - skill.energyCost } : prev);

    // Accuracy check
    const hit = Math.random() * 100 < skill.accuracy;

    if (!hit) {
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}... but missed!`, "player");
      setTimeout(() => opponentTurn(), 1200);
      return;
    }

    // Check if opponent is dodging
    if (opponentDodging && skill.power > 0) {
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}... but ${opponent.pet.name} dodged!`, "player");
      setOpponentDodging(false);
      setTimeout(() => opponentTurn(), 1200);
      return;
    }

    // Apply skill effects
    if (skill.effect === "dodge") {
      setPlayerDodging(true);
      // Heal a small amount
      const healAmt = Math.floor(player.maxHp * 0.08);
      setPlayer((prev) => prev ? { ...prev, hp: Math.min(prev.maxHp, prev.hp + healAmt) } : prev);
      addLog(`${player.pet.name} takes a defensive stance! ${skill.emoji} (+${healAmt} HP)`, "player");
      setTimeout(() => opponentTurn(), 1000);
      return;
    }

    if (skill.effect === "def_down") {
      const dmg = calcDamage(player.atk, opponent.def, skill.power, opponentDefBuff);
      setOpponentShake(true);
      setTimeout(() => setOpponentShake(false), 400);
      setOpponent((prev) => prev ? { ...prev, hp: prev.hp - dmg, def: Math.max(1, prev.def - 3) } : prev);
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}! -${dmg} HP (DEF down!)`, "player");
    } else if (skill.effect === "atk_down") {
      setOpponent((prev) => prev ? { ...prev, atk: Math.max(1, prev.atk - 5) } : prev);
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}! ${opponent.pet.name}'s ATK fell sharply!`, "player");
    } else if (skill.effect === "def_up") {
      setPlayerDefBuff((prev) => prev + 2);
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}! Defense rose sharply!`, "player");
    } else if (skill.effect === "multi_hit") {
      const hits = 2 + Math.floor(Math.random() * 3); // 2-4 hits
      let totalDmg = 0;
      for (let i = 0; i < hits; i++) {
        totalDmg += calcDamage(player.atk, opponent.def, skill.power, opponentDefBuff);
      }
      setOpponentShake(true);
      setTimeout(() => setOpponentShake(false), 500);
      setOpponent((prev) => prev ? { ...prev, hp: prev.hp - totalDmg } : prev);
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}! Hit ${hits} times for ${totalDmg} total damage!`, "critical");
    } else {
      // Normal damage skill
      const isCrit = Math.random() < 0.12;
      let dmg = calcDamage(player.atk, opponent.def, skill.power, opponentDefBuff);
      if (isCrit) dmg = Math.floor(dmg * 1.5);
      setOpponentShake(true);
      setTimeout(() => setOpponentShake(false), 400);
      setOpponent((prev) => prev ? { ...prev, hp: prev.hp - dmg } : prev);
      if (isCrit) {
        addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}! CRITICAL HIT! -${dmg} HP`, "critical");
      } else {
        addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}! -${dmg} HP`, "player");
      }
    }

    // Energy regen
    setPlayer((prev) => prev ? { ...prev, energy: Math.min(prev.maxEnergy, prev.energy + 3) } : prev);

    // Check opponent faint
    setTimeout(() => {
      let fainted = false;
      setOpponent((prev) => {
        if (prev && prev.hp <= 0) {
          fainted = true;
          setOpponentFaint(true);
          const pts = 20 + (prev.pet.level * 5);
          setEarnedPoints(pts);
          setBattleOver(true);
          setPlayerWon(true);
          addLog(`${prev.pet.name} fainted! You win!`, "system");
          setTimeout(() => setPhase("result"), 1500);
          return { ...prev, hp: 0 };
        }
        return prev;
      });
      // If opponent alive, opponent turn
      setTimeout(() => {
        if (!fainted) {
          opponentTurn();
        }
      }, 300);
    }, 500);
  }, [player, opponent, battleOver, isPlayerTurn, animating, opponentDodging, opponentDefBuff, turn, addLog]);

  // ── Opponent Turn ──
  const opponentTurn = useCallback(() => {
    setIsPlayerTurn(false);

    setTimeout(() => {
      if (!opponent || !player || battleOver) {
        setAnimating(false);
        return;
      }

      const oppSkills = getAvailableSkills(opponent.pet.level);
      const affordableSkills = oppSkills.filter((s) => s.energyCost <= opponent.energy);
      const skill = affordableSkills.length > 0
        ? affordableSkills[Math.floor(Math.random() * affordableSkills.length)]
        : oppSkills[0]; // fallback to basic attack

      // Accuracy check
      const hit = Math.random() * 100 < skill.accuracy;

      if (!hit) {
        addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}... but missed!`, "opponent");
      } else if (playerDodging && skill.power > 0) {
        addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}... but ${player.pet.name} dodged!`, "opponent");
        setPlayerDodging(false);
      } else if (skill.power > 0) {
        const isCrit = Math.random() < 0.1;
        let dmg = calcDamage(opponent.atk, player.def, skill.power, playerDefBuff);
        if (isCrit) dmg = Math.floor(dmg * 1.5);

        setPlayerShake(true);
        setTimeout(() => setPlayerShake(false), 400);

        setPlayer((prev) => {
          if (!prev) return prev;
          const newHp = prev.hp - dmg;
          if (newHp <= 0) {
            setPlayerFaint(true);
            setBattleOver(true);
            setPlayerWon(false);
            setEarnedPoints(5);
            addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}! -${dmg} HP`, "opponent");
            addLog(`${prev.pet.name} fainted... You lost.`, "system");
            setTimeout(() => setPhase("result"), 1500);
            return { ...prev, hp: 0 };
          }
          return { ...prev, hp: newHp };
        });

        if (isCrit) {
          addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}! CRITICAL HIT! -${dmg} HP`, "critical");
        } else {
          addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}! -${dmg} HP`, "opponent");
        }
      } else {
        // Status move
        if (skill.effect === "dodge") {
          setOpponentDodging(true);
          addLog(`${opponent.pet.name} takes a defensive stance! ${skill.emoji}`, "opponent");
        } else if (skill.effect === "atk_down") {
          setPlayer((prev) => prev ? { ...prev, atk: Math.max(1, prev.atk - 4) } : prev);
          addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}! Your ATK fell!`, "opponent");
        } else if (skill.effect === "def_up") {
          setOpponentDefBuff((prev) => prev + 2);
          addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}! Defense rose!`, "opponent");
        }
      }

      // Deduct opponent energy, add regen
      setOpponent((prev) => prev ? {
        ...prev,
        energy: Math.min(prev.maxEnergy, prev.energy - skill.energyCost + 3),
      } : prev);

      // Decay def buffs
      if (playerDefBuff > 0) setPlayerDefBuff((prev) => prev - 1);
      if (opponentDefBuff > 0) setOpponentDefBuff((prev) => prev - 1);

      // Next turn
      setTurn((prev) => prev + 1);
      setIsPlayerTurn(true);
      setAnimating(false);
    }, 1000);
  }, [opponent, player, battleOver, playerDodging, playerDefBuff, opponentDefBuff, turn, addLog]);

  // ── Reset Battle ──
  const resetBattle = () => {
    setPhase("select");
    setPlayer(null);
    setOpponent(null);
    setBattleLog([]);
    setBattleOver(false);
    setSelectedPet(null);
    setPlayerFaint(false);
    setOpponentFaint(false);
    setAnimating(false);
  };

  // ── Available skills for current player ──
  const skills = player ? getAvailableSkills(player.pet.level).slice(0, 4) : [];
  const lockedSkills = player
    ? ALL_SKILLS.filter((s) => s.levelReq > player.pet.level)
    : [];

  // ══════════════════════════════════════
  // ── RENDER ──
  // ══════════════════════════════════════
  return (
    <div style={{
      padding: "0 24px 60px",
      maxWidth: 1000,
      margin: "0 auto",
      paddingTop: 90,
      minHeight: "100vh",
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes shake { 0%,100% { transform:translateX(0) } 20% { transform:translateX(-8px) } 40% { transform:translateX(8px) } 60% { transform:translateX(-5px) } 80% { transform:translateX(5px) } }
        @keyframes faintAnim { from { opacity:1; transform:translateY(0) } to { opacity:0; transform:translateY(30px) } }
        @keyframes float { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-6px) } }
        @keyframes pulse2 { 0%,100% { opacity:1 } 50% { opacity:0.6 } }
        @keyframes resultFadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes resultBounce { 0% { transform:scale(0.3); opacity:0 } 50% { transform:scale(1.15) } 100% { transform:scale(1); opacity:1 } }
        @keyframes logFadeIn { from { opacity:0; transform:translateX(-8px) } to { opacity:1; transform:translateX(0) } }
        @keyframes scanline { 0% { transform:translateY(-100%) } 100% { transform:translateY(100%) } }
        @keyframes matchmakingPulse { 0%,100% { box-shadow:0 0 20px rgba(245,158,11,0.2) } 50% { box-shadow:0 0 40px rgba(245,158,11,0.5) } }
        @keyframes slideInLeft { from { opacity:0; transform:translateX(-40px) } to { opacity:1; transform:translateX(0) } }
        @keyframes slideInRight { from { opacity:0; transform:translateX(40px) } to { opacity:1; transform:translateX(0) } }
        @keyframes energyPulse { 0%,100% { opacity:0.7 } 50% { opacity:1 } }

        .arena-skill-btn:active:not(:disabled) {
          transform: scale(0.95) !important;
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 24 }}>
        <h2 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 22, fontWeight: 700,
          color: "#1a1a2e", margin: 0,
          letterSpacing: "-0.03em",
        }}>
          Pet Arena
        </h2>
        <span style={{
          fontFamily: "monospace", fontSize: 9, padding: "3px 10px", borderRadius: 8,
          background: "rgba(245,158,11,0.08)", color: "#b45309",
          border: "1px solid rgba(245,158,11,0.15)", fontWeight: 600,
        }}>
          BATTLE MODE
        </span>
        {phase === "battle" && (
          <span style={{
            fontFamily: "monospace", fontSize: 9, padding: "3px 10px", borderRadius: 8,
            background: "rgba(239,68,68,0.08)", color: "#dc2626",
            border: "1px solid rgba(239,68,68,0.15)", fontWeight: 600,
            animation: "pulse2 1.5s ease infinite",
          }}>
            LIVE
          </span>
        )}
      </div>

      {/* ════════════════════════════════════════ */}
      {/* ── PHASE: PET SELECT ── */}
      {/* ════════════════════════════════════════ */}
      {phase === "select" && (
        <div style={{ animation: "fadeUp 0.4s ease-out" }}>
          <div style={{
            background: "linear-gradient(135deg, rgba(15,15,35,0.95), rgba(20,20,60,0.95))",
            borderRadius: 16, padding: "32px",
            border: "1px solid rgba(245,158,11,0.15)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          }}>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 20, fontWeight: 700,
              color: "#f59e0b", marginBottom: 4,
              textAlign: "center",
            }}>
              Choose Your Fighter
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 12,
              color: "rgba(255,255,255,0.4)", marginBottom: 28,
              textAlign: "center",
            }}>
              Select a pet to enter the arena
            </div>

            {loading ? (
              <div style={{
                textAlign: "center", padding: 40,
                fontFamily: "monospace", fontSize: 14, color: "rgba(255,255,255,0.4)",
              }}>
                Loading your pets...
              </div>
            ) : myPets.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 40,
                fontFamily: "monospace", fontSize: 14, color: "rgba(255,255,255,0.4)",
              }}>
                No pets found. Adopt a pet first to enter the arena!
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(myPets.length, 3)}, 1fr)`,
                gap: 16,
              }}>
                {myPets.map((pet) => {
                  const mods = getPersonalityModifiers(pet.personality_type);
                  const hp = Math.floor((pet.level * 10 + pet.happiness) * mods.hp);
                  const availSkills = getAvailableSkills(pet.level);
                  return (
                    <button
                      key={pet.id}
                      onClick={() => startBattle(pet)}
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(245,158,11,0.2)",
                        borderRadius: 14,
                        padding: "24px 20px",
                        cursor: "pointer",
                        transition: "all 0.3s",
                        textAlign: "center",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.08)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(245,158,11,0.5)";
                        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-4px)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(245,158,11,0.2)";
                        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                      }}
                    >
                      {/* Pet avatar */}
                      <div style={{
                        width: 72, height: 72, borderRadius: 16,
                        margin: "0 auto 14px",
                        border: "2px solid rgba(245,158,11,0.3)",
                        overflow: "hidden",
                        background: "rgba(245,158,11,0.05)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {pet.avatar_url ? (
                          <img src={pet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: 40 }}>{PET_EMOJIS[pet.species] || "🐾"}</span>
                        )}
                      </div>

                      {/* Pet name */}
                      <div style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 17, fontWeight: 700,
                        color: "#fff", marginBottom: 4,
                      }}>
                        {pet.name}
                      </div>
                      <div style={{
                        fontFamily: "monospace", fontSize: 11,
                        color: "rgba(255,255,255,0.4)", marginBottom: 14,
                      }}>
                        Lv.{pet.level} {(pet.personality_modifiers as any)?.species_name || "Pet"} / {pet.personality_type}
                      </div>

                      {/* Stats preview */}
                      <div style={{
                        display: "grid", gridTemplateColumns: "1fr 1fr",
                        gap: 6, marginBottom: 12,
                      }}>
                        {[
                          { label: "HP", value: hp, color: "#4ade80" },
                          { label: "ATK", value: Math.floor((10 + pet.level * 3) * mods.atk), color: "#f97316" },
                          { label: "DEF", value: Math.floor((8 + pet.level * 2) * mods.def), color: "#38bdf8" },
                          { label: "SPD", value: Math.floor((6 + pet.level * 2) * mods.spd), color: "#a78bfa" },
                        ].map((stat) => (
                          <div key={stat.label} style={{
                            background: "rgba(255,255,255,0.04)",
                            borderRadius: 6, padding: "4px 8px",
                            display: "flex", justifyContent: "space-between",
                          }}>
                            <span style={{
                              fontFamily: "monospace", fontSize: 10,
                              color: "rgba(255,255,255,0.35)",
                            }}>{stat.label}</span>
                            <span style={{
                              fontFamily: "monospace", fontSize: 10,
                              fontWeight: 700, color: stat.color,
                            }}>{stat.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Skills count */}
                      <div style={{
                        fontFamily: "monospace", fontSize: 10,
                        color: "rgba(245,158,11,0.6)",
                      }}>
                        {availSkills.length} skills unlocked
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* ── PHASE: MATCHMAKING ── */}
      {/* ════════════════════════════════════════ */}
      {phase === "matchmaking" && selectedPet && (
        <div style={{
          animation: "fadeUp 0.3s ease-out",
          background: "linear-gradient(180deg, rgba(10,10,30,0.97), rgba(15,15,50,0.97))",
          borderRadius: 16, padding: "80px 32px",
          border: "1px solid rgba(245,158,11,0.15)",
          textAlign: "center",
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            margin: "0 auto 20px",
            border: "3px solid rgba(245,158,11,0.4)",
            overflow: "hidden",
            background: "rgba(245,158,11,0.05)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "matchmakingPulse 1.5s ease infinite",
          }}>
            {selectedPet.avatar_url ? (
              <img src={selectedPet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 44 }}>{PET_EMOJIS[selectedPet.species] || "🐾"}</span>
            )}
          </div>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 22, fontWeight: 700,
            color: "#f59e0b", marginBottom: 8,
          }}>
            Searching for opponent...
          </div>
          <div style={{
            fontFamily: "monospace", fontSize: 13,
            color: "rgba(255,255,255,0.3)",
            animation: "pulse2 1s ease infinite",
          }}>
            Matching {selectedPet.name} (Lv.{selectedPet.level}) with a worthy rival
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* ── PHASE: BATTLE ── */}
      {/* ════════════════════════════════════════ */}
      {(phase === "battle" || phase === "result") && player && opponent && (
        <div style={{
          position: "relative",
          animation: "fadeUp 0.3s ease-out",
        }}>
          {/* Battle Arena */}
          <div style={{
            background: "linear-gradient(180deg, #0a0a1e 0%, #0f1035 40%, #131352 70%, #1a1a5c 100%)",
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(245,158,11,0.12)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
            position: "relative",
          }}>
            {/* Scanline effect */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              overflow: "hidden", opacity: 0.03, zIndex: 1,
            }}>
              <div style={{
                width: "100%", height: "200%",
                background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
                animation: "scanline 8s linear infinite",
              }} />
            </div>

            {/* ── Battle Field ── */}
            <div style={{
              padding: "24px 32px",
              minHeight: 320,
              position: "relative",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}>
              {/* Turn indicator */}
              <div style={{
                position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
                fontFamily: "monospace", fontSize: 11, fontWeight: 600,
                color: isPlayerTurn ? "#4ade80" : "#f87171",
                background: isPlayerTurn ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                padding: "3px 14px", borderRadius: 8,
                border: isPlayerTurn
                  ? "1px solid rgba(74,222,128,0.2)"
                  : "1px solid rgba(248,113,113,0.2)",
                zIndex: 5,
              }}>
                {battleOver
                  ? "BATTLE OVER"
                  : isPlayerTurn
                    ? "YOUR TURN"
                    : "OPPONENT'S TURN"}
              </div>

              {/* ── Opponent (top-right) ── */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 20,
                marginTop: 8,
              }}>
                {/* Opponent HP bar - top left */}
                <div style={{ animation: "slideInLeft 0.5s ease-out" }}>
                  <HpBar
                    current={opponent.hp}
                    max={opponent.maxHp}
                    label="opponent"
                    level={opponent.pet.level}
                    name={opponent.pet.name}
                  />
                  <div style={{
                    fontFamily: "monospace", fontSize: 9,
                    color: "rgba(255,255,255,0.25)", marginTop: 4, paddingLeft: 4,
                  }}>
                    Owner: {opponentOwner} / {opponent.pet.personality_type}
                  </div>
                </div>

                {/* Opponent pet sprite - top right */}
                <div style={{
                  animation: opponentFaint
                    ? "faintAnim 0.8s ease-in forwards"
                    : opponentShake
                      ? "shake 0.4s ease"
                      : "float 3s ease-in-out infinite",
                  marginRight: 20,
                }}>
                  <div style={{
                    width: 90, height: 90, borderRadius: 20,
                    border: "2px solid rgba(248,113,113,0.3)",
                    overflow: "hidden",
                    background: "rgba(248,113,113,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  }}>
                    {opponent.pet.avatar_url ? (
                      <img src={opponent.pet.avatar_url} alt="" style={{
                        width: "100%", height: "100%", objectFit: "cover",
                        transform: "scaleX(-1)", // face left
                      }} />
                    ) : (
                      <span style={{ fontSize: 52, transform: "scaleX(-1)" }}>
                        {PET_EMOJIS[opponent.pet.species] || "🐾"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Ground / mid section */}
              <div style={{
                height: 2,
                background: "linear-gradient(90deg, transparent, rgba(245,158,11,0.15), transparent)",
                margin: "0 40px",
              }} />

              {/* ── Player (bottom-left) ── */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginTop: 20,
              }}>
                {/* Player pet sprite - bottom left */}
                <div style={{
                  animation: playerFaint
                    ? "faintAnim 0.8s ease-in forwards"
                    : playerShake
                      ? "shake 0.4s ease"
                      : "float 3s ease-in-out infinite 0.5s",
                  marginLeft: 20,
                }}>
                  <div style={{
                    width: 100, height: 100, borderRadius: 22,
                    border: "2px solid rgba(74,222,128,0.3)",
                    overflow: "hidden",
                    background: "rgba(74,222,128,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  }}>
                    {player.pet.avatar_url ? (
                      <img src={player.pet.avatar_url} alt="" style={{
                        width: "100%", height: "100%", objectFit: "cover",
                      }} />
                    ) : (
                      <span style={{ fontSize: 56 }}>
                        {PET_EMOJIS[player.pet.species] || "🐾"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Player HP bar - bottom right */}
                <div style={{ animation: "slideInRight 0.5s ease-out" }}>
                  <HpBar
                    current={player.hp}
                    max={player.maxHp}
                    label="player"
                    level={player.pet.level}
                    name={player.pet.name}
                  />
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    marginTop: 6, paddingRight: 4,
                    justifyContent: "flex-end",
                  }}>
                    {/* Energy bar */}
                    <span style={{
                      fontFamily: "monospace", fontSize: 9, fontWeight: 700,
                      color: "rgba(245,158,11,0.5)",
                    }}>EP</span>
                    <div style={{
                      width: 100, height: 6,
                      background: "rgba(255,255,255,0.08)",
                      borderRadius: 3, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${(player.energy / player.maxEnergy) * 100}%`,
                        background: "linear-gradient(90deg, #f59e0b, #fbbf24)",
                        borderRadius: 3,
                        transition: "width 0.3s ease",
                        animation: player.energy < 15 ? "energyPulse 1s ease infinite" : "none",
                      }} />
                    </div>
                    <span style={{
                      fontFamily: "monospace", fontSize: 9,
                      color: "rgba(255,255,255,0.3)",
                    }}>
                      {player.energy}/{player.maxEnergy}
                    </span>
                  </div>
                  {/* Status effects */}
                  <div style={{
                    display: "flex", gap: 4, justifyContent: "flex-end",
                    marginTop: 4, paddingRight: 4,
                  }}>
                    {playerDodging && (
                      <span style={{
                        fontFamily: "monospace", fontSize: 9, padding: "1px 6px",
                        borderRadius: 4, background: "rgba(56,189,248,0.15)",
                        color: "#38bdf8", border: "1px solid rgba(56,189,248,0.3)",
                      }}>DODGE</span>
                    )}
                    {playerDefBuff > 0 && (
                      <span style={{
                        fontFamily: "monospace", fontSize: 9, padding: "1px 6px",
                        borderRadius: 4, background: "rgba(74,222,128,0.15)",
                        color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)",
                      }}>DEF+{playerDefBuff}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Battle Log ── */}
            <div style={{ padding: "0 24px 16px" }}>
              <BattleLog entries={battleLog} />
            </div>

            {/* ── Skill Buttons ── */}
            {!battleOver && (
              <div style={{
                padding: "0 24px 24px",
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(skills.length + lockedSkills.length, 4)}, 1fr)`,
                gap: 10,
              }}>
                {skills.map((skill) => (
                  <SkillButton
                    key={skill.name}
                    skill={skill}
                    onClick={() => useSkill(skill)}
                    disabled={!isPlayerTurn || animating || battleOver}
                    energyAvailable={player.energy}
                  />
                ))}
                {lockedSkills.map((skill) => (
                  <div
                    key={skill.name}
                    title={`${skill.description} (Unlocks at Lv.${skill.levelReq})`}
                    style={{
                      flex: 1,
                      padding: "12px 8px",
                      borderRadius: 10,
                      cursor: "not-allowed",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.04)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      opacity: 0.35,
                      filter: "grayscale(100%)",
                    }}
                  >
                    <span style={{ fontSize: 20 }}>🔒</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "rgba(26,26,46,0.35)",
                      textAlign: "center",
                    }}>
                      {skill.name}
                    </span>
                    <span style={{
                      fontSize: 9,
                      color: "rgba(26,26,46,0.25)",
                      fontFamily: "monospace",
                    }}>
                      Lv.{skill.levelReq}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Result Overlay ── */}
            {phase === "result" && (
              <ResultOverlay
                won={playerWon}
                points={earnedPoints}
                onClose={resetBattle}
              />
            )}
          </div>

          {/* ── Stats Bar Below Arena ── */}
          <div style={{
            display: "flex", justifyContent: "center", gap: 24,
            marginTop: 16,
          }}>
            {player && (
              <>
                <div style={{
                  fontFamily: "monospace", fontSize: 11,
                  color: "rgba(26,26,46,0.4)",
                }}>
                  ATK <span style={{ color: "#f97316", fontWeight: 700 }}>{player.atk}</span>
                </div>
                <div style={{
                  fontFamily: "monospace", fontSize: 11,
                  color: "rgba(26,26,46,0.4)",
                }}>
                  DEF <span style={{ color: "#38bdf8", fontWeight: 700 }}>{player.def}</span>
                </div>
                <div style={{
                  fontFamily: "monospace", fontSize: 11,
                  color: "rgba(26,26,46,0.4)",
                }}>
                  SPD <span style={{ color: "#a78bfa", fontWeight: 700 }}>{player.spd}</span>
                </div>
                <div style={{ width: 1, height: 14, background: "rgba(0,0,0,0.08)" }} />
                <div style={{
                  fontFamily: "monospace", fontSize: 11,
                  color: "rgba(26,26,46,0.4)",
                }}>
                  Turn <span style={{ color: "#f59e0b", fontWeight: 700 }}>{turn}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

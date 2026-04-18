"use client";

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { api } from "@/lib/api";
import {
  SKILL_DB, SKILL_MAP, ELEMENTS, TYPE_CHART,
  SPECIES_ELEMENTS, calcDamageV2, getStarterSkills,
  type Element, type SkillDef,
} from "@/lib/skills";
import {
  createVFX, updateVFX, renderVFX, spawnSkillEffect, spawnSuperEffective,
  spawnDamageNumber, updateDamagePopups, renderDamagePopups,
  type VFXState, type DamagePopup,
} from "@/lib/vfx";
import Icon, { ELEMENT_ICONS } from "@/components/Icon";
import HpBarOverlay from "@/components/three/HpBarOverlay";
import { useBattleAnimations } from "@/hooks/useBattleAnimations";

const BattleScene3D = lazy(() => import("@/components/three/BattleScene3D"));

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
  element?: string;
  personality_modifiers?: any;
}

interface EquippedSkill {
  key: string;
  def: SkillDef;
  level: number;
  slot: number;
}

interface BattlePet {
  pet: Pet;
  element: Element;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  energy: number;
  maxEnergy: number;
  skills: EquippedSkill[];
}

interface BattleLogEntry {
  turn: number;
  text: string;
  type: "player" | "opponent" | "system" | "critical" | "effective";
}

// ── Constants ──
const PET_EMOJIS = [
  "\u{1F431}", "\u{1F415}", "\u{1F99C}", "\u{1F422}", "\u{1F439}", "\u{1F430}", "\u{1F98A}", "\u{1F436}",
  "\u{1F415}\u200D\u{1F9BA}", "\u{1F436}", "\u{1F409}", "\u{1F985}", "\u{1F984}", "\u{1F43A}", "\u{1F42F}", "\u{1F43C}",
  "\u{1F427}", "\u{1F989}", "\u{1F43B}", "\u{1F412}", "\u{1F40D}", "\u{1F985}", "\u{1F42C}", "\u{1F988}",
  "\u{1F99D}", "\u{1F43E}", "\u{1F98E}", "\u{1F439}",
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

function buildBattlePet(pet: Pet, skills: EquippedSkill[]): BattlePet {
  const mods = getPersonalityModifiers(pet.personality_type);
  const baseHp = pet.level * 10 + pet.happiness;
  const baseAtk = 10 + pet.level * 3;
  const baseDef = 8 + pet.level * 2;
  const baseSpd = 6 + pet.level * 2;
  const element = (pet.element as Element) || SPECIES_ELEMENTS[pet.species] || "normal";

  return {
    pet,
    element,
    hp: Math.floor(baseHp * mods.hp),
    maxHp: Math.floor(baseHp * mods.hp),
    atk: Math.floor(baseAtk * mods.atk),
    def: Math.floor(baseDef * mods.def),
    spd: Math.floor(baseSpd * mods.spd),
    energy: 50,
    maxEnergy: 50 + pet.level * 2,
    skills,
  };
}

function generateOpponentSkills(level: number, element: Element): EquippedSkill[] {
  const starters = getStarterSkills(element);
  const available = SKILL_DB.filter(
    (s) => s.levelReq <= level && (s.element === element || s.element === "normal") && !starters.includes(s.key)
  );
  const extra = available.sort(() => Math.random() - 0.5).slice(0, 2);
  const allKeys = [...starters, ...extra.map((s) => s.key)].slice(0, 4);

  return allKeys.map((key, i) => ({
    key,
    def: SKILL_MAP[key],
    level: Math.min(5, 1 + Math.floor(level / 8)),
    slot: i,
  }));
}

function generateOpponent(playerLevel: number): { pet: Pet; skills: EquippedSkill[] } {
  const levelVariance = Math.floor(Math.random() * 5) - 2;
  const level = Math.max(1, playerLevel + levelVariance);
  const species = Math.floor(Math.random() * PET_EMOJIS.length);
  const element = SPECIES_ELEMENTS[species] || "normal";
  const personalities = ["brave", "gentle", "playful", "lazy"];

  const pet: Pet = {
    id: 9000 + Math.floor(Math.random() * 1000),
    name: OPPONENT_NAMES[Math.floor(Math.random() * OPPONENT_NAMES.length)],
    species,
    personality_type: personalities[Math.floor(Math.random() * personalities.length)],
    level,
    experience: level * 60,
    happiness: 50 + Math.floor(Math.random() * 50),
    energy: 70 + Math.floor(Math.random() * 30),
    hunger: Math.floor(Math.random() * 50),
    bond_level: 40 + Math.floor(Math.random() * 40),
    total_interactions: Math.floor(Math.random() * 100),
    current_mood: "focused",
    is_active: true,
    element,
  };

  return { pet, skills: generateOpponentSkills(level, element as Element) };
}

function getHpBarGradient(ratio: number): string {
  if (ratio > 0.5) return "linear-gradient(90deg, #22c55e, #4ade80)";
  if (ratio > 0.25) return "linear-gradient(90deg, #eab308, #facc15)";
  return "linear-gradient(90deg, #dc2626, #f87171)";
}

function getHpColor(ratio: number): string {
  if (ratio > 0.5) return "#4ade80";
  if (ratio > 0.25) return "#facc15";
  return "#f87171";
}

function getEffectivenessText(mult: number): string {
  if (mult >= 2) return "It's super effective!";
  if (mult <= 0.5) return "It's not very effective...";
  return "";
}

// ── Element Badge Component ──
function ElementBadge({ element }: { element: Element }) {
  const el = ELEMENTS[element] || ELEMENTS.normal;
  return (
    <span style={{
      fontFamily: "monospace", fontSize: 10, fontWeight: 700,
      padding: "2px 8px", borderRadius: 6,
      background: `${el.color}20`, color: el.color,
      border: `1px solid ${el.color}40`,
    }}>
      <Icon name={ELEMENT_ICONS[element] || "normal"} size={12} /> {el.name}
    </span>
  );
}

// ── Glass Panel wrapper ──
function GlassPanel({ children, style, glow }: { children: React.ReactNode; style?: React.CSSProperties; glow?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: glow ? `0 0 20px ${glow}` : "0 4px 24px rgba(0,0,0,0.2)",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── HP Bar Component (upgraded with smooth gradient) ──
function HpBar({ current, max, label, level, name, element, isActive }: {
  current: number; max: number; label: string; level: number; name: string; element: Element; isActive?: boolean;
}) {
  const ratio = Math.max(0, current / max);
  return (
    <GlassPanel
      glow={isActive ? "rgba(245,158,11,0.15)" : undefined}
      style={{
        padding: "12px 18px",
        minWidth: 240,
        border: isActive ? "1.5px solid rgba(245,158,11,0.35)" : "1px solid rgba(255,255,255,0.08)",
        transition: "border-color 0.5s ease, box-shadow 0.5s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 15, fontWeight: 700, color: "#fff",
            letterSpacing: "-0.02em",
          }}>
            {name}
          </span>
          <ElementBadge element={element} />
        </div>
        <span style={{
          fontFamily: "monospace", fontSize: 11, fontWeight: 600,
          color: "rgba(245,158,11,0.9)",
          background: "rgba(245,158,11,0.15)",
          padding: "2px 10px", borderRadius: 6,
        }}>
          Lv.{level}
        </span>
      </div>
      {/* HP bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontFamily: "monospace", fontSize: 10, fontWeight: 700,
          color: "rgba(255,255,255,0.5)", width: 20,
        }}>
          HP
        </span>
        <div style={{
          flex: 1, height: 12, background: "rgba(255,255,255,0.08)",
          borderRadius: 6, overflow: "hidden", position: "relative",
        }}>
          <div style={{
            height: "100%",
            width: `${ratio * 100}%`,
            background: getHpBarGradient(ratio),
            borderRadius: 6,
            transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1), background 0.6s ease",
            boxShadow: `0 0 10px ${getHpColor(ratio)}50, inset 0 1px 0 rgba(255,255,255,0.2)`,
            position: "relative",
          }}>
            {/* Shiny highlight on HP bar */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: "50%",
              background: "linear-gradient(180deg, rgba(255,255,255,0.25), transparent)",
              borderRadius: "6px 6px 0 0",
            }} />
          </div>
        </div>
      </div>
      <div style={{
        fontFamily: "monospace", fontSize: 10, color: getHpColor(ratio),
        textAlign: "right", marginTop: 3, fontWeight: 600,
      }}>
        {Math.max(0, current)} / {max}
      </div>
    </GlassPanel>
  );
}

// ── Energy Bar Component ──
function EnergyBar({ current, max }: { current: number; max: number }) {
  const ratio = current / max;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
      <span style={{
        fontFamily: "monospace", fontSize: 9, fontWeight: 700,
        color: "rgba(245,158,11,0.6)",
      }}>EP</span>
      <div style={{
        width: 110, height: 7,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 4, overflow: "hidden",
        border: "1px solid rgba(245,158,11,0.1)",
      }}>
        <div style={{
          height: "100%",
          width: `${ratio * 100}%`,
          background: "linear-gradient(90deg, #f59e0b, #fbbf24)",
          borderRadius: 4,
          transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: "0 0 6px rgba(245,158,11,0.3)",
          animation: current < 15 ? "energyPulse 1s ease infinite" : "none",
        }} />
      </div>
      <span style={{
        fontFamily: "monospace", fontSize: 9,
        color: ratio < 0.2 ? "#f87171" : "rgba(255,255,255,0.35)",
        fontWeight: ratio < 0.2 ? 700 : 400,
      }}>
        {current}/{max}
      </span>
    </div>
  );
}

// ── Battle Log Component (styled entries) ──
function BattleLog({ entries }: { entries: BattleLogEntry[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [entries]);

  const getLogStyle = (type: BattleLogEntry["type"]) => {
    switch (type) {
      case "player":
        return { color: "#4ade80", bg: "rgba(74,222,128,0.06)", border: "rgba(74,222,128,0.15)" };
      case "opponent":
        return { color: "#f87171", bg: "rgba(248,113,113,0.06)", border: "rgba(248,113,113,0.15)" };
      case "critical":
        return { color: "#facc15", bg: "rgba(250,204,21,0.08)", border: "rgba(250,204,21,0.2)" };
      case "effective":
        return { color: "#a78bfa", bg: "rgba(167,139,250,0.06)", border: "rgba(167,139,250,0.15)" };
      default:
        return { color: "rgba(255,255,255,0.5)", bg: "transparent", border: "transparent" };
    }
  };

  return (
    <GlassPanel style={{ padding: "12px 14px", maxHeight: 170, overflowY: "auto" }}>
      <div ref={logRef} style={{ maxHeight: 146, overflowY: "auto" }}>
        {entries.length === 0 && (
          <div style={{
            fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.3)",
            textAlign: "center", padding: 8,
          }}>
            Battle starting...
          </div>
        )}
        {entries.map((entry, i) => {
          const logStyle = getLogStyle(entry.type);
          return (
            <div
              key={i}
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                lineHeight: 1.5,
                color: logStyle.color,
                padding: "3px 8px",
                marginBottom: 2,
                borderRadius: 6,
                background: logStyle.bg,
                borderLeft: `2px solid ${logStyle.border}`,
                animation: i === entries.length - 1 ? "logSlideIn 0.3s ease-out" : undefined,
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.15)", marginRight: 6, fontSize: 9 }}>
                T{entry.turn}
              </span>
              {entry.text}
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}

// ── Skill Button Component V2 (upgraded) ──
function SkillButtonV2({ skill, skillLevel, onClick, disabled, energyAvailable }: {
  skill: SkillDef;
  skillLevel: number;
  onClick: () => void;
  disabled: boolean;
  energyAvailable: number;
}) {
  const cantAfford = skill.energyCost > energyAvailable;
  const isDisabled = disabled || cantAfford;
  const el = ELEMENTS[skill.element] || ELEMENTS.normal;

  const typeColor =
    skill.type === "physical" ? "#f97316" :
    skill.type === "special" ? "#a78bfa" :
    skill.type === "utility" ? "#38bdf8" :
    "#22c55e";

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      title={`${skill.description}\n${skill.type.toUpperCase()} | ${skill.element.toUpperCase()} | PWR ${skill.power} | ACC ${skill.accuracy}%`}
      className="arena-skill-btn"
      style={{
        flex: 1,
        padding: "12px 8px",
        borderRadius: 12,
        cursor: isDisabled ? "not-allowed" : "pointer",
        background: isDisabled
          ? "rgba(255,255,255,0.02)"
          : `linear-gradient(145deg, ${el.color}15 0%, rgba(15,15,35,0.95) 60%, ${el.color}08 100%)`,
        border: isDisabled
          ? "1px solid rgba(255,255,255,0.04)"
          : `1.5px solid ${el.color}35`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        opacity: isDisabled ? 0.35 : 1,
        backdropFilter: "blur(8px)",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.06) translateY(-2px)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = el.color;
          (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 20px ${el.color}30, inset 0 0 20px ${el.color}08`;
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1) translateY(0)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = isDisabled ? "rgba(255,255,255,0.04)" : `${el.color}35`;
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
      }}
    >
      {/* Flash shimmer overlay */}
      {!isDisabled && (
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(135deg, transparent 40%, ${el.color}08 50%, transparent 60%)`,
          pointerEvents: "none",
        }} />
      )}
      <span style={{ fontSize: 20, filter: isDisabled ? "grayscale(1)" : "none" }}>{skill.emoji}</span>
      <span style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 10, fontWeight: 700,
        color: isDisabled ? "rgba(255,255,255,0.2)" : "#fff",
        textAlign: "center", lineHeight: 1.2,
      }}>
        {skill.name}
      </span>
      {/* Element + type tag */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <span style={{
          fontFamily: "monospace", fontSize: 8,
          color: el.color, fontWeight: 600,
        }}>
          <Icon name={ELEMENT_ICONS[skill.element] || "normal"} size={10} />
        </span>
        <span style={{
          fontFamily: "monospace", fontSize: 8,
          color: typeColor, fontWeight: 600, textTransform: "uppercase",
          padding: "1px 4px", borderRadius: 3,
          background: `${typeColor}12`,
        }}>
          {skill.type.slice(0, 4)}
        </span>
      </div>
      {/* Power + energy */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {skill.power > 0 && (
          <span style={{
            fontFamily: "monospace", fontSize: 9,
            color: typeColor, fontWeight: 700,
          }}>
            {skill.power + Math.floor(skill.power * (skillLevel - 1) * 0.1)}
          </span>
        )}
        {skill.energyCost > 0 && (
          <span style={{
            fontFamily: "monospace", fontSize: 9,
            color: cantAfford ? "#f87171" : "rgba(245,158,11,0.5)",
            fontWeight: cantAfford ? 700 : 400,
          }}>
            EP{skill.energyCost}
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
      {/* Skill level stars */}
      <div style={{ fontSize: 8, letterSpacing: 1, color: "#f59e0b" }}>
        {"★".repeat(skillLevel)}{"☆".repeat(Math.max(0, skill.maxLevel - skillLevel))}
      </div>
    </button>
  );
}

// ── Victory / Defeat Overlay V2 (dramatic animation) ──
function ResultOverlay({ won, points, expGained, skillDrop, onClose }: {
  won: boolean; points: number; expGained: number; skillDrop: string | null; onClose: () => void;
}) {
  const dropSkill = skillDrop ? SKILL_MAP[skillDrop] : null;
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 30,
      background: won
        ? "radial-gradient(ellipse at center, rgba(245,158,11,0.12) 0%, rgba(74,222,128,0.08) 30%, rgba(0,0,0,0.92) 70%)"
        : "radial-gradient(ellipse at center, rgba(248,113,113,0.12) 0%, rgba(139,92,246,0.05) 30%, rgba(0,0,0,0.92) 70%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "resultFadeIn 0.5s ease-out",
      borderRadius: 16,
      backdropFilter: "blur(4px)",
    }}>
      {/* Victory golden burst rings */}
      {won && (
        <>
          <div style={{
            position: "absolute", width: 300, height: 300,
            borderRadius: "50%",
            border: "2px solid rgba(245,158,11,0.2)",
            animation: "victoryRing 2s ease-out infinite",
          }} />
          <div style={{
            position: "absolute", width: 200, height: 200,
            borderRadius: "50%",
            border: "1px solid rgba(245,158,11,0.15)",
            animation: "victoryRing 2s ease-out 0.5s infinite",
          }} />
        </>
      )}

      <div style={{ textAlign: "center", position: "relative", zIndex: 2 }}>
        <div style={{
          fontSize: 72, marginBottom: 16,
          animation: "resultBounce 0.6s ease-out",
          filter: won ? "drop-shadow(0 0 20px rgba(245,158,11,0.6))" : "drop-shadow(0 0 20px rgba(248,113,113,0.4))",
        }}>
          {won ? <Icon name="trophy" size={72} /> : <Icon name="skull" size={72} />}
        </div>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 36, fontWeight: 800,
          color: won ? "#f59e0b" : "#f87171",
          marginBottom: 12,
          letterSpacing: "-0.03em",
          textShadow: won
            ? "0 0 40px rgba(245,158,11,0.6), 0 0 80px rgba(245,158,11,0.3)"
            : "0 0 40px rgba(248,113,113,0.5)",
          animation: won ? "victoryTextGlow 2s ease-in-out infinite" : undefined,
        }}>
          {won ? "VICTORY!" : "DEFEATED"}
        </div>

        {/* Rewards summary */}
        <div style={{
          display: "flex", gap: 20, justifyContent: "center", marginBottom: 20,
        }}>
          <GlassPanel style={{ padding: "10px 20px" }}>
            <div style={{
              fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.4)",
              marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.1em",
            }}>Points</div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif", fontSize: 22,
              color: "#f59e0b", fontWeight: 800,
            }}>
              +{points}
            </div>
          </GlassPanel>
          <GlassPanel style={{ padding: "10px 20px" }}>
            <div style={{
              fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.4)",
              marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.1em",
            }}>Experience</div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif", fontSize: 22,
              color: "#a78bfa", fontWeight: 800,
            }}>
              +{expGained}
            </div>
          </GlassPanel>
        </div>

        {/* Skill drop */}
        {dropSkill && (
          <GlassPanel style={{
            padding: "14px 24px",
            marginBottom: 20,
            border: "1px solid rgba(167,139,250,0.4)",
            animation: "resultBounce 0.8s ease-out 0.3s both",
          }}>
            <div style={{
              fontFamily: "monospace", fontSize: 11,
              color: "#a78bfa", fontWeight: 700, marginBottom: 4,
              textTransform: "uppercase", letterSpacing: "0.1em",
            }}>
              NEW SKILL DROPPED!
            </div>
            <div style={{ fontSize: 28, marginBottom: 4 }}>{dropSkill.emoji}</div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 15, fontWeight: 700, color: "#fff",
            }}>
              {dropSkill.name}
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 10,
              color: "rgba(255,255,255,0.5)",
            }}>
              {"★".repeat(dropSkill.rarity)} <Icon name={ELEMENT_ICONS[dropSkill.element] || "normal"} size={12} /> {dropSkill.element}
            </div>
          </GlassPanel>
        )}

        <button
          onClick={onClose}
          style={{
            background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.1))",
            border: "1.5px solid rgba(245,158,11,0.4)",
            borderRadius: 14,
            padding: "14px 48px",
            cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 15,
            fontWeight: 700,
            color: "#f59e0b",
            transition: "all 0.3s",
            backdropFilter: "blur(8px)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(245,158,11,0.35), rgba(245,158,11,0.2))";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 30px rgba(245,158,11,0.2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.1))";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
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
// ── Main Arena Component V2 ──
// ══════════════════════════════════════════════════════
export default function Arena() {
  // ── State ──
  const [phase, setPhase] = useState<Phase>("select");
  const [myPets, setMyPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [earnedExp, setEarnedExp] = useState(0);
  const [skillDrop, setSkillDrop] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);

  // ── 3D Battle Animation Hook ──
  const { animState: anim3d, playAction: play3dAction, resetAnim: reset3dAnim } = useBattleAnimations();

  // VFX engine (legacy — kept for fallback, 3D scene is primary)
  const vfxRef = useRef<VFXState>(createVFX());
  const vfxCanvasRef = useRef<HTMLCanvasElement>(null);
  const damagePopupsRef = useRef<DamagePopup[]>([]);

  // VFX render loop
  useEffect(() => {
    let raf: number;
    const loop = () => {
      const canvas = vfxCanvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
          canvas.width = Math.round(rect.width);
          canvas.height = Math.round(rect.height);
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          updateVFX(vfxRef.current, 1);
          updateDamagePopups(damagePopupsRef.current, 1);
          if (damagePopupsRef.current.length > 20) damagePopupsRef.current.splice(0, damagePopupsRef.current.length - 20);
          renderVFX(ctx, vfxRef.current, canvas.width, canvas.height);
          renderDamagePopups(ctx, damagePopupsRef.current);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Helper: trigger VFX for a skill hit
  const triggerSkillVFX = useCallback((skill: SkillDef, skillLevel: number, targetX: number, targetY: number, damage: number, isCrit: boolean, effectiveness: number, attackerName: string) => {
    const vfx = vfxRef.current;
    spawnSkillEffect(vfx, skill.element, skillLevel, targetX, targetY, skill.name, skill.emoji, attackerName, isCrit);
    spawnDamageNumber(damagePopupsRef.current, targetX, targetY, damage, isCrit, effectiveness);
    if (effectiveness >= 2) spawnSuperEffective(vfx);
  }, []);

  // status effects
  const [playerDodging, setPlayerDodging] = useState(false);
  const [opponentDodging, setOpponentDodging] = useState(false);
  const [playerDefBuff, setPlayerDefBuff] = useState(0);
  const [opponentDefBuff, setOpponentDefBuff] = useState(0);
  const [playerDrain, setPlayerDrain] = useState(0);
  const [opponentDrain, setOpponentDrain] = useState(0);
  const [playerSpAtkBuff, setPlayerSpAtkBuff] = useState(false);
  const [opponentSpAtkBuff, setOpponentSpAtkBuff] = useState(false);

  // animations
  const [playerShake, setPlayerShake] = useState(false);
  const [opponentShake, setOpponentShake] = useState(false);
  const [playerFaint, setPlayerFaint] = useState(false);
  const [opponentFaint, setOpponentFaint] = useState(false);
  // screen shake on crits
  const [screenShake, setScreenShake] = useState(false);

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
      } catch {
        if (!cancelled) {
          setMyPets([
            {
              id: 1, name: "Luna", species: 0, personality_type: "playful", level: 5,
              experience: 320, happiness: 85, energy: 72, hunger: 45, bond_level: 68,
              total_interactions: 47, current_mood: "happy", is_active: true, element: "normal",
            },
            {
              id: 2, name: "Mochi", species: 10, personality_type: "brave", level: 8,
              experience: 580, happiness: 78, energy: 60, hunger: 30, bond_level: 55,
              total_interactions: 28, current_mood: "focused", is_active: true, element: "fire",
            },
            {
              id: 3, name: "Pixel", species: 22, personality_type: "gentle", level: 12,
              experience: 920, happiness: 90, energy: 88, hunger: 20, bond_level: 72,
              total_interactions: 65, current_mood: "content", is_active: true, element: "water",
            },
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPets();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch or generate skills for a pet ──
  async function getPetSkills(pet: Pet): Promise<EquippedSkill[]> {
    try {
      const data = await api.skills.get(pet.id);
      const equipped = (data.skills || [])
        .filter((s: any) => s.slot !== null && s.slot !== undefined)
        .sort((a: any, b: any) => a.slot - b.slot)
        .map((s: any) => ({
          key: s.skill_key,
          def: s.def || SKILL_MAP[s.skill_key],
          level: s.level,
          slot: s.slot,
        }))
        .filter((s: any) => s.def);

      if (equipped.length > 0) return equipped;
    } catch {}

    const element = (pet.element as Element) || SPECIES_ELEMENTS[pet.species] || "normal";
    const starterKeys = getStarterSkills(element);
    return starterKeys.map((key, i) => ({
      key,
      def: SKILL_MAP[key],
      level: 1,
      slot: i,
    }));
  }

  // ── Start Battle ──
  const startBattle = useCallback(async (pet: Pet) => {
    setSelectedPet(pet);
    setPhase("matchmaking");

    const playerSkills = await getPetSkills(pet);
    let opp: { pet: Pet; skills: EquippedSkill[] };
    let owner: string;

    try {
      const data = await api.arena.findOpponent(pet.level);
      if (data.opponent) {
        const oppElement = (data.opponent.element as Element) || "normal";
        const oppSkills = data.opponent.skills?.length > 0
          ? data.opponent.skills.map((s: any, i: number) => ({
              key: s.skill_key,
              def: s.def || SKILL_MAP[s.skill_key],
              level: s.level || 1,
              slot: s.slot ?? i,
            })).filter((s: any) => s.def)
          : generateOpponentSkills(data.opponent.level, oppElement);

        opp = {
          pet: {
            id: data.opponent.id,
            name: data.opponent.name,
            level: data.opponent.level,
            species: 0,
            personality_type: data.opponent.personality_type,
            avatar_url: data.opponent.avatar_url,
            happiness: data.opponent.happiness || 70,
            energy: data.opponent.energy || 100,
            hunger: 30, bond_level: 0, experience: 0,
            total_interactions: data.opponent.total_interactions || 0,
            evolution_stage: data.opponent.evolution_stage || 0,
            element: oppElement,
          },
          skills: oppSkills,
        };
        owner = data.opponent.wallet || "Trainer";
      } else {
        opp = generateOpponent(pet.level);
        owner = OPPONENT_OWNERS[Math.floor(Math.random() * OPPONENT_OWNERS.length)];
      }
    } catch {
      opp = generateOpponent(pet.level);
      owner = OPPONENT_OWNERS[Math.floor(Math.random() * OPPONENT_OWNERS.length)];
    }

    const playerBattle = buildBattlePet(pet, playerSkills);
    const opponentBattle = buildBattlePet(opp.pet, opp.skills);

    setPlayer(playerBattle);
    setOpponent(opponentBattle);
    setOpponentOwner(owner);
    setTurn(1);
    setIsPlayerTurn(playerBattle.spd >= opponentBattle.spd);
    setBattleLog([{
      turn: 0,
      text: `${opp.pet.name} (${opponentBattle.element}) appears! (${owner}'s pet)`,
      type: "system",
    }]);
    setBattleOver(false);
    setPlayerWon(false);
    setSkillDrop(null);
    setEarnedExp(0);
    setPlayerDodging(false);
    setOpponentDodging(false);
    setPlayerDefBuff(0);
    setOpponentDefBuff(0);
    setPlayerDrain(0);
    setOpponentDrain(0);
    setPlayerSpAtkBuff(false);
    setOpponentSpAtkBuff(false);
    setPlayerFaint(false);
    setOpponentFaint(false);
    setScreenShake(false);
    setPhase("battle");
  }, []);

  // ── Report battle result to server ──
  useEffect(() => {
    if (phase === "result" && selectedPet && opponent && player) {
      api.arena
        .reportResult(selectedPet.id, opponent.pet.id || 0, playerWon, turn, opponent.pet.name, player.hp)
        .then((res: any) => {
          if (res.exp_gained) setEarnedExp(res.exp_gained);
          if (res.skill_drop) setSkillDrop(res.skill_drop);
        })
        .catch(() => {});
    }
  }, [phase]);

  // ── Add Log Entry ──
  const addLog = useCallback((text: string, type: BattleLogEntry["type"]) => {
    setBattleLog((prev) => [...prev, { turn, text, type }]);
  }, [turn]);

  // ── Apply drain effects at turn start ──
  const applyDrainEffects = useCallback(() => {
    if (opponentDrain > 0 && player && opponent) {
      const drainDmg = Math.floor(opponent.maxHp * 0.06);
      setOpponent((prev) => prev ? { ...prev, hp: Math.max(0, prev.hp - drainDmg) } : prev);
      setPlayer((prev) => prev ? { ...prev, hp: Math.min(prev.maxHp, prev.hp + drainDmg) } : prev);
      setOpponentDrain((prev) => prev - 1);
      addLog(`Leech Seed drains ${drainDmg} HP from ${opponent.pet.name}!`, "player");
    }
    if (playerDrain > 0 && player && opponent) {
      const drainDmg = Math.floor(player.maxHp * 0.06);
      setPlayer((prev) => prev ? { ...prev, hp: Math.max(0, prev.hp - drainDmg) } : prev);
      setOpponent((prev) => prev ? { ...prev, hp: Math.min(prev.maxHp, prev.hp + drainDmg) } : prev);
      setPlayerDrain((prev) => prev - 1);
      addLog(`Leech Seed drains ${drainDmg} HP from ${player.pet.name}!`, "opponent");
    }
  }, [player, opponent, playerDrain, opponentDrain, addLog]);

  // helper: trigger screen shake on critical
  const triggerScreenShake = useCallback(() => {
    setScreenShake(true);
    setTimeout(() => setScreenShake(false), 400);
  }, []);

  // ── Player Uses Skill ──
  const useSkill = useCallback((eqSkill: EquippedSkill) => {
    if (!player || !opponent || battleOver || !isPlayerTurn || animating) return;

    const skill = eqSkill.def;

    if (player.energy < skill.energyCost) {
      addLog("Not enough energy!", "system");
      return;
    }

    setAnimating(true);
    applyDrainEffects();

    setPlayer((prev) => prev ? { ...prev, energy: prev.energy - skill.energyCost } : prev);

    const hit = Math.random() * 100 < skill.accuracy;
    if (!hit) {
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}... but missed!`, "player");
      setTimeout(() => opponentTurn(), 1200);
      return;
    }

    if (opponentDodging && skill.power > 0) {
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}... but ${opponent.pet.name} dodged!`, "player");
      setOpponentDodging(false);
      setTimeout(() => opponentTurn(), 1200);
      return;
    }

    // ── Status / Utility effects ──
    if (skill.effect === "dodge") {
      setPlayerDodging(true);
      const healAmt = Math.floor(player.maxHp * 0.08);
      setPlayer((prev) => prev ? { ...prev, hp: Math.min(prev.maxHp, prev.hp + healAmt) } : prev);
      addLog(`${player.pet.name} takes a defensive stance! ${skill.emoji} (+${healAmt} HP)`, "player");
      setTimeout(() => opponentTurn(), 1000);
      return;
    }
    if (skill.effect === "atk_down") {
      setOpponent((prev) => prev ? { ...prev, atk: Math.max(1, prev.atk - 5) } : prev);
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}! ${opponent.pet.name}'s ATK fell sharply!`, "player");
      setTimeout(() => opponentTurn(), 1000);
      return;
    }
    if (skill.effect === "def_up") {
      setPlayerDefBuff((prev) => prev + 2);
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}! Defense rose sharply!`, "player");
      setTimeout(() => opponentTurn(), 1000);
      return;
    }
    if (skill.effect === "drain") {
      setOpponentDrain(3);
      addLog(`${player.pet.name} planted ${skill.emoji} Leech Seed on ${opponent.pet.name}!`, "player");
      setTimeout(() => opponentTurn(), 1000);
      return;
    }
    if (skill.effect === "water_boost") {
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}! Water moves powered up!`, "player");
      setTimeout(() => opponentTurn(), 1000);
      return;
    }
    if (skill.effect === "sp_atk_up") {
      setPlayerSpAtkBuff(true);
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}! Special ATK is rising!`, "player");
      setTimeout(() => opponentTurn(), 1000);
      return;
    }

    // ── Damage skills ──
    const atkBonus = playerSpAtkBuff && skill.type === "special" ? 1.5 : 1;
    if (playerSpAtkBuff && skill.type === "special") setPlayerSpAtkBuff(false);

    if (skill.effect === "multi_hit") {
      const hits = 2 + Math.floor(Math.random() * 3);
      let totalDmg = 0;
      for (let i = 0; i < hits; i++) {
        const { damage } = calcDamageV2({
          attackerAtk: Math.floor(player.atk * atkBonus), defenderDef: opponent.def,
          skill, skillLevel: eqSkill.level,
          attackerElement: player.element, defenderElement: opponent.element,
          defBuff: opponentDefBuff,
        });
        totalDmg += damage;
      }
      setOpponentShake(true);
      triggerScreenShake();
      setTimeout(() => setOpponentShake(false), 500);
      setOpponent((prev) => prev ? { ...prev, hp: prev.hp - totalDmg } : prev);
      addLog(`${player.pet.name} used ${skill.emoji} ${skill.name}! Hit ${hits} times for ${totalDmg} total!`, "critical");
    } else if (skill.effect === "priority") {
      const { damage, effectiveness, isCrit } = calcDamageV2({
        attackerAtk: Math.floor(player.atk * atkBonus), defenderDef: opponent.def,
        skill, skillLevel: eqSkill.level,
        attackerElement: player.element, defenderElement: opponent.element,
        defBuff: opponentDefBuff,
      });
      setOpponentShake(true);
      if (isCrit) triggerScreenShake();
      setTimeout(() => setOpponentShake(false), 400);
      setOpponent((prev) => prev ? { ...prev, hp: prev.hp - damage } : prev);
      const effText = getEffectivenessText(effectiveness);
      addLog(`${player.pet.name} strikes first with ${skill.emoji} ${skill.name}! -${damage} HP${isCrit ? " CRIT!" : ""}`, isCrit ? "critical" : "player");
      if (effText) addLog(effText, "effective");
    } else {
      // Normal damage
      const { damage, effectiveness, isCrit } = calcDamageV2({
        attackerAtk: Math.floor(player.atk * atkBonus), defenderDef: opponent.def,
        skill, skillLevel: eqSkill.level,
        attackerElement: player.element, defenderElement: opponent.element,
        defBuff: opponentDefBuff,
      });

      if (skill.effect === "def_down") {
        setOpponent((prev) => prev ? { ...prev, def: Math.max(1, prev.def - 3) } : prev);
      }

      setOpponentShake(true);
      if (isCrit) triggerScreenShake();
      setTimeout(() => setOpponentShake(false), 400);
      setOpponent((prev) => prev ? { ...prev, hp: prev.hp - damage } : prev);

      const cw = vfxCanvasRef.current?.width || 600;
      const ch = vfxCanvasRef.current?.height || 500;
      triggerSkillVFX(skill, eqSkill.level, cw * 0.7, ch * 0.25, damage, isCrit, effectiveness, player.pet.name);

      const effText = getEffectivenessText(effectiveness);
      addLog(
        `${player.pet.name} used ${skill.emoji} ${skill.name}! -${damage} HP${isCrit ? " CRIT!" : ""}${skill.effect === "def_down" ? " (DEF down!)" : ""}`,
        isCrit ? "critical" : "player"
      );
      if (effText) addLog(effText, "effective");
    }

    // Energy regen
    setPlayer((prev) => prev ? { ...prev, energy: Math.min(prev.maxEnergy, prev.energy + 3) } : prev);

    // Check opponent faint
    setTimeout(() => {
      setOpponent((prev) => {
        if (prev && prev.hp <= 0) {
          setOpponentFaint(true);
          const pts = 25 + (prev.pet.level * 3);
          setEarnedPoints(pts);
          setBattleOver(true);
          setPlayerWon(true);
          addLog(`${prev.pet.name} fainted! You win!`, "system");
          setTimeout(() => setPhase("result"), 1500);
          return { ...prev, hp: 0 };
        }
        setTimeout(() => opponentTurn(), 300);
        return prev;
      });
    }, 500);
  }, [player, opponent, battleOver, isPlayerTurn, animating, opponentDodging, opponentDefBuff, playerSpAtkBuff, turn, addLog, applyDrainEffects]);

  // ── Opponent Turn ──
  const opponentTurn = useCallback(() => {
    setIsPlayerTurn(false);

    setTimeout(() => {
      if (!opponent || !player || battleOver) {
        setAnimating(false);
        return;
      }

      const affordableSkills = opponent.skills.filter((s) => s.def && s.def.energyCost <= opponent.energy);
      const chosen = affordableSkills.length > 0
        ? affordableSkills[Math.floor(Math.random() * affordableSkills.length)]
        : opponent.skills[0];

      if (!chosen?.def) {
        setIsPlayerTurn(true);
        setAnimating(false);
        return;
      }

      const skill = chosen.def;

      const hit = Math.random() * 100 < skill.accuracy;

      if (!hit) {
        addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}... but missed!`, "opponent");
      } else if (playerDodging && skill.power > 0) {
        addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}... but ${player.pet.name} dodged!`, "opponent");
        setPlayerDodging(false);
      } else if (skill.power > 0) {
        const atkBonus = opponentSpAtkBuff && skill.type === "special" ? 1.5 : 1;
        if (opponentSpAtkBuff && skill.type === "special") setOpponentSpAtkBuff(false);

        const { damage, effectiveness, isCrit } = calcDamageV2({
          attackerAtk: Math.floor(opponent.atk * atkBonus), defenderDef: player.def,
          skill, skillLevel: chosen.level,
          attackerElement: opponent.element, defenderElement: player.element,
          defBuff: playerDefBuff,
        });

        setPlayerShake(true);
        if (isCrit) triggerScreenShake();
        setTimeout(() => setPlayerShake(false), 400);

        const cw2 = vfxCanvasRef.current?.width || 600;
        const ch2 = vfxCanvasRef.current?.height || 500;
        triggerSkillVFX(skill, chosen.level, cw2 * 0.3, ch2 * 0.65, damage, isCrit, effectiveness, opponent.pet.name);

        setPlayer((prev) => {
          if (!prev) return prev;
          const newHp = prev.hp - damage;
          if (newHp <= 0) {
            setPlayerFaint(true);
            setBattleOver(true);
            setPlayerWon(false);
            setEarnedPoints(5);
            addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}! -${damage} HP`, "opponent");
            addLog(`${prev.pet.name} fainted... You lost.`, "system");
            setTimeout(() => setPhase("result"), 1500);
            return { ...prev, hp: 0 };
          }
          return { ...prev, hp: newHp };
        });

        const effText = getEffectivenessText(effectiveness);
        addLog(
          `${opponent.pet.name} used ${skill.emoji} ${skill.name}! -${damage} HP${isCrit ? " CRIT!" : ""}`,
          isCrit ? "critical" : "opponent"
        );
        if (effText) addLog(effText, "effective");
      } else {
        if (skill.effect === "dodge") {
          setOpponentDodging(true);
          addLog(`${opponent.pet.name} takes a defensive stance! ${skill.emoji}`, "opponent");
        } else if (skill.effect === "atk_down") {
          setPlayer((prev) => prev ? { ...prev, atk: Math.max(1, prev.atk - 4) } : prev);
          addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}! Your ATK fell!`, "opponent");
        } else if (skill.effect === "def_up") {
          setOpponentDefBuff((prev) => prev + 2);
          addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}! Defense rose!`, "opponent");
        } else if (skill.effect === "drain") {
          setPlayerDrain(3);
          addLog(`${opponent.pet.name} planted ${skill.emoji} Leech Seed on ${player.pet.name}!`, "opponent");
        } else if (skill.effect === "sp_atk_up") {
          setOpponentSpAtkBuff(true);
          addLog(`${opponent.pet.name} used ${skill.emoji} ${skill.name}! Special ATK is rising!`, "opponent");
        }
      }

      setOpponent((prev) => prev ? {
        ...prev,
        energy: Math.min(prev.maxEnergy, prev.energy - skill.energyCost + 3),
      } : prev);

      if (playerDefBuff > 0) setPlayerDefBuff((prev) => prev - 1);
      if (opponentDefBuff > 0) setOpponentDefBuff((prev) => prev - 1);

      setTurn((prev) => prev + 1);
      setIsPlayerTurn(true);
      setAnimating(false);
    }, 1000);
  }, [opponent, player, battleOver, playerDodging, playerDefBuff, opponentDefBuff, opponentSpAtkBuff, turn, addLog]);

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
    setSkillDrop(null);
    setScreenShake(false);
  };

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
      background: "linear-gradient(180deg, #0a0a1a 0%, #0f0f2e 40%, #1a1a2e 100%)",
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes shake { 0%,100% { transform:translateX(0) } 20% { transform:translateX(-8px) } 40% { transform:translateX(8px) } 60% { transform:translateX(-5px) } 80% { transform:translateX(5px) } }
        @keyframes screenShake { 0%,100% { transform:translate(0,0) } 10% { transform:translate(-4px,-2px) } 20% { transform:translate(4px,2px) } 30% { transform:translate(-3px,1px) } 40% { transform:translate(3px,-1px) } 50% { transform:translate(-2px,2px) } 60% { transform:translate(2px,-2px) } }
        @keyframes faintAnim { from { opacity:1; transform:translateY(0) } to { opacity:0; transform:translateY(30px) } }
        @keyframes float { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-8px) } }
        @keyframes pulse2 { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        @keyframes resultFadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes resultBounce { 0% { transform:scale(0.3); opacity:0 } 50% { transform:scale(1.15) } 100% { transform:scale(1); opacity:1 } }
        @keyframes logSlideIn { from { opacity:0; transform:translateX(-12px) } to { opacity:1; transform:translateX(0) } }
        @keyframes scanline { 0% { transform:translateY(-100%) } 100% { transform:translateY(100%) } }
        @keyframes matchmakingPulse { 0%,100% { box-shadow:0 0 20px rgba(245,158,11,0.2) } 50% { box-shadow:0 0 50px rgba(245,158,11,0.5) } }
        @keyframes matchmakingSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes matchDots { 0% { content:"" } 33% { content:"." } 66% { content:".." } 100% { content:"..." } }
        @keyframes slideInLeft { from { opacity:0; transform:translateX(-40px) } to { opacity:1; transform:translateX(0) } }
        @keyframes slideInRight { from { opacity:0; transform:translateX(40px) } to { opacity:1; transform:translateX(0) } }
        @keyframes energyPulse { 0%,100% { opacity:0.7 } 50% { opacity:1 } }
        @keyframes victoryRing { 0% { transform:scale(0.5); opacity:0.8 } 100% { transform:scale(2); opacity:0 } }
        @keyframes victoryTextGlow { 0%,100% { text-shadow: 0 0 40px rgba(245,158,11,0.6), 0 0 80px rgba(245,158,11,0.3) } 50% { text-shadow: 0 0 60px rgba(245,158,11,0.8), 0 0 120px rgba(245,158,11,0.4) } }
        @keyframes turnGlow { 0%,100% { box-shadow: 0 0 15px rgba(245,158,11,0.15) } 50% { box-shadow: 0 0 30px rgba(245,158,11,0.35) } }
        @keyframes gradientShift { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
        @keyframes avatarGlow { 0%,100% { box-shadow: 0 8px 24px rgba(0,0,0,0.3), 0 0 20px var(--el-glow) } 50% { box-shadow: 0 8px 30px rgba(0,0,0,0.3), 0 0 35px var(--el-glow) } }
        .arena-skill-btn:active:not(:disabled) { transform: scale(0.95) !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <h2 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 24, fontWeight: 800,
          margin: 0,
          letterSpacing: "-0.03em",
          background: "linear-gradient(135deg, #f59e0b, #d97706, #f59e0b)",
          backgroundSize: "200% 100%",
          animation: "gradientShift 3s ease infinite",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          Pet Arena
        </h2>
        <span style={{
          fontFamily: "monospace", fontSize: 9, padding: "4px 12px", borderRadius: 8,
          background: "rgba(139,92,246,0.12)", color: "#a78bfa",
          border: "1px solid rgba(139,92,246,0.2)", fontWeight: 600,
          letterSpacing: "0.05em",
        }}>
          ELEMENT BATTLE
        </span>
        {phase === "battle" && (
          <span style={{
            fontFamily: "monospace", fontSize: 9, padding: "4px 12px", borderRadius: 8,
            background: "rgba(239,68,68,0.12)", color: "#f87171",
            border: "1px solid rgba(239,68,68,0.2)", fontWeight: 600,
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
          <GlassPanel style={{
            padding: "36px",
            background: "linear-gradient(135deg, rgba(15,15,35,0.95), rgba(20,20,60,0.9))",
            border: "1px solid rgba(245,158,11,0.12)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
          }}>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 22, fontWeight: 800,
              background: "linear-gradient(135deg, #f59e0b, #fbbf24)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              marginBottom: 6, textAlign: "center",
            }}>
              Choose Your Fighter
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 12,
              color: "rgba(255,255,255,0.35)", marginBottom: 32,
              textAlign: "center",
            }}>
              4-skill element battle -- type advantages matter!
            </div>

            {loading ? (
              <div style={{
                textAlign: "center", padding: 40,
              }}>
                <div style={{
                  width: 44, height: 44, border: "3px solid rgba(245,158,11,0.15)",
                  borderTopColor: "#f59e0b", borderRadius: "50%",
                  animation: "matchmakingSpin 0.8s linear infinite", margin: "0 auto 16px",
                }} />
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                  Loading your pets...
                </div>
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
                gap: 18,
              }}>
                {myPets.map((pet) => {
                  const mods = getPersonalityModifiers(pet.personality_type);
                  const hp = Math.floor((pet.level * 10 + pet.happiness) * mods.hp);
                  const element = (pet.element as Element) || SPECIES_ELEMENTS[pet.species] || "normal";
                  const el = ELEMENTS[element];
                  return (
                    <button
                      key={pet.id}
                      onClick={() => startBattle(pet)}
                      style={{
                        background: `linear-gradient(145deg, ${el.color}0a 0%, rgba(255,255,255,0.03) 50%, ${el.color}05 100%)`,
                        border: `1.5px solid ${el.color}25`,
                        borderRadius: 16,
                        padding: "28px 22px",
                        cursor: "pointer",
                        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                        textAlign: "center",
                        backdropFilter: "blur(8px)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(145deg, ${el.color}18 0%, rgba(255,255,255,0.06) 50%, ${el.color}0d 100%)`;
                        (e.currentTarget as HTMLButtonElement).style.borderColor = `${el.color}50`;
                        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-6px) scale(1.02)";
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 12px 40px ${el.color}20, 0 0 20px ${el.color}10`;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(145deg, ${el.color}0a 0%, rgba(255,255,255,0.03) 50%, ${el.color}05 100%)`;
                        (e.currentTarget as HTMLButtonElement).style.borderColor = `${el.color}25`;
                        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0) scale(1)";
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                      }}
                    >
                      <div style={{
                        width: 80, height: 80, borderRadius: 18,
                        margin: "0 auto 16px",
                        border: `2px solid ${el.color}35`,
                        overflow: "hidden",
                        background: `radial-gradient(circle at 50% 40%, ${el.color}15, ${el.color}05)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: `0 4px 16px ${el.color}15`,
                      }}>
                        {pet.avatar_url ? (
                          <img src={pet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: 44 }}>{PET_EMOJIS[pet.species] || "\u{1F43E}"}</span>
                        )}
                      </div>

                      <div style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 18, fontWeight: 700,
                        color: "#fff", marginBottom: 8,
                      }}>
                        {pet.name}
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <ElementBadge element={element} />
                      </div>

                      <div style={{
                        fontFamily: "monospace", fontSize: 11,
                        color: "rgba(255,255,255,0.35)", marginBottom: 16,
                      }}>
                        Lv.{pet.level} / {pet.personality_type}
                      </div>

                      <div style={{
                        display: "grid", gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                      }}>
                        {[
                          { label: "HP", value: hp, color: "#4ade80" },
                          { label: "ATK", value: Math.floor((10 + pet.level * 3) * mods.atk), color: "#f97316" },
                          { label: "DEF", value: Math.floor((8 + pet.level * 2) * mods.def), color: "#38bdf8" },
                          { label: "SPD", value: Math.floor((6 + pet.level * 2) * mods.spd), color: "#a78bfa" },
                        ].map((stat) => (
                          <div key={stat.label} style={{
                            background: "rgba(255,255,255,0.04)",
                            borderRadius: 8, padding: "5px 10px",
                            display: "flex", justifyContent: "space-between",
                            border: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            <span style={{
                              fontFamily: "monospace", fontSize: 10,
                              color: "rgba(255,255,255,0.3)",
                            }}>{stat.label}</span>
                            <span style={{
                              fontFamily: "monospace", fontSize: 10,
                              fontWeight: 700, color: stat.color,
                            }}>{stat.value}</span>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </GlassPanel>
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* ── PHASE: MATCHMAKING (spinning search) ── */}
      {/* ════════════════════════════════════════ */}
      {phase === "matchmaking" && selectedPet && (
        <div style={{
          animation: "fadeUp 0.3s ease-out",
        }}>
          <GlassPanel style={{
            padding: "80px 32px",
            background: "linear-gradient(180deg, rgba(10,10,30,0.97), rgba(15,15,50,0.97))",
            border: "1px solid rgba(245,158,11,0.12)",
            textAlign: "center",
          }}>
            {/* Spinning search ring */}
            <div style={{
              position: "relative",
              width: 120, height: 120,
              margin: "0 auto 28px",
            }}>
              {/* Outer spinning ring */}
              <div style={{
                position: "absolute", inset: -10,
                border: "3px solid transparent",
                borderTopColor: "#f59e0b",
                borderRightColor: "rgba(245,158,11,0.3)",
                borderRadius: "50%",
                animation: "matchmakingSpin 1.2s linear infinite",
              }} />
              {/* Inner spinning ring (opposite) */}
              <div style={{
                position: "absolute", inset: -4,
                border: "2px solid transparent",
                borderBottomColor: "#8b5cf6",
                borderLeftColor: "rgba(139,92,246,0.3)",
                borderRadius: "50%",
                animation: "matchmakingSpin 1.8s linear infinite reverse",
              }} />
              {/* Avatar */}
              <div style={{
                width: 100, height: 100, borderRadius: 24,
                margin: "10px auto 0",
                border: "3px solid rgba(245,158,11,0.3)",
                overflow: "hidden",
                background: "rgba(245,158,11,0.05)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "matchmakingPulse 1.5s ease infinite",
              }}>
                {selectedPet.avatar_url ? (
                  <img src={selectedPet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 52 }}>{PET_EMOJIS[selectedPet.species] || "\u{1F43E}"}</span>
                )}
              </div>
            </div>

            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 24, fontWeight: 800,
              background: "linear-gradient(135deg, #f59e0b, #fbbf24)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              marginBottom: 10,
            }}>
              Searching for opponent...
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 13,
              color: "rgba(255,255,255,0.3)",
              animation: "pulse2 1s ease infinite",
            }}>
              Matching {selectedPet.name} (Lv.{selectedPet.level} <Icon name={ELEMENT_ICONS[(selectedPet.element as Element) || "normal"] || "normal"} size={14} />) with a worthy rival
            </div>

            {/* Decorative dots */}
            <div style={{
              display: "flex", gap: 8, justifyContent: "center", marginTop: 24,
            }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#f59e0b",
                  animation: `pulse2 1s ease infinite ${i * 0.3}s`,
                }} />
              ))}
            </div>
          </GlassPanel>
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* ── PHASE: BATTLE (split-screen) ── */}
      {/* ════════════════════════════════════════ */}
      {(phase === "battle" || phase === "result") && player && opponent && (
        <div style={{
          position: "relative",
          animation: screenShake ? "screenShake 0.4s ease" : "fadeUp 0.3s ease-out",
        }}>
          <div style={{
            background: "linear-gradient(180deg, #080818 0%, #0c0c28 30%, #101040 60%, #141450 100%)",
            backgroundSize: "100% 200%",
            animation: "gradientShift 8s ease infinite",
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid rgba(245,158,11,0.1)",
            boxShadow: "0 12px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)",
            position: "relative",
          }}>
            {/* Subtle animated background gradient */}
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(ellipse at 30% 70%, rgba(139,92,246,0.04) 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(245,158,11,0.04) 0%, transparent 50%)",
              pointerEvents: "none",
            }} />

            {/* Scanline effect */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              overflow: "hidden", opacity: 0.02, zIndex: 1,
            }}>
              <div style={{
                width: "100%", height: "200%",
                background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
                animation: "scanline 8s linear infinite",
              }} />
            </div>

            {/* ── 3D BATTLE SCENE ── */}
            <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", minHeight: 220, maxHeight: 340 }}>
              <Suspense fallback={
                <div style={{
                  width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(180deg, #0a0a18, #060614)", borderRadius: 14, color: "#444", fontSize: 11,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>Loading Battle Arena...</div>
              }>
                <BattleScene3D
                  player={{
                    name: player.pet.name,
                    emoji: PET_EMOJIS[player.pet.species] || "\u{1F43E}",
                    element: player.element,
                    hp: player.hp, maxHp: player.maxHp,
                    avatar_url: player.pet.avatar_url,
                    level: player.pet.level,
                  }}
                  enemy={{
                    name: opponent.pet.name,
                    emoji: PET_EMOJIS[opponent.pet.species] || "\u{1F43E}",
                    element: opponent.element,
                    hp: opponent.hp, maxHp: opponent.maxHp,
                    avatar_url: opponent.pet.avatar_url,
                    level: opponent.pet.level,
                  }}
                  playerAttacking={anim3d.playerAttacking || playerShake === false}
                  enemyAttacking={anim3d.enemyAttacking}
                  playerHit={anim3d.playerHit || playerShake}
                  enemyHit={anim3d.enemyHit || opponentShake}
                  screenShake={anim3d.screenShake || screenShake}
                  cutsceneActive={anim3d.cutsceneActive}
                  currentElement={anim3d.currentElement}
                  currentStarLevel={anim3d.currentStarLevel}
                  isCrit={anim3d.isCrit}
                  isSuperEffective={anim3d.isSuperEffective}
                  damagePopups={anim3d.damagePopups}
                  battleOver={battleOver}
                />
              </Suspense>

              {/* HP Bar Overlay on top of 3D scene */}
              <HpBarOverlay
                player={{
                  name: player.pet.name, level: player.pet.level, element: player.element,
                  hp: player.hp, maxHp: player.maxHp, energy: player.energy, maxEnergy: player.maxEnergy,
                  avatarUrl: player.pet.avatar_url,
                }}
                enemy={{
                  name: opponent.pet.name, level: opponent.pet.level, element: opponent.element,
                  hp: opponent.hp, maxHp: opponent.maxHp, energy: opponent.energy, maxEnergy: opponent.maxEnergy,
                }}
                playerBuffs={{
                  defUp: playerDefBuff > 0,
                  spAtkUp: playerSpAtkBuff,
                  dodging: playerDodging,
                }}
                enemyBuffs={{
                  dodging: opponentDodging,
                  drain: opponentDrain > 0,
                }}
              />

              {/* Turn indicator overlay */}
              <div style={{
                position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
                fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                color: battleOver ? "#f59e0b" : isPlayerTurn ? "#4ade80" : "#f87171",
                background: battleOver ? "rgba(245,158,11,0.15)" : isPlayerTurn ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                padding: "3px 14px", borderRadius: 8,
                border: `1px solid ${battleOver ? "rgba(245,158,11,0.25)" : isPlayerTurn ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
                zIndex: 10, pointerEvents: "none",
                letterSpacing: "0.1em", textTransform: "uppercase",
                backdropFilter: "blur(4px)",
              }}>
                {battleOver ? "BATTLE OVER" : isPlayerTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
              </div>
            </div>

            {/* ── Battle Log ── */}
            <div style={{ padding: "0 24px 16px" }}>
              <BattleLog entries={battleLog} />
            </div>

            {/* ── 4-Skill Buttons V2 ── */}
            {!battleOver && player.skills.length > 0 && (
              <div style={{
                padding: "0 24px 24px",
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
              }}>
                {player.skills.slice(0, 4).map((eqSkill) => (
                  <SkillButtonV2
                    key={eqSkill.key}
                    skill={eqSkill.def}
                    skillLevel={eqSkill.level}
                    onClick={() => useSkill(eqSkill)}
                    disabled={!isPlayerTurn || animating || battleOver}
                    energyAvailable={player.energy}
                  />
                ))}
                {/* Fill empty slots */}
                {Array.from({ length: Math.max(0, 4 - player.skills.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    style={{
                      flex: 1, padding: "12px 8px", borderRadius: 12,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px dashed rgba(255,255,255,0.06)",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      gap: 4, opacity: 0.3,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>+</span>
                    <span style={{
                      fontFamily: "monospace", fontSize: 9,
                      color: "rgba(255,255,255,0.25)",
                    }}>
                      Empty Slot
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
                expGained={earnedExp}
                skillDrop={skillDrop}
                onClose={resetBattle}
              />
            )}
          </div>

          {/* ── Stats Bar Below Arena (glass morphism) ── */}
          <GlassPanel style={{
            display: "flex", justifyContent: "center", gap: 24,
            marginTop: 16, flexWrap: "wrap", padding: "12px 24px",
            background: "rgba(255,255,255,0.03)",
          }}>
            {player && (
              <>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  ATK <span style={{ color: "#f97316", fontWeight: 700 }}>{player.atk}</span>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  DEF <span style={{ color: "#38bdf8", fontWeight: 700 }}>{player.def}</span>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  SPD <span style={{ color: "#a78bfa", fontWeight: 700 }}>{player.spd}</span>
                </div>
                <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.08)" }} />
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  Turn <span style={{ color: "#f59e0b", fontWeight: 700 }}>{turn}</span>
                </div>
                <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.08)" }} />
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  <Icon name={ELEMENT_ICONS[player.element] || "normal"} size={14} /> vs <Icon name={ELEMENT_ICONS[opponent.element] || "normal"} size={14} />
                  {" "}
                  <span style={{
                    fontWeight: 700,
                    color: TYPE_CHART[player.element]?.[opponent.element] >= 2
                      ? "#4ade80"
                      : TYPE_CHART[player.element]?.[opponent.element] <= 0.5
                        ? "#f87171"
                        : "rgba(255,255,255,0.35)",
                  }}>
                    {TYPE_CHART[player.element]?.[opponent.element] >= 2
                      ? "ADVANTAGE"
                      : TYPE_CHART[player.element]?.[opponent.element] <= 0.5
                        ? "DISADVANTAGE"
                        : "NEUTRAL"}
                  </span>
                </div>
              </>
            )}
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

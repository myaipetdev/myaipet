"use client";

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { api } from "@/lib/api";
import {
  PVE_STAGES, REGIONS, getStage, getRegionForStage, generateMinion, calculateStars,
  type PveBoss, type Region,
} from "@/lib/pve";
import {
  SKILL_MAP, ELEMENTS, SPECIES_ELEMENTS, calcDamageV2, getStarterSkills,
  type Element, type SkillDef,
} from "@/lib/skills";
import Icon, { ELEMENT_ICONS } from "@/components/Icon";
import HpBarOverlay from "@/components/three/HpBarOverlay";
import { useBattleAnimations } from "@/hooks/useBattleAnimations";

const BattleScene3D = lazy(() => import("@/components/three/BattleScene3D"));

// ── Types ──
interface Pet {
  id: number; name: string; species: number; personality_type: string;
  level: number; experience: number; happiness: number; energy: number;
  hunger: number; bond_level: number; total_interactions: number;
  avatar_url?: string; element?: string; evolution_stage?: number;
}

interface EquippedSkill { key: string; def: SkillDef; level: number; slot: number; }

interface BattlePet {
  name: string; emoji: string; element: Element;
  hp: number; maxHp: number; atk: number; def: number; spd: number;
  energy: number; maxEnergy: number; skills: EquippedSkill[];
  avatar_url?: string; level: number;
}

interface StageInfo {
  id: number; name: string; emoji: string; title: string; element: string;
  level: number; isBoss: boolean; minLevel: number; unlocked: boolean;
  stars: number; bestTurns: number | null; bestHpLeft: number | null;
}

interface RegionInfo extends Omit<Region, "stages"> { stages: StageInfo[]; }

// ── Buff / Status tracking ──
interface BuffState {
  def_up: { stacks: number; turnsLeft: number };
  sp_atk_up: { stacks: number; turnsLeft: number };
  drain: boolean;
  burn: boolean;
  paralyze: boolean;
  water_boost: boolean;
}

function defaultBuffs(): BuffState {
  return {
    def_up: { stacks: 0, turnsLeft: 0 },
    sp_atk_up: { stacks: 0, turnsLeft: 0 },
    drain: false,
    burn: false,
    paralyze: false,
    water_boost: false,
  };
}

const STRUGGLE_SKILL: EquippedSkill = {
  key: "struggle", def: { key: "struggle", name: "Struggle", power: 30, accuracy: 100, energyCost: 0, element: "normal" as Element, type: "physical", emoji: "\u{1F4A5}", levelReq: 1, maxLevel: 1, rarity: 1, description: "A desperate attack used when out of energy.", price: 0 }, level: 1, slot: 0,
};

// ── Phases ──
type Phase = "map" | "select_pet" | "pre_battle" | "battle" | "result";

const PET_EMOJIS = [
  "🐱","🐕","🦜","🐢","🐹","🐰","🦊","🐶",
  "🐕‍🦺","🐶","🐉","🦅","🦄","🐺","🐯","🐼",
  "🐧","🦉","🐻","🐒","🐍","🦅","🐬","🦈",
  "🦝","🐾","🦎","🐹",
];

// ── Region theme gradients ──
const REGION_GRADIENTS: Record<number, string> = {
  1: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)", // Grasslands
  2: "linear-gradient(135deg, #7c2d12 0%, #431407 100%)", // Volcano
  3: "linear-gradient(135deg, #1e3a5f 0%, #0c1929 100%)", // Ocean
  4: "linear-gradient(135deg, #4a1d96 0%, #1e0a3c 100%)", // Storm
  5: "linear-gradient(135deg, #1c1c2e 0%, #0a0a14 100%)", // Shadow
  6: "linear-gradient(135deg, #713f12 0%, #3d1f00 100%)", // Dragon
};

const REGION_GLOW: Record<number, string> = {
  1: "0 0 30px rgba(34,197,94,0.15)",
  2: "0 0 30px rgba(249,115,22,0.15)",
  3: "0 0 30px rgba(59,130,246,0.15)",
  4: "0 0 30px rgba(234,179,8,0.15)",
  5: "0 0 30px rgba(139,92,246,0.15)",
  6: "0 0 30px rgba(234,179,8,0.2)",
};

// ── Floating damage type ──
interface FloatingDmg { id: number; text: string; x: string; color: string; isCrit: boolean; }

function getPersonalityMods(p: string) {
  switch (p) {
    case "brave": return { atk: 1.3, def: 1.0, spd: 1.0, hp: 1.0 };
    case "gentle": return { atk: 1.0, def: 1.3, spd: 1.0, hp: 1.0 };
    case "playful": return { atk: 1.0, def: 1.0, spd: 1.3, hp: 1.0 };
    case "lazy": return { atk: 1.0, def: 1.0, spd: 1.0, hp: 1.3 };
    default: return { atk: 1.1, def: 1.1, spd: 1.1, hp: 1.1 };
  }
}

function buildPlayerBattle(pet: Pet, skills: EquippedSkill[]): BattlePet {
  const m = getPersonalityMods(pet.personality_type);
  const el = (pet.element as Element) || SPECIES_ELEMENTS[pet.species] || "normal";
  return {
    name: pet.name, emoji: PET_EMOJIS[pet.species] || "🐾",
    element: el, level: pet.level,
    hp: Math.floor((pet.level * 10 + pet.happiness) * m.hp),
    maxHp: Math.floor((pet.level * 10 + pet.happiness) * m.hp),
    atk: Math.floor((10 + pet.level * 3) * m.atk),
    def: Math.floor((8 + pet.level * 2) * m.def),
    spd: Math.floor((6 + pet.level * 2) * m.spd),
    energy: 50, maxEnergy: 50 + pet.level * 2,
    skills, avatar_url: pet.avatar_url,
  };
}

function buildBossBattle(boss: PveBoss): BattlePet {
  const m = getPersonalityMods(boss.personality);
  const skills: EquippedSkill[] = boss.skills.map((s, i) => ({
    key: s.key, def: SKILL_MAP[s.key], level: s.level, slot: i,
  })).filter(s => s.def);
  return {
    name: boss.name, emoji: boss.emoji,
    element: boss.element, level: boss.level,
    hp: Math.floor(boss.baseHp * m.hp), maxHp: Math.floor(boss.baseHp * m.hp),
    atk: Math.floor(boss.baseAtk * m.atk), def: Math.floor(boss.baseDef * m.def),
    spd: Math.floor(boss.baseSpd * m.spd),
    energy: 50, maxEnergy: 60,
    skills,
  };
}

// ══════════════════════════════════════════
// ── Global Keyframe Styles ──
// ══════════════════════════════════════════
const GLOBAL_STYLES = `
  @keyframes pve-shake { 0%,100%{transform:translateX(0)} 10%{transform:translateX(-8px)} 20%{transform:translateX(8px)} 30%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 50%{transform:translateX(-4px)} 60%{transform:translateX(4px)} 70%{transform:translateX(-2px)} 80%{transform:translateX(2px)} }
  @keyframes pve-fadeUp { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(-60px)} }
  @keyframes pve-fadeUpCrit { from{opacity:1;transform:translateY(0) scale(1)} to{opacity:0;transform:translateY(-80px) scale(1.4)} }
  @keyframes pve-fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pve-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
  @keyframes pve-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.08);opacity:0.9} }
  @keyframes pve-glow { 0%,100%{box-shadow:0 0 8px rgba(255,215,0,0.3)} 50%{box-shadow:0 0 20px rgba(255,215,0,0.6)} }
  @keyframes pve-slideUp { from{opacity:0;transform:translateY(100%)} to{opacity:1;transform:translateY(0)} }
  @keyframes pve-slideDown { from{opacity:0;transform:translateY(-30px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pve-screenDarken { from{background:transparent} to{background:rgba(0,0,0,0.6)} }
  @keyframes pve-battlePulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
  @keyframes pve-flashWhite { 0%{opacity:0} 20%{opacity:0.6} 100%{opacity:0} }
  @keyframes pve-flashRed { 0%{opacity:0} 20%{opacity:0.4} 100%{opacity:0} }
  @keyframes pve-superEffective { 0%{opacity:0;transform:scale(0.5)} 30%{opacity:1;transform:scale(1.3)} 60%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(1) translateY(-20px)} }
  @keyframes pve-victoryBurst { 0%{transform:scale(0);opacity:0} 50%{transform:scale(1.2);opacity:1} 100%{transform:scale(1);opacity:1} }
  @keyframes pve-starFill { 0%{transform:scale(0) rotateY(180deg);opacity:0} 60%{transform:scale(1.3) rotateY(0);opacity:1} 100%{transform:scale(1) rotateY(0);opacity:1} }
  @keyframes pve-rewardSlide { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
  @keyframes pve-chestOpen { 0%{transform:scale(0.8) rotate(-5deg)} 50%{transform:scale(1.2) rotate(5deg)} 100%{transform:scale(1) rotate(0deg)} }
  @keyframes pve-expFill { from{width:0} }
  @keyframes pve-nodePulse { 0%,100%{box-shadow:0 0 4px rgba(255,215,0,0.4)} 50%{box-shadow:0 0 16px rgba(255,215,0,0.8)} }
  @keyframes pve-pathDash { from{stroke-dashoffset:20} to{stroke-dashoffset:0} }
  @keyframes pve-bgFlow { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  @keyframes pve-attackFlash { 0%{filter:brightness(1)} 30%{filter:brightness(2.5)} 100%{filter:brightness(1)} }
  @keyframes pve-hitShake { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-5px) rotate(-1deg)} 30%{transform:translateX(5px) rotate(1deg)} 45%{transform:translateX(-3px)} 60%{transform:translateX(3px)} }
  @keyframes pve-miss { 0%{opacity:1;transform:translateY(0) translateX(0)} 100%{opacity:0;transform:translateY(-30px) translateX(15px)} }
  @keyframes pve-defeatDim { from{filter:brightness(1)} to{filter:brightness(0.4) grayscale(0.5)} }
  @keyframes pve-lockChain { 0%,100%{transform:rotate(-2deg)} 50%{transform:rotate(2deg)} }
  @keyframes pve-scrollReveal { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
`;

// ══════════════════════════════════════════
// ── PvE Mode Component ──
// ══════════════════════════════════════════
export default function PveMode({ initialStage, onBack }: { initialStage?: number; onBack?: () => void } = {}) {
  const [phase, setPhase] = useState<Phase>("map");
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [currentStage, setCurrentStage] = useState(1);
  const [totalStars, setTotalStars] = useState(0);
  const [loading, setLoading] = useState(true);

  // Battle state
  const [selectedStage, setSelectedStage] = useState<PveBoss | null>(null);
  const [myPets, setMyPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [player, setPlayer] = useState<BattlePet | null>(null);
  const [enemy, setEnemy] = useState<BattlePet | null>(null);
  const [turn, setTurn] = useState(1);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [battleOver, setBattleOver] = useState(false);
  const [won, setWon] = useState(false);
  const [stars, setStars] = useState(0);
  const [resultData, setResultData] = useState<any>(null);
  const [animating, setAnimating] = useState(false);
  const [playerDodging, setPlayerDodging] = useState(false);
  const [enemyDodging, setEnemyDodging] = useState(false);
  const [buffs, setBuffs] = useState<BuffState>(defaultBuffs());
  const logRef = useRef<HTMLDivElement>(null);

  // Visual state
  const [floatingDmgs, setFloatingDmgs] = useState<FloatingDmg[]>([]);
  const [playerHit, setPlayerHit] = useState(false);
  const [enemyHit, setEnemyHit] = useState(false);
  const [playerAttacking, setPlayerAttacking] = useState(false);
  const [enemyAttacking, setEnemyAttacking] = useState(false);
  const [screenShake, setScreenShake] = useState(false);
  const [superEffText, setSuperEffText] = useState<string | null>(null);
  const [preBattleReady, setPreBattleReady] = useState(false);
  const [typewriterText, setTypewriterText] = useState("");
  const [starsRevealed, setStarsRevealed] = useState(0);
  const dmgIdRef = useRef(0);

  // Battle sprite URLs (AI generated)
  const [playerSpriteUrl, setPlayerSpriteUrl] = useState<string | null>(null);
  const [enemySpriteUrl, setEnemySpriteUrl] = useState<string | null>(null);
  const spriteCacheRef = useRef<Record<string, string>>({});

  // ── 3D Battle Animation Hook ──
  const { animState: anim3d, playAction: play3dAction, resetAnim: reset3dAnim } = useBattleAnimations();

  // ── Floating damage helper ──
  const spawnFloatingDmg = (text: string, side: "left" | "right", color: string, isCrit: boolean) => {
    const id = ++dmgIdRef.current;
    const x = side === "left" ? "20%" : "75%";
    setFloatingDmgs(prev => [...prev, { id, text, x, color, isCrit }]);
    setTimeout(() => setFloatingDmgs(prev => prev.filter(d => d.id !== id)), 1200);
  };

  // ── Trigger hit VFX ──
  const triggerHitVfx = (target: "player" | "enemy", isCrit: boolean) => {
    if (target === "player") {
      setPlayerHit(true);
      setTimeout(() => setPlayerHit(false), 500);
    } else {
      setEnemyHit(true);
      setTimeout(() => setEnemyHit(false), 500);
    }
    if (isCrit) {
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 400);
    }
  };

  const triggerSuperEffective = (text: string) => {
    setSuperEffText(text);
    setTimeout(() => setSuperEffText(null), 1500);
  };

  // ── Load progress ──
  const loadProgress = async (petId?: number) => {
    try {
      const data = await api.pve.getProgress(petId);
      setRegions(data.regions || []);
      setCurrentStage(data.currentStage || 1);
      setTotalStars(data.totalStars || 0);
    } catch {
      setRegions(REGIONS.map(r => ({
        ...r,
        stages: r.stages.map(sid => {
          const s = getStage(sid)!;
          return {
            id: sid, name: s.name, emoji: s.emoji, title: s.title,
            element: s.element, level: s.level, isBoss: s.isBoss,
            minLevel: Math.max(1, s.level - 3), unlocked: sid <= 1,
            stars: 0, bestTurns: null, bestHpLeft: null,
          };
        }),
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProgress();
    if (initialStage) {
      const boss = getStage(initialStage);
      if (boss) {
        setSelectedStage(boss);
        setPhase("select_pet");
        api.pets.list()
          .then((d: any) => setMyPets(d.pets || d || []))
          .catch(() => setMyPets([]));
      }
    }
  }, []);

  // ── Select stage ──
  const selectStage = (stageId: number) => {
    const boss = getStage(stageId);
    if (!boss) return;
    setSelectedStage(boss);
    setPhase("select_pet");
    api.pets.list()
      .then((d: any) => setMyPets(d.pets || d || []))
      .catch(() => setMyPets([]));
  };

  // ── Fetch pet skills ──
  async function getPetSkills(pet: Pet): Promise<EquippedSkill[]> {
    try {
      const data = await api.skills.get(pet.id);
      const equipped = (data.skills || [])
        .filter((s: any) => s.slot !== null)
        .sort((a: any, b: any) => a.slot - b.slot)
        .map((s: any) => ({ key: s.skill_key, def: s.def || SKILL_MAP[s.skill_key], level: s.level, slot: s.slot }))
        .filter((s: any) => s.def);
      if (equipped.length > 0) return equipped;
    } catch {}
    const el = (pet.element as Element) || SPECIES_ELEMENTS[pet.species] || "normal";
    return getStarterSkills(el).map((k, i) => ({ key: k, def: SKILL_MAP[k], level: 1, slot: i }));
  }

  // ── Start battle ──
  const startBattle = useCallback(async (pet: Pet) => {
    if (!selectedStage) return;
    setSelectedPet(pet);
    setPhase("pre_battle");
    setPreBattleReady(false);
    setTypewriterText("");

    const skills = await getPetSkills(pet);
    const p = buildPlayerBattle(pet, skills);
    const e = buildBossBattle(selectedStage);

    setPlayer(p);
    setEnemy(e);
    setTurn(1);
    setIsPlayerTurn(p.spd >= e.spd);
    setBattleLog([selectedStage.dialogue.intro]);
    setBattleOver(false);
    setWon(false);
    setStars(0);
    setResultData(null);
    setPlayerDodging(false);
    setEnemyDodging(false);
    setAnimating(false);
    setBuffs(defaultBuffs());
    setFloatingDmgs([]);
    setStarsRevealed(0);

    // Generate battle sprites (async, non-blocking)
    const playerKey = `player_${pet.id}_${pet.element}`;
    const enemyKey = `enemy_${selectedStage.name}_${selectedStage.element}`;

    if (spriteCacheRef.current[playerKey]) {
      setPlayerSpriteUrl(spriteCacheRef.current[playerKey]);
    } else if (!pet.avatar_url) {
      setPlayerSpriteUrl(null);
      api.battleSprite.generate(pet.name, pet.species, (pet.element as string) || "normal", pet.personality_type)
        .then((r: any) => { if (r.url) { spriteCacheRef.current[playerKey] = r.url; setPlayerSpriteUrl(r.url); } })
        .catch(() => {});
    } else {
      setPlayerSpriteUrl(pet.avatar_url);
    }

    if (spriteCacheRef.current[enemyKey]) {
      setEnemySpriteUrl(spriteCacheRef.current[enemyKey]);
    } else {
      setEnemySpriteUrl(null);
      api.battleSprite.generate(selectedStage.name, 0, selectedStage.element, selectedStage.personality, true)
        .then((r: any) => { if (r.url) { spriteCacheRef.current[enemyKey] = r.url; setEnemySpriteUrl(r.url); } })
        .catch(() => {});
    }

    // Typewriter effect for boss dialogue
    const introText = selectedStage.dialogue.intro;
    let charIdx = 0;
    const typeInterval = setInterval(() => {
      charIdx++;
      setTypewriterText(introText.slice(0, charIdx));
      if (charIdx >= introText.length) {
        clearInterval(typeInterval);
        setTimeout(() => setPreBattleReady(true), 400);
      }
    }, 35);

  }, [selectedStage]);

  // ── Use skill ──
  const useSkill = useCallback((eq: EquippedSkill) => {
    if (!player || !enemy || battleOver || !isPlayerTurn || animating) return;
    const skill = eq.def;
    if (player.energy < skill.energyCost) return;
    setAnimating(true);
    setPlayerAttacking(true);
    setTimeout(() => setPlayerAttacking(false), 400);

    setPlayer(p => p ? { ...p, energy: p.energy - skill.energyCost } : p);

    if (Math.random() * 100 >= skill.accuracy) {
      setBattleLog(l => [...l, `${player.name} used ${skill.emoji} ${skill.name}... Miss!`]);
      spawnFloatingDmg("MISS", "right", "#888", false);
      setTimeout(() => enemyTurn(), 1000);
      return;
    }
    if (enemyDodging && skill.power > 0) {
      setBattleLog(l => [...l, `${enemy.name} dodged ${skill.name}!`]);
      spawnFloatingDmg("DODGE", "right", "#60a5fa", false);
      setEnemyDodging(false);
      setTimeout(() => enemyTurn(), 1000);
      return;
    }

    // Status
    if (skill.effect === "dodge") {
      setPlayerDodging(true);
      const heal = Math.floor(player.maxHp * 0.08);
      setPlayer(p => p ? { ...p, hp: Math.min(p.maxHp, p.hp + heal) } : p);
      setBattleLog(l => [...l, `${player.name} dodges! +${heal} HP`]);
      spawnFloatingDmg(`+${heal}`, "left", "#4ade80", false);
      setTimeout(() => enemyTurn(), 800);
      return;
    }
    if (skill.power === 0) {
      if (skill.effect === "atk_down") setEnemy(e => e ? { ...e, atk: Math.max(1, e.atk - 5) } : e);
      if (skill.effect === "def_up") {
        setBuffs(b => {
          const cur = b.def_up;
          if (cur.stacks >= 2) return b;
          const newStacks = cur.stacks + 1;
          setPlayer(p => p ? { ...p, def: p.def + 8 } : p);
          return { ...b, def_up: { stacks: newStacks, turnsLeft: 3 } };
        });
      }
      if (skill.effect === "sp_atk_up") {
        setBuffs(b => {
          const cur = b.sp_atk_up;
          if (cur.stacks >= 2) return b;
          const newStacks = cur.stacks + 1;
          setPlayer(p => p ? { ...p, atk: p.atk + 8 } : p);
          return { ...b, sp_atk_up: { stacks: newStacks, turnsLeft: 3 } };
        });
      }
      if (skill.effect === "drain") {
        setBuffs(b => ({ ...b, drain: true }));
        setBattleLog(l => [...l, `${player.name} planted Leech Seed!`]);
      }
      if (skill.effect === "burn") {
        setBuffs(b => ({ ...b, burn: true }));
        setBattleLog(l => [...l, `${enemy.name} was burned!`]);
      }
      if (skill.effect === "paralyze") {
        setBuffs(b => ({ ...b, paralyze: true }));
        setBattleLog(l => [...l, `${enemy.name} was paralyzed!`]);
      }
      if (skill.effect === "water_boost") {
        setBuffs(b => ({ ...b, water_boost: true }));
        setBattleLog(l => [...l, `${player.name} is channeling water energy!`]);
      }
      setBattleLog(l => [...l, `${player.name} used ${skill.emoji} ${skill.name}!`]);
      setTimeout(() => enemyTurn(), 800);
      return;
    }

    // Damage
    let atkBonus = player.atk;
    if (buffs.water_boost && skill.element === "water") {
      atkBonus = Math.floor(atkBonus * 1.2);
      setBuffs(b => ({ ...b, water_boost: false }));
      setBattleLog(l => [...l, `Water boost amplifies the attack!`]);
    }
    const { damage, effectiveness, isCrit } = calcDamageV2({
      attackerAtk: atkBonus, defenderDef: enemy.def,
      skill, skillLevel: eq.level,
      attackerElement: player.element, defenderElement: enemy.element,
      defBuff: 0,
    });

    // VFX
    triggerHitVfx("enemy", isCrit);
    const dmgColor = isCrit ? "#fbbf24" : effectiveness >= 2 ? "#f87171" : "#fff";
    spawnFloatingDmg(`${damage}`, "right", dmgColor, isCrit);
    if (effectiveness >= 2) triggerSuperEffective("SUPER EFFECTIVE!");
    else if (effectiveness <= 0.5) triggerSuperEffective("Not very effective...");

    setEnemy(e => {
      if (!e) return e;
      const newHp = e.hp - damage;
      if (newHp <= 0) {
        setBattleOver(true);
        setWon(true);
        return { ...e, hp: 0 };
      }
      return { ...e, hp: newHp };
    });

    let msg = `${player.name} used ${skill.emoji} ${skill.name}! -${damage}`;
    if (isCrit) msg += " CRIT!";
    if (effectiveness >= 2) msg += " Super effective!";
    else if (effectiveness <= 0.5) msg += " Not very effective...";
    setBattleLog(l => [...l, msg]);

    setPlayer(p => p ? { ...p, energy: Math.min(p.maxEnergy, p.energy + 3) } : p);

    setTimeout(() => {
      if (enemy.hp - damage <= 0) {
        finishBattle(true);
      } else {
        enemyTurn();
      }
    }, 800);
  }, [player, enemy, battleOver, isPlayerTurn, animating, enemyDodging]);

  // ── Enemy turn ──
  const enemyTurn = useCallback(() => {
    setIsPlayerTurn(false);
    setTimeout(() => {
      if (!enemy || !player || battleOver) { setAnimating(false); return; }

      setEnemyAttacking(true);
      setTimeout(() => setEnemyAttacking(false), 400);

      const affordable = enemy.skills.filter(s => s.def && s.def.energyCost <= enemy.energy);
      const chosen = affordable.length > 0 ? affordable[Math.floor(Math.random() * affordable.length)] : enemy.skills[0];
      if (!chosen?.def) { setIsPlayerTurn(true); setAnimating(false); return; }
      const skill = chosen.def;

      if (Math.random() * 100 >= skill.accuracy) {
        setBattleLog(l => [...l, `${enemy.name} used ${skill.emoji} ${skill.name}... Miss!`]);
        spawnFloatingDmg("MISS", "left", "#888", false);
      } else if (playerDodging && skill.power > 0) {
        setBattleLog(l => [...l, `${player.name} dodged ${skill.name}!`]);
        spawnFloatingDmg("DODGE", "left", "#60a5fa", false);
        setPlayerDodging(false);
      } else if (skill.power > 0) {
        const { damage, effectiveness, isCrit } = calcDamageV2({
          attackerAtk: enemy.atk, defenderDef: player.def,
          skill, skillLevel: chosen.level,
          attackerElement: enemy.element, defenderElement: player.element,
          defBuff: 0,
        });

        triggerHitVfx("player", isCrit);
        const dmgColor = isCrit ? "#fbbf24" : effectiveness >= 2 ? "#f87171" : "#fff";
        spawnFloatingDmg(`${damage}`, "left", dmgColor, isCrit);
        if (effectiveness >= 2) triggerSuperEffective("SUPER EFFECTIVE!");

        setPlayer(p => {
          if (!p) return p;
          const newHp = p.hp - damage;
          if (newHp <= 0) { setBattleOver(true); setWon(false); return { ...p, hp: 0 }; }
          return { ...p, hp: newHp };
        });
        let msg = `${enemy.name} used ${skill.emoji} ${skill.name}! -${damage}`;
        if (isCrit) msg += " CRIT!";
        if (effectiveness >= 2) msg += " Super effective!";
        setBattleLog(l => [...l, msg]);

        if (player.hp - damage <= 0) {
          setTimeout(() => finishBattle(false), 500);
          return;
        }
      } else {
        if (skill.effect === "dodge") setEnemyDodging(true);
        if (skill.effect === "def_up") setEnemy(e => e ? { ...e, def: e.def + 8 } : e);
        if (skill.effect === "atk_down") setPlayer(p => p ? { ...p, atk: Math.max(1, p.atk - 4) } : p);
        setBattleLog(l => [...l, `${enemy.name} used ${skill.emoji} ${skill.name}!`]);
      }

      setEnemy(e => e ? { ...e, energy: Math.min(e.maxEnergy, e.energy - skill.energyCost + 3) } : e);
      setTurn(t => t + 1);
      setIsPlayerTurn(true);
      setAnimating(false);
    }, 1000);
  }, [enemy, player, battleOver, playerDodging]);

  // ── Finish battle ──
  const finishBattle = async (didWin: boolean) => {
    if (!selectedPet || !selectedStage || !player || !enemy) return;
    const hpLeft = didWin ? player.hp : 0;
    const s = calculateStars(didWin, hpLeft / player.maxHp, turn);
    setStars(s);
    setBattleOver(true);
    setWon(didWin);

    try {
      const res = await api.pve.reportResult(
        selectedPet.id, selectedStage.id, didWin, turn, hpLeft, player.maxHp
      );
      setResultData(res);
    } catch {}

    setTimeout(() => {
      setPhase("result");
      setStarsRevealed(0);
      // Animate stars one by one
      for (let i = 1; i <= s; i++) {
        setTimeout(() => setStarsRevealed(i), 400 + i * 500);
      }
    }, 1500);
  };

  // Scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battleLog]);

  // ── Back to map ──
  const backToMap = () => {
    if (onBack) { onBack(); return; }
    setPhase("map");
    setSelectedStage(null);
    setPlayer(null);
    setEnemy(null);
    loadProgress(selectedPet?.id);
  };

  // ══════════════════════════════════════
  // ── RENDER ──
  // ══════════════════════════════════════

  if (loading) return (
    <div style={{
      textAlign: "center", padding: 60, color: "#666",
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ fontSize: 40, marginBottom: 16, animation: "pve-pulse 1.5s ease infinite" }}><Icon name="sword" size={40} /></div>
      <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase" }}>Loading Story Mode...</div>
    </div>
  );

  // ══════════════════════════════════════
  // ── MAP VIEW ──
  // ══════════════════════════════════════
  if (phase === "map") {
    return (
      <div style={{ padding: "0 8px" }}>
        <style>{GLOBAL_STYLES}</style>

        {/* Header */}
        <div style={{
          textAlign: "center", marginBottom: 20, padding: "16px 0",
          background: "linear-gradient(180deg, rgba(234,179,8,0.06) 0%, transparent 100%)",
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}><Icon name="sword" size={28} /></div>
          <h3 style={{
            color: "#e0e0e0", fontSize: 20, fontWeight: 800, margin: 0,
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: 3, textTransform: "uppercase",
            textShadow: "0 0 20px rgba(234,179,8,0.3)",
          }}>
            STORY MODE
          </h3>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            marginTop: 8, padding: "4px 14px", borderRadius: 20,
            background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.15)",
          }}>
            <Icon name="star" size={16} />
            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#facc15" }}>
              {totalStars}
            </span>
            <span style={{ color: "#555", fontSize: 10 }}>/ 90</span>
          </div>
        </div>

        {/* Region cards */}
        {regions.map((region, rIdx) => {
          const allCleared = region.stages.every((s) => s.stars > 0);
          const regionStars = region.stages.reduce((a, s) => a + s.stars, 0);
          const anyUnlocked = region.stages.some((s) => s.unlocked);
          const gradient = REGION_GRADIENTS[region.id] || REGION_GRADIENTS[1];
          const glow = REGION_GLOW[region.id] || REGION_GLOW[1];

          return (
            <div key={region.id} style={{
              marginBottom: 16,
              background: anyUnlocked ? gradient : "linear-gradient(135deg, #0e0e14 0%, #111118 100%)",
              borderRadius: 16,
              border: `1px solid ${anyUnlocked ? region.color + "40" : "#1a1a22"}`,
              padding: "16px 18px",
              opacity: anyUnlocked ? 1 : 0.35,
              transition: "all 0.4s ease",
              boxShadow: anyUnlocked ? glow : "none",
              position: "relative",
              overflow: "hidden",
              animation: anyUnlocked ? "pve-scrollReveal 0.5s ease" : "none",
              animationDelay: `${rIdx * 0.1}s`,
              animationFillMode: "both",
            }}>
              {/* Ambient bg glow */}
              {anyUnlocked && (
                <div style={{
                  position: "absolute", top: -40, right: -40, width: 120, height: 120,
                  borderRadius: "50%", background: `radial-gradient(circle, ${region.color}15 0%, transparent 70%)`,
                  pointerEvents: "none",
                }} />
              )}

              {/* Region header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 14, position: "relative",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    fontSize: 26, width: 44, height: 44, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    borderRadius: 12, background: `${region.color}15`,
                    border: `1px solid ${region.color}30`,
                  }}>
                    {region.emoji}
                  </div>
                  <div>
                    <div style={{
                      color: "#f0f0f0", fontSize: 14, fontWeight: 800,
                      fontFamily: "'Space Grotesk', sans-serif",
                      letterSpacing: 0.5,
                    }}>
                      {region.name}
                    </div>
                    <div style={{ color: "#666", fontSize: 10, marginTop: 1 }}>{region.description}</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "2px 8px", borderRadius: 8, background: `${region.color}10`,
                  }}>
                    <Icon name="star" size={12} />
                    <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: region.color }}>
                      {regionStars}/{region.stages.length * 3}
                    </span>
                  </div>
                  {allCleared && <span style={{ fontSize: 14 }}>✅</span>}
                </div>
              </div>

              {/* Path + stage nodes */}
              <div style={{ position: "relative", padding: "4px 0" }}>
                {/* Connection path line */}
                <div style={{
                  position: "absolute", top: "50%", left: 20, right: 20,
                  height: 2, transform: "translateY(-50%)",
                  background: `linear-gradient(90deg, ${region.color}30, ${region.color}15, ${region.color}30)`,
                  borderRadius: 1, zIndex: 0,
                }} />
                {/* Animated dashes on path */}
                <svg style={{
                  position: "absolute", top: "50%", left: 20, right: 20,
                  width: "calc(100% - 40px)", height: 2, transform: "translateY(-50%)", zIndex: 0,
                }}>
                  <line x1="0" y1="1" x2="100%" y2="1"
                    stroke={region.color} strokeWidth="2" strokeDasharray="6 8"
                    style={{ animation: "pve-pathDash 1.5s linear infinite" }}
                    opacity={0.4}
                  />
                </svg>

                <div style={{
                  display: "flex", gap: 8, justifyContent: "space-between",
                  position: "relative", zIndex: 1,
                }}>
                  {region.stages.map((stage, sIdx) => {
                    const el = ELEMENTS[stage.element as Element] || ELEMENTS.normal;
                    const isCurrent = stage.unlocked && stage.stars === 0 &&
                      (sIdx === 0 || region.stages[sIdx - 1]?.stars > 0);

                    return (
                      <button
                        key={stage.id}
                        onClick={() => stage.unlocked && selectStage(stage.id)}
                        disabled={!stage.unlocked}
                        style={{
                          flex: "1 0 0",
                          maxWidth: stage.isBoss ? 120 : 100,
                          padding: stage.isBoss ? "10px 6px" : "8px 6px",
                          borderRadius: stage.isBoss ? 14 : 12,
                          background: stage.unlocked
                            ? stage.isBoss
                              ? `linear-gradient(135deg, ${el.color}20, ${el.color}08)`
                              : stage.stars > 0
                                ? `${el.color}12`
                                : "rgba(255,255,255,0.04)"
                            : "rgba(0,0,0,0.3)",
                          border: stage.unlocked
                            ? isCurrent
                              ? `2px solid ${el.color}80`
                              : stage.isBoss
                                ? `2px solid ${el.color}50`
                                : `1px solid ${stage.stars > 0 ? el.color + "40" : "rgba(255,255,255,0.06)"}`
                            : "1px solid rgba(255,255,255,0.03)",
                          cursor: stage.unlocked ? "pointer" : "not-allowed",
                          textAlign: "center",
                          transition: "all 0.3s ease",
                          fontFamily: "inherit",
                          position: "relative",
                          overflow: "hidden",
                          animation: isCurrent ? "pve-nodePulse 2s ease infinite" : "none",
                          filter: !stage.unlocked ? "grayscale(1)" : "none",
                          transform: stage.isBoss ? "scale(1.05)" : "none",
                          boxShadow: isCurrent
                            ? `0 0 12px ${el.color}40`
                            : stage.isBoss && stage.unlocked
                              ? `0 0 8px ${el.color}20`
                              : "none",
                        }}
                      >
                        {/* Lock overlay for locked stages */}
                        {!stage.unlocked && (
                          <div style={{
                            position: "absolute", inset: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "rgba(0,0,0,0.5)", borderRadius: "inherit", zIndex: 2,
                          }}>
                            <span style={{ animation: "pve-lockChain 2s ease infinite" }}><Icon name="lock" size={18} /></span>
                          </div>
                        )}

                        {/* Boss crown indicator */}
                        {stage.isBoss && stage.unlocked && (
                          <div style={{
                            position: "absolute", top: -2, right: -2,
                            filter: "drop-shadow(0 0 4px rgba(234,179,8,0.5))",
                          }}>
                            <Icon name="crown" size={14} />
                          </div>
                        )}

                        <div style={{
                          fontSize: stage.isBoss ? 22 : 18, marginBottom: 3,
                          filter: stage.unlocked ? "none" : "grayscale(1) brightness(0.5)",
                        }}>
                          {stage.emoji}
                        </div>
                        <div style={{
                          fontSize: 9, fontWeight: 800, color: stage.unlocked ? "#e8e8e8" : "#333",
                          fontFamily: "'Space Grotesk', sans-serif",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {stage.name}
                        </div>
                        <div style={{
                          fontSize: 8, color: stage.unlocked ? "#777" : "#333",
                          fontFamily: "monospace", marginTop: 1,
                        }}>
                          Lv.{stage.level}
                        </div>

                        {/* Stars display */}
                        {stage.unlocked && (
                          <div style={{ display: "flex", justifyContent: "center", gap: 1, marginTop: 3 }}>
                            {[1, 2, 3].map(i => (
                              <span key={i} style={{
                                filter: i <= stage.stars
                                  ? "drop-shadow(0 0 3px rgba(250,204,21,0.6))"
                                  : "none",
                                opacity: i <= stage.stars ? 1 : 0.25,
                              }}>
                                <Icon name="star" size={12} />
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ══════════════════════════════════════
  // ── PET SELECT ──
  // ══════════════════════════════════════
  if (phase === "select_pet" && selectedStage) {
    const region = getRegionForStage(selectedStage.id);
    const bossEl = ELEMENTS[selectedStage.element] || ELEMENTS.normal;

    return (
      <div style={{ padding: "0 8px" }}>
        <style>{GLOBAL_STYLES}</style>

        <button onClick={backToMap} style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10, padding: "8px 16px", color: "#888", fontSize: 11, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif", marginBottom: 16,
          transition: "all 0.2s", backdropFilter: "blur(8px)", letterSpacing: 1,
        }}>
          ← BACK TO MAP
        </button>

        {/* Boss card */}
        <div style={{
          background: `linear-gradient(180deg, ${region?.color || "#333"}18 0%, #0a0a14 100%)`,
          borderRadius: 18, padding: "24px 20px", position: "relative", overflow: "hidden",
          border: `1px solid ${region?.color || "#333"}35`,
          marginBottom: 20, boxShadow: `0 0 40px ${region?.color || "#333"}10`,
          backdropFilter: "blur(10px)",
        }}>
          {/* Decorative bg circles */}
          <div style={{
            position: "absolute", top: -60, right: -60, width: 160, height: 160,
            borderRadius: "50%", background: `radial-gradient(circle, ${bossEl.color}10 0%, transparent 70%)`,
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: -40, left: -40, width: 100, height: 100,
            borderRadius: "50%", background: `radial-gradient(circle, ${bossEl.color}08 0%, transparent 70%)`,
            pointerEvents: "none",
          }} />

          <div style={{ textAlign: "center", position: "relative" }}>
            <div style={{
              fontSize: 56, marginBottom: 10,
              filter: `drop-shadow(0 0 20px ${bossEl.color}60)`,
              animation: "pve-bounce 2.5s ease infinite",
            }}>
              {selectedStage.emoji}
            </div>

            <div style={{
              color: "#f0f0f0", fontSize: 20, fontWeight: 800,
              fontFamily: "'Space Grotesk', sans-serif", letterSpacing: 1,
            }}>
              {selectedStage.name}
            </div>

            <div style={{
              color: region?.color || "#888", fontSize: 12, fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: 2, textTransform: "uppercase", marginTop: 2,
            }}>
              {selectedStage.title}
            </div>

            {/* Element + level badges */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
              <span style={{
                fontSize: 10, padding: "3px 10px", borderRadius: 20,
                background: `${bossEl.color}15`, border: `1px solid ${bossEl.color}30`,
                color: bossEl.color, fontFamily: "monospace", fontWeight: 700,
              }}>
                <Icon name={ELEMENT_ICONS[selectedStage.element] || "normal"} size={12} /> {selectedStage.element.toUpperCase()}
              </span>
              <span style={{
                fontSize: 10, padding: "3px 10px", borderRadius: 20,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                color: "#aaa", fontFamily: "monospace", fontWeight: 700,
              }}>
                LV.{selectedStage.level}
              </span>
              {selectedStage.isBoss && (
                <span style={{
                  fontSize: 10, padding: "3px 10px", borderRadius: 20,
                  background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)",
                  color: "#facc15", fontFamily: "monospace", fontWeight: 700,
                  display: "inline-flex", alignItems: "center", gap: 3,
                }}>
                  <Icon name="crown" size={12} /> BOSS
                </span>
              )}
            </div>

            {/* HP preview */}
            <div style={{
              marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: "#555" }}>HP</span>
              <div style={{
                width: 120, height: 6, borderRadius: 3, overflow: "hidden",
                background: "rgba(255,255,255,0.08)",
              }}>
                <div style={{
                  width: "100%", height: "100%", borderRadius: 3,
                  background: `linear-gradient(90deg, #4ade80, ${bossEl.color})`,
                }} />
              </div>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: "#555" }}>FULL</span>
            </div>

            {/* Boss skills preview */}
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {selectedStage.skills.map((s, i) => {
                const sd = SKILL_MAP[s.key];
                if (!sd) return null;
                const sEl = ELEMENTS[sd.element] || ELEMENTS.normal;
                return (
                  <span key={i} style={{
                    fontSize: 9, padding: "3px 8px", borderRadius: 8,
                    background: `${sEl.color}10`, border: `1px solid ${sEl.color}20`,
                    color: "#888", fontFamily: "monospace",
                  }}>
                    {sd.emoji} {sd.name}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pet selection header */}
        <div style={{
          color: "#888", fontSize: 12, textAlign: "center", marginBottom: 14, fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif", letterSpacing: 2, textTransform: "uppercase",
        }}>
          Choose Your Fighter
          <span style={{
            display: "block", fontSize: 9, color: "#555", fontWeight: 400, marginTop: 2, letterSpacing: 0,
          }}>
            Min Lv.{Math.max(1, selectedStage.level - 3)}
          </span>
        </div>

        {/* Pet cards */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {myPets.map((pet) => {
            const meetsLevel = pet.level >= Math.max(1, selectedStage.level - 3);
            const el = ELEMENTS[(pet.element as Element) || SPECIES_ELEMENTS[pet.species] || "normal"];
            return (
              <button
                key={pet.id}
                onClick={() => meetsLevel && startBattle(pet)}
                disabled={!meetsLevel}
                style={{
                  background: meetsLevel
                    ? `linear-gradient(145deg, ${el.color}12, rgba(0,0,0,0.2))`
                    : "rgba(0,0,0,0.15)",
                  border: `1px solid ${meetsLevel ? el.color + "40" : "#1a1a22"}`,
                  borderRadius: 14, padding: "16px 18px", cursor: meetsLevel ? "pointer" : "not-allowed",
                  textAlign: "center", opacity: meetsLevel ? 1 : 0.35, fontFamily: "inherit",
                  transition: "all 0.3s ease", minWidth: 110,
                  boxShadow: meetsLevel ? `0 4px 20px ${el.color}10` : "none",
                  backdropFilter: "blur(8px)", position: "relative", overflow: "hidden",
                }}
              >
                {/* Stat comparison indicator */}
                {meetsLevel && pet.level >= selectedStage.level && (
                  <div style={{
                    position: "absolute", top: 4, right: 4,
                    fontSize: 8, padding: "1px 5px", borderRadius: 6,
                    background: "rgba(74,222,128,0.15)", color: "#4ade80",
                    fontFamily: "monospace", fontWeight: 700,
                  }}>OK</div>
                )}
                {meetsLevel && pet.level < selectedStage.level && (
                  <div style={{
                    position: "absolute", top: 4, right: 4,
                    fontSize: 8, padding: "1px 5px", borderRadius: 6,
                    background: "rgba(248,113,113,0.15)", color: "#f87171",
                    fontFamily: "monospace", fontWeight: 700,
                  }}>RISK</div>
                )}

                <div style={{ fontSize: 32, marginBottom: 6 }}>
                  {pet.avatar_url
                    ? <img src={pet.avatar_url} alt="" style={{
                        width: 40, height: 40, borderRadius: 10, objectFit: "cover",
                        border: `2px solid ${el.color}30`,
                      }} />
                    : PET_EMOJIS[pet.species] || "🐾"}
                </div>
                <div style={{
                  color: "#e8e8e8", fontSize: 13, fontWeight: 700,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>
                  {pet.name}
                </div>
                <div style={{
                  color: el.color, fontSize: 9, fontFamily: "monospace", fontWeight: 700, marginTop: 2,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                }}>
                  <Icon name={ELEMENT_ICONS[(pet.element as Element) || SPECIES_ELEMENTS[pet.species] || "normal"] || "normal"} size={12} /> Lv.{pet.level}
                </div>
                {/* Mini stat bar */}
                <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 6 }}>
                  <span style={{ fontSize: 7, color: "#555", fontFamily: "monospace" }}>
                    HP:{Math.floor((pet.level * 10 + pet.happiness) * getPersonalityMods(pet.personality_type).hp)}
                  </span>
                  <span style={{ fontSize: 7, color: "#555", fontFamily: "monospace" }}>
                    ATK:{Math.floor((10 + pet.level * 3) * getPersonalityMods(pet.personality_type).atk)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════
  // ── PRE-BATTLE (boss intro dialogue) ──
  // ══════════════════════════════════════
  if (phase === "pre_battle" && selectedStage) {
    const bossEl = ELEMENTS[selectedStage.element] || ELEMENTS.normal;
    const region = getRegionForStage(selectedStage.id);

    return (
      <div style={{
        position: "relative", overflow: "hidden", borderRadius: 18,
        animation: "pve-screenDarken 0.8s ease forwards",
      }}>
        <style>{GLOBAL_STYLES}</style>

        <div style={{
          background: `linear-gradient(180deg, #040410 0%, ${bossEl.color}08 40%, #0a0a1e 100%)`,
          padding: "50px 20px 40px", position: "relative",
        }}>
          {/* Ambient glow */}
          <div style={{
            position: "absolute", top: "30%", left: "50%", transform: "translate(-50%, -50%)",
            width: 200, height: 200, borderRadius: "50%",
            background: `radial-gradient(circle, ${bossEl.color}15 0%, transparent 70%)`,
            pointerEvents: "none",
          }} />

          {/* Boss entrance */}
          <div style={{
            textAlign: "center", position: "relative",
            animation: "pve-slideUp 1s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}>
            <div style={{
              fontSize: 80, marginBottom: 16,
              filter: `drop-shadow(0 0 30px ${bossEl.color}80)`,
              animation: "pve-bounce 3s ease infinite",
            }}>
              {selectedStage.emoji}
            </div>

            <div style={{
              color: "#fff", fontSize: 24, fontWeight: 800,
              fontFamily: "'Space Grotesk', sans-serif", letterSpacing: 2,
              textShadow: `0 0 30px ${bossEl.color}60`,
              animation: "pve-fadeIn 0.8s ease 0.3s both",
            }}>
              {selectedStage.name}
            </div>

            <div style={{
              color: region?.color || bossEl.color, fontSize: 13, fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: 3, textTransform: "uppercase", marginTop: 4,
              animation: "pve-fadeIn 0.8s ease 0.5s both",
            }}>
              {selectedStage.title}
            </div>

            {/* Element + Level */}
            <div style={{
              display: "flex", justifyContent: "center", gap: 8, marginTop: 12,
              animation: "pve-fadeIn 0.8s ease 0.7s both",
            }}>
              <span style={{
                fontSize: 11, padding: "4px 12px", borderRadius: 20,
                background: `${bossEl.color}15`, border: `1px solid ${bossEl.color}30`,
                color: bossEl.color, fontFamily: "monospace", fontWeight: 700,
              }}>
                <Icon name={ELEMENT_ICONS[selectedStage.element] || "normal"} size={14} /> {selectedStage.element.toUpperCase()}
              </span>
              <span style={{
                fontSize: 11, padding: "4px 12px", borderRadius: 20,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                color: "#aaa", fontFamily: "monospace", fontWeight: 700,
              }}>
                LV.{selectedStage.level}
              </span>
            </div>

            {/* Speech bubble with typewriter */}
            <div style={{
              marginTop: 24, position: "relative",
              maxWidth: 360, margin: "24px auto 0",
              animation: "pve-fadeIn 1s ease 0.9s both",
            }}>
              <div style={{
                width: 0, height: 0, margin: "0 auto",
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderBottom: `8px solid ${bossEl.color}15`,
              }} />
              <div style={{
                background: `linear-gradient(135deg, ${bossEl.color}10, rgba(255,255,255,0.03))`,
                border: `1px solid ${bossEl.color}20`,
                borderRadius: 14, padding: "14px 20px", backdropFilter: "blur(8px)",
              }}>
                <div style={{
                  color: "#c0c0c0", fontSize: 13, fontStyle: "italic",
                  lineHeight: 1.7, minHeight: 24,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>
                  &ldquo;{typewriterText}&rdquo;
                  <span style={{
                    display: "inline-block", width: 2, height: 14, background: bossEl.color,
                    marginLeft: 2, verticalAlign: "middle",
                    animation: "pve-pulse 0.8s ease infinite",
                    opacity: preBattleReady ? 0 : 1,
                  }} />
                </div>
              </div>
            </div>

            {/* BATTLE START button */}
            <button
              onClick={() => setPhase("battle")}
              disabled={!preBattleReady}
              style={{
                marginTop: 28, padding: "14px 44px", borderRadius: 14,
                background: preBattleReady
                  ? `linear-gradient(135deg, ${bossEl.color}30, ${bossEl.color}15)`
                  : "rgba(255,255,255,0.03)",
                border: `2px solid ${preBattleReady ? bossEl.color + "60" : "rgba(255,255,255,0.05)"}`,
                color: preBattleReady ? "#fff" : "#333",
                fontSize: 16, fontWeight: 800, cursor: preBattleReady ? "pointer" : "not-allowed",
                fontFamily: "'Space Grotesk', sans-serif",
                letterSpacing: 4, textTransform: "uppercase",
                transition: "all 0.3s ease",
                animation: preBattleReady ? "pve-battlePulse 2s ease infinite" : "none",
                boxShadow: preBattleReady ? `0 0 30px ${bossEl.color}30` : "none",
                textShadow: preBattleReady ? `0 0 10px ${bossEl.color}60` : "none",
              }}
            >
              <Icon name="sword" size={18} /> BATTLE START
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════
  // ── BATTLE + RESULT ──
  // ══════════════════════════════════════
  if ((phase === "battle" || phase === "result") && player && enemy && selectedStage) {
    const region = getRegionForStage(selectedStage.id);
    const bossEl = ELEMENTS[selectedStage.element] || ELEMENTS.normal;
    const playerEl = ELEMENTS[player.element] || ELEMENTS.normal;
    const pHpRatio = Math.max(0, player.hp / player.maxHp);
    const eHpRatio = Math.max(0, enemy.hp / enemy.maxHp);

    const hpGradient = (ratio: number) => {
      if (ratio > 0.5) return "linear-gradient(90deg, #22c55e, #4ade80)";
      if (ratio > 0.25) return "linear-gradient(90deg, #eab308, #facc15)";
      return "linear-gradient(90deg, #dc2626, #f87171)";
    };

    // Collect active buffs/debuffs for display
    const playerBuffIcons: React.ReactNode[] = [];
    if (buffs.def_up.stacks > 0) playerBuffIcons.push(<Icon key="def" name="shield" size={12} />);
    if (buffs.sp_atk_up.stacks > 0) playerBuffIcons.push(<Icon key="atk" name="sword" size={12} />);
    if (playerDodging) playerBuffIcons.push(<span key="dodge">💨</span>);
    if (buffs.water_boost) playerBuffIcons.push(<Icon key="water" name="water" size={12} />);

    const enemyDebuffIcons: React.ReactNode[] = [];
    if (buffs.burn) enemyDebuffIcons.push(<Icon key="burn" name="fire" size={12} />);
    if (buffs.paralyze) enemyDebuffIcons.push(<Icon key="para" name="electric" size={12} />);
    if (buffs.drain) enemyDebuffIcons.push(<Icon key="drain" name="grass" size={12} />);
    if (enemyDodging) enemyDebuffIcons.push(<span key="dodge">💨</span>);

    return (
      <div style={{
        padding: "0 4px",
        animation: screenShake ? "pve-shake 0.4s ease" : "none",
      }}>
        <style>{GLOBAL_STYLES}</style>

        <div style={{
          background: `linear-gradient(180deg, #060614 0%, ${region?.color || "#111"}08 30%, #0a0a18 60%, #060614 100%)`,
          backgroundSize: "200% 200%",
          animation: "pve-bgFlow 12s ease infinite",
          borderRadius: 18, overflow: "hidden",
          border: `1px solid ${region?.color || "#333"}15`,
          position: "relative",
          boxShadow: `inset 0 0 60px rgba(0,0,0,0.5), 0 0 20px ${region?.color || "#333"}08`,
        }}>
          {/* Floating damage numbers */}
          {floatingDmgs.map(d => (
            <div key={d.id} style={{
              position: "absolute", left: d.x, top: "30%",
              transform: "translateX(-50%)", zIndex: 100, pointerEvents: "none",
              animation: d.isCrit ? "pve-fadeUpCrit 1.2s ease forwards" : "pve-fadeUp 1s ease forwards",
            }}>
              <span style={{
                fontFamily: "'Space Grotesk', monospace",
                fontSize: d.isCrit ? 28 : 20, fontWeight: 900, color: d.color,
                textShadow: `0 0 10px ${d.color}, 0 2px 4px rgba(0,0,0,0.8)`,
                letterSpacing: d.isCrit ? 2 : 0,
              }}>
                {d.text}
              </span>
            </div>
          ))}

          {/* Super Effective popup */}
          {superEffText && (
            <div style={{
              position: "absolute", top: "25%", left: "50%",
              transform: "translateX(-50%)", zIndex: 101, pointerEvents: "none",
              animation: "pve-superEffective 1.5s ease forwards",
            }}>
              <span style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 14, fontWeight: 900,
                color: superEffText.includes("SUPER") ? "#f87171" : "#888",
                textShadow: superEffText.includes("SUPER")
                  ? "0 0 15px rgba(248,113,113,0.8), 0 0 30px rgba(248,113,113,0.4)"
                  : "none",
                letterSpacing: 2, textTransform: "uppercase",
                padding: "4px 14px", borderRadius: 8,
                background: superEffText.includes("SUPER")
                  ? "rgba(248,113,113,0.15)"
                  : "rgba(255,255,255,0.05)",
                border: superEffText.includes("SUPER")
                  ? "1px solid rgba(248,113,113,0.3)"
                  : "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(4px)",
              }}>
                {superEffText}
              </span>
            </div>
          )}

          {/* ── 3D BATTLE SCENE ── */}
          <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", minHeight: 200, maxHeight: 320 }}>
            <Suspense fallback={
              <div style={{
                width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(180deg, #0a0a18, #060614)", borderRadius: 14, color: "#444", fontSize: 11,
                fontFamily: "'Space Grotesk', sans-serif",
              }}>Loading Battle Arena...</div>
            }>
              <BattleScene3D
                player={{ ...player, avatar_url: playerSpriteUrl || player.avatar_url }}
                enemy={{ ...enemy, avatar_url: enemySpriteUrl || undefined }}
                regionId={region?.id}
                playerAttacking={anim3d.playerAttacking || playerAttacking}
                enemyAttacking={anim3d.enemyAttacking || enemyAttacking}
                playerHit={anim3d.playerHit || playerHit}
                enemyHit={anim3d.enemyHit || enemyHit}
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
                name: player.name, level: player.level, element: player.element,
                hp: player.hp, maxHp: player.maxHp, energy: player.energy, maxEnergy: player.maxEnergy,
                avatarUrl: player.avatar_url,
              }}
              enemy={{
                name: enemy.name, level: enemy.level, element: enemy.element,
                hp: enemy.hp, maxHp: enemy.maxHp, energy: enemy.energy, maxEnergy: enemy.maxEnergy,
                isBoss: selectedStage.isBoss,
              }}
              playerBuffs={{
                defUp: buffs.def_up.stacks > 0,
                spAtkUp: buffs.sp_atk_up.stacks > 0,
                dodging: playerDodging,
                waterBoost: buffs.water_boost,
              }}
              enemyBuffs={{
                burn: buffs.burn,
                paralyze: buffs.paralyze,
                drain: buffs.drain,
                dodging: enemyDodging,
              }}
            />

            {/* Floating damage numbers (DOM overlay) */}
            {floatingDmgs.map(d => (
              <div key={d.id} style={{
                position: "absolute", left: d.x, top: "30%",
                transform: "translateX(-50%)", zIndex: 100, pointerEvents: "none",
                animation: d.isCrit ? "pve-fadeUpCrit 1.2s ease forwards" : "pve-fadeUp 1s ease forwards",
              }}>
                <span style={{
                  fontFamily: "'Space Grotesk', monospace",
                  fontSize: d.isCrit ? 28 : 20, fontWeight: 900, color: d.color,
                  textShadow: `0 0 10px ${d.color}, 0 2px 4px rgba(0,0,0,0.8)`,
                  letterSpacing: d.isCrit ? 2 : 0,
                }}>
                  {d.text}
                </span>
              </div>
            ))}

            {/* Super Effective popup */}
            {superEffText && (
              <div style={{
                position: "absolute", top: "25%", left: "50%",
                transform: "translateX(-50%)", zIndex: 101, pointerEvents: "none",
                animation: "pve-superEffective 1.5s ease forwards",
              }}>
                <span style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 14, fontWeight: 900,
                  color: superEffText.includes("SUPER") ? "#f87171" : "#888",
                  textShadow: superEffText.includes("SUPER")
                    ? "0 0 15px rgba(248,113,113,0.8), 0 0 30px rgba(248,113,113,0.4)"
                    : "none",
                  letterSpacing: 2, textTransform: "uppercase",
                  padding: "4px 14px", borderRadius: 8,
                  background: superEffText.includes("SUPER")
                    ? "rgba(248,113,113,0.15)"
                    : "rgba(255,255,255,0.05)",
                  border: superEffText.includes("SUPER")
                    ? "1px solid rgba(248,113,113,0.3)"
                    : "1px solid rgba(255,255,255,0.1)",
                  backdropFilter: "blur(4px)",
                }}>
                  {superEffText}
                </span>
              </div>
            )}
          </div>

          {/* ── Battle Log ── */}
          <div ref={logRef} style={{
            background: "rgba(0,0,0,0.6)", margin: "0 12px", borderRadius: 10,
            padding: "10px 14px", maxHeight: 90, overflowY: "auto",
            backdropFilter: "blur(4px)",
            border: "1px solid rgba(255,255,255,0.04)",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.4)",
          }}>
            {battleLog.map((msg, i) => (
              <div key={i} style={{
                fontFamily: "monospace", fontSize: 10,
                color: i === battleLog.length - 1 ? "#d0d0d0" : "#444",
                lineHeight: 1.6,
                animation: i === battleLog.length - 1 ? "pve-fadeIn 0.3s ease" : "none",
              }}>
                <span style={{ color: "#333", fontSize: 8, marginRight: 6 }}>
                  {i === 0 ? ">" : `T${Math.ceil(i / 2)}`}
                </span>
                {msg}
              </div>
            ))}
          </div>

          {/* ── Skill Buttons (RPG card style) ── */}
          {phase === "battle" && !battleOver && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
              padding: "14px 12px 10px",
            }}>
              {player.skills.slice(0, 4).map((eq) => {
                const s = eq.def;
                const el = ELEMENTS[s.element] || ELEMENTS.normal;
                const cantAfford = s.energyCost > player.energy;
                const dis = !isPlayerTurn || animating || cantAfford;
                return (
                  <button key={eq.key} onClick={() => useSkill(eq)} disabled={dis} style={{
                    padding: "10px 4px 8px", borderRadius: 12, textAlign: "center",
                    background: dis
                      ? "rgba(255,255,255,0.02)"
                      : `linear-gradient(180deg, ${el.color}15 0%, ${el.color}08 100%)`,
                    border: `1px solid ${dis ? "rgba(255,255,255,0.04)" : el.color + "35"}`,
                    cursor: dis ? "not-allowed" : "pointer",
                    opacity: dis ? 0.35 : 1,
                    fontFamily: "inherit",
                    transition: "all 0.25s ease",
                    position: "relative", overflow: "hidden",
                    boxShadow: !dis ? `0 2px 12px ${el.color}10` : "none",
                    backdropFilter: "blur(4px)",
                  }}>
                    {/* Element color strip at top */}
                    <div style={{
                      position: "absolute", top: 0, left: 0, right: 0, height: 2,
                      background: el.color, opacity: dis ? 0.1 : 0.5,
                    }} />

                    <div style={{ fontSize: 18, marginBottom: 3 }}>{s.emoji}</div>
                    <div style={{
                      fontSize: 9, fontWeight: 800, color: dis ? "#444" : "#e8e8e8",
                      fontFamily: "'Space Grotesk', sans-serif",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>{s.name}</div>

                    <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 3 }}>
                      <span style={{
                        fontSize: 7, padding: "1px 4px", borderRadius: 4,
                        background: `${el.color}15`, color: el.color,
                        fontFamily: "monospace", fontWeight: 700,
                      }}><Icon name={ELEMENT_ICONS[s.element] || "normal"} size={8} /></span>
                      <span style={{ fontSize: 7, color: "#666", fontFamily: "monospace" }}>
                        {s.power > 0 ? `PWR ${s.power}` : "STATUS"}
                      </span>
                    </div>

                    <div style={{
                      fontSize: 7, color: cantAfford ? "#f87171" : "#555",
                      fontFamily: "monospace", fontWeight: 700, marginTop: 2,
                    }}>EP:{s.energyCost}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Turn indicator ── */}
          {phase === "battle" && !battleOver && (
            <div style={{ textAlign: "center", padding: "2px 0 14px" }}>
              <span style={{
                fontFamily: "'Space Grotesk', monospace",
                fontSize: 10, fontWeight: 800, padding: "4px 16px", borderRadius: 20,
                letterSpacing: 2,
                background: isPlayerTurn
                  ? "linear-gradient(135deg, rgba(74,222,128,0.12), rgba(74,222,128,0.05))"
                  : "linear-gradient(135deg, rgba(248,113,113,0.12), rgba(248,113,113,0.05))",
                color: isPlayerTurn ? "#4ade80" : "#f87171",
                border: `1px solid ${isPlayerTurn ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
                boxShadow: isPlayerTurn
                  ? "0 0 12px rgba(74,222,128,0.1)"
                  : "0 0 12px rgba(248,113,113,0.1)",
                textTransform: "uppercase",
              }}>
                {isPlayerTurn ? <><Icon name="sword" size={12} /> YOUR TURN</> : <><Icon name="fire" size={12} /> ENEMY TURN</>} — T{turn}
              </span>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════ */}
        {/* ── Result overlay ── */}
        {/* ══════════════════════════════════════ */}
        {phase === "result" && (
          <div style={{
            marginTop: 14, borderRadius: 18, overflow: "hidden",
            position: "relative", animation: "pve-fadeIn 0.6s ease",
          }}>
            <div style={{
              background: won
                ? "linear-gradient(180deg, rgba(74,222,128,0.06) 0%, #0a0a14 40%, #0a0a14 100%)"
                : "linear-gradient(180deg, rgba(248,113,113,0.06) 0%, #0a0a14 40%, #0a0a14 100%)",
              border: `1px solid ${won ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)"}`,
              borderRadius: 18, padding: "30px 20px 24px", textAlign: "center",
              backdropFilter: "blur(12px)",
              animation: !won ? "pve-defeatDim 1s ease" : "none",
            }}>
              {/* Victory burst / defeat icon */}
              <div style={{
                fontSize: 60, marginBottom: 12,
                animation: won ? "pve-victoryBurst 0.8s cubic-bezier(0.16,1,0.3,1)" : "pve-fadeIn 1s ease",
                filter: won ? "drop-shadow(0 0 20px rgba(234,179,8,0.5))" : "drop-shadow(0 0 10px rgba(248,113,113,0.3))",
              }}>
                {won ? <Icon name="trophy" size={60} /> : <Icon name="skull" size={60} />}
              </div>

              <div style={{
                color: won ? "#4ade80" : "#f87171",
                fontSize: 26, fontWeight: 900,
                fontFamily: "'Space Grotesk', sans-serif",
                letterSpacing: 4, marginBottom: 8,
                textShadow: won
                  ? "0 0 30px rgba(74,222,128,0.4)"
                  : "0 0 30px rgba(248,113,113,0.4)",
                animation: "pve-fadeIn 0.5s ease 0.3s both",
              }}>
                {won ? "VICTORY!" : "DEFEATED"}
              </div>

              {/* Stars - animated one by one */}
              {won && (
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{
                      animation: i <= starsRevealed ? "pve-starFill 0.6s cubic-bezier(0.16,1,0.3,1) forwards" : "none",
                      opacity: i <= starsRevealed ? 1 : 0.15,
                      transform: i <= starsRevealed ? "none" : "scale(0.5)",
                      transition: "opacity 0.3s",
                      filter: i <= stars
                        ? "drop-shadow(0 0 8px rgba(250,204,21,0.6))"
                        : "grayscale(1) brightness(0.3)",
                    }}>
                      <Icon name="star" size={32} />
                    </div>
                  ))}
                </div>
              )}

              {/* Boss dialogue */}
              <div style={{
                maxWidth: 340, margin: "0 auto 20px",
                padding: "10px 16px", borderRadius: 12,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
                animation: "pve-fadeIn 0.5s ease 0.5s both",
              }}>
                <div style={{
                  color: "#777", fontSize: 12, fontStyle: "italic",
                  lineHeight: 1.6, fontFamily: "'Space Grotesk', sans-serif",
                }}>
                  &ldquo;{won ? selectedStage.dialogue.win : selectedStage.dialogue.lose}&rdquo;
                </div>
              </div>

              {/* Rewards - item by item reveal */}
              {resultData && (
                <div style={{
                  display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 16,
                }}>
                  {resultData.exp_gained > 0 && (
                    <div style={{
                      animation: "pve-rewardSlide 0.4s ease 0.8s both",
                      padding: "6px 14px", borderRadius: 10,
                      background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)",
                    }}>
                      <span style={{ fontFamily: "monospace", fontSize: 13, color: "#a78bfa", fontWeight: 800 }}>
                        +{resultData.exp_gained} EXP
                      </span>
                    </div>
                  )}
                  {resultData.credits_gained > 0 && (
                    <div style={{
                      animation: "pve-rewardSlide 0.4s ease 1s both",
                      padding: "6px 14px", borderRadius: 10,
                      background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
                    }}>
                      <span style={{ fontFamily: "monospace", fontSize: 13, color: "#f59e0b", fontWeight: 800 }}>
                        +{resultData.credits_gained} <Icon name="coin" size={14} />
                      </span>
                    </div>
                  )}
                  {resultData.airdrop_gained > 0 && (
                    <div style={{
                      animation: "pve-rewardSlide 0.4s ease 1.2s both",
                      padding: "6px 14px", borderRadius: 10,
                      background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)",
                    }}>
                      <span style={{ fontFamily: "monospace", fontSize: 13, color: "#4ade80", fontWeight: 800 }}>
                        +{resultData.airdrop_gained} PTS
                      </span>
                    </div>
                  )}
                  {resultData.leveled_up && (
                    <div style={{
                      animation: "pve-rewardSlide 0.4s ease 1.4s both",
                      padding: "6px 14px", borderRadius: 10,
                      background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)",
                    }}>
                      <span style={{ fontFamily: "monospace", fontSize: 13, color: "#facc15", fontWeight: 800 }}>
                        LEVEL UP! Lv.{resultData.new_level}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* EXP bar animation */}
              {resultData?.exp_gained > 0 && (
                <div style={{
                  maxWidth: 200, margin: "0 auto 16px",
                  animation: "pve-fadeIn 0.5s ease 1.5s both",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 8, color: "#555" }}>EXP</span>
                    <span style={{ fontFamily: "monospace", fontSize: 8, color: "#a78bfa" }}>+{resultData.exp_gained}</span>
                  </div>
                  <div style={{
                    width: "100%", height: 6, borderRadius: 3, overflow: "hidden",
                    background: "rgba(255,255,255,0.06)",
                  }}>
                    <div style={{
                      height: "100%", borderRadius: 3,
                      background: "linear-gradient(90deg, #6366f1, #a78bfa, #c4b5fd)",
                      animation: "pve-expFill 1.5s cubic-bezier(0.4,0,0.2,1) 1.8s both",
                      width: "100%",
                    }} />
                  </div>
                </div>
              )}

              {/* Skill drop - treasure chest animation */}
              {resultData?.skill_drop && (
                <div style={{
                  animation: "pve-chestOpen 0.8s cubic-bezier(0.16,1,0.3,1) 2s both",
                  marginBottom: 20,
                }}>
                  <div style={{
                    display: "inline-block",
                    background: "linear-gradient(135deg, rgba(167,139,250,0.15), rgba(167,139,250,0.05))",
                    border: "1px solid rgba(167,139,250,0.3)",
                    borderRadius: 16, padding: "16px 24px",
                    boxShadow: "0 0 30px rgba(167,139,250,0.15)",
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.1) 0%, transparent 70%)",
                      pointerEvents: "none",
                    }} />
                    <div style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontSize: 10, fontWeight: 800, color: "#a78bfa",
                      letterSpacing: 3, textTransform: "uppercase", marginBottom: 6,
                    }}>NEW SKILL ACQUIRED!</div>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>
                      {SKILL_MAP[resultData.skill_drop]?.emoji || <Icon name="sparkling" size={28} />}
                    </div>
                    <div style={{
                      color: "#fff", fontSize: 14, fontWeight: 800,
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}>
                      {SKILL_MAP[resultData.skill_drop]?.name || resultData.skill_drop}
                    </div>
                    {SKILL_MAP[resultData.skill_drop] && (
                      <div style={{ fontSize: 9, color: "#888", fontFamily: "monospace", marginTop: 4 }}>
                        <Icon name={ELEMENT_ICONS[SKILL_MAP[resultData.skill_drop].element] || "normal"} size={10} />{" "}
                        PWR {SKILL_MAP[resultData.skill_drop].power || "STATUS"}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{
                display: "flex", gap: 10, justifyContent: "center",
                animation: "pve-fadeIn 0.5s ease 2.2s both",
              }}>
                {won && currentStage < 30 && (
                  <button onClick={() => { selectStage(selectedStage.id + 1); }} style={{
                    background: "linear-gradient(135deg, rgba(74,222,128,0.15), rgba(74,222,128,0.06))",
                    border: "1px solid rgba(74,222,128,0.3)",
                    borderRadius: 12, padding: "12px 24px", color: "#4ade80",
                    fontSize: 13, fontWeight: 800, cursor: "pointer",
                    fontFamily: "'Space Grotesk', sans-serif",
                    letterSpacing: 1, transition: "all 0.3s",
                    boxShadow: "0 4px 20px rgba(74,222,128,0.1)",
                  }}>Next Stage →</button>
                )}
                <button onClick={() => startBattle(selectedPet!)} style={{
                  background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.06))",
                  border: "1px solid rgba(245,158,11,0.3)",
                  borderRadius: 12, padding: "12px 24px", color: "#f59e0b",
                  fontSize: 13, fontWeight: 800, cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: 1, transition: "all 0.3s",
                }}>Retry</button>
                <button onClick={backToMap} style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12, padding: "12px 24px", color: "#666",
                  fontSize: 13, fontWeight: 800, cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: 1, transition: "all 0.3s", backdropFilter: "blur(4px)",
                }}>Map</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

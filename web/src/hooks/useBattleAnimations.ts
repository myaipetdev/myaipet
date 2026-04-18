"use client";

import { useRef, useCallback, useState } from "react";
import type { Element } from "@/lib/skills";

export interface BattleAction {
  type: "player_attack" | "enemy_attack";
  element: Element;
  starLevel: number;
  damage: number;
  isCrit: boolean;
  isSuperEffective: boolean;
  isNotEffective: boolean;
}

export interface AnimState {
  playerAttacking: boolean;
  enemyAttacking: boolean;
  playerHit: boolean;
  enemyHit: boolean;
  screenShake: boolean;
  cutsceneActive: boolean;
  currentElement: Element;
  currentStarLevel: number;
  isCrit: boolean;
  isSuperEffective: boolean;
  damagePopups: DamagePopup[];
}

export interface DamagePopup {
  id: number;
  text: string;
  color: string;
  isCrit: boolean;
  position: [number, number, number];
}

const PLAYER_DMG_POS: [number, number, number] = [-3, 2, 2];
const ENEMY_DMG_POS: [number, number, number] = [3, 2, -2];

let popupIdCounter = 0;

export function useBattleAnimations() {
  const [animState, setAnimState] = useState<AnimState>({
    playerAttacking: false,
    enemyAttacking: false,
    playerHit: false,
    enemyHit: false,
    screenShake: false,
    cutsceneActive: false,
    currentElement: "normal",
    currentStarLevel: 1,
    isCrit: false,
    isSuperEffective: false,
    damagePopups: [],
  });

  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animatingRef = useRef(false);

  const clearTimers = useCallback(() => {
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, delayMs: number) => {
    const t = setTimeout(fn, delayMs);
    timerRef.current.push(t);
    return t;
  }, []);

  const addDamagePopup = useCallback((
    damage: number, isCrit: boolean, isSuperEffective: boolean, isNotEffective: boolean,
    position: [number, number, number]
  ) => {
    const popup: DamagePopup = {
      id: ++popupIdCounter,
      text: `-${damage}`,
      color: isCrit ? "#fde047" : isSuperEffective ? "#f87171" : isNotEffective ? "#888888" : "#ffffff",
      isCrit,
      position: [...position],
    };
    setAnimState(prev => ({ ...prev, damagePopups: [...prev.damagePopups, popup] }));

    // Remove after 1.5s
    schedule(() => {
      setAnimState(prev => ({
        ...prev,
        damagePopups: prev.damagePopups.filter(p => p.id !== popup.id),
      }));
    }, 1500);
  }, [schedule]);

  const playAction = useCallback((action: BattleAction, onComplete?: () => void) => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    clearTimers();

    const isPlayer = action.type === "player_attack";
    const hasCutscene = action.starLevel >= 4;
    const targetPos = isPlayer ? ENEMY_DMG_POS : PLAYER_DMG_POS;

    // Set element info
    setAnimState(prev => ({
      ...prev,
      currentElement: action.element,
      currentStarLevel: action.starLevel,
      isCrit: action.isCrit,
      isSuperEffective: action.isSuperEffective,
    }));

    let offset = 0;

    // Phase 0: Cutscene (if star 4-5)
    if (hasCutscene) {
      setAnimState(prev => ({ ...prev, cutsceneActive: true }));
      offset = action.starLevel >= 5 ? 2500 : 1800;
      schedule(() => {
        setAnimState(prev => ({ ...prev, cutsceneActive: false }));
      }, offset);
    }

    // Phase 1: Attacker lunge
    schedule(() => {
      setAnimState(prev => ({
        ...prev,
        playerAttacking: isPlayer,
        enemyAttacking: !isPlayer,
      }));
    }, offset);

    // Phase 2: Impact + damage popup + screen shake
    schedule(() => {
      setAnimState(prev => ({
        ...prev,
        playerHit: !isPlayer,
        enemyHit: isPlayer,
        screenShake: true,
      }));
      addDamagePopup(action.damage, action.isCrit, action.isSuperEffective, action.isNotEffective, targetPos);
    }, offset + 250);

    // Phase 3: Clear hit + shake
    schedule(() => {
      setAnimState(prev => ({
        ...prev,
        playerHit: false,
        enemyHit: false,
        screenShake: false,
      }));
    }, offset + 600);

    // Phase 4: Clear attack state
    schedule(() => {
      setAnimState(prev => ({
        ...prev,
        playerAttacking: false,
        enemyAttacking: false,
      }));
    }, offset + 500);

    // Phase 5: Complete
    schedule(() => {
      animatingRef.current = false;
      onComplete?.();
    }, offset + 800);
  }, [clearTimers, schedule, addDamagePopup]);

  const isAnimating = useCallback(() => animatingRef.current, []);

  const resetAnim = useCallback(() => {
    clearTimers();
    animatingRef.current = false;
    setAnimState({
      playerAttacking: false,
      enemyAttacking: false,
      playerHit: false,
      enemyHit: false,
      screenShake: false,
      cutsceneActive: false,
      currentElement: "normal",
      currentStarLevel: 1,
      isCrit: false,
      isSuperEffective: false,
      damagePopups: [],
    });
  }, [clearTimers]);

  return { animState, playAction, isAnimating, resetAnim };
}

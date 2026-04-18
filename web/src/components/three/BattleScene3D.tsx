"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import type { Element } from "@/lib/skills";
import BattleArena from "./BattleArena";
import BattlePet3D from "./BattlePet3D";
import BattleCamera from "./BattleCamera";
import BattleVFX3D from "./BattleVFX3D";
import DamageNumber3D from "./DamageNumber3D";
import SkillCutscene3D from "./SkillCutscene3D";
import type { DamagePopup } from "@/hooks/useBattleAnimations";

// Battle pet data (matches PveMode/Arena BattlePet interface)
interface BattlePetData {
  name: string;
  emoji: string;
  element: Element;
  hp: number;
  maxHp: number;
  avatar_url?: string;
  level: number;
}

export interface BattleScene3DProps {
  player: BattlePetData;
  enemy: BattlePetData;
  regionId?: number;
  // Animation state from useBattleAnimations
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
  battleOver: boolean;
  onCutsceneComplete?: () => void;
}

const PLAYER_POS: [number, number, number] = [-3, 0, 2];
const ENEMY_POS: [number, number, number] = [3, 0, -2];

function BattleSceneContent({
  player, enemy, regionId = 1,
  playerAttacking, enemyAttacking, playerHit, enemyHit,
  screenShake, cutsceneActive,
  currentElement, currentStarLevel, isCrit, isSuperEffective,
  damagePopups, battleOver, onCutsceneComplete,
}: BattleScene3DProps) {
  return (
    <>
      {/* Arena environment */}
      <BattleArena regionId={regionId} />

      {/* Camera controller */}
      <BattleCamera
        playerAttacking={playerAttacking}
        enemyAttacking={enemyAttacking}
        screenShake={screenShake}
        cutsceneActive={cutsceneActive}
        battleOver={battleOver}
      />

      {/* Player pet */}
      <BattlePet3D
        position={PLAYER_POS}
        element={player.element}
        avatarUrl={player.avatar_url}
        isPlayer
        hp={player.hp}
        maxHp={player.maxHp}
        isAttacking={playerAttacking}
        isHit={playerHit}
        isDead={player.hp <= 0}
        targetPosition={ENEMY_POS}
      />

      {/* Enemy pet */}
      <BattlePet3D
        position={ENEMY_POS}
        element={enemy.element}
        avatarUrl={enemy.avatar_url}
        isPlayer={false}
        hp={enemy.hp}
        maxHp={enemy.maxHp}
        isAttacking={enemyAttacking}
        isHit={enemyHit}
        isDead={enemy.hp <= 0}
        targetPosition={PLAYER_POS}
      />

      {/* VFX particles */}
      <BattleVFX3D
        playerAttacking={playerAttacking}
        enemyAttacking={enemyAttacking}
        playerHit={playerHit}
        enemyHit={enemyHit}
        skillElement={currentElement}
        skillStarLevel={currentStarLevel}
        isCrit={isCrit}
        isSuperEffective={isSuperEffective}
      />

      {/* Floating damage numbers */}
      <DamageNumber3D popups={damagePopups} />

      {/* Skill cutscene (star 4-5) */}
      <SkillCutscene3D
        active={cutsceneActive}
        skillName=""
        element={currentElement}
        starLevel={currentStarLevel}
        onComplete={onCutsceneComplete || (() => {})}
      />
    </>
  );
}

// Loading fallback for the 3D scene
function SceneLoader() {
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(180deg, #0a0a18 0%, #060614 100%)",
      borderRadius: 14,
      color: "#444", fontSize: 12, fontFamily: "'Space Grotesk', sans-serif",
    }}>
      Loading Battle Arena...
    </div>
  );
}

export default function BattleScene3D(props: BattleScene3DProps) {
  return (
    <Suspense fallback={<SceneLoader />}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          alpha: false,
        }}
        shadows
        camera={{ position: [0, 4.5, 7], fov: 50, near: 0.1, far: 50 }}
        style={{ borderRadius: 14, background: "#060614" }}
      >
        <BattleSceneContent {...props} />
      </Canvas>
    </Suspense>
  );
}

"use client";

import { useRef, useEffect, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useParticleSystem } from "./helpers/ParticleSystem";
import { getElementVFX, getImpactVFX, getCritVFX } from "@/lib/vfx3d";
import type { Element } from "@/lib/skills";

interface BattleVFX3DProps {
  // Trigger signals
  playerAttacking: boolean;
  enemyAttacking: boolean;
  playerHit: boolean;
  enemyHit: boolean;
  skillElement?: Element;
  skillStarLevel?: number;
  isCrit?: boolean;
  isSuperEffective?: boolean;
}

const PLAYER_POS = new THREE.Vector3(-3, 0.8, 2);
const ENEMY_POS = new THREE.Vector3(3, 0.8, -2);

export default function BattleVFX3D({
  playerAttacking,
  enemyAttacking,
  playerHit,
  enemyHit,
  skillElement = "normal",
  skillStarLevel = 1,
  isCrit = false,
  isSuperEffective = false,
}: BattleVFX3DProps) {
  const { meshRef, emit, update } = useParticleSystem(200);

  // Track previous state to detect rising edges
  const prev = useRef({
    playerAttacking: false,
    enemyAttacking: false,
    playerHit: false,
    enemyHit: false,
  });

  // Emit on state transitions (rising edge detection)
  useEffect(() => {
    // Player attacks → VFX at enemy position
    if (playerAttacking && !prev.current.playerAttacking) {
      const { count, config } = getElementVFX(skillElement, skillStarLevel);
      emit(count, ENEMY_POS, config);

      if (isCrit) {
        const crit = getCritVFX();
        emit(crit.count, ENEMY_POS, crit.config);
      }
    }

    // Enemy attacks → VFX at player position
    if (enemyAttacking && !prev.current.enemyAttacking) {
      const { count, config } = getElementVFX("normal", 2);
      emit(count, PLAYER_POS, config);
    }

    // Player hit → Impact at player
    if (playerHit && !prev.current.playerHit) {
      const impact = getImpactVFX();
      emit(impact.count, PLAYER_POS, impact.config);
    }

    // Enemy hit → Impact at enemy
    if (enemyHit && !prev.current.enemyHit) {
      const impact = getImpactVFX();
      emit(impact.count, ENEMY_POS, impact.config);

      if (isSuperEffective) {
        const extra = getElementVFX(skillElement, skillStarLevel + 2);
        emit(extra.count, ENEMY_POS, extra.config);
      }
    }

    prev.current = { playerAttacking, enemyAttacking, playerHit, enemyHit };
  }, [playerAttacking, enemyAttacking, playerHit, enemyHit, skillElement, skillStarLevel, isCrit, isSuperEffective, emit]);

  // Update particles each frame
  useFrame((_, dt) => {
    update(Math.min(dt, 0.05));
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 200]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 4]} />
      <meshStandardMaterial
        transparent
        opacity={0.85}
        emissive="#ffffff"
        emissiveIntensity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}

"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface BattleCameraProps {
  playerAttacking: boolean;
  enemyAttacking: boolean;
  screenShake: boolean;
  cutsceneActive: boolean;
  battleOver: boolean;
}

const DEFAULT_POS = new THREE.Vector3(0, 4.5, 7);
const DEFAULT_LOOK = new THREE.Vector3(0, 0.5, 0);

const PLAYER_ATTACK_POS = new THREE.Vector3(1, 3.5, 5);
const PLAYER_ATTACK_LOOK = new THREE.Vector3(2, 0.5, -1);

const ENEMY_ATTACK_POS = new THREE.Vector3(-1, 3.5, 5);
const ENEMY_ATTACK_LOOK = new THREE.Vector3(-2, 0.5, 1);

const VICTORY_POS = new THREE.Vector3(0, 6, 9);

export default function BattleCamera({
  playerAttacking,
  enemyAttacking,
  screenShake,
  cutsceneActive,
  battleOver,
}: BattleCameraProps) {
  const { camera } = useThree();
  const state = useRef({
    targetPos: DEFAULT_POS.clone(),
    targetLook: DEFAULT_LOOK.clone(),
    currentLook: DEFAULT_LOOK.clone(),
    shakeOffset: new THREE.Vector3(),
    cutsceneAngle: 0,
  });

  useFrame((_, dt) => {
    const s = state.current;
    const clampDt = Math.min(dt, 0.05);
    const lerpSpeed = 4;

    // Determine target based on state
    if (cutsceneActive) {
      s.cutsceneAngle += clampDt * 1.2;
      const radius = 8;
      s.targetPos.set(
        Math.cos(s.cutsceneAngle) * radius,
        4 + Math.sin(s.cutsceneAngle * 0.5) * 1,
        Math.sin(s.cutsceneAngle) * radius
      );
      s.targetLook.copy(DEFAULT_LOOK);
    } else if (battleOver) {
      s.targetPos.copy(VICTORY_POS);
      s.targetLook.copy(DEFAULT_LOOK);
    } else if (playerAttacking) {
      s.targetPos.copy(PLAYER_ATTACK_POS);
      s.targetLook.copy(PLAYER_ATTACK_LOOK);
    } else if (enemyAttacking) {
      s.targetPos.copy(ENEMY_ATTACK_POS);
      s.targetLook.copy(ENEMY_ATTACK_LOOK);
    } else {
      s.targetPos.copy(DEFAULT_POS);
      s.targetLook.copy(DEFAULT_LOOK);
      s.cutsceneAngle = 0;
    }

    // Lerp camera position
    camera.position.lerp(s.targetPos, clampDt * lerpSpeed);

    // Screen shake
    if (screenShake) {
      s.shakeOffset.set(
        (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1
      );
    } else {
      s.shakeOffset.lerp(new THREE.Vector3(), clampDt * 8);
    }
    camera.position.add(s.shakeOffset);

    // Smooth lookAt
    s.currentLook.lerp(s.targetLook, clampDt * lerpSpeed);
    camera.lookAt(s.currentLook);
  });

  return null;
}

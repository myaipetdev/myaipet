"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Element } from "@/lib/skills";
import { ELEMENT_COLORS } from "./helpers/ElementMaterials";
import ProceduralPet from "./helpers/ProceduralPet";

interface BattlePet3DProps {
  position: [number, number, number];
  element: Element;
  avatarUrl?: string;
  isPlayer: boolean;
  hp: number;
  maxHp: number;
  isAttacking: boolean;
  isHit: boolean;
  isDead: boolean;
  targetPosition?: [number, number, number];
}

export default function BattlePet3D({
  position,
  element,
  avatarUrl,
  isPlayer,
  hp,
  maxHp,
  isAttacking,
  isHit,
  isDead,
  targetPosition = [0, 0, 0],
}: BattlePet3DProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const basePos = useMemo(() => new THREE.Vector3(...position), [position]);
  const targetPos = useMemo(() => new THREE.Vector3(...targetPosition), [targetPosition]);

  // Animation state stored in refs for frame-by-frame updates
  const anim = useRef({
    attackPhase: 0,     // 0=idle, 1=lunge, 2=return
    attackTimer: 0,
    hitFlash: 0,
    idleTime: 0,
    currentPos: new THREE.Vector3(...position),
    faintAngle: 0,
  });

  const colors = ELEMENT_COLORS[element];

  // Element glow light
  const lightColor = useMemo(() => new THREE.Color(colors.primary), [colors]);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const a = anim.current;
    const clampDt = Math.min(dt, 0.05);
    a.idleTime += clampDt;

    // ── Attack animation ──
    if (isAttacking && a.attackPhase === 0) {
      a.attackPhase = 1;
      a.attackTimer = 0;
    }

    if (a.attackPhase === 1) {
      // Lunge toward target
      a.attackTimer += clampDt;
      const t = Math.min(a.attackTimer / 0.2, 1);
      a.currentPos.lerpVectors(basePos, targetPos, t * 0.6);
      if (t >= 1) {
        a.attackPhase = 2;
        a.attackTimer = 0;
      }
    } else if (a.attackPhase === 2) {
      // Return to base
      a.attackTimer += clampDt;
      const t = Math.min(a.attackTimer / 0.3, 1);
      const lungePos = basePos.clone().lerp(targetPos, 0.6);
      a.currentPos.lerpVectors(lungePos, basePos, t);
      if (t >= 1) {
        a.attackPhase = 0;
        a.currentPos.copy(basePos);
      }
    } else {
      a.currentPos.copy(basePos);
    }

    // ── Hit flash ──
    if (isHit) {
      a.hitFlash = 1.0;
    }
    if (a.hitFlash > 0) {
      a.hitFlash -= clampDt * 4;
      // Shake on hit
      const shakeX = a.hitFlash > 0 ? (Math.random() - 0.5) * 0.15 * a.hitFlash : 0;
      const shakeZ = a.hitFlash > 0 ? (Math.random() - 0.5) * 0.1 * a.hitFlash : 0;
      groupRef.current.position.set(
        a.currentPos.x + shakeX,
        a.currentPos.y,
        a.currentPos.z + shakeZ
      );
    } else {
      groupRef.current.position.copy(a.currentPos);
    }

    // ── Idle bob ──
    if (a.attackPhase === 0 && !isDead) {
      groupRef.current.position.y = basePos.y + Math.sin(a.idleTime * 2) * 0.08;
    }

    // ── Faint animation ──
    if (isDead) {
      a.faintAngle = Math.min(a.faintAngle + clampDt * 2, Math.PI / 4);
      groupRef.current.rotation.z = isPlayer ? -a.faintAngle : a.faintAngle;
      // Sink down
      groupRef.current.position.y = basePos.y - a.faintAngle * 0.5;
    } else {
      a.faintAngle = 0;
      if (a.attackPhase === 0) {
        groupRef.current.rotation.z = 0;
      }
    }

    // ── Scale pulse on hit ──
    const hitScale = a.hitFlash > 0 ? 1 + a.hitFlash * 0.15 : 1;
    groupRef.current.scale.setScalar(isDead ? Math.max(0.5, 1 - a.faintAngle * 0.5) : hitScale);
  });

  // Shadow disc
  const shadowOpacity = isDead ? 0.1 : 0.3;

  return (
    <group ref={groupRef} position={position}>
      {/* Pet model */}
      <group position={[0, 0.6, 0]}>
        <ProceduralPet element={element} avatarUrl={avatarUrl} scale={1.2} />
      </group>

      {/* Element point light */}
      <pointLight
        color={lightColor}
        intensity={isDead ? 0.2 : 1.5}
        distance={4}
        position={[0, 1, 0]}
      />

      {/* Shadow disc on ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[0.8, 16]} />
        <meshStandardMaterial
          color="#000000"
          transparent
          opacity={shadowOpacity}
          depthWrite={false}
        />
      </mesh>

      {/* HP indicator ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.85, 0.95, 32, 1, 0, Math.PI * 2 * Math.max(0, hp / maxHp)]} />
        <meshStandardMaterial
          color={hp / maxHp > 0.5 ? "#4ade80" : hp / maxHp > 0.25 ? "#facc15" : "#f87171"}
          emissive={hp / maxHp > 0.5 ? "#22c55e" : hp / maxHp > 0.25 ? "#eab308" : "#dc2626"}
          emissiveIntensity={0.8}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

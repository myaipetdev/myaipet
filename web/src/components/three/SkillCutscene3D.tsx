"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ELEMENT_COLORS } from "./helpers/ElementMaterials";
import type { Element } from "@/lib/skills";

interface SkillCutscene3DProps {
  active: boolean;
  skillName: string;
  element: Element;
  starLevel: number;
  onComplete: () => void;
}

export default function SkillCutscene3D({
  active,
  skillName,
  element,
  starLevel,
  onComplete,
}: SkillCutscene3DProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const flashRef = useRef<THREE.Mesh>(null!);
  const timer = useRef(0);
  const completed = useRef(false);

  const duration = starLevel >= 5 ? 2.5 : 1.8;
  const colors = ELEMENT_COLORS[element];

  useFrame((_, dt) => {
    if (!active) {
      timer.current = 0;
      completed.current = false;
      if (groupRef.current) groupRef.current.visible = false;
      return;
    }

    if (groupRef.current) groupRef.current.visible = true;
    timer.current += Math.min(dt, 0.05);
    const t = timer.current / duration;

    if (t >= 1 && !completed.current) {
      completed.current = true;
      onComplete();
      return;
    }

    // Expanding energy ring
    if (ringRef.current) {
      const ringScale = t < 0.3 ? t / 0.3 * 6 : 6 + (t - 0.3) * 3;
      ringRef.current.scale.set(ringScale, ringScale, ringScale);
      const ringMat = ringRef.current.material as THREE.MeshStandardMaterial;
      ringMat.opacity = t < 0.7 ? 0.6 : 0.6 * (1 - (t - 0.7) / 0.3);
    }

    // Flash plane
    if (flashRef.current) {
      const flashMat = flashRef.current.material as THREE.MeshStandardMaterial;
      if (t < 0.15) {
        flashMat.opacity = t / 0.15 * 0.8;
      } else if (t < 0.4) {
        flashMat.opacity = 0.8;
      } else {
        flashMat.opacity = 0.8 * (1 - (t - 0.4) / 0.6);
      }
    }
  });

  if (!active) return null;

  return (
    <group ref={groupRef}>
      {/* Energy ring expanding from center */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[0.8, 1.0, 32]} />
        <meshStandardMaterial
          color={colors.primary}
          emissive={colors.emissive}
          emissiveIntensity={3}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Screen flash plane (in front of camera) */}
      <mesh ref={flashRef} position={[0, 2, 4]}>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial
          color={colors.primary}
          emissive={colors.emissive}
          emissiveIntensity={2}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Vertical light pillars */}
      {starLevel >= 5 && (
        <>
          <mesh position={[-3, 3, 2]}>
            <cylinderGeometry args={[0.1, 0.3, 8, 8]} />
            <meshStandardMaterial
              color={colors.primary}
              emissive={colors.emissive}
              emissiveIntensity={4}
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <mesh position={[3, 3, -2]}>
            <cylinderGeometry args={[0.1, 0.3, 8, 8]} />
            <meshStandardMaterial
              color={colors.primary}
              emissive={colors.emissive}
              emissiveIntensity={4}
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </>
      )}

      {/* Intense point light during cutscene */}
      <pointLight
        color={colors.primary}
        intensity={8}
        distance={15}
        position={[0, 3, 0]}
      />
    </group>
  );
}

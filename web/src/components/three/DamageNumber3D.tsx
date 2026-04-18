"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Billboard } from "@react-three/drei";
import * as THREE from "three";

interface DamagePopup {
  id: number;
  text: string;
  color: string;
  isCrit: boolean;
  position: [number, number, number];
}

interface DamageNumber3DProps {
  popups: DamagePopup[];
}

function FloatingNumber({ text, color, isCrit, position }: Omit<DamagePopup, "id">) {
  const groupRef = useRef<THREE.Group>(null!);
  const life = useRef(1.0);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const clampDt = Math.min(dt, 0.05);

    // Float upward
    groupRef.current.position.y += clampDt * 2.0;

    // Fade out
    life.current -= clampDt * 0.8;

    // Scale pulse on spawn
    const t = 1 - life.current;
    const scale = t < 0.1 ? 1 + (0.1 - t) * 8 : 1; // Pop in effect
    groupRef.current.scale.setScalar(isCrit ? scale * 1.4 : scale);
  });

  return (
    <group ref={groupRef} position={position}>
      <Billboard>
        <Text
          fontSize={isCrit ? 0.6 : 0.4}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#000000"
          font={undefined}
        >
          {text}
        </Text>
        {isCrit && (
          <Text
            fontSize={0.2}
            color="#fde047"
            anchorX="center"
            anchorY="middle"
            position={[0, -0.4, 0]}
            outlineWidth={0.03}
            outlineColor="#000000"
          >
            CRITICAL!
          </Text>
        )}
      </Billboard>
    </group>
  );
}

export default function DamageNumber3D({ popups }: DamageNumber3DProps) {
  return (
    <group>
      {popups.map(p => (
        <FloatingNumber
          key={p.id}
          text={p.text}
          color={p.color}
          isCrit={p.isCrit}
          position={p.position}
        />
      ))}
    </group>
  );
}

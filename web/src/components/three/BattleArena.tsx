"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getPreset } from "./EnvironmentPresets";

interface BattleArenaProps {
  regionId?: number;
}

// Animated ground shader for element-specific effects
function AnimatedGround({ color, regionId }: { color: string; regionId: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);

  // Subtle vertex animation for water/lava regions
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.elapsedTime;

    if (regionId === 3) {
      // Ocean - gentle wave motion
      meshRef.current.position.y = Math.sin(t * 0.8) * 0.03 - 0.01;
    } else if (regionId === 2 || regionId === 6) {
      // Volcano/Dragon - subtle pulsing emissive
      if (matRef.current) {
        matRef.current.emissiveIntensity = 0.15 + Math.sin(t * 2) * 0.1;
      }
    }
  });

  const emissiveColor = regionId === 2 ? "#ff2200" : regionId === 6 ? "#ff6600" : regionId === 3 ? "#004488" : "#000000";

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[24, 16, 32, 32]} />
      <meshStandardMaterial
        ref={matRef}
        color={color}
        emissive={emissiveColor}
        emissiveIntensity={0.15}
        roughness={0.9}
        metalness={0}
      />
    </mesh>
  );
}

// Floating ambient particles (fireflies, embers, etc.)
function AmbientParticles({ regionId }: { regionId: number }) {
  const preset = getPreset(regionId);
  const count = 30;
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  const positions = useMemo(() => {
    const arr: { x: number; y: number; z: number; speed: number; offset: number }[] = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        x: (Math.random() - 0.5) * 16,
        y: 0.5 + Math.random() * 4,
        z: (Math.random() - 0.5) * 10,
        speed: 0.2 + Math.random() * 0.5,
        offset: Math.random() * Math.PI * 2,
      });
    }
    return arr;
  }, []);

  const particleColor = useMemo(() => {
    switch (preset.particleHint) {
      case "embers": return new THREE.Color("#ff6633");
      case "rain": return new THREE.Color("#88ccff");
      case "lightning": return new THREE.Color("#aa88ff");
      default: return new THREE.Color("#aaffaa");
    }
  }, [preset.particleHint]);

  const _obj = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      const p = positions[i];
      _obj.position.set(
        p.x + Math.sin(t * p.speed + p.offset) * 0.5,
        p.y + Math.sin(t * p.speed * 1.3 + p.offset) * 0.3,
        p.z + Math.cos(t * p.speed * 0.7 + p.offset) * 0.4
      );
      const s = 0.02 + Math.sin(t * 2 + p.offset) * 0.01;
      _obj.scale.set(s, s, s);
      _obj.updateMatrix();
      meshRef.current.setMatrixAt(i, _obj.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!preset.particleHint) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshStandardMaterial
        color={particleColor}
        emissive={particleColor}
        emissiveIntensity={2}
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

// Decorative side pillars/rocks
function ArenaDecorations({ regionId }: { regionId: number }) {
  const pillarColor = regionId <= 2 ? "#555544" : regionId <= 4 ? "#444466" : "#332244";

  return (
    <group>
      {/* Left pillar */}
      <mesh position={[-8, 1, -3]} castShadow>
        <boxGeometry args={[0.8, 2.5, 0.8]} />
        <meshStandardMaterial color={pillarColor} roughness={0.95} />
      </mesh>
      {/* Right pillar */}
      <mesh position={[8, 1, -3]} castShadow>
        <boxGeometry args={[0.8, 2.5, 0.8]} />
        <meshStandardMaterial color={pillarColor} roughness={0.95} />
      </mesh>
      {/* Back wall hint */}
      <mesh position={[0, 0.3, -6]} receiveShadow>
        <boxGeometry args={[20, 0.8, 0.3]} />
        <meshStandardMaterial color={pillarColor} roughness={0.9} transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

export default function BattleArena({ regionId = 1 }: BattleArenaProps) {
  const preset = getPreset(regionId);

  return (
    <group>
      {/* Sky / Background gradient */}
      <color attach="background" args={[preset.bgGradient[1]]} />

      {/* Fog */}
      <fog attach="fog" args={[preset.fogColor, preset.fogNear, preset.fogFar]} />

      {/* Lighting */}
      <ambientLight color={preset.ambientColor} intensity={preset.ambientIntensity} />
      <directionalLight
        color={preset.sunColor}
        intensity={preset.sunIntensity}
        position={preset.sunPosition}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />

      {/* Ground */}
      <AnimatedGround color={preset.groundColor} regionId={regionId} />

      {/* Battle circle markers - glowing platforms */}
      {/* Player platform */}
      <group position={[-3, 0.02, 2]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.0, 32]} />
          <meshStandardMaterial color="#1a3a1a" emissive="#4ade80" emissiveIntensity={0.15} roughness={0.7} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
          <ringGeometry args={[0.9, 1.05, 32]} />
          <meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={0.8} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
          <ringGeometry args={[0.6, 0.65, 32]} />
          <meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={0.4} transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* Enemy platform */}
      <group position={[3, 0.02, -2]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.0, 32]} />
          <meshStandardMaterial color="#3a1a1a" emissive="#f87171" emissiveIntensity={0.15} roughness={0.7} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
          <ringGeometry args={[0.9, 1.05, 32]} />
          <meshStandardMaterial color="#f87171" emissive="#f87171" emissiveIntensity={0.8} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
          <ringGeometry args={[0.6, 0.65, 32]} />
          <meshStandardMaterial color="#f87171" emissive="#f87171" emissiveIntensity={0.4} transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Center line divider */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <planeGeometry args={[12, 0.03]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} transparent opacity={0.15} />
      </mesh>

      {/* Decorations */}
      <ArenaDecorations regionId={regionId} />

      {/* Ambient particles */}
      <AmbientParticles regionId={regionId} />
    </group>
  );
}

"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";
import type { Element } from "@/lib/skills";
import { ELEMENT_COLORS } from "./ElementMaterials";

interface ProceduralPetProps {
  element: Element;
  avatarUrl?: string;
  scale?: number;
  species?: number;
}

// ── Element-specific body shapes ──
function FirePet({ mat, eyeMat, scale }: { mat: THREE.MeshStandardMaterial; eyeMat: THREE.MeshStandardMaterial; scale: number }) {
  const tailRef = useRef<THREE.Group>(null!);
  const flameRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (tailRef.current) tailRef.current.rotation.z = Math.sin(t * 3) * 0.2 - 0.3;
    if (flameRef.current) {
      flameRef.current.scale.y = 1 + Math.sin(t * 8) * 0.3;
      flameRef.current.scale.x = 1 + Math.sin(t * 6 + 1) * 0.15;
    }
  });

  return (
    <group scale={scale}>
      {/* Body - elongated, fox-like */}
      <mesh castShadow material={mat}>
        <sphereGeometry args={[0.5, 24, 16]} />
        <mesh position={[0, 0, -0.2]} material={mat}>
          <sphereGeometry args={[0.42, 16, 12]} />
        </mesh>
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.35, 0.25]} castShadow material={mat}>
        <sphereGeometry args={[0.35, 20, 14]} />
      </mesh>

      {/* Snout */}
      <mesh position={[0, 0.25, 0.55]} material={mat}>
        <sphereGeometry args={[0.15, 12, 8]} />
      </mesh>
      <mesh position={[0, 0.22, 0.68]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#222" />
      </mesh>

      {/* Eyes - larger, expressive */}
      <mesh position={[-0.15, 0.42, 0.48]} material={eyeMat}>
        <sphereGeometry args={[0.08, 12, 12]} />
      </mesh>
      <mesh position={[0.15, 0.42, 0.48]} material={eyeMat}>
        <sphereGeometry args={[0.08, 12, 12]} />
      </mesh>
      {/* Eye shine */}
      <mesh position={[-0.13, 0.44, 0.55]}>
        <sphereGeometry args={[0.025, 6, 6]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
      </mesh>
      <mesh position={[0.17, 0.44, 0.55]}>
        <sphereGeometry args={[0.025, 6, 6]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
      </mesh>

      {/* Ears - large, pointy */}
      <mesh position={[-0.22, 0.65, 0.15]} rotation={[0.2, 0, 0.25]} material={mat}>
        <coneGeometry args={[0.12, 0.4, 8]} />
      </mesh>
      <mesh position={[0.22, 0.65, 0.15]} rotation={[0.2, 0, -0.25]} material={mat}>
        <coneGeometry args={[0.12, 0.4, 8]} />
      </mesh>
      {/* Inner ear */}
      <mesh position={[-0.20, 0.63, 0.18]} rotation={[0.2, 0, 0.25]}>
        <coneGeometry args={[0.06, 0.25, 6]} />
        <meshStandardMaterial color="#ff9966" emissive="#ff6633" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.20, 0.63, 0.18]} rotation={[0.2, 0, -0.25]}>
        <coneGeometry args={[0.06, 0.25, 6]} />
        <meshStandardMaterial color="#ff9966" emissive="#ff6633" emissiveIntensity={0.3} />
      </mesh>

      {/* Legs */}
      {[[-0.25, -0.4, 0.15], [0.25, -0.4, 0.15], [-0.2, -0.4, -0.25], [0.2, -0.4, -0.25]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} material={mat} castShadow>
          <cylinderGeometry args={[0.08, 0.06, 0.25, 8]} />
          <mesh position={[0, -0.14, 0]}>
            <sphereGeometry args={[0.07, 8, 6]} />
            <meshStandardMaterial color="#cc4400" />
          </mesh>
        </mesh>
      ))}

      {/* Tail with flame */}
      <group ref={tailRef} position={[0, 0.1, -0.55]} rotation={[0.5, 0, 0]}>
        <mesh material={mat}>
          <cylinderGeometry args={[0.08, 0.04, 0.35, 8]} />
        </mesh>
        <mesh ref={flameRef} position={[0, 0.25, 0]}>
          <coneGeometry args={[0.12, 0.3, 8]} />
          <meshStandardMaterial color="#ff4400" emissive="#ff6600" emissiveIntensity={2} transparent opacity={0.9} />
        </mesh>
        <pointLight color="#ff6600" intensity={3} distance={2} position={[0, 0.3, 0]} />
      </group>
    </group>
  );
}

function WaterPet({ mat, eyeMat, scale }: { mat: THREE.MeshStandardMaterial; eyeMat: THREE.MeshStandardMaterial; scale: number }) {
  const finRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (finRef.current) finRef.current.rotation.z = Math.sin(t * 2) * 0.15;
  });

  return (
    <group scale={scale}>
      {/* Body - rounded, seal-like */}
      <mesh castShadow material={mat}>
        <sphereGeometry args={[0.55, 24, 16]} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.3, 0.3]} castShadow material={mat}>
        <sphereGeometry args={[0.38, 20, 14]} />
      </mesh>

      {/* Belly - lighter color */}
      <mesh position={[0, -0.1, 0.2]}>
        <sphereGeometry args={[0.4, 16, 12]} />
        <meshStandardMaterial color="#88ddff" emissive="#44aaee" emissiveIntensity={0.1} roughness={0.3} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.17, 0.4, 0.55]} material={eyeMat}>
        <sphereGeometry args={[0.09, 12, 12]} />
      </mesh>
      <mesh position={[0.17, 0.4, 0.55]} material={eyeMat}>
        <sphereGeometry args={[0.09, 12, 12]} />
      </mesh>
      <mesh position={[-0.15, 0.42, 0.63]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
      </mesh>
      <mesh position={[0.19, 0.42, 0.63]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
      </mesh>

      {/* Mouth - cute smile */}
      <mesh position={[0, 0.25, 0.65]}>
        <sphereGeometry args={[0.04, 8, 4]} />
        <meshStandardMaterial color="#ff8899" />
      </mesh>

      {/* Flippers */}
      <mesh position={[-0.5, 0, 0.1]} rotation={[0, 0, 0.6]} material={mat}>
        <boxGeometry args={[0.06, 0.35, 0.2]} />
      </mesh>
      <mesh position={[0.5, 0, 0.1]} rotation={[0, 0, -0.6]} material={mat}>
        <boxGeometry args={[0.06, 0.35, 0.2]} />
      </mesh>

      {/* Dorsal fin */}
      <mesh ref={finRef} position={[0, 0.5, -0.15]} rotation={[-0.3, 0, 0]} material={mat}>
        <coneGeometry args={[0.08, 0.3, 6]} />
      </mesh>

      {/* Tail */}
      <mesh position={[0, 0, -0.55]} rotation={[0.3, 0, 0]} material={mat}>
        <coneGeometry args={[0.2, 0.15, 8]} />
      </mesh>

      {/* Water droplets around */}
      <pointLight color="#3388ff" intensity={2} distance={2.5} position={[0, 0.5, 0]} />
    </group>
  );
}

function GrassPet({ mat, eyeMat, scale }: { mat: THREE.MeshStandardMaterial; eyeMat: THREE.MeshStandardMaterial; scale: number }) {
  const leafRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (leafRef.current) leafRef.current.rotation.y = Math.sin(t * 1.5) * 0.1;
  });

  return (
    <group scale={scale}>
      {/* Body - round, bulbasaur-style */}
      <mesh castShadow material={mat}>
        <sphereGeometry args={[0.5, 24, 16]} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.28, 0.3]} castShadow material={mat}>
        <sphereGeometry args={[0.34, 20, 14]} />
      </mesh>

      {/* Eyes - big, gentle */}
      <mesh position={[-0.15, 0.38, 0.52]} material={eyeMat}>
        <sphereGeometry args={[0.1, 12, 12]} />
      </mesh>
      <mesh position={[0.15, 0.38, 0.52]} material={eyeMat}>
        <sphereGeometry args={[0.1, 12, 12]} />
      </mesh>
      <mesh position={[-0.12, 0.41, 0.6]}>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
      </mesh>
      <mesh position={[0.18, 0.41, 0.6]}>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
      </mesh>

      {/* Cheeks */}
      <mesh position={[-0.28, 0.25, 0.42]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#ff9999" emissive="#ff6666" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.28, 0.25, 0.42]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#ff9999" emissive="#ff6666" emissiveIntensity={0.3} />
      </mesh>

      {/* Nose */}
      <mesh position={[0, 0.26, 0.62]}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshStandardMaterial color="#336622" />
      </mesh>

      {/* Legs */}
      {[[-0.25, -0.38, 0.15], [0.25, -0.38, 0.15], [-0.22, -0.38, -0.2], [0.22, -0.38, -0.2]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} material={mat} castShadow>
          <cylinderGeometry args={[0.1, 0.08, 0.22, 8]} />
        </mesh>
      ))}

      {/* Leaf/flower on top */}
      <group ref={leafRef} position={[0, 0.62, 0.15]}>
        {[0, 1.2, 2.4, 3.6, 4.8].map((angle, i) => (
          <mesh key={i} position={[Math.cos(angle) * 0.12, 0, Math.sin(angle) * 0.12]} rotation={[0.4, angle, 0]}>
            <boxGeometry args={[0.08, 0.02, 0.18]} />
            <meshStandardMaterial color="#44aa22" emissive="#22cc00" emissiveIntensity={0.4} />
          </mesh>
        ))}
        {/* Flower center */}
        <mesh position={[0, 0.05, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#ffee00" emissive="#ffcc00" emissiveIntensity={0.5} />
        </mesh>
        <pointLight color="#44ff22" intensity={1.5} distance={2} position={[0, 0.2, 0]} />
      </group>
    </group>
  );
}

function ElectricPet({ mat, eyeMat, scale }: { mat: THREE.MeshStandardMaterial; eyeMat: THREE.MeshStandardMaterial; scale: number }) {
  const sparkRef = useRef<THREE.PointLight>(null!);
  const earRef1 = useRef<THREE.Mesh>(null!);
  const earRef2 = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (sparkRef.current) sparkRef.current.intensity = 2 + Math.sin(t * 12) * 1.5;
    if (earRef1.current) earRef1.current.rotation.z = 0.4 + Math.sin(t * 3) * 0.1;
    if (earRef2.current) earRef2.current.rotation.z = -0.4 - Math.sin(t * 3) * 0.1;
  });

  return (
    <group scale={scale}>
      {/* Body - round, pikachu-style */}
      <mesh castShadow material={mat}>
        <sphereGeometry args={[0.48, 24, 16]} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.32, 0.22]} castShadow material={mat}>
        <sphereGeometry args={[0.36, 20, 14]} />
      </mesh>

      {/* Cheeks - electric red */}
      <mesh position={[-0.3, 0.22, 0.38]}>
        <sphereGeometry args={[0.08, 10, 10]} />
        <meshStandardMaterial color="#ff4444" emissive="#ff2222" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0.3, 0.22, 0.38]}>
        <sphereGeometry args={[0.08, 10, 10]} />
        <meshStandardMaterial color="#ff4444" emissive="#ff2222" emissiveIntensity={0.6} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.14, 0.4, 0.48]} material={eyeMat}>
        <sphereGeometry args={[0.09, 12, 12]} />
      </mesh>
      <mesh position={[0.14, 0.4, 0.48]} material={eyeMat}>
        <sphereGeometry args={[0.09, 12, 12]} />
      </mesh>
      <mesh position={[-0.11, 0.43, 0.56]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
      </mesh>
      <mesh position={[0.17, 0.43, 0.56]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
      </mesh>

      {/* Mouth */}
      <mesh position={[0, 0.24, 0.56]}>
        <sphereGeometry args={[0.03, 6, 4]} />
        <meshStandardMaterial color="#333" />
      </mesh>

      {/* Ears - lightning bolt shaped */}
      <mesh ref={earRef1} position={[-0.25, 0.7, 0.1]} rotation={[0, 0, 0.4]} material={mat}>
        <coneGeometry args={[0.08, 0.5, 4]} />
        <mesh position={[0, 0.25, 0]}>
          <coneGeometry args={[0.05, 0.2, 4]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      </mesh>
      <mesh ref={earRef2} position={[0.25, 0.7, 0.1]} rotation={[0, 0, -0.4]} material={mat}>
        <coneGeometry args={[0.08, 0.5, 4]} />
        <mesh position={[0, 0.25, 0]}>
          <coneGeometry args={[0.05, 0.2, 4]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      </mesh>

      {/* Legs */}
      {[[-0.22, -0.38, 0.12], [0.22, -0.38, 0.12], [-0.18, -0.38, -0.18], [0.18, -0.38, -0.18]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} material={mat} castShadow>
          <cylinderGeometry args={[0.08, 0.06, 0.2, 8]} />
        </mesh>
      ))}

      {/* Tail - zigzag lightning */}
      <group position={[0, 0.15, -0.5]} rotation={[0.8, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.06, 0.25, 0.04]} />
          <meshStandardMaterial color="#eab308" emissive="#ffcc00" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0.08, 0.15, 0]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.06, 0.2, 0.04]} />
          <meshStandardMaterial color="#eab308" emissive="#ffcc00" emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* Electric spark glow */}
      <pointLight ref={sparkRef} color="#ffee44" intensity={2} distance={3} position={[0, 0.7, 0]} />
    </group>
  );
}

function NormalPet({ mat, eyeMat, scale }: { mat: THREE.MeshStandardMaterial; eyeMat: THREE.MeshStandardMaterial; scale: number }) {
  const tailRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (tailRef.current) tailRef.current.rotation.z = Math.sin(t * 4) * 0.3;
  });

  return (
    <group scale={scale}>
      {/* Body */}
      <mesh castShadow material={mat}>
        <sphereGeometry args={[0.5, 24, 16]} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.3, 0.28]} castShadow material={mat}>
        <sphereGeometry args={[0.35, 20, 14]} />
      </mesh>

      {/* Belly */}
      <mesh position={[0, -0.1, 0.18]}>
        <sphereGeometry args={[0.38, 16, 12]} />
        <meshStandardMaterial color="#dddddd" roughness={0.6} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.15, 0.4, 0.52]} material={eyeMat}>
        <sphereGeometry args={[0.09, 12, 12]} />
      </mesh>
      <mesh position={[0.15, 0.4, 0.52]} material={eyeMat}>
        <sphereGeometry args={[0.09, 12, 12]} />
      </mesh>
      <mesh position={[-0.12, 0.43, 0.6]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
      </mesh>
      <mesh position={[0.18, 0.43, 0.6]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
      </mesh>

      {/* Nose */}
      <mesh position={[0, 0.28, 0.6]}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial color="#444" />
      </mesh>

      {/* Ears */}
      <mesh position={[-0.22, 0.6, 0.15]} rotation={[-0.1, -0.2, 0.3]} material={mat}>
        <sphereGeometry args={[0.14, 10, 8]} />
      </mesh>
      <mesh position={[0.22, 0.6, 0.15]} rotation={[-0.1, 0.2, -0.3]} material={mat}>
        <sphereGeometry args={[0.14, 10, 8]} />
      </mesh>

      {/* Legs */}
      {[[-0.25, -0.38, 0.12], [0.25, -0.38, 0.12], [-0.2, -0.38, -0.2], [0.2, -0.38, -0.2]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} material={mat} castShadow>
          <cylinderGeometry args={[0.09, 0.07, 0.22, 8]} />
        </mesh>
      ))}

      {/* Tail */}
      <group ref={tailRef} position={[0, 0.15, -0.5]} rotation={[0.6, 0, 0]}>
        <mesh material={mat}>
          <capsuleGeometry args={[0.06, 0.25, 6, 8]} />
        </mesh>
      </group>
    </group>
  );
}

// ── Main Component ──
function PetShape({ element, scale = 1 }: { element: Element; scale: number }) {
  const colors = ELEMENT_COLORS[element];

  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(colors.primary),
    emissive: new THREE.Color(colors.emissive),
    emissiveIntensity: 0.12,
    roughness: 0.45,
    metalness: 0.05,
  }), [colors]);

  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#111111",
    emissive: "#222244",
    emissiveIntensity: 0.1,
    roughness: 0.1,
    metalness: 0.3,
  }), []);

  switch (element) {
    case "fire": return <FirePet mat={bodyMat} eyeMat={eyeMat} scale={scale} />;
    case "water": return <WaterPet mat={bodyMat} eyeMat={eyeMat} scale={scale} />;
    case "grass": return <GrassPet mat={bodyMat} eyeMat={eyeMat} scale={scale} />;
    case "electric": return <ElectricPet mat={bodyMat} eyeMat={eyeMat} scale={scale} />;
    default: return <NormalPet mat={bodyMat} eyeMat={eyeMat} scale={scale} />;
  }
}

// Avatar billboard — AI-generated battle sprite displayed as a large card in 3D space
function AvatarBillboard({ avatarUrl, element, scale = 1 }: { avatarUrl: string; element: Element; scale: number }) {
  const colors = ELEMENT_COLORS[element];
  const groupRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.PointLight>(null!);

  const texture = useMemo(() => {
    const tex = new THREE.TextureLoader().load(avatarUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [avatarUrl]);

  // Subtle breathing glow
  useFrame(({ clock }) => {
    if (glowRef.current) {
      glowRef.current.intensity = 3 + Math.sin(clock.elapsedTime * 2) * 1;
    }
  });

  const s = scale * 2.2;

  return (
    <group ref={groupRef}>
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        {/* Main sprite — large and prominent */}
        <mesh scale={[s, s * 0.6, 1]} position={[0, 0, 0]}>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial
            map={texture}
            emissive="#ffffff"
            emissiveIntensity={0.12}
            roughness={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>

      {/* Element-colored glow behind */}
      <pointLight ref={glowRef} color={colors.primary} intensity={3} distance={5} position={[0, 0.3, -0.5]} />

      {/* Ground glow circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]}>
        <circleGeometry args={[0.8, 24]} />
        <meshStandardMaterial
          color={colors.primary}
          emissive={colors.emissive}
          emissiveIntensity={1.2}
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export default function ProceduralPet({ element, avatarUrl, scale = 1 }: ProceduralPetProps) {
  if (avatarUrl) {
    return <AvatarBillboard avatarUrl={avatarUrl} element={element} scale={scale} />;
  }
  return <PetShape element={element} scale={scale} />;
}

"use client";

import { useRef, useMemo, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export interface Particle3D {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  size: number;
  life: number;
  maxLife: number;
  gravity: number;
  shrink: boolean;
}

interface ParticleSystemProps {
  maxParticles?: number;
}

const _tempObj = new THREE.Object3D();
const _tempColor = new THREE.Color();

export function useParticleSystem(maxParticles = 200) {
  const particlesRef = useRef<Particle3D[]>([]);
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  // Initialize pool
  if (particlesRef.current.length === 0) {
    for (let i = 0; i < maxParticles; i++) {
      particlesRef.current.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        color: new THREE.Color(),
        size: 0,
        life: 0,
        maxLife: 1,
        gravity: 0,
        shrink: true,
      });
    }
  }

  const emit = useCallback((
    count: number,
    origin: THREE.Vector3,
    config: {
      colors: string[];
      speedMin?: number;
      speedMax?: number;
      sizeMin?: number;
      sizeMax?: number;
      lifeMin?: number;
      lifeMax?: number;
      gravity?: number;
      spread?: THREE.Vector3;
      direction?: THREE.Vector3;
      shrink?: boolean;
    }
  ) => {
    const pool = particlesRef.current;
    let spawned = 0;
    const {
      colors, speedMin = 1, speedMax = 3,
      sizeMin = 0.05, sizeMax = 0.15,
      lifeMin = 0.5, lifeMax = 1.5,
      gravity = 0,
      spread = new THREE.Vector3(1, 1, 1),
      direction,
      shrink = true,
    } = config;

    for (let i = 0; i < pool.length && spawned < count; i++) {
      if (!pool[i].active) {
        const p = pool[i];
        p.active = true;
        p.position.copy(origin);
        p.position.x += (Math.random() - 0.5) * spread.x;
        p.position.y += (Math.random() - 0.5) * spread.y;
        p.position.z += (Math.random() - 0.5) * spread.z;

        const speed = speedMin + Math.random() * (speedMax - speedMin);
        if (direction) {
          p.velocity.copy(direction).multiplyScalar(speed);
          p.velocity.x += (Math.random() - 0.5) * 0.5;
          p.velocity.y += (Math.random() - 0.5) * 0.5;
          p.velocity.z += (Math.random() - 0.5) * 0.5;
        } else {
          p.velocity.set(
            (Math.random() - 0.5) * speed,
            Math.random() * speed,
            (Math.random() - 0.5) * speed
          );
        }

        p.color.set(colors[Math.floor(Math.random() * colors.length)]);
        p.size = sizeMin + Math.random() * (sizeMax - sizeMin);
        p.life = lifeMin + Math.random() * (lifeMax - lifeMin);
        p.maxLife = p.life;
        p.gravity = gravity;
        p.shrink = shrink;
        spawned++;
      }
    }
  }, []);

  const update = useCallback((dt: number) => {
    const pool = particlesRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (p.active) {
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          _tempObj.scale.set(0, 0, 0);
          _tempObj.updateMatrix();
          mesh.setMatrixAt(i, _tempObj.matrix);
          continue;
        }

        p.velocity.y -= p.gravity * dt;
        p.position.addScaledVector(p.velocity, dt);

        const ratio = p.life / p.maxLife;
        const s = p.shrink ? p.size * ratio : p.size;

        _tempObj.position.copy(p.position);
        _tempObj.scale.set(s, s, s);
        _tempObj.updateMatrix();
        mesh.setMatrixAt(i, _tempObj.matrix);
        mesh.setColorAt(i, p.color);
      } else {
        _tempObj.scale.set(0, 0, 0);
        _tempObj.position.set(0, -100, 0);
        _tempObj.updateMatrix();
        mesh.setMatrixAt(i, _tempObj.matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  return { meshRef, emit, update, particles: particlesRef };
}

export default function ParticleSystem({ maxParticles = 200 }: ParticleSystemProps) {
  const { meshRef, update } = useParticleSystem(maxParticles);

  useFrame((_, dt) => update(Math.min(dt, 0.05)));

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, maxParticles]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 4]} />
      <meshStandardMaterial
        transparent
        opacity={0.9}
        emissive="#ffffff"
        emissiveIntensity={0.3}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

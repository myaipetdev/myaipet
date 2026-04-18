"use client";

import * as THREE from "three";
import type { Element } from "@/lib/skills";
import { ELEMENT_COLORS } from "@/components/three/helpers/ElementMaterials";

// Particle emission configs per element, mirroring vfx.ts interface
export interface EmitConfig {
  colors: string[];
  speedMin: number;
  speedMax: number;
  sizeMin: number;
  sizeMax: number;
  lifeMin: number;
  lifeMax: number;
  gravity: number;
  spread: THREE.Vector3;
  direction?: THREE.Vector3;
  shrink: boolean;
}

export function getElementVFX(element: Element, intensity: number = 3): { count: number; config: EmitConfig } {
  const colors = ELEMENT_COLORS[element];
  const baseCount = 10 + intensity * 8;

  switch (element) {
    case "fire":
      return {
        count: baseCount,
        config: {
          colors: colors.particle,
          speedMin: 1.5, speedMax: 4,
          sizeMin: 0.06, sizeMax: 0.18,
          lifeMin: 0.4, lifeMax: 1.2,
          gravity: -1.5, // Rise upward
          spread: new THREE.Vector3(1.2, 0.5, 1.2),
          direction: new THREE.Vector3(0, 1, 0),
          shrink: true,
        },
      };

    case "water":
      return {
        count: baseCount,
        config: {
          colors: colors.particle,
          speedMin: 2, speedMax: 5,
          sizeMin: 0.04, sizeMax: 0.14,
          lifeMin: 0.5, lifeMax: 1.0,
          gravity: 6, // Fall with gravity
          spread: new THREE.Vector3(1, 2, 1),
          direction: new THREE.Vector3(0, 1.5, 0),
          shrink: false,
        },
      };

    case "electric":
      return {
        count: Math.floor(baseCount * 0.7),
        config: {
          colors: colors.particle,
          speedMin: 3, speedMax: 8,
          sizeMin: 0.03, sizeMax: 0.1,
          lifeMin: 0.15, lifeMax: 0.5,
          gravity: 0,
          spread: new THREE.Vector3(2, 2, 2),
          shrink: true,
        },
      };

    case "grass":
      return {
        count: baseCount,
        config: {
          colors: colors.particle,
          speedMin: 0.5, speedMax: 2,
          sizeMin: 0.05, sizeMax: 0.15,
          lifeMin: 0.8, lifeMax: 2.0,
          gravity: -0.5, // Slowly rise
          spread: new THREE.Vector3(1.5, 1, 1.5),
          direction: new THREE.Vector3(0, 0.5, 0),
          shrink: false,
        },
      };

    default: // normal
      return {
        count: Math.floor(baseCount * 1.2),
        config: {
          colors: colors.particle,
          speedMin: 2, speedMax: 6,
          sizeMin: 0.04, sizeMax: 0.12,
          lifeMin: 0.3, lifeMax: 0.8,
          gravity: 3,
          spread: new THREE.Vector3(1, 0.5, 1),
          shrink: true,
        },
      };
  }
}

export function getImpactVFX(): { count: number; config: EmitConfig } {
  return {
    count: 20,
    config: {
      colors: ["#ffffff", "#ffddaa", "#ffaa66"],
      speedMin: 3, speedMax: 7,
      sizeMin: 0.03, sizeMax: 0.1,
      lifeMin: 0.2, lifeMax: 0.6,
      gravity: 5,
      spread: new THREE.Vector3(0.5, 0.3, 0.5),
      shrink: true,
    },
  };
}

export function getCritVFX(): { count: number; config: EmitConfig } {
  return {
    count: 30,
    config: {
      colors: ["#fde047", "#fbbf24", "#ffffff", "#f59e0b"],
      speedMin: 2, speedMax: 5,
      sizeMin: 0.06, sizeMax: 0.2,
      lifeMin: 0.5, lifeMax: 1.2,
      gravity: 1,
      spread: new THREE.Vector3(1.5, 1, 1.5),
      shrink: true,
    },
  };
}

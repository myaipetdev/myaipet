"use client";

export interface EnvironmentPreset {
  groundColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientColor: string;
  ambientIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPosition: [number, number, number];
  bgGradient: [string, string];
  particleHint?: "fireflies" | "rain" | "snow" | "embers" | "lightning";
}

export const REGION_PRESETS: Record<number, EnvironmentPreset> = {
  1: { // Grasslands
    groundColor: "#3a7a2a",
    fogColor: "#1a4a10",
    fogNear: 8, fogFar: 25,
    ambientColor: "#c8e0b0", ambientIntensity: 0.6,
    sunColor: "#fff8e0", sunIntensity: 1.2,
    sunPosition: [5, 8, 3],
    bgGradient: ["#87ceeb", "#2d5a1e"],
    particleHint: "fireflies",
  },
  2: { // Volcano
    groundColor: "#3a1a0a",
    fogColor: "#1a0800",
    fogNear: 6, fogFar: 20,
    ambientColor: "#ff6644", ambientIntensity: 0.4,
    sunColor: "#ff4422", sunIntensity: 0.8,
    sunPosition: [3, 6, 2],
    bgGradient: ["#4a0a00", "#1a0500"],
    particleHint: "embers",
  },
  3: { // Ocean
    groundColor: "#0a3a5a",
    fogColor: "#051a30",
    fogNear: 8, fogFar: 28,
    ambientColor: "#88ccee", ambientIntensity: 0.5,
    sunColor: "#ccddff", sunIntensity: 1.0,
    sunPosition: [4, 10, 5],
    bgGradient: ["#4488cc", "#0a2a4a"],
    particleHint: "rain",
  },
  4: { // Storm Peak
    groundColor: "#1a1a3a",
    fogColor: "#0a0a18",
    fogNear: 5, fogFar: 18,
    ambientColor: "#8877bb", ambientIntensity: 0.3,
    sunColor: "#aa88ff", sunIntensity: 0.6,
    sunPosition: [2, 5, 1],
    bgGradient: ["#2a1a4a", "#0a0a18"],
    particleHint: "lightning",
  },
  5: { // Shadow Realm
    groundColor: "#0a0a12",
    fogColor: "#050508",
    fogNear: 4, fogFar: 15,
    ambientColor: "#5533aa", ambientIntensity: 0.2,
    sunColor: "#7744cc", sunIntensity: 0.4,
    sunPosition: [1, 4, 0],
    bgGradient: ["#1a0a2a", "#050508"],
  },
  6: { // Dragon's End
    groundColor: "#4a2a0a",
    fogColor: "#2a1000",
    fogNear: 6, fogFar: 22,
    ambientColor: "#ffaa44", ambientIntensity: 0.5,
    sunColor: "#ffcc66", sunIntensity: 1.4,
    sunPosition: [4, 8, 3],
    bgGradient: ["#8a3a0a", "#2a1000"],
    particleHint: "embers",
  },
};

export const DEFAULT_PRESET: EnvironmentPreset = REGION_PRESETS[1];

export function getPreset(regionId?: number): EnvironmentPreset {
  if (regionId && REGION_PRESETS[regionId]) return REGION_PRESETS[regionId];
  return DEFAULT_PRESET;
}

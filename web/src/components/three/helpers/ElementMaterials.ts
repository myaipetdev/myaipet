"use client";

import * as THREE from "three";
import type { Element } from "@/lib/skills";

export const ELEMENT_COLORS: Record<Element, { primary: string; emissive: string; particle: string[] }> = {
  normal:   { primary: "#c8c8c8", emissive: "#555555", particle: ["#ffffff", "#cccccc", "#999999"] },
  fire:     { primary: "#ff6b2b", emissive: "#ff4400", particle: ["#ff6600", "#ff9933", "#ffcc00", "#ff3300"] },
  water:    { primary: "#3b82f6", emissive: "#1d4ed8", particle: ["#60a5fa", "#3b82f6", "#93c5fd", "#2563eb"] },
  grass:    { primary: "#22c55e", emissive: "#16a34a", particle: ["#4ade80", "#22c55e", "#86efac", "#15803d"] },
  electric: { primary: "#eab308", emissive: "#ca8a04", particle: ["#fde047", "#eab308", "#facc15", "#fefce8"] },
};

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

export function getElementMaterial(element: Element, variant: "standard" | "emissive" = "standard"): THREE.MeshStandardMaterial {
  const key = `${element}_${variant}`;
  if (materialCache.has(key)) return materialCache.get(key)!;

  const colors = ELEMENT_COLORS[element];
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colors.primary),
    emissive: new THREE.Color(variant === "emissive" ? colors.emissive : "#000000"),
    emissiveIntensity: variant === "emissive" ? 0.5 : 0,
    roughness: 0.6,
    metalness: 0.1,
  });

  materialCache.set(key, mat);
  return mat;
}

export function getHitMaterial(): THREE.MeshStandardMaterial {
  const key = "hit_flash";
  if (materialCache.has(key)) return materialCache.get(key)!;

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#ff0000"),
    emissive: new THREE.Color("#ff4444"),
    emissiveIntensity: 1.0,
    roughness: 0.5,
    metalness: 0,
  });

  materialCache.set(key, mat);
  return mat;
}

export const ARENA_COLORS: Record<number, { ground: string; fog: string; ambient: string; sun: string }> = {
  1: { ground: "#2d5a1e", fog: "#1a3a10", ambient: "#b8d4a8", sun: "#fff4cc" },  // Grasslands
  2: { ground: "#4a1a0a", fog: "#2a0a00", ambient: "#ff8866", sun: "#ff6633" },  // Volcano
  3: { ground: "#0a2a4a", fog: "#051530", ambient: "#88bbee", sun: "#ccddff" },  // Ocean
  4: { ground: "#1a1a3a", fog: "#0a0a20", ambient: "#9988cc", sun: "#aa99ff" },  // Storm
  5: { ground: "#0a0a1a", fog: "#050510", ambient: "#6644aa", sun: "#8866cc" },  // Shadow
  6: { ground: "#3a1a0a", fog: "#200a00", ambient: "#ffaa44", sun: "#ffcc66" },  // Dragon
};

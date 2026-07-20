/**
 * Wild Encounters — deterministic, server-verifiable game spawns (the
 * Pokémon-GO-style "track 2" of Catch).
 *
 * HONESTY NOTE: these are GAME CONTENT, not real animals and not real user
 * data. Spawns are generated procedurally from (geo-cell × time-period) so that
 * everyone in the same ~1km area sees the SAME spawns during the same hour, and
 * the server can re-derive the exact set to validate a catch (a client can't
 * fabricate a spawn). Nothing here claims a real-world sighting.
 */

import { RARITY_TIERS, type CatRarity, rarityMeta } from "./game";

export interface WildSpawn {
  id: string;          // deterministic + reconstructible server-side
  kind: string;        // mostly cat/dog, sometimes other animals
  species: string;     // display "breed"
  rarity: CatRarity;
  element: string;
  name: string;
  lat: number;
  lng: number;
}

// Spawn kinds — cats & dogs dominate, with the occasional other critter so the
// wild track reflects "real animals", not only cats/dogs.
const SPAWN_KINDS = ["cat", "cat", "cat", "cat", "dog", "dog", "dog", "dog", "bird", "rabbit", "squirrel", "duck", "fox"];

const CELL = 0.01;               // ~1.1km grid cell
const SPAWN_RADIUS_DEG = 0.0045; // spawns sit within ~500m of cell centre
const PERIOD_MS = 60 * 60 * 1000; // spawns rotate hourly

/** Points awarded for a wild catch by rarity — deliberately lower than a real
 *  camera catch (CATCH_POINTS), since tapping a spawn is easier. Daily-capped. */
export const WILD_POINTS: Record<CatRarity, number> = {
  gray: 3, green: 6, blue: 10, purple: 16, orange: 25,
};

const CAT_SPECIES = ["Tabby", "Calico", "Tuxedo", "Siamese", "Ginger", "Black", "Tortie", "Maine Coon", "Bombay", "Ragdoll"];
const DOG_SPECIES = ["Mutt", "Shiba", "Corgi", "Pug", "Husky", "Beagle", "Poodle", "Retriever", "Terrier", "Spitz"];
const CAT_NAMES = ["Dordor", "Biscuit", "Shadow", "Pumpkin", "Luna", "Oreo", "Bean", "Noodle", "Pixel", "Nori", "Marble", "Sushi"];
const DOG_NAMES = ["Rocky", "Bella", "Cooper", "Max", "Daisy", "Rex", "Coco", "Nala", "Duke", "Maple", "Scout", "Pretzel"];
const ELEMENTS = ["fire", "water", "grass", "electric", "normal"];

// ── deterministic PRNG (cyrb53 hash → mulberry32) ──
function hashSeed(str: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) ^ (h1 >>> 0);
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function rollRarityDet(rng: () => number): CatRarity {
  const total = RARITY_TIERS.reduce((s, t) => s + t.weight, 0);
  let r = rng() * total;
  for (const t of RARITY_TIERS) { r -= t.weight; if (r <= 0) return t.key; }
  return "gray";
}

export function currentPeriod(nowMs: number): number {
  return Math.floor(nowMs / PERIOD_MS);
}

function cellOf(lat: number, lng: number): [number, number] {
  return [Math.floor(lat / CELL) * CELL, Math.floor(lng / CELL) * CELL];
}

/** The full deterministic spawn set for a user's cell + period. */
export function spawnsFor(lat: number, lng: number, period: number): WildSpawn[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const [clat, clng] = cellOf(lat, lng);
  const cellKey = `${clat.toFixed(2)},${clng.toFixed(2)}`;
  const rng = mulberry32(hashSeed(`${cellKey}:${period}`));
  const count = 6 + Math.floor(rng() * 7); // 6–12 spawns
  const out: WildSpawn[] = [];
  for (let i = 0; i < count; i++) {
    const kind = pick(SPAWN_KINDS, rng);
    const rarity = rollRarityDet(rng);
    const element = pick(ELEMENTS, rng);
    const species = kind === "cat" ? pick(CAT_SPECIES, rng) : kind === "dog" ? pick(DOG_SPECIES, rng) : kind.charAt(0).toUpperCase() + kind.slice(1);
    const name = pick(kind === "dog" ? DOG_NAMES : CAT_NAMES, rng);
    const dlat = (rng() - 0.5) * 2 * SPAWN_RADIUS_DEG;
    const dlng = (rng() - 0.5) * 2 * SPAWN_RADIUS_DEG;
    out.push({
      id: `${cellKey}:${period}:${i}`,
      kind, rarity, element, species, name,
      lat: +(clat + CELL / 2 + dlat).toFixed(6),
      lng: +(clng + CELL / 2 + dlng).toFixed(6),
    });
  }
  return out;
}

/** Re-derive a single spawn to validate a catch (anti-cheat). */
export function findSpawn(lat: number, lng: number, period: number, id: string): WildSpawn | undefined {
  return spawnsFor(lat, lng, period).find((s) => s.id === id);
}

/** Decorate a spawn with display fields for the client. */
export function withSpawnMeta(s: WildSpawn) {
  const m = rarityMeta(s.rarity);
  return { ...s, rarityLabel: m.label, rarityColor: m.color };
}

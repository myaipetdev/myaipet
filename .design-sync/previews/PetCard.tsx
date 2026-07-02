// PetCard — a pet as a foil-stamped trading card. Rarity drives the finish:
// Common = matte edge (no holo), Rare = gold-foil ring, Epic = purple-shifted
// foil, Legendary = full holographic ring + foil-gradient name. Data mirrors
// the real /api/card payload (CardData); stats are the honest grind numbers.
import { PetCard } from "web";

const base = {
  id: 742,
  name: "Mochi",
  speciesName: "Pomeranian",
  element: "grass",
  level: 27,
  atk: 64, def: 58, spd: 71,
  power: 148,
  bondLevel: 42,
  careStreak: 12,
  evolutionName: "Blossom Pom",
  evolutionStage: 2,
  personality: "playful",
  avatarUrl: "https://app.myaipet.ai/mascot.jpg",
  rarity: "Legendary" as const,
  topPercent: 8,
  moves: ["Fetch Quake", "Zoomies", "Guard Bark"],
  bornAt: "2026-03-14T09:00:00.000Z",
};

const pad: React.CSSProperties = { padding: 14, display: "inline-block" };

export const Legendary = () => (
  <div style={pad}><PetCard card={base} maxWidth={250} /></div>
);

export const Rare = () => (
  <div style={pad}>
    <PetCard
      card={{ ...base, id: 118, name: "Coco", speciesName: "Calico Cat", element: "water", level: 9, atk: 31, def: 28, spd: 40, power: 62, bondLevel: 14, careStreak: 4, evolutionName: null, evolutionStage: 1, rarity: "Rare", topPercent: 31, moves: ["Pounce", "Nap Guard"] }}
      maxWidth={250}
    />
  </div>
);

export const Common = () => (
  <div style={pad}>
    <PetCard
      card={{ ...base, id: 301, name: "Bolt", speciesName: "Corgi", element: "electric", level: 2, atk: 12, def: 10, spd: 18, power: 21, bondLevel: 3, careStreak: 1, evolutionName: null, evolutionStage: 1, rarity: "Common", topPercent: null, moves: ["Wiggle"] }}
      maxWidth={250}
    />
  </div>
);

export const NoPhoto = () => (
  <div style={pad}>
    <PetCard
      card={{ ...base, id: 12, name: "Biscuit", speciesName: "Hamster", element: "normal", level: 5, atk: 18, def: 22, spd: 25, power: 34, bondLevel: 8, careStreak: 2, evolutionName: null, evolutionStage: 1, avatarUrl: null, rarity: "Uncommon", topPercent: null, moves: [] }}
      maxWidth={250}
    />
  </div>
);

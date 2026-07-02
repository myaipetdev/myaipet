// design-sync barrel — the app has no library dist, so this is the bundle
// entry for the Collectible Editorial components synced to claude.ai/design.
// (Icon is deliberately absent: it hardcodes app-served /icons/*.png paths
// that 404 in the design environment — see .design-sync/NOTES.md.)
export { default as CollectibleFrame, GoldSeal, Motes } from "./src/components/editorial/CollectibleFrame";
export { default as PetCard } from "./src/components/PetCard";

/**
 * Codex sticker variants — the collectible creature sticker looks a
 * pet can be illustrated in. ONE source of truth shared by every surface:
 *   - /api/pets/[petId]/generate (style 6) uses `codexVariantDesc` as the style
 *     override fed to buildPetPrompt (appearance + ref image carry identity).
 *   - CardDeck's studio-generate path uses `codexPrompt` (a full raw prompt;
 *     grok-imagine still references the pet photo for identity).
 * All variants are ©-FREE — no franchise names, no logos. The dex number/name
 * badge is stamped by our UI, so the art itself must stay text-free.
 */

export type CodexVariant = { key: string; label: string; blurb: string; desc: string };

export const CODEX_VARIANTS: CodexVariant[] = [
  {
    key: "classic",
    label: "Classic",
    blurb: "90s glossy sticker",
    desc: "a glossy 1990s collectible creature-sticker: bold thick uniform black outline, flat two-tone cel shading, bright saturated candy colors, clean vector finish, single creature in a lively dynamic full-body action pose, die-cut sticker with a thin white cut border on a plain solid soft-pastel background, cute iconic mascot",
  },
  {
    key: "chibi",
    label: "Chibi",
    blurb: "big-head cutie",
    desc: "a chibi super-deformed collectible sticker: oversized head, tiny body, huge sparkly eyes, thick black outline, soft pastel cel shading, adorable kawaii mascot, single creature in a bouncy dynamic pose, glossy die-cut sticker with a thin white border on a plain pastel background",
  },
  {
    key: "holo",
    label: "Holo",
    blurb: "foil prism",
    desc: "a holographic foil collectible sticker: iridescent rainbow prism shimmer and metallic highlights, bold black outline, crisp cel shading, single creature in a heroic dynamic pose, glossy die-cut sticker with a thin white border on a dark starry background with tiny sparkles",
  },
  {
    key: "retro",
    label: "Retro",
    blurb: "risograph print",
    desc: "a vintage 1980s risograph collectible sticker: two-color spot-ink riso print with visible offset misregistration and grainy paper texture, limited muted pink-and-teal palette, thick outline, flat matte shading, single creature in a dynamic pose, worn matte die-cut sticker with a white border on aged off-white paper",
  },
  {
    key: "pixel",
    label: "Pixel",
    blurb: "8-bit",
    desc: "a cute 8-bit pixel-art collectible sticker: chunky visible pixels, limited retro game palette, crisp black outline, single creature in a dynamic pose, die-cut sticker with a white border on a plain flat background",
  },
  {
    key: "pop",
    label: "Pop",
    blurb: "comic panel",
    desc: "a bold 1960s pop-art comic-panel collectible sticker: heavy black comic-ink outline, flat high-contrast primary colors (bright red, yellow, blue), sparse ben-day dot accents, dramatic single creature in an explosive action pose, glossy die-cut sticker with a white border on a punchy solid-color background",
  },
];

const DEFAULT = CODEX_VARIANTS[0];

export function isCodexVariant(k: unknown): k is string {
  return typeof k === "string" && CODEX_VARIANTS.some((v) => v.key === k);
}

function variant(key?: string): CodexVariant {
  return CODEX_VARIANTS.find((v) => v.key === key) || DEFAULT;
}

/** Style fragment for buildPetPrompt's styleDesc override (pet-generate path). */
export function codexVariantDesc(key?: string): string {
  return variant(key).desc;
}

/** Full raw prompt for the studio-generate path (grok-imagine, uses the photo as
 *  a reference for identity). Text-free — the badge is our UI's job. */
export function codexPrompt(name: string, key?: string): string {
  return `${name} illustrated as ${variant(key).desc}. Base it on this exact real animal — keep its species, real fur colors and markings, full body. No text, letters, numbers, or watermark.`;
}

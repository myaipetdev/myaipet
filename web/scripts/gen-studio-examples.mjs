// One-off: generate Studio example art via Grok, starring the MY AI PET MASCOT
// (public/mascot.jpg) as the identity reference so every example is on-brand
// and identical for all users (the SUBJECT pet in Studio is still per-user).
//
//   cd web && node scripts/gen-studio-examples.mjs
//
// Run on EC2 (valid production GROK key). Emits src/lib/studio/example-assets.ts.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadKey() {
  for (const f of [".env.production", ".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*(GROK_API_KEY|XAI_API_KEY)\s*=\s*(.+)\s*$/);
      if (m) return m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("GROK_API_KEY not found");
}
const KEY = loadKey();

// Mascot identity reference (local file → base64), passed on every request so
// the generated character is our white Pomeranian, not a random animal.
const MASCOT_B64 = readFileSync(resolve("public/mascot.jpg")).toString("base64");
const REF = `data:image/jpeg;base64,${MASCOT_B64}`;
const IDENTITY =
  "Create a new image of this EXACT same character — the fluffy white Pomeranian " +
  "mascot (same fluffy white fur, big round dark eyes, black collar with a small " +
  "gold bell). Keep it cute and on-model. New scene/style: ";

const STYLES = {
  cinematic:      "cinematic film still, dramatic Hollywood lighting, shallow depth of field, anamorphic lens flare, moody teal-and-amber color grade",
  anime:          "anime art style, vibrant cel-shading, Studio Ghibli inspired, soft painterly background, clean linework",
  photorealistic: "photorealistic, ultra-detailed soft fur, natural window light, shot on a DSLR 85mm, crisp focus",
  watercolor:     "soft watercolor painting, pastel washes, hand-painted, gentle bleeding colors on textured paper",
  pixar:          "3D Pixar-style render, cute and characterful, soft global illumination, glossy eyes",
  pixel:          "retro 16-bit pixel art, vibrant limited palette, crisp pixels, simple background",
};

const TEMPLATES = {
  "birthday-party":  "at a cute birthday party, pastel confetti drifting, a small frosted cake with a single lit candle in front, warm soft light, cinematic close-up",
  "new-year-wish":   "under a night sky exploding with colorful fireworks, soft glow reflected in the eyes, a small HAPPY NEW YEAR banner behind, cinematic wide shot",
  "daily-vlog":      "in a sunlit window seat looking into the camera with a curious head tilt, cozy lifestyle vlog opener, soft natural light",
  "morning-stretch": "waking up on a soft blanket in warm morning sunlight, mid big stretch with paws extended and a sleepy yawn, golden-hour grade",
  "noir-detective":  "wearing a tiny trench coat and fedora under a neon street lamp in the rain at night, 1940s film-noir, black and white with selective red neon",
  "anime-opening":   "on a hilltop as cherry-blossom petals swirl past, fur blowing in the wind, dramatic backlight and sun flare, heroic anime opening framing",
  "dance-loop":      "bobbing its head rhythmically with a happy expression, colorful disco light wash, fun energetic social vibe",
  "reaction-shock":  "eyes growing huge in dramatic shock, ears perked up, quick zoom-in on the face, meme reaction frame",
};

async function genImage(scene) {
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: "grok-imagine-image", prompt: IDENTITY + scene,
      n: 1, response_format: "url", image: REF,
    }),
  });
  if (!res.ok) throw new Error(`Grok ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const d = await res.json();
  const url = d?.data?.[0]?.url;
  if (!url) throw new Error("no image url");
  return url;
}

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  return { buf: Buffer.from(await r.arrayBuffer()), ext };
}

async function run(group, items, dir, urlBase) {
  mkdirSync(resolve("public", dir), { recursive: true });
  const manifest = {};
  for (const [id, scene] of Object.entries(items)) {
    try {
      process.stdout.write(`  ${group}/${id} … `);
      const url = await genImage(scene);
      const { buf, ext } = await download(url);
      writeFileSync(resolve("public", dir, `${id}.${ext}`), buf);
      manifest[id] = `${urlBase}/${id}.${ext}`;
      console.log(`ok (${(buf.length / 1024).toFixed(0)}kb)`);
    } catch (e) { console.log(`FAILED — ${e.message}`); }
  }
  return manifest;
}

const styleManifest = await run("style", STYLES, "studio_styles", "/studio_styles");
const tplManifest = await run("template", TEMPLATES, "studio_examples", "/studio_examples");

writeFileSync(
  resolve("src/lib/studio/example-assets.ts"),
  `// AUTO-GENERATED by scripts/gen-studio-examples.mjs — do not edit by hand.\n` +
  `// Mascot-starring Grok example art for the Studio style picker + template gallery.\n` +
  `export const STYLE_EXAMPLES: Record<string, string> = ${JSON.stringify(styleManifest, null, 2)};\n` +
  `export const TEMPLATE_EXAMPLES: Record<string, string> = ${JSON.stringify(tplManifest, null, 2)};\n`
);
console.log(`\nstyles: ${Object.keys(styleManifest).length} templates: ${Object.keys(tplManifest).length}`);

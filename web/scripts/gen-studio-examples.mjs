// One-off: generate real Studio example images via Grok (grok-imagine-image),
// download them into /public, and emit an asset manifest the UI imports.
//
//   cd web && node scripts/gen-studio-examples.mjs
//
// Reuses the same xAI image endpoint as src/lib/services/video.ts. Idempotent:
// re-running regenerates everything. Generic "kitten" subject so the examples
// are reusable across all users (not tied to anyone's pet).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── load GROK_API_KEY from .env.local / .env (no external deps) ──
function loadKey() {
  for (const f of [".env.production", ".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    const txt = readFileSync(f, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*(GROK_API_KEY|XAI_API_KEY)\s*=\s*(.+)\s*$/);
      if (m) return m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("GROK_API_KEY not found in .env.local or .env");
}
const KEY = loadKey();

const SUBJECT = "an adorable fluffy kitten with big round expressive eyes";

const STYLES = {
  cinematic:      `${SUBJECT}, cinematic film still, dramatic Hollywood lighting, shallow depth of field, anamorphic lens flare, moody teal-and-amber color grade`,
  anime:          `${SUBJECT}, anime art style, vibrant cel-shading, Studio Ghibli inspired, soft painterly background, clean linework`,
  photorealistic: `${SUBJECT}, photorealistic, ultra-detailed soft fur, natural window light, shot on DSLR 85mm, crisp focus`,
  watercolor:     `${SUBJECT}, soft watercolor painting, pastel washes, hand-painted, gentle bleeding colors on textured paper`,
  pixar:          `${SUBJECT}, 3D Pixar-style render, cute and characterful, soft global illumination, subtle subsurface scattering, glossy eyes`,
  pixel:          `an adorable fluffy kitten, retro 16-bit pixel art, vibrant limited palette, crisp pixels, video-game sprite on a simple background`,
};

const TEMPLATES = {
  "birthday-party":  `${SUBJECT} at a cute birthday party, pastel confetti drifting, a small frosted cake with a single lit candle in front, leaning in with wide curious eyes, warm soft light, shallow depth of field, cinematic close-up`,
  "new-year-wish":   `${SUBJECT} sitting under a night sky exploding with colorful fireworks, soft glow reflected in the eyes, a small "HAPPY NEW YEAR" banner behind, cinematic wide shot`,
  "daily-vlog":      `${SUBJECT} sitting in a sunlit window seat looking directly into the camera with a curious head tilt, soft natural light, cozy lifestyle vlog opener, blurred leaves outside`,
  "morning-stretch": `${SUBJECT} waking up on a soft blanket as warm morning sunlight streams in, mid big stretch with paws extended and a sleepy yawn, golden-hour color grade, low angle`,
  "noir-detective":  `an adorable fluffy kitten wearing a tiny trench coat and fedora, standing under a neon street lamp in the rain at night, smoky 1940s film-noir cinematography, black and white with selective red neon`,
  "anime-opening":   `an adorable fluffy kitten, anime aesthetic, standing on a hilltop as cherry-blossom petals swirl past, fur blowing in the wind, dramatic backlight and sun flare, heroic opening-title framing`,
  "dance-loop":      `${SUBJECT} bobbing its head rhythmically with a happy expression, colorful disco light wash, fun energetic short-form social vibe`,
  "reaction-shock":  `${SUBJECT}, eyes growing huge in dramatic shock, ears perked up, rapid zoom-in on the face, perfect meme reaction frame`,
};

async function genImage(prompt) {
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: "grok-imagine-image", prompt, n: 1, response_format: "url" }),
  });
  if (!res.ok) throw new Error(`Grok ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error("no image url in response");
  return url;
}

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  const buf = Buffer.from(await r.arrayBuffer());
  return { buf, ext };
}

async function run(group, items, publicDir, urlBase) {
  mkdirSync(resolve("public", publicDir), { recursive: true });
  const manifest = {};
  for (const [id, prompt] of Object.entries(items)) {
    try {
      process.stdout.write(`  ${group}/${id} … `);
      const url = await genImage(prompt);
      const { buf, ext } = await download(url);
      const file = `${id}.${ext}`;
      writeFileSync(resolve("public", publicDir, file), buf);
      manifest[id] = `${urlBase}/${file}`;
      console.log(`ok (${(buf.length / 1024).toFixed(0)}kb)`);
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
    }
  }
  return manifest;
}

const styleManifest = await run("style", STYLES, "studio_styles", "/studio_styles");
const tplManifest = await run("template", TEMPLATES, "studio_examples", "/studio_examples");

const out = `// AUTO-GENERATED by scripts/gen-studio-examples.mjs — do not edit by hand.
// Real Grok-rendered example art for the Studio style picker + template gallery.
export const STYLE_EXAMPLES: Record<string, string> = ${JSON.stringify(styleManifest, null, 2)};
export const TEMPLATE_EXAMPLES: Record<string, string> = ${JSON.stringify(tplManifest, null, 2)};
`;
writeFileSync(resolve("src/lib/studio/example-assets.ts"), out);
console.log("\nWrote src/lib/studio/example-assets.ts");
console.log("styles:", Object.keys(styleManifest).length, "templates:", Object.keys(tplManifest).length);

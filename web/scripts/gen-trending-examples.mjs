// One-off: generate REAL example still+video for the 12 trending templates,
// starring the mascot (public/mascot.jpg) — same pipeline as
// gen-studio-examples.mjs / gen-studio-example-videos.mjs, merged into one:
//   still (grok-imagine, mascot identity ref) → i2v clip (grok-imagine-video,
//   anchored on that still as a data URL) → public/studio_examples/<id>.{jpg,mp4}
// then MERGES the new ids into example-assets.ts + example-videos.ts.
//
//   cd web && node scripts/gen-trending-examples.mjs
//
// Needs a valid GROK_API_KEY (.env / .env.local / .env.production).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
const MASCOT_B64 = readFileSync(resolve("public/mascot.jpg")).toString("base64");
const REF = `data:image/jpeg;base64,${MASCOT_B64}`;
const IDENTITY =
  "Create a new image of this EXACT same character — the fluffy white Pomeranian " +
  "mascot (same fluffy white fur, big round dark eyes, black collar with a small " +
  "gold bell). Keep it cute and on-model. New scene/style: ";

// still = full scene for the anchor frame · motion = i2v movement description
const TRENDING = {
  "cutie-dance":        { still: "mid cute idol-dance pose in a bright pastel studio, one paw raised in a heart gesture, hand-drawn crayon hearts and stars floating around, bright anime-adjacent lighting", motion: "does a cute idol dance — light side-steps, paw hearts, a little spin and an ending wink — while crayon hearts and stars pop to the beat" },
  "glow-up":            { still: "dramatic glow-up reveal moment, a sweep of golden sparkles crossing the frame, half soft-plain half radiant-hero lighting, rim light and wind in the fur", motion: "a sparkle light-wipe sweeps across and the pet transforms from plain to a radiant hero version, fur blowing, slow-mo hero pose" },
  "runway-fashion":     { still: "strutting a fashion runway in a tiny stylish outfit, seamless pastel backdrop, editorial studio lighting, camera-flash bokeh", motion: "struts down the runway toward the camera with confident hip sway, then a pose-and-turn as camera flashes sparkle" },
  "pov-talk":           { still: "front-camera selfie framing, looking straight into the lens with a bright expression, cozy softly-blurred room behind, natural light", motion: "talks animatedly straight into the lens with expressive head tilts and blinks, cozy selfie vibe, a small crayon speech bubble pops in" },
  "tiny-mukbang":       { still: "sitting at a miniature table with cute bite-size food, macro close-up, shallow depth of field, soft warm kitchen light", motion: "takes tiny happy bites, cheeks puffing, satisfied little reactions, small hearts popping when it enjoys a bite" },
  "retro-anime-op":     { still: "90s retro anime cel style with subtle VHS grain, city-pop sunset palette, dramatic hero framing with speed lines", motion: "wind-blown hero shot with anime speed lines and gentle VHS flicker, slow pan up to a determined look, retro opening-title energy" },
  "phonk-flex":         { still: "low hero angle with dramatic high-contrast teal-and-amber grade, strong rim light, cool confident expression", motion: "slow-motion swagger toward the camera with subtle speed-ramps, breeze in the fur, punchy confident phonk-edit energy" },
  "spooky-cute-costume":{ still: "wearing an adorable pumpkin costume in a pumpkin patch at dusk, jack-o-lanterns glowing warmly, playful Halloween mood", motion: "does a playful spin showing off the pumpkin costume while jack-o-lanterns flicker and a few leaves drift by" },
  "hanbok-harvest-moon":{ still: "wearing a colorful miniature hanbok under a huge golden full moon, warm Chuseok night, lanterns in the background", motion: "makes a gentle bow-and-wish under the full moon, hanbok ribbons fluttering softly, moonlight shimmering" },
  "cozy-snow-day":      { still: "in a tiny knit sweater by a frosty window with falling snow outside, a mug of hot cocoa steaming beside, warm cozy light", motion: "watches the falling snow with a cozy blink, breath fogging slightly, cocoa steam curling upward" },
  "duet-dance":         { still: "split-screen with its mirrored twin, both mid synchronized dance pose, clean pastel stage lighting", motion: "dances in perfect sync with its mirrored twin, matching side-steps and paw waves, split-screen duet energy" },
  "glow-up-timelapse":  { still: "celebratory growth-montage framing from tiny baby to grand adult, golden confetti and sparkles, triumphant warm light", motion: "quick match-cuts of growing from a tiny baby to a grand adult, ending in a proud pose with golden confetti" },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function genStill(id, scene) {
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: "grok-imagine-image", prompt: IDENTITY + scene, reference_image_url: REF, n: 1, response_format: "url" }),
  });
  if (!res.ok) throw new Error(`still ${id} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const d = await res.json();
  const url = d.data?.[0]?.url;
  let buf;
  if (url) buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  else if (d.data?.[0]?.b64_json) buf = Buffer.from(d.data[0].b64_json, "base64");
  else throw new Error(`still ${id}: no image in response`);
  writeFileSync(resolve("public/studio_examples", `${id}.jpg`), buf);
  return buf;
}

async function genVideo(id, motion, stillBuf) {
  void stillBuf;
  const imageUrl = `https://app.myaipet.ai/studio_examples/${id}.jpg`;
  const res = await fetch("https://api.x.ai/v1/videos/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: "grok-imagine-video", prompt: motion, duration: 5, aspect_ratio: "16:9", resolution: "720p", image_url: imageUrl }),
  });
  if (!res.ok) throw new Error(`video ${id} submit ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const d = await res.json();
  const reqId = d.request_id || d.id;
  if (!reqId) throw new Error(`video ${id}: no request_id`);
  const end = Date.now() + 480_000;
  while (Date.now() < end) {
    await sleep(6000);
    const pr = await fetch(`https://api.x.ai/v1/videos/${reqId}`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!pr.ok) continue;
    const pd = await pr.json();
    const st = (pd.status || "").toLowerCase();
    const vurl = pd.video_url || pd.url || pd.output?.url || pd.data?.[0]?.url;
    if (vurl) {
      const vbuf = Buffer.from(await (await fetch(vurl)).arrayBuffer());
      writeFileSync(resolve("public/studio_examples", `${id}.mp4`), vbuf);
      return true;
    }
    if (st.includes("fail") || st.includes("error")) throw new Error(`video ${id}: ${st}`);
  }
  throw new Error(`video ${id}: poll timeout`);
}

function mergeMap(file, entries, ext) {
  const p = resolve("src/lib/studio", file);
  let src = readFileSync(p, "utf8");
  for (const id of entries) {
    if (src.includes(`"${id}"`)) continue;
    src = src.replace(/(\n\};)/, `\n  "${id}": "/studio_examples/${id}.${ext}",$1`);
  }
  writeFileSync(p, src);
}

const done = [], failed = [];
for (const [id, t] of Object.entries(TRENDING)) {
  try {
    process.stdout.write(`▶ ${id} … still `);
    const jpgPath = resolve("public/studio_examples", `${id}.jpg`);
    let still;
    if (existsSync(jpgPath)) { still = readFileSync(jpgPath); process.stdout.write("(cached) "); }
    else still = await genStill(id, t.still);
    process.stdout.write("✓ video ");
    if (existsSync(resolve("public/studio_examples", `${id}.mp4`))) { console.log("(cached) ✓"); done.push(id); continue; }
    await genVideo(id, t.motion, still);
    console.log("✓");
    done.push(id);
  } catch (e) {
    console.log(`✗ ${e.message}`);
    failed.push(id);
  }
}
mergeMap("example-assets.ts", done, "jpg");
mergeMap("example-videos.ts", done, "mp4");
console.log(`\nDONE ok=${done.length} fail=${failed.length}${failed.length ? " → " + failed.join(",") : ""}`);

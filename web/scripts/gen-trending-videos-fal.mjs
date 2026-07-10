// Videos-only: animate the 12 trending example stills via fal kling i2v
// (the SAME infra production Studio generations run on — known-working).
//   cd web && node scripts/gen-trending-videos-fal.mjs
// Needs FAL_API_KEY (.env.production on EC2). ~$0.35-0.45/clip.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadKey() {
  for (const f of [".env.production", ".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*FAL_API_KEY\s*=\s*(.+)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("FAL_API_KEY not found");
}
const KEY = loadKey();
const MODEL = "fal-ai/kling-video/v1.6/standard/image-to-video";
const APP = "https://app.myaipet.ai";

const MOTIONS = {
  "cutie-dance": "the fluffy white pomeranian does a cute idol dance — light side-steps, paw hearts, a little spin and an ending wink — while crayon hearts and stars pop to the beat, bright pastel studio",
  "glow-up": "a sparkle light-wipe sweeps across and the fluffy white pomeranian transforms from plain to a radiant hero version, fur blowing in the wind, slow-motion hero pose, golden sparkles",
  "runway-fashion": "the fluffy white pomeranian struts down the fashion runway toward the camera with confident sway, then a pose-and-turn as camera flashes sparkle, editorial lighting",
  "pov-talk": "the fluffy white pomeranian talks animatedly straight into the lens with expressive head tilts and blinks, cozy selfie vibe, warm natural light",
  "tiny-mukbang": "the fluffy white pomeranian takes tiny happy bites of the miniature food, cheeks puffing, satisfied little reactions, small hearts popping, macro close-up",
  "retro-anime-op": "wind-blown retro anime hero shot of the fluffy white pomeranian, anime speed lines and gentle VHS flicker, slow pan up to a determined look, city-pop sunset",
  "phonk-flex": "slow-motion swagger of the fluffy white pomeranian toward the camera with subtle speed-ramps, breeze in the fur, dramatic teal-and-amber rim light",
  "spooky-cute-costume": "the fluffy white pomeranian in a pumpkin costume does a playful spin while jack-o-lanterns flicker warmly and autumn leaves drift by at dusk",
  "hanbok-harvest-moon": "the fluffy white pomeranian in a colorful hanbok makes a gentle bow-and-wish under the huge golden full moon, ribbons fluttering softly, lantern glow",
  "cozy-snow-day": "the fluffy white pomeranian in a knit sweater watches falling snow through a frosty window with a cozy blink, cocoa steam curling upward, warm light",
  "duet-dance": "the fluffy white pomeranian dances in perfect sync with its mirrored twin, matching side-steps and paw waves, clean pastel stage, split-screen duet energy",
  "glow-up-timelapse": "the fluffy white pomeranian grows from tiny puppy to grand fluffy adult in quick celebratory cuts, ending in a proud pose with golden confetti falling",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gen(id, motion) {
  const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
    body: JSON.stringify({ prompt: motion, image_url: `${APP}/studio_examples/${id}.jpg`, duration: "5", aspect_ratio: "16:9" }),
  });
  if (!submit.ok) throw new Error(`submit ${submit.status}: ${(await submit.text()).slice(0, 160)}`);
  const { request_id } = await submit.json();
  if (!request_id) throw new Error("no request_id");
  const end = Date.now() + 600_000;
  while (Date.now() < end) {
    await sleep(10_000);
    const sRes = await fetch(`https://queue.fal.run/${MODEL}/requests/${request_id}/status`, { headers: { Authorization: `Key ${KEY}` } });
    if (!sRes.ok) continue;
    const s = await sRes.json();
    if (s.status === "COMPLETED") {
      const rRes = await fetch(`https://queue.fal.run/${MODEL}/requests/${request_id}`, { headers: { Authorization: `Key ${KEY}` } });
      const r = await rRes.json();
      const vurl = r.video?.url || r.output?.video?.url || r.url;
      if (!vurl) throw new Error("completed but no video url: " + JSON.stringify(r).slice(0, 200));
      const buf = Buffer.from(await (await fetch(vurl)).arrayBuffer());
      writeFileSync(resolve("public/studio_examples", `${id}.mp4`), buf);
      return buf.length;
    }
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error("fal status " + s.status);
  }
  throw new Error("poll timeout");
}

const done = [], failed = [];
for (const [id, motion] of Object.entries(MOTIONS)) {
  if (existsSync(resolve("public/studio_examples", `${id}.mp4`))) { console.log(`▶ ${id} (cached) ✓`); done.push(id); continue; }
  try {
    process.stdout.write(`▶ ${id} … `);
    const bytes = await gen(id, motion);
    console.log(`✓ ${(bytes / 1024 / 1024).toFixed(1)}MB`);
    done.push(id);
  } catch (e) { console.log(`✗ ${e.message}`); failed.push(id); }
}
console.log(`\nDONE ok=${done.length} fail=${failed.length}${failed.length ? " → " + failed.join(",") : ""}`);

// Records hs-promo.html (Health Saviors launch reel, self-playing ~41.4s).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.OUT_DIR || "/tmp/hs-promo-rec";
mkdirSync(OUT, { recursive: true });

// Record at 2x (2560x1440) — the stage auto-fits via --s, so every pixel is
// supersampled; the encode step downscales to a crisp 1080p.
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 2560, height: 1440 },
  recordVideo: { dir: OUT, size: { width: 2560, height: 1440 } },
});
const page = await ctx.newPage();
await page.goto("http://localhost:8791/hs-promo.html", { waitUntil: "load" });
await page.waitForTimeout(34800); // tightened timeline (33.6s) + tail
const v = page.video();
await ctx.close();
console.log("VIDEO:" + (await v.path()));
await browser.close();

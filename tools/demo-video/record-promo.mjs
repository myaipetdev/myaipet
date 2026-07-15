// Record the product-demo sizzle reel (HTML animation) to a real video file
// via Playwright's built-in page video recording (1280x720, one full ~34s loop).
import { chromium } from "playwright";

const OUT_DIR = process.env.OUT_DIR || "/tmp/promo-rec";
const URL = process.env.DEMO_URL || "http://localhost:8791/product-demo.html";
const MS = Number(process.env.RECORD_MS || 37000);

// GPU-backed headless: WebGL scenes (Grand Paw diorama) render black or
// crash the default software-GL headless — Metal ANGLE fixes it on macOS
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT_DIR, size: { width: W, height: H } },
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "load" });
// let the full sequence play (recording is wall-clock)
await page.waitForTimeout(MS);
const video = page.video();
await ctx.close(); // flushes the video file
const path = await video.path();
console.log("VIDEO:" + path);
await browser.close();

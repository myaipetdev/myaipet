// Record the product-demo sizzle reel (HTML animation) to a real video file
// via Playwright's built-in page video recording (1280x720, one full ~34s loop).
import { chromium } from "playwright";

const OUT_DIR = process.env.OUT_DIR || "/tmp/promo-rec";
const URL = process.env.DEMO_URL || "http://localhost:8791/product-demo.html";
const MS = Number(process.env.RECORD_MS || 37000);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
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

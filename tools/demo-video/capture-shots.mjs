// Capture REAL product screens for the promo v2 (relative assets in ./shots)
// Shoots PRODUCTION (prod is the source of truth; home + /studio are public).
// fileURLToPath (not URL.pathname) — the repo path has Korean chars + a space,
// and .pathname returns them percent-encoded, silently writing to a bogus dir.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./shots/", import.meta.url));
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 1) Studio top (hero + subject + styles)
await page.goto("https://app.myaipet.ai/studio", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: DIR + "studio-top.jpg", type: "jpeg", quality: 82 });

// 2) Studio templates grid (real art cards)
const t = await page.locator("text=Cutie idol dance").first();
await t.scrollIntoViewIfNeeded();
await page.mouse.wheel(0, -80);
await page.waitForTimeout(1800);
await page.screenshot({ path: DIR + "studio-templates.jpg", type: "jpeg", quality: 82 });

// 3) Home hero
await page.goto("https://app.myaipet.ai/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: DIR + "home-hero.jpg", type: "jpeg", quality: 82 });

// 4) PetClaw cinematic hero (final state) — the product's PetClaw masthead
await page.goto("http://localhost:8791/petclaw-hero.html", { waitUntil: "load" });
await page.waitForTimeout(9000);
await page.screenshot({ path: DIR + "petclaw-hero.jpg", type: "jpeg", quality: 82 });

await browser.close();
console.log("shots done");

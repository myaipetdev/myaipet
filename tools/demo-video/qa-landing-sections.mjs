import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./qa-landing-sec/", import.meta.url));
mkdirSync(DIR, { recursive: true });
const URL_ = "http://localhost:8795/index.html";
const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=metal"] });

const sections = ["hero", "journey", "skillsShowcase", "companion", "community", "sovereignty", "demo", "protocol", "coreloop", "roadmap", "playground"];

async function run(label, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  // trigger all reveals by scrolling to bottom slowly then top
  const H = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += Math.round(viewport.height * 0.6)) {
    await page.mouse.wheel(0, Math.round(viewport.height * 0.6));
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(500);
  // hero (top)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}${label}-hero.jpg`, type: "jpeg", quality: 82 });
  for (const id of sections.slice(1)) {
    const el = await page.$(`#${id}`);
    if (!el) { console.log("MISSING section", id); continue; }
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}${label}-${id}.jpg`, type: "jpeg", quality: 82 });
  }
  // footer
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}${label}-footer.jpg`, type: "jpeg", quality: 82 });
  await page.close();
}

await run("d", { width: 1440, height: 900 });
await run("m", { width: 390, height: 844 });
await browser.close();
console.log("DONE");

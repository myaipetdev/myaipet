import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./qa-landing-r3/", import.meta.url));
mkdirSync(DIR, { recursive: true });
const URL_ = "http://localhost:8795/index.html";

const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=metal"] });

async function run(label, viewport) {
  const consoleErrs = [];
  const netErrs = [];
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text()); });
  page.on("pageerror", (e) => consoleErrs.push("PAGEERROR: " + e.message));
  page.on("response", (r) => { if (r.status() >= 400) netErrs.push(r.status() + " " + r.url()); });

  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // total height
  const H = await page.evaluate(() => document.body.scrollHeight);
  const vh = viewport.height;
  // slow scroll with wheel so reveals fire
  let y = 0;
  const step = Math.round(vh * 0.55);
  let idx = 0;
  const shots = [];
  while (y < H) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(650);
    y += step;
    const p = `${DIR}${label}-${String(idx).padStart(2, "0")}.jpg`;
    await page.screenshot({ path: p, type: "jpeg", quality: 80 });
    shots.push(p);
    idx++;
    if (idx > 40) break;
  }
  console.log(`\n===== ${label} (${viewport.width}x${viewport.height}) H=${H} shots=${shots.length}`);
  console.log("CONSOLE ERRORS:", JSON.stringify([...new Set(consoleErrs)], null, 0));
  console.log("NET >=400:", JSON.stringify([...new Set(netErrs)], null, 0));
  await page.close();
  return shots;
}

await run("desktop", { width: 1440, height: 900 });
await run("mobile", { width: 390, height: 844 });

await browser.close();
console.log("\nDONE");

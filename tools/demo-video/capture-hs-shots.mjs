// Capture REAL Health Saviors UI states (2x) for the promo reel → shots-hs/.
// Real screens only: every jpg is an actual rendered state of the running product.
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const DIR = decodeURIComponent(new URL("./shots-hs/", import.meta.url).pathname);
mkdirSync(DIR, { recursive: true });
const TOKEN = readFileSync("/tmp/hs-demo-token.txt", "utf8").trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: "en-US",
});
await ctx.addInitScript((t) => { try { localStorage.setItem("h2e_token", t); } catch {} }, TOKEN);
const page = await ctx.newPage();
const shot = (name) => page.screenshot({ path: DIR + name + ".jpg", type: "jpeg", quality: 88 });
const wait = (ms) => page.waitForTimeout(ms);

// 1) landing hero
await page.goto("http://localhost:8899/", { waitUntil: "networkidle" });
await wait(1200); await shot("landing-hero");
// 2) app hub with coach card
await page.goto("http://localhost:3300/surveys", { waitUntil: "networkidle" });
await wait(1500); await shot("app-hub");
// 3) consent modal (fresh localStorage → modal shows). Pick the first not-yet-done
// themed survey from a preference list so re-runs keep working.
const opened = await page.evaluate(() => {
  const prefs = ["Energy patterns", "Eating habits", "Movement habits", "Hydration", "Screens", "Focus", "Connection", "Work-life"];
  for (const t of prefs) {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Start" && b.closest("div")?.parentElement?.textContent.includes(t));
    if (btn) { btn.scrollIntoView({ block: "center" }); btn.click(); return t; }
  }
  return null;
});
if (!opened) throw new Error("no available themed survey with a Start button");
console.log("opened survey:", opened);
await wait(1400); await shot("consent-modal");
// 4) runner questions (agree → questions)
await page.evaluate(() => {
  const modal = [...document.querySelectorAll(".fixed")].find((el) => el.textContent.includes("Before your first check-in"));
  if (!modal) throw new Error("consent modal not found");
  modal.querySelector("input[type=checkbox]")?.click();
});
await wait(300);
await page.evaluate(() => {
  const modal = [...document.querySelectorAll(".fixed")].find((el) => el.textContent.includes("Before your first check-in"));
  [...(modal?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("Agree"))?.click();
});
await wait(1100); await shot("runner");
// 5) success panel — answer every question generically, then submit (REAL submission)
await page.evaluate(() => {
  const modal = [...document.querySelectorAll(".fixed")].find((el) => el.className.includes("z-50") && el.textContent.includes("Submit"));
  if (!modal) throw new Error("runner modal not found");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  for (const r of modal.querySelectorAll("input[type=range]")) {
    setter.call(r, String(Number(r.max) || 5)); // max ≠ default → React registers it
    r.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // click the first option of every single-choice group + any Yes toggle
  const clicked = new Set();
  for (const b of modal.querySelectorAll("button")) {
    const t = b.textContent.trim();
    if (t === "Submit" || t === "✕") continue;
    const q = b.closest("div.w-full")?.querySelector("p")?.textContent || "";
    if (q && !clicked.has(q) && t !== "" ) { b.click(); clicked.add(q); }
  }
});
await wait(500);
await page.evaluate(() => {
  const modal = [...document.querySelectorAll(".fixed")].find((el) => el.className.includes("z-50") && el.textContent.includes("Submit"));
  [...(modal?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Submit")?.click();
});
await wait(1400); await shot("success");
// 6) education
await page.goto("http://localhost:3300/education", { waitUntil: "networkidle" });
await wait(1200); await shot("education");
// 7) predictions
await page.goto("http://localhost:3300/predictions", { waitUntil: "networkidle" });
await wait(1600); await shot("predictions");
// 8) enterprise hero + boundary section
await page.goto("http://localhost:8890/", { waitUntil: "load" });
await wait(1200); await shot("enterprise-hero");
await page.evaluate(() => document.querySelector(".cc")?.scrollIntoView({ block: "center" }));
await wait(900); await shot("enterprise-boundary");

await browser.close();
console.log("SHOTS OK → " + DIR);

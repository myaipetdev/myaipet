// Capture REAL saviorofhealth.app (Survey-to-Earn Health Panel) UI states → shots-sv2/.
// Live production site; zoom-2x for crisp 2x rasterization. Real screens only.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const DIR = decodeURIComponent(new URL("./shots-sv2/", import.meta.url).pathname);
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
const ctx = await browser.newContext({
  viewport: { width: 2560, height: 1440 },
  locale: "en-US",
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
});
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: DIR + name + ".jpg", type: "jpeg", quality: 90 });
const zoom2 = () => page.evaluate(() => { document.documentElement.style.zoom = "2"; });
// smooth-jump to the section whose text contains `txt`, offset px above it
const jump = (txt, offset = 90) => page.evaluate(({ txt, offset }) => {
  const el = [...document.querySelectorAll("*")].find(
    (e) => e.childElementCount <= 2 && e.textContent.trim().startsWith(txt));
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset);
  return !!el;
}, { txt, offset });

await page.goto("https://saviorofhealth.app/", { waitUntil: "networkidle" });
// styled? (unstyled = CSS blocked → abort loudly rather than capture garbage)
const styled = await page.evaluate(() => document.styleSheets.length > 0 &&
  getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)" ? true :
  [...document.styleSheets].some((ss) => { try { return ss.cssRules.length > 5; } catch { return true; } }));
if (!styled) throw new Error("STYLESHEETS DID NOT LOAD — site likely blocking this client");
await zoom2();
await wait(2600); // hero entrance animations
await shot("hero");

await jump("02 · THE MECHANICS"); await wait(1600); await shot("mechanics");
await jump("03 · THE CROWD GAME"); await wait(1600); await shot("crowd-game");

// demo deck: frame it, then interact (answer → predict)
await jump("04 · TRY IT", -300); await wait(1500); await shot("demo-card");
await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Pretty good")?.click(); });
await wait(2400); await shot("demo-predict");
await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "3–5")?.click(); });
await wait(2800); await shot("demo-reveal");

await jump("06 · PRIVACY"); await wait(1600); await shot("privacy");
await jump("08 · THE DEMAND SIDE"); await wait(1600); await shot("demand");

await browser.close();
console.log("SHOTS OK → " + DIR);

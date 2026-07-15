// saviorofhealth.app (Survey-to-Earn Health Panel) — one-take LIVE product intro (~64s).
// Records production. zoom-2x for crisp raster; real-Chrome UA (headless UA gets CSS-blocked).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/sv2-rec";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
const ctx = await browser.newContext({
  viewport: { width: 2560, height: 1440 },
  locale: "en-US",
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  recordVideo: { dir: OUT, size: { width: 2560, height: 1440 } },
});
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);

async function arm() {
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
    if (window.__tour) return;
    window.__tour = true;
    const bar = document.createElement("div");
    bar.id = "__cap";
    bar.style.cssText =
      "position:fixed;left:50%;bottom:36px;transform:translateX(-50%) translateY(8px);z-index:2147483647;" +
      "max-width:800px;padding:13px 22px;border-radius:999px;background:rgba(8,18,11,.94);color:#d9fbe8;" +
      "font:600 17px/1.35 -apple-system,'Segoe UI',sans-serif;text-align:center;border:1px solid rgba(46,230,160,.3);" +
      "box-shadow:0 18px 40px -18px rgba(0,0,0,.75);opacity:0;transition:opacity .45s ease, transform .45s ease;pointer-events:none";
    document.body.appendChild(bar);
    window.__setCap = (t) => {
      const b = document.getElementById("__cap");
      if (!t) { b.style.opacity = "0"; b.style.transform = "translateX(-50%) translateY(8px)"; return; }
      b.style.opacity = "0";
      setTimeout(() => { b.textContent = t; b.style.opacity = "1"; b.style.transform = "translateX(-50%) translateY(0)"; }, 240);
    };
    // glide to the section whose leading text matches `txt` (offset px above)
    window.__glideTo = (txt, offset = 80, ms = 1600) => new Promise((res) => {
      const el = [...document.querySelectorAll("*")].find(
        (e) => e.childElementCount <= 2 && e.textContent.trim().startsWith(txt));
      if (!el) return res(false);
      const target = el.getBoundingClientRect().top + window.scrollY - offset;
      const y0 = window.scrollY, d = target - y0, t0 = performance.now();
      const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
      (function step(now) {
        const p = Math.min(1, (now - t0) / ms);
        window.scrollTo(0, y0 + d * ease(p));
        if (p < 1) requestAnimationFrame(step); else res(true);
      })(t0);
    });
    const veil = document.createElement("div");
    veil.id = "__veil";
    veil.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:#050a06;opacity:0;transition:opacity .4s ease;pointer-events:none";
    document.body.appendChild(veil);
    window.__veil = (on) => { document.getElementById("__veil").style.opacity = on ? "1" : "0"; };
  });
}
const cap = (t) => page.evaluate((x) => window.__setCap(x), t);
const glideTo = (txt, offset, ms) => page.evaluate(({ txt, offset, ms }) => window.__glideTo(txt, offset, ms), { txt, offset, ms });
const clickText = (t) => page.evaluate((t) => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
  if (b) b.click(); return !!b;
}, t);

// ── open (hero entrance) ──
await page.goto("https://saviorofhealth.app/", { waitUntil: "networkidle" });
await arm();
await wait(2400); // hero entrance animation
await cap("saviorofhealth — the survey-to-earn health panel");
await wait(2400);
await cap("Answer quick health questions. Then guess how everyone else answered.");
await wait(2400);

// ── mechanics ──
await glideTo("02 · THE MECHANICS", 70, 1700);
await cap("Four ways to play — surveys, the deck, goals, care team");
await wait(2800);

// ── crowd game ──
await glideTo("03 · THE CROWD GAME", 70, 1600);
await cap("The better you read the crowd, the more you earn — up to ×2");
await wait(2900);

// ── LIVE demo deck (real interaction) ──
await glideTo("04 · TRY IT", -300, 1600);
await cap("Try it — tap through a live deck");
await wait(2000);
await clickText("Pretty good");            // answer the check-in
await wait(2600);
await cap("Now predict how the crowd answered…");
await clickText("3–5");                    // the meta-prediction
await wait(3000);
await cap("Accuracy pays — Heal Points land instantly");
await wait(2600);

// ── privacy ──
await glideTo("06 · PRIVACY", 70, 1700);
await cap("Aggregates only · k-anonymity · zero raw data ever sold");
await wait(3000);

// ── demand side ──
await glideTo("08 · THE DEMAND SIDE", 70, 1600);
await cap("Clinics, researchers and brands fund the rewards — licensing only the aggregate");
await wait(3200);

// ── outro: back to the top CTA ──
await page.evaluate(() => new Promise((res) => {
  const y0 = window.scrollY, t0 = performance.now(), ms = 1800;
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  (function step(now) {
    const p = Math.min(1, (now - t0) / ms);
    window.scrollTo(0, y0 * (1 - ease(p)));
    if (p < 1) requestAnimationFrame(step); else res();
  })(t0);
}));
await cap("saviorofhealth.app — connect & start earning");
await wait(2600);
await page.evaluate(() => window.__veil(true));
await wait(600);

const v = page.video();
await ctx.close();
console.log("VIDEO:" + (await v.path()));
await browser.close();

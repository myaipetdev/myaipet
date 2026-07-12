// ONE continuous REAL product demo — drives app.myaipet.ai (production) like a
// human: smooth rAF scrolling, natural cursor, real hovers/clicks/typing, with
// an injected editorial caption bar narrating each beat. ~60s, 1280x720.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/realdemo-rec";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);

// ── injected helpers: caption bar + smooth scroll (per document) ──
async function arm() {
  await page.evaluate(() => {
    if (window.__tour) return;
    window.__tour = true;
    const bar = document.createElement("div");
    bar.id = "__cap";
    bar.style.cssText =
      "position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(8px);z-index:2147483647;" +
      "max-width:760px;padding:13px 22px;border-radius:999px;background:rgba(33,26,18,.92);color:#FCE9CF;" +
      "font:600 17px/1.35 -apple-system,'Hanken Grotesk',sans-serif;letter-spacing:-.01em;text-align:center;" +
      "box-shadow:0 18px 40px -18px rgba(0,0,0,.6);opacity:0;transition:opacity .45s ease, transform .45s ease;pointer-events:none";
    document.body.appendChild(bar);
    window.__setCap = (t) => {
      const b = document.getElementById("__cap");
      if (!t) { b.style.opacity = "0"; b.style.transform = "translateX(-50%) translateY(8px)"; return; }
      b.style.opacity = "0";
      setTimeout(() => { b.textContent = t; b.style.opacity = "1"; b.style.transform = "translateX(-50%) translateY(0)"; }, 240);
    };
    window.__glide = (dy, ms) => new Promise((res) => {
      const y0 = window.scrollY, t0 = performance.now();
      const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
      (function step(now) {
        const p = Math.min(1, (now - t0) / ms);
        window.scrollTo(0, y0 + dy * ease(p));
        if (p < 1) requestAnimationFrame(step); else res();
      })(t0);
    });
    // scene-transition veil (fade to warm paper, covers page loads)
    const veil = document.createElement("div");
    veil.id = "__veil";
    veil.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:#211A12;opacity:0;transition:opacity .38s ease;pointer-events:none";
    document.body.appendChild(veil);
    window.__veil = (on) => { document.getElementById("__veil").style.opacity = on ? "1" : "0"; };
  });
}
const cap = (t) => page.evaluate((x) => window.__setCap(x), t);
const glide = (dy, ms) => page.evaluate(({ dy, ms }) => window.__glide(dy, ms), { dy, ms });
// smooth scene change: fade out → goto → arm → fade in
async function scene(url, opts = {}) {
  await page.evaluate(() => window.__veil && window.__veil(true)).catch(() => {});
  await wait(420);
  await page.goto(url, { waitUntil: opts.waitUntil || "networkidle" });
  await arm();
  await page.evaluate(() => window.__veil(true)); // start covered
  await wait(80);
  await page.evaluate(() => window.__veil(false));
  await wait(420);
}

// ════ 1 · APP HOME (production) ════
await page.goto("https://app.myaipet.ai/", { waitUntil: "networkidle" });
await arm();
await wait(600);
await cap("MY AI PET — an AI companion that's truly yours");
await wait(1900);
await glide(560, 1500); await wait(400);
await cap("It remembers you, grows with you — across every surface");
await glide(620, 1700); await wait(600);

// ════ 2 · STUDIO (real client-side flow) ════
await scene("https://app.myaipet.ai/studio");
await wait(700);
await cap("Studio — turn your pet into viral video");
await wait(1600);
// glide down to templates
const cutie = page.locator("text=Cutie idol dance").first();
await cutie.scrollIntoViewIfNeeded(); // coarse
await page.evaluate(() => window.scrollBy(0, -140));
await wait(400);
await cap("One-tap templates — hover to preview the real clip");
await cutie.hover();
await wait(4200); // the real mp4 plays in-card
const hanbok = page.locator("text=Hanbok full moon").first();
if (await hanbok.count()) { await hanbok.hover().catch(() => {}); await wait(2800); }
await cap("Tap once — a full cinematic prompt, ready to shoot");
await cutie.click();
await wait(1500);
// show the filled prompt + Director
const dir = page.locator("text=DIRECTOR").first();
await dir.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -150));
await wait(700);
await cap("Or tell the Director your idea — it asks, then writes the script");
const idea = page.locator('input[placeholder*="One-line idea"]').first();
await idea.click();
await idea.pressSequentially("Mochi drives a supercar to work — CEO morning vlog", { delay: 42 });
await wait(1800);

// ════ 3 · PETCLAW cinematic (the product's own masthead) ════
await scene("http://localhost:8791/petclaw-hero.html", { waitUntil: "load" });
await cap("PetClaw — your pet becomes an agent, everywhere you work");
await wait(6800); // boot sequence + chips
await cap("Telegram · Discord · Claude · Cursor — one soul, every surface");
await wait(3600);

// ════ 4 · OUTRO on the landing journey ════
await scene("https://myaipet.ai/", { waitUntil: "domcontentloaded" });
await wait(600);
await cap("Adopt yours — myaipet.ai");
await glide(520, 1500);
await wait(2200);
await page.evaluate(() => window.__veil(true)).catch(() => {});
await wait(500);

const v = page.video();
await ctx.close();
console.log("VIDEO:" + (await v.path()));
await browser.close();

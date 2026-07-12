// FULL one-take real product demo — production app.myaipet.ai incl. the new
// guest tour mode (?tour=1): My Pet demo → Pet Square walk → World Cup bracket
// → Studio real flow → PetClaw cinematic → landing outro. ~83s, 1280x720.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/fulldemo-rec";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);

async function arm() {
  await page.evaluate(() => {
    if (window.__tourKit) return;
    window.__tourKit = true;
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
async function scene(url, opts = {}) {
  await page.evaluate(() => window.__veil && window.__veil(true)).catch(() => {});
  await wait(420);
  await page.goto(url, { waitUntil: opts.waitUntil || "networkidle" });
  await arm();
  await page.evaluate(() => window.__veil(true));
  await wait(80);
  await page.evaluate(() => window.__veil(false));
  await wait(420);
}
async function walk(key, ms) {
  await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key);
}

// ════ 1 · APP HOME ════
await page.goto("https://app.myaipet.ai/", { waitUntil: "networkidle" });
await arm();
await wait(600);
await cap("MY AI PET — an AI companion that's truly yours");
await wait(1900);
await glide(560, 1500); await wait(400);
await cap("It remembers you, grows with you — across every surface");
await glide(620, 1600); await wait(500);

// ════ 2 · MY PET (guest tour demo) ════
await scene("https://app.myaipet.ai/?section=my%20pet&tour=1");
await wait(1200);
await cap("Your pet lives here — a collectible with a real soul");
await wait(2400);
await glide(480, 1500); await wait(500);
await cap("Feed it, play with it — it remembers every moment");
const feed = page.locator('button:has-text("Feed")').first();
if (await feed.count()) { await feed.hover(); await wait(500); await feed.click().catch(() => {}); }
await wait(2400);
await glide(500, 1500); await wait(1400); // pond drifts by

// ════ 3 · COMMUNITY — walkable Pet Square ════
await scene("https://app.myaipet.ai/?section=community&tour=1");
await wait(1400);
await cap("The pet square — stroll among everyone's companions");
await wait(1200);
const sq = page.locator("canvas, [class*=square]").first();
if (await sq.count()) await sq.click({ position: { x: 400, y: 300 } }).catch(() => {});
await walk("ArrowRight", 1100);
await walk("ArrowUp", 800);
await walk("ArrowRight", 900);
await walk("ArrowDown", 700);
await cap("Walk up to a pet and say hi — every one is real");
await walk("ArrowRight", 1000);
await walk("ArrowUp", 600);
await wait(1600);

// ════ 4 · WORLD CUP bracket ════
await scene("https://app.myaipet.ai/?section=worldcup&tour=1");
await wait(1300);
await cap("The Favorites Bracket — vote the world's cutest companion");
await wait(2200);
await glide(520, 1600); await wait(900);
await cap("Community predictions, live podium — no bets, just love");
await glide(560, 1600); await wait(1500);

// ════ 5 · STUDIO (real client-side flow) ════
await scene("https://app.myaipet.ai/studio");
await wait(700);
await cap("Studio — turn your pet into viral video");
await wait(1500);
const cutie = page.locator("text=Cutie idol dance").first();
await cutie.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -140));
await wait(400);
await cap("One-tap templates — hover to preview the real clip");
await cutie.hover();
await wait(4200);
const hanbok = page.locator("text=Hanbok full moon").first();
if (await hanbok.count()) { await hanbok.hover().catch(() => {}); await wait(2600); }
await cap("Tap once — a full cinematic prompt, ready to shoot");
await cutie.click();
await wait(1400);
const dir = page.locator("text=DIRECTOR").first();
await dir.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -150));
await wait(600);
await cap("Or tell the Director your idea — it asks, then writes the script");
const idea = page.locator('input[placeholder*="One-line idea"]').first();
await idea.click();
await idea.pressSequentially("Mochi drives a supercar to work — CEO morning vlog", { delay: 42 });
await wait(1700);

// ════ 6 · PETCLAW cinematic ════
await scene("http://localhost:8791/petclaw-hero.html", { waitUntil: "load" });
await cap("PetClaw — your pet becomes an agent, everywhere you work");
await wait(6800);
await cap("Telegram · Discord · Claude · Cursor — one soul, every surface");
await wait(3400);

// ════ 7 · OUTRO ════
await scene("https://myaipet.ai/", { waitUntil: "domcontentloaded" });
await wait(500);
await cap("Adopt yours — myaipet.ai");
await glide(520, 1500);
await wait(2200);
await page.evaluate(() => window.__veil(true)).catch(() => {});
await wait(500);

const v = page.video();
await ctx.close();
console.log("VIDEO:" + (await v.path()));
await browser.close();

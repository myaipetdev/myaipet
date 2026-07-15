// FULL one-take real product demo — production app.myaipet.ai incl. the new
// guest tour mode (?tour=1): My Pet demo → Pet Square walk → World Cup bracket
// → Studio real flow → PetClaw cinematic → landing outro. ~85s, 1280x720.
// v2 after frame audit: fake cursor + click ripple, veil holds until content
// paints, Pet Square actually framed + played, World Cup really voted,
// template card punch-in, Studio payoff reframe, tightened holds.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/fulldemo-rec";
mkdirSync(OUT, { recursive: true });

// GPU-backed headless: WebGL scenes (Grand Paw diorama) render black or
// crash the default software-GL headless — Metal ANGLE fixes it on macOS
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);

async function arm() {
  await page.evaluate(() => {
    if (window.__tourKit) return;
    window.__tourKit = true;
    // caption pill (bottom by default, "top" for beats where content sits low)
    const bar = document.createElement("div");
    bar.id = "__cap";
    bar.style.cssText =
      "position:fixed;left:50%;bottom:30px;transform:translateX(-50%) translateY(8px);z-index:2147483647;" +
      "max-width:760px;padding:13px 22px;border-radius:999px;background:rgba(33,26,18,.92);color:#FCE9CF;" +
      "font:600 17px/1.35 -apple-system,'Hanken Grotesk',sans-serif;letter-spacing:-.01em;text-align:center;" +
      "box-shadow:0 18px 40px -18px rgba(0,0,0,.6);opacity:0;transition:opacity .45s ease, transform .45s ease;pointer-events:none";
    document.body.appendChild(bar);
    window.__setCap = (t, pos) => {
      const b = document.getElementById("__cap");
      if (pos === "top") { b.style.bottom = "auto"; b.style.top = "26px"; }
      else { b.style.top = "auto"; b.style.bottom = "30px"; }
      if (!t) { b.style.opacity = "0"; return; }
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
    window.__veil = (on, instant) => {
      const v = document.getElementById("__veil");
      if (instant) { v.style.transition = "none"; v.style.opacity = on ? "1" : "0"; void v.offsetWidth; v.style.transition = "opacity .38s ease"; }
      else v.style.opacity = on ? "1" : "0";
    };
    // fake cursor + click ripple (Playwright emits real mouse events; no OS cursor is recorded)
    const dot = document.createElement("div");
    dot.id = "__cur";
    dot.style.cssText =
      "position:fixed;width:20px;height:20px;border-radius:50%;background:rgba(33,26,18,.78);" +
      "border:2.5px solid #FCE9CF;box-shadow:0 2px 10px rgba(0,0,0,.45);z-index:2147483647;" +
      "pointer-events:none;opacity:0;transition:opacity .3s ease;margin:-10px 0 0 -10px;left:-40px;top:-40px";
    document.body.appendChild(dot);
    window.addEventListener("mousemove", (e) => {
      dot.style.opacity = "1"; dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px";
    }, true);
    window.addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.style.cssText =
        `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:14px;height:14px;margin:-7px 0 0 -7px;` +
        "border-radius:50%;border:3px solid #E8C77E;z-index:2147483647;pointer-events:none;opacity:.95;" +
        "transition:transform .55s ease, opacity .55s ease;transform:scale(1)";
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(4.2)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 700);
    }, true);
  });
}
const cap = (t, pos) => page.evaluate(({ t, pos }) => window.__setCap(t, pos), { t, pos });
const glide = (dy, ms) => page.evaluate(({ dy, ms }) => window.__glide(dy, ms), { dy, ms });

// smooth scene change; keeps the veil up until `ready` selector has painted,
// so page loads never show as blank flashes
async function scene(url, opts = {}) {
  await page.evaluate(() => { if (window.__setCap) window.__setCap(null); if (window.__veil) window.__veil(true); }).catch(() => {});
  await wait(420);
  await page.goto(url, { waitUntil: opts.waitUntil || "domcontentloaded" });
  await arm();
  await page.evaluate(() => window.__veil(true, true)); // stay covered
  if (opts.ready) await page.locator(opts.ready).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await wait(350); // paint settle under the veil
  await page.evaluate(() => window.__veil(false));
  await wait(420);
}
// in-app section change via the real nav (client-side setSection — NO page
// reload, so no white flash and all injected overlays survive)
async function sceneNav(label, ready) {
  await page.evaluate(() => { window.__setCap(null); window.__veil(true); });
  await wait(420);
  await page.locator(`button.nav-btn:has-text("${label}")`).first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  if (ready) await page.locator(ready).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await wait(350);
  await page.evaluate(() => window.__veil(false));
  await wait(420);
}
async function walk(key, ms) {
  await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key);
}
// camera punch-in: scale the whole template GRID from the hovered card's
// center (the grid container is stable across React re-renders of one card,
// unlike the card itself, whose inline styles get wiped when the hover video mounts)
async function punch(locator, on) {
  await locator.evaluate((el, on) => {
    const cardRect = el.getBoundingClientRect();
    let grid = el;
    while (grid.parentElement && grid.getBoundingClientRect().width < 700) grid = grid.parentElement;
    const g = grid.getBoundingClientRect();
    const ox = cardRect.left + cardRect.width / 2 - g.left;
    const oy = cardRect.top + cardRect.height / 2 - g.top;
    grid.style.transition = "transform .8s cubic-bezier(.22,.9,.3,1)";
    grid.style.transformOrigin = `${ox}px ${oy}px`;
    grid.style.transform = on ? "scale(1.24)" : "";
  }, on).catch(() => {});
}

// ════ 1 · APP HOME ════
await page.goto("https://app.myaipet.ai/?tour=1", { waitUntil: "domcontentloaded" });
await arm();
await page.evaluate(() => {
  window.__veil(true, true); // cover the initial paint
  try { window.sessionStorage.setItem("aipet_tour", "1"); } catch {} // deterministic tour seed
});
await page.locator("text=Your AI.").first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
await wait(600);
await page.evaluate(() => window.__veil(false)); // open on a clean fade-in
await wait(500);
await cap("MY AI PET — an AI companion that's truly yours");
await wait(1700);
await glide(560, 1500); await wait(300);
await cap("It remembers you, grows with you — across every surface");
await glide(620, 1600); await wait(400);

// ════ 2 · MY PET (guest tour demo) ════
await sceneNav("My Pet", "text=DEMO");
await wait(800);
await cap("Your pet lives here — a collectible with a real soul");
await wait(2200);
await glide(480, 1500); await wait(400);
await cap("Feed it, play with it — it remembers every moment");
const feed = page.locator('button:has-text("Feed")').first();
if (await feed.count()) { await feed.hover(); await wait(600); await feed.click().catch(() => {}); }
await wait(2000);
await glide(500, 1500); await wait(1200); // pond drifts by

// ════ 3 · COMMUNITY — walkable Pet Square (framed + actually played) ════
await sceneNav("Community", '[aria-label="Walkable community pet square"]');
const square = page.locator('[aria-label="Walkable community pet square"]').first();
await square.scrollIntoViewIfNeeded();
await page.evaluate(() => { // center the square vertically in the viewport
  const el = document.querySelector('[aria-label="Walkable community pet square"]');
  if (el) { const r = el.getBoundingClientRect(); window.scrollBy({ top: r.top - (window.innerHeight - r.height) / 2 - 20, behavior: "instant" }); }
});
await wait(600);
await cap("The pet square — stroll among everyone's companions");
await square.click({ position: { x: 500, y: 260 } }).catch(() => {}); // focus + click-to-walk
await wait(900);
await walk("ArrowRight", 1100);
await walk("ArrowUp", 700);
await walk("ArrowRight", 1000);
await cap("Walk up to a pet and press E to say hi — every one is real");
await walk("ArrowRight", 900);
await walk("ArrowDown", 600);
await page.keyboard.press("e"); // opens the say-hi dialog if near a pet
await wait(1800);

// ════ 4 · WORLD CUP bracket — cast a real pick ════
await sceneNav("Bracket", "button.wc-pick");
const picks = page.locator("button.wc-pick");
await picks.first().scrollIntoViewIfNeeded().catch(() => {});
await page.evaluate(() => window.scrollBy(0, -80));
await wait(500);
await cap("The Favorites Bracket — tap the one you love");
await wait(1100);
await picks.first().hover().catch(() => {});
await wait(450);
await picks.first().click().catch(() => {}); // pick pop animation + next matchup
await wait(1700);
await picks.nth(1).hover().catch(() => {});
await wait(400);
await picks.nth(1).click().catch(() => {}); // second vote for momentum
await wait(1500);
const predict = page.locator("#wc-predict").first();
if (await predict.count()) {
  await predict.scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => window.scrollBy(0, -60));
  await wait(500);
  await cap("Community predictions, live podium — no bets, just love");
  await wait(2000);
}

// ════ 5 · AGENT OFFICE — The Grand Paw hotel (dev build; owner-gated on prod,
// so we shoot the real shipped component on localhost with its dev fixture) ════
await scene("http://localhost:3000/", { ready: "text=Your AI." });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // hide the dev-tools badge
await page.evaluate(() => { window.__setCap(null); window.__veil(true); });
await wait(420);
await page.locator('button.nav-btn:has-text("Agent Office")').first().click();
await page.locator("agent-cafe-3d canvas").first().waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
await wait(900); // let the diorama settle
await page.evaluate(() => window.scrollTo(0, 220));
await page.evaluate(() => window.__veil(false));
await wait(400);
await cap("The Agent Office — a grand hotel where your pet's staff works");
const dio = page.locator("agent-cafe-3d").first();
await dio.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -70));
await wait(4400); // auto-rotate does the camera work
await cap("Dispatch a goal — the right pet takes it, live");
await wait(3200);

// ════ 6 · STUDIO (real client-side flow) ════
await scene("https://app.myaipet.ai/studio", { ready: "text=Make Mochi a star" });
await wait(500);
await cap("Studio — turn your pet into viral video");
await wait(1300);
const cutie = page.locator("text=Cutie idol dance").first();
await cutie.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -140));
await wait(400);
await cap("One-tap templates — hover to preview the real clip", "top");
await cutie.hover();
await wait(700);
await punch(cutie, true); // zoom the playing card so the motion reads
await wait(3600);
await punch(cutie, false);
await wait(600);
await cap("Tap once — a full cinematic prompt, ready to shoot", "top");
await cutie.hover(); // bring the fake cursor onto the card before the click
await wait(500);
await cutie.click();
await wait(600);
// payoff: the FILLED prompt (skip the empty preview panel — nothing to show
// there until a real generation, and guests can't spend credits)
const dir = page.locator("text=DIRECTOR").first();
await dir.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -150));
await wait(1800); // hold on the filled WHAT TO MAKE + Director together
await cap(null); await wait(200);
await cap("Or tell the Director your idea — it asks, then writes the script");
const idea = page.locator('input[placeholder*="One-line idea"]').first();
await idea.click();
await idea.pressSequentially("Mochi drives a supercar to work — CEO morning vlog", { delay: 42 });
await wait(900);
await cap("Connect a wallet to shoot it for real"); // honest guest-mode close
await wait(1300);

// ════ 7 · PETCLAW cinematic ════
await scene("http://localhost:8791/petclaw-hero.html", { waitUntil: "load" });
await cap("PetClaw — your pet becomes an agent, everywhere you work");
await wait(6800);
await cap("Telegram · Discord · Claude · Cursor — one soul, every surface");
await wait(2400);

// ════ 8 · OUTRO ════
await scene("https://myaipet.ai/", { waitUntil: "domcontentloaded", ready: "text=Your AI." });
await wait(400);
await cap("Adopt yours — myaipet.ai");
await glide(520, 1500);
await wait(1800);
await cap(null);
await wait(300);
await page.evaluate(() => window.__veil(true)).catch(() => {});
await wait(500);

const v = page.video();
await ctx.close();
console.log("VIDEO:" + (await v.path()));
await browser.close();

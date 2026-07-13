// HEALTH SAVIORS — one-take product intro (~72s, 1280x720).
// Records the NEW build running locally (real screens, real DB, no mocks):
//   landing :8899 → app :3300 (/surveys coach card → live daily check-in incl. the
//   Art.9 consent modal → reward) → /education → /predictions → enterprise :8890 → outro.
// NOTE: production saviorofhealth.app still serves the OLD build; re-point the URLs
// after deploy to re-record against prod. Auth: pass TOKEN env (fresh h2e_token).
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const OUT = "/tmp/hs-rec";
mkdirSync(OUT, { recursive: true });

const TOKEN = process.env.TOKEN || readFileSync("/tmp/hs-demo-token.txt", "utf8").trim();
const APP = "http://localhost:3300";
const LANDING = "http://localhost:8899";
const ENTERPRISE = "http://localhost:8890";

// Hi-res: real 2560x1440 viewport + CSS zoom 2 injected per page (arm()), so the
// layout matches the 1280x720 design while every pixel rasterizes at 2x.
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 2560, height: 1440 },
  locale: "en-US",
  recordVideo: { dir: OUT, size: { width: 2560, height: 1440 } },
});
// Auth the app on every load. Deliberately do NOT pre-set h2e_health_consent —
// the consent modal is a trust beat we want on camera.
await ctx.addInitScript((t) => { try { localStorage.setItem("h2e_token", t); } catch {} }, TOKEN);
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);

// ── injected helpers: caption pill + smooth scroll + scene veil ──
async function arm() {
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2"; // 2x raster, 1280x720-equivalent layout
    if (window.__tour) return;
    window.__tour = true;
    const bar = document.createElement("div");
    bar.id = "__cap";
    bar.style.cssText =
      "position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(8px);z-index:2147483647;" +
      "max-width:780px;padding:13px 22px;border-radius:999px;background:rgba(9,14,20,.93);color:#d9f5e8;" +
      "font:600 17px/1.35 -apple-system,'Segoe UI',sans-serif;letter-spacing:-.01em;text-align:center;" +
      "border:1px solid rgba(52,211,153,.28);box-shadow:0 18px 40px -18px rgba(0,0,0,.7);opacity:0;" +
      "transition:opacity .45s ease, transform .45s ease;pointer-events:none";
    document.body.appendChild(bar);
    window.__setCap = (t) => {
      const b = document.getElementById("__cap");
      if (!t) { b.style.opacity = "0"; b.style.transform = "translateX(-50%) translateY(8px)"; return; }
      b.style.opacity = "0";
      setTimeout(() => { b.textContent = t; b.style.opacity = "1"; b.style.transform = "translateX(-50%) translateY(0)"; }, 240);
    };
    window.__glide = (dy, ms) => new Promise((res) => {
      const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      dy = dy * z; // keep visual travel identical under page zoom
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
      "position:fixed;inset:0;z-index:2147483646;background:#060a10;opacity:0;transition:opacity .38s ease;pointer-events:none";
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
// Set a React-controlled range input reliably (native setter + input event; values
// equal to the displayed default are ignored by React's value tracker — avoid 3).
const setRange = (idx, val) => page.evaluate(({ idx, val }) => {
  const modal = [...document.querySelectorAll(".fixed")].find((el) => el.className.includes("z-50") && el.querySelector("input[type=range]"));
  const r = modal ? [...modal.querySelectorAll("input[type=range]")][idx] : null;
  if (!r) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(r, String(val));
  r.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, { idx, val });

// ════ 1 · LANDING — the story ════
await page.goto(LANDING + "/", { waitUntil: "networkidle" });
await arm();
await wait(700);
await cap("HEALTH SAVIORS — the AI health coach that remembers you");
await wait(2200);
await glide(620, 1600);
await cap("Honest by design — zero health data sold, ever");
await wait(2100);
await glide(680, 1600);
await wait(700);

// ════ 2 · APP — the coach knows you ════
await scene(APP + "/surveys");
await wait(800);
await cap("Your coach learns you — from 30-second check-ins");
await wait(2300);
await glide(430, 1400);
await cap("18 guided check-ins — daily, weekly, and themed");
await wait(2000);

// ════ 3 · LIVE daily check-in (incl. consent modal) ════
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "Start" && b.closest("div")?.parentElement?.textContent.includes("Daily check-in"),
  );
  if (btn) { btn.scrollIntoView({ block: "center" }); btn.click(); }
});
await wait(1200);
await cap("Consent comes first — nothing is processed without it");
await wait(2300);
await page.evaluate(() => {
  const modal = [...document.querySelectorAll(".fixed")].find((el) => el.textContent.includes("Before your first check-in"));
  modal?.querySelector("input[type=checkbox]")?.click();
});
await wait(900);
await page.evaluate(() => {
  const modal = [...document.querySelectorAll(".fixed")].find((el) => el.textContent.includes("Before your first check-in"));
  const go = [...(modal?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("Agree"));
  go?.click();
});
await wait(1100);
await cap("A 30-second daily check-in");
// emoji: pick the 4th face (🙂)
await page.evaluate(() => {
  const modal = [...document.querySelectorAll(".fixed")].find((el) => el.className.includes("z-50") && el.textContent.includes("Daily check-in"));
  const emojis = [...(modal?.querySelectorAll("button") ?? [])].filter((b) => /😞|😕|😐|🙂|😄/.test(b.textContent));
  emojis[3]?.click();
});
await wait(900);
await setRange(0, 4); // energy 4/5
await wait(700);
await setRange(1, 2); // stress 2/5
await wait(700);
await page.evaluate(() => {
  const modal = [...document.querySelectorAll(".fixed")].find((el) => el.className.includes("z-50") && el.textContent.includes("Daily check-in"));
  const yes = [...(modal?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Yes");
  yes?.click();
});
await wait(900);
await page.evaluate(() => {
  const modal = [...document.querySelectorAll(".fixed")].find((el) => el.className.includes("z-50") && el.textContent.includes("Daily check-in"));
  const submit = [...(modal?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Submit");
  submit?.click();
});
await wait(1300);
await cap("…and your coach just got smarter about you");
await wait(2400); // success panel (+pts · streak) then auto-close

// ════ 4 · KNOWLEDGE ════
await scene(APP + "/education");
await wait(700);
await cap("Learn-to-earn — a cited wellness knowledge base");
await wait(2100);
await glide(360, 1200);
await wait(700);

// ════ 5 · COMMUNITY (de-gambled) ════
await scene(APP + "/predictions");
await wait(800);
await cap("Community forecasts — free, no wagers, ever");
await wait(2100);
await glide(430, 1300);
await wait(700);

// ════ 6 · ENTERPRISE ════
await scene(ENTERPRISE + "/", { waitUntil: "load" });
await wait(800);
await cap("For partners — Agentic Health Infrastructure");
await wait(2300);
await glide(760, 1600);
await cap("License the stack — or aggregate insights, never individual records");
await wait(2400);
await glide(1500, 1900);
await cap("Privacy enforced in the data layer — not in a policy PDF");
await wait(2300);

// ════ 7 · OUTRO ════
await scene(LANDING + "/");
await wait(500);
await cap("HEALTH SAVIORS — saviorofhealth.app");
await glide(420, 1500);
await wait(2000);
await page.evaluate(() => window.__veil(true)).catch(() => {});
await wait(600);

const v = page.video();
await ctx.close();
console.log("VIDEO:" + (await v.path()));
await browser.close();

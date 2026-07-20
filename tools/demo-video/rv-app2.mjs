import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/rv";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=metal"] });
const R = {};

// ---------- DEMOPET (guest, ?section=my pet, NO tour) ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("https://app.myaipet.ai/?section=my%20pet", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  R.demopetUrl = await page.evaluate(() => location.href);
  R.demopetText = await page.evaluate(() => document.body.innerText.slice(0, 600));
  // scroll down slowly so staggered reveals fire
  for (let k = 0; k < 8; k++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(350); }
  await page.screenshot({ path: `${OUT}/dp-full.jpg`, type: "jpeg", quality: 80, fullPage: false });

  R.demopet = await page.evaluate(() => {
    const t = document.body.innerText;
    const btns = [...document.querySelectorAll("button")].filter(b => /^(Feed|Play|Pet)$/.test(b.innerText.trim()));
    const occl = btns.map(b => {
      b.scrollIntoView({ block: "center" });
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const covered = el !== b && !b.contains(el) && !(el && el.contains(b));
      return { label: b.innerText.trim(), covered, coveredBy: covered && el ? ((el.className || el.tagName) + "").slice(0, 70) : null, y: Math.round(r.top), h: Math.round(r.height) };
    });
    return {
      meet: (t.match(/Meet\s+\w+/i) || [null])[0],
      name: /Mochi/.test(t) ? "Mochi" : (/Dordor/.test(t) ? "Dordor" : "none"),
      careButtons: occl,
      adoptCta: (t.match(/Adopt[^\n]{0,50}/) || [null])[0],
      bondLabel: /Bond/.test(t),
    };
  });

  // click Pet 6x to cross bond milestone (14 + 4*n >= 22 needs 2 clicks; do 4)
  const petBtn = page.locator("button", { hasText: /^Pet$/ }).first();
  if (await petBtn.count()) {
    for (let k = 0; k < 4; k++) { await petBtn.click({ timeout: 4000 }).catch(e => { R.petClickErr = String(e).slice(0, 120); }); await page.waitForTimeout(500); }
    await page.waitForTimeout(1200);
    R.afterCare = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        milestoneText: (t.match(/[^\n]*(trust|Trusted|foil|milestone)[^\n]*/i) || [null])[0],
        memory: (t.match(/You (pet|fed|played)[^\n]*/g) || []).slice(0, 3),
        adoptNow: (t.match(/Adopt[^\n]{0,50}/) || [null])[0],
      };
    });
    await page.screenshot({ path: `${OUT}/dp-after-care.jpg`, type: "jpeg", quality: 80 });
  }
  await ctx.close();
}

// ---------- STUDIO ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 150)); });
  await page.goto("https://app.myaipet.ai/studio", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/studio-top.jpg`, type: "jpeg", quality: 80 });

  R.studioTrending = await page.evaluate(() => {
    const t = document.body.innerText;
    return { trendingCount: (t.match(/trending/gi) || []).length };
  });

  // templates: find gallery items, check thumbnails + hover behavior
  R.studioTemplates = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")].filter(i => /studio|example|template|tpl/i.test(i.src) || /studio_examples/.test(i.src));
    const vids = [...document.querySelectorAll("video")];
    const broken = [...document.querySelectorAll("img")].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.split("/").pop()).slice(0, 8);
    return { exampleImgs: imgs.length, videosInDom: vids.length, brokenImgs: broken };
  });

  // hover first template with a video
  const tplCard = page.locator("[class*=tpl], [class*=template]").first();
  // fall back: hover each element that has onpointerenter — use images in template strip
  const firstTplImg = page.locator("img[src*='studio_examples'], img[src*='template']").first();
  if (await firstTplImg.count()) {
    await firstTplImg.scrollIntoViewIfNeeded();
    await firstTplImg.hover();
    await page.waitForTimeout(1500);
    R.studioHover = await page.evaluate(() => {
      const vids = [...document.querySelectorAll("video")].map(v => ({ src: (v.currentSrc || "").split("/").pop(), paused: v.paused, t: +v.currentTime.toFixed(2), visible: v.getBoundingClientRect().width > 0 }));
      return vids.filter(v => v.src).slice(0, 6);
    });
    await page.screenshot({ path: `${OUT}/studio-hover.jpg`, type: "jpeg", quality: 80 });
  } else {
    // maybe templates behind a tab — dump candidate labels
    R.studioHover = await page.evaluate(() => document.body.innerText.slice(0, 800));
  }

  // thumbnail fallback: any template cards without image → designed fallback?
  R.studioFallback = await page.evaluate(() => {
    // look for elements that are template cards: heuristic = clickable cards inside a horizontal strip containing 'trending'
    const cards = [...document.querySelectorAll("button, [role=button], div")].filter(d => d.querySelector("img[src*='studio_examples']"));
    const withImg = cards.length;
    return { cardsWithExampleImg: withImg };
  });

  // guest Direct it
  const direct = page.locator("button", { hasText: /Direct it/i }).first();
  R.directIt = { found: await direct.count() };
  if (R.directIt.found) {
    await direct.scrollIntoViewIfNeeded();
    // need an idea in the textarea first?
    const ta = page.locator("textarea").first();
    if (await ta.count()) { await ta.fill("my pet goes on an adventure"); await page.waitForTimeout(300); }
    const before = await page.evaluate(() => document.body.innerText);
    await direct.click({ timeout: 5000 }).catch(e => R.directIt.err = String(e).slice(0, 150));
    await page.waitForTimeout(1800);
    const after = await page.evaluate(() => document.body.innerText);
    R.directIt.signInFeedback = /Sign in to use the Director/i.test(after);
    R.directIt.modalOpened = after.length - before.length;
    R.directIt.newText = after.split("\n").filter(l => !before.includes(l)).slice(0, 8);
    await page.screenshot({ path: `${OUT}/studio-directit.jpg`, type: "jpeg", quality: 80 });
  }
  R.studioConsoleErrs = [...new Set(errs)].slice(0, 8);
  await ctx.close();
}

console.log(JSON.stringify(R, null, 1));
await browser.close();

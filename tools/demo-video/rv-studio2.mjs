import { chromium } from "playwright";
const OUT = "/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/rv";
const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=metal"] });
const R = {};
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("https://app.myaipet.ai/studio", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3500);

// TRENDING badge count (exact badge elements, not explainer text)
R.trendingBadges = await page.evaluate(() => {
  const spans = [...document.querySelectorAll("span")].filter(s => s.children.length === 0 && /trending/i.test(s.textContent) && s.textContent.trim().length < 20);
  return spans.map(s => s.textContent.trim());
});

// template cards inventory: video / image / mnemonic / fallback, gray voids
R.templateCards = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("button.ed-card-hover")];
  let vid = 0, img = 0, other = 0;
  const grayish = [];
  for (const c of cards) {
    if (c.querySelector("video")) vid++;
    else {
      const head = c.firstElementChild;
      const bg = head ? getComputedStyle(head).backgroundImage : "";
      if (bg && bg !== "none") img++;
      else {
        other++;
        const bgc = head ? getComputedStyle(head).backgroundColor : "";
        grayish.push({ bg: bgc, html: head ? head.innerHTML.slice(0, 120) : "" });
      }
    }
  }
  return { total: cards.length, withVideo: vid, withImageBg: img, other, otherSamples: grayish.slice(0, 3) };
});

// hover first template video card → plays?
const card = page.locator("button.ed-card-hover:has(video)").first();
if (await card.count()) {
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const before = await card.evaluate(c => { const v = c.querySelector("video"); return { paused: v.paused, t: v.currentTime, src: v.currentSrc.split("/").pop() }; });
  await card.hover();
  await page.waitForTimeout(1800);
  const after = await card.evaluate(c => { const v = c.querySelector("video"); return { paused: v.paused, t: +v.currentTime.toFixed(2), ready: v.readyState }; });
  await page.mouse.move(10, 10);
  await page.waitForTimeout(600);
  const left = await card.evaluate(c => { const v = c.querySelector("video"); return { paused: v.paused, t: v.currentTime }; });
  R.hoverPlay = { before, after, afterLeave: left };
  await page.screenshot({ path: `${OUT}/studio-tpl-hover.jpg`, type: "jpeg", quality: 80 });
}

// Direct it — diagnose then JS-click
R.directIt = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /direct it/i.test(x.innerText));
  if (!b) return "not found";
  const r = b.getBoundingClientRect();
  return { disabled: b.disabled, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, cls: b.className };
});
const direct = page.locator("button", { hasText: /Direct it/i }).first();
await direct.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(400);
await direct.click({ force: true, timeout: 5000 }).catch(e => R.directClickErr = String(e).slice(0, 120));
await page.waitForTimeout(1500);
R.directResult = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    signInMsg: (t.match(/[^\n]*Sign in to use the Director[^\n]*/i) || [null])[0],
    anySignInPrompt: (t.match(/[^\n]*sign in[^\n]*/gi) || []).slice(0, 5),
  };
});
await page.screenshot({ path: `${OUT}/studio-direct2.jpg`, type: "jpeg", quality: 80 });

console.log(JSON.stringify(R, null, 1));
await browser.close();

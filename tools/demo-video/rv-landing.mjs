import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/rv";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=metal"] });
const R = {};

// ---------- DESKTOP ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
  await page.goto("https://myaipet.ai", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);

  // hero video initial state
  R.videoInitial = await page.evaluate(() => {
    const vids = [...document.querySelectorAll("video")].map(v => ({
      src: (v.currentSrc || "").split("/").pop(), paused: v.paused, t: v.currentTime, muted: v.muted, autoplay: v.autoplay, rect: v.getBoundingClientRect().width
    }));
    return vids;
  });
  // scroll gesture then re-check
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(1200);
  R.videoAfterScroll = await page.evaluate(() =>
    [...document.querySelectorAll("video")].map(v => ({ paused: v.paused, t: v.currentTime }))
  );
  await page.screenshot({ path: `${OUT}/land-hero.jpg`, type: "jpeg", quality: 80 });

  // sections presence
  R.sections = await page.evaluate(() => ({
    journey: !!document.querySelector("#journey .journey-timeline"),
    journeyNodes: document.querySelectorAll("#journey .j-node").length,
    skillsSpecimen: !!document.querySelector("#skillsShowcase .specimen"),
    stickerChips: document.querySelectorAll("#skillsShowcase .stk-chip svg").length,
    salonFrames: document.querySelectorAll("#community .g-frame, #community .gallery > *").length,
    sovereigntyReceipts: document.querySelectorAll("#sovereignty .right-receipt").length,
    sovereigntyCards: document.querySelectorAll("#sovereignty [class*=right]").length,
  }));

  // PET WALK ANIM text
  R.petWalkAnim = await page.evaluate(() => {
    const w = document.getElementById("petWalker");
    return { text: (document.body.innerText.match(/PET\s*WALK\s*ANIM/i) || [null])[0], walkerHTML: w ? w.innerHTML.slice(0, 200) : null };
  });

  // Hangul scan
  R.hangul = await page.evaluate(() => {
    const m = document.body.innerText.match(/[ᄀ-ᇿ㄰-㆏가-힯]+/g);
    return m ? m.slice(0, 10) : [];
  });

  // orange flood: sample every <section> computed background
  R.sectionBgs = await page.evaluate(() =>
    [...document.querySelectorAll("section")].map(s => ({
      id: s.id || s.className.slice(0, 30), bg: getComputedStyle(s).backgroundColor, h: Math.round(s.getBoundingClientRect().height)
    }))
  );

  // scroll through full page slowly (fires reveals), screenshots
  const H = await page.evaluate(() => document.body.scrollHeight);
  let y = 0, i = 0;
  while (y < H && i < 20) {
    await page.mouse.wheel(0, 700); await page.waitForTimeout(450);
    y += 700;
    if (i % 2 === 0) await page.screenshot({ path: `${OUT}/land-${String(i).padStart(2, "0")}.jpg`, type: "jpeg", quality: 75 });
    i++;
  }

  // walker mirror check: sample over time to catch dir=-1
  R.walkerMirror = await page.evaluate(async () => {
    const samples = [];
    const petEls = [...document.querySelectorAll("div")].filter(d => {
      const kids = [...d.children];
      return kids.some(k => k.textContent === "Sparky");
    });
    for (let s = 0; s < 30; s++) {
      for (const p of petEls) {
        const tag = [...p.children].find(k => k.textContent === "Sparky");
        if (p.style.transform.includes("scaleX(-1)")) {
          samples.push({ pet: p.style.transform, label: tag ? tag.style.transform : "n/a" });
          if (samples.length > 2) return samples;
        }
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return samples.length ? samples : "never saw dir=-1 in 15s (petEls=" + petEls.length + ")";
  });

  // npm install copy chip
  R.copyChip = await page.evaluate(async () => {
    const btn = document.getElementById("sdkCopy");
    if (!btn) return "no #sdkCopy";
    const before = btn.textContent;
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    return { before, after: btn.textContent, isCopiedClass: btn.classList.contains("is-copied") };
  });

  // chat demo
  R.chat = await page.evaluate(async () => {
    const input = document.getElementById("hero-chat-input");
    const msgs = document.getElementById("msgs");
    if (!input || !msgs) return "missing chat els";
    const before = msgs.children.length;
    input.value = "hello sparky";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const send = document.querySelector(".chat-input .send, .chat-input button");
    if (!send) return "no send btn";
    send.click();
    await new Promise(r => setTimeout(r, 300));
    const afterSend = msgs.children.length;
    await new Promise(r => setTimeout(r, 2500));
    const afterReply = msgs.children.length;
    const last = msgs.lastElementChild ? msgs.lastElementChild.textContent.slice(0, 80) : "";
    return { before, afterSend, afterReply, lastMsg: last };
  });
  await page.screenshot({ path: `${OUT}/land-chat.jpg`, type: "jpeg", quality: 80 });

  R.consoleErrors = [...new Set(errs)];
  await ctx.close();
}

// ---------- MOBILE ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("https://myaipet.ai", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  const burger = page.locator("#navBurger");
  R.mobileBurger = { exists: await burger.count() };
  if (R.mobileBurger.exists) {
    const visBefore = await page.evaluate(() => {
      const nl = document.getElementById("navLinks");
      const cs = getComputedStyle(nl);
      return { display: cs.display, cls: nl.className };
    });
    await burger.click().catch(e => R.mobileBurger.clickErr = String(e));
    await page.waitForTimeout(600);
    const visAfter = await page.evaluate(() => {
      const nl = document.getElementById("navLinks");
      const cs = getComputedStyle(nl);
      const links = [...nl.querySelectorAll("a")].filter(a => a.getBoundingClientRect().height > 0).length;
      return { display: cs.display, cls: nl.className, visibleLinks: links, expanded: document.getElementById("navBurger").getAttribute("aria-expanded") };
    });
    R.mobileBurger.before = visBefore; R.mobileBurger.after = visAfter;
    await page.screenshot({ path: `${OUT}/land-mob-menu.jpg`, type: "jpeg", quality: 80 });
  }
  await ctx.close();
}

console.log(JSON.stringify(R, null, 1));
await browser.close();

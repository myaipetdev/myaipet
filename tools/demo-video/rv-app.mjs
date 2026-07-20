import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/rv";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=metal"] });
const R = {};

// ---------- APP HOME DESKTOP ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", e => errs.push("PAGEERROR: " + e.message.slice(0, 200)));
  await page.goto("https://app.myaipet.ai", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);

  // pet name Mochi vs Dordor
  R.petName = await page.evaluate(() => {
    const t = document.body.innerText;
    return { mochi: (t.match(/Mochi/g) || []).length, dordor: (t.match(/Dordor/g) || []).length };
  });

  // Connect Wallet button color
  R.connectWallet = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter(b => /connect wallet/i.test(b.innerText));
    return btns.slice(0, 3).map(b => {
      const cs = getComputedStyle(b);
      return { text: b.innerText.trim(), bg: cs.backgroundColor, bgImage: cs.backgroundImage.slice(0, 80) };
    });
  });

  // Hangul across home
  R.hangul = await page.evaluate(() => {
    const m = document.body.innerText.match(/[가-힯ㄱ-ㅣ]+/g);
    return m ? [...new Set(m)].slice(0, 10) : [];
  });

  // scroll to DemoPet section (Meet ...)
  const meetLoc = page.locator("text=/Meet (Mochi|Dordor)/i").first();
  R.meetFound = await meetLoc.count();
  if (R.meetFound) {
    await meetLoc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/app-demopet.jpg`, type: "jpeg", quality: 80 });
    // care buttons: presence + occlusion check
    R.careButtons = await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button.dp-care, button")].filter(b => /^(Feed|Play|Pet)$/.test(b.innerText.trim()));
      return btns.map(b => {
        b.scrollIntoView({ block: "center" });
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const covered = el !== b && !b.contains(el);
        return { label: b.innerText.trim(), rect: { y: Math.round(r.top), h: Math.round(r.height) }, covered, coveredBy: covered && el ? (el.className || el.tagName).toString().slice(0, 60) : null };
      });
    });
    // click Feed and see stat change / burst
    const feed = page.locator("button", { hasText: /^Feed$/ }).first();
    if (await feed.count()) {
      const bondBefore = await page.evaluate(() => document.body.innerText.match(/Bond[\s\S]{0,40}/)?.[0]);
      await feed.click({ timeout: 5000 }).catch(e => R.feedClickErr = String(e).slice(0, 150));
      await page.waitForTimeout(800);
      const bondAfter = await page.evaluate(() => document.body.innerText.match(/Bond[\s\S]{0,40}/)?.[0]);
      R.feedClick = { bondBefore, bondAfter };
    }
    // specimen poster + reveal styles in demo section
    R.demoPoster = await page.evaluate(() => {
      const sec = [...document.querySelectorAll("section, div")].find(d => /Meet (Mochi|Dordor)/i.test(d.innerText || "") && d.querySelector("button"));
      const t = document.body.innerText;
      return {
        specimenText: /specimen|SPECIMEN/.test(t),
        bondMilestoneText: (t.match(/foil|milestone|trust|Trusted/gi) || []).slice(0, 6),
      };
    });
  }

  // full-page scroll for reveals + shots
  const H = await page.evaluate(() => document.body.scrollHeight);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  let y = 0, i = 0;
  const revealSamples = [];
  while (y < H && i < 24) {
    await page.mouse.wheel(0, 750); await page.waitForTimeout(400);
    y += 750;
    if (i % 3 === 0) await page.screenshot({ path: `${OUT}/app-${String(i).padStart(2, "0")}.jpg`, type: "jpeg", quality: 70 });
    i++;
  }
  // sticker chips vs emoji in skills area
  R.stickerVsEmoji = await page.evaluate(() => {
    const svgChips = document.querySelectorAll("[class*=chip] svg, [class*=stk] svg").length;
    const t = document.body.innerText;
    const emojiCount = (t.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
    return { svgChips, emojiCountInText: emojiCount };
  });

  R.consoleErrors = [...new Set(errs)].slice(0, 15);
  await ctx.close();
}

// ---------- PRICING ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("https://app.myaipet.ai/?section=pricing", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  R.pricing = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      comingSoonCount: (t.match(/Coming soon/gi) || []).length,
      purchasesPaused: /Purchases paused/i.test(t),
      specStrip: /credits/i.test(t) && /USDT/i.test(t),
      snippet: (t.match(/Purchases paused[\s\S]{0,120}/) || [t.slice(0, 200)])[0],
    };
  });
  await page.screenshot({ path: `${OUT}/app-pricing.jpg`, type: "jpeg", quality: 80 });
  await ctx.close();
}

// ---------- SEASON vs AIRDROP ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("https://app.myaipet.ai/?section=season", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  R.sectionSeason = await page.evaluate(() => ({ url: location.href, head: document.body.innerText.slice(0, 250) }));
  await page.goto("https://app.myaipet.ai/?section=airdrop", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  R.sectionAirdrop = await page.evaluate(() => ({ url: location.href, head: document.body.innerText.slice(0, 250) }));
  const r = await page.goto("https://app.myaipet.ai/season", { timeout: 30000 }).catch(e => null);
  R.seasonRoute = r ? r.status() : "nav-failed";
  await ctx.close();
}

// ---------- TOUR ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  R.tour = {};
  for (const sec of ["my%20pet", "community", "worldcup"]) {
    await page.goto(`https://app.myaipet.ai/?tour=1&section=${sec}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    R.tour[sec] = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        demoBadge: /DEMO/i.test(t),
        tourBanner: (t.match(/DEMO[\s\S]{0,60}/i) || [null])[0],
        connectWall: /Connect Wallet to (view|continue|start)/i.test(t),
        len: t.length,
      };
    });
    await page.screenshot({ path: `${OUT}/tour-${sec.replace("%20", "")}.jpg`, type: "jpeg", quality: 75 });
  }
  await ctx.close();
}

// ---------- MOBILE NAV ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("https://app.myaipet.ai", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  R.mobileNav = await page.evaluate(() => {
    const wrap = document.querySelector(".nav-items-wrap") || [...document.querySelectorAll("div,nav")].find(d => getComputedStyle(d).overflowX === "auto" && d.scrollWidth > d.clientWidth + 20);
    if (!wrap) return "no scrollable nav strip found";
    const chevron = document.querySelector("[class*=chevron], [class*=scroll-hint], [class*=hint]");
    const svgChev = [...document.querySelectorAll("svg")].filter(s => { const r = s.getBoundingClientRect(); return r.top < 120 && r.right > 340; });
    return {
      scrollable: wrap.scrollWidth > wrap.clientWidth,
      scrollW: wrap.scrollWidth, clientW: wrap.clientW || wrap.clientWidth,
      chevronEl: chevron ? chevron.className.toString().slice(0, 50) : null,
      rightEdgeSvgs: svgChev.length,
    };
  });
  await page.screenshot({ path: `${OUT}/app-mob-nav.jpg`, type: "jpeg", quality: 80 });
  await ctx.close();
}

console.log(JSON.stringify(R, null, 1));
await browser.close();

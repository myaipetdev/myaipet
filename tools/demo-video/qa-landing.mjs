import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad';
const URL = 'http://localhost:8795/index.html';

const consoleErrors = [];
const pageErrors = [];
const badResponses = [];
const findings = {};

function log(k, v) { console.log(`\n=== ${k} ===`); console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2)); }

async function run(viewport, tag) {
  const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const cErr = [], pErr = [], bad = [];
  page.on('console', m => { if (m.type() === 'error') cErr.push(m.text()); });
  page.on('pageerror', e => pErr.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('goto err', e.message));
  await page.waitForTimeout(1500);

  const result = { tag, viewport, checks: {} };

  // ---- Slow scroll top->bottom in steps ----
  const totalH = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < totalH; y += Math.round(viewport.height * 0.6)) {
    await page.mouse.wheel(0, Math.round(viewport.height * 0.6));
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/full-${tag}.png`, fullPage: true }).catch(()=>{});
  await page.evaluate(() => window.scrollTo(0,0));
  await page.waitForTimeout(600);

  // ---- NAV anchor links: click, verify scroll ----
  const navChecks = [];
  for (const [label, sel] of [['Companion','a[href="#companion"]'],['Community','a[href="#community"]'],['Protocol','a[href="#protocol"]']]) {
    await page.evaluate(() => window.scrollTo(0,0));
    await page.waitForTimeout(400);
    const el = page.locator(sel).first();
    const target = sel.match(/#(\w+)/)[1];
    const before = await page.evaluate(() => window.scrollY);
    let ok = false, err = null;
    try {
      await el.click({ timeout: 4000 });
      await page.waitForTimeout(1000);
      const after = await page.evaluate(() => window.scrollY);
      // is the target section near top of viewport?
      const rect = await page.evaluate(t => { const e=document.getElementById(t); if(!e) return null; const r=e.getBoundingClientRect(); return {top:r.top}; }, target);
      ok = rect && Math.abs(rect.top) < 200 && after > before + 50;
      navChecks.push({ label, target, before, after, rectTop: rect?rect.top:null, scrolled: ok });
    } catch (e) { err = e.message; navChecks.push({ label, target, error: err }); }
  }
  result.checks.nav = navChecks;

  // Docs nav (external, target _blank) - just verify href
  result.checks.docsHref = await page.locator('a[href="https://app.myaipet.ai/api-docs"]').first().getAttribute('href').catch(()=>null);

  // ---- Hero CTAs ----
  result.checks.getStartedHref = await page.locator('a.btn-primary', { hasText: 'Get started' }).first().getAttribute('href').catch(()=>null);
  // "See how it works" -> #journey
  await page.evaluate(() => window.scrollTo(0,0)); await page.waitForTimeout(300);
  try {
    await page.locator('a.btn-ghost').first().click({ timeout: 4000 });
    await page.waitForTimeout(1000);
    const jRect = await page.evaluate(() => { const e=document.getElementById('journey'); const r=e.getBoundingClientRect(); return r.top; });
    result.checks.seeHowItWorks = { scrolledToJourney: Math.abs(jRect) < 300, journeyTop: jRect };
  } catch(e){ result.checks.seeHowItWorks = { error: e.message }; }

  // ---- Launch App nav CTA ----
  result.checks.launchAppHref = await page.locator('a.nav-cta').first().getAttribute('href').catch(()=>null);

  // ---- Video dots (switchVideo) ----
  await page.evaluate(() => window.scrollTo(0,0)); await page.waitForTimeout(400);
  const dotResults = [];
  for (let i=0;i<5;i++){
    try {
      const dot = page.locator('#heroVideoDots .vdot').nth(i);
      await dot.click({ timeout: 3000 });
      await page.waitForTimeout(500);
      const activeIdx = await page.evaluate(() => {
        const dots=[...document.querySelectorAll('#heroVideoDots .vdot')];
        return dots.findIndex(d=>d.classList.contains('active'));
      });
      dotResults.push({ clicked: i, activeAfter: activeIdx, ok: activeIdx===i });
    } catch(e){ dotResults.push({ clicked:i, error:e.message }); }
  }
  result.checks.videoDots = dotResults;

  // ---- Journey video placeholder (playDemo) ----
  try {
    await page.locator('#journeyVideo').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.locator('#journeyVideo').click({ timeout: 4000 });
    await page.waitForTimeout(1500);
    const hasIframe = await page.locator('#journeyVideo iframe').count();
    result.checks.playDemo = { iframeInjected: hasIframe > 0 };
  } catch(e){ result.checks.playDemo = { error: e.message }; }

  // ---- Copy button (npm install) ----
  try {
    await page.locator('#protocol .code-block').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const copyBtn = page.locator('#protocol .code-block .copy').first();
    // grant clipboard
    await ctx.grantPermissions(['clipboard-read','clipboard-write']).catch(()=>{});
    const beforeText = await copyBtn.textContent();
    await copyBtn.click({ timeout: 3000 });
    await page.waitForTimeout(600);
    const afterText = await copyBtn.textContent();
    let clip = null;
    try { clip = await page.evaluate(() => navigator.clipboard.readText()); } catch(e){ clip = 'READ_ERR:'+e.message; }
    result.checks.copyBtn = { beforeText, afterText, textChanged: beforeText!==afterText, clipboard: clip };
  } catch(e){ result.checks.copyBtn = { error: e.message }; }

  // ---- Sovereignty passport CLI footers / section CTAs (count links) ----
  result.checks.sovereigntyLinks = await page.locator('#sovereignty a').evaluateAll(els => els.map(e=>({t:e.textContent.trim().slice(0,30), href:e.getAttribute('href')}))).catch(()=>[]);

  // ---- Playground chat prompts (pgSend) ----
  try {
    await page.locator('#playground').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const before = await page.locator('#playgroundMsgs > *').count();
    await page.locator('.pg-prompt').first().click({ timeout: 3000 });
    await page.waitForTimeout(1500);
    const after = await page.locator('#playgroundMsgs > *').count();
    result.checks.playground = { msgsBefore: before, msgsAfter: after, addedMsg: after>before };
  } catch(e){ result.checks.playground = { error: e.message }; }

  // ---- Pet walker mirror check (Sparky) ----
  // Find the walker with a name label 'Sparky' and check while dir=-1 the label transform counter-flips
  result.checks.walker = await page.evaluate(() => {
    const out = {};
    // legacy petWalker
    const pw = document.getElementById('petWalker');
    if (pw) {
      const lbl = pw.querySelector('.mp-txt');
      out.petWalker = { exists:true, elTransform: pw.style.transform, labelTransform: lbl?lbl.style.transform:null, labelText: lbl?lbl.textContent.trim():null };
    }
    // sparky walker - find element containing 'Sparky'
    const all = [...document.querySelectorAll('*')].filter(e => e.children.length===0 && /sparky/i.test(e.textContent) && e.textContent.trim().length<20);
    out.sparkyTags = all.map(e => {
      const container = e.closest('[id]');
      return { text:e.textContent.trim(), transform:e.style.transform, parentTransform: e.parentElement?e.parentElement.style.transform:null, containerId: container?container.id:null };
    });
    return out;
  });

  // ---- Orange flood detection: scan sections for full orange background ----
  result.checks.orangeFlood = await page.evaluate(() => {
    const flagged = [];
    const secs = document.querySelectorAll('section, header, footer');
    for (const s of secs) {
      const cs = getComputedStyle(s);
      const bg = cs.backgroundColor;
      const bi = cs.backgroundImage;
      // parse rgb
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const [r,g,b] = [+m[1],+m[2],+m[3]];
        // orange-ish: high red, mid green, low blue, and opaque area large
        const rect = s.getBoundingClientRect();
        const area = rect.width * rect.height;
        const isOrange = r>180 && g>60 && g<170 && b<90 && (r-b)>110;
        if (isOrange && area > 100000) {
          flagged.push({ id:s.id||s.className.toString().slice(0,30), bg, area:Math.round(area) });
        }
      }
    }
    return flagged;
  });

  // screenshots of key sections
  for (const id of ['journey','skillsShowcase','community','sovereignty','protocol']) {
    try { const el = page.locator('#'+id); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await el.screenshot({ path: `${OUT}/sec-${id}-${tag}.png` }); } catch(e){}
  }

  result.consoleErrors = cErr;
  result.pageErrors = pErr;
  result.badResponses = bad;

  await browser.close();
  return result;
}

(async () => {
  const desktop = await run({ width:1440, height:900 }, 'desktop');
  const mobile = await run({ width:390, height:844 }, 'mobile');
  const all = { desktop, mobile };
  fs.writeFileSync(`${OUT}/qa-result.json`, JSON.stringify(all, null, 2));
  console.log(JSON.stringify(all, null, 2));
})();

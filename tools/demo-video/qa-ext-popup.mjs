import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/ext';
fs.mkdirSync(OUT, { recursive: true });

const URL = 'http://localhost:8796/popup.html';

const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });

async function review(vpLabel, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const badResponses = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push(r.status() + ' ' + r.url()); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Probe: is chrome.runtime available? which listeners bound?
  const probe = await page.evaluate(() => {
    const out = {};
    out.chromeExists = typeof chrome !== 'undefined';
    out.chromeRuntime = typeof chrome !== 'undefined' && !!chrome.runtime;
    out.chromeRuntimeSendMessage = typeof chrome !== 'undefined' && !!chrome.runtime && typeof chrome.runtime.sendMessage === 'function';
    out.versionLine = document.getElementById('version-line')?.textContent;
    out.totalPoints = document.getElementById('totalPoints')?.textContent;
    out.questList = document.getElementById('questList')?.textContent?.trim().slice(0,60);
    out.achieveCount = document.getElementById('achieveCount')?.textContent;
    out.achieveList = document.getElementById('achieveList')?.innerHTML?.length;
    out.evoPerks = document.getElementById('evoPerks')?.textContent?.trim().slice(0,40);
    out.siteAccessStatus = document.getElementById('siteAccessStatus')?.textContent;
    out.siteAccessBtn = document.getElementById('siteAccessBtn')?.textContent;
    out.syncStatus = document.getElementById('syncStatus')?.textContent;
    out.saveBtn = document.getElementById('saveBtn')?.textContent;
    out.seasonSyncDisplay = document.getElementById('seasonSync')?.style.display;
    out.seasonSignedOutDisplay = document.getElementById('seasonSyncSignedOut')?.style.display;
    out.demoBadge = document.getElementById('demoBadge')?.style.display;
    return out;
  });

  const tabs = ['points','evolution','emotions','game','achieve','settings'];
  const shots = {};
  for (const t of tabs) {
    await page.click(`#tab-button-${t}`).catch(()=>{});
    await page.waitForTimeout(300);
    const f = `${OUT}/${vpLabel}-${t}.png`;
    await page.screenshot({ path: f, fullPage: true });
    shots[t] = f;
  }

  // Interaction tests on emotions tab
  await page.click('#tab-button-emotions').catch(()=>{});
  await page.waitForTimeout(200);
  const feedBefore = await page.evaluate(()=>document.getElementById('valHappiness')?.textContent);
  await page.click('#feedBtn').catch(()=>{});
  await page.waitForTimeout(400);
  const feedAfter = await page.evaluate(()=>({
    val: document.getElementById('valHappiness')?.textContent,
    status: document.getElementById('status')?.textContent,
    statusDisplay: document.getElementById('status')?.style.display,
  }));

  // Game tab: start button test
  await page.click('#tab-button-game').catch(()=>{});
  await page.waitForTimeout(200);
  await page.click('#startGameBtn').catch(()=>{});
  await page.waitForTimeout(600);
  const gameState = await page.evaluate(()=>({
    startBtn: document.getElementById('startGameBtn')?.textContent,
    disabled: document.getElementById('startGameBtn')?.disabled,
    canvasChildren: document.getElementById('gameCanvas')?.children.length,
  }));
  await page.screenshot({ path: `${OUT}/${vpLabel}-game-running.png`, fullPage: true });

  // Memory game switch
  await page.click('[data-game="memory"]').catch(()=>{});
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${vpLabel}-game-memory.png`, fullPage: true });
  await page.click('#startMemoryBtn').catch(()=>{});
  await page.waitForTimeout(300);
  const memState = await page.evaluate(()=>({
    grid: document.getElementById('memoryGrid')?.children.length,
    startBtn: document.getElementById('startMemoryBtn')?.textContent,
  }));
  await page.screenshot({ path: `${OUT}/${vpLabel}-game-memory-running.png`, fullPage: true });

  // Settings: toggle test
  await page.click('#tab-button-settings').catch(()=>{});
  await page.waitForTimeout(200);
  const toggleBefore = await page.evaluate(()=>document.getElementById('toggleAutoTalk')?.classList.contains('on'));
  await page.click('#toggleAutoTalk').catch(()=>{});
  await page.waitForTimeout(400);
  const toggleAfter = await page.evaluate(()=>({
    on: document.getElementById('toggleAutoTalk')?.classList.contains('on'),
    disabled: document.getElementById('toggleAutoTalk')?.disabled,
    ariaBusy: document.getElementById('toggleAutoTalk')?.getAttribute('aria-busy'),
    status: document.getElementById('status')?.textContent,
  }));

  // Save button test (empty token)
  await page.click('#saveBtn').catch(()=>{});
  await page.waitForTimeout(300);
  const saveState = await page.evaluate(()=>({
    status: document.getElementById('status')?.textContent,
    statusDisplay: document.getElementById('status')?.style.display,
  }));

  await ctx.close();
  return { vpLabel, probe, consoleErrors, badResponses, feedBefore, feedAfter, gameState, memState, toggleBefore, toggleAfter, saveState, shots };
}

const desktop = await review('desktop', 1440, 900);
const mobile = await review('mobile', 390, 844);

await browser.close();
console.log(JSON.stringify({ desktop, mobile }, null, 2));

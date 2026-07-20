import { chromium } from 'playwright';
import fs from 'fs';
const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('https://app.myaipet.ai', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);

// Click each nav button and record resulting url + whether section scrolled
const navButtons = ['My Pet','Cards','Bracket','Studio','Community','PetClaw','Agent Office','Season Rewards'];
const results = {};
for (const name of navButtons) {
  await page.goto('https://app.myaipet.ai', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);
  const before = page.url();
  const yBefore = await page.evaluate(()=>window.scrollY);
  const btn = page.locator(`nav button:has-text("${name}"), header button:has-text("${name}"), button:has-text("${name}")`).first();
  let status=[];
  page.removeAllListeners('response');
  page.on('response', r=>{ if(r.status()>=400) status.push(`${r.status()} ${r.url()}`); });
  await btn.click().catch(e=>results[name]={err:e.message});
  await page.waitForTimeout(1500);
  const after = page.url();
  const yAfter = await page.evaluate(()=>window.scrollY);
  results[name] = { before, after, navigated: before!==after, scrolled: Math.abs(yAfter-yBefore)>50, yAfter, bad: status.slice(0,3) };
}
console.log('=== NAV BUTTON BEHAVIOR ===');
console.log(JSON.stringify(results, null, 2));

// Check link target URLs for 404
const targets = ['/studio','/api-docs','/docs','/skills','/stats','/terms','/privacy','/contracts','/architecture','/season'];
console.log('=== LINK TARGET STATUS ===');
for (const t of targets) {
  const resp = await page.goto('https://app.myaipet.ai'+t, { waitUntil:'domcontentloaded', timeout:30000 }).catch(e=>null);
  console.log(t, resp?resp.status():'ERR');
}
await ctx.close(); await browser.close();

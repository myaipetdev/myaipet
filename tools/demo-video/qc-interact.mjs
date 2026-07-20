import { chromium } from 'playwright';
import fs from 'fs';
const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';

const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const bad = [];
page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
await page.goto('https://app.myaipet.ai', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);

// Collect all links + buttons
const controls = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('a').forEach(a => out.push({ t:'a', text:(a.innerText||'').trim().slice(0,40), href:a.getAttribute('href') }));
  document.querySelectorAll('button').forEach(b => out.push({ t:'button', text:(b.innerText||'').trim().slice(0,40), href:null, disabled:b.disabled }));
  return out;
});
fs.writeFileSync(`${OUT}/controls.json`, JSON.stringify(controls, null, 2));
console.log('=== HOME CONTROLS ===');
console.log(controls.map(c=>`${c.t}\t${c.disabled?'[disabled] ':''}${JSON.stringify(c.text)}\t${c.href||''}`).join('\n'));

// Navigate to Season Rewards via nav
async function shot(name){ await page.screenshot({path:`${OUT}/${name}.png`}); }

// Go to season rewards page
await page.goto('https://app.myaipet.ai/season', { waitUntil:'networkidle', timeout:60000 }).catch(async()=>{
  // fallback: click nav
});
await page.waitForTimeout(1500);
const url1 = page.url();
console.log('season url', url1);
await shot('season-earn');

// Look for Earn/Compete tabs
const tabs = await page.evaluate(()=>{
  return [...document.querySelectorAll('button,a,[role=tab]')].map(e=>(e.innerText||'').trim()).filter(t=>/earn|compete/i.test(t));
});
console.log('tabs found', JSON.stringify(tabs));

await ctx.close();
await browser.close();
console.log('BAD', bad.length, bad.slice(0,20).join('\n'));

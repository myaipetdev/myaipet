import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('https://app.myaipet.ai', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2500);
// open wallet modal
const els = await p.$$('button');
for (const el of els) {
  const t = (await el.textContent() || '').trim().toLowerCase();
  if (t.includes('connect wallet')) { await el.click().catch(()=>{}); break; }
}
await p.waitForTimeout(2000);
const info = await p.$$eval('button', els => els.filter(el => {
  const r = el.getBoundingClientRect();
  return r.width>0 && r.height>0 && (el.innerText||'').trim()==='';
}).map(el => ({
  ariaLabel: el.getAttribute('aria-label'),
  title: el.getAttribute('title'),
  tabindex: el.getAttribute('tabindex'),
  html: el.outerHTML.slice(0, 220),
})));
console.log(JSON.stringify(info, null, 2));
await b.close();

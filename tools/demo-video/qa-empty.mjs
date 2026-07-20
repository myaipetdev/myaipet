import { chromium } from 'playwright';
const SEL = 'button, [role=button], a, input[type=button], input[type=submit], summary, [onclick]';
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 380, height: 600 } });
const p = await ctx.newPage();
await p.goto('http://localhost:8796/popup.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(500);
// go to settings
await p.evaluate(() => {
  const els=[...document.querySelectorAll('button,[data-tab]')];
  const t=els.find(e=>(e.innerText||'').trim().toUpperCase()==='SETTINGS');
  if(t)t.click();
});
await p.waitForTimeout(400);
const info = await p.evaluate((sel) => {
  return [...document.querySelectorAll(sel)].filter(el=>{
    const vis=!!(el.offsetParent!==null||el.getClientRects().length);
    const txt=(el.innerText||'').trim();
    return vis && txt==='';
  }).map(el=>({
    tag:el.tagName, id:el.id, cls:el.className,
    aria:el.getAttribute('aria-label'),
    title:el.getAttribute('title'),
    html:el.outerHTML.slice(0,160),
    hasImg:!!el.querySelector('img,svg'),
    childText: el.textContent.trim()
  }));
}, SEL);
console.log(JSON.stringify(info,null,1));
// Also check Badges tab content and Points/Evolve for any dynamic buttons
for(const tab of ['POINTS','EVOLVE','BADGES']){
  await p.evaluate((tn)=>{const els=[...document.querySelectorAll('button,[data-tab]')];const t=els.find(e=>(e.innerText||'').trim().toUpperCase()===tn);if(t)t.click();},tab);
  await p.waitForTimeout(400);
  const all = await p.evaluate((sel)=>[...document.querySelectorAll(sel)].filter(el=>el.offsetParent!==null||el.getClientRects().length).map(el=>({t:(el.innerText||'').trim(),tag:el.tagName})),SEL);
  console.log('TAB',tab, JSON.stringify(all));
}
await browser.close();

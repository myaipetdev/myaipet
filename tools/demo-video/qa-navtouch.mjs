import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/shots';
const BASE = 'https://app.myaipet.ai';
function log(...a){ console.log('[QA]', ...a); }
const browser = await chromium.launch({ args:['--enable-gpu','--use-angle=metal'] });
const context = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await page.goto(BASE, {waitUntil:'networkidle', timeout:60000}).catch(()=>{});
await page.waitForTimeout(2000);

// locate nav scroller center y
const geo = await page.evaluate(()=>{
  const el=[...document.querySelectorAll('nav *')].find(e=>e.scrollWidth>e.clientWidth+10 && /auto|scroll/.test(getComputedStyle(e).overflowX));
  if(!el) return null; const r=el.getBoundingClientRect();
  return {y:Math.round(r.y+r.height/2), left:Math.round(r.x), right:Math.round(r.right), touchAction:getComputedStyle(el).touchAction, scrollLeft:el.scrollLeft, scrollWidth:el.scrollWidth, clientWidth:el.clientWidth};
});
log('NAV-GEO', JSON.stringify(geo));
const y = geo? geo.y : 26;
const startX = geo? Math.round(geo.right-10) : 200;
const endX = geo? Math.round(geo.left+5) : 40;

// Real touch swipe left via CDP: touchStart at x=300, move to x=60, touchEnd
async function touch(type, x){
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type==='touchEnd'?[]:[{x, y}] });
}
const span = startX-endX;
const steps = [0.15,0.3,0.5,0.7,0.85,1].map(f=>Math.round(startX-span*f));
log('SWIPE from x='+startX+' to x='+endX+' at y='+y);
await touch('touchStart', startX);
for(const x of steps){ await touch('touchMove', x); await page.waitForTimeout(30); }
await touch('touchEnd', endX);
await page.waitForTimeout(600);
const afterScroll = await page.evaluate(()=>{ const el=[...document.querySelectorAll('nav *')].find(e=>e.scrollWidth>e.clientWidth+10 && /auto|scroll/.test(getComputedStyle(e).overflowX)); return el?el.scrollLeft:null; });
log('AFTER-TOUCH-SWIPE scrollLeft='+afterScroll);
await page.screenshot({path:OUT+'/18-nav-touchswipe.png'});

// which nav items are now visible in viewport?
const vis = await page.evaluate(()=>{
  return [...document.querySelectorAll('nav button, nav a')].map(b=>{const r=b.getBoundingClientRect();return {t:(b.innerText||'').trim().slice(0,16), inView:r.x>=0&&r.right<=390};}).filter(o=>o.t);
});
log('NAV-VISIBLE-AFTER', JSON.stringify(vis));
await browser.close();
log('DONE');

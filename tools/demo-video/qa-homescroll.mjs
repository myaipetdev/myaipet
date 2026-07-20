import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/shots';
const BASE = 'https://app.myaipet.ai';
function log(...a){ console.log('[QA]', ...a); }
const browser = await chromium.launch({ args:['--enable-gpu','--use-angle=metal'] });
const context = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await context.newPage();
await page.goto(BASE, {waitUntil:'networkidle', timeout:60000}).catch(()=>{});
await page.waitForTimeout(2500);
const H = await page.evaluate(()=>document.body.scrollHeight);
log('PAGE-HEIGHT', H);
// scroll through, checking overflow at each stop
let n=0;
for(let yy=0; yy<H; yy+=760){
  await page.evaluate(y=>window.scrollTo(0,y), yy);
  await page.waitForTimeout(900);
  const of = await page.evaluate(()=>{
    const de=document.documentElement;
    const overflow = de.scrollWidth>de.clientWidth+2;
    const wide=[]; document.querySelectorAll('body *').forEach(el=>{const r=el.getBoundingClientRect(); if(r.right>window.innerWidth+6 && r.height>10 && r.top<844 && r.bottom>0){ wide.push({tag:el.tagName,cls:(el.className&&el.className.toString().slice(0,30))||'',right:Math.round(r.right)});}});
    return {overflow, sw:de.scrollWidth, wide:wide.slice(0,4)};
  });
  if(of.overflow) log('  OVERFLOW at y='+yy, JSON.stringify(of));
  await page.screenshot({path:`${OUT}/home-scroll-${n}.png`});
  n++;
}
// look for check-in chips
const chips = await page.evaluate(()=>{
  const t=document.body.innerText;
  const has = /check.?in|daily|streak|claim|day 1|gm\b/i.test(t);
  const matches = (t.match(/check.?in|daily reward|streak|claim/gi)||[]).slice(0,6);
  return {has, matches};
});
log('CHECKIN-CHIPS', JSON.stringify(chips));
await browser.close();
log('DONE scrolls='+n);

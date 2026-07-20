import { chromium } from 'playwright';
import fs from 'fs';
const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/shots';
const BASE = 'https://app.myaipet.ai';
const errs = [];
function log(...a){ console.log('[QA]', ...a); }
const browser = await chromium.launch({ args:['--enable-gpu','--use-angle=metal'] });
const context = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await context.newPage();
page.on('console', m=>{ if(m.type()==='error') errs.push('console:'+m.text().slice(0,140)); });
page.on('pageerror', e=>errs.push('pageerror:'+String(e).slice(0,140)));
async function shot(n){ await page.screenshot({path:`${OUT}/${n}.png`}).catch(()=>{}); }

// ===== MEET MOCHI demo interaction =====
log('=== MEET MOCHI ===');
await page.goto(BASE+'/?section=my%20pet', {waitUntil:'networkidle', timeout:60000}).catch(e=>log('goto',e.message));
await page.waitForTimeout(2500);

// find Feed/Play/Pet buttons
const careBtns = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const care = btns.filter(b => /feed|play|^pet$|treat|groom/i.test((b.innerText||'').trim()));
  return care.map(b => ({ t:(b.innerText||'').trim().slice(0,20), y:Math.round(b.getBoundingClientRect().y), disabled:b.disabled }));
});
log('CARE-BTNS', JSON.stringify(careBtns));

// read bar values before
async function readBars(){
  return await page.evaluate(() => {
    // find stat rows with numbers like Happy 58, Energy 66
    const text = document.body.innerText;
    const m = {};
    ['Happy','Energy','Bond','Hunger','Clean','Mood'].forEach(k=>{
      const re = new RegExp(k+'\\s*(\\d+)');
      const mm = text.match(re); if(mm) m[k]=Number(mm[1]);
    });
    return m;
  });
}
const before = await readBars();
log('BARS-BEFORE', JSON.stringify(before));

// scroll to Feed button and tap it several times
async function tapCare(name, times){
  for(let i=0;i<times;i++){
    const ok = await page.evaluate((n)=>{
      const btns=[...document.querySelectorAll('button')];
      const b=btns.find(x=>new RegExp('^'+n+'$','i').test((x.innerText||'').trim()));
      if(!b) return false; b.scrollIntoView({block:'center'}); b.click(); return true;
    }, name);
    if(!ok){ log('  tap fail', name); break; }
    await page.waitForTimeout(700);
  }
}
await tapCare('Feed', 3);
await tapCare('Play', 3);
await tapCare('Pet', 3);
await page.waitForTimeout(1500);
const after = await readBars();
log('BARS-AFTER', JSON.stringify(after));
await shot('10-mochi-after-care');

// check for bond milestone / toast / celebration text
const celebration = await page.evaluate(() => {
  const t = document.body.innerText;
  const hints = ['milestone','bond','level up','leveled','🎉','congrat','unlocked','reached'];
  const found = hints.filter(h => t.toLowerCase().includes(h.toLowerCase()));
  return found;
});
log('CELEBRATION-HINTS', JSON.stringify(celebration));

// ===== TOUR MODE community =====
log('=== TOUR community ===');
await page.goto(BASE+'/?section=community&tour=1', {waitUntil:'networkidle', timeout:60000}).catch(e=>log('goto',e.message));
await page.waitForTimeout(2500);
await shot('11-tour-community');
const tourC = await page.evaluate(()=>({ hasDemoBanner:/demo tour|demo mode|tour/i.test(document.body.innerText), bodyLen:document.body.innerText.length, first:document.body.innerText.slice(0,120) }));
log('TOUR-COMMUNITY', JSON.stringify(tourC));

log('=== TOUR my pet ===');
await page.goto(BASE+'/?section=my%20pet&tour=1', {waitUntil:'networkidle', timeout:60000}).catch(e=>log('goto',e.message));
await page.waitForTimeout(2500);
await shot('12-tour-mypet');
const tourM = await page.evaluate(()=>({ hasDemoBanner:/demo tour|demo mode|tour/i.test(document.body.innerText), bodyLen:document.body.innerText.length, first:document.body.innerText.slice(0,120) }));
log('TOUR-MYPET', JSON.stringify(tourM));

// ===== NAV touch scroll test =====
log('=== NAV touch scroll ===');
await page.goto(BASE, {waitUntil:'networkidle', timeout:60000}).catch(()=>{});
await page.waitForTimeout(2000);
const scrollerBefore = await page.evaluate(()=>{ const s=document.querySelector('nav > div[style*="auto"], nav div'); return null; });
// swipe the nav left via mouse drag on the scroller
const beforeScroll = await page.evaluate(()=>{ const el=[...document.querySelectorAll('nav *')].find(e=>e.scrollWidth>e.clientWidth+10 && /auto|scroll/.test(getComputedStyle(e).overflowX)); return el?el.scrollLeft:null; });
await page.evaluate(()=>{ const el=[...document.querySelectorAll('nav *')].find(e=>e.scrollWidth>e.clientWidth+10 && /auto|scroll/.test(getComputedStyle(e).overflowX)); if(el) el.scrollLeft=300; });
await page.waitForTimeout(500);
const afterScroll = await page.evaluate(()=>{ const el=[...document.querySelectorAll('nav *')].find(e=>e.scrollWidth>e.clientWidth+10 && /auto|scroll/.test(getComputedStyle(e).overflowX)); return el?el.scrollLeft:null; });
log('NAV-SCROLL-PROG', 'before='+beforeScroll, 'after='+afterScroll);
await shot('13-nav-scrolled');

// ===== HERO CTAs =====
log('=== HERO CTA: Adopt your pet ===');
await page.evaluate(()=>{ const b=[...document.querySelectorAll('button,a')].find(x=>/adopt your pet/i.test((x.innerText||'').trim())); if(b) b.click(); });
await page.waitForTimeout(2000);
await shot('14-adopt-cta');
const adoptResult = await page.evaluate(()=>({url:location.href, modal: !!document.querySelector('[role=dialog]'), bodyFirst:document.body.innerText.slice(0,80)}));
log('ADOPT-CTA', JSON.stringify(adoptResult));

await browser.close();
log('ERRS', JSON.stringify([...new Set(errs)].slice(0,20)));
log('DONE');

import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'https://app.myaipet.ai';
const consoleErrors = [], badResponses = [], pageErrors = [];
function log(...a){ console.log('[QA]', ...a); }

const browser = await chromium.launch({ args: ['--enable-gpu','--use-angle=metal'] });
const context = await browser.newContext({
  viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();
page.on('console', m=>{ if(m.type()==='error') consoleErrors.push({url:page.url().slice(0,80),text:m.text().slice(0,240)});});
page.on('pageerror', e=>pageErrors.push({url:page.url().slice(0,80),text:String(e).slice(0,240)}));
page.on('response', r=>{ if(r.status()>=400) badResponses.push({s:r.status(),url:r.url().slice(0,140)});});
async function shot(n){ await page.screenshot({path:`${OUT}/${n}.png`}).catch(()=>{}); }

await page.goto(BASE, {waitUntil:'networkidle', timeout:60000}).catch(e=>log('goto',e.message));
await page.waitForTimeout(2500);

// 1. Is the nav horizontally scrollable? Check the nav container + parents for scrollWidth>clientWidth
const navScroll = await page.evaluate(() => {
  const nav = document.querySelector('nav');
  if (!nav) return {noNav:true};
  const chain = [];
  let el = nav;
  for (let i=0;i<4 && el;i++){
    const cs = getComputedStyle(el);
    chain.push({tag:el.tagName, ox:cs.overflowX, scrollW:el.scrollWidth, clientW:el.clientWidth, scrollable: el.scrollWidth>el.clientWidth+2 && ['auto','scroll'].includes(cs.overflowX)});
    el = el.parentElement;
  }
  // also inspect nav's direct children for an inner scroller
  const kids = [...nav.children].map(c=>{const cs=getComputedStyle(c);return {tag:c.tagName,ox:cs.overflowX,scrollW:c.scrollWidth,clientW:c.clientWidth};});
  return {chain, kids};
});
log('NAV-SCROLL', JSON.stringify(navScroll, null, 1));

// 2. Try to reach "Season Rewards" — is it clickable? Attempt scroll into view + click
async function tryNav(label){
  const res = await page.evaluate((lbl) => {
    const els = [...document.querySelectorAll('nav button, nav a')];
    const el = els.find(e => (e.innerText||'').trim() === lbl);
    if (!el) return {found:false};
    const r = el.getBoundingClientRect();
    return {found:true, x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), inViewport: r.x>=0 && r.right<=window.innerWidth, right:Math.round(r.right)};
  }, label);
  return res;
}
for (const l of ['Home','My Pet','Cards','Bracket','Studio','Community','PetClaw','Agent Office','Season Rewards']){
  log('NAVITEM', l, JSON.stringify(await tryNav(l)));
}

// 3. Attempt clicking each nav item via JS click (bypasses viewport) to see if routing works, capture what section renders
async function clickNavAndObserve(label, tag){
  const clicked = await page.evaluate((lbl) => {
    const els = [...document.querySelectorAll('nav button, nav a')];
    const el = els.find(e => (e.innerText||'').trim() === lbl);
    if (!el) return false;
    el.click();
    return true;
  }, label);
  await page.waitForTimeout(2200);
  await shot(tag);
  const heading = await page.evaluate(() => {
    const h = document.querySelector('h1,h2');
    return { title: document.title, h1: (document.querySelector('h1')?.innerText||'').slice(0,60), url: location.href };
  });
  log('CLICK', label, 'clicked='+clicked, JSON.stringify(heading));
  const of = await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
  if (of.sw > of.cw+2) log('  HORIZ-OVERFLOW', label, JSON.stringify(of));
  return clicked;
}
await clickNavAndObserve('My Pet','02-mypet');
await clickNavAndObserve('Cards','03-cards');
await clickNavAndObserve('Bracket','04-bracket');
await clickNavAndObserve('Studio','05-studio');
await clickNavAndObserve('Community','06-community');
await clickNavAndObserve('PetClaw','07-petclaw');
await clickNavAndObserve('Agent Office','08-agentoffice');
await clickNavAndObserve('Season Rewards','09-season');

await browser.close();
fs.writeFileSync(OUT+'/../errors2.json', JSON.stringify({consoleErrors,badResponses,pageErrors},null,2));
log('DONE', 'consoleErr='+consoleErrors.length, 'bad='+badResponses.length, 'pageErr='+pageErrors.length);

import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/shots';
const BASE = 'https://app.myaipet.ai';
function log(...a){ console.log('[QA]', ...a); }
const browser = await chromium.launch({ args:['--enable-gpu','--use-angle=metal'] });
const context = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await context.newPage();
async function shot(n){ await page.screenshot({path:`${OUT}/${n}.png`}).catch(()=>{}); }
await page.goto(BASE, {waitUntil:'networkidle', timeout:60000}).catch(()=>{});
await page.waitForTimeout(2000);

// REAL touch swipe on the nav (drag left at y~26)
const before = await page.evaluate(()=>{ const el=[...document.querySelectorAll('nav *')].find(e=>e.scrollWidth>e.clientWidth+10 && /auto|scroll/.test(getComputedStyle(e).overflowX)); return el?el.scrollLeft:null; });
await page.touchscreen.tap(300,26).catch(()=>{});
// simulate swipe using dispatchEvent touch sequence
await page.evaluate(()=>{
  const el=[...document.querySelectorAll('nav *')].find(e=>e.scrollWidth>e.clientWidth+10 && /auto|scroll/.test(getComputedStyle(e).overflowX));
  window.__nav = el;
});
// use CDP-style drag via mouse (touch emulation)
await page.mouse.move(320,26); await page.mouse.down();
await page.mouse.move(80,26,{steps:10}); await page.mouse.up();
await page.waitForTimeout(500);
const after = await page.evaluate(()=>window.__nav?window.__nav.scrollLeft:null);
log('NAV-TOUCH-SWIPE before='+before+' after='+after);
await shot('15-nav-after-swipe');

// Explore Community CTA
await page.goto(BASE, {waitUntil:'networkidle'}).catch(()=>{});
await page.waitForTimeout(1500);
const ec = await page.evaluate(()=>{ const b=[...document.querySelectorAll('button,a')].find(x=>/explore community/i.test((x.innerText||'').trim())); if(b){b.click();return true;} return false; });
await page.waitForTimeout(1800);
log('EXPLORE-COMMUNITY clicked='+ec+' url='+page.url());
await shot('16-explore-community');

// Footer links reachability (SKILLS/STATS/API DOCS/TERMS/Twitter/Chrome Extension)
await page.goto(BASE, {waitUntil:'networkidle'}).catch(()=>{});
await page.waitForTimeout(1500);
const footer = await page.evaluate(()=>{
  const links=[...document.querySelectorAll('a')].filter(a=>/skills|stats|api docs|terms|twitter|chrome extension|privacy/i.test((a.innerText||'').trim()));
  return links.map(a=>({t:(a.innerText||'').trim().slice(0,20), href:a.getAttribute('href'), target:a.getAttribute('target')}));
});
log('FOOTER-LINKS', JSON.stringify(footer));

// Connect Wallet button -> does it open a modal?
const cw = await page.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/connect wallet/i.test((x.innerText||'').trim())); if(b){b.click();return true;} return false; });
await page.waitForTimeout(2000);
await shot('17-connect-wallet');
const cwResult = await page.evaluate(()=>({ modal: !!document.querySelector('[role=dialog]'), overlays: document.querySelectorAll('[class*=modal],[class*=Modal],[role=dialog]').length, bodyHint: document.body.innerText.match(/metamask|walletconnect|coinbase|rabby|sign in|connect a wallet/i)?.[0]||null }));
log('CONNECT-WALLET clicked='+cw, JSON.stringify(cwResult));

// tap-target audit: buttons smaller than 44px
await page.goto(BASE, {waitUntil:'networkidle'}).catch(()=>{});
await page.waitForTimeout(1500);
const smallTargets = await page.evaluate(()=>{
  const out=[];
  document.querySelectorAll('button,a[href]').forEach(b=>{
    const r=b.getBoundingClientRect(); if(r.width<1||r.height<1) return;
    if(r.height<32||r.width<32){ out.push({t:(b.innerText||b.getAttribute('aria-label')||'').trim().slice(0,16), w:Math.round(r.width), h:Math.round(r.height)}); }
  });
  return out.slice(0,15);
});
log('SMALL-TAP-TARGETS', JSON.stringify(smallTargets));

await browser.close();
log('DONE');

import { chromium } from 'playwright';
const BASE='http://localhost:8795/index.html';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(BASE,{waitUntil:'networkidle'});

// burger visible on mobile?
const burgerVis=await p.$eval('#navBurger',n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0;});
const linksOpenBefore=await p.$eval('#navLinks',n=>n.classList.contains('open'));
console.log('burger visible:',burgerVis,'links open before:',linksOpenBefore);

// links hidden before toggle?
const linkVisBefore=await p.$eval('.nav-links a[href="#companion"]',n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0;});
console.log('companion link visible before toggle:',linkVisBefore);

// click burger
await p.click('#navBurger');
await p.waitForTimeout(300);
const linksOpenAfter=await p.$eval('#navLinks',n=>n.classList.contains('open'));
const ariaExp=await p.$eval('#navBurger',n=>n.getAttribute('aria-expanded'));
const linkVisAfter=await p.$eval('.nav-links a[href="#companion"]',n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0;});
console.log('after burger click -> links open:',linksOpenAfter,'aria-expanded:',ariaExp,'link visible:',linkVisAfter);

// click a nav link in the open menu -> should scroll & close
await p.click('.nav-links a[href="#protocol"]');
await p.waitForTimeout(700);
const closedAfterNav=await p.$eval('#navLinks',n=>n.classList.contains('open'));
const y=await p.evaluate(()=>window.scrollY);
console.log('after nav link -> menu closed:',!closedAfterNav,'scrollY:',y);

// companion send on mobile
await p.evaluate(()=>document.getElementById('companion').scrollIntoView());
await p.waitForTimeout(400);
await p.fill('#hero-chat-input','mobile test');
await p.click('.chat-input .send');
await p.waitForTimeout(500);
const inp=await p.$eval('#hero-chat-input',n=>n.value);
const inMsgs=await p.$eval('#msgs',n=>n.innerText.includes('mobile test'));
console.log('MOBILE companion send -> input still:',JSON.stringify(inp),'appears in msgs:',inMsgs);

console.log('pageerrors:',errs);
await b.close();
console.log('DONE mobile');

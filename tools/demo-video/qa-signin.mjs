import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa';
const browser=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
// Studio: click DEMO · SIGN IN
await p.goto('https://app.myaipet.ai/studio',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);
const before=await p.evaluate(()=>document.body.innerText.length);
await p.locator('a:has-text("DEMO"), button:has-text("DEMO")').first().click().catch(e=>console.log('demo click err',String(e).slice(0,80)));
await p.waitForTimeout(2000);
const modal1=await p.evaluate(()=>{const t=document.body.innerText;return {url:location.href,hasWallet:/wallet|sign in|metamask|walletconnect|connect/i.test(t), dialog: !!document.querySelector('[role=dialog]')};});
console.log('AFTER_DEMO_SIGNIN', JSON.stringify(modal1));
await p.screenshot({path:`${OUT}/studio-signin-modal.png`});
await browser.close();

// My Pet adopt
const b2=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const c2=await b2.newContext({viewport:{width:1440,height:900}});
const q=await c2.newPage();
await q.goto('https://app.myaipet.ai/?section=my+pet',{waitUntil:'networkidle',timeout:60000});
await q.waitForTimeout(2500);
await q.locator('button:has-text("Connect wallet to adopt")').first().click().catch(e=>console.log('adopt click err',String(e).slice(0,80)));
await q.waitForTimeout(2000);
const modal2=await q.evaluate(()=>({hasWallet:/wallet|sign in|metamask|walletconnect|scan|qr/i.test(document.body.innerText), dialog:!!document.querySelector('[role=dialog]')}));
console.log('AFTER_ADOPT', JSON.stringify(modal2));
await q.screenshot({path:`${OUT}/mypet-adopt-modal.png`});
await b2.close();

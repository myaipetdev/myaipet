import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa-shots';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
let nerr=[];
p.on('response', r=>{ if(r.status()>=400) nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai','')); });
// Community OPEN
await p.goto('https://app.myaipet.ai/?section=community',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);
await p.screenshot({path:SHOTS+'/community-before-open.png'});
const before=await p.evaluate(()=>document.body.innerText.length);
const els=await p.$$('button');
for(const el of els){ if((await el.textContent()||'').trim().startsWith('OPEN')){ await el.click(); break; } }
await p.waitForTimeout(2000);
const modal=await p.evaluate(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].find(x=>x.offsetHeight>0);return d?d.innerText.slice(0,150).replace(/\n/g,' '):'NO-MODAL';});
await p.screenshot({path:SHOTS+'/community-after-open.png'});
console.log('Community OPEN -> modal:', JSON.stringify(modal), 'lenChanged:', before!==(await p.evaluate(()=>document.body.innerText.length)));

// pet thought 403 - inspect the /api/pets/22/thought response body
const r=await p.request.get('https://app.myaipet.ai/api/pets/22/thought').catch(e=>null);
if(r) console.log('pets/22/thought status:', r.status(), 'body:', (await r.text()).slice(0,150));
await b.close();

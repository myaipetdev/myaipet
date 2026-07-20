import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa-shots';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
let cerr=[],nerr=[];
p.on('console', m=>{ if(m.type()==='error') cerr.push(m.text()); });
p.on('response', r=>{ if(r.status()>=400) nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai','')); });
await p.goto('https://app.myaipet.ai/?section=community',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);
// snapshot dialogs/overlays count before
const dlgBefore=await p.evaluate(()=>document.querySelectorAll('[role="dialog"],[class*="lightbox" i],[class*="overlay" i]').length);
const htmlBefore=await p.evaluate(()=>document.body.innerHTML.length);
// click OPEN
const els=await p.$$('button'); let openBtn;
for(const el of els){ if((await el.textContent()||'').trim().startsWith('OPEN')){ openBtn=el; break; } }
console.log('OPEN found:', !!openBtn, 'enabled:', openBtn?await openBtn.isEnabled():null);
nerr=[];cerr=[];
if(openBtn){ await openBtn.scrollIntoViewIfNeeded(); await openBtn.click(); }
await p.waitForTimeout(2500);
const dlgAfter=await p.evaluate(()=>document.querySelectorAll('[role="dialog"],[class*="lightbox" i],[class*="overlay" i]').length);
const htmlAfter=await p.evaluate(()=>document.body.innerHTML.length);
await p.screenshot({path:SHOTS+'/community-open-click.png'});
console.log('OPEN click -> dlgBefore/After:',dlgBefore,dlgAfter,'htmlDelta:',htmlAfter-htmlBefore,'url:',p.url().split('?')[1],'nerr:',JSON.stringify([...new Set(nerr)]),'cerr:',JSON.stringify([...new Set(cerr)]));
// now click the center card image
const card=await p.$('img[alt], [class*="card" i] img, figure');
if(card){ nerr=[]; await card.click({force:true}).catch(e=>console.log('cardclickerr',e.message.slice(0,40))); await p.waitForTimeout(2000);
  const dlg2=await p.evaluate(()=>document.querySelectorAll('[role="dialog"]').length);
  console.log('card click -> dialogs:',dlg2,'nerr:',JSON.stringify([...new Set(nerr)])); }
await b.close();

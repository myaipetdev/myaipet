import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa-shots';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
let cerr=[],nerr=[];
p.on('console', m=>{ if(m.type()==='error') cerr.push(m.text()); });
p.on('pageerror', e=>cerr.push('PAGEERR:'+e.message));
p.on('response', r=>{ if(r.status()>=400) nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai','')); });
async function closeModal(){
  for(let i=0;i<3;i++){ const open=await p.evaluate(()=>{const d=document.querySelector('[role="dialog"]');return d&&d.offsetHeight>0;}); if(!open)break; await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
}
async function clickBtn(txt, exact=false){
  cerr=[];nerr=[];
  const els=await p.$$('button');
  let clicked=false,err=null;
  for(const el of els){ const t=(await el.textContent()||'').trim(); if(exact? t===txt : t.startsWith(txt)){ 
    await el.scrollIntoViewIfNeeded().catch(()=>{});
    try{ await el.click({timeout:4000}); clicked=true; }catch(e){ err=e.message.slice(0,40); } break; } }
  await p.waitForTimeout(1400);
  const modal=await p.evaluate(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].find(x=>x.offsetHeight>0);return d?d.innerText.slice(0,50).replace(/\n/g,' '):'';});
  const toast=await p.evaluate(()=>{const t=[...document.querySelectorAll('[class*="toast" i],[role="status"]')].map(e=>e.innerText).filter(Boolean).join('|');return t.slice(0,100);});
  console.log(`  ["${txt}"] clk=${clicked}${err?' ERR:'+err:''} modal="${modal}" toast="${toast}" nerr=${JSON.stringify([...new Set(nerr)])}`);
  return {clicked,modal,toast};
}
async function goSection(nav){ await closeModal(); const els=await p.$$('button'); for(const el of els){ if((await el.textContent()||'').trim()===nav){ await el.click(); break; } } await p.waitForTimeout(2000); }

await p.goto('https://app.myaipet.ai', {waitUntil:'networkidle', timeout:60000});
await p.waitForTimeout(2500);

console.log('== COMMUNITY ==');
await goSection('Community');
await clickBtn('OPEN'); await closeModal();
await clickBtn('‹',true); await clickBtn('›',true);
await clickBtn('Connect wallet to join'); await closeModal();

console.log('== SEASON REWARDS ==');
await goSection('Season Rewards');
await clickBtn('Earn',false);
await clickBtn('Compete',false);
await clickBtn('Connect',false);
await clickBtn('Coming soon',true);

console.log('== CARDS ==');
await goSection('Cards');
await p.screenshot({path:SHOTS+'/sec-cards.png'});
console.log('cards text:', JSON.stringify((await p.evaluate(()=>document.body.innerText)).slice(0,300)));

console.log('== BRACKET ==');
await goSection('Bracket');
await p.screenshot({path:SHOTS+'/sec-bracket.png'});
console.log('bracket text:', JSON.stringify((await p.evaluate(()=>document.body.innerText.slice(0,300)))));

console.log('== PETCLAW ==');
await goSection('PetClaw');
await p.screenshot({path:SHOTS+'/sec-petclaw.png'});
console.log('petclaw text:', JSON.stringify((await p.evaluate(()=>document.body.innerText.slice(0,400)))));

console.log('== AGENT OFFICE ==');
await goSection('Agent Office');
await p.screenshot({path:SHOTS+'/sec-office.png'});
console.log('office text:', JSON.stringify((await p.evaluate(()=>document.body.innerText.slice(0,300)))));
await b.close();

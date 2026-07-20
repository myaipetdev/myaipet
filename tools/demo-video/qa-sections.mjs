import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa-shots';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
let cerr=[],nerr=[];
p.on('console', m=>{ if(m.type()==='error') cerr.push(m.text()); });
p.on('pageerror', e=>cerr.push('PAGEERR:'+e.message));
p.on('response', r=>{ if(r.status()>=400) nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai','')); });

async function clickBtn(txt, exact=false){
  cerr=[];nerr=[];
  const before=p.url();
  const els=await p.$$('button');
  let clicked=false, err=null;
  for(const el of els){ const t=(await el.textContent()||'').trim(); if(exact? t===txt : t.startsWith(txt)){ 
    await el.scrollIntoViewIfNeeded().catch(()=>{});
    try{ await el.click({timeout:4000}); clicked=true; }catch(e){ err=e.message.slice(0,40); }
    break; } }
  await p.waitForTimeout(1500);
  const modal = await p.evaluate(()=>{ const d=[...document.querySelectorAll('[role="dialog"]')].find(x=>x.offsetHeight>0); return d?d.innerText.slice(0,60).replace(/\n/g,' '):''; });
  const toast = await p.evaluate(()=>{ const t=[...document.querySelectorAll('[class*="toast" i],[role="status"]')].map(e=>e.innerText).filter(Boolean).join('|'); return t.slice(0,100); });
  console.log(`  ["${txt}"] clicked=${clicked}${err?' ERR:'+err:''} url:${before.split('?')[1]||'/'}->${p.url().split('?')[1]||'/'} modal="${modal}" toast="${toast}" nerr=${JSON.stringify([...new Set(nerr)])}`);
}
async function goSection(nav){
  const els=await p.$$('button');
  for(const el of els){ if((await el.textContent()||'').trim()===nav){ await el.click(); break; } }
  await p.waitForTimeout(2000);
}
await p.goto('https://app.myaipet.ai', {waitUntil:'networkidle', timeout:60000});
await p.waitForTimeout(2500);

console.log('== MY PET (guest) ==');
await goSection('My Pet');
await p.screenshot({path:SHOTS+'/sec-mypet.png'});
await clickBtn('Feed',true);
await clickBtn('Play',true);
await clickBtn('Pet',true);
await clickBtn('Connect wallet to adopt');

console.log('== COMMUNITY (guest) ==');
await goSection('Community');
await p.screenshot({path:SHOTS+'/sec-community.png'});
await clickBtn('OPEN');
await p.keyboard.press('Escape');
await clickBtn('‹',true);
await clickBtn('›',true);
await clickBtn('Connect wallet to join');
await p.keyboard.press('Escape');

console.log('== SEASON REWARDS (guest) ==');
await goSection('Season Rewards');
await p.screenshot({path:SHOTS+'/sec-season.png'});
await clickBtn('Earn',false);
await clickBtn('Compete',false);
await clickBtn('Connect',false);
await clickBtn('Coming soon',true);
await b.close();

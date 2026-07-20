import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa-shots';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
let consoleErrs=[], netErrs=[];
p.on('console', m=>{ if(m.type()==='error') consoleErrs.push(m.text()); });
p.on('pageerror', e=>{ consoleErrs.push('PAGEERROR: '+e.message); });
p.on('response', r=>{ if(r.status()>=400) netErrs.push(r.status()+' '+r.url()); });

async function state(){ return {url:p.url(), dialog: await p.evaluate(()=>!!document.querySelector('[role="dialog"] [class*="rk"], .iekbcc0'))}; }
async function clickText(txt, exact=true){
  const els = await p.$$('button, a');
  for(const el of els){ const t=(await el.textContent()||'').trim(); if(exact? t===txt : t.startsWith(txt)){ 
    try{ await el.scrollIntoViewIfNeeded(); await el.click({timeout:5000}); return true;}catch(e){return 'ERR:'+e.message.slice(0,50);} } }
  return 'NOTFOUND';
}
async function test(label, txt, exact=true){
  consoleErrs=[];netErrs=[];
  const beforeUrl=p.url();
  const r=await clickText(txt,exact);
  await p.waitForTimeout(2000);
  const modal = await p.evaluate(()=>{ const d=document.querySelector('[role="dialog"]'); return d?d.innerText.slice(0,80):(document.querySelector('.iekbcc0,._1ckjpok1')?'RK-MODAL':''); });
  const toast = await p.evaluate(()=>{ const t=[...document.querySelectorAll('[class*="toast"],[role="status"],[class*="Toast"]')].map(e=>e.innerText).join('|'); return t.slice(0,120); });
  console.log(`[${label}] click=${r} url:${beforeUrl.replace('https://app.myaipet.ai','')} -> ${p.url().replace('https://app.myaipet.ai','')} modal=${JSON.stringify(modal)} toast=${JSON.stringify(toast)} cerr=${[...new Set(consoleErrs)].length} nerr=${JSON.stringify([...new Set(netErrs)])}`);
  // close any modal
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
}

await p.goto('https://app.myaipet.ai', {waitUntil:'networkidle', timeout:60000});
await p.waitForTimeout(2500);

await test('HERO Adopt your pet','Adopt your pet');
await p.goto('https://app.myaipet.ai',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
await test('HERO Explore Community','Explore Community');
await p.goto('https://app.myaipet.ai',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
await test('CARD AI Video Engine','AI Video Engine',false);
await test('CARD Evolve & Equip','Evolve & Equip',false);
await test('CARD Social Circle','Social Circle',false);
await test('CARD Portable Legacy','Portable Legacy',false);
await p.goto('https://app.myaipet.ai',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
await test('CTA Connect wallet to start','Connect wallet to start');
await test('CTA Adopt Start raising','Adopt',false);
await test('CTA Run the agent loop','▶ Run the agent loop',false);
await b.close();

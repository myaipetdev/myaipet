import { chromium } from 'playwright';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
async function testCard(txt){
  const p = await ctx.newPage();
  let cerr=[],nerr=[];
  p.on('console', m=>{ if(m.type()==='error') cerr.push(m.text()); });
  p.on('response', r=>{ if(r.status()>=400) nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai','')); });
  await p.goto('https://app.myaipet.ai', {waitUntil:'networkidle', timeout:60000});
  await p.waitForTimeout(2000);
  const before=p.url();
  const els=await p.$$('button');
  let clicked=false;
  for(const el of els){ const t=(await el.textContent()||'').trim(); if(t.startsWith(txt)){ await el.scrollIntoViewIfNeeded(); await el.click({timeout:5000}).then(()=>clicked=true).catch(()=>{}); break; } }
  await p.waitForTimeout(1800);
  console.log(`[${txt}] clicked=${clicked} ${before.replace('https://app.myaipet.ai','')||'/'} -> ${p.url().replace('https://app.myaipet.ai','')||'/'} nerr=${JSON.stringify([...new Set(nerr)])}`);
  await p.close();
}
await testCard('AI Video Engine');
await testCard('Evolve & Equip');
await testCard('Social Circle');
await testCard('Portable Legacy');
await b.close();

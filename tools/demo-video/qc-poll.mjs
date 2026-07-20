import { chromium } from 'playwright';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';
const ctx=await b.newContext({viewport:{width:1440,height:2200}});
const p=await ctx.newPage();
let nerr=[]; p.on('response',r=>{if(r.status()>=400)nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai',''));});
await p.goto('https://app.myaipet.ai/?section=worldcup&tour=1',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);
// expand seasonal by clicking the big seasonal toggle button (has chevron)
const btns=await p.$$('button');
for(const el of btns){ const t=((await el.textContent())||'').trim(); if(/^SeasonalWorld Cup 2026 national/i.test(t)){ await el.scrollIntoViewIfNeeded(); await el.click(); break; } }
await p.waitForTimeout(1500);
await p.screenshot({path:`${SHOTS}/worldcup-poll-expanded.png`,fullPage:true});
const pollText=await p.evaluate(()=>{
  const el=[...document.querySelectorAll('*')].find(e=>/Predict the Champion/i.test(e.textContent||'')&&e.children.length<20);
  return el?el.innerText.slice(0,900):'NOT FOUND';
});
console.log('POLL TEXT:\n',pollText);
console.log('nerr:',JSON.stringify([...new Set(nerr)]));
await b.close();
console.log('DONE');

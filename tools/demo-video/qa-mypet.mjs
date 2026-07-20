import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa-shots';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
let nerr=[];
p.on('response', r=>{ if(r.status()>=400) nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai','')); });
await p.goto('https://app.myaipet.ai/?section=my+pet', {waitUntil:'networkidle', timeout:60000});
await p.waitForTimeout(2500);
// capture full innertext of my pet area
const txt=await p.evaluate(()=>document.body.innerText);
console.log('MYPET TEXT:', JSON.stringify(txt.slice(0,600)));
// snapshot DOM around Feed button region before/after
async function snap(){ return await p.evaluate(()=>{ 
  // grab any stat/number text near buttons
  const main=document.querySelector('main')||document.body; return main.innerText.slice(0,600); }); }
const before=await snap();
await p.screenshot({path:SHOTS+'/mypet-before.png'});
// click Feed
const els=await p.$$('button'); let feedEl;
for(const el of els){ if((await el.textContent()||'').trim()==='Feed'){ feedEl=el; break; } }
nerr=[];
await feedEl.click();
await p.waitForTimeout(2500);
const after=await snap();
await p.screenshot({path:SHOTS+'/mypet-after-feed.png'});
console.log('CHANGED:', before!==after);
console.log('nerr after Feed:', JSON.stringify([...new Set(nerr)]));
// diff snippet
if(before!==after){ console.log('BEFORE:',JSON.stringify(before.slice(0,200))); console.log('AFTER:',JSON.stringify(after.slice(0,200))); }
await b.close();

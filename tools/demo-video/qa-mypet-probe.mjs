import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa';
const browser = await chromium.launch({ args:['--enable-gpu','--use-angle=metal'] });
const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
const p = await ctx.newPage();
const neterr=[]; p.on('response',r=>{if(r.status()>=400)neterr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai',''));});
await p.goto('https://app.myaipet.ai/?section=my+pet',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);

// bounding boxes of key elements
const boxes = await p.evaluate(()=>{
  const pick=(txt)=>{const e=[...document.querySelectorAll('*')].find(el=>el.children.length===0&&(el.innerText||'').trim()===txt);return e?e.getBoundingClientRect():null;};
  const btn=(txt)=>{const e=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim()===txt);return e?{r:e.getBoundingClientRect(),z:getComputedStyle(e).zIndex}:null;};
  const adopt=[...document.querySelectorAll('*')].find(el=>(el.innerText||'').trim().startsWith('Adopt your own pet'));
  return {
    feed:btn('Feed'), play:btn('Play'), pet:btn('Pet'),
    adoptBox: adopt?adopt.getBoundingClientRect():null,
    adoptPos: adopt?getComputedStyle(adopt).position:null,
    scrollH: document.body.scrollHeight, innerH: window.innerHeight,
  };
});
console.log('BOXES', JSON.stringify(boxes,null,1));

// Test care buttons: read stat, click, read stat
async function readStats(){ return await p.evaluate(()=>{
  const nums={}; ['Happy','Energy','Bond'].forEach(l=>{
    const lab=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.innerText||'').trim()===l);
    if(lab){ let row=lab.parentElement; const m=(row.innerText||'').match(/(\d+)/); nums[l]=m?m[1]:null; }
  }); return nums;
}); }
const before = await readStats();
console.log('STATS_BEFORE', JSON.stringify(before));
async function clickBtn(t){ const b=await p.$(`button:has-text("${t}")`); if(b){await b.click();await p.waitForTimeout(1800);} return !!b; }
for(const b of ['Feed','Play','Pet']){
  neterr.length=0;
  const ok=await clickBtn(b);
  const after=await readStats();
  console.log(`AFTER_${b}`, ok, JSON.stringify(after), 'net', JSON.stringify([...new Set(neterr)]));
}
// boop the poster
const boop = await p.$('button[aria-label="Boop Dordor"]');
if(boop){ await boop.click(); await p.waitForTimeout(1500); console.log('BOOP clicked, stats', JSON.stringify(await readStats())); }
await p.screenshot({path:`${OUT}/mypet-after-care.png`});

// zoom poster region
await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(400);
await p.screenshot({path:`${OUT}/mypet-poster.png`, clip:{x:600,y:270,width:240,height:290}});
await browser.close();
console.log('DONE');

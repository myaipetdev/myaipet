import { chromium } from 'playwright';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';

for(const [name,url] of [['cards','?section=cards'],['worldcup','?section=worldcup&tour=1'],['community','?section=community&tour=1']]){
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  const p=await ctx.newPage();
  await p.goto('https://app.myaipet.ai/'+url,{waitUntil:'networkidle',timeout:60000});
  await p.waitForTimeout(2500);
  const ov=await p.evaluate(()=>({
    docW:document.documentElement.scrollWidth, winW:window.innerWidth,
    overflowX: document.documentElement.scrollWidth>window.innerWidth+2,
    // any element wider than viewport
    wide:[...document.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>window.innerWidth+4 && el.getBoundingClientRect().width>30).slice(0,4).map(el=>({t:el.tagName,c:(el.className||'').toString().slice(0,30),w:Math.round(el.getBoundingClientRect().width)}))
  }));
  console.log(`[${name}] overflowX=${ov.overflowX} docW=${ov.docW} winW=${ov.winW} wide=${JSON.stringify(ov.wide)}`);
  await ctx.close();
}

// Square interactivity: click in the square, check the "You" pet position changes
{
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  const p=await ctx.newPage();
  await p.goto('https://app.myaipet.ai/?section=community&tour=1',{waitUntil:'networkidle',timeout:60000});
  await p.waitForTimeout(2500);
  // find the square region and click within it
  const sqBox=await p.evaluate(()=>{
    const el=[...document.querySelectorAll('div')].find(e=>e.offsetWidth>500 && e.offsetHeight>250 && /THE CAFÉ/i.test(e.textContent||''));
    if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};
  });
  console.log('squareBox:',JSON.stringify(sqBox));
  if(sqBox){
    // capture "You" pet transform before
    const before=await p.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>/^You/.test((e.textContent||'').trim())&&e.offsetWidth<120); return el?el.parentElement.style.transform||getComputedStyle(el.parentElement).transform:null;});
    await p.mouse.click(sqBox.x+sqBox.w*0.3, sqBox.y+sqBox.h*0.4);
    await p.waitForTimeout(1500);
    const after=await p.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>/^You/.test((e.textContent||'').trim())&&e.offsetWidth<120); return el?el.parentElement.style.transform||getComputedStyle(el.parentElement).transform:null;});
    console.log('You-pet transform before:',before,'after:',after,'changed:',before!==after);
  }
  await ctx.close();
}
await b.close();
console.log('DONE');

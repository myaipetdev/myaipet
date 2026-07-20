import { chromium } from 'playwright';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';
const ctx=await b.newContext({viewport:{width:1440,height:1600}});
const p=await ctx.newPage();
await p.goto('https://app.myaipet.ai/?section=worldcup&tour=1',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);
// Full-page screenshot to see the whole poll
await p.screenshot({path:`${SHOTS}/worldcup-full.png`,fullPage:true});
// Precisely click the exact "Hide" button (trimmed text === Hide)
const btns=await p.$$('button');
let realHide;
for(const el of btns){ if(((await el.textContent())||'').trim()==='Hide'){ realHide=el; break; } }
const before=await p.evaluate(()=>/WORLD CUP 2026 NATIONAL PETS/i.test(document.body.innerText));
console.log('realHide found:',!!realHide,'seasonalVisibleBefore:',before);
if(realHide){ await realHide.scrollIntoViewIfNeeded(); await realHide.click(); await p.waitForTimeout(1200);
  const after=await p.evaluate(()=>({still:/WORLD CUP 2026 NATIONAL PETS/i.test(document.body.innerText), showBtn:[...document.querySelectorAll('button')].map(x=>(x.textContent||'').trim()).find(t=>/show.*world cup|world cup.*module/i.test(t))||null}));
  console.log('AFTER real Hide:',JSON.stringify(after));
  await p.screenshot({path:`${SHOTS}/worldcup-hidden.png`,fullPage:true});
}
await b.close();
console.log('DONE');

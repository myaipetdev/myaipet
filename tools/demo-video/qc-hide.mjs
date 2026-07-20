import { chromium } from 'playwright';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
await p.goto('https://app.myaipet.ai/?section=worldcup&tour=1',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2000);
// scroll to seasonal module
await p.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>/WORLD CUP 2026 national/i.test(e.textContent||'')&&e.children.length<3); el&&el.scrollIntoView({block:'center'});});
await p.waitForTimeout(800);
await p.screenshot({path:`${SHOTS}/hide-before.png`});
// count seasonal module descendants
const before=await p.evaluate(()=>{
  const hdr=[...document.querySelectorAll('*')].find(e=>/WORLD CUP 2026 NATIONAL PETS/i.test(e.textContent||'')&&e.children.length<4);
  return {hasNationalCopy:/Reimagine your pet as a nation/i.test(document.body.innerText), hideBtnCount:[...document.querySelectorAll('button')].filter(x=>/^Hide$/i.test((x.textContent||'').trim())).length};
});
console.log('BEFORE:',JSON.stringify(before));
const hideBtn=await p.$('button:has-text("Hide")');
await hideBtn.scrollIntoViewIfNeeded();
await hideBtn.click();
await p.waitForTimeout(1200);
await p.screenshot({path:`${SHOTS}/hide-after.png`});
const after=await p.evaluate(()=>({hasNationalCopy:/Reimagine your pet as a nation/i.test(document.body.innerText), showBtn:[...document.querySelectorAll('button')].map(x=>(x.textContent||'').trim()).filter(t=>/show|hide|world cup/i.test(t)).slice(0,5)}));
console.log('AFTER:',JSON.stringify(after));
await b.close();
console.log('DONE');

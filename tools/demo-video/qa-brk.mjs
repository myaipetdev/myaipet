import { chromium } from 'playwright';
const BASE='https://app.myaipet.ai';
const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
for(const u of ['/?section=worldcup','/?section=worldcup&tour=1']){
  await p.goto(BASE+u,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(4500);
  const ids=await p.evaluate(()=>[...document.querySelectorAll('[id]')].map(e=>e.id).filter(i=>i.startsWith('wc')||i.includes('bracket')||i.includes('seasonal')));
  const hasJump=await p.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Play the bracket')));
  // scroll to bottom to trigger lazy, recheck
  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)); await p.waitForTimeout(1500);
  const idsAfter=await p.evaluate(()=>[...document.querySelectorAll('[id]')].map(e=>e.id).filter(i=>i.startsWith('wc')));
  console.log(u,'=> jumpBtnPresent:',hasJump,'wc-ids(top):',JSON.stringify(ids),'wc-ids(after scroll):',JSON.stringify(idsAfter));
}
await b.close();

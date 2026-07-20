import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa';
const browser = await chromium.launch({ args:['--enable-gpu','--use-angle=metal'] });
const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
const p = await ctx.newPage();
const neterr=[]; p.on('response',r=>{if(r.status()>=400)neterr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai',''));});
await p.goto('https://app.myaipet.ai/?section=my+pet',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);
// read full text of the stats+ticker region
const region = async ()=> await p.evaluate(()=>{
  const card=[...document.querySelectorAll('*')].find(e=>(e.innerText||'').includes('MOCHI REMEMBERS'));
  // climb to a container that also has Happy
  let c=card; for(let i=0;i<6&&c;i++){ if((c.innerText||'').includes('Happy')&&(c.innerText||'').includes('MOCHI REMEMBERS'))break; c=c.parentElement; }
  return c?c.innerText:'(none)';
});
console.log('REGION_BEFORE', JSON.stringify(await region()));
async function click(t){ const b=p.locator(`button:has-text("${t}")`).first(); await b.scrollIntoViewIfNeeded(); neterr.length=0; await b.click(); await p.waitForTimeout(2000); console.log(`--after ${t}-- net`,JSON.stringify([...new Set(neterr)])); console.log(await region()); }
await click('Feed');
await click('Play');
await click('Pet');
// boop
const boop=p.locator('button[aria-label="Boop Dordor"]');
if(await boop.count()){ await boop.first().scrollIntoViewIfNeeded(); await boop.first().click(); await p.waitForTimeout(1500); console.log('BOOP done'); console.log(await region()); }
await p.screenshot({path:`${OUT}/mypet-func-after.png`, fullPage:true});
await browser.close();
console.log('DONE');

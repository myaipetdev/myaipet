import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa';
const SEL='button, [role=button], a, input[type=button], input[type=submit], summary, [onclick], select, textarea, input';
const browser=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
async function run(vp,tag){
  const ctx=await browser.newContext({viewport:vp});
  const p=await ctx.newPage();
  const cerr=[],neterr=[];
  p.on('console',m=>{if(m.type()==='error')cerr.push(m.text().slice(0,200));});
  p.on('response',r=>{if(r.status()>=400)neterr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai',''));});
  const resp=await p.goto('https://app.myaipet.ai/studio',{waitUntil:'networkidle',timeout:60000}).catch(e=>({err:String(e)}));
  console.log(`[${tag}] STATUS`,resp&&resp.status?resp.status():JSON.stringify(resp),'URL',p.url());
  await p.waitForTimeout(3000);
  const body=await p.evaluate(()=>document.body.innerText);
  console.log(`[${tag}] BODY`,JSON.stringify(body.slice(0,1600)));
  await p.screenshot({path:`${OUT}/studio-${tag}-top.png`});
  const ctrls=await p.evaluate((sel)=>[...document.querySelectorAll(sel)].filter(e=>e.offsetParent!==null||e.getClientRects().length).map(e=>{
    const t=e.tagName.toLowerCase();let txt=(e.innerText||'').trim();if((t==='input'||t==='textarea')&&!txt)txt=(e.value||e.placeholder||'').trim();
    return {t,txt:txt.slice(0,45),aria:e.getAttribute('aria-label')||'',ph:e.getAttribute('placeholder')||''};
  }).filter(x=>x.txt||x.aria||x.ph),SEL);
  console.log(`[${tag}] CTRLS`,JSON.stringify(ctrls));
  await p.evaluate(()=>window.scrollTo(0,9999)); await p.waitForTimeout(1000);
  await p.screenshot({path:`${OUT}/studio-${tag}-bottom.png`});
  console.log(`[${tag}] CONSOLE_ERR`,JSON.stringify([...new Set(cerr)]));
  console.log(`[${tag}] NET_ERR`,JSON.stringify([...new Set(neterr)]));
  await ctx.close();
}
await run({width:1440,height:900},'desk');
await run({width:390,height:844},'mob');
await browser.close();
console.log('DONE');

import { chromium } from 'playwright';
const SEL = 'button, [role=button], a, input[type=button], input[type=submit], summary, [onclick]';
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const resp = await p.goto('https://app.myaipet.ai/studio', { waitUntil: 'networkidle', timeout: 60000 }).catch(e=>({err:String(e)}));
console.log('STATUS', resp && resp.status ? resp.status() : JSON.stringify(resp));
console.log('URL', p.url());
await p.waitForTimeout(2500);
const grab = async (label) => {
  const arr = await p.evaluate((sel)=>{
    return [...document.querySelectorAll(sel)].map(el=>{
      const tag=el.tagName.toLowerCase();
      let txt=(el.innerText||'').trim();
      if(tag==='input'&&!txt)txt=(el.value||'').trim();
      const vis=!!(el.offsetParent!==null||el.getClientRects().length);
      return {tag,text:txt,val:el.value||'',aria:el.getAttribute('aria-label')||'',vis};
    });
  }, SEL);
  console.log('=== '+label+' (n='+arr.length+') ===');
  console.log(JSON.stringify(arr.filter(a=>a.vis)));
};
await grab('STUDIO-INITIAL');
// Try to reveal Director controls / editor by clicking a template card if present
// Screenshot for reference
await p.screenshot({path:'/tmp/studio.png', fullPage:true}).catch(()=>{});
// try clicking things that open editor/director: enumerate candidate buttons
const cands = await p.evaluate((sel)=>[...document.querySelectorAll(sel)].filter(e=>e.offsetParent!==null).map((e,i)=>({i,t:(e.innerText||'').trim().slice(0,40)})).filter(x=>x.t),SEL);
console.log('CANDS', JSON.stringify(cands));
await browser.close();

import { chromium } from 'playwright';
const SEL = 'button, [role=button], a, input[type=button], input[type=submit], summary, [onclick]';
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('https://app.myaipet.ai/studio', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(2000);
const grab = async (label) => {
  const arr = await p.evaluate((sel)=>[...document.querySelectorAll(sel)].map(el=>{
    const tag=el.tagName.toLowerCase();let txt=(el.innerText||'').trim();
    if(tag==='input'&&!txt)txt=(el.value||'').trim();
    const vis=!!(el.offsetParent!==null||el.getClientRects().length);
    return {tag,text:txt,aria:el.getAttribute('aria-label')||'',vis};
  }).filter(a=>a.vis), SEL);
  console.log('=== '+label+' (n='+arr.length+') ===');
  console.log(JSON.stringify(arr));
  return arr;
};

// 1. Open engine dropdown (Grok Imagine ANCHOR ▾)
await p.evaluate((sel)=>{const b=[...document.querySelectorAll(sel)].find(e=>(e.innerText||'').includes('ANCHOR'));if(b)b.click();},SEL);
await p.waitForTimeout(600);
await grab('ENGINE-DROPDOWN-OPEN');
// close it
await p.keyboard.press('Escape').catch(()=>{});
await p.waitForTimeout(300);

// 2. Type a prompt into the textarea to enable Generate/Director controls
const typed = await p.evaluate(()=>{
  const ta=document.querySelector('textarea');
  if(ta){ta.focus();return true;}
  return false;
});
if(typed){
  await p.keyboard.type('Dordor doing a backflip on the beach', {delay:5});
  await p.waitForTimeout(800);
}
await grab('AFTER-PROMPT-TYPED');

// 3. Click a template card to enter Director/editor mode
await p.evaluate((sel)=>{const b=[...document.querySelectorAll(sel)].find(e=>(e.innerText||'').includes('Cutie idol dance'));if(b)b.click();},SEL);
await p.waitForTimeout(1500);
await grab('AFTER-TEMPLATE-CLICK');

// screenshot
await p.screenshot({path:'/tmp/studio2.png', fullPage:true}).catch(()=>{});
await browser.close();

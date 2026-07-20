import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });

async function capSeason(vp, tag){
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width<500, hasTouch: vp.width<500, deviceScaleFactor: vp.width<500?2:1 });
  const page = await ctx.newPage();
  await page.goto('https://app.myaipet.ai/?section=airdrop', { waitUntil:'networkidle', timeout:60000 });
  await page.waitForTimeout(2500);
  // full page scroll shots
  const h = await page.evaluate(()=>document.body.scrollHeight);
  let y=0,i=0; const step = vp.height-40;
  while(y<h && i<14){ await page.evaluate(sy=>window.scrollTo(0,sy),y); await page.waitForTimeout(500); await page.screenshot({path:`${OUT}/${tag}-${String(i).padStart(2,'0')}.png`}); y+=step; i++; }
  // find Earn/Compete tabs
  const tabTexts = await page.evaluate(()=>[...document.querySelectorAll('button,[role=tab],a')].map(e=>(e.innerText||'').trim()).filter(t=>/^(earn|compete)$/i.test(t)));
  console.log(tag,'tabs:',JSON.stringify(tabTexts),'height',h);
  // Try clicking Compete tab
  const compete = page.locator('button:has-text("Compete"), [role=tab]:has-text("Compete")').first();
  if(await compete.count()){ await compete.scrollIntoViewIfNeeded(); await compete.click().catch(()=>{}); await page.waitForTimeout(1200); await page.screenshot({path:`${OUT}/${tag}-compete.png`}); }
  await ctx.close();
}
await capSeason({width:1440,height:900},'sd');
await capSeason({width:390,height:844},'sm');

// Re-test Studio nav button precisely
const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
const page = await ctx.newPage();
await page.goto('https://app.myaipet.ai', { waitUntil:'networkidle', timeout:60000 });
await page.waitForTimeout(1200);
const btn = page.locator('button:has-text("Studio")').first();
console.log('Studio btn count', await btn.count());
await btn.click().catch(e=>console.log('click err',e.message));
await page.waitForTimeout(2000);
console.log('after Studio click url:', page.url());
await page.screenshot({path:`${OUT}/studio-click.png`});
await ctx.close();
await browser.close();

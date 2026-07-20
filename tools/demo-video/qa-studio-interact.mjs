import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa';
const browser=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
const neterr=[]; p.on('response',r=>{if(r.status()>=400)neterr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai',''));});
await p.goto('https://app.myaipet.ai/studio',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);

const promptVal=async()=>await p.evaluate(()=>document.querySelector('textarea')?.value||'');
console.log('PROMPT_INIT', JSON.stringify(await promptVal()));

// 1. Click a chip suggestion "dancing on a sunset beach"
await p.locator('button:has-text("dancing on a sunset beach")').first().click();
await p.waitForTimeout(800);
console.log('PROMPT_AFTER_CHIP', JSON.stringify(await promptVal()));

// 2. Click a template card "Cutie idol dance"
neterr.length=0;
await p.locator('button:has-text("Cutie idol dance")').first().click();
await p.waitForTimeout(1500);
console.log('PROMPT_AFTER_TEMPLATE', JSON.stringify(await promptVal()));
console.log('net after template', JSON.stringify([...new Set(neterr)]));
await p.screenshot({path:`${OUT}/studio-after-template.png`});

// 3. Style select Anime
await p.locator('button:has-text("Anime")').first().click();
await p.waitForTimeout(500);
// 4. Output Video toggle
await p.locator('button:has-text("Video")').first().click();
await p.waitForTimeout(800);
const engineTxt=await p.evaluate(()=>{const e=[...document.querySelectorAll('*')].find(el=>(el.innerText||'').includes('COST'));return e?e.closest('*').innerText:'';});
console.log('AFTER_VIDEO_TOGGLE cost region', JSON.stringify(engineTxt.slice(0,200)));
await p.screenshot({path:`${OUT}/studio-video-mode.png`});

// 5. Engine dropdown
await p.locator('button:has-text("ANCHOR")').first().click();
await p.waitForTimeout(700);
const menu=await p.evaluate(()=>document.body.innerText);
await p.screenshot({path:`${OUT}/studio-engine-menu.png`});
await p.keyboard.press('Escape');

// 6. Find Generate button and check enabled/disabled + click
const gen=p.locator('button', {hasText:/Generate/i});
const genCount=await gen.count();
console.log('GENERATE_COUNT', genCount);
// look for the main generate CTA
const genState=await p.evaluate(()=>{
  const b=[...document.querySelectorAll('button')].find(x=>/generate/i.test(x.innerText)&&!/what mochi/i.test(x.innerText));
  const start=[...document.querySelectorAll('button')].find(x=>/START HERE|Write a prompt|Generate/i.test((x.innerText||'')+(x.getAttribute('aria-label')||'')));
  return {found:!!b, txt:b?b.innerText.slice(0,60):null, disabled:b?b.disabled:null, startTxt: start?start.innerText.slice(0,80):null};
});
console.log('GEN_STATE', JSON.stringify(genState));

// 7. Director: type idea and Direct it
neterr.length=0;
const dirInput=p.locator('input[aria-label="One-line idea for the Director"]');
await dirInput.scrollIntoViewIfNeeded();
await dirInput.fill('Dordor chasing fireflies at dusk');
await p.locator('button:has-text("Direct it")').first().click();
await p.waitForTimeout(4000);
console.log('net after Direct it', JSON.stringify([...new Set(neterr)]));
const afterDir=await p.evaluate(()=>document.body.innerText);
// print region around director
const idx=afterDir.indexOf('DIRECTOR');
console.log('DIRECTOR_REGION', JSON.stringify(afterDir.slice(idx, idx+400)));
await p.screenshot({path:`${OUT}/studio-after-director.png`, fullPage:false});
await browser.close();
console.log('DONE');

import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa';
const browser=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
const neterr=[]; p.on('response',r=>{if(r.status()>=400)neterr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai',''));});
await p.goto('https://app.myaipet.ai/studio',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);
// Fill prompt directly in textarea
await p.evaluate(()=>{const ta=document.querySelector('textarea');const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;set.call(ta,'Dordor surfing a giant rainbow wave');ta.dispatchEvent(new Event('input',{bubbles:true}));});
await p.waitForTimeout(1200);
// enumerate ALL buttons full text + disabled + rect
const btns=await p.evaluate(()=>[...document.querySelectorAll('button')].map(b=>({txt:(b.innerText||'').replace(/\n/g,' ').trim().slice(0,60),dis:b.disabled,aria:b.getAttribute('aria-label')||'',y:Math.round(b.getBoundingClientRect().top)})).filter(b=>/gener|make|create|render|start here|sign in/i.test(b.txt+b.aria)));
console.log('GEN_CANDIDATES', JSON.stringify(btns,null,1));
// find the generate CTA (aria or text)
const gen=await p.evaluateHandle(()=>[...document.querySelectorAll('button')].find(b=>/generate/i.test((b.innerText||'')+(b.getAttribute('aria-label')||''))));
const genEl=gen.asElement();
if(genEl){
  const info=await genEl.evaluate(b=>({txt:b.innerText.replace(/\n/g,' ').trim(),dis:b.disabled,aria:b.getAttribute('aria-label')||''}));
  console.log('GEN_FOUND', JSON.stringify(info));
  await genEl.scrollIntoViewIfNeeded();
  neterr.length=0;
  await genEl.click({force:true}).catch(e=>console.log('click err',String(e).slice(0,100)));
  await p.waitForTimeout(3000);
  console.log('net after generate click', JSON.stringify([...new Set(neterr)]));
  const body=await p.evaluate(()=>document.body.innerText);
  console.log('BODY_HAS_SIGNIN_MODAL', /sign in|connect wallet|create a free/i.test(body));
  await p.screenshot({path:`${OUT}/studio-after-generate.png`});
} else { console.log('NO GENERATE BUTTON FOUND'); await p.screenshot({path:`${OUT}/studio-nogen.png`, fullPage:true}); }
await browser.close();
console.log('DONE');

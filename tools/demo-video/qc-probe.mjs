import { chromium } from 'playwright';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});

async function probe(url, vp){
  const ctx = await b.newContext({viewport:vp});
  const p = await ctx.newPage();
  let nerr=[];
  p.on('response', r=>{ if(r.status()>=400) nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai','')); });
  await p.goto(url,{waitUntil:'networkidle',timeout:60000});
  await p.waitForTimeout(2500);
  // Fixed banner overlap check
  const overlap = await p.evaluate(()=>{
    const bodyPB = getComputedStyle(document.body).paddingBottom;
    // find fixed elements at bottom
    const fixed=[...document.querySelectorAll('*')].filter(el=>{
      const s=getComputedStyle(el); return s.position==='fixed' && el.getBoundingClientRect().bottom>=window.innerHeight-2 && el.offsetHeight>20 && el.offsetHeight<200;
    }).map(el=>({h:el.offsetHeight, txt:(el.textContent||'').slice(0,40)}));
    return {bodyPB, fixed};
  });
  console.log(`\n=== ${url} @ ${vp.width}x${vp.height} ===`);
  console.log('fixedBottom:', JSON.stringify(overlap));
  // enumerate clickable controls with text
  const controls = await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('button, a, [role="button"]').forEach(el=>{
      const r=el.getBoundingClientRect();
      if(r.width===0||r.height===0) return;
      out.push({tag:el.tagName, txt:(el.textContent||'').trim().slice(0,32), href:el.getAttribute('href')||'', disabled:el.disabled||el.getAttribute('aria-disabled')==='true', w:Math.round(r.width),h:Math.round(r.height)});
    });
    return out;
  });
  // report tiny tap targets on mobile
  if(vp.width<500){
    const tiny=controls.filter(c=>c.h<40 && c.txt);
    console.log('SUB-40px-tall tappables:', JSON.stringify(tiny.slice(0,20)));
  }
  console.log('controls:', JSON.stringify(controls.slice(0,40)));
  console.log('nerr:', JSON.stringify([...new Set(nerr)]));
  await ctx.close();
}

await probe('https://app.myaipet.ai/?section=worldcup&tour=1',{width:1440,height:900});
await probe('https://app.myaipet.ai/?section=community&tour=1',{width:1440,height:900});
await probe('https://app.myaipet.ai/?section=community&tour=1',{width:390,height:844});
await probe('https://app.myaipet.ai/?section=worldcup&tour=1',{width:390,height:844});
await b.close();
console.log('\nDONE');

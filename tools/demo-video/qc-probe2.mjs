import { chromium } from 'playwright';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';

// --- Community: banner vs square overlap + toggles, mobile ---
for(const [vpname,vp] of [['mobile',{width:390,height:844}],['desktop',{width:1440,height:900}]]){
  const ctx=await b.newContext({viewport:vp});
  const p=await ctx.newPage();
  await p.goto('https://app.myaipet.ai/?section=community&tour=1',{waitUntil:'networkidle',timeout:60000});
  await p.waitForTimeout(2500);
  // measure square canvas vs banner
  const geo=await p.evaluate(()=>{
    const banner=[...document.querySelectorAll('*')].find(el=>getComputedStyle(el).position==='fixed' && (el.textContent||'').includes('DEMO TOUR'));
    const canvas=document.querySelector('canvas');
    const sq=[...document.querySelectorAll('div')].find(el=>el.offsetHeight>150 && /THE CAFÉ|café/i.test(el.textContent||'')) ;
    return {
      banner: banner?{top:Math.round(banner.getBoundingClientRect().top),h:banner.offsetHeight}:null,
      canvas: canvas?{bottom:Math.round(canvas.getBoundingClientRect().bottom),top:Math.round(canvas.getBoundingClientRect().top)}:null,
      innerH: window.innerHeight
    };
  });
  console.log(`\n[community/${vpname}] geo=`,JSON.stringify(geo));
  // Test FEED toggle
  const feedBtn=await p.$('button:has-text("Feed")');
  const beforeHtml=await p.evaluate(()=>document.body.innerText.length);
  if(feedBtn){ await feedBtn.click(); await p.waitForTimeout(1500);
    const afterHtml=await p.evaluate(()=>document.body.innerText.length);
    await p.screenshot({path:`${SHOTS}/${vpname}-community-feed.png`});
    console.log(`  FEED toggle: textLen ${beforeHtml} -> ${afterHtml}`);
  }
  // Back to square, test Create yours (guest)
  const sqBtn=await p.$('button:has-text("Square")'); if(sqBtn){await sqBtn.click(); await p.waitForTimeout(800);}
  const createBtn=await p.$('button:has-text("Create yours")');
  const urlBefore=p.url();
  const dlgBefore=await p.evaluate(()=>document.querySelectorAll('[role="dialog"]').length);
  if(createBtn){ await createBtn.click().catch(()=>{}); await p.waitForTimeout(1800);
    const dlgAfter=await p.evaluate(()=>document.querySelectorAll('[role="dialog"]').length);
    await p.screenshot({path:`${SHOTS}/${vpname}-community-createyours.png`});
    console.log(`  CREATE YOURS: url ${urlBefore.split('?')[1]} -> ${p.url().split('?')[1]}, dialogs ${dlgBefore}->${dlgAfter}`);
  }
  await ctx.close();
}

// --- Cards gate: is "your card deck" a real link/button? ---
{
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  const p=await ctx.newPage();
  await p.goto('https://app.myaipet.ai/?section=cards',{waitUntil:'networkidle',timeout:60000});
  await p.waitForTimeout(2000);
  const deck=await p.evaluate(()=>{
    const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0 && /your card deck/i.test(e.textContent||''));
    if(!el) return null;
    const s=getComputedStyle(el);
    return {tag:el.tagName, cursor:s.cursor, color:s.color, textDecoration:s.textDecorationLine, isLink: !!el.closest('a,button')};
  });
  console.log('\n[cards] "your card deck" element:',JSON.stringify(deck));
  await ctx.close();
}

// --- Bracket: PLAY THE BRACKET + Seasonal HIDE toggle ---
{
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  const p=await ctx.newPage();
  let nerr=[]; p.on('response',r=>{if(r.status()>=400)nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai',''));});
  await p.goto('https://app.myaipet.ai/?section=worldcup&tour=1',{waitUntil:'networkidle',timeout:60000});
  await p.waitForTimeout(2000);
  // banner fixed? on worldcup
  const bg=await p.evaluate(()=>{
    const banner=[...document.querySelectorAll('*')].find(el=>(el.textContent||'').includes('DEMO TOUR') && el.offsetHeight>30 && el.offsetHeight<200);
    return banner?{pos:getComputedStyle(banner).position,h:banner.offsetHeight,bottom:Math.round(banner.getBoundingClientRect().bottom),innerH:window.innerHeight}:null;
  });
  console.log('\n[worldcup] banner:',JSON.stringify(bg));
  // Hide seasonal
  const hideBtn=await p.$('button:has-text("Hide")');
  const before=await p.evaluate(()=>/WORLD CUP 2026/i.test(document.body.innerText));
  if(hideBtn){ await hideBtn.click(); await p.waitForTimeout(1200);
    const after=await p.evaluate(()=>/WORLD CUP 2026/i.test(document.body.innerText));
    console.log(`  HIDE seasonal: worldcup-visible ${before} -> ${after}`);
  }
  // Play the bracket
  const playBtn=await p.$('button:has-text("Play the bracket")');
  const y0=await p.evaluate(()=>window.scrollY);
  if(playBtn){ await playBtn.click(); await p.waitForTimeout(1200);
    const y1=await p.evaluate(()=>window.scrollY);
    console.log(`  PLAY THE BRACKET: scrollY ${y0} -> ${y1}, url=${p.url().split('?')[1]}`);
  }
  console.log('  nerr:',JSON.stringify([...new Set(nerr)]));
  await ctx.close();
}
await b.close();
console.log('\nDONE');

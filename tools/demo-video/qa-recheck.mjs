import { chromium } from 'playwright';
const URL='http://localhost:8795/index.html';
const OUT='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad';

(async()=>{
  const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});

  // DESKTOP: video dots real behavior
  let ctx=await b.newContext({viewport:{width:1440,height:900}});
  let p=await ctx.newPage();
  await p.goto(URL,{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  const dotTest=[];
  for(let i of [2,3,1,4]){
    await p.locator('#heroVideoDots .vdot').nth(i).click();
    await p.waitForTimeout(700);
    const st=await p.evaluate(()=>{
      const dots=[...document.querySelectorAll('#heroVideoDots .vdot')];
      return dots.map(d=>({w:d.style.width, bg:d.style.background}));
    });
    const cur=await p.evaluate(()=>window.heroCurrentVideo);
    dotTest.push({clicked:i, heroCurrentVideo:cur, widths:st.map(s=>s.w)});
  }
  console.log('VIDEO DOTS (inline-style based):',JSON.stringify(dotTest,null,1));

  // Copy button: inspect for ANY handler / try clicking + read clipboard via execCommand fallback
  await ctx.grantPermissions(['clipboard-read','clipboard-write']);
  await p.locator('#protocol .code-block').scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  const copyInfo=await p.evaluate(()=>{
    const c=document.querySelector('#protocol .code-block .copy');
    // check listeners not directly detectable; check cursor + onclick
    const cs=getComputedStyle(c);
    return {cursor:cs.cursor, onclick:!!c.onclick, outerHTML:c.outerHTML};
  });
  console.log('COPY BTN INFO:',JSON.stringify(copyInfo));
  await p.evaluate(()=>navigator.clipboard.writeText('SENTINEL')); // seed
  await p.locator('#protocol .code-block .copy').click(); await p.waitForTimeout(500);
  const clip=await p.evaluate(()=>navigator.clipboard.readText());
  console.log('CLIPBOARD AFTER COPY CLICK (seeded SENTINEL):',JSON.stringify(clip));

  await ctx.close();

  // MOBILE: nav state
  ctx=await b.newContext({viewport:{width:390,height:844}});
  p=await ctx.newPage();
  await p.goto(URL,{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  const navState=await p.evaluate(()=>{
    const links=document.querySelector('.nav-links');
    const cta=document.querySelector('a.nav-cta');
    const brand=document.querySelector('.nav-brand');
    // any hamburger?
    const burger=document.querySelector('.nav-toggle,.hamburger,[aria-label*="menu" i],button[class*="menu"]');
    return {
      linksDisplay:links?getComputedStyle(links).display:null,
      ctaVisible:cta?getComputedStyle(cta).display!=='none':null,
      ctaText:cta?cta.textContent.trim():null,
      brandVisible:brand?getComputedStyle(brand).display!=='none':null,
      hamburger: burger?burger.outerHTML.slice(0,120):null
    };
  });
  console.log('MOBILE NAV:',JSON.stringify(navState,null,1));
  await p.screenshot({path:`${OUT}/mobile-nav-top.png`});

  // Mobile: check horizontal overflow (layout break)
  const overflow=await p.evaluate(()=>({
    scrollW:document.documentElement.scrollWidth,
    clientW:document.documentElement.clientWidth,
    overflowsX:document.documentElement.scrollWidth>document.documentElement.clientWidth+2
  }));
  console.log('MOBILE OVERFLOW:',JSON.stringify(overflow));

  // find any element wider than viewport
  const wide=await p.evaluate(()=>{
    const vw=document.documentElement.clientWidth;
    const bad=[];
    document.querySelectorAll('section,div,img,pre,table').forEach(e=>{
      const r=e.getBoundingClientRect();
      if(r.right>vw+5 && r.width>vw*0.5 && r.width<3000){
        bad.push({tag:e.tagName,id:e.id||e.className.toString().slice(0,40),right:Math.round(r.right),w:Math.round(r.width)});
      }
    });
    return bad.slice(0,12);
  });
  console.log('MOBILE WIDE ELEMENTS:',JSON.stringify(wide,null,1));

  await b.close();
})();

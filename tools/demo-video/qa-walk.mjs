import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa-shots';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
let consoleErrs=[], netErrs=[];
p.on('console', m=>{ if(m.type()==='error') consoleErrs.push(m.text()); });
p.on('pageerror', e=>{ consoleErrs.push('PAGEERROR: '+e.message); });
p.on('response', r=>{ if(r.status()>=400) netErrs.push(r.status()+' '+r.url()); });
const flush=(label)=>{
  const c=[...new Set(consoleErrs)], n=[...new Set(netErrs)];
  console.log(`--- ${label} :: console(${c.length}) net(${n.length})`);
  if(c.length) console.log('  CONSOLE:', JSON.stringify(c.slice(0,15)));
  if(n.length) console.log('  NET:', JSON.stringify(n.slice(0,15)));
  consoleErrs=[]; netErrs=[];
};
await p.goto('https://app.myaipet.ai', {waitUntil:'networkidle', timeout:60000});
await p.waitForTimeout(2500);

const navs=['Home','My Pet','Cards','Bracket','Studio','Community','PetClaw','Agent Office','Season Rewards'];
for(const nav of navs){
  // find nav button by exact text
  let clicked=false;
  const btns = await p.$$('button, a');
  for(const el of btns){
    const t=(await el.textContent()||'').trim();
    if(t===nav){ 
      try{ await el.click({timeout:5000}); clicked=true; }catch(e){ console.log('CLICKERR',nav,e.message.slice(0,60)); }
      break;
    }
  }
  await p.waitForTimeout(2500);
  const url=p.url();
  const safe=nav.replace(/\W+/g,'_');
  await p.screenshot({path:`${SHOTS}/nav-${safe}.png`});
  const sectionBtns = await p.$$eval('button', bs=>bs.map(b=>(b.textContent||'').trim().slice(0,35)).filter(Boolean));
  const sectionLinks = await p.$$eval('a[href]', as=>as.map(a=>({t:(a.textContent||'').trim().slice(0,30),h:a.getAttribute('href')})).filter(x=>x.t));
  console.log(`\n==== NAV: ${nav} clicked=${clicked} url=${url}`);
  console.log('  BTNS:', JSON.stringify(sectionBtns));
  flush(nav);
}
await b.close();
console.log('\nDONE');

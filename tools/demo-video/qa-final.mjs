import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa-shots';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
let cerr=[],nerr=[];
p.on('console', m=>{ if(m.type()==='error') cerr.push(m.text()); });
p.on('pageerror', e=>cerr.push('PAGEERR:'+e.message));
p.on('response', r=>{ if(r.status()>=400) nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai','')); });

// STUDIO DIRECTOR field + main generate
await p.goto('https://app.myaipet.ai/studio', {waitUntil:'networkidle', timeout:60000});
await p.waitForTimeout(3000);
// fill DIRECTOR one-liner (input with placeholder about idea)
const inp=await p.$('input[placeholder*="idea" i], input[placeholder*="Dordor chasing" i]');
if(inp){ await inp.fill('Dordor chasing fireflies at dusk'); await p.waitForTimeout(500);
  const de=await p.$$('button'); let dir;
  for(const el of de){ if((await el.textContent()||'').trim().startsWith('Direct it')){ dir=el; break; } }
  const enabled = dir? await dir.isEnabled():null;
  console.log('DIRECTOR: Direct it enabled after fill =', enabled);
  if(enabled){ nerr=[];cerr=[]; await dir.click(); await p.waitForTimeout(3500);
    console.log('  after Direct it nerr=',JSON.stringify([...new Set(nerr)]));
    const t=await p.evaluate(()=>[...document.querySelectorAll('[class*="toast" i],[role="status"]')].map(e=>e.innerText).join('|').slice(0,150));
    console.log('  toast=',JSON.stringify(t)); }
} else console.log('DIRECTOR input not found');
// scroll down to find main Generate button
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
await p.waitForTimeout(1000);
await p.screenshot({path:SHOTS+'/studio-bottom.png'});
const allBtns=await p.$$eval('button', bs=>bs.map(b=>({t:(b.textContent||'').trim().slice(0,30),dis:b.disabled})).filter(x=>x.t && /generat|create|make|render|✨/i.test(x.t)));
console.log('GENERATE-like buttons:', JSON.stringify(allBtns));

// SEASON REWARDS remaining
await p.goto('https://app.myaipet.ai/?section=airdrop',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
await p.screenshot({path:SHOTS+'/season-full.png'});
const seasonBtns=await p.$$eval('button', bs=>bs.map(b=>({t:(b.textContent||'').trim().slice(0,30),dis:b.disabled})).filter(x=>x.t && !['Home','My Pet','Cards','Bracket','Community','PetClaw','Agent Office','Season Rewards','Connect Wallet'].includes(x.t)));
console.log('SEASON btns:', JSON.stringify(seasonBtns));

// FOOTER links - check each resolves (HEAD)
const footerLinks=['/terms','/privacy','/contracts','/architecture','/api-docs','/docs','/skills','/stats','/studio'];
for(const l of footerLinks){ 
  const resp=await p.goto('https://app.myaipet.ai'+l,{waitUntil:'domcontentloaded',timeout:30000}).catch(e=>({status:()=>'ERR:'+e.message.slice(0,30)}));
  const st=typeof resp.status==='function'?resp.status():resp.status;
  console.log(`FOOTER ${l} -> ${st} title="${(await p.title()).slice(0,40)}"`);
}
await b.close();

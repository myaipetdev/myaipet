import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qa-shots';
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
const consoleErrs=[], netErrs=[];
p.on('console', m=>{ if(m.type()==='error') consoleErrs.push(m.text()); });
p.on('response', r=>{ if(r.status()>=400) netErrs.push(r.status()+' '+r.url()); });
try {
  await p.goto('https://app.myaipet.ai', {waitUntil:'networkidle', timeout:60000});
} catch(e){ console.log('GOTO ERR', e.message); }
await p.waitForTimeout(3000);
await p.screenshot({path:SHOTS+'/00-home.png', fullPage:false});
// Dump nav links
const links = await p.$$eval('a[href]', as=>as.map(a=>({t:(a.textContent||'').trim().slice(0,40), href:a.getAttribute('href')})).filter(x=>x.t));
console.log('=== LINKS ===');
console.log(JSON.stringify(links,null,0));
const btns = await p.$$eval('button', bs=>bs.map(b=>(b.textContent||'').trim().slice(0,40)).filter(Boolean));
console.log('=== BUTTONS ===');
console.log(JSON.stringify(btns));
console.log('=== TITLE ===', await p.title());
console.log('=== URL ===', p.url());
console.log('=== CONSOLE ERRS ===', JSON.stringify(consoleErrs.slice(0,20),null,0));
console.log('=== NET ERRS ===', JSON.stringify([...new Set(netErrs)].slice(0,20),null,0));
await b.close();

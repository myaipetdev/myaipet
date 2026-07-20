import { chromium } from 'playwright';
const BASE='https://app.myaipet.ai';
const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
// footer routes resolve?
const routes=['/stats','/api-docs','/docs','/skills','/terms','/privacy','/contracts','/architecture','/petclaw-extension.zip'];
for(const r of routes){ const resp=await p.goto(BASE+r,{waitUntil:'domcontentloaded',timeout:30000}).catch(e=>null); console.log('  ',r,'->',resp?resp.status():'ERR'); }
// TOUR My Pet Feed reaction
await p.goto(BASE+'/?section=my%20pet&tour=1',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(4000);
const react=async(lbl)=>{const t0=await p.evaluate(()=>document.body.innerText);const els=await p.$$('button');for(const el of els){if(((await el.textContent())||'').trim()===lbl){await el.click({noWaitAfter:true}).catch(()=>{});break;}}await p.waitForTimeout(800);const t1=await p.evaluate(()=>document.body.innerText);const diff=t1.length-t0.length;const newTxt=t1.split('\n').filter(l=>!t0.includes(l)).slice(0,3);return {lbl,diff,newTxt};};
console.log('Feed:',JSON.stringify(await react('Feed')));
console.log('Play:',JSON.stringify(await react('Play')));
console.log('Pet:',JSON.stringify(await react('Pet')));
await b.close();

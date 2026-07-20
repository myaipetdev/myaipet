import { chromium } from 'playwright';
const BASE='https://app.myaipet.ai';
const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(BASE+'/?section=worldcup&tour=1',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(4500);
async function clk(t){const els=await p.$$('button');for(const el of els){if(((await el.textContent())||'').includes(t)){await el.click({noWaitAfter:true}).catch(()=>{});return true;}}return false;}
const y0=await p.evaluate(()=>window.scrollY);
await clk('Seasonal: World Cup'); await p.waitForTimeout(1500);
const y1=await p.evaluate(()=>window.scrollY);
await clk('Play the bracket'); await p.waitForTimeout(1500);
const y2=await p.evaluate(()=>window.scrollY);
console.log('TOUR scroll: y0',y0,'-> after Seasonal',y1,'-> after PlayBracket',y2);
console.log('Seasonal moved:',Math.abs(y1-y0)>30,' PlayBracket moved:',Math.abs(y2-y1)>30);
await b.close();

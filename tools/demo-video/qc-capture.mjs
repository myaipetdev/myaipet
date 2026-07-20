import { chromium } from 'playwright';
import fs from 'fs';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';
fs.mkdirSync(SHOTS,{recursive:true});
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});

const targets = [
  ['cards','https://app.myaipet.ai/?section=cards'],
  ['worldcup','https://app.myaipet.ai/?section=worldcup&tour=1'],
  ['community','https://app.myaipet.ai/?section=community&tour=1'],
];
const viewports = [['desktop',1440,900],['mobile',390,844]];

for(const [vpname,w,h] of viewports){
  const ctx = await b.newContext({viewport:{width:w,height:h}, deviceScaleFactor: vpname==='mobile'?2:1});
  for(const [name,url] of targets){
    const p = await ctx.newPage();
    let cerr=[],nerr=[];
    p.on('console', m=>{ if(m.type()==='error') cerr.push(m.text().slice(0,180)); });
    p.on('response', r=>{ if(r.status()>=400) nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai','')); });
    try{
      await p.goto(url,{waitUntil:'networkidle',timeout:60000});
    }catch(e){ console.log(`[${vpname}/${name}] GOTO ERR ${e.message.slice(0,60)}`); }
    await p.waitForTimeout(3000);
    // full page screenshot
    await p.screenshot({path:`${SHOTS}/${vpname}-${name}-top.png`});
    // scroll capture
    const bodyH = await p.evaluate(()=>document.body.scrollHeight);
    if(bodyH > h*1.4){
      await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight/2));
      await p.waitForTimeout(1200);
      await p.screenshot({path:`${SHOTS}/${vpname}-${name}-mid.png`});
      await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
      await p.waitForTimeout(1200);
      await p.screenshot({path:`${SHOTS}/${vpname}-${name}-bot.png`});
    }
    console.log(`[${vpname}/${name}] bodyH=${bodyH} nerr=${JSON.stringify([...new Set(nerr)].slice(0,10))} cerr=${JSON.stringify([...new Set(cerr)].slice(0,6))}`);
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log('DONE');

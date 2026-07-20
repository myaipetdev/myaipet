import { chromium } from 'playwright';
const SHOTS='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad/qc';
import fs from 'fs';
fs.mkdirSync(SHOTS,{recursive:true});
const b = await chromium.launch({args:['--enable-gpu','--use-angle=metal']});

async function clickNav(p,label){
  const els=await p.$$('a,button,[role=tab]');
  for(const el of els){ const t=(await el.textContent()||'').trim(); if(t===label){ await el.scrollIntoViewIfNeeded().catch(()=>{}); await el.click().catch(()=>{}); return true; } }
  return false;
}

async function run(label, vp){
  const ctx = await b.newContext({viewport:vp});
  const p = await ctx.newPage();
  let cerr=[],nerr=[];
  p.on('console', m=>{ if(m.type()==='error') cerr.push(m.text().slice(0,200)); });
  p.on('response', r=>{ if(r.status()>=400) nerr.push(r.status()+' '+r.url().replace('https://app.myaipet.ai','')); });
  await p.goto('https://app.myaipet.ai/',{waitUntil:'networkidle',timeout:60000});
  await p.waitForTimeout(2000);
  const results={};
  for(const [sec,navlabel] of [['petclaw','PetClaw'],['agent-office','Agent Office']]){
    cerr=[];nerr=[];
    const ok=await clickNav(p,navlabel);
    await p.waitForTimeout(2500);
    await p.screenshot({path:`${SHOTS}/${label}-${sec}-top.png`});
    await p.screenshot({path:`${SHOTS}/${label}-${sec}-full.png`,fullPage:true});
    const txt=await p.evaluate(()=>document.body.innerText);
    results[sec]={navClicked:ok,cerr:[...new Set(cerr)],nerr:[...new Set(nerr)],txtlen:txt.length};
    fs.writeFileSync(`${SHOTS}/${label}-${sec}-text.txt`,txt);
  }
  console.log(label, JSON.stringify(results,null,1));
  await ctx.close();
}
await run('desk',{width:1440,height:900});
await run('mob',{width:390,height:844});
await b.close();

import { chromium } from 'playwright';
import fs from 'fs';
const OUT='/private/tmp/claude-501/-Users-max-Documents----aipet-project-2/fb0162cb-2c11-450b-b221-317765b6fa79/scratchpad';
const BASE='https://app.myaipet.ai';
const ONLY=process.argv.slice(2); // optional list of section indices

const SECTIONS=[
  {name:'Home', url:BASE+'/?section=home'},
  {name:'My Pet', url:BASE+'/?section=my%20pet'},
  {name:'Cards', url:BASE+'/?section=cards'},
  {name:'Bracket', url:BASE+'/?section=worldcup'},
  {name:'Studio', url:BASE+'/studio'},
  {name:'Community', url:BASE+'/?section=community'},
  {name:'PetClaw', url:BASE+'/?section=sovereignty'},
  {name:'Agent Office', url:BASE+'/?section=office'},
  {name:'Season Rewards', url:BASE+'/?section=airdrop'},
  {name:'TOUR Community', url:BASE+'/?section=community&tour=1'},
  {name:'TOUR My Pet', url:BASE+'/?section=my%20pet&tour=1'},
  {name:'TOUR Bracket', url:BASE+'/?section=worldcup&tour=1'},
];
const secList = ONLY.length? ONLY.map(i=>SECTIONS[+i]) : SECTIONS;

const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.grantPermissions(['clipboard-read','clipboard-write']);
const p=await ctx.newPage();
let cerr=[],nerr=[],reqlog=[];
p.on('console', m=>{ if(m.type()==='error') cerr.push(m.text().slice(0,180)); });
p.on('pageerror', e=>cerr.push('PAGEERR:'+e.message.slice(0,180)));
p.on('response', r=>{ const u=r.url().replace(BASE,''); if(r.status()>=400) nerr.push(r.status()+' '+u); reqlog.push({s:r.status(),u}); });

const enumJS=`(()=>{const out=[];const els=[...document.querySelectorAll('button,[role="button"],a,input[type=button],input[type=submit]')];const sc={};for(const el of els){const tag=el.tagName.toLowerCase();const label=(el.getAttribute('aria-label')||el.textContent||el.value||'').trim().replace(/\\s+/g,' ').slice(0,44);const href=el.getAttribute('href');const cs=getComputedStyle(el);const r=el.getBoundingClientRect();const visible=cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0&&cs.opacity!=='0';if(!visible)continue;const disabled=!!el.disabled||el.getAttribute('aria-disabled')==='true';const base=tag+'|'+label+'|'+(href||'');sc[base]=(sc[base]||0);out.push({tag,label,href,disabled,sig:base,ord:sc[base]});sc[base]++;}return out;})()`;

const results={};
for(const sec of secList){
  await p.goto(sec.url,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  await p.waitForTimeout(3500);
  const controls=await p.evaluate(enumJS);
  const secFindings=[];
  for(const c of controls){
    const isNav=c.tag==='button'&&['Home','My Pet','Cards','Bracket','Studio','Community','PetClaw','Agent Office','Season Rewards'].includes(c.label);
    // ANCHORS: static verdict by href (do not click-navigate)
    if(c.tag==='a'){
      const h=(c.href||'').trim();
      let verdict='ok',reason=null;
      if(h===''||h==='#'||h==='javascript:void(0)'||h==='javascript:;'){verdict='dead';reason='dead href: "'+h+'"';}
      else if(h===null){verdict='dead';reason='anchor with no href';}
      secFindings.push({...c,isNav,verdict,reason,effect:'static-anchor'});
      continue;
    }
    if(c.disabled){ secFindings.push({...c,isNav,verdict:'disabled',reason:'disabled',effect:'static'}); continue; }
    // BUTTON: reload fresh, click by sig+ord, measure
    await p.goto(sec.url,{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
    await p.waitForTimeout(2600);
    cerr=[];nerr=[];reqlog=[];
    const before=await p.evaluate(()=>({url:location.href,q:new URLSearchParams(location.search).get('section')||'',
      nodes:document.querySelectorAll('*').length,
      dialogs:document.querySelectorAll('[role=dialog],[class*="modal" i],[class*="lightbox" i],[data-rk]').length,
      bodyLen:document.body.innerHTML.length}));
    const handle=await p.evaluateHandle((a)=>{const els=[...document.querySelectorAll('button,[role="button"],a,input[type=button],input[type=submit]')];let n=0;for(const el of els){const tag=el.tagName.toLowerCase();const label=(el.getAttribute('aria-label')||el.textContent||el.value||'').trim().replace(/\s+/g,' ').slice(0,44);const href=el.getAttribute('href');const cs=getComputedStyle(el);const r=el.getBoundingClientRect();const visible=cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0&&cs.opacity!=='0';if(!visible)continue;const base=tag+'|'+label+'|'+(href||'');if(base===a.sig){if(n===a.ord)return el;n++;}}return null;},{sig:c.sig,ord:c.ord});
    const elem=handle.asElement();
    if(!elem){ secFindings.push({...c,isNav,verdict:'unreached',reason:'could not re-locate (dynamic)',effect:null}); continue; }
    let clickErr=null;
    try{ await elem.scrollIntoViewIfNeeded({timeout:2000}); }catch(e){}
    try{ await elem.click({timeout:3500,noWaitAfter:true}); }catch(e){ clickErr=e.message.slice(0,60); }
    await p.waitForTimeout(700);
    let after;
    try{
      after=await p.evaluate(()=>({url:location.href,q:new URLSearchParams(location.search).get('section')||'',
      nodes:document.querySelectorAll('*').length,
      dialogs:document.querySelectorAll('[role=dialog],[class*="modal" i],[class*="lightbox" i],[data-rk]').length,
      bodyLen:document.body.innerHTML.length,
      toast:[...document.querySelectorAll('[class*="toast" i],[role="status"],[role="alert"]')].map(e=>e.innerText).join('|').slice(0,120)}));
    }catch(e){
      // navigation destroyed context => the click DID something (navigated). treat as ok.
      await p.waitForTimeout(500);
      const nurl=p.url();
      secFindings.push({...c,isNav,verdict:'ok',reason:'navigated (context replaced)',effect:{navTo:nurl}});
      continue;
    }
    const urlChanged=after.url!==before.url;
    const sectionChanged=after.q!==before.q;
    const nodeDelta=Math.abs(after.nodes-before.nodes);
    const dialogOpened=after.dialogs>before.dialogs;
    const bodyDelta=Math.abs(after.bodyLen-before.bodyLen);
    const req2xx=reqlog.filter(r=>r.s>=200&&r.s<300).length;
    const bad=[...new Set(nerr)];
    const toast=after.toast;
    const observed=urlChanged||sectionChanged||dialogOpened||nodeDelta>4||bodyDelta>200||!!toast||req2xx>0;
    const eff={u:urlChanged,sc:sectionChanged,d:dialogOpened,nd:nodeDelta,bd:bodyDelta,r2:req2xx,t:toast?toast.slice(0,60):'',bad,ce:[...new Set(cerr)].slice(0,3)};
    let verdict='ok',reason=null;
    if(clickErr){ verdict='clickblocked'; reason=clickErr; }
    else if(bad.length&&!urlChanged&&!sectionChanged&&!dialogOpened&&!toast&&nodeDelta<=4&&bodyDelta<=200){ verdict='silent-fail'; reason='4xx/5xx no UI: '+bad.join(','); }
    else if(!observed){ verdict='dead'; reason='no observable effect'; }
    secFindings.push({...c,isNav,verdict,reason,effect:eff});
  }
  results[sec.name]=secFindings;
  const probs=secFindings.filter(f=>!['ok','disabled'].includes(f.verdict));
  console.log(`\n#### ${sec.name} :: total=${secFindings.length} problems=${probs.length}`);
  for(const f of secFindings){ if(['ok'].includes(f.verdict))continue;
    console.log(`  [${f.verdict}] <${f.tag}> "${f.label}"${f.href?' href='+f.href:''}${f.isNav?' NAV':''} :: ${f.reason||''} :: ${typeof f.effect==='object'&&f.effect?JSON.stringify(f.effect):f.effect}`);
  }
}
fs.writeFileSync(OUT+'/trans2-'+(ONLY.length?ONLY.join('_'):'all')+'.json', JSON.stringify(results,null,1));
await b.close();
console.log('\n===DONE===');

import { useState, useEffect, useRef, lazy, Suspense } from "react";
const PetProfile = lazy(() => import("./src/components/PetProfile"));
const PetGenerate = lazy(() => import("./src/components/PetGenerate"));
const SocialGallery = lazy(() => import("./src/components/SocialGallery"));

const LOGO_SRC = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABQAFADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD1SiilryTpEoqN5MOVDBQoyzYz16DH4Guf8V6lf2GmLdWl3DHGod2ZlZQxUA7CQcgkbunp3q+R8vMB0bOqKWZgqqMkk4AFZzeItKW48g3QMnYKMn8hz+lcBf8AiLU7eKaeZJrq0W3SZreaQHyHcfID/fAPX0yKht9Ev4rOK707UDPBcEyS29mywD5hz5b84APUE/lXPKqoq7dr9/y8vmWoNux6nBcwXIJglWTb12nkfUdqlryZl1+0u9PS5lSKZ5THb3iEyzKOojfaQGGAefaux8I+Kn1qS4sLvyvtdsW+aNw3mKDtLEfw8/nVwmpLR/cJxsdRRRRVEhSE4BNLUU2HKwB1Uufmz/d7/n0/GqiruyEMgtzdxSOzlVeTcMEHgDGAfzqxcaZZ3Vi9lNCrQyDDA9/f61ZVUjQKqhVUcADgVzs3jjSYdWfTiJcxyLE8xACByQAACctyRnA4r0FFJWMm2zn9d8J3cS3C72eKWZbiO6RAxjdQAqundflHT8q5nTNek0rSLyaeymW5uZHmXZCQm5uFI4wBkdOue1eyC4Q5B/EVjahpXh3XZpLGVrd7gHc8UcuHyO5APauOpg6clZbaaG0arWvU8tkG6X7RrYuZJLe1bZb3ku5ppyP4Y16D2710XgK90yz1E2RCW87QrHGrbVaQ9SSByCcDGf0ravvh7HLNFJa3Jg8tWX90qozq2MgsBnt161n2Xw5tbfU41mmlWGGQXCRBgSXB678bj+JrL2M46y/4BXPF7HdUUdTmkoJFqGURCeCSXgK56DqccU6SYK2xVLyEZCjsPUnsKrgCS5ty7+YwlGcAhF69P/r9fat6VOTfN0IlJLQ1hWXc6NpC3o1GbT1km3bi4QtgjnJHr7461pfNvH93FOIyMfyrrMzj/C2tapf3l4NXu7M20WRHiPy3Jzwe2BjtzT4PAUEWsR332+YxxTm4ij5BjYnJAOcAHvxzXVLGFOdxb64p5O0EntQNsBwMZz9aoTMkmorjduiVg3BxzjH6Zq3JIwjzGhdj90f41mvFeQX4IKy/aBkj7oyOvPbAxioqJuNkEdGXKQ0xneJQ08ewHuDuAPoafXDJOOjNb3I4owyFYmKx5+Zjyzn1JqpsjLtHKWCcg46mnRAMpDylVXtSwSRxNlk3HPXPSvaSsrHBfqXrW7SWHH8cYAZf6j2qdSrpvjbhulZN3fLazpcj7inb0xuHcfh1/Crl6vkwtcwuUZeTjo34VhJcpvF8xbAckE4A9BS4GfXNZI1CaZY40ZQ7MqtjqM+1aY2W8RZmwFGWdj+pqbltWFeVI2RWIG48VFeki1eRD88Q8xc+o/8ArZqvZzpczvcO49I1J+6v+NRa1qkFpZshbLyDaAOTSuNJ3sXYrlJ4d3CjHO7txVWzdXtEZH3rjAY9SAcDNYkupPKqxWquA3BLDBI9BWtGy8NbqFfADRZwr49D2P8Ak1FWlKcboSnGLsLb2yzLuLEYOCAKbdRiOXCrhcce9JHO8SlUwMnripJopBA0s0n3ecHsK7jkIL22fU4ERFKlDw/4Vl3t7dur2s935yDAbYAFOPUjrV5WuL+IxIxgtVBLN0L/AOArMmlBXyvL2xqMIBx+Jpcqe4+ZrYdtOn28U8YQ3kxV0LDOxQc8/wCe/tVy8vL/AFG2WCS3VYnIL7QcnByOT/8AXrKWZ5XBYktGBGP+A9K0iNRulUzzMqDpnj+VZUqdo3luzSdTW0diaSO8lgWJ7wqn91VAP5gCkGgRNEJnmL8bjkc/nT49FullADO/HO44AqeW1itpNkaADHXHWtUktiOZkdpEtoxkiiBOMFiM1YR4ZJmaUFcnjB4FLbXCQghg3PpS3TRMqGMLznOBg0yT/9k=";

// --- Utilities ---
const WALLETS = [
  "0x7a2F...e4B1","0xdE9c...3f7A","0x1bC4...8dF2","0xaF56...1e9C",
  "0x3eD8...5bA7","0x9cF1...2a6E","0x4dA3...7c8B","0x8bE5...0fD4",
  "0x6aB2...9e1F","0xfC47...4d3A","0x2eF9...6b5C","0x5cA1...8f7D"
];
const PET_TYPES = ["Cat","Dog","Parrot","Turtle","Hamster","Rabbit","Fox","Pomeranian"];
const PET_EMOJIS = {Cat:"🐱",Dog:"🐕",Parrot:"🦜",Turtle:"🐢",Hamster:"🐹",Rabbit:"🐰",Fox:"🦊",Pomeranian:"🐶"};
const CHAINS = ["Base","BNB Chain"];

const pick = a => a[Math.floor(Math.random()*a.length)];
const rand = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const ago = () => pick(["just now","3s ago","8s ago","15s ago","28s ago","42s ago","1m ago","2m ago","4m ago","6m ago","9m ago","14m ago"]);

function genActivity() {
  const acts = [
    ()=>({type:"generate",text:`Generated ${pick(PET_TYPES)} video`,icon:"⚡"}),
    ()=>({type:"mint",text:`Minted Pet #${rand(100,999)}`,icon:"✦"}),
    ()=>({type:"burn",text:`Burned ${rand(5,80)} $PET`,icon:"🔥"}),
    ()=>({type:"like",text:`Liked a ${pick(PET_TYPES)} creation`,icon:"♡"}),
    ()=>({type:"claim",text:`Claimed ${rand(10,50)} $PET rewards`,icon:"🎁"}),
  ];
  return {...pick(acts)(),wallet:pick(WALLETS),time:ago(),chain:pick(CHAINS)};
}

// --- Animated Counter ---
function Counter({end,duration=2000,prefix="",suffix=""}){
  const [val,setVal]=useState(0);
  useEffect(()=>{
    let start=0;const step=end/((duration)/16);
    const t=setInterval(()=>{start+=step;if(start>=end){setVal(end);clearInterval(t)}else setVal(Math.floor(start))},16);
    return()=>clearInterval(t);
  },[end,duration]);
  return <>{prefix}{val.toLocaleString()}{suffix}</>;
}

// --- Grid Background ---
function Grid(){
  return <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,opacity:0.025}}>
    <svg width="100%" height="100%"><defs>
      <pattern id="g" width="50" height="50" patternUnits="userSpaceOnUse">
        <path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="0.5"/>
      </pattern>
    </defs><rect width="100%" height="100%" fill="url(#g)"/></svg>
  </div>;
}

// --- Navbar ---
function Nav({connected,onConnect,section,setSection}){
  return <nav style={{
    position:"fixed",top:0,left:0,right:0,zIndex:100,
    display:"flex",alignItems:"center",justifyContent:"space-between",
    padding:"14px 36px",background:"rgba(8,8,12,0.85)",
    backdropFilter:"blur(24px)",borderBottom:"1px solid rgba(255,255,255,0.05)"
  }}>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <img src={LOGO_SRC} alt="AI PET" style={{
        width:36,height:36,borderRadius:10,objectFit:"cover",
        border:"2px solid rgba(251,191,36,0.3)",
        boxShadow:"0 0 16px rgba(251,191,36,0.15)"
      }}/>
      <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:18,color:"white",letterSpacing:"-0.02em"}}>
        AI PET
      </span>
      <span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:"rgba(251,191,36,0.12)",color:"#fbbf24",fontFamily:"mono",fontWeight:600}}>
        BETA
      </span>
    </div>
    <div style={{display:"flex",gap:28,alignItems:"center"}}>
      {["Home","My Pet","Create","Community","Analytics"].map(s=>(
        <button key={s} onClick={()=>setSection(s.toLowerCase())} style={{
          background:"none",border:"none",cursor:"pointer",
          fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:500,
          color:section===s.toLowerCase()?"#fde68a":"rgba(255,255,255,0.35)",
          transition:"color 0.2s",letterSpacing:"0.02em"
        }}>{s}</button>
      ))}
    </div>
    <button onClick={onConnect} style={{
      background:connected?"rgba(34,197,94,0.08)":"linear-gradient(135deg,#f59e0b,#d97706)",
      border:connected?"1px solid rgba(34,197,94,0.2)":"none",
      borderRadius:10,padding:"9px 18px",cursor:"pointer",
      fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,
      color:connected?"#4ade80":"white",transition:"all 0.3s",
      boxShadow:connected?"none":"0 0 24px rgba(245,158,11,0.25)"
    }}>{connected?"● 0x7a2F...e4B1":"Connect Wallet"}</button>
  </nav>;
}

// --- Stats Bar ---
function Stats({stats}){
  return <div style={{
    display:"flex",gap:1,background:"rgba(255,255,255,0.02)",
    borderRadius:14,overflow:"hidden",border:"1px solid rgba(255,255,255,0.05)"
  }}>
    {stats.map((s,i)=>(
      <div key={i} style={{
        flex:1,padding:"18px 22px",background:"rgba(255,255,255,0.015)",
        borderRight:i<stats.length-1?"1px solid rgba(255,255,255,0.04)":"none"
      }}>
        <div style={{fontFamily:"mono",fontSize:10,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>
          {s.label}
        </div>
        <div style={{display:"flex",alignItems:"baseline",gap:5}}>
          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:700,color:"white",letterSpacing:"-0.02em"}}>
            {s.animated ? <Counter end={s.raw} prefix={s.prefix||""} suffix={s.suffix||""}/> : s.value}
          </span>
          {s.change&&<span style={{fontFamily:"mono",fontSize:11,color:s.change.startsWith("+")?  "#4ade80":"#f87171",fontWeight:500}}>{s.change}</span>}
        </div>
        {s.sub&&<div style={{fontFamily:"mono",fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:3}}>{s.sub}</div>}
      </div>
    ))}
  </div>;
}

// --- Activity Feed ---
function Feed({activities}){
  return <div style={{
    background:"rgba(255,255,255,0.015)",borderRadius:14,
    border:"1px solid rgba(255,255,255,0.05)",overflow:"hidden"
  }}>
    <div style={{
      padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,0.04)",
      display:"flex",justifyContent:"space-between",alignItems:"center"
    }}>
      <div style={{display:"flex",alignItems:"center",gap:7}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 10px rgba(74,222,128,0.5)",animation:"pulse 2s infinite"}}/>
        <span style={{fontFamily:"mono",fontSize:11,color:"rgba(255,255,255,0.45)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em"}}>
          Live On-Chain Activity
        </span>
      </div>
      <span style={{fontFamily:"mono",fontSize:10,color:"rgba(255,255,255,0.2)"}}>Multi-chain</span>
    </div>
    <div style={{maxHeight:340,overflow:"hidden"}}>
      {activities.map((a,i)=>(
        <div key={i} style={{
          display:"flex",alignItems:"center",gap:10,padding:"10px 18px",
          borderBottom:"1px solid rgba(255,255,255,0.025)",
          opacity:1-i*0.07,animation:i===0?"slideIn 0.4s ease-out":"none"
        }}>
          <span style={{fontSize:14,width:22,textAlign:"center"}}>{a.icon}</span>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontFamily:"mono",fontSize:11,color:"#fbbf24",fontWeight:600}}>{a.wallet}</span>
              <span style={{
                fontSize:9,padding:"1px 5px",borderRadius:3,
                background:a.chain==="Base"?"rgba(59,130,246,0.08)":"rgba(234,179,8,0.08)",
                color:a.chain==="Base"?"#60a5fa":"#facc15",fontFamily:"mono",fontWeight:500
              }}>{a.chain}</span>
            </div>
            <span style={{fontFamily:"mono",fontSize:11,color:"rgba(255,255,255,0.35)"}}>{a.text}</span>
          </div>
          <span style={{fontFamily:"mono",fontSize:10,color:"rgba(255,255,255,0.15)",whiteSpace:"nowrap"}}>{a.time}</span>
        </div>
      ))}
    </div>
  </div>;
}

// --- Hero ---
function Hero({onGenerate}){
  return <div style={{textAlign:"center",padding:"130px 40px 50px",position:"relative"}}>
    <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",filter:"blur(100px)",opacity:0.1,background:"#f59e0b",top:-50,left:"35%",pointerEvents:"none"}}/>
    <div style={{position:"absolute",width:250,height:250,borderRadius:"50%",filter:"blur(80px)",opacity:0.08,background:"#8b5cf6",top:120,right:"25%",pointerEvents:"none"}}/>

    <div style={{
      display:"inline-flex",alignItems:"center",gap:7,padding:"5px 14px",
      borderRadius:20,background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.12)",marginBottom:28
    }}>
      <div style={{width:5,height:5,borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 6px rgba(74,222,128,0.6)"}}/>
      <span style={{fontFamily:"mono",fontSize:11,color:"#fde68a",fontWeight:500}}>127 videos generated today</span>
    </div>

    <div style={{marginBottom:28}}>
      <img src={LOGO_SRC} alt="mascot" style={{
        width:90,height:90,borderRadius:20,objectFit:"cover",
        border:"3px solid rgba(251,191,36,0.2)",
        boxShadow:"0 0 40px rgba(251,191,36,0.15), 0 8px 32px rgba(0,0,0,0.3)"
      }}/>
    </div>

    <h1 style={{
      fontFamily:"'Space Grotesk',sans-serif",fontSize:"clamp(42px,5.5vw,72px)",
      fontWeight:700,color:"white",lineHeight:1.05,margin:"0 auto 16px",maxWidth:700,letterSpacing:"-0.03em"
    }}>
      Your Pet,<br/>
      <span style={{background:"linear-gradient(135deg,#fbbf24,#f59e0b,#d97706)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
        Brought to Life
      </span>
    </h1>

    <p style={{fontFamily:"mono",fontSize:14,color:"rgba(255,255,255,0.35)",maxWidth:480,margin:"0 auto 36px",lineHeight:1.7}}>
      Upload a photo of your pet. Our AI agent generates cinematic videos — every creation recorded on-chain.
    </p>

    <div style={{display:"flex",gap:14,justifyContent:"center"}}>
      <button onClick={onGenerate} style={{
        background:"linear-gradient(135deg,#f59e0b,#d97706)",border:"none",
        borderRadius:12,padding:"13px 32px",fontFamily:"mono",fontSize:13,fontWeight:600,
        color:"white",cursor:"pointer",
        boxShadow:"0 0 32px rgba(245,158,11,0.3),inset 0 1px 0 rgba(255,255,255,0.15)",transition:"all 0.3s"
      }}>Start Generating →</button>
      <button style={{
        background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
        borderRadius:12,padding:"13px 32px",fontFamily:"mono",fontSize:13,fontWeight:600,
        color:"rgba(255,255,255,0.5)",cursor:"pointer",transition:"all 0.3s"
      }}>View Analytics</button>
    </div>
  </div>;
}

// --- Generate Section ---
function Generate(){
  const [preview,setPreview]=useState(null);
  const [generating,setGenerating]=useState(false);
  const [progress,setProgress]=useState(0);
  const [done,setDone]=useState(false);
  const [prompt,setPrompt]=useState("");
  const [style,setStyle]=useState("Cinematic");
  const [dur,setDur]=useState("5s");
  const ref=useRef(null);

  const handleFile=e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>setPreview(ev.target.result);r.readAsDataURL(f)}};
  const handleGen=()=>{
    if(!preview)return;setGenerating(true);setProgress(0);setDone(false);
    const iv=setInterval(()=>{setProgress(p=>{if(p>=100){clearInterval(iv);setGenerating(false);setDone(true);return 100}return p+rand(1,3)})},250);
  };

  return <div style={{padding:"40px",maxWidth:860,margin:"0 auto"}}>
    <div style={{background:"rgba(255,255,255,0.015)",borderRadius:18,border:"1px solid rgba(255,255,255,0.05)",overflow:"hidden"}}>
      <div style={{padding:28}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:22}}>
          <img src={LOGO_SRC} alt="" style={{width:26,height:26,borderRadius:7,objectFit:"cover"}}/>
          <span style={{fontFamily:"mono",fontSize:13,fontWeight:600,color:"white"}}>AI Video Agent</span>
          <span style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:"rgba(74,222,128,0.08)",color:"#4ade80",fontFamily:"mono"}}>● Online</span>
        </div>

        <div style={{display:"flex",gap:22}}>
          {/* Upload */}
          <div style={{flex:1}}>
            <div onClick={()=>ref.current?.click()} style={{
              aspectRatio:"1",borderRadius:14,
              border:preview?"none":"2px dashed rgba(255,255,255,0.06)",
              background:preview?"none":"rgba(255,255,255,0.015)",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              cursor:"pointer",overflow:"hidden",position:"relative"
            }}>
              {preview?<img src={preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:14}}/>:
              <>
                <div style={{fontSize:36,marginBottom:10,opacity:0.25}}>📷</div>
                <span style={{fontFamily:"mono",fontSize:12,color:"rgba(255,255,255,0.25)"}}>Drop your pet photo</span>
                <span style={{fontFamily:"mono",fontSize:10,color:"rgba(255,255,255,0.12)",marginTop:3}}>JPG, PNG up to 10MB</span>
              </>}
              <input ref={ref} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
            </div>
          </div>

          {/* Controls */}
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={{fontFamily:"mono",fontSize:10,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,display:"block"}}>
                Prompt (Optional)
              </label>
              <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="My cat running through a field..."
                style={{width:"100%",height:72,borderRadius:10,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.05)",
                padding:12,resize:"none",fontFamily:"mono",fontSize:12,color:"white",outline:"none",boxSizing:"border-box"}}/>
            </div>

            <div>
              <label style={{fontFamily:"mono",fontSize:10,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,display:"block"}}>Style</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {["Cinematic","Anime","Watercolor","3D Render","Sketch"].map(s=>(
                  <button key={s} onClick={()=>setStyle(s)} style={{
                    background:style===s?"rgba(251,191,36,0.1)":"rgba(255,255,255,0.02)",
                    border:style===s?"1px solid rgba(251,191,36,0.25)":"1px solid rgba(255,255,255,0.05)",
                    borderRadius:7,padding:"5px 12px",fontFamily:"mono",fontSize:11,
                    color:style===s?"#fde68a":"rgba(255,255,255,0.35)",cursor:"pointer",transition:"all 0.2s"
                  }}>{s}</button>
                ))}
              </div>
            </div>

            <div style={{display:"flex",gap:10,alignItems:"center",padding:"10px 14px",borderRadius:10,background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.03)"}}>
              <span style={{fontSize:10,color:"rgba(255,255,255,0.25)",fontFamily:"mono"}}>Duration</span>
              <div style={{display:"flex",gap:4}}>
                {["3s","5s","10s"].map(d=>(
                  <span key={d} onClick={()=>setDur(d)} style={{
                    padding:"3px 10px",borderRadius:5,cursor:"pointer",
                    background:d===dur?"rgba(251,191,36,0.1)":"transparent",
                    color:d===dur?"#fde68a":"rgba(255,255,255,0.25)",fontFamily:"mono",fontSize:11
                  }}>{d}</span>
                ))}
              </div>
              <span style={{marginLeft:"auto",fontSize:11,color:"#fbbf24",fontFamily:"mono"}}>
                {dur==="3s"?"15":dur==="5s"?"30":"60"} credits
              </span>
            </div>

            <button onClick={handleGen} disabled={!preview||generating} style={{
              marginTop:"auto",
              background:(!preview||generating)?"rgba(255,255,255,0.03)":"linear-gradient(135deg,#f59e0b,#d97706)",
              border:"none",borderRadius:10,padding:"13px 0",fontFamily:"mono",fontSize:13,fontWeight:600,
              color:(!preview||generating)?"rgba(255,255,255,0.15)":"white",
              cursor:(!preview||generating)?"not-allowed":"pointer",
              boxShadow:(!preview||generating)?"none":"0 0 24px rgba(245,158,11,0.25)",
              transition:"all 0.3s",width:"100%"
            }}>{generating?"Generating...":"Generate Video ⚡"}</button>
          </div>
        </div>

        {/* Progress */}
        {generating&&<div style={{marginTop:22}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontFamily:"mono",fontSize:11,color:"rgba(255,255,255,0.35)"}}>
              {progress<25?"Analyzing pet features...":progress<50?"Generating motion...":progress<80?"Compositing video...":"Finalizing..."}
            </span>
            <span style={{fontFamily:"mono",fontSize:11,color:"#fbbf24"}}>{Math.min(progress,100)}%</span>
          </div>
          <div style={{height:3,borderRadius:2,background:"rgba(255,255,255,0.04)"}}>
            <div style={{height:"100%",borderRadius:2,background:"linear-gradient(90deg,#f59e0b,#fbbf24)",width:`${Math.min(progress,100)}%`,transition:"width 0.3s",boxShadow:"0 0 10px rgba(251,191,36,0.4)"}}/>
          </div>
          <div style={{display:"flex",gap:14,marginTop:10}}>
            {["Recording to Base","Hash: 0x7f2a...4e1b"].map((t,i)=>(<span key={i} style={{fontFamily:"mono",fontSize:9,color:"rgba(255,255,255,0.15)"}}>● {t}</span>))}
          </div>
        </div>}

        {/* Done */}
        {done&&<div style={{marginTop:22,padding:16,borderRadius:10,background:"rgba(74,222,128,0.04)",border:"1px solid rgba(74,222,128,0.08)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>✅</span>
            <div>
              <div style={{fontFamily:"mono",fontSize:12,color:"#4ade80",fontWeight:600}}>Generated & Recorded On-Chain</div>
              <div style={{fontFamily:"mono",fontSize:10,color:"rgba(255,255,255,0.25)",marginTop:3}}>TX: 0x7a2f...e4b1 · Base · Block #18,429,317</div>
            </div>
            <button style={{marginLeft:"auto",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontFamily:"mono",fontSize:11,color:"rgba(255,255,255,0.4)"}}>
              Explorer ↗
            </button>
          </div>
        </div>}
      </div>
    </div>
  </div>;
}

// --- Gallery ---
const GALLERY_ITEMS = [
  { img:"https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&h=400&fit=crop", pet:"Dog", likes:142, wallet:"0x7a2F...e4B1", chain:"Base" },
  { img:"https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&h=400&fit=crop", pet:"Cat", likes:98, wallet:"0xdE9c...3f7A", chain:"BNB Chain" },
  { img:"https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=400&h=400&fit=crop", pet:"Rabbit", likes:67, wallet:"0x1bC4...8dF2", chain:"Base" },
  { img:"https://images.unsplash.com/photo-1552728089-57bdde30beb3?w=400&h=400&fit=crop", pet:"Parrot", likes:183, wallet:"0xaF56...1e9C", chain:"Base" },
  { img:"https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&h=400&fit=crop", pet:"Dog", likes:54, wallet:"0x3eD8...5bA7", chain:"BNB Chain" },
  { img:"https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?w=400&h=400&fit=crop", pet:"Cat", likes:121, wallet:"0x9cF1...2a6E", chain:"Base" },
  { img:"https://images.unsplash.com/photo-1425082661507-6af0db74ab56?w=400&h=400&fit=crop", pet:"Turtle", likes:39, wallet:"0x4dA3...7c8B", chain:"BNB Chain" },
  { img:"https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=400&h=400&fit=crop", pet:"Hamster", likes:76, wallet:"0x8bE5...0fD4", chain:"Base" },
];

function Gallery(){
  const [filter,setFilter]=useState(0);
  return <div style={{padding:"40px",maxWidth:1060,margin:"0 auto"}}>
    <div style={{marginBottom:28,display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
      <div>
        <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:700,color:"white",marginBottom:6}}>Community Creations</h2>
        <p style={{fontFamily:"mono",fontSize:12,color:"rgba(255,255,255,0.3)"}}>Every video verified on-chain</p>
      </div>
      <div style={{display:"flex",gap:6}}>
        {["All","Trending","Recent"].map((f,i)=>(
          <button key={f} onClick={()=>setFilter(i)} style={{
            background:filter===i?"rgba(251,191,36,0.1)":"rgba(255,255,255,0.02)",
            border:filter===i?"1px solid rgba(251,191,36,0.2)":"1px solid rgba(255,255,255,0.05)",
            borderRadius:7,padding:"5px 14px",fontFamily:"mono",fontSize:11,
            color:filter===i?"#fde68a":"rgba(255,255,255,0.35)",cursor:"pointer"
          }}>{f}</button>
        ))}
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
      {GALLERY_ITEMS.map((item,i)=>(
        <div key={i} style={{borderRadius:14,overflow:"hidden",background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",cursor:"pointer",transition:"transform 0.3s, border-color 0.3s"}}>
          <div style={{aspectRatio:"1",position:"relative",overflow:"hidden"}}>
            <img src={item.img} alt={item.pet} loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover",transition:"transform 0.4s"}}
              onMouseOver={e=>e.currentTarget.style.transform="scale(1.05)"}
              onMouseOut={e=>e.currentTarget.style.transform="scale(1)"}/>
            <div style={{position:"absolute",top:8,right:8,display:"flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:16,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(8px)"}}>
              <span style={{fontSize:9,color:"#4ade80"}}>▶</span>
              <span style={{fontFamily:"mono",fontSize:9,color:"white"}}>5s</span>
            </div>
            <div style={{position:"absolute",bottom:8,left:8,fontSize:8,padding:"2px 6px",borderRadius:3,background:"rgba(0,0,0,0.45)",backdropFilter:"blur(6px)",color:"rgba(255,255,255,0.6)",fontFamily:"mono"}}>{item.chain}</div>
            <div style={{position:"absolute",bottom:8,right:8,fontSize:9,padding:"2px 8px",borderRadius:3,background:"rgba(0,0,0,0.45)",backdropFilter:"blur(6px)",color:"rgba(255,255,255,0.5)",fontFamily:"mono"}}>{item.pet}</div>
          </div>
          <div style={{padding:"10px 12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontFamily:"mono",fontSize:10,color:"#fbbf24"}}>{item.wallet}</span>
              <div style={{display:"flex",alignItems:"center",gap:3}}>
                <span style={{color:"#f472b6",fontSize:11}}>♥</span>
                <span style={{fontFamily:"mono",fontSize:10,color:"rgba(255,255,255,0.35)"}}>{item.likes}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>;
}

// --- Analytics ---
function Analytics({stats,activities}){
  const chartData=[12,15,11,18,22,19,25,28,24,31,35,29,38,42,37,45,48,44,52,55];
  return <div style={{padding:"40px",maxWidth:1060,margin:"0 auto",paddingTop:100}}>
    <div style={{marginBottom:28}}>
      <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:700,color:"white",marginBottom:6}}>On-Chain Analytics</h2>
      <p style={{fontFamily:"mono",fontSize:12,color:"rgba(255,255,255,0.3)"}}>Real-time protocol metrics · Verified on-chain</p>
    </div>
    <Stats stats={stats}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginTop:18}}>
      {/* Chart */}
      <div style={{background:"rgba(255,255,255,0.015)",borderRadius:14,border:"1px solid rgba(255,255,255,0.05)",padding:22}}>
        <div style={{fontFamily:"mono",fontSize:11,color:"rgba(255,255,255,0.35)",marginBottom:18,textTransform:"uppercase",letterSpacing:"0.08em"}}>Daily Generations (20d)</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:3,height:140}}>
          {chartData.map((v,i)=>(
            <div key={i} style={{flex:1,borderRadius:"3px 3px 0 0",background:i===chartData.length-1?"linear-gradient(180deg,#fbbf24,#f59e0b)":"rgba(251,191,36,0.15)",height:`${(v/58)*100}%`,transition:"height 0.5s ease-out",transitionDelay:`${i*30}ms`}}/>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontFamily:"mono",fontSize:9,color:"rgba(255,255,255,0.12)"}}>
          <span>20d ago</span><span>Today</span>
        </div>
      </div>
      <Feed activities={activities}/>
    </div>
    {/* Chain dist */}
    <div style={{marginTop:18,display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14}}>
      {[{chain:"Base",pct:64,color:"#3b82f6",txs:"3,847"},{chain:"BNB Chain",pct:36,color:"#eab308",txs:"2,156"}].map(c=>(
        <div key={c.chain} style={{background:"rgba(255,255,255,0.015)",borderRadius:10,border:"1px solid rgba(255,255,255,0.05)",padding:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontFamily:"mono",fontSize:12,color:"white",fontWeight:600}}>{c.chain}</span>
            <span style={{fontFamily:"mono",fontSize:11,color:c.color}}>{c.pct}%</span>
          </div>
          <div style={{height:3,borderRadius:2,background:"rgba(255,255,255,0.04)"}}>
            <div style={{height:"100%",borderRadius:2,background:c.color,width:`${c.pct}%`,boxShadow:`0 0 6px ${c.color}30`}}/>
          </div>
          <div style={{fontFamily:"mono",fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:6}}>{c.txs} transactions</div>
        </div>
      ))}
    </div>
  </div>;
}

// --- Pricing ---
function Pricing(){
  const plans=[
    {name:"Starter",credits:100,price:5,videos:"~10",pop:false},
    {name:"Creator",credits:500,price:20,videos:"~50",pop:true},
    {name:"Pro",credits:2000,price:50,videos:"~200",pop:false}
  ];
  return <div style={{padding:"50px 40px",maxWidth:860,margin:"0 auto",textAlign:"center"}}>
    <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:700,color:"white",marginBottom:6}}>Credits</h2>
    <p style={{fontFamily:"mono",fontSize:12,color:"rgba(255,255,255,0.3)",marginBottom:36}}>Pay with crypto · Recorded on-chain</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
      {plans.map(p=>(
        <div key={p.name} style={{
          background:p.pop?"rgba(251,191,36,0.04)":"rgba(255,255,255,0.015)",
          borderRadius:14,border:p.pop?"1px solid rgba(251,191,36,0.15)":"1px solid rgba(255,255,255,0.05)",
          padding:24,position:"relative"
        }}>
          {p.pop&&<div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)",background:"linear-gradient(135deg,#f59e0b,#d97706)",padding:"3px 14px",borderRadius:16,fontFamily:"mono",fontSize:9,color:"white",fontWeight:600}}>POPULAR</div>}
          <div style={{fontFamily:"mono",fontSize:12,color:"rgba(255,255,255,0.4)",marginBottom:10}}>{p.name}</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:36,fontWeight:700,color:"white",marginBottom:3}}>${p.price}</div>
          <div style={{fontFamily:"mono",fontSize:11,color:"#fbbf24",marginBottom:18}}>{p.credits} credits · {p.videos} videos</div>
          <button style={{
            width:"100%",background:p.pop?"linear-gradient(135deg,#f59e0b,#d97706)":"rgba(255,255,255,0.04)",
            border:p.pop?"none":"1px solid rgba(255,255,255,0.06)",borderRadius:9,padding:"11px",
            fontFamily:"mono",fontSize:12,color:p.pop?"white":"rgba(255,255,255,0.45)",cursor:"pointer",fontWeight:600
          }}>Purchase →</button>
        </div>
      ))}
    </div>
  </div>;
}

// --- Main ---
export default function App(){
  const [connected,setConnected]=useState(false);
  const [section,setSection]=useState("home");
  const [activities,setActivities]=useState(()=>Array.from({length:10},genActivity));
  const [totalUsers,setTotalUsers]=useState(1847);
  const [totalGens,setTotalGens]=useState(6203);
  const [txToday,setTxToday]=useState(127);

  useEffect(()=>{
    const iv=setInterval(()=>{
      setActivities(p=>[genActivity(),...p.slice(0,9)]);
      if(Math.random()>0.5) setTotalGens(p=>p+1);
      if(Math.random()>0.85) setTotalUsers(p=>p+1);
      if(Math.random()>0.4) setTxToday(p=>p+1);
    },rand(4000,8000));
    return()=>clearInterval(iv);
  },[]);

  const stats=[
    {label:"Total Users",value:totalUsers.toLocaleString(),raw:totalUsers,animated:true,change:"+4.2%",sub:"Unique wallets"},
    {label:"Videos Generated",value:totalGens.toLocaleString(),raw:totalGens,animated:true,change:"+8.1%",sub:"All-time on-chain"},
    {label:"$PET Burned",value:"42.8K",change:"+3.7%",sub:"Deflationary"},
    {label:"TX Today",value:txToday.toLocaleString(),raw:txToday,animated:true,change:"+6.9%",sub:"Multi-chain"}
  ];

  return <div style={{minHeight:"100vh",background:"#08080c",color:"white",position:"relative",overflow:"hidden"}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');
      *{margin:0;padding:0;box-sizing:border-box}
      ::selection{background:rgba(251,191,36,0.25)}
      ::-webkit-scrollbar{width:5px}
      ::-webkit-scrollbar-track{background:transparent}
      ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
      @keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      textarea::placeholder{color:rgba(255,255,255,0.15)}
      button:hover{opacity:0.92}
    `}</style>

    <Grid/>
    <Nav connected={connected} onConnect={()=>setConnected(!connected)} section={section} setSection={setSection}/>

    {section==="home"&&<>
      <Hero onGenerate={()=>setSection("create")}/>
      <div style={{padding:"0 40px 30px",maxWidth:1060,margin:"0 auto"}}><Stats stats={stats}/></div>
      <div style={{padding:"0 40px 50px",maxWidth:1060,margin:"0 auto"}}><Feed activities={activities}/></div>
      <Pricing/>
    </>}
    {section==="my pet"&&<Suspense fallback={<div style={{padding:"100px 40px",textAlign:"center",color:"rgba(255,255,255,0.3)",fontFamily:"mono"}}>Loading...</div>}><PetProfile/></Suspense>}
    {section==="create"&&<Suspense fallback={<div style={{padding:"100px 40px",textAlign:"center",color:"rgba(255,255,255,0.3)",fontFamily:"mono"}}>Loading...</div>}><PetGenerate/></Suspense>}
    {section==="community"&&<Suspense fallback={<div style={{padding:"100px 40px",textAlign:"center",color:"rgba(255,255,255,0.3)",fontFamily:"mono"}}>Loading...</div>}><SocialGallery/></Suspense>}
    {section==="analytics"&&<Analytics stats={stats} activities={activities}/>}

    <footer style={{padding:"36px",textAlign:"center",borderTop:"1px solid rgba(255,255,255,0.03)"}}>
      <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginBottom:14}}>
        <img src={LOGO_SRC} alt="" style={{width:20,height:20,borderRadius:5,objectFit:"cover"}}/>
        <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.3)"}}>AI PET</span>
      </div>
      <div style={{display:"flex",justifyContent:"center",gap:20,marginBottom:12}}>
        {["Docs","GitHub","Discord","Twitter"].map(l=>(<span key={l} style={{fontFamily:"mono",fontSize:11,color:"rgba(255,255,255,0.2)",cursor:"pointer"}}>{l}</span>))}
      </div>
      <div style={{fontFamily:"mono",fontSize:10,color:"rgba(255,255,255,0.1)"}}>© 2025 AI PET · All on-chain data verifiable via block explorers</div>
    </footer>
  </div>;
}

"use client";

/**
 * PetClawHeroIntro — the cinematic PetClaw masthead (faithful port of the
 * founder-approved petclaw-hero prototype, verified frame-by-frame):
 *
 *   1) the pet's collectible sticker (REAL avatar) stands center
 *   2) it flips away and a warm-dark laptop swings in, lid opening
 *   3) the screen boots petclaw-mcp — typed lines end on "● {NAME} is online"
 *   4) capability chips (connectors + MCP tools) fly OUT of the screen and
 *      hover around it, with gold dust rising
 *
 * Pure CSS keyframes (one-shot on mount) + a static gold-shine wordmark.
 * prefers-reduced-motion collapses every animation to its final state.
 * All class names are pchi-* to avoid collisions.
 */

import { useEffect, useRef } from "react";

interface Props {
  petName: string;
  avatarUrl?: string | null;
  level?: number;
  demo?: boolean;
}

const CHIPS: Array<{ label: string; mark: string; x: number; y: number; d: number }> = [
  { label: "telegram", mark: "◈", x: -300, y: -150, d: 6.2 },
  { label: "discord", mark: "◈", x: 300, y: -160, d: 6.35 },
  { label: "claude", mark: "◈", x: -350, y: -10, d: 6.5 },
  { label: "cursor", mark: "◈", x: 352, y: -20, d: 6.65 },
  { label: "memory_recall", mark: "✦", x: -268, y: 120, d: 6.8 },
  { label: "soul_export", mark: "✦", x: 272, y: 112, d: 6.95 },
  { label: "petclaw_chat", mark: "✦", x: -368, y: -90, d: 7.1 },
  { label: "chrome", mark: "◈", x: 196, y: 186, d: 7.25 },
];

export default function PetClawHeroIntro({ petName, avatarUrl, level, demo }: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);

  // gold dust (skipped under reduced motion)
  useEffect(() => {
    const st = stageRef.current;
    if (!st || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dots: HTMLSpanElement[] = [];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement("span");
      s.className = "pchi-dust";
      const z = 2 + Math.random() * 4;
      s.style.width = s.style.height = `${z}px`;
      s.style.left = `${8 + Math.random() * 84}%`;
      s.style.top = `${55 + Math.random() * 35}%`;
      s.style.animationDuration = `${5 + Math.random() * 5}s`;
      s.style.animationDelay = `${2 + Math.random() * 6}s`;
      st.appendChild(s);
      dots.push(s);
    }
    return () => dots.forEach((d) => d.remove());
  }, []);

  const name = (petName || "your pet").toUpperCase();

  return (
    <div ref={stageRef} className="pchi-stage" aria-label={`PetClaw — ${petName}'s agent booting`}>
      <style>{`
        .pchi-stage{position:relative;width:100%;height:clamp(430px,58vw,560px);perspective:1200px;overflow:hidden}
        .pchi-dust{position:absolute;border-radius:50%;background:radial-gradient(circle,#E8C77E,transparent 70%);pointer-events:none;animation:pchiRise linear infinite;opacity:0}
        @keyframes pchiRise{0%{transform:translateY(10px);opacity:0}15%{opacity:.7}100%{transform:translateY(-140px);opacity:0}}

        .pchi-wm{position:absolute;top:4px;left:0;right:0;text-align:center;z-index:5}
        .pchi-wm h2{margin:0;font-family:var(--ed-disp);font-size:clamp(38px,7vw,62px);letter-spacing:.05em;font-weight:800;
          background:linear-gradient(100deg,#8A5A1E,#C8932F 30%,#FFF4DC 50%,#E8C77E 70%,#8A5A1E);background-size:220% 100%;
          -webkit-background-clip:text;background-clip:text;color:transparent;animation:pchiShine 6s linear infinite;
          filter:drop-shadow(0 2px 0 rgba(0,0,0,.55)) drop-shadow(0 8px 22px rgba(232,199,126,.14))}
        @keyframes pchiShine{to{background-position:220% 0}}
        .pchi-wm p{margin:6px 0 0;font-family:var(--ed-m);font-size:13px;color:rgba(251,246,236,.6);letter-spacing:.05em}

        .pchi-rig{position:absolute;left:50%;top:57%;transform:translate(-50%,-50%);width:min(92%,560px);height:78%;z-index:3}

        .pchi-sticker{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%) rotateY(0);width:172px;border-radius:14px;
          background:#FBF6EC;padding:10px 10px 34px;box-shadow:0 30px 60px -24px rgba(0,0,0,.8),0 0 0 1px rgba(0,0,0,.3);
          backface-visibility:hidden;animation:pchiFlip 1.1s 1.2s cubic-bezier(.6,.05,.3,1) both}
        .pchi-sticker img{width:100%;aspect-ratio:1/1;border-radius:9px;object-fit:cover;display:block;box-shadow:inset 0 0 0 1.5px rgba(184,130,44,.55)}
        .pchi-sticker .pchi-cap{position:absolute;left:0;right:0;bottom:9px;text-align:center;color:#211A12;font-family:var(--ed-m);font-weight:700;font-size:12.5px;letter-spacing:.14em}
        .pchi-seal{position:absolute;top:-11px;right:-11px;width:38px;height:38px;border-radius:50%;
          background:radial-gradient(circle at 36% 32%,#F6DFA8,#C8932F 65%,#8A5A1E);display:grid;place-items:center;
          color:#3d2708;font-family:var(--ed-m);font-weight:800;font-size:12px;box-shadow:0 6px 14px -6px rgba(0,0,0,.7)}
        .pchi-demo{position:absolute;left:10px;right:10px;bottom:32px;text-align:center;font-family:var(--ed-m);font-size:13px;font-weight:700;
          letter-spacing:.12em;color:#FCE9CF;background:rgba(30,23,16,.78);border-radius:4px;padding:1px 0}
        @keyframes pchiFlip{0%{transform:translate(-50%,-50%) rotateY(0) scale(1)}45%{transform:translate(-50%,-50%) rotateY(90deg) scale(.92)}100%{transform:translate(-50%,-50%) rotateY(90deg) scale(.92);opacity:0}}

        .pchi-laptop{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:min(100%,520px);transform-style:preserve-3d;
          opacity:0;animation:pchiLapIn .9s 1.75s cubic-bezier(.2,.9,.3,1) both}
        @keyframes pchiLapIn{from{opacity:0;transform:translate(-50%,-46%) rotateY(-90deg) scale(.9)}to{opacity:1;transform:translate(-50%,-50%) rotateY(0) scale(1)}}
        .pchi-lid{position:relative;width:100%;aspect-ratio:16/10.2;border-radius:18px 18px 4px 4px;background:linear-gradient(180deg,#3A2F22,#241B10);
          padding:12px 12px 16px;box-shadow:0 40px 80px -30px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,244,220,.12);
          transform-origin:bottom;animation:pchiLid 1s 2.15s cubic-bezier(.2,.9,.3,1) both}
        @keyframes pchiLid{from{transform:rotateX(-88deg)}to{transform:rotateX(0)}}
        .pchi-screen{width:100%;height:100%;border-radius:10px;background:#0E0A05;border:1px solid rgba(232,199,126,.25);overflow:hidden;position:relative;box-shadow:inset 0 0 34px rgba(0,0,0,.7)}
        .pchi-bar{height:24px;display:flex;align-items:center;gap:6px;padding:0 10px;background:#191008;border-bottom:1px solid rgba(231,197,124,.22)}
        .pchi-bar i{width:8px;height:8px;border-radius:50%;display:block}
        .pchi-bar i:nth-child(1){background:#D66}.pchi-bar i:nth-child(2){background:#DBA94E}.pchi-bar i:nth-child(3){background:#8FBF7F}
        .pchi-bar b{margin-left:8px;font-family:var(--ed-m);font-size:10.5px;color:rgba(251,246,236,.6);letter-spacing:.14em;font-weight:600}
        .pchi-term{padding:12px 14px;font-family:var(--ed-m);font-size:clamp(10.5px,1.7vw,12.5px);line-height:1.9;color:#E8C77E}
        .pchi-term .pchi-ln{display:block;white-space:nowrap;overflow:hidden;width:0;opacity:0}
        .pchi-term .c{color:#ECE0CE}.pchi-term .g{color:#9FC59A}.pchi-term .m{color:rgba(251,246,236,.6)}
        .pchi-term .l1{animation:pchiType .5s 3.1s steps(28,end) forwards}
        .pchi-term .l2{animation:pchiType .6s 3.7s steps(40,end) forwards}
        .pchi-term .l3{animation:pchiType .55s 4.4s steps(34,end) forwards}
        .pchi-term .l4{animation:pchiType .5s 5.0s steps(30,end) forwards}
        .pchi-term .l5{animation:pchiType .45s 5.6s steps(22,end) forwards}
        @keyframes pchiType{from{width:0;opacity:1}to{width:100%;opacity:1}}
        .pchi-caret{display:inline-block;width:7px;height:13px;background:#E8C77E;vertical-align:-2px;animation:pchiBlink 1s 6.1s steps(1) infinite;opacity:0}
        @keyframes pchiBlink{0%,49%{opacity:1}50%,100%{opacity:0}}
        .pchi-base{width:118%;height:15px;margin:-2px 0 0 -9%;border-radius:4px 4px 14px 14px;background:linear-gradient(180deg,#4A3B28,#241B10);
          box-shadow:0 24px 40px -18px rgba(0,0,0,.8);animation:pchiFade .5s 2.05s both}
        .pchi-base::after{content:"";display:block;width:84px;height:5px;margin:0 auto;border-radius:0 0 8px 8px;background:#191008}
        .pchi-glow{position:absolute;left:50%;bottom:-30px;transform:translateX(-50%);width:70%;height:56px;border-radius:50%;
          background:radial-gradient(ellipse,rgba(232,199,126,.28),transparent 70%);filter:blur(8px);animation:pchiFade .8s 2.4s both}
        @keyframes pchiFade{from{opacity:0}to{opacity:1}}

        .pchi-chip{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%) scale(.2);opacity:0;z-index:4;
          font-family:var(--ed-m);font-size:12px;font-weight:700;letter-spacing:.08em;padding:7px 13px;border-radius:999px;
          background:linear-gradient(180deg,rgba(252,233,207,.16),rgba(252,233,207,.06));border:1px solid rgba(232,199,126,.5);
          color:#FCE9CF;backdrop-filter:blur(4px);box-shadow:0 10px 26px -12px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,244,220,.25);
          animation:pchiFly 1s cubic-bezier(.18,.9,.3,1.2) forwards,pchiHover 3.4s calc(var(--d) + 1s) ease-in-out infinite alternate}
        .pchi-chip b{color:#E8C77E}
        @keyframes pchiFly{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}60%{opacity:1}100%{transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(1);opacity:1}}
        @keyframes pchiHover{from{margin-top:0}to{margin-top:-10px}}

        /* narrow screens: pull chips inward so nothing clips */
        @media (max-width:720px){ .pchi-chip{--x:calc(var(--xs, var(--x)) * .55);--y:calc(var(--ys, var(--y)) * .8)} }
        @media (prefers-reduced-motion:reduce){
          .pchi-stage *{animation-duration:.001s !important;animation-delay:0s !important}
          .pchi-dust{display:none}
        }
      `}</style>

      <div className="pchi-wm">
        <h2>PETCLAW</h2>
        <p>your AI pet, sovereign &amp; portable — across every surface you use</p>
      </div>

      <div className="pchi-rig">
        {/* 1) the pet's collectible sticker */}
        <div className="pchi-sticker">
          {typeof level === "number" && <span className="pchi-seal">{String(level).padStart(2, "0")}</span>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrl || "/mascot.jpg"} alt={petName} />
          {demo && <span className="pchi-demo">DEMO</span>}
          <span className="pchi-cap">{name}</span>
        </div>

        {/* 2) the laptop it becomes */}
        <div className="pchi-laptop">
          <div className="pchi-lid">
            <div className="pchi-screen">
              <div className="pchi-bar"><i /><i /><i /><b>petclaw — mcp · v1</b></div>
              <div className="pchi-term">
                <span className="pchi-ln l1 m">$ npx petclaw-mcp</span>
                <span className="pchi-ln l2">initializing petclaw-mcp · protocol v1 · SDK 1.6.1</span>
                <span className="pchi-ln l3 c">connectors ▸ 19 &nbsp; tools ▸ 6 &nbsp; skills ▸ 18</span>
                <span className="pchi-ln l4 c">soul ▸ portable · consent ▸ enforced</span>
                <span className="pchi-ln l5 g">● {name} is online<span className="pchi-caret" /></span>
              </div>
            </div>
          </div>
          <div className="pchi-base" />
          <div className="pchi-glow" />
        </div>

        {/* 3) capability chips fly OUT of the screen */}
        {CHIPS.map((c) => (
          <div
            key={c.label}
            className="pchi-chip"
            style={{ "--x": `${c.x}px`, "--y": `${c.y}px`, "--xs": `${c.x}px`, "--ys": `${c.y}px`, "--d": `${c.d}s`, animationDelay: `${c.d}s` } as React.CSSProperties}
          >
            <b>{c.mark}</b> {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

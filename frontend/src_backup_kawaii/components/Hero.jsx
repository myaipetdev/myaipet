import { useState, useEffect } from "react";
import { LOGO_SRC } from "./NavKawaii";

const PET_IMAGES = [
  { src: "/gallery/pet_cat.jpg", alt: "Kawaii cat pet avatar" },
  { src: "/gallery/pet_dog.jpg", alt: "Kawaii dog pet avatar" },
  { src: "/gallery/pet_parrot.jpg", alt: "Kawaii parrot pet avatar" },
  { src: "/gallery/pet_turtle.jpg", alt: "Kawaii turtle pet avatar" },
  { src: "/gallery/pet_hamster.jpg", alt: "Kawaii hamster pet avatar" },
  { src: "/gallery/pet_rabbit.jpg", alt: "Kawaii rabbit pet avatar" },
  { src: "/gallery/pet_fox.jpg", alt: "Kawaii fox pet avatar" },
  { src: "/gallery/pet_pom.jpg", alt: "Kawaii pomeranian pet avatar" },
];

const FEATURES = [
  {
    icon: "402",
    label: "X402 Autonomous Payments",
    desc: "Your pet's AI agent pays for its own video generation via HTTP 402. No wallets, no popups — just autonomous machine-to-machine commerce.",
    tag: "PROTOCOL",
  },
  {
    icon: "\u{1F9EC}",
    label: "SOUL.md Identity",
    desc: "Every pet carries a portable, verifiable identity as a markdown file pinned to IPFS. Personality, memories, and traits — owned by you, readable by any agent.",
    tag: "IDENTITY",
  },
  {
    icon: "\u{1F30C}",
    label: "Dreaming Engine",
    desc: "Each night your pet processes the day's emotions, forming new memories and evolving its personality. Wake up to a slightly different companion every morning.",
    tag: "EVOLUTION",
  },
  {
    icon: "\u{1F3AC}",
    label: "Multi-Model Video",
    desc: "Kling 3.0 and Hailuo 02 wrapped in Web3. The cheapest cinematic AI video generation available — and your pet agent picks the best model automatically.",
    tag: "GENERATION",
  },
];

export default function Hero({ onGenerate, txToday }) {
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % FEATURES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section
      className="relative overflow-hidden"
      style={{ padding: "160px 24px 64px" }}
      aria-label="Hero section"
    >
      {/* Ambient glows */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-[0.07] pointer-events-none"
        style={{ filter: "blur(140px)", background: "linear-gradient(135deg, #6366f1, #FF86B7)", top: -120, left: "10%" }}
      />
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-[0.06] pointer-events-none"
        style={{ filter: "blur(120px)", background: "linear-gradient(135deg, #70D6FF, #4ade80)", top: 250, right: "5%" }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-[0.05] pointer-events-none"
        style={{ filter: "blur(100px)", background: "#FFD23F", bottom: -40, left: "40%" }}
      />

      {/* Main hero block */}
      <div className="relative z-10 max-w-4xl mx-auto text-center">

        {/* Protocol badge */}
        <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-indigo-500/8 mb-10 sticker-border">
          <div
            className="w-2 h-2 rounded-full bg-[#6366f1]"
            style={{ boxShadow: "0 0 8px rgba(99,102,241,0.5)", animation: "pulse 2s ease-in-out infinite" }}
          />
          <span className="font-body text-sm text-[#422D26]/60 font-bold tracking-wide uppercase">
            Powered by X402 Protocol
          </span>
          <span className="text-[#422D26]/35">|</span>
          <span className="font-body text-sm text-[#422D26]/55">
            {txToday} autonomous transactions today
          </span>
        </div>

        {/* Mascot + Headline */}
        <div className="flex flex-col items-center gap-6 mb-8">
          <img
            src={LOGO_SRC}
            alt="AI PET mascot"
            className="w-20 h-20 rounded-3xl object-cover animate-pulse-glow"
            style={{ border: "3px solid rgba(99,102,241,0.2)" }}
          />

          <h1 className="font-heading text-[clamp(40px,7vw,68px)] leading-[1.05] text-[#422D26] tracking-tight">
            The First{" "}
            <span
              className="bg-gradient-to-r from-indigo-500 via-pink to-sky-dark bg-clip-text"
              style={{ WebkitTextFillColor: "transparent" }}
            >
              Web4.0
            </span>
            <br />
            Pet Protocol
          </h1>
        </div>

        <p className="font-body text-xl text-[#422D26]/55 max-w-2xl mx-auto mb-6 leading-relaxed">
          AI pets that autonomously pay for their own video generation using{" "}
          <span className="text-[#422D26]/75 font-semibold">X402</span>.
          Each pet carries a verifiable on-chain soul
          (<span className="text-[#422D26]/75 font-semibold">SOUL.md</span>)
          — personality, memory, and identity pinned to IPFS.
        </p>

        <p className="font-body text-base text-[#422D26]/55 max-w-xl mx-auto mb-12 leading-relaxed">
          No wallet popups. No gas approvals. Your pet's AI agent handles payments
          via HTTP 402 — the way the internet was always supposed to work.
        </p>

        {/* CTA button */}
        <div className="flex gap-4 justify-center flex-wrap mb-16">
          <button
            onClick={onGenerate}
            className="squishy bg-gradient-to-r from-indigo-500 to-pink text-white font-heading text-xl px-14 py-5 rounded-full hover:opacity-90 transition-opacity"
            style={{ boxShadow: "0 8px 32px rgba(99,102,241,0.3)" }}
          >
            Launch App
          </button>
        </div>

        {/* Feature cards - 2x2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto mb-16">
          {FEATURES.map((f, i) => (
            <button
              key={i}
              onClick={() => setActiveFeature(i)}
              className={`squishy rounded-2xl px-6 py-6 text-left transition-all duration-300 sticker-border
                ${activeFeature === i
                  ? "bg-white/80 shadow-lg ring-1 ring-indigo-500/10"
                  : "bg-white/40 hover:bg-white/60"
                }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-lg font-bold
                    ${activeFeature === i
                      ? "bg-indigo-500/10 text-indigo-600"
                      : "bg-[#422D26]/5 text-[#422D26]/30"
                    }`}
                >
                  {f.icon}
                </span>
                <div>
                  <span
                    className={`font-body text-xs font-bold tracking-widest uppercase block
                      ${activeFeature === i ? "text-indigo-500" : "text-[#422D26]/50"}`}
                  >
                    {f.tag}
                  </span>
                  <span
                    className={`font-body text-base font-bold block
                      ${activeFeature === i ? "text-[#422D26]/80" : "text-[#422D26]/60"}`}
                  >
                    {f.label}
                  </span>
                </div>
              </div>
              <p
                className={`font-body text-sm leading-relaxed
                  ${activeFeature === i ? "text-[#422D26]/55" : "text-[#422D26]/50"}`}
              >
                {f.desc}
              </p>
            </button>
          ))}
        </div>

        {/* Pet image carousel */}
        <div className="flex justify-center gap-3 flex-wrap">
          {PET_IMAGES.map((img, i) => (
            <div
              key={i}
              className="w-14 h-14 rounded-2xl overflow-hidden sticker-border animate-float bg-cream-dark"
              style={{ animationDelay: `${i * 0.35}s`, animationDuration: `${4 + i * 0.3}s` }}
            >
              <img src={img.src} alt={img.alt} className="w-full h-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

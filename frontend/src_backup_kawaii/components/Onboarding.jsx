import { useState, useEffect, useRef, useCallback } from "react";

const PET_IMAGES = [
  "/gallery/pet_cat.jpg",
  "/gallery/pet_dog.jpg",
  "/gallery/pet_parrot.jpg",
  "/gallery/pet_turtle.jpg",
  "/gallery/pet_hamster.jpg",
  "/gallery/pet_rabbit.jpg",
  "/gallery/pet_fox.jpg",
  "/gallery/pet_pom.jpg",
];

const DRAGON_IMAGE = "/gallery/dragon_cat.jpg";

const LOADING_TEXTS = [
  "Sniffing digital treats...",
  "Charging kawaii power...",
  "Fluffing pixel fur...",
  "Teaching tricks to AI...",
  "Polishing sparkly eyes...",
  "Mixing magical colors...",
  "Almost ready to hatch!",
];

// ── Sparkle Decoration ──
function Sparkles() {
  const sparkles = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    left: `${10 + Math.random() * 80}%`,
    top: `${10 + Math.random() * 80}%`,
    delay: `${Math.random() * 3}s`,
    size: 8 + Math.random() * 12,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {sparkles.map((s) => (
        <div
          key={s.id}
          className="animate-sparkle absolute"
          style={{
            left: s.left,
            top: s.top,
            animationDelay: s.delay,
            width: s.size,
            height: s.size,
          }}
        >
          <svg viewBox="0 0 24 24" fill="#FFD23F">
            <path d="M12 0L14.59 8.41L23 12L14.59 15.59L12 24L9.41 15.59L1 12L9.41 8.41Z" />
          </svg>
        </div>
      ))}
    </div>
  );
}

// ── Step Indicator ──
function StepIndicator({ current }) {
  const steps = [
    { num: 1, label: "Choose" },
    { num: 2, label: "Magic" },
    { num: 3, label: "Hello!" },
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center gap-2">
          <div
            className={`
              flex items-center justify-center rounded-full font-heading text-sm transition-all duration-500
              ${
                current === s.num
                  ? "w-10 h-10 bg-pink text-white shadow-lg scale-110"
                  : current > s.num
                  ? "w-10 h-10 bg-mint text-white"
                  : "w-10 h-10 bg-cream-dark text-pink/60"
              }
            `}
            style={{ boxShadow: current === s.num ? "0 4px 20px rgba(255,134,183,0.4)" : "none" }}
          >
            {current > s.num ? "✓" : s.num}
          </div>
          <span
            className={`font-body text-xs font-semibold hidden sm:inline ${
              current === s.num ? "text-pink" : current > s.num ? "text-mint" : "text-pink/50"
            }`}
          >
            {s.label}
          </span>
          {i < 2 && (
            <div
              className={`w-8 h-0.5 rounded-full transition-all duration-500 ${
                current > s.num ? "bg-mint" : "bg-cream-dark"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Upload or Randomize ──
function StepUpload({ onUpload, onRandom }) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith("image/")) {
        onUpload(file);
      }
    },
    [onUpload]
  );

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="animate-slide-up flex flex-col items-center">
      <h2 className="font-heading text-3xl sm:text-4xl text-center text-pink mb-2">
        Meet Your New Best Friend!
      </h2>
      <p className="font-body text-base text-pink/50 text-center mb-8 max-w-md">
        Upload a photo of your pet to digitalize them, or let us surprise you with something magical
      </p>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`
          squishy relative w-full max-w-md aspect-square rounded-[32px] cursor-pointer
          flex flex-col items-center justify-center gap-4 mb-6 overflow-hidden
          transition-all duration-300
          ${
            dragOver
              ? "bg-pink/10 border-pink scale-[1.02]"
              : "bg-white/60 hover:bg-white/80"
          }
        `}
        style={{
          border: "3px dashed",
          borderColor: dragOver ? "#FF86B7" : "rgba(255,134,183,0.3)",
        }}
      >
        <Sparkles />
        <div className="text-6xl mb-2 animate-float">📸</div>
        <span className="font-heading text-lg text-pink">Drop your pet photo here</span>
        <span className="font-body text-sm text-pink/60">or click to browse</span>

        <button
          className="squishy mt-4 bg-pink text-white font-body font-bold text-base
                     px-8 py-3.5 rounded-full shadow-lg
                     hover:shadow-xl hover:bg-pink-dark"
          style={{ boxShadow: "0 6px 24px rgba(255,134,183,0.35)" }}
          onClick={(e) => {
            e.stopPropagation();
            fileRef.current?.click();
          }}
        >
          Digitalize My Pet ✨
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 w-full max-w-md mb-6">
        <div className="flex-1 h-px bg-pink/15" />
        <span className="font-body text-sm text-pink/55 font-semibold">or</span>
        <div className="flex-1 h-px bg-pink/15" />
      </div>

      {/* Surprise Button */}
      <button
        onClick={onRandom}
        className="squishy group relative bg-gradient-to-r from-sun to-sky
                   text-white font-heading text-lg px-10 py-4 rounded-full
                   shadow-lg hover:shadow-xl"
        style={{ boxShadow: "0 6px 24px rgba(255,210,63,0.35)" }}
      >
        <span className="relative z-10 flex items-center gap-2">
          🎲 Surprise Me!
          <span className="text-sm opacity-70 font-body font-semibold">
            (Rare drop!)
          </span>
        </span>
      </button>
    </div>
  );
}

// ── Step 2: Hatching / Loading ──
function StepHatching({ petType, onComplete }) {
  const [progress, setProgress] = useState(0);
  const [textIdx, setTextIdx] = useState(0);
  const [eggPhase, setEggPhase] = useState("bounce"); // bounce -> crack -> reveal

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) return 100;
        return p + Math.random() * 4 + 1.5;
      });
    }, 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTextIdx((i) => (i + 1) % LOADING_TEXTS.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (progress >= 60 && eggPhase === "bounce") setEggPhase("crack");
    if (progress >= 100) {
      setTimeout(() => setEggPhase("reveal"), 400);
      setTimeout(() => onComplete(), 2000);
    }
  }, [progress, eggPhase, onComplete]);

  return (
    <div className="animate-slide-up flex flex-col items-center">
      <h2 className="font-heading text-3xl sm:text-4xl text-center text-pink mb-2">
        {eggPhase === "reveal" ? "Ta-daa!" : "Something magical is happening..."}
      </h2>
      <p className="font-body text-base text-pink/50 text-center mb-10">
        {eggPhase === "reveal"
          ? "Your new companion has arrived!"
          : "Our AI is crafting your perfect pet companion"}
      </p>

      {/* Egg / Pet Reveal */}
      <div className="relative mb-10">
        <Sparkles />

        {eggPhase === "reveal" ? (
          <div className="animate-bounce-in">
            <div
              className="w-44 h-44 rounded-[40px] overflow-hidden sticker-border animate-pulse-glow"
              style={{ border: "3px solid rgba(255,134,183,0.3)" }}
            >
              <img
                src={petType === "dragon" ? DRAGON_IMAGE : PET_IMAGES[petType] || PET_IMAGES[0]}
                alt="Your new pet"
                className="w-full h-full object-cover"
              />
            </div>
            {petType === "dragon" && (
              <div className="animate-bounce-in mt-3 text-center">
                <span
                  className="inline-block bg-gradient-to-r from-sun to-pink text-white
                             font-heading text-sm px-4 py-1.5 rounded-full"
                  style={{ animationDelay: "0.3s" }}
                >
                  ★ RARE DRAGON ★
                </span>
              </div>
            )}
          </div>
        ) : (
          <div
            className={`text-[120px] leading-none ${
              eggPhase === "crack" ? "animate-egg-crack" : "animate-float"
            }`}
          >
            🥚
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-sm mb-4">
        <div className="h-4 rounded-full bg-cream-dark overflow-hidden sticker-border relative">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out relative"
            style={{
              width: `${Math.min(100, progress)}%`,
              background: "linear-gradient(90deg, #FF86B7, #FFD23F, #70D6FF)",
              backgroundSize: "200% 100%",
              animation: "3s ease-in-out infinite alternate",
            }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                animation: "progress-shine 1.5s ease-in-out infinite",
              }}
            />
          </div>
        </div>
        <div className="flex justify-between mt-2">
          <span className="font-body text-xs text-pink/60 font-semibold">
            {Math.min(100, Math.round(progress))}%
          </span>
          <span className="font-body text-xs text-pink/60 font-semibold">Powered by Grok AI</span>
        </div>
      </div>

      {/* Loading Text */}
      <p
        className="font-body text-sm text-pink/60 font-semibold animate-slide-up"
        key={textIdx}
      >
        {LOADING_TEXTS[textIdx]}
      </p>
    </div>
  );
}

// ── Step 3: Community Intro ──
function StepCommunity({ petType, uploadedImage, onPost, onSkip }) {
  const petName = petType === "dragon" ? "Rare Dragon" : ["Cat", "Dog", "Parrot", "Turtle", "Hamster", "Rabbit", "Fox", "Pomeranian"][petType] || "Pet";
  const [message, setMessage] = useState(
    `Hi everyone! Meet my new ${petName}! 🎉 Just joined the AI Pet community and I'm so excited to see what adventures await us together!`
  );
  const [name, setName] = useState(petType === "dragon" ? "Drako" : "");

  const imgSrc = uploadedImage
    ? URL.createObjectURL(uploadedImage)
    : petType === "dragon"
    ? DRAGON_IMAGE
    : PET_IMAGES[petType] || PET_IMAGES[0];

  return (
    <div className="animate-slide-up flex flex-col items-center w-full max-w-lg mx-auto">
      <h2 className="font-heading text-3xl sm:text-4xl text-center text-pink mb-2">
        Say Hello!
      </h2>
      <p className="font-body text-base text-pink/50 text-center mb-8">
        Introduce your new companion to the community
      </p>

      {/* Pet Card */}
      <div className="w-full bg-white/70 rounded-[32px] sticker-border p-6 mb-6 backdrop-blur-sm">
        <div className="flex items-start gap-5">
          {/* Pet Avatar */}
          <div className="shrink-0">
            <div
              className="w-24 h-24 rounded-[24px] overflow-hidden animate-float sticker-border"
              style={{ border: "3px solid rgba(255,134,183,0.25)" }}
            >
              <img src={imgSrc} alt={petName} className="w-full h-full object-cover" />
            </div>
            {petType === "dragon" && (
              <div className="mt-2 text-center">
                <span className="inline-block bg-gradient-to-r from-sun to-pink text-white font-body text-xs font-bold px-2.5 py-0.5 rounded-full">
                  ★ RARE
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-body text-xs text-pink/60 font-semibold">Pet Name</span>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name your pet..."
              className="w-full px-4 py-2.5 rounded-2xl bg-cream font-body text-base text-pink
                         placeholder:text-pink/45 outline-none transition-all duration-200
                         focus:ring-2 focus:ring-pink/30 mb-3"
              style={{ border: "2px solid rgba(255,134,183,0.15)" }}
            />
            <div className="flex gap-2 flex-wrap">
              <span className="font-body text-xs bg-sky/15 text-sky-dark px-3 py-1 rounded-full font-semibold">
                {petName}
              </span>
              <span className="font-body text-xs bg-sun/15 text-sun-dark px-3 py-1 rounded-full font-semibold">
                Lv.1
              </span>
              <span className="font-body text-xs bg-lavender/15 text-lavender px-3 py-1 rounded-full font-semibold">
                Newborn
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Introduction Message */}
      <div className="w-full bg-white/70 rounded-[32px] sticker-border p-6 mb-6 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">💬</span>
          <span className="font-body text-sm text-pink/60 font-bold">Introduction Message</span>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="w-full px-4 py-3 rounded-2xl bg-cream font-body text-sm text-pink/80
                     placeholder:text-pink/45 outline-none resize-none leading-relaxed
                     transition-all duration-200 focus:ring-2 focus:ring-pink/30"
          style={{ border: "2px solid rgba(255,134,183,0.15)" }}
        />
        <div className="flex justify-end mt-1">
          <span className="font-body text-xs text-pink/50">{message.length}/280</span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => onPost({ name: name || petName, message, petType })}
        disabled={!name.trim()}
        className={`squishy w-full font-heading text-lg text-white
                   py-4 rounded-full shadow-lg mb-3 transition-all duration-300
                   ${name.trim()
                     ? "bg-pink hover:bg-pink-dark hover:shadow-xl"
                     : "bg-pink/30 cursor-not-allowed"
                   }`}
        style={{
          boxShadow: name.trim() ? "0 8px 30px rgba(255,134,183,0.4)" : "none",
        }}
      >
        Post & Enter Arena 🏟️
      </button>

      <button
        onClick={onSkip}
        className="font-body text-sm text-pink/55 hover:text-pink/60 transition-colors"
      >
        Skip for now
      </button>
    </div>
  );
}

// ── Main Onboarding Component ──
export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1);
  const [petType, setPetType] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);

  const handleUpload = (file) => {
    setUploadedFile(file);
    // Assign random pet type for uploaded photos
    setPetType(Math.floor(Math.random() * 8));
    setStep(2);
  };

  const handleRandom = () => {
    // Hardcoded: always reveal Rare Dragon
    setPetType("dragon");
    setStep(2);
  };

  const handleHatchComplete = useCallback(() => {
    setStep(3);
  }, []);

  const handlePost = ({ name, message, petType: pt }) => {
    onComplete?.({ name, message, petType: pt, uploadedFile });
  };

  const handleSkip = () => {
    onComplete?.({ petType, uploadedFile, skipped: true });
  };

  return (
    <div className="min-h-screen bg-cream relative overflow-hidden">
      {/* Background decorations */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 w-80 h-80 rounded-full opacity-30"
        style={{ background: "radial-gradient(circle, #FF86B7 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #70D6FF 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute top-1/3 right-10 w-48 h-48 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #FFD23F 0%, transparent 70%)" }}
      />

      {/* Floating pet emojis */}
      {["🐱", "🐕", "🦜", "🐹", "🦊", "🐰"].map((emoji, i) => (
        <div
          key={i}
          className="pointer-events-none absolute animate-float text-2xl opacity-15"
          style={{
            left: `${8 + i * 16}%`,
            top: `${15 + (i % 3) * 25}%`,
            animationDelay: `${i * 0.8}s`,
            animationDuration: `${4 + i * 0.5}s`,
          }}
        >
          {emoji}
        </div>
      ))}

      {/* Content */}
      <div className="relative z-10 max-w-2xl mx-auto px-5 pt-24 pb-16">
        <StepIndicator current={step} />

        {step === 1 && <StepUpload onUpload={handleUpload} onRandom={handleRandom} />}
        {step === 2 && (
          <StepHatching petType={petType} onComplete={handleHatchComplete} />
        )}
        {step === 3 && (
          <StepCommunity
            petType={petType}
            uploadedImage={uploadedFile}
            onPost={handlePost}
            onSkip={handleSkip}
          />
        )}
      </div>
    </div>
  );
}

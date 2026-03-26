import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
} from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = ["#FF86B7", "#70D6FF", "#FFD23F"]; // pink, sky, sun

const SIZES = {
  sm: 120,
  md: 200,
  lg: 300,
};

const BLOB_COUNT = 10; // 8-12 range

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function createBlob(index, containerW, containerH) {
  const size = randomBetween(20, 60);
  return {
    id: index,
    x: randomBetween(0, containerW - size),
    y: randomBetween(0, containerH - size),
    size,
    baseSize: size,
    color: COLORS[index % COLORS.length],
    // oscillation parameters — each blob gets unique values
    freqX: randomBetween(0.3, 1.2),
    freqY: randomBetween(0.3, 1.2),
    ampX: randomBetween(10, containerW * 0.3),
    ampY: randomBetween(10, containerH * 0.3),
    phaseX: randomBetween(0, Math.PI * 2),
    phaseY: randomBetween(0, Math.PI * 2),
    pulsFreq: randomBetween(0.5, 2),
    pulsAmp: randomBetween(2, 8),
    // base centre for oscillation
    cx: randomBetween(size, containerW - size),
    cy: randomBetween(size, containerH - size),
  };
}

function entropyFromBlobs(blobs) {
  // XOR all blob positions into a 32-bit value, then format as hex
  let hash = 0;
  for (const b of blobs) {
    // Combine x, y, and size into the hash via XOR + bit mixing
    const xi = Math.round(b.x * 100);
    const yi = Math.round(b.y * 100);
    const si = Math.round(b.size * 100);
    hash ^= xi * 73856093;
    hash ^= yi * 19349663;
    hash ^= si * 83492791;
    hash = (hash >>> 0); // keep as unsigned 32-bit
  }
  return hash;
}

function hashToHex(hash) {
  return hash.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Entropy Context
// ---------------------------------------------------------------------------

const EntropyContext = createContext(null);

export function EntropyProvider({ children }) {
  const [entropy, setEntropy] = useState("00000000");
  const [seed, setSeed] = useState(0);

  const updateEntropy = useCallback((hexStr, numericSeed) => {
    setEntropy(hexStr);
    setSeed(numericSeed);
  }, []);

  const randomFloat = useCallback(() => {
    // Simple seeded-ish random from current seed — good enough for non-crypto use
    const s = seed ^ 0xdeadbeef;
    const t = (s + 0x6d2b79f5) | 0;
    let v = t ^ (t >>> 15);
    v = Math.imul(v | 1, v);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  }, [seed]);

  const randomInt = useCallback(
    (min, max) => {
      return Math.floor(randomFloat() * (max - min + 1)) + min;
    },
    [randomFloat]
  );

  return (
    <EntropyContext.Provider
      value={{ entropy, seed, randomFloat, randomInt, _update: updateEntropy }}
    >
      {children}
    </EntropyContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// useEntropy hook
// ---------------------------------------------------------------------------

export function useEntropy() {
  const ctx = useContext(EntropyContext);
  if (!ctx) {
    // Stand-alone usage without provider — return static defaults
    return {
      entropy: "00000000",
      seed: 0,
      randomFloat: () => Math.random(),
      randomInt: (min, max) =>
        Math.floor(Math.random() * (max - min + 1)) + min,
    };
  }
  const { entropy, seed, randomFloat, randomInt } = ctx;
  return { entropy, seed, randomFloat, randomInt };
}

// ---------------------------------------------------------------------------
// LavaLamp Component
// ---------------------------------------------------------------------------

function LavaLamp({ size = "md" }) {
  const dimension = SIZES[size] || SIZES.md;
  const containerH = Math.round(dimension * 1.5);
  const containerW = dimension;

  const blobsRef = useRef([]);
  const rafRef = useRef(null);
  const startTimeRef = useRef(null);
  const [blobs, setBlobs] = useState([]);
  const [entropyHex, setEntropyHex] = useState("00000000");

  // Try to get context updater (may be null if no provider)
  const ctx = useContext(EntropyContext);

  // Initialise blobs once
  useEffect(() => {
    const initial = Array.from({ length: BLOB_COUNT }, (_, i) =>
      createBlob(i, containerW, containerH)
    );
    blobsRef.current = initial;
    setBlobs(initial);
  }, [containerW, containerH]);

  // Animation loop
  useEffect(() => {
    startTimeRef.current = performance.now();

    function tick(now) {
      const elapsed = (now - startTimeRef.current) / 1000; // seconds

      const updated = blobsRef.current.map((b) => {
        const x =
          b.cx + Math.sin(elapsed * b.freqX + b.phaseX) * b.ampX;
        const y =
          b.cy + Math.cos(elapsed * b.freqY + b.phaseY) * b.ampY;
        const currentSize =
          b.baseSize + Math.sin(elapsed * b.pulsFreq) * b.pulsAmp;

        // Clamp within container
        const clampedX = Math.max(0, Math.min(containerW - currentSize, x));
        const clampedY = Math.max(0, Math.min(containerH - currentSize, y));

        return { ...b, x: clampedX, y: clampedY, size: currentSize };
      });

      blobsRef.current = updated;

      // Compute entropy
      const numericSeed = entropyFromBlobs(updated);
      const hex = hashToHex(numericSeed);

      setBlobs([...updated]);
      setEntropyHex(hex);

      if (ctx && ctx._update) {
        ctx._update(hex, numericSeed);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [containerW, containerH, ctx]);

  return (
    <div className="inline-flex flex-col items-center gap-2">
      {/* Lava lamp container */}
      <div
        className="relative overflow-hidden rounded-3xl sticker-border bg-cream"
        style={{
          width: containerW,
          height: containerH,
          backgroundColor: "#FFF9F2",
        }}
      >
        {blobs.map((b) => (
          <div
            key={b.id}
            style={{
              position: "absolute",
              left: b.x,
              top: b.y,
              width: b.size,
              height: b.size,
              borderRadius: "50%",
              backgroundColor: b.color,
              filter: "blur(8px)",
              opacity: 0.75,
              willChange: "transform",
              transition: "none",
            }}
          />
        ))}

        {/* Glass-like overlay for depth */}
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0.1) 100%)",
          }}
        />
      </div>

      {/* Entropy readout */}
      <div className="flex flex-col items-center gap-0.5">
        <span
          className="font-mono text-xs tracking-wider squishy select-all"
          style={{ color: "#422D26", fontFamily: "'JetBrains Mono', monospace" }}
        >
          0x{entropyHex}
        </span>
        <span
          className="font-body text-xs"
          style={{ color: "#422D26", opacity: 0.6, fontFamily: "Quicksand, sans-serif" }}
        >
          Entropy Source
        </span>
      </div>
    </div>
  );
}

export default LavaLamp;

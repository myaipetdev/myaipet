// saviorofhealth CINEMATIC REEL score — composed from scratch (we own it; zero copyright).
// Identity: confident tech-launch energy to match the kinetic promo:
//   104 BPM · Am → F → C → G · four-on-the-floor kick + clap on 2/4 + driving 8th bass
//   sidechain-pumped detuned pads · 16th pluck arps (ping-pong) · intro filter-in,
//   mid break, final lift. No noise beds. ~44s, loop-friendly. 16-bit stereo WAV.
import { writeFileSync } from "node:fs";

const SR = 44100, BPM = 104, BEAT = 60 / BPM, BAR = BEAT * 4;
const BARS = 19, DUR = BARS * BAR + 1.2; // ~45s
const N = Math.floor(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Am, F, C, G — anthemic minor-lift progression (root midi + chord tones)
const PROG = [
  { root: 45, tones: [57, 60, 64, 69] }, // A C E A
  { root: 41, tones: [57, 60, 65, 69] }, // F A C A
  { root: 48, tones: [55, 60, 64, 67] }, // C G C E G
  { root: 43, tones: [55, 59, 62, 67] }, // G B D G
];

// saw-ish tone via few odd/even partials (bright but controlled)
function sawTone(buf, buf2, t0, f, dur, vol, { attack = 0.01, decay = 3.5, pan = 0, detune = 0, bright = 1 } = {}) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  const gl = vol * (1 - Math.max(0, pan)), gr = vol * (1 + Math.min(0, pan));
  for (let i = 0; i < n; i++) {
    const t = i / SR, idx = s0 + i; if (idx >= N || idx < 0) break;
    const env = Math.min(1, t / attack) * Math.exp(-t * decay / Math.max(dur, 0.001));
    const f1 = f * (1 + detune * Math.sin(2 * Math.PI * 0.7 * t));
    const ph = 2 * Math.PI * f1 * t;
    const s = Math.sin(ph) + 0.5 * bright * Math.sin(2 * ph) + 0.3 * bright * Math.sin(3 * ph) + 0.15 * bright * Math.sin(4 * ph);
    buf[idx] += s * env * gl; buf2[idx] += s * env * gr;
  }
}
function kick(t0, vol) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(0.26 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR, idx = s0 + i; if (idx >= N) break;
    const f = 120 * Math.exp(-t * 22) + 42;
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 13) * vol;
    L[idx] += v; R[idx] += v;
  }
}
function clap(t0, vol) {
  // three micro-bursts of bandpassed noise
  for (const off of [0, 0.012, 0.026]) {
    const s0 = Math.floor((t0 + off) * SR), n = Math.floor(0.12 * SR);
    let b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const idx = s0 + i; if (idx >= N) break;
      const env = Math.exp(-(i / SR) * 34);
      const w = Math.random() * 2 - 1;
      b1 = 0.6 * b1 + 0.4 * w; const bp = w - b1; b2 = 0.7 * b2 + 0.3 * bp; // crude bandpass
      L[idx] += b2 * env * vol; R[idx] += b2 * env * vol * 0.92;
    }
  }
}
function hat(t0, vol) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(0.05 * SR);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx >= N) break;
    const env = Math.exp(-(i / SR) * 90);
    const w = Math.random() * 2 - 1; const hp = w - last; last = w;
    L[idx] += hp * env * vol * 0.9; R[idx] += hp * env * vol;
  }
}

let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR, ch = PROG[bar % 4];
  // arrangement intensity: intro(0) → full(1..8) → break(9,10) → lift(11..18)
  const phase = bar === 0 ? "intro" : bar <= 8 ? "full" : bar <= 10 ? "break" : "lift";
  const amp = phase === "intro" ? 0.55 : phase === "break" ? 0.7 : phase === "lift" ? 1.08 : 1;

  // pads: detuned stack, held across the bar (sidechain applied later)
  ch.tones.forEach((m, i) => {
    sawTone(L, R, t0 + i * 0.02, midi(m), BAR * 1.05, 0.028 * amp, { attack: 0.25, decay: 1.4, pan: i % 2 ? 0.3 : -0.3, detune: 0.0022, bright: 0.7 });
  });

  // bass: driving 8ths on root (octave hop on 4-and), skip in break
  if (phase !== "break") {
    for (let e = 0; e < 8; e++) {
      const oct = e === 7 ? 12 : 0;
      sawTone(L, R, t0 + e * (BEAT / 2), midi(ch.root - 12 + oct), BEAT * 0.42, 0.085 * amp, { attack: 0.004, decay: 5, bright: 0.5 });
    }
  } else {
    sawTone(L, R, t0, midi(ch.root - 12), BAR, 0.06, { attack: 0.3, decay: 1.2, bright: 0.3 });
  }

  // pluck arp: 16ths over chord tones, ping-pong pan, denser in lift
  const density = phase === "lift" ? 1 : phase === "full" ? 0.8 : 0.45;
  for (let k = 0; k < 16; k++) {
    if (rnd() > density) continue;
    const m = ch.tones[(k + bar) % ch.tones.length] + 12;
    sawTone(L, R, t0 + k * (BEAT / 4), midi(m), 0.32, 0.03 * amp, { attack: 0.002, decay: 9, pan: k % 2 ? 0.5 : -0.5, bright: 1.1 });
  }

  // drums
  if (phase !== "intro") {
    for (let b = 0; b < 4; b++) {
      if (phase !== "break") kick(t0 + b * BEAT, 0.2 * amp);
      if (b === 1 || b === 3) clap(t0 + b * BEAT, phase === "break" ? 0.05 : 0.11 * amp);
    }
    for (let e = 0; e < 8; e++) hat(t0 + e * (BEAT / 2) + BEAT / 4, (e % 2 ? 0.035 : 0.02) * amp);
  } else {
    kick(t0 + 0 * BEAT, 0.12); kick(t0 + 2 * BEAT, 0.12);
  }
}

// sidechain pump: duck the mix after every beat (skip the low intro to let it swell)
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const tb = t % BEAT;
  const pump = 1 - 0.32 * Math.exp(-tb * 9);
  L[i] *= pump; R[i] *= pump;
}

// master: fade in/out + soft clip
const fi = Math.floor(0.5 * SR), fo = Math.floor(1.5 * SR);
for (let i = 0; i < N; i++) {
  let g = 1;
  if (i < fi) g = i / fi;
  if (i > N - fo) g = (N - i) / fo;
  L[i] = Math.tanh(L[i] * 1.35) * 0.86 * g;
  R[i] = Math.tanh(R[i] * 1.35) * 0.86 * g;
}

const bytes = 44 + N * 4, buf = Buffer.alloc(bytes);
buf.write("RIFF", 0); buf.writeUInt32LE(bytes - 8, 4); buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, (L[i] * 32767) | 0)), 44 + i * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, (R[i] * 32767) | 0)), 46 + i * 4);
}
writeFileSync("bgm-sv2-launch.wav", buf);
console.log("bgm-sv2-launch.wav", (bytes / 1024 / 1024).toFixed(1) + "MB", DUR.toFixed(1) + "s");

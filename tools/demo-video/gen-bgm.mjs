// Cozy lo-fi BGM — synthesized from scratch (we own it; zero copyright).
// 72 BPM · Fmaj7 → Am7 → Dm9 → Cmaj7 · rhodes pads + soft bass + pentatonic
// plucks + vinyl crackle + laid-back kick/hat. Renders 16-bit stereo WAV.
import { writeFileSync } from "node:fs";

const SR = 44100, BPM = 72, BEAT = 60 / BPM, BAR = BEAT * 4;
const BARS = 12, DUR = BARS * BAR + 2; // ~42s
const N = Math.floor(SR * DUR);
const L = new Float32Array(N), Rr = new Float32Array(N);

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
// chords (midi): Fmaj7, Am7, Dm9, Cmaj7 — mellow voicings around middle C
const CHORDS = [
  [53, 57, 60, 64, 69],      // F A C E (A on top)
  [57, 60, 64, 67],          // A C E G
  [50, 57, 60, 65, 64],      // D A C F E(9th color)
  [48, 55, 59, 64],          // C G B E
];
const PENTA = [69, 72, 74, 76, 79, 81]; // A C D E G A — floats over all 4 chords

function addTone(buf, buf2, t0, f, dur, vol, { attack = 0.02, tone = 1, pan = 0, detune = 0 } = {}) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  const gl = vol * (1 - Math.max(0, pan)), gr = vol * (1 + Math.min(0, pan));
  for (let i = 0; i < n; i++) {
    const t = i / SR, idx = s0 + i; if (idx >= N) break;
    const env = Math.min(1, t / attack) * Math.exp(-t * (2.2 / dur) * 2.2);
    // rhodes-ish: fundamental + soft 2nd/3rd partials, slight detune shimmer
    const ph = 2 * Math.PI * f * t, ph2 = 2 * Math.PI * (f * (1 + detune)) * t;
    const s = Math.sin(ph) + 0.35 * tone * Math.sin(2 * ph + 0.6) + 0.12 * tone * Math.sin(3 * ph2);
    const v = s * env;
    buf[idx] += v * gl; buf2[idx] += v * gr;
  }
}
function addNoiseHit(t0, dur, vol, hp = false) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx >= N) break;
    const env = Math.exp(-(i / SR) * (5 / dur));
    let w = Math.random() * 2 - 1;
    if (hp) { const hpv = w - last; last = w; w = hpv; } // crude highpass for hats
    L[idx] += w * env * vol; Rr[idx] += w * env * vol * 0.9;
  }
}
function addKick(t0, vol) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(0.22 * SR);
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx >= N) break;
    const t = i / SR, f = 95 * Math.exp(-t * 18) + 38;
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 16) * vol;
    L[idx] += v; Rr[idx] += v;
  }
}

let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR, ch = CHORDS[bar % 4];
  // pad: chord tones, staggered soft attacks, held ~ the bar
  ch.forEach((m, i) => {
    addTone(L, Rr, t0 + i * 0.045, midi(m), BAR * 1.15, 0.055, { attack: 0.4, tone: 0.8, pan: (i % 2 ? 0.25 : -0.25), detune: 0.0015 });
  });
  // bass: root on 1, fifth on 3 (soft sine)
  addTone(L, Rr, t0, midi(ch[0] - 12), BEAT * 1.8, 0.10, { attack: 0.02, tone: 0.15 });
  if (rnd() > 0.35) addTone(L, Rr, t0 + 2 * BEAT, midi(ch[0] - 12 + 7), BEAT * 1.4, 0.07, { attack: 0.02, tone: 0.15 });
  // sparse pentatonic plucks (offbeats, quiet, humanized)
  for (let b = 0; b < 4; b++) {
    if (rnd() > 0.62) {
      const note = PENTA[Math.floor(rnd() * PENTA.length)];
      const jitter = (rnd() - 0.5) * 0.03;
      addTone(L, Rr, t0 + (b + 0.5) * BEAT + jitter, midi(note), 0.9, 0.045, { attack: 0.004, tone: 1.2, pan: rnd() * 0.8 - 0.4 });
    }
  }
  // laid-back drums: kick 1 & 3(swing), hat on offbeats
  addKick(t0, 0.16); addKick(t0 + 2 * BEAT + 0.02, 0.13);
  for (let b = 0; b < 4; b++) addNoiseHit(t0 + (b + 0.52) * BEAT, 0.05, 0.03, true);
}
// vinyl crackle bed
for (let i = 0; i < N; i++) {
  if (Math.random() < 0.00035) { const amp = Math.random() * 0.05; L[i] += amp; Rr[i] += amp * 0.8; }
  const hiss = (Math.random() * 2 - 1) * 0.0035;
  L[i] += hiss; Rr[i] += hiss;
}
// master: fade in/out + soft clip
const fadeN = Math.floor(1.2 * SR);
for (let i = 0; i < N; i++) {
  let g = 1;
  if (i < fadeN) g = i / fadeN;
  if (i > N - fadeN) g = (N - i) / fadeN;
  L[i] = Math.tanh(L[i] * 1.4) * 0.85 * g;
  Rr[i] = Math.tanh(Rr[i] * 1.4) * 0.85 * g;
}
// write 16-bit stereo WAV
const bytes = 44 + N * 4, buf = Buffer.alloc(bytes);
buf.write("RIFF", 0); buf.writeUInt32LE(bytes - 8, 4); buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, (L[i] * 32767) | 0)), 44 + i * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, (Rr[i] * 32767) | 0)), 46 + i * 4);
}
writeFileSync("bgm-cozy.wav", buf);
console.log("bgm-cozy.wav", (bytes / 1024 / 1024).toFixed(1) + "MB", DUR.toFixed(1) + "s");

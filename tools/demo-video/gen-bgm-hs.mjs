// HEALTH SAVIORS BGM — composed from scratch for this product (we own it; zero copyright).
// Identity: calm trust · clarity · health-tech. Deliberately distinct from the
// MY-AI-PET cozy lo-fi bed (no rhodes, no vinyl, no swing):
//   64 BPM (resting-heart-rate adjacent) · Am9 → Fmaj9 → Cmaj9 → G6(9)
//   glassy airy pads · heartbeat-inspired soft double-pulse · crystal arpeggio with
//   ping-pong echo (the "memory sparkle") · warm sub — and ZERO noise layers.
// Renders 16-bit stereo WAV (~46s, loop-friendly).
import { writeFileSync } from "node:fs";

const SR = 44100, BPM = 64, BEAT = 60 / BPM, BAR = BEAT * 4;
const BARS = 12, DUR = BARS * BAR + 1.5; // ~46.5s
const N = Math.floor(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Am9, Fmaj9, Cmaj9, G6(9) — open, hopeful-calm voicings
const CHORDS = [
  [57, 64, 67, 71, 74], // A E G B D
  [53, 60, 64, 69, 72], // F C E A C(+G color via arp)
  [48, 55, 62, 64, 71], // C G D E B
  [55, 62, 64, 69, 72], // G D E A C(6/9)
];

// glassy pad tone: fundamental + airy 5th/octave partials, slow chorus detune
function pad(t0, f, dur, vol, pan = 0) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  const gl = vol * (1 - Math.max(0, pan)), gr = vol * (1 + Math.min(0, pan));
  for (let i = 0; i < n; i++) {
    const t = i / SR, idx = s0 + i; if (idx >= N || idx < 0) break;
    const a = Math.min(1, t / 0.9), rel = Math.min(1, (dur - t) / 1.1);
    const env = a * rel;
    const wob = 1 + 0.0022 * Math.sin(2 * Math.PI * 0.13 * t);
    const ph = 2 * Math.PI * f * t;
    const s =
      Math.sin(ph) +
      0.22 * Math.sin(2 * Math.PI * f * 1.5 * t + 0.4) +   // airy 5th
      0.16 * Math.sin(2 * Math.PI * f * 2 * wob * t) +      // shimmering octave
      0.05 * Math.sin(2 * Math.PI * f * 3 * t + 1.1);
    L[idx] += s * env * gl; R[idx] += s * env * gr;
  }
}
// crystal pluck: bright sine-triangle blend, fast decay
function pluck(t0, f, vol, pan = 0) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(1.1 * SR);
  const gl = vol * (1 - Math.max(0, pan)), gr = vol * (1 + Math.min(0, pan));
  for (let i = 0; i < n; i++) {
    const t = i / SR, idx = s0 + i; if (idx >= N || idx < 0) break;
    const env = Math.min(1, t / 0.003) * Math.exp(-t * 5.2);
    const ph = 2 * Math.PI * f * t;
    const s = Math.sin(ph) + 0.28 * Math.sin(2 * ph) + 0.08 * Math.sin(4 * ph);
    L[idx] += s * env * gl; R[idx] += s * env * gr;
  }
}
// heartbeat-inspired pulse: warm low "lub-dub" (two soft sine thumps), no click
function heartbeat(t0, vol) {
  const thump = (tt, v, fBase) => {
    const s0 = Math.floor(tt * SR), n = Math.floor(0.16 * SR);
    for (let i = 0; i < n; i++) {
      const t = i / SR, idx = s0 + i; if (idx >= N || idx < 0) break;
      const f = fBase * Math.exp(-t * 9) + 42;
      const env = Math.min(1, t / 0.012) * Math.exp(-t * 15);
      const s = Math.sin(2 * Math.PI * f * t) * env * v;
      L[idx] += s; R[idx] += s;
    }
  };
  thump(t0, vol, 78);            // lub
  thump(t0 + 0.22, vol * 0.55, 66); // dub (softer)
}
// warm sub root
function sub(t0, f, dur, vol) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR, idx = s0 + i; if (idx >= N || idx < 0) break;
    const env = Math.min(1, t / 0.04) * Math.min(1, (dur - t) / 0.35);
    const s = Math.sin(2 * Math.PI * f * t) * env * vol;
    L[idx] += s; R[idx] += s;
  }
}

// ── arrangement ──
for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR, ch = CHORDS[bar % 4];
  const intro = bar === 0 ? 0.6 : 1;              // gentle first-bar entrance
  const lift = bar >= 8 ? 1.12 : 1;               // subtle final-third lift

  // pads: staggered chord tones, alternating pan
  ch.forEach((m, i) => {
    pad(t0 + i * 0.06, midi(m), BAR * 1.25, 0.045 * intro * lift, i % 2 ? 0.3 : -0.3);
  });

  // sub: root each bar, fifth on beat 3 every other bar
  sub(t0, midi(ch[0] - 24), BEAT * 2.2, 0.11 * intro);
  if (bar % 2 === 1) sub(t0 + 2 * BEAT, midi(ch[0] - 24 + 7), BEAT * 1.6, 0.07);

  // heartbeat pulse on 1 and 3 — the signature
  heartbeat(t0, 0.14 * intro);
  heartbeat(t0 + 2 * BEAT, 0.11 * intro);

  // crystal arpeggio ("memory sparkle"): deterministic up-pattern in 8ths,
  // skipping bar 0; ping-pong pan + two echo taps
  if (bar > 0) {
    const tones = [ch[2], ch[3], ch[4], ch[3]].map((m) => m + 12);
    for (let k = 0; k < 8; k++) {
      if (k % 2 === 0 && (bar + k / 2) % 3 === 2) continue; // breathing gaps
      const note = tones[k % tones.length];
      const tt = t0 + k * (BEAT / 2);
      const pan = k % 2 ? 0.45 : -0.45;
      const v = 0.032 * lift;
      pluck(tt, midi(note), v, pan);
      pluck(tt + BEAT * 0.75, midi(note), v * 0.4, -pan);        // echo 1 (crossed)
      pluck(tt + BEAT * 1.5, midi(note), v * 0.18, pan * 0.6);   // echo 2
    }
  }
}

// master: fade in/out + gentle soft-clip glue (no noise anywhere)
const fadeIn = Math.floor(0.8 * SR), fadeOut = Math.floor(1.4 * SR);
for (let i = 0; i < N; i++) {
  let g = 1;
  if (i < fadeIn) g = i / fadeIn;
  if (i > N - fadeOut) g = (N - i) / fadeOut;
  L[i] = Math.tanh(L[i] * 1.3) * 0.85 * g;
  R[i] = Math.tanh(R[i] * 1.3) * 0.85 * g;
}

// write 16-bit stereo WAV
const bytes = 44 + N * 4, buf = Buffer.alloc(bytes);
buf.write("RIFF", 0); buf.writeUInt32LE(bytes - 8, 4); buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, (L[i] * 32767) | 0)), 44 + i * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, (R[i] * 32767) | 0)), 46 + i * 4);
}
writeFileSync("bgm-healthsaviors.wav", buf);
console.log("bgm-healthsaviors.wav", (bytes / 1024 / 1024).toFixed(1) + "MB", DUR.toFixed(1) + "s");

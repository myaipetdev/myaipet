// "Adventure" BGM v2 — a DIFFERENT track from bgm-cozy (which was 72BPM lo-fi
// rhodes). This one: 92 BPM, C major, kalimba plucks + music-box bells + warm
// pad + shaker. Through-composed 90s (intro → A → B lift → A' → outro), so a
// 73s video never hears a loop seam. Self-synthesized: we own it, zero copyright.
import { writeFileSync } from "node:fs";

const SR = 44100, BPM = 92, BEAT = 60 / BPM, BAR = BEAT * 4;
const BARS = 34, DUR = BARS * BAR + 1.6; // ≈ 90.3s
const N = Math.floor(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// ── voices ──
function pluck(t0, m, vol, pan = 0) { // kalimba-ish: fast attack, quick decay, woody 3rd partial
  const f = midi(m), s0 = Math.floor(t0 * SR), n = Math.floor(1.1 * SR);
  const gl = vol * (1 - Math.max(0, pan)), gr = vol * (1 + Math.min(0, pan));
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx >= N) break;
    const t = i / SR, env = Math.min(1, t / 0.004) * Math.exp(-t * 6.5);
    const s = Math.sin(2 * Math.PI * f * t) + 0.28 * Math.sin(2 * Math.PI * f * 3 * t + 0.5) * Math.exp(-t * 14);
    L[idx] += s * env * gl; R[idx] += s * env * gr;
  }
}
function bell(t0, m, vol, pan = 0) { // music-box: inharmonic shimmer, long tail
  const f = midi(m), s0 = Math.floor(t0 * SR), n = Math.floor(2.2 * SR);
  const gl = vol * (1 - Math.max(0, pan)), gr = vol * (1 + Math.min(0, pan));
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx >= N) break;
    const t = i / SR, env = Math.min(1, t / 0.002) * Math.exp(-t * 2.6);
    const s = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 5);
    L[idx] += s * env * gl * 0.8; R[idx] += s * env * gr;
  }
}
function pad(t0, m, dur, vol, pan = 0) { // warm slow swell
  const f = midi(m), s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  const gl = vol * (1 - Math.max(0, pan)), gr = vol * (1 + Math.min(0, pan));
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx >= N) break;
    const t = i / SR;
    const env = Math.min(1, t / 0.7) * Math.min(1, (dur - t) / 0.9);
    const s = Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 1.002 * t) + 0.18 * Math.sin(2 * Math.PI * f * 2 * t);
    L[idx] += s * env * gl; R[idx] += s * env * gr;
  }
}
function bass(t0, m, dur, vol) {
  const f = midi(m), s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx >= N) break;
    const t = i / SR, env = Math.min(1, t / 0.015) * Math.exp(-t * (2 / dur));
    const v = (Math.sin(2 * Math.PI * f * t) + 0.15 * Math.sin(2 * Math.PI * f * 2 * t)) * env * vol;
    L[idx] += v; R[idx] += v;
  }
}
function kick(t0, vol) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(0.16 * SR);
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx >= N) break;
    const t = i / SR, f = 105 * Math.exp(-t * 22) + 42;
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 20) * vol;
    L[idx] += v; R[idx] += v;
  }
}
function shaker(t0, vol) { // short hp noise
  const s0 = Math.floor(t0 * SR), n = Math.floor(0.055 * SR);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx >= N) break;
    const env = Math.exp(-(i / SR) * 90);
    const w = Math.random() * 2 - 1, hp = w - last; last = w;
    L[idx] += hp * env * vol * 0.9; R[idx] += hp * env * vol;
  }
}

// ── harmony/melody material (C major) ──
const CH = {
  C:  [48, 55, 60, 64], GB: [47, 55, 59, 62], Am: [45, 52, 57, 60], F: [41, 53, 57, 60],
  G:  [43, 55, 59, 62], Em: [40, 52, 55, 59], Cmaj9: [48, 55, 62, 64, 67],
};
const A_PROG = [CH.C, CH.GB, CH.Am, CH.F];
const B_PROG = [CH.F, CH.G, CH.Em, CH.Am];
const PENTA = [72, 74, 76, 79, 81, 84];

// section map: [startBar, endBar), kind
const SECTIONS = [
  { from: 0,  to: 4,  kind: "intro" },
  { from: 4,  to: 12, kind: "A" },
  { from: 12, to: 20, kind: "B" },
  { from: 20, to: 28, kind: "A2" },
  { from: 28, to: 34, kind: "outro" },
];

for (const sec of SECTIONS) {
  for (let bar = sec.from; bar < sec.to; bar++) {
    const t0 = bar * BAR, k = sec.kind, bi = bar - sec.from;
    const prog = k === "B" ? B_PROG : A_PROG;
    const ch = k === "intro" || k === "outro" ? CH.Cmaj9 : prog[bi % 4];

    // pad bed (always, quieter in intro/outro tails)
    const padVol = k === "intro" ? 0.035 + bi * 0.006 : k === "outro" ? Math.max(0.012, 0.045 - bi * 0.007) : 0.05;
    ch.forEach((m, i) => pad(t0 + i * 0.06, m + 12, BAR * 1.1, padVol / ch.length * 2.2, i % 2 ? 0.3 : -0.3));

    // bass (not in intro bar 0-1, thins in outro)
    if (!(k === "intro" && bi < 2)) {
      const root = ch[0] - 12;
      bass(t0, root, BEAT * 1.7, k === "outro" ? 0.07 : 0.11);
      if (k !== "outro") bass(t0 + 2 * BEAT, root + (rnd() > 0.5 ? 7 : 0), BEAT * 1.5, 0.08);
    }

    // kalimba arpeggio — the signature: 8th-note broken chord, denser in B/A2
    const dens = k === "intro" ? 0.45 : k === "A" ? 0.68 : k === "B" ? 0.85 : k === "A2" ? 0.8 : 0.4;
    for (let e = 0; e < 8; e++) {
      if (rnd() < dens) {
        const tone = ch[(e + (bar % 3)) % ch.length] + 12 + (e % 4 === 3 ? 12 : 0);
        pluck(t0 + e * BEAT / 2 + (rnd() - 0.5) * 0.012, tone, 0.055, (e % 2 ? 0.35 : -0.35));
      }
    }

    // melody: bells carry a seeded pentatonic phrase (A/B/A2), octave up in A2
    if (k === "A" || k === "B" || k === "A2") {
      for (let b = 0; b < 4; b++) {
        if (rnd() > (k === "B" ? 0.38 : 0.5)) {
          const note = PENTA[Math.floor(rnd() * PENTA.length)] + (k === "A2" ? 12 : 0) + (k === "B" ? 0 : 0);
          bell(t0 + b * BEAT + (rnd() > 0.7 ? BEAT / 2 : 0) + (rnd() - 0.5) * 0.02, note, 0.05, rnd() * 0.7 - 0.35);
        }
      }
    }
    // outro: sparse falling bells
    if (k === "outro" && bi % 2 === 0) bell(t0 + BEAT, PENTA[Math.max(0, 4 - bi)] ?? 72, 0.045, 0.2);

    // drums: none in intro bars 0-1 / last outro bars; grow with sections
    const drum = k === "intro" ? (bi >= 2 ? 0.5 : 0) : k === "outro" ? (bi < 3 ? 0.5 : 0) : k === "B" ? 1.1 : 1;
    if (drum > 0) {
      kick(t0, 0.15 * drum); kick(t0 + 2.5 * BEAT, 0.11 * drum);
      for (let e = 0; e < 8; e++) shaker(t0 + e * BEAT / 2 + 0.01, (e % 2 ? 0.028 : 0.016) * drum);
      if (k === "B" || k === "A2") shaker(t0 + 1 * BEAT, 0.05 * drum), shaker(t0 + 3 * BEAT, 0.05 * drum);
    }
  }
}

// gentle tape hiss bed (much lighter than v1's vinyl)
for (let i = 0; i < N; i++) {
  const h = (Math.random() * 2 - 1) * 0.0022;
  L[i] += h; R[i] += h;
}
// master: fades + soft clip
const fi = Math.floor(1.0 * SR), fo = Math.floor(2.2 * SR);
for (let i = 0; i < N; i++) {
  let g = 1;
  if (i < fi) g = i / fi;
  if (i > N - fo) g = (N - i) / fo;
  L[i] = Math.tanh(L[i] * 1.35) * 0.85 * g;
  R[i] = Math.tanh(R[i] * 1.35) * 0.85 * g;
}
// 16-bit stereo WAV
const bytes = 44 + N * 4, buf = Buffer.alloc(bytes);
buf.write("RIFF", 0); buf.writeUInt32LE(bytes - 8, 4); buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, (L[i] * 32767) | 0)), 44 + i * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, (R[i] * 32767) | 0)), 46 + i * 4);
}
writeFileSync("bgm-adventure.wav", buf);
console.log("bgm-adventure.wav", (bytes / 1024 / 1024).toFixed(1) + "MB", DUR.toFixed(1) + "s");

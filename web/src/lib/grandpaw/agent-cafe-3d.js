// @ts-nocheck
/* eslint-disable */
// GrandPaw diorama — "The Grand Paw" pet-hotel lobby (three.js, fully procedural).
// Ported 1:1 from the founder-approved reference bundle; labels/bubbles are
// parameterized via a `data-live` JSON attribute so everything shown is REAL
// mission-control data (pet names, memory counts, skills, soul level, goals).
// Register by importing this module once on the client (guarded define below).
// Agent Office — "The Grand Paw" Pet Hotel Lobby (three.js diorama)
// <agent-cafe-3d auto-rotate="on|off" show-labels="on|off">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const C = {
  walnut: 0x6E4E33,
  walnutDark: 0x54381F,
  walnutLight: 0x8A6238,
  linen: 0xE8DEC8,
  creamFabric: 0xEDE3CE,
  emeraldLight: 0xC9A76B,
  velvetGreen: 0x6B2A34,
  velvetTerra: 0xB8613E,
  brass: 0xB08D3C,
  brassBright: 0xD9B45C,
  glass: 0xDCE9E4,
  ink: 0x3A322A,
  blush: 0xC98A8A,
  rope: 0x9A3E3E
};

function std(name, color, rough = 0.85, metal = 0, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...opts });
  m.name = name;
  return m;
}
function phys(name, color, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, ...opts });
  m.name = name;
  return m;
}

// ---------- procedural textures ----------
function checkerMarbleTexture() {
  const S = 1024, tiles = 8, ts = S / tiles;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  for (let r = 0; r < tiles; r++) {
    for (let col = 0; col < tiles; col++) {
      x.fillStyle = (r + col) % 2 ? '#C9B89C' : '#EFE7D6';
      x.fillRect(col * ts, r * ts, ts, ts);
    }
  }
  // marble veins
  const vein = (colr, w, blur, n) => {
    x.strokeStyle = colr; x.lineWidth = w; x.filter = `blur(${blur}px)`;
    for (let i = 0; i < n; i++) {
      x.beginPath();
      let px = Math.random() * S, py = -20;
      x.moveTo(px, py);
      while (py < S + 20) {
        px += (Math.random() - 0.5) * 110;
        py += 40 + Math.random() * 60;
        x.lineTo(px, py);
      }
      x.stroke();
    }
  };
  vein('rgba(255,252,242,0.25)', 2.5, 3, 9);
  vein('rgba(120,102,76,0.18)', 1.5, 2, 7);
  x.filter = 'none';
  // grout
  x.strokeStyle = 'rgba(96,80,56,0.5)'; x.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    x.beginPath(); x.moveTo(i * ts, 0); x.lineTo(i * ts, S); x.stroke();
    x.beginPath(); x.moveTo(0, i * ts); x.lineTo(S, i * ts); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.75, 1.95);
  t.anisotropy = 16;
  return t;
}

function marbleTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#F0EBE1'; x.fillRect(0, 0, S, S);
  const vein = (col, w, blur, n) => {
    x.strokeStyle = col; x.lineWidth = w; x.filter = `blur(${blur}px)`;
    for (let i = 0; i < n; i++) {
      x.beginPath();
      let px = Math.random() * S, py = -20;
      x.moveTo(px, py);
      while (py < S + 20) {
        px += (Math.random() - 0.5) * 90;
        py += 30 + Math.random() * 50;
        x.lineTo(px, py);
      }
      x.stroke();
    }
  };
  vein('rgba(190,182,166,0.55)', 3, 4, 7);
  vein('rgba(168,158,140,0.5)', 1.6, 2, 9);
  vein('rgba(146,134,116,0.4)', 1, 1, 5);
  vein('rgba(201,178,134,0.28)', 1.2, 2, 3);
  x.filter = 'none';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function plasterTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#F2E9D6'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 5200; i++) {
    const v = Math.random();
    x.fillStyle = v > 0.5 ? 'rgba(255,252,240,0.05)' : 'rgba(160,140,105,0.05)';
    const r = 1 + Math.random() * 3;
    x.fillRect(Math.random() * S, Math.random() * S, r, r);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

function runnerTexture() {
  const W = 512, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#5E2630'; x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.08;
  for (let i = 0; i < 2200; i++) {
    x.fillStyle = i % 2 ? '#E0A9B2' : '#2A0F14';
    x.fillRect(Math.random() * W, Math.random() * H, 3, 3);
  }
  x.globalAlpha = 1;
  // gold double border
  x.strokeStyle = '#C9A227'; x.lineWidth = 10;
  x.strokeRect(24, 24, W - 48, H - 48);
  x.strokeStyle = 'rgba(201,162,39,0.6)'; x.lineWidth = 4;
  x.strokeRect(46, 46, W - 92, H - 92);
  // center medallion
  x.strokeStyle = 'rgba(201,162,39,0.85)'; x.lineWidth = 5;
  x.beginPath(); x.arc(W / 2, H / 2, 118, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = 'rgba(201,162,39,0.45)'; x.lineWidth = 2.5;
  x.beginPath(); x.arc(W / 2, H / 2, 96, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(W / 2, H / 2, 146, 0, Math.PI * 2); x.stroke();
  x.save();
  x.translate(W / 2, H / 2);
  x.strokeStyle = 'rgba(201,162,39,0.6)'; x.lineWidth = 3;
  for (let p = 0; p < 8; p++) {
    x.rotate(Math.PI / 4);
    x.beginPath(); x.ellipse(0, 62, 16, 44, 0, 0, Math.PI * 2); x.stroke();
  }
  x.restore();
  // diamond lattice
  x.strokeStyle = 'rgba(201,162,39,0.12)'; x.lineWidth = 2;
  for (let i = -8; i < 16; i++) {
    x.beginPath(); x.moveTo(i * 90, 0); x.lineTo(i * 90 + H / 2, H); x.stroke();
    x.beginPath(); x.moveTo(i * 90, 0); x.lineTo(i * 90 - H / 2, H); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function gardenTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#F6F1DE');
  g.addColorStop(0.5, '#DCE8CE');
  g.addColorStop(1, '#AEC69B');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  x.filter = 'blur(16px)';
  [[120, 330, 95, '#8FAE7C'], [330, 295, 125, '#7C9E6B'], [560, 345, 105, '#96B583'], [800, 305, 135, '#7C9E6B'], [970, 355, 85, '#8FAE7C']].forEach(([bx, by, r, col]) => {
    x.fillStyle = col;
    x.beginPath(); x.arc(bx, by, r, 0, Math.PI * 2); x.fill();
  });
  x.filter = 'blur(5px)';
  x.fillStyle = '#6B8A5B';
  for (let i = 0; i < 14; i++) {
    x.beginPath(); x.arc(i * 80 + 30, 462 + (i % 3) * 13, 48, 0, Math.PI * 2); x.fill();
  }
  x.filter = 'none';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mashrabiyaTexture() {
  const W = 256, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  x.strokeStyle = '#E8C36A'; x.lineWidth = 5; x.lineCap = 'round';
  const cell = 64;
  for (let gy = 0; gy <= H / cell; gy++) {
    for (let gx = 0; gx <= W / cell; gx++) {
      const px = gx * cell, py = gy * cell;
      x.beginPath(); x.arc(px, py, 25, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.arc(px + cell / 2, py + cell / 2, 25, 0, Math.PI * 2); x.stroke();
      x.beginPath();
      x.moveTo(px - 13, py + cell / 2); x.lineTo(px + 13, py + cell / 2);
      x.moveTo(px + cell / 2, py - 13); x.lineTo(px + cell / 2, py + 13);
      x.stroke();
    }
  }
  x.strokeStyle = '#D9B45C'; x.lineWidth = 12;
  x.strokeRect(4, 4, W - 8, H - 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function contactShadowTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(30,18,6,0.85)');
  g.addColorStop(0.55, 'rgba(30,18,6,0.4)');
  g.addColorStop(1, 'rgba(30,18,6,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

function shaftTexture() {
  const W = 256, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const gv = x.createLinearGradient(0, 0, 0, H);
  gv.addColorStop(0, 'rgba(255,235,190,0.7)');
  gv.addColorStop(0.55, 'rgba(255,235,190,0.3)');
  gv.addColorStop(1, 'rgba(255,235,190,0)');
  x.fillStyle = gv; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'destination-in';
  const gh = x.createLinearGradient(0, 0, W, 0);
  gh.addColorStop(0, 'rgba(0,0,0,0)');
  gh.addColorStop(0.22, 'rgba(0,0,0,0.55)');
  gh.addColorStop(0.5, 'rgba(0,0,0,1)');
  gh.addColorStop(0.78, 'rgba(0,0,0,0.55)');
  gh.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gh; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  return new THREE.CanvasTexture(c);
}

function poolTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,238,200,0.8)');
  g.addColorStop(0.6, 'rgba(255,238,200,0.3)');
  g.addColorStop(1, 'rgba(255,238,200,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

function furTexture({ base, belly, dark, tabby }) {
  const S = 512;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  const yOf = (v) => (1 - v) * S;
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  // soft saddle shading on the back (u=0.75 → px 384)
  x.save();
  x.translate(384, yOf(0.42)); x.scale(1.15, 1.9);
  let g = x.createRadialGradient(0, 0, 18, 0, 0, 130);
  g.addColorStop(0, rgba(dark, 0.28)); g.addColorStop(1, rgba(dark, 0));
  x.fillStyle = g; x.fillRect(-160, -160, 320, 320);
  x.restore();
  // belly + chest light column (front u=0.25 → px 128)
  x.save();
  x.translate(128, yOf(0.34)); x.scale(1, 2.1);
  g = x.createRadialGradient(0, 0, 14, 0, 0, 104);
  g.addColorStop(0, rgba(belly, 0.95)); g.addColorStop(0.7, rgba(belly, 0.6)); g.addColorStop(1, rgba(belly, 0));
  x.fillStyle = g; x.fillRect(-130, -130, 260, 260);
  x.restore();
  // chin / muzzle light
  x.save();
  x.translate(128, yOf(0.8)); x.scale(1.5, 1);
  g = x.createRadialGradient(0, 0, 8, 0, 0, 56);
  g.addColorStop(0, rgba(belly, 0.95)); g.addColorStop(1, rgba(belly, 0));
  x.fillStyle = g; x.fillRect(-90, -90, 180, 180);
  x.restore();
  if (tabby) {
    x.strokeStyle = rgba(dark, 0.85); x.lineCap = 'round';
    [0.40, 0.52, 0.64].forEach((v, i) => {
      x.lineWidth = 17 - i * 2;
      x.beginPath();
      x.moveTo(288, yOf(v));
      x.quadraticCurveTo(384, yOf(v + 0.06), 480, yOf(v));
      x.stroke();
    });
    x.lineWidth = 9;
    [-26, 0, 26].forEach((dx) => {
      x.beginPath();
      x.moveTo(384 + dx, yOf(0.83));
      x.lineTo(384 + dx * 0.7, yOf(0.9));
      x.stroke();
    });
  }
  for (let i = 0; i < 520; i++) {
    const fx = Math.random() * S, fy = Math.random() * S;
    x.strokeStyle = i % 2 ? 'rgba(255,255,255,0.045)' : rgba(dark, 0.05);
    x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + (Math.random() - 0.5) * 3, fy + 5 + Math.random() * 9); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function sculptSphere(geo, bumps, post) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();
    let r = v.length();
    for (const b of bumps) {
      const d = n.dot(b.dir);
      if (d > 0) { r += b.amp * Math.pow(d, b.k); }
    }
    v.copy(n).multiplyScalar(r);
    if (post) { post(v); }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function plushRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

// sphere UV: front(+z) at u=0.25 (px128/512), back at u=0.75 (px384); v=1 top (py 0)
function plushBodyTexture({ base, belly, dark, tabby, tux }) {
  const S = 512;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  // light belly bib down the front
  let g = x.createLinearGradient(0, S * 0.2, 0, S);
  g.addColorStop(0, plushRgba(belly, 0));
  g.addColorStop(0.3, plushRgba(belly, tux ? 0.98 : 0.9));
  g.addColorStop(1, plushRgba(belly, 0.98));
  x.fillStyle = g;
  const bw = tux ? 46 : 32;
  x.beginPath();
  x.moveTo(128 - bw, S * 0.16);
  x.quadraticCurveTo(128 - 110, S * 0.6, 128 - 128, S);
  x.lineTo(128 + 128, S);
  x.quadraticCurveTo(128 + 110, S * 0.6, 128 + bw, S * 0.16);
  x.closePath();
  x.fill();
  // darker saddle over the back
  x.save(); x.translate(384, S * 0.2); x.scale(1.6, 1);
  g = x.createRadialGradient(0, 0, 26, 0, 0, 168);
  g.addColorStop(0, plushRgba(dark, 0.32)); g.addColorStop(1, plushRgba(dark, 0));
  x.fillStyle = g; x.fillRect(-220, -220, 440, 440);
  x.restore();
  if (tabby) {
    x.strokeStyle = plushRgba(dark, 0.8); x.lineCap = 'round';
    [[0.13, 200, 17], [0.24, 218, 15], [0.35, 226, 13]].forEach(([vy, w2, lw]) => {
      x.lineWidth = lw;
      x.beginPath();
      x.moveTo(384 - w2 / 2, vy * S + 30);
      x.quadraticCurveTo(384, vy * S - 22, 384 + w2 / 2, vy * S + 30);
      x.stroke();
    });
  }
  for (let i = 0; i < 420; i++) {
    const fx = Math.random() * S, fy = Math.random() * S;
    x.strokeStyle = i % 2 ? 'rgba(255,255,255,0.045)' : plushRgba(dark, 0.05);
    x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + (Math.random() - 0.5) * 3, fy + 5 + Math.random() * 8); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function plushHeadTexture({ base, belly, dark, tabby }) {
  const S = 512;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  // muzzle patch (front-lower)
  x.save(); x.translate(128, 330); x.scale(1.6, 1.05);
  let g = x.createRadialGradient(0, 0, 12, 0, 0, 88);
  g.addColorStop(0, plushRgba(belly, 0.98));
  g.addColorStop(0.72, plushRgba(belly, 0.9));
  g.addColorStop(1, plushRgba(belly, 0));
  x.fillStyle = g; x.fillRect(-150, -150, 300, 300);
  x.restore();
  // brow lightening
  x.save(); x.translate(128, 175); x.scale(1.8, 1);
  g = x.createRadialGradient(0, 0, 10, 0, 0, 95);
  g.addColorStop(0, plushRgba(belly, 0.28)); g.addColorStop(1, plushRgba(belly, 0));
  x.fillStyle = g; x.fillRect(-180, -180, 360, 360);
  x.restore();
  // crown/back shading
  x.save(); x.translate(384, 110); x.scale(1.7, 1);
  g = x.createRadialGradient(0, 0, 20, 0, 0, 150);
  g.addColorStop(0, plushRgba(dark, 0.3)); g.addColorStop(1, plushRgba(dark, 0));
  x.fillStyle = g; x.fillRect(-220, -220, 440, 440);
  x.restore();
  if (tabby) {
    x.strokeStyle = plushRgba(dark, 0.85); x.lineCap = 'round'; x.lineWidth = 12;
    [-38, 0, 38].forEach((dx) => {
      x.beginPath();
      x.moveTo(128 + dx, 86);
      x.quadraticCurveTo(128 + dx * 0.82, 130, 128 + dx * 0.72, 172);
      x.stroke();
    });
  }
  for (let i = 0; i < 300; i++) {
    const fx = Math.random() * S, fy = Math.random() * S;
    x.strokeStyle = i % 2 ? 'rgba(255,255,255,0.04)' : plushRgba(dark, 0.045);
    x.lineWidth = 1.1;
    x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + (Math.random() - 0.5) * 3, fy + 4 + Math.random() * 7); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function furAlphaTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 30000; i++) {
    x.fillStyle = 'rgba(255,255,255,' + (0.45 + Math.random() * 0.55) + ')';
    x.fillRect(Math.random() * S, Math.random() * S, 1.7, 1.7);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}
const FUR_ALPHA = furAlphaTexture();

const TOON_GRADIENT = (() => {
  const t = new THREE.DataTexture(new Uint8Array([150, 212, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const PET_OUTLINE_RE = /_body$|_head$|_ruff$|_tail\d$|_tailTip$|_ear[LR]_shell$|_paw[LR]_(limb|tip)$|_hatCrown$|_hatBrim$|_kerchiefTri$|_haunch[LR]$|_hindfoot[LR]$/;

function toonifyPet(root) {
  const toOutline = [];
  root.traverse((o) => {
    if (!o.isMesh) { return; }
    const m = o.material;
    if (!m || m.transparent) { return; }
    const nm = m.name || '';
    if (nm.includes('Eye') || nm.includes('Glint') || nm === 'brass' || nm === 'gold' || nm.includes('Outline')) { return; }
    const t = new THREE.MeshToonMaterial({ color: m.color ? m.color.clone() : new THREE.Color(0xFFFFFF), map: m.map || null, gradientMap: TOON_GRADIENT });
    t.name = nm + 'Toon';
    o.material = t;
    if (PET_OUTLINE_RE.test(o.name)) { toOutline.push(o); }
  });
  toOutline.forEach((mesh) => {
    const isHat = mesh.name.indexOf('_hat') >= 0;
    const om = new THREE.MeshBasicMaterial({ color: isHat ? 0x14100B : 0x4A3527, side: THREE.BackSide });
    om.name = 'toonOutline';
    const o2 = new THREE.Mesh(mesh.geometry, om);
    o2.name = mesh.name + '_outline';
    o2.scale.setScalar(isHat ? 1.03 : 1.042);
    o2.castShadow = false;
    o2.receiveShadow = false;
    mesh.add(o2);
  });
}

function eyeTexture(irisHex) {
  const S = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#241C14'; x.fillRect(0, 0, S, S);
  // iris centered at front of sphere (u=0.25 → px64, v=0.5 → py128)
  const cx = 64, cy = 128, R = 47;
  let g = x.createRadialGradient(cx, cy - 6, 6, cx, cy, R);
  g.addColorStop(0, plushRgba(irisHex, 1));
  g.addColorStop(0.55, plushRgba(irisHex, 0.92));
  g.addColorStop(0.85, plushRgba(irisHex, 0.55));
  g.addColorStop(1, 'rgba(20,14,8,1)');
  x.fillStyle = g;
  x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
  // radial iris fibres
  x.strokeStyle = 'rgba(30,20,10,0.35)'; x.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
    x.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4));
    x.stroke();
  }
  // round anime pupil + baked highlights
  x.fillStyle = '#140E08';
  x.beginPath(); x.arc(cx, cy + 2, 18, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.96)';
  x.beginPath(); x.arc(cx - 13, cy - 15, 10, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(cx + 11, cy + 13, 4.5, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tailTexture({ base, dark, tabby }) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 256, 32);
  if (tabby) {
    x.fillStyle = dark;
    [86, 142, 198].forEach((px, i) => { x.fillRect(px, 0, 34 - i * 4, 32); });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function artTexture() {
  const c = document.createElement('canvas'); c.width = 384; c.height = 480;
  const x = c.getContext('2d');
  x.fillStyle = '#F4EDDC'; x.fillRect(0, 0, 384, 480);
  x.strokeStyle = '#3A322A'; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath();
  x.moveTo(96, 330);
  x.bezierCurveTo(70, 250, 96, 180, 150, 160);
  x.lineTo(140, 118); x.lineTo(172, 142);
  x.bezierCurveTo(186, 134, 206, 134, 220, 142);
  x.lineTo(252, 118); x.lineTo(242, 162);
  x.bezierCurveTo(296, 190, 312, 262, 288, 330);
  x.bezierCurveTo(272, 368, 128, 368, 96, 330);
  x.stroke();
  x.beginPath();
  x.moveTo(288, 320);
  x.bezierCurveTo(330, 300, 336, 250, 316, 230);
  x.stroke();
  x.fillStyle = '#3A322A';
  x.beginPath(); x.arc(166, 220, 5, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(226, 220, 5, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(190, 244); x.lineTo(202, 244); x.lineTo(196, 252); x.closePath(); x.fill();
  x.strokeStyle = '#A8802B'; x.lineWidth = 3;
  x.beginPath(); x.arc(196, 396, 26, 0, Math.PI * 2); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const M = {
  walnut: phys('walnut', C.walnut, { roughness: 0.55, clearcoat: 0.22, clearcoatRoughness: 0.5, envMapIntensity: 0.75 }),
  walnutDark: phys('walnutDark', C.walnutDark, { roughness: 0.58, clearcoat: 0.18, clearcoatRoughness: 0.55, envMapIntensity: 0.65 }),
  brass: phys('brass', C.brass, { roughness: 0.24, metalness: 1, envMapIntensity: 1.4 }),
  brassDark: phys('brassDark', 0x8F6F2C, { roughness: 0.32, metalness: 1, envMapIntensity: 1.15 }),
  velvetGreen: phys('velvetBordeaux', C.velvetGreen, { roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xD394A0), sheenRoughness: 0.5, envMapIntensity: 0.45 }),
  velvetTerra: phys('velvetTerra', C.velvetTerra, { roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xE8A87C), sheenRoughness: 0.5, envMapIntensity: 0.45 }),
  rope: phys('velvetRope', C.rope, { roughness: 1, sheen: 0.8, sheenColor: new THREE.Color(0xD98A7A), sheenRoughness: 0.5, envMapIntensity: 0.4 }),
  linen: std('linen', C.linen, 0.95, 0, { envMapIntensity: 0.3 }),
  cream: std('creamFabric', C.creamFabric, 0.98, 0, { envMapIntensity: 0.3 }),
  blush: std('blushFabric', C.blush, 0.98, 0, { envMapIntensity: 0.3 }),
  glass: phys('glass', C.glass, { roughness: 0.1, transparent: true, opacity: 0.3, envMapIntensity: 1.3 }),
  emeraldGlass: phys('cognacGlass', 0xA85E2A, { roughness: 0.15, transparent: true, opacity: 0.85, envMapIntensity: 1.2, emissive: 0x6E3A16, emissiveIntensity: 0.5 }),
  foliage: std('foliage', 0x4E7A45, 0.95),
  foliageLight: std('foliageLight', 0x6B9A5B, 0.95),
  ink: std('ink', C.ink, 0.6),
  gold: phys('gold', 0xC9A227, { roughness: 0.18, metalness: 1, envMapIntensity: 1.8 }),
  water: phys('water', 0x9CCDB9, { roughness: 0.08, transparent: true, opacity: 0.85, envMapIntensity: 1.2 }),
  leatherTan: phys('leatherTan', 0xB98A5A, { roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.5, envMapIntensity: 0.6 }),
  leatherBrown: phys('leatherBrown', 0x7A4E30, { roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.5, envMapIntensity: 0.6 })
};

function box(name, w, h, d, material, x = 0, y = 0, z = 0, cast = true, recv = true) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  g.name = name; g.position.set(x, y, z);
  g.castShadow = cast; g.receiveShadow = recv;
  return g;
}
function rbox(name, w, h, d, r, material, x = 0, y = 0, z = 0) {
  const g = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material);
  g.name = name; g.position.set(x, y, z);
  g.castShadow = true; g.receiveShadow = true;
  return g;
}
function cyl(name, rt, rb, h, material, x = 0, y = 0, z = 0, seg = 28) {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  g.name = name; g.position.set(x, y, z);
  g.castShadow = true; g.receiveShadow = true;
  return g;
}
function sph(name, r, material, x = 0, y = 0, z = 0, w = 26, hs = 20) {
  const g = new THREE.Mesh(new THREE.SphereGeometry(r, w, hs), material);
  g.name = name; g.position.set(x, y, z);
  g.castShadow = true; g.receiveShadow = true;
  return g;
}
function torus(name, r, tube, material, x = 0, y = 0, z = 0, arc = Math.PI * 2) {
  const g = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 14, 48, arc), material);
  g.name = name; g.position.set(x, y, z);
  g.castShadow = true; g.receiveShadow = true;
  return g;
}

function textSprite(text, { fontSize = 40, pad = 26, fg = '#6E5A3A', bg = 'rgba(252,248,238,0.93)', border = '#D9C9A8', scale = 1 } = {}) {
  const c = document.createElement('canvas');
  const meas = c.getContext('2d');
  meas.font = `600 ${fontSize}px "IBM Plex Mono", ui-monospace, monospace`;
  const tw = meas.measureText(text).width;
  c.width = Math.ceil(tw + pad * 2);
  c.height = fontSize + pad * 1.35;
  const ctx = c.getContext('2d');
  const r = c.height / 2, x2 = c.width, y2 = c.height;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(x2 - r, 0); ctx.arc(x2 - r, r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(r, y2); ctx.arc(r, r, r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = border; ctx.stroke();
  ctx.font = `600 ${fontSize}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x2 / 2, y2 / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.layers.set(1); // overlay UI: excluded from floor reflection
  sp.scale.set(0.38 * (c.width / c.height) * scale, 0.38 * scale, 1);
  return sp;
}

function archedWall(name, width, height, thickness, arches, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();
  arches.forEach(([cx, w, sillY, topY]) => {
    const r = w / 2;
    const p = new THREE.Path();
    p.moveTo(cx - r, sillY);
    p.lineTo(cx - r, topY);
    p.absarc(cx, topY, r, Math.PI, 0, true);
    p.lineTo(cx + r, sillY);
    p.closePath();
    shape.holes.push(p);
  });
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

const dfltStaff = [
  // Defensive/malformed-data fallback still obeys the public Office status
  // vocabulary. Character speech belongs only in the quoted italic rail.
  { name: 'Boss', task: 'IDLE' },
  { name: 'Mimi \u00b7 STAFF', task: 'IDLE' },
  { name: 'Toto \u00b7 STAFF', task: 'IDLE' },
];
const OFFICE_STATUSES = new Set(['IDLE', 'WORKING', 'QUEUED', 'DONE', 'LIVE']);
function normalizeOfficeStatus(value) {
  return OFFICE_STATUSES.has(value) ? value : 'IDLE';
}

class AgentCafe3D extends HTMLElement {
  static get observedAttributes() { return ['auto-rotate', 'show-labels']; }

  liveData() {
    const dflt = {
      pets: dfltStaff.map((p) => ({ ...p })),
      memory: { count: 0, cap: 40 }, skills: 0, soulLv: 1, goals: 0, next: '\u2014',
    };
    try {
      const raw = this.getAttribute('data-live');
      if (!raw) { return dflt; }
      const j = JSON.parse(raw);
      return {
        ...dflt, ...j,
        pets: (j.pets && j.pets.length ? j.pets : dflt.pets).slice(0, 3).map((pet, index) => ({
          ...dfltStaff[index],
          ...(pet && typeof pet === 'object' ? pet : {}),
          task: normalizeOfficeStatus(pet && pet.task),
        })),
        memory: { ...dflt.memory, ...(j.memory || {}) },
      };
    } catch { return dflt; }
  }

  connectedCallback() {
    if (this._init) { return; }
    this._init = true;
    const LIVE = this.liveData();
    while (LIVE.pets.length < 3) { LIVE.pets.push(dfltStaff[LIVE.pets.length]); }
    this.style.display = 'block';
    this.style.width = this.style.width || '100%';
    this.style.height = this.style.height || '100%';

    RectAreaLightUniformsLib.init();

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = 'block';
    this.appendChild(renderer.domElement);
    this._renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xEFE6CF);
    scene.fog = new THREE.Fog(0xEFE6CF, 40, 80);
    this._scene = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;
    scene.environmentIntensity = 0.6;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 150);
    camera.position.set(10.6, 6.4, 14.2);
    camera.layers.enable(1);
    this._camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-0.4, 1.7, -0.5);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 5.5;
    controls.maxDistance = 30;
    controls.minPolarAngle = 0.28;
    controls.maxPolarAngle = 1.32;
    controls.autoRotate = (this.getAttribute('auto-rotate') || 'on') !== 'off';
    controls.autoRotateSpeed = 0.35;
    renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; }, { once: true });
    this._controls = controls;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(800, 600), 0.22, 0.35, 2.6);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    this._composer = composer;

    // ===== lighting =====
    scene.add(new THREE.HemisphereLight(0xF4EEDC, 0x8A6238, 0.3));
    const sun = new THREE.DirectionalLight(0xFFE9CC, 2.15);
    sun.position.set(2.5, 12, -14);
    sun.target.position.set(-1.5, 0, 4);
    scene.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -16;
    sun.shadow.camera.near = 2; sun.shadow.camera.far = 55;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 7;
    sun.shadow.blurSamples = 16;
    scene.add(sun);

    const mkRAL = (x, y, z, w, h, ry, intensity) => {
      const l = new THREE.RectAreaLight(0xFFF1D6, intensity, w, h);
      l.position.set(x, y, z);
      l.rotation.y = ry;
      scene.add(l);
      return l;
    };
    mkRAL(-1.2, 2.9, -7.55, 2.7, 4.8, Math.PI, 2.4);
    mkRAL(3.2, 2.9, -7.55, 2.7, 4.8, Math.PI, 2.4);
    mkRAL(-11.15, 2.5, 0.6, 3.1, 4.2, -Math.PI / 2, 2.2);

    const pendantL = new THREE.PointLight(0xFFD9A0, 15, 8, 2);
    pendantL.position.set(7.1, 2.4, -5.6);
    scene.add(pendantL);
    const loungeL = new THREE.PointLight(0xFFD9A0, 11, 8, 2);
    loungeL.position.set(4.9, 2.2, 3.4);
    scene.add(loungeL);
    const orbL = new THREE.PointLight(0xFFDF9E, 8, 6, 2);
    orbL.position.set(0.2, 1.9, 0.6);
    scene.add(orbL);
    const chandL = new THREE.PointLight(0xFFE2B0, 14, 10, 2);
    chandL.position.set(0.2, 4.3, 0.6);
    scene.add(chandL);
    const coveA = new THREE.PointLight(0xFFE6C0, 6, 8, 2);
    coveA.position.set(-4, 6.3, -6.0);
    scene.add(coveA);
    const coveB = new THREE.PointLight(0xFFE6C0, 6, 8, 2);
    coveB.position.set(-9.8, 6.3, 2.5);
    scene.add(coveB);
    // under-mezzanine warmth (reception nook)
    const um1 = new THREE.PointLight(0xFFDFAE, 7, 6, 2);
    um1.position.set(-8.4, 3.0, -6.0);
    scene.add(um1);
    const um2 = new THREE.PointLight(0xFFDFAE, 6, 6, 2);
    um2.position.set(-4.6, 3.0, -6.2);
    scene.add(um2);
    this._lights = { pendantL, orbL };

    // ===== room shell =====
    const room = new THREE.Group(); room.name = 'room';
    scene.add(room);

    const floorTex = checkerMarbleTexture();
    const floorM = phys('checkerFloor', 0xFFFFFF, { map: floorTex, roughness: 0.26, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 1.0, transparent: true, opacity: 0.85 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(22, 0.2, 15.6), M.walnutDark);
    slab.name = 'floorSlab';
    slab.position.set(0, -0.115, 0.3);
    slab.receiveShadow = true;
    room.add(slab);
    const reflector = new Reflector(new THREE.PlaneGeometry(22, 15.6), { clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0xCFC5AE });
    reflector.name = 'floorReflector';
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, 0.002, 0.3);
    room.add(reflector);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 15.6), floorM);
    floor.name = 'floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.016, 0.3);
    floor.receiveShadow = true;
    room.add(floor);

    const plasterTex = plasterTexture();
    const plasterM = std('plaster', 0xFFFFFF, 0.96, 0, { map: plasterTex, envMapIntensity: 0.32 });

    // double-height walls with tall arches
    const WALL_H = 7.2;
    const bw = archedWall('backWall', 22, WALL_H, 0.28, [[-1.2, 2.8, 1.05, 4.6], [3.2, 2.8, 1.05, 4.6]], plasterM);
    bw.position.set(0, 0, -7.78);
    room.add(bw);
    const lw = archedWall('leftWall', 15.6, WALL_H, 0.28, [[0.3, 3.2, 1.05, 4.4]], plasterM);
    lw.rotation.y = Math.PI / 2;
    lw.position.set(-11.28, 0, 0.3);
    room.add(lw);

    // wainscoting
    const wainscot = (nm, w, x, z, ry = 0) => {
      const g = new THREE.Group(); g.name = nm;
      g.add(box(nm + '_panel', w, 1.05, 0.1, M.walnut, 0, 0.525, 0));
      const n = Math.max(1, Math.floor(w / 1.35));
      for (let i = 0; i < n; i++) {
        const px = -w / 2 + (i + 0.5) * (w / n);
        g.add(box(nm + '_groove' + i, w / n - 0.22, 0.66, 0.025, M.walnutDark, px, 0.5, 0.05, false));
      }
      g.add(box(nm + '_rail', w, 0.07, 0.16, M.walnut, 0, 1.1, 0.02));
      g.add(cyl(nm + '_brassline', 0.016, 0.016, w, M.brass, 0, 1.15, 0.07, 8).rotateZ(Math.PI / 2));
      g.position.set(x, 0, z); g.rotation.y = ry;
      return g;
    };
    room.add(wainscot('wainsBackL', 8.2, -6.9, -7.42));
    room.add(wainscot('wainsBackM', 1.5, 1.0, -7.42));
    room.add(wainscot('wainsBackR', 6.2, 7.9, -7.42));
    room.add(wainscot('wainsLeftF', 5.2, -10.92, 4.4, Math.PI / 2));
    room.add(wainscot('wainsLeftB', 5.2, -10.92, -4.4, Math.PI / 2));

    // wall panel mouldings
    const moulding = (nm, w, h, x, y, z, ry = 0) => {
      const g = new THREE.Group(); g.name = nm;
      const t = 0.055;
      g.add(box(nm + '_t', w, t, t, M.walnut, 0, h / 2, 0, false));
      g.add(box(nm + '_b', w, t, t, M.walnut, 0, -h / 2, 0, false));
      g.add(box(nm + '_l', t, h, t, M.walnut, -w / 2, 0, 0, false));
      g.add(box(nm + '_r', t, h, t, M.walnut, w / 2, 0, 0, false));
      g.position.set(x, y, z); g.rotation.y = ry;
      return g;
    };
    room.add(moulding('mouldBackA', 2.6, 1.9, -9.2, 5.3, -7.42));
    room.add(moulding('mouldBackB', 2.6, 1.9, -5.6, 5.3, -7.42));
    room.add(moulding('mouldArt', 2.0, 2.3, -10.94, 2.5, 5.2, Math.PI / 2));

    // crown + cove glow (high)
    const coveM = std('coveGlow', 0xFFE2AC, 0.4, 0, { emissive: 0xFFD98F, emissiveIntensity: 2.7 });
    room.add(box('crownBack', 22, 0.16, 0.22, M.walnutDark, 0, 6.94, -7.5));
    room.add(box('crownLeft', 0.22, 0.16, 15.6, M.walnutDark, -11.0, 6.94, 0.3));
    room.add(box('coveStripBack', 21.6, 0.05, 0.06, coveM, 0, 6.84, -7.38, false, false));
    room.add(box('coveStripLeft', 0.06, 0.05, 15.2, coveM, -10.88, 6.84, 0.3, false, false));

    // ===== ceiling ring with central oculus (skylight) =====
    const ceilShape = new THREE.Shape();
    ceilShape.moveTo(-11, -8.1);
    ceilShape.lineTo(11, -8.1);
    ceilShape.lineTo(11, 7.5);
    ceilShape.lineTo(-11, 7.5);
    ceilShape.closePath();
    const oculusHole = new THREE.Path();
    oculusHole.absarc(0.2, -0.6, 4.6, 0, Math.PI * 2, true);
    ceilShape.holes.push(oculusHole);
    const ceil = new THREE.Mesh(new THREE.ExtrudeGeometry(ceilShape, { depth: 0.25, bevelEnabled: false }), plasterM);
    ceil.name = 'ceilingRing';
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.y = 7.2;
    ceil.castShadow = false; ceil.receiveShadow = false;
    room.add(ceil);
    const oculusTrim = torus('oculusTrim', 4.6, 0.06, M.brass, 0.2, 7.19, 0.6);
    oculusTrim.rotation.x = Math.PI / 2;
    oculusTrim.castShadow = false;
    room.add(oculusTrim);
    const oculusGlow = torus('oculusGlow', 4.44, 0.022, coveM, 0.2, 7.16, 0.6);
    oculusGlow.rotation.x = Math.PI / 2;
    oculusGlow.castShadow = false;
    room.add(oculusGlow);
    // gilded dome above the oculus + ceiling gold rings
    const domeM = phys('goldDome', 0xC9A227, { roughness: 0.32, metalness: 1, envMapIntensity: 1.3, emissive: 0x8A6420, emissiveIntensity: 0.35, side: THREE.BackSide });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4.55, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), domeM);
    dome.name = 'goldDome';
    dome.position.set(0.2, 7.1, 0.6);
    dome.castShadow = false; dome.receiveShadow = false;
    room.add(dome);
    const domeRib = torus('domeRib', 4.56, 0.05, M.brass, 0.2, 7.35, 0.6);
    domeRib.rotation.x = Math.PI / 2;
    domeRib.castShadow = false;
    room.add(domeRib);
    const domeL = new THREE.PointLight(0xFFDF9E, 7, 9, 2);
    domeL.position.set(0.2, 8.2, 0.6);
    room.add(domeL);
    [[5.15, 0.05], [5.75, 0.032]].forEach(([cr, ct], ci) => {
      const ring = torus('ceilRing' + ci, cr, ct, M.brass, 0.2, 7.17, 0.6);
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = false;
      room.add(ring);
    });
    const skyGlass = new THREE.Mesh(new THREE.CircleGeometry(4.5, 40), M.glass);
    skyGlass.name = 'skylightGlass';
    skyGlass.rotation.x = Math.PI / 2;
    skyGlass.position.set(0.2, 7.36, 0.6);
    room.add(skyGlass);
    const skyRAL = new THREE.RectAreaLight(0xFFF6E4, 1.9, 7, 7);
    skyRAL.position.set(0.2, 7.05, 0.6);
    skyRAL.rotation.x = -Math.PI / 2;
    scene.add(skyRAL);

    // window frames + glass + garden
    const archFrame = (name, w, sillY, topY) => {
      const r = w / 2;
      const grp = new THREE.Group(); grp.name = name;
      grp.add(torus(name + '_arc', r, 0.07, M.brass, 0, topY, 0, Math.PI));
      grp.add(cyl(name + '_l', 0.07, 0.07, topY - sillY, M.brass, -r, (sillY + topY) / 2, 0, 12));
      grp.add(cyl(name + '_r', 0.07, 0.07, topY - sillY, M.brass, r, (sillY + topY) / 2, 0, 12));
      const marbleT = marbleTexture();
      grp.add(box(name + '_sill', w + 0.36, 0.1, 0.3, phys('marbleSill', 0xFFFFFF, { map: marbleT, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.9 }), 0, sillY - 0.05, 0.02));
      grp.add(cyl(name + '_mul', 0.03, 0.03, topY - sillY + r * 0.92, M.brassDark, 0, (sillY + topY + r * 0.9) / 2, 0, 10));
      grp.add(cyl(name + '_mulH', 0.03, 0.03, w, M.brassDark, 0, sillY + (topY - sillY) * 0.55, 0, 10).rotateZ(Math.PI / 2));
      return grp;
    };
    const fB1 = archFrame('frameB1', 2.8, 1.05, 4.6); fB1.position.set(-1.2, 0, -7.45); room.add(fB1);
    const fB2 = archFrame('frameB2', 2.8, 1.05, 4.6); fB2.position.set(3.2, 0, -7.45); room.add(fB2);
    const fL = archFrame('frameL', 3.2, 1.05, 4.4); fL.rotation.y = Math.PI / 2; fL.position.set(-10.95, 0, 0.6); room.add(fL);
    [[-1.2, 0], [3.2, 1]].forEach(([gx, i]) => {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 5.4), M.glass);
      gl.name = 'glassB' + i; gl.position.set(gx, 3.3, -7.6);
      room.add(gl);
    });
    const glL = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.2), M.glass);
    glL.name = 'glassL'; glL.rotation.y = Math.PI / 2; glL.position.set(-11.1, 3.2, 0.6);
    room.add(glL);
    const gardenT = gardenTexture();
    const gardenM = std('garden', 0xFFFFFF, 1, 0, { map: gardenT, emissive: 0xFFFFFF, emissiveMap: gardenT, emissiveIntensity: 0.4 });
    const gardenB = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), gardenM);
    gardenB.name = 'gardenBack'; gardenB.position.set(0, 4.5, -10.5);
    room.add(gardenB);
    const gardenL = gardenB.clone(); gardenL.name = 'gardenLeft';
    gardenL.rotation.y = Math.PI / 2; gardenL.position.set(-14, 4.5, 0);
    room.add(gardenL);
    [[-2.2, 0.7, -8.7, 0.9], [-0.2, 0.5, -8.9, 0.7], [2.6, 0.6, -8.7, 0.85], [4.4, 0.4, -9.0, 0.65], [-12.4, 0.6, 2.2, 0.8], [-12.6, 0.5, -0.8, 0.7]].forEach((b, i) => {
      room.add(sph('bushOut' + i, b[3], i % 2 ? M.foliageLight : M.foliage, b[0], b[1], b[2], 18, 14));
    });

    // tall wavy curtains
    const curtGeo = new THREE.PlaneGeometry(0.62, 5.3, 16, 1);
    {
      const cpos = curtGeo.attributes.position;
      for (let i = 0; i < cpos.count; i++) {
        cpos.setZ(i, Math.sin((cpos.getX(i) / 0.62 + 0.5) * Math.PI * 4) * 0.055);
      }
      curtGeo.computeVertexNormals();
    }
    const curtM = std('linenCurtain', C.linen, 0.92, 0, { side: THREE.DoubleSide, envMapIntensity: 0.3 });
    const curt = (nm, x, z) => {
      const m = new THREE.Mesh(curtGeo, curtM);
      m.name = nm; m.position.set(x, 3.32, z);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    };
    room.add(curt('curtB1a', -2.85, -7.3)); room.add(curt('curtB1b', 0.45, -7.3));
    room.add(curt('curtB2a', 1.55, -7.3)); room.add(curt('curtB2b', 4.85, -7.3));
    room.add(cyl('rodB1', 0.028, 0.028, 4.2, M.brass, -1.2, 6.12, -7.28, 10).rotateZ(Math.PI / 2));
    room.add(cyl('rodB2', 0.028, 0.028, 4.2, M.brass, 3.2, 6.12, -7.28, 10).rotateZ(Math.PI / 2));
    // bordeaux velvet overdrapes with brass tiebacks
    const drapeGeo = new THREE.PlaneGeometry(0.85, 4.65, 18, 1);
    {
      const dpos = drapeGeo.attributes.position;
      for (let i = 0; i < dpos.count; i++) {
        dpos.setZ(i, Math.sin((dpos.getX(i) / 0.85 + 0.5) * Math.PI * 5) * 0.085);
      }
      drapeGeo.computeVertexNormals();
    }
    const drapeM = phys('velvetDrape', 0x5E2630, { roughness: 1, sheen: 0.9, sheenColor: new THREE.Color(0xC98A93), sheenRoughness: 0.55, envMapIntensity: 0.35, side: THREE.DoubleSide });
    [[-3.12, 'a'], [0.72, 'b'], [1.28, 'c'], [5.12, 'd']].forEach(([dx, sfx]) => {
      const dp = new THREE.Mesh(drapeGeo, drapeM);
      dp.name = 'drape_' + sfx;
      dp.position.set(dx, 3.72, -7.2);
      dp.scale.x = 0.92;
      dp.castShadow = true; dp.receiveShadow = true;
      room.add(dp);
      const tie = torus('drapeTie_' + sfx, 0.19, 0.028, M.brass, dx, 2.06, -7.18);
      tie.rotation.x = 0.18;
      tie.scale.z = 0.55;
      room.add(tie);
    });

    // wood slat feature wall behind the bar
    for (let i = 0; i < 21; i++) {
      room.add(box('slat' + i, 0.12, 5.7, 0.06, M.walnut, 4.72 + i * 0.215, 3.95, -7.36, false, true));
    }

    // emerald carpet runner: entrance → fountain
    const runnerT = runnerTexture();
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 5.6), std('runner', 0xFFFFFF, 1, 0, { map: runnerT, envMapIntensity: 0.22 }));
    runner.name = 'runner';
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(0.2, 0.03, 5.1);
    runner.receiveShadow = true;
    room.add(runner);

    // brass stanchions + red velvet rope
    const stanchion = (nm, x, z) => {
      const g = new THREE.Group(); g.name = nm;
      g.add(cyl(nm + '_base', 0.16, 0.18, 0.04, M.brassDark, 0, 0.02, 0, 20));
      g.add(cyl(nm + '_pole', 0.032, 0.032, 1.0, M.brass, 0, 0.52, 0, 12));
      g.add(sph(nm + '_ball', 0.06, M.gold, 0, 1.06, 0, 16, 12));
      g.position.set(x, 0.016, z);
      return g;
    };
    room.add(stanchion('stanchA', -1.35, 6.9));
    room.add(stanchion('stanchB', 1.75, 6.9));
    const ropeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.35, 1.0, 6.9),
      new THREE.Vector3(0.2, 0.72, 6.92),
      new THREE.Vector3(1.75, 1.0, 6.9)
    ]);
    const rope = new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 20, 0.03, 8, false), M.rope);
    rope.name = 'velvetRope';
    rope.castShadow = true;
    room.add(rope);

    // gold mashrabiya screens (arabesque lattice)
    const mashT = mashrabiyaTexture();
    const mashM = std('mashrabiya', 0xE8C36A, 0.35, 0.85, { map: mashT, transparent: true, alphaTest: 0.14, side: THREE.DoubleSide, emissive: 0xC9A227, emissiveMap: mashT, emissiveIntensity: 0.42, envMapIntensity: 1.2 });
    const mashCrown = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 2.4), mashM);
    mashCrown.name = 'mashCrownBar';
    mashCrown.position.set(7.0, 4.75, -7.3);
    mashCrown.castShadow = false;
    room.add(mashCrown);
    const mashTall = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.4), mashM);
    mashTall.name = 'mashPanelLeft';
    mashTall.position.set(-4.35, 3.15, -7.3);
    mashTall.castShadow = false;
    room.add(mashTall);
    room.add(cyl('mashTallTop', 0.03, 0.03, 1.56, M.brass, -4.35, 5.38, -7.28, 8).rotateZ(Math.PI / 2));
    room.add(cyl('mashTallBot', 0.03, 0.03, 1.56, M.brass, -4.35, 0.94, -7.28, 8).rotateZ(Math.PI / 2));

    // light shafts + pools + motes
    const shaftT = shaftTexture();
    const shaftM = new THREE.MeshBasicMaterial({ map: shaftT, transparent: true, opacity: 0.085, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    shaftM.name = 'lightShaft';
    const mkShaft = (x, z, ry, w, len, tilt) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, len), shaftM);
      s.name = 'shaft';
      s.rotation.order = 'YXZ';
      s.rotation.y = ry;
      s.rotation.x = tilt;
      s.position.set(x, 2.1, z);
      s.renderOrder = 5;
      s.layers.set(1);
      return s;
    };
    room.add(mkShaft(-1.7, -5.0, 0, 2.3, 6.6, -0.98));
    room.add(mkShaft(2.7, -5.0, 0, 2.3, 6.6, -0.98));
    room.add(mkShaft(-9.2, 0.8, Math.PI / 2, 2.6, 5.4, -1.08));
    // god-column of light through the oculus onto the fountain
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.7, 6.6, 28, 1, true), new THREE.MeshBasicMaterial({ map: shaftT, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.material.name = 'oculusBeam';
    beam.name = 'oculusBeam';
    beam.position.set(0.2, 3.9, 0.6);
    beam.renderOrder = 4;
    beam.layers.set(1);
    room.add(beam);
    const poolT = poolTexture();
    const poolM = new THREE.MeshBasicMaterial({ map: poolT, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false });
    poolM.name = 'sunPool';
    const mkPool = (x, z, sx, sz, rz) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), poolM);
      p.name = 'sunPool';
      p.rotation.set(-Math.PI / 2, 0, rz);
      p.scale.set(sx, sz, 1);
      p.position.set(x, 0.032, z);
      p.renderOrder = 3;
      p.layers.set(1);
      return p;
    };
    room.add(mkPool(-2.2, -1.6, 3.6, 2.1, 0.18));
    room.add(mkPool(2.3, -1.6, 3.4, 2.0, 0.14));
    room.add(mkPool(-8.3, 1.7, 3.0, 1.8, Math.PI / 2 - 0.2));
    const moteGeo = new THREE.BufferGeometry();
    const moteN = 84;
    const mp = new Float32Array(moteN * 3);
    for (let i = 0; i < moteN; i++) {
      const kind = i % 3;
      if (kind === 2) {
        mp[i * 3] = -9.8 + Math.random() * 2.4;
        mp[i * 3 + 1] = 0.2 + Math.random() * 3.2;
        mp[i * 3 + 2] = -0.4 + Math.random() * 2.8;
      } else {
        mp[i * 3] = (kind === 0 ? -2.8 : 1.8) + Math.random() * 2.2;
        mp[i * 3 + 1] = 0.2 + Math.random() * 3.6;
        mp[i * 3 + 2] = -6.4 + Math.random() * 4.2;
      }
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    const moteM = new THREE.PointsMaterial({ color: 0xFFE9C0, size: 0.042, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    moteM.name = 'dustMotes';
    const motes = new THREE.Points(moteGeo, moteM);
    motes.name = 'motes';
    motes.layers.set(1);
    room.add(motes);
    this._motes = motes;

    // contact shadows
    const shadowT = contactShadowTexture();
    const mkContact = (nm, sx, sz, op, x, z, parent = scene, y = 0.024) => {
      const m = new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, opacity: op, depthWrite: false });
      m.name = 'contactShadow';
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
      p.name = nm;
      p.rotation.x = -Math.PI / 2;
      p.scale.set(sx, sz, 1);
      p.position.set(x, y, z);
      p.renderOrder = 2;
      parent.add(p);
      return p;
    };
    mkContact('shSofa', 3.4, 1.9, 0.5, 4.8, 3.8);
    mkContact('shChair', 2.2, 1.7, 0.45, 7.0, 0.9);
    mkContact('shTable', 1.7, 1.7, 0.4, 4.7, 1.9);
    mkContact('shBar', 6.2, 2.0, 0.5, 7.0, -5.7);
    mkContact('shDesk', 4.4, 1.8, 0.5, -7.0, -5.8);
    mkContact('shClock', 1.7, 1.3, 0.45, -3.6, -6.7);
    mkContact('shStairs', 2.4, 6.4, 0.4, -10.0, -1.0);
    mkContact('shCart', 1.7, 1.3, 0.45, 4.3, 5.8);
    mkContact('shTowerA', 1.4, 1.4, 0.4, -5.6, 3.1);
    mkContact('shPlantA', 1.6, 1.6, 0.45, -10.1, -6.3);
    mkContact('shPlantB', 1.5, 1.5, 0.45, 10.2, -6.6);
    mkContact('shPlantC', 1.3, 1.3, 0.4, 9.8, 4.9);
    mkContact('shPlantD', 1.2, 1.2, 0.4, -6.4, 6.6);
    mkContact('shBasket', 1.2, 1.2, 0.4, 2.9, 5.5);
    mkContact('shFountain', 3.0, 3.0, 0.35, 0.2, 0.6, scene, 0.08);
    mkContact('shStoolA', 0.9, 0.9, 0.35, 5.6, -4.9);
    mkContact('shStoolB', 0.9, 0.9, 0.35, 7.0, -4.9);
    mkContact('shStanchA', 0.7, 0.7, 0.35, -1.35, 6.9);
    mkContact('shStanchB', 0.7, 0.7, 0.35, 1.75, 6.9);

    // ===== zones =====
    const zones = new THREE.Group(); zones.name = 'zones';
    scene.add(zones);
    const marbleT2 = marbleTexture();
    const marbleTopM = phys('marbleTop', 0xFFFFFF, { map: marbleT2, roughness: 0.26, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 1.0 });
    const shelfBoardM = std('shelfBoard', C.walnutLight, 0.7);
    const globeGlassM = phys('globeGlass', 0xFFF2D0, { roughness: 0.12, transparent: true, opacity: 0.5, envMapIntensity: 1.3 });
    const globeCoreM = std('globeCore', 0xFFE9B8, 0.3, 0, { emissive: 0xFFDF9E, emissiveIntensity: 2.8 });

    // ===== MEZZANINE + GRAND STAIRCASE =====
    const mezz = new THREE.Group(); mezz.name = 'mezzanine';
    mezz.add(box('mezzSlab', 8.2, 0.22, 2.2, M.walnut, -6.9, 3.49, -6.4));
    const mezzTop = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 2.2), marbleTopM);
    mezzTop.name = 'mezzTop';
    mezzTop.rotation.x = -Math.PI / 2;
    mezzTop.position.set(-6.9, 3.615, -6.4);
    mezzTop.receiveShadow = true;
    mezz.add(mezzTop);
    mezz.add(box('mezzFascia', 8.2, 0.3, 0.12, M.walnutDark, -6.9, 3.51, -5.28));
    mezz.add(box('mezzCove', 7.9, 0.04, 0.05, coveM, -6.9, 3.4, -5.3, false, false));
    // balustrade
    mezz.add(cyl('mezzRailTop', 0.04, 0.04, 8.2, M.brass, -6.9, 4.62, -5.34, 12).rotateZ(Math.PI / 2));
    mezz.add(cyl('mezzRailLow', 0.024, 0.024, 8.2, M.brass, -6.9, 3.9, -5.34, 10).rotateZ(Math.PI / 2));
    for (let i = 0; i < 13; i++) {
      mezz.add(cyl('mezzPost' + i, 0.02, 0.02, 0.92, M.brass, -10.7 + i * 0.634, 4.15, -5.34, 8));
    }
    // guest suite doors (arched)
    const doorShape = (() => {
      const s = new THREE.Shape();
      s.moveTo(-0.56, 0); s.lineTo(0.56, 0); s.lineTo(0.56, 1.5); s.lineTo(-0.56, 1.5); s.closePath();
      const hole = new THREE.Path();
      hole.moveTo(-0.4, 0.05); hole.lineTo(0.4, 0.05); hole.lineTo(0.4, 0.85);
      hole.absarc(0, 0.85, 0.4, 0, Math.PI, false);
      hole.closePath();
      s.holes.push(hole);
      return s;
    })();
    [[-8.9, 0], [-5.3, 1]].forEach(([dx, i]) => {
      const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(doorShape, { depth: 0.14, bevelEnabled: false }), M.walnut);
      frame.name = 'suiteFrame' + i;
      frame.position.set(dx - 0.56 + 0.56, 3.6, -7.48);
      frame.position.x = dx;
      frame.position.set(dx, 3.6, -7.48);
      frame.castShadow = true; frame.receiveShadow = true;
      // door slab
      const slabD = box('suiteDoor' + i, 0.8, 1.25, 0.06, M.walnutDark, dx, 4.24, -7.4);
      const plate = box('suitePlate' + i, 0.16, 0.1, 0.02, M.gold, dx, 4.7, -7.36, false);
      const knob = sph('suiteKnob' + i, 0.035, M.brass, dx + 0.3, 4.2, -7.35, 12, 10);
      mezz.add(frame, slabD, plate, knob);
      mezz.add(cyl('suiteCushion' + i, 0.34, 0.34, 0.09, i ? M.blush : M.cream, dx + 1.15, 3.66, -6.6, 22));
    });
    const mezzPlant = new THREE.Group();
    mezzPlant.name = 'mezzPlantWrap';
    mezz.add(mezzPlant);
    zones.add(mezz);

    // grand staircase (left wall, up to mezzanine)
    const stairs = new THREE.Group(); stairs.name = 'grandStairs';
    const stepW = 1.7, stepD = 0.44, rise = 0.257, NSTEP = 14;
    const runnerStepM = std('stairRunner', 0x5E2630, 1, 0, { envMapIntensity: 0.25 });
    for (let i = 0; i < NSTEP; i++) {
      const sy = rise * (i + 0.5), sz = 1.9 - stepD * i;
      stairs.add(box('step' + i, stepW, rise, stepD, M.walnut, -10.05, sy, sz));
      stairs.add(box('stepRun' + i, 0.95, 0.02, stepD - 0.06, runnerStepM, -10.05, rise * (i + 1) + 0.011, sz, false, true));
      if (i % 4 === 0) {
        stairs.add(cyl('stairPost' + i, 0.026, 0.026, 0.82, M.brass, -9.28, rise * (i + 1) + 0.41, sz, 10));
      }
    }
    stairs.add(box('landing', stepW, 0.24, 1.3, M.walnut, -10.05, 3.6 - 0.12, -4.66));
    stairs.add(box('landingRun', 0.95, 0.02, 1.24, runnerStepM, -10.05, 3.61, -4.66, false, true));
    const slopeAng = Math.atan2(rise, stepD);
    const railLen = Math.hypot(rise * NSTEP, stepD * NSTEP) + 0.4;
    const rail = cyl('stairRail', 0.035, 0.035, railLen, M.brass, -9.28, (rise * NSTEP) / 2 + 0.84, 1.9 - (stepD * (NSTEP - 1)) / 2, 12);
    rail.rotation.x = -(Math.PI / 2 - slopeAng);
    stairs.add(rail);
    stairs.add(cyl('newel', 0.09, 0.11, 1.05, M.walnutDark, -9.28, 0.525, 2.32, 16));
    stairs.add(sph('newelBall', 0.115, M.gold, -9.28, 1.17, 2.32, 18, 14));
    zones.add(stairs);

    // ===== RECEPTION (Archive) under mezzanine =====
    const desk = new THREE.Group(); desk.name = 'reception';
    desk.add(rbox('deskBase', 3.4, 1.0, 0.75, 0.05, M.walnut, -7.0, 0.5, -5.9));
    for (let i = 0; i < 3; i++) {
      desk.add(box('deskGroove' + i, 0.92, 0.62, 0.03, M.walnutDark, -8.0 + i * 1.0, 0.47, -5.51, false));
    }
    desk.add(rbox('deskTop', 3.7, 0.08, 0.95, 0.03, marbleTopM, -7.0, 1.06, -5.9));
    desk.add(cyl('deskTrim', 0.018, 0.018, 3.7, M.brass, -7.0, 1.11, -5.44, 8).rotateZ(Math.PI / 2));
    // counter bell
    const bell = new THREE.Group(); bell.name = 'counterBell';
    bell.add(cyl('bellBase', 0.075, 0.085, 0.025, M.brassDark, 0, 0.012, 0, 20));
    const bellDome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.gold);
    bellDome.name = 'bellDome'; bellDome.position.y = 0.02; bellDome.castShadow = true;
    bell.add(bellDome);
    bell.add(cyl('bellButton', 0.014, 0.014, 0.03, M.brassDark, 0, 0.095, 0, 10));
    bell.position.set(-6.1, 1.1, -5.75);
    desk.add(bell);
    // open guest ledger
    const pageL = box('ledgerL', 0.3, 0.018, 0.4, M.cream, -7.45, 1.115, -5.85);
    pageL.rotation.z = 0.05;
    const pageR = box('ledgerR', 0.3, 0.018, 0.4, M.cream, -7.16, 1.115, -5.85);
    pageR.rotation.z = -0.05;
    desk.add(pageL, pageR);
    // banker's lamp (emerald glass)
    desk.add(cyl('blampStem', 0.016, 0.02, 0.3, M.brass, -8.1, 1.25, -5.9, 10));
    const blampShade = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.emeraldGlass);
    blampShade.name = 'blampShade';
    blampShade.rotation.z = 0.12;
    blampShade.position.set(-8.1, 1.42, -5.9);
    blampShade.castShadow = true;
    desk.add(blampShade);
    desk.add(sph('blampCore', 0.05, globeCoreM, -8.1, 1.4, -5.9, 12, 10));
    // key rack + records shelf on back wall
    desk.add(rbox('keyPanel', 1.7, 1.05, 0.06, 0.02, M.walnut, -8.9, 2.0, -7.4));
    for (let r = 0; r < 3; r++) {
      for (let col = 0; col < 4; col++) {
        const kx = -9.5 + col * 0.4, ky = 2.32 - r * 0.34;
        desk.add(sph('hook' + r + '_' + col, 0.016, M.brass, kx, ky, -7.36, 8, 6));
        if ((r * 4 + col) % 3 !== 2) {
          desk.add(torus('keyRing' + r + '_' + col, 0.028, 0.007, M.gold, kx, ky - 0.05, -7.35));
          desk.add(box('keyStem' + r + '_' + col, 0.012, 0.06, 0.008, M.gold, kx, ky - 0.105, -7.35, false));
        }
      }
    }
    desk.add(box('recordShelf', 3.0, 0.05, 0.3, shelfBoardM, -6.6, 2.9, -7.34));
    const spineCols = [0x5E7A8A, 0x7A8A5E, 0xA8802B, 0x8A5A4A, 0xD9C9A8, 0x4E5E7A];
    for (let b = 0; b < 8; b++) {
      const h = 0.34 + ((b * 37) % 18) / 100;
      desk.add(box('record' + b, 0.15, h, 0.24, std('record', spineCols[b % 6], 0.85), -7.85 + b * 0.36, 2.925 + h / 2, -7.33));
    }
    zones.add(desk);

    // pigeonhole mail slots (guest post)
    const pg = new THREE.Group(); pg.name = 'pigeonholes';
    pg.add(rbox('pgFrame', 1.6, 0.95, 0.2, 0.02, M.walnut, 0, 0, 0));
    pg.add(box('pgBack', 1.5, 0.85, 0.03, M.walnutDark, 0, 0, -0.07));
    for (let i = 0; i < 2; i++) {
      pg.add(box('pgRow' + i, 1.5, 0.03, 0.16, M.walnutDark, 0, -0.14 + i * 0.29, 0.01));
    }
    for (let i = 0; i < 3; i++) {
      pg.add(box('pgCol' + i, 0.03, 0.85, 0.16, M.walnutDark, -0.37 + i * 0.375, 0, 0.01));
    }
    [[-0.55, 0.16, 0.06], [0.2, -0.13, -0.05], [0.56, 0.16, 0.04], [-0.18, 0.45, 0.05]].forEach((L, i) => {
      const letter = box('pgLetter' + i, 0.22, 0.15, 0.015, M.cream, L[0], L[1], 0.06, false);
      letter.rotation.z = L[2] * 3;
      pg.add(letter);
    });
    pg.position.set(-6.3, 2.0, -7.38);
    desk.add(pg);

    // hanging RECEPTION plaque
    const plaqueCanvas = document.createElement('canvas');
    plaqueCanvas.width = 512; plaqueCanvas.height = 128;
    const pcx = plaqueCanvas.getContext('2d');
    pcx.fillStyle = '#54381F'; pcx.fillRect(0, 0, 512, 128);
    pcx.strokeStyle = '#C9A227'; pcx.lineWidth = 6; pcx.strokeRect(12, 12, 488, 104);
    pcx.fillStyle = '#E7C878';
    pcx.font = '600 56px Marcellus, Georgia, serif';
    pcx.textAlign = 'center'; pcx.textBaseline = 'middle';
    pcx.fillText('R E C E P T I O N', 256, 68);
    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
    plaqueTex.colorSpace = THREE.SRGBColorSpace;
    plaqueTex.anisotropy = 8;
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 0.06), [M.walnutDark, M.walnutDark, M.walnutDark, M.walnutDark, std('plaqueFace', 0xFFFFFF, 0.7, 0, { map: plaqueTex }), M.walnutDark]);
    plaque.name = 'receptionPlaque';
    plaque.position.set(-7.0, 2.95, -5.32);
    plaque.castShadow = true;
    desk.add(plaque);
    desk.add(cyl('plaqueChainL', 0.008, 0.008, 0.24, M.brassDark, -7.6, 3.28, -5.32, 6));
    desk.add(cyl('plaqueChainR', 0.008, 0.008, 0.24, M.brassDark, -6.4, 3.28, -5.32, 6));

    // reception pendants under the mezzanine
    [[-7.9], [-6.1]].forEach(([px], i) => {
      desk.add(cyl('deskPendCord' + i, 0.01, 0.01, 0.42, M.ink, px, 3.16, -5.85, 6));
      desk.add(cyl('deskPendCap' + i, 0.05, 0.065, 0.07, M.brass, px, 2.93, -5.85, 12));
      desk.add(sph('deskPendGlobe' + i, 0.13, globeGlassM, px, 2.78, -5.85, 18, 14));
      desk.add(sph('deskPendCore' + i, 0.07, globeCoreM, px, 2.78, -5.85, 12, 10));
    });

    // ===== WORKSHOP — marble skill bar (back-right, double height wall) =====
    const ws = new THREE.Group(); ws.name = 'workshop';
    ws.add(rbox('barBase', 4.6, 0.95, 0.8, 0.05, M.walnut, 7.0, 0.475, -5.9));
    for (let i = 0; i < 4; i++) {
      ws.add(box('barGroove' + i, 0.86, 0.62, 0.03, M.walnutDark, 5.45 + i * 1.05, 0.44, -5.48, false));
    }
    ws.add(rbox('barTop', 5.0, 0.09, 1.0, 0.03, marbleTopM, 7.0, 1.0, -5.9));
    ws.add(box('barGlow', 4.5, 0.04, 0.05, coveM, 7.0, 0.93, -5.44, false, false));
    ws.add(cyl('footRail', 0.03, 0.03, 4.6, M.brass, 7.0, 0.22, -5.42, 10).rotateZ(Math.PI / 2));
    ws.add(box('barShelfA', 4.2, 0.05, 0.34, shelfBoardM, 7.0, 2.1, -7.3));
    ws.add(box('barShelfB', 4.2, 0.05, 0.34, shelfBoardM, 7.0, 2.75, -7.3));
    ws.add(box('barShelfGlowA', 4.0, 0.03, 0.04, coveM, 7.0, 2.06, -7.16, false, false));
    ws.add(box('barShelfGlowB', 4.0, 0.03, 0.04, coveM, 7.0, 2.71, -7.16, false, false));
    const jarCols = [0xA8802B, 0x7A8A5E, 0x8A5A4A, 0x5E7A8A, 0xC98A8A, 0xD9B45C];
    for (let j = 0; j < 6; j++) {
      const jx = 5.15 + j * 0.75;
      ws.add(cyl('jarGlass' + j, 0.14, 0.14, 0.34, M.glass, jx, 2.3, -7.28, 14));
      ws.add(cyl('jarFill' + j, 0.11, 0.11, 0.2, std('jarFill', jarCols[j], 0.6), jx, 2.24, -7.28, 12));
      ws.add(cyl('jarLid' + j, 0.15, 0.15, 0.04, M.brass, jx, 2.49, -7.28, 14));
    }
    for (let j = 0; j < 4; j++) {
      ws.add(cyl('jarB' + j, 0.16, 0.16, 0.4, M.glass, 5.5 + j * 1.0, 2.98, -7.28, 14));
      ws.add(cyl('jarBFill' + j, 0.13, 0.13, 0.22, std('jarFillB', jarCols[(j + 3) % 6], 0.6), 5.5 + j * 1.0, 2.9, -7.28, 12));
    }
    ws.add(rbox('machineBody', 0.8, 0.5, 0.5, 0.04, M.brassDark, 8.4, 1.3, -6.0));
    ws.add(box('machineTop', 0.86, 0.08, 0.54, M.walnutDark, 8.4, 1.58, -6.0));
    ws.add(cyl('machineDial', 0.06, 0.06, 0.05, M.gold, 8.15, 1.36, -5.73, 14).rotateX(Math.PI / 2));
    ws.add(cyl('machineSpout', 0.03, 0.03, 0.18, M.brass, 8.4, 1.12, -5.78, 8));
    [[5.6], [7.0]].forEach(([sx], i) => {
      ws.add(cyl('stoolSeat' + i, 0.26, 0.26, 0.09, M.velvetTerra, sx, 0.66, -4.9, 20));
      ws.add(cyl('stoolLeg' + i, 0.026, 0.026, 0.62, M.brass, sx, 0.31, -4.9, 10));
      ws.add(cyl('stoolBase' + i, 0.16, 0.16, 0.03, M.brassDark, sx, 0.02, -4.9, 16));
    });
    zones.add(ws);

    // pendant globes over bar (long drops from high ceiling)
    const pend = new THREE.Group(); pend.name = 'pendants';
    [[5.7], [7.1], [8.5]].forEach(([px], i) => {
      pend.add(cyl('pendCord' + i, 0.012, 0.012, 3.98, M.ink, px, 4.99, -5.7, 6));
      pend.add(cyl('pendCap' + i, 0.07, 0.09, 0.09, M.brass, px, 2.95, -5.7, 14));
      pend.add(sph('pendGlobe' + i, 0.19, globeGlassM, px, 2.72, -5.7, 22, 16));
      pend.add(sph('pendCore' + i, 0.1, globeCoreM, px, 2.72, -5.7, 14, 12));
    });
    scene.add(pend);

    // ===== two-tier grand chandelier =====
    const chand = new THREE.Group(); chand.name = 'chandelier';
    chand.add(cyl('chandChain', 0.016, 0.016, 2.1, M.brassDark, 0, 1.05, 0, 8));
    chand.add(torus('chandRingA', 1.2, 0.038, M.brass, 0, 0, 0).rotateX(Math.PI / 2));
    chand.add(torus('chandRingB', 0.72, 0.032, M.brass, 0, -0.55, 0).rotateX(Math.PI / 2));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      chand.add(sph('chandGlobeA' + i, 0.085, globeGlassM, Math.cos(a) * 1.2, -0.12, Math.sin(a) * 1.2, 16, 12));
      chand.add(sph('chandCoreA' + i, 0.05, globeCoreM, Math.cos(a) * 1.2, -0.12, Math.sin(a) * 1.2, 10, 8));
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      chand.add(sph('chandGlobeB' + i, 0.075, globeGlassM, Math.cos(a) * 0.72, -0.67, Math.sin(a) * 0.72, 16, 12));
      chand.add(sph('chandCoreB' + i, 0.045, globeCoreM, Math.cos(a) * 0.72, -0.67, Math.sin(a) * 0.72, 10, 8));
    }
    [[0], [2.1], [4.2]].forEach(([a], i) => {
      chand.add(cyl('chandRod' + i, 0.012, 0.012, 0.56, M.brassDark, Math.cos(a) * 0.94, -0.28, Math.sin(a) * 0.94, 6).rotateX(0.35));
    });
    // crystal drops + finial
    const crystalM = phys('crystal', 0xFFFAF0, { roughness: 0.04, transparent: true, opacity: 0.72, envMapIntensity: 2.6, clearcoat: 1, clearcoatRoughness: 0.05 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const cx2 = Math.cos(a) * 1.2, cz2 = Math.sin(a) * 1.2;
      chand.add(cyl('crysChainA' + i, 0.0045, 0.0045, 0.2, M.brassDark, cx2, -0.1, cz2, 5));
      const dropA = new THREE.Mesh(new THREE.OctahedronGeometry(0.055), crystalM);
      dropA.name = 'crysDropA' + i;
      dropA.scale.set(1, 1.7, 1);
      dropA.position.set(cx2, -0.29, cz2);
      dropA.castShadow = false;
      chand.add(dropA);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.93;
      const cx2 = Math.cos(a) * 0.72, cz2 = Math.sin(a) * 0.72;
      chand.add(cyl('crysChainB' + i, 0.004, 0.004, 0.16, M.brassDark, cx2, -0.63, cz2, 5));
      const dropB = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), crystalM);
      dropB.name = 'crysDropB' + i;
      dropB.scale.set(1, 1.65, 1);
      dropB.position.set(cx2, -0.78, cz2);
      dropB.castShadow = false;
      chand.add(dropB);
    }
    chand.add(cyl('finialCap', 0.05, 0.03, 0.1, M.brass, 0, -0.85, 0, 12));
    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.095), crystalM);
    finial.name = 'chandFinial';
    finial.scale.set(1, 1.6, 1);
    finial.position.set(0, -1.02, 0);
    finial.castShadow = false;
    chand.add(finial);
    chand.position.set(0.2, 4.9, 0.6);
    scene.add(chand);

    // ===== CLOCK (under mezzanine, by reception) =====
    const ck = new THREE.Group(); ck.name = 'clock';
    ck.add(rbox('clockBody', 0.8, 2.9, 0.55, 0.04, M.walnut, -3.6, 1.45, -6.9));
    ck.add(box('clockCrown', 0.94, 0.14, 0.66, M.walnutDark, -3.6, 2.95, -6.9));
    ck.add(box('clockBase', 0.94, 0.18, 0.66, M.walnutDark, -3.6, 0.09, -6.9));
    ck.add(cyl('clockFace', 0.3, 0.3, 0.06, std('clockFaceM', 0xF8F2E0, 0.5), -3.6, 2.42, -6.6, 32).rotateX(Math.PI / 2));
    ck.add(torus('clockBezel', 0.3, 0.028, M.brass, -3.6, 2.42, -6.57));
    const minH = box('minHand', 0.024, 0.2, 0.02, M.ink, -3.6, 2.48, -6.55);
    const hrH = box('hrHand', 0.024, 0.14, 0.02, M.ink, -3.6, 2.45, -6.56);
    hrH.rotation.z = -1.15;
    ck.add(minH, hrH);
    this._minHand = minH;
    ck.add(box('clockGlass', 0.5, 1.5, 0.04, M.glass, -3.6, 1.25, -6.61, false, false));
    const pendPiv = new THREE.Group();
    pendPiv.name = 'pendulumPivot';
    pendPiv.position.set(-3.6, 2.0, -6.75);
    pendPiv.add(cyl('pendRod', 0.014, 0.014, 0.95, M.brassDark, 0, -0.475, 0, 8));
    pendPiv.add(cyl('pendBob', 0.14, 0.14, 0.04, M.brass, 0, -0.98, 0, 22).rotateX(Math.PI / 2));
    ck.add(pendPiv);
    this._pendulum = pendPiv;
    zones.add(ck);

    // ===== SOUL — fountain on bordeaux rug under chandelier =====
    const rugT = runnerTexture();
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.05, 0.05, 56), std('rug', 0x5E2630, 1, 0, { envMapIntensity: 0.22 }));
    rug.name = 'emeraldRug';
    rug.position.set(0.2, 0.042, 0.6);
    rug.receiveShadow = true;
    scene.add(rug);
    const rugTrim = torus('rugTrim', 2.85, 0.012, M.gold, 0.2, 0.07, 0.6);
    rugTrim.rotation.x = Math.PI / 2;
    rugTrim.castShadow = false;
    scene.add(rugTrim);

    const marbleT3 = marbleTexture();
    const marbleFtM = phys('marbleFountain', 0xFFFFFF, { map: marbleT3, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.95 });
    const ft = new THREE.Group(); ft.name = 'fountain';
    ft.add(cyl('ftPlinth', 0.95, 1.1, 0.22, marbleFtM, 0, 0.11, 0, 40));
    ft.add(cyl('ftBasin', 0.88, 0.7, 0.34, marbleFtM, 0, 0.38, 0, 40));
    ft.add(torus('ftLip', 0.88, 0.05, M.brass, 0, 0.55, 0).rotateX(Math.PI / 2));
    ft.add(cyl('ftWater', 0.8, 0.8, 0.08, M.water, 0, 0.52, 0, 40));
    ft.add(cyl('ftColumn', 0.16, 0.22, 0.5, marbleFtM, 0, 0.8, 0, 24));
    ft.add(torus('ftCollar', 0.18, 0.03, M.brass, 0, 1.02, 0).rotateX(Math.PI / 2));
    // upper tier bowl
    ft.add(cyl('ftBowl', 0.52, 0.18, 0.16, marbleFtM, 0, 1.13, 0, 32));
    ft.add(torus('ftBowlLip', 0.52, 0.035, M.brass, 0, 1.21, 0).rotateX(Math.PI / 2));
    ft.add(cyl('ftBowlWater', 0.45, 0.45, 0.05, M.water, 0, 1.185, 0, 32));
    ft.add(cyl('ftCol2', 0.09, 0.13, 0.3, marbleFtM, 0, 1.36, 0, 20));
    ft.add(torus('ftCollar2', 0.11, 0.022, M.brass, 0, 1.52, 0).rotateX(Math.PI / 2));
    const orb = sph('soulOrb', 0.36, M.gold, 0, 1.88, 0, 40, 30);
    ft.add(orb);
    this._orb = orb;
    const sparkM = std('spark', 0xFFEDB0, 0.4, 0.3, { emissive: 0xFFEDB0, emissiveIntensity: 1.6 });
    const sparks = new THREE.Group(); sparks.name = 'sparks';
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), sparkM);
      s.name = 'spark' + i;
      sparks.add(s);
    }
    sparks.position.y = 1.88;
    ft.add(sparks);
    this._sparks = sparks;
    ft.position.set(0.2, 0.07, 0.6);
    zones.add(ft);

    // fluted marble columns flanking the hall
    const column = (nm, x, z) => {
      const g = new THREE.Group(); g.name = nm;
      g.add(cyl(nm + '_base', 0.44, 0.5, 0.2, marbleFtM, 0, 0.1, 0, 28));
      g.add(cyl(nm + '_torus', 0.4, 0.4, 0.1, M.brassDark, 0, 0.25, 0, 28));
      g.add(cyl(nm + '_shaft', 0.3, 0.34, 6.62, marbleFtM, 0, 3.61, 0, 28));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.add(cyl(nm + '_flute' + i, 0.022, 0.022, 6.4, std('flute', 0xD9CFBC, 0.8), Math.cos(a) * 0.31, 3.61, Math.sin(a) * 0.31, 6));
      }
      g.add(cyl(nm + '_cap', 0.38, 0.32, 0.14, M.brass, 0, 6.98, 0, 28));
      g.add(torus(nm + '_collarT', 0.33, 0.024, M.brass, 0, 6.82, 0).rotateX(Math.PI / 2));
      g.add(torus(nm + '_collarB', 0.36, 0.03, M.brass, 0, 0.42, 0).rotateX(Math.PI / 2));
      g.add(box(nm + '_abacus', 0.82, 0.12, 0.82, M.walnutDark, 0, 7.13, 0));
      g.position.set(x, 0.016, z);
      return g;
    };
    zones.add(column('columnA', -2.8, -4.4));
    zones.add(column('columnB', 3.2, -4.2));
    mkContact('shColA', 1.4, 1.4, 0.45, -2.8, -4.4);
    mkContact('shColB', 1.4, 1.4, 0.45, 3.2, -4.2);

    // ===== luggage cart (Quarters prop, ground floor) =====
    const cart = new THREE.Group(); cart.name = 'luggageCart';
    [[-0.48, -0.3], [0.48, -0.3], [-0.48, 0.3], [0.48, 0.3]].forEach((p, i) => {
      cart.add(cyl('cartPost' + i, 0.025, 0.025, 1.5, M.brass, p[0], 0.85, p[1], 10));
      cart.add(sph('cartWheel' + i, 0.07, M.ink, p[0], 0.07, p[1], 12, 10));
    });
    cart.add(cyl('cartBarA', 0.022, 0.022, 1.02, M.brass, 0, 1.6, -0.3, 8).rotateZ(Math.PI / 2));
    cart.add(cyl('cartBarB', 0.022, 0.022, 1.02, M.brass, 0, 1.6, 0.3, 8).rotateZ(Math.PI / 2));
    cart.add(torus('cartArchL', 0.3, 0.022, M.brass, -0.48, 1.6, 0, Math.PI).rotateY(Math.PI / 2));
    cart.add(torus('cartArchR', 0.3, 0.022, M.brass, 0.48, 1.6, 0, Math.PI).rotateY(Math.PI / 2));
    cart.add(box('cartDeck', 1.0, 0.06, 0.62, M.walnutDark, 0, 0.17, 0));
    cart.add(box('cartVelvet', 0.96, 0.03, 0.58, M.rope, 0, 0.215, 0));
    const caseA = rbox('suitcaseA', 0.62, 0.22, 0.42, 0.03, M.leatherTan, -0.05, 0.35, 0);
    caseA.rotation.y = 0.08;
    cart.add(caseA);
    cart.add(box('caseAStrapA', 0.03, 0.23, 0.43, M.walnutDark, -0.2, 0.35, 0, false));
    cart.add(box('caseAStrapB', 0.03, 0.23, 0.43, M.walnutDark, 0.12, 0.35, 0, false));
    const caseB = rbox('suitcaseB', 0.48, 0.18, 0.34, 0.03, M.leatherBrown, 0.03, 0.56, 0.02);
    caseB.rotation.y = -0.12;
    cart.add(caseB);
    cart.add(box('caseBClasp', 0.06, 0.04, 0.02, M.gold, 0.03, 0.56, 0.2, false));
    cart.position.set(4.3, 0.016, 5.8);
    cart.rotation.y = -0.5;
    zones.add(cart);

    // cat tower
    const tower = new THREE.Group(); tower.name = 'catTower';
    const sisalM = std('sisal', 0xC9B490, 0.95);
    tower.add(cyl('towerPostA', 0.07, 0.07, 1.5, sisalM, -5.8, 0.75, 3.0, 14));
    tower.add(cyl('towerPostB', 0.07, 0.07, 2.2, sisalM, -5.2, 1.1, 2.4, 14));
    tower.add(cyl('towerPlatA', 0.5, 0.5, 0.08, M.velvetGreen, -5.8, 1.54, 3.0, 26));
    tower.add(cyl('towerPlatB', 0.55, 0.55, 0.08, M.velvetGreen, -5.2, 2.24, 2.4, 26));
    tower.add(cyl('towerCushion', 0.4, 0.4, 0.07, M.cream, -5.2, 2.31, 2.4, 22));
    zones.add(tower);

    // ===== STUDY — grand executive desk (front-right) =====
    const study = new THREE.Group(); study.name = 'study';
    const leatherM = phys('deskLeather', 0x59262E, { roughness: 0.72, sheen: 0.3, sheenColor: new THREE.Color(0xB07A82), sheenRoughness: 0.6, envMapIntensity: 0.4 });
    const parchM = std('parchment', 0xF3EAD2, 0.92);
    // area rug
    study.add(rbox('studyRug', 3.7, 0.03, 2.7, 0.015, runnerStepM, 0, 0.03, -0.35));
    // desk: top + leather inlay
    study.add(rbox('studyTop', 2.7, 0.09, 1.25, 0.03, M.walnut, 0, 0.795, 0));
    study.add(box('studyLeather', 1.9, 0.014, 0.8, leatherM, 0, 0.848, 0.02, false));
    study.add(box('studyTrimL', 0.03, 0.012, 0.8, M.brass, -0.96, 0.85, 0.02, false));
    study.add(box('studyTrimR', 0.03, 0.012, 0.8, M.brass, 0.96, 0.85, 0.02, false));
    // pedestals + plinths + drawers
    [[-0.95, 'L'], [0.95, 'R']].forEach(([px, sfx]) => {
      study.add(rbox('studyPed' + sfx, 0.66, 0.72, 1.05, 0.04, M.walnut, px, 0.39, 0));
      study.add(box('studyPlinth' + sfx, 0.7, 0.06, 1.09, M.walnutDark, px, 0.03, 0));
      [0.57, 0.28].forEach((dy, di) => {
        study.add(box('studyDrawer' + sfx + di, 0.5, 0.22, 0.03, M.walnutDark, px, dy, 0.54, false));
        study.add(cyl('studyHandle' + sfx + di, 0.011, 0.011, 0.15, M.brass, px, dy, 0.575, 8).rotateZ(Math.PI / 2));
      });
    });
    study.add(box('studyModesty', 1.22, 0.52, 0.06, M.walnutDark, 0, 0.5, -0.4));
    const sPlate = box('studyPlate', 0.36, 0.09, 0.016, M.gold, 0, 0.62, 0.635, false);
    study.add(sPlate);
    // banker's lamp (green glass, warm core)
    study.add(cyl('bankerBase', 0.1, 0.115, 0.035, M.brassDark, -0.82, 0.86, -0.3, 18));
    study.add(cyl('bankerStem', 0.015, 0.015, 0.3, M.brass, -0.82, 1.02, -0.3, 10));
    const bankerGlassM = phys('bankerGlass', 0xA85E2A, { roughness: 0.25, transparent: true, opacity: 0.88, envMapIntensity: 1.1, emissive: 0x6E3A16, emissiveIntensity: 0.6 });
    const bankerShade = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.34, 18, 1, true, 0, Math.PI), bankerGlassM);
    bankerShade.name = 'bankerShade';
    bankerShade.rotation.z = Math.PI / 2;
    bankerShade.position.set(-0.82, 1.18, -0.26);
    bankerShade.castShadow = false;
    study.add(bankerShade);
    study.add(box('bankerCore', 0.26, 0.03, 0.05, globeCoreM, -0.82, 1.155, -0.25, false, false));
    const bankerL = new THREE.PointLight(0xFFE8C0, 3.5, 3.2, 2);
    bankerL.position.set(-0.82, 1.12, -0.2);
    study.add(bankerL);
    // open ledger + paper stack + inkwell & quill
    const sPageL = box('studyLedgerL', 0.3, 0.012, 0.42, parchM, -0.14, 0.865, 0.14, false);
    sPageL.rotation.z = 0.05; sPageL.rotation.y = 0.06;
    const sPageR = box('studyLedgerR', 0.3, 0.012, 0.42, parchM, 0.16, 0.865, 0.14, false);
    sPageR.rotation.z = -0.05; sPageR.rotation.y = -0.03;
    study.add(sPageL, sPageR);
    study.add(box('ledgerSpine', 0.64, 0.02, 0.46, leatherM, 0.01, 0.856, 0.14, false));
    study.add(box('paperStackA', 0.3, 0.05, 0.4, parchM, 0.62, 0.885, 0.22, false));
    const paperB = box('paperStackB', 0.28, 0.03, 0.38, std('parch2', 0xEDE2C6, 0.92), 0.63, 0.925, 0.21, false);
    paperB.rotation.y = 0.12;
    study.add(paperB);
    study.add(cyl('inkwell', 0.045, 0.055, 0.09, phys('inkGlass', 0x1E2B26, { roughness: 0.15, envMapIntensity: 1.1 }), -0.42, 0.9, 0.3, 14));
    study.add(cyl('inkLid', 0.05, 0.05, 0.02, M.brass, -0.42, 0.95, 0.3, 14));
    const quill = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.3, 8), std('quill', 0xF6F1E4, 0.85));
    quill.name = 'quill';
    quill.position.set(-0.38, 1.05, 0.28);
    quill.rotation.z = -0.5; quill.rotation.x = 0.15;
    quill.castShadow = false;
    study.add(quill);
    // concierge bell
    const sBellDome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.brass);
    sBellDome.name = 'studyBellDome';
    sBellDome.position.set(0.86, 0.865, -0.22);
    sBellDome.castShadow = true;
    study.add(sBellDome);
    study.add(cyl('studyBellBase', 0.075, 0.08, 0.016, M.brassDark, 0.86, 0.858, -0.22, 16));
    study.add(sph('studyBellBtn', 0.012, M.brassDark, 0.86, 0.932, -0.22, 8, 6));
    // desk globe
    study.add(cyl('globeBase', 0.07, 0.085, 0.03, M.walnutDark, -0.85, 0.865, 0.32, 14));
    study.add(cyl('globeStem', 0.012, 0.012, 0.08, M.brass, -0.85, 0.92, 0.32, 8));
    const globeArc = torus('globeArc', 0.115, 0.011, M.brass, -0.85, 1.03, 0.32, Math.PI);
    globeArc.rotation.z = Math.PI / 2 - 0.4;
    study.add(globeArc);
    study.add(sph('globeSphere', 0.1, std('globeParch', 0xE3D2A8, 0.8, 0, { envMapIntensity: 0.4 }), -0.85, 1.03, 0.32, 22, 16));
    // executive chair (green velvet, walnut + brass)
    study.add(rbox('studySeat', 0.64, 0.15, 0.6, 0.05, M.velvetGreen, 0, 0.52, -1.08));
    const studyBack = rbox('studyBackRest', 0.62, 0.92, 0.14, 0.06, M.velvetGreen, 0, 1.06, -1.38);
    studyBack.rotation.x = 0.1;
    study.add(studyBack);
    study.add(rbox('studyBackTrim', 0.66, 0.1, 0.16, 0.04, M.walnut, 0, 1.5, -1.42));
    [[-0.26, -0.85], [0.26, -0.85], [-0.26, -1.3], [0.26, -1.3]].forEach((lp, li) => {
      study.add(cyl('studyChLeg' + li, 0.022, 0.026, 0.44, M.brass, lp[0], 0.23, lp[1], 10));
    });
    [[-0.36], [0.36]].forEach(([ax], ai) => {
      study.add(rbox('studyArm' + ai, 0.08, 0.05, 0.5, 0.02, M.walnut, ax, 0.76, -1.1));
      study.add(cyl('studyArmPost' + ai, 0.018, 0.018, 0.18, M.brass, ax, 0.63, -0.92, 8));
    });
    study.position.set(8.7, 0.016, 3.4);
    study.rotation.y = -Math.PI / 2;
    zones.add(study);
    mkContact('shStudy', 3.4, 2.6, 0.45, 8.75, 3.4, scene, 0.062);
    mkContact('shStudyChair', 1.3, 1.3, 0.4, 9.8, 3.4, scene, 0.062);

    // ===== lounge =====
    const lounge = new THREE.Group(); lounge.name = 'lounge';
    const makeSofa = (name, w, seatMat) => {
      const g = new THREE.Group(); g.name = name;
      const r = 0.16;
      g.add(rbox(name + '_base', w, 0.3, 0.9, 0.06, seatMat, 0, 0.34, 0));
      const cushW = (w - 0.5) / 2;
      g.add(rbox(name + '_cushL', cushW, 0.16, 0.78, 0.06, seatMat, -cushW / 2 - 0.02, 0.56, 0.03));
      g.add(rbox(name + '_cushR', cushW, 0.16, 0.78, 0.06, seatMat, cushW / 2 + 0.02, 0.56, 0.03));
      g.add(rbox(name + '_back', w, 0.62, 0.2, 0.07, seatMat, 0, 0.78, -0.36));
      const armGeo = new THREE.CapsuleGeometry(r, 0.62, 8, 16);
      const armL = new THREE.Mesh(armGeo, seatMat);
      armL.name = name + '_armL'; armL.rotation.x = Math.PI / 2;
      armL.position.set(-w / 2 + r - 0.02, 0.62, 0.02);
      armL.castShadow = true;
      const armR = armL.clone(); armR.name = name + '_armR'; armR.position.x = w / 2 - r + 0.02;
      g.add(armL, armR);
      [[-w / 2 + 0.16, 0.34], [w / 2 - 0.16, 0.34], [-w / 2 + 0.16, -0.34], [w / 2 - 0.16, -0.34]].forEach((p, i) => {
        g.add(cyl(name + '_leg' + i, 0.028, 0.02, 0.18, M.brass, p[0], 0.09, p[1], 10));
      });
      return g;
    };
    const sofaA = makeSofa('sofaGreen', 2.5, M.velvetGreen);
    sofaA.position.set(4.8, 0.016, 3.8); sofaA.rotation.y = -0.55;
    lounge.add(sofaA);
    const chair = makeSofa('chairTerra', 1.25, M.velvetTerra);
    chair.position.set(7.0, 0.016, 0.9); chair.rotation.y = -1.4;
    lounge.add(chair);
    lounge.add(cyl('tableTop', 0.62, 0.62, 0.06, M.walnut, 4.7, 0.5, 1.9, 36));
    lounge.add(cyl('tableStem', 0.05, 0.05, 0.42, M.brass, 4.7, 0.25, 1.9, 12));
    lounge.add(cyl('tableFoot', 0.3, 0.3, 0.04, M.walnutDark, 4.7, 0.02, 1.9, 24));
    lounge.add(cyl('tray', 0.26, 0.28, 0.035, M.brass, 4.55, 0.55, 1.78, 26));
    lounge.add(cyl('cup', 0.05, 0.04, 0.08, marbleTopM, 4.42, 0.6, 1.7, 14));
    lounge.add(sph('trayBall', 0.06, M.velvetTerra, 4.72, 0.59, 1.9, 14, 10));
    lounge.add(box('bookStackA', 0.34, 0.05, 0.26, std('bookA', 0x5E7A8A, 0.85), 4.95, 0.555, 2.05));
    lounge.add(box('bookStackB', 0.3, 0.04, 0.22, std('bookB', 0x8A5A4A, 0.85), 4.95, 0.6, 2.03));
    lounge.add(cyl('cushA', 0.42, 0.46, 0.14, M.velvetTerra, -2.6, 0.1, 3.2, 26));
    lounge.add(cyl('cushB', 0.36, 0.4, 0.13, M.cream, 2.4, 0.1, 2.9, 26));
    lounge.add(cyl('lampBase', 0.2, 0.24, 0.05, M.brassDark, 6.4, 0.025, 4.6, 20));
    lounge.add(cyl('lampPole', 0.022, 0.022, 2.6, M.brass, 6.4, 1.3, 4.6, 10));
    const lampArm = cyl('lampArm', 0.03, 0.03, 1.3, M.brass, 5.85, 2.58, 4.25, 10);
    lampArm.rotation.z = 1.1; lampArm.rotation.y = 0.5;
    lounge.add(lampArm);
    lounge.add(sph('lampShade', 0.16, M.brassDark, 5.3, 2.4, 3.95, 20, 14));
    lounge.add(sph('lampGlow', 0.09, globeCoreM, 5.3, 2.32, 3.95, 12, 10));
    // lounge area rug (anchors the seating on marble)
    const loungeRug = new THREE.Mesh(new THREE.CircleGeometry(2.35, 44), std('loungeRug', 0xE3D7BC, 1, 0, { envMapIntensity: 0.2 }));
    loungeRug.name = 'loungeRug';
    loungeRug.rotation.x = -Math.PI / 2;
    loungeRug.position.set(5.3, 0.026, 2.6);
    loungeRug.receiveShadow = true;
    lounge.add(loungeRug);
    const loungeRugTrim = torus('loungeRugTrim', 2.2, 0.01, M.gold, 5.3, 0.032, 2.6);
    loungeRugTrim.rotation.x = Math.PI / 2;
    loungeRugTrim.castShadow = false;
    lounge.add(loungeRugTrim);
    scene.add(lounge);

    // plants + toy basket + art + sconces
    // indoor palms in gold planters
    const palmTrunkM = std('palmTrunk', 0x9A7B52, 0.95);
    const palmRingM = std('palmTrunkRing', 0x84663F, 0.95);
    const palmLeafA = std('palmLeafA', 0x3E6B3A, 0.9);
    const palmLeafB = std('palmLeafB', 0x557F42, 0.9);
    const makePlant = (name, x, z, s = 1) => {
      const g = new THREE.Group(); g.name = name;
      g.add(cyl(name + '_pot', 0.32 * s, 0.25 * s, 0.44 * s, M.brass, 0, 0.22 * s, 0, 24));
      g.add(torus(name + '_potRim', 0.31 * s, 0.028 * s, M.brassDark, 0, 0.44 * s, 0).rotateX(Math.PI / 2));
      g.add(cyl(name + '_soil', 0.27 * s, 0.27 * s, 0.03 * s, M.walnutDark, 0, 0.45 * s, 0, 20));
      const trunk = cyl(name + '_trunk', 0.05 * s, 0.085 * s, 1.72 * s, palmTrunkM, 0.03 * s, 1.3 * s, 0, 12);
      trunk.rotation.z = -0.045;
      g.add(trunk);
      for (let r = 0; r < 4; r++) {
        const ring = torus(name + '_ring' + r, (0.083 - r * 0.009) * s, 0.014 * s, palmRingM, 0.03 * s + r * 0.012 * s, (0.72 + r * 0.38) * s, 0);
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
      }
      const crownY = 2.2 * s;
      const frondGeo = new THREE.ConeGeometry(0.115 * s, 1.45 * s, 7);
      for (let i = 0; i < 9; i++) {
        const fg = new THREE.Group();
        fg.name = name + '_frondG' + i;
        fg.position.set(0.07 * s, crownY, 0);
        fg.rotation.y = (i / 9) * Math.PI * 2 + (i % 2) * 0.2;
        const droop = 0.45 + (i % 3) * 0.3;
        const frond = new THREE.Mesh(frondGeo, i % 2 ? palmLeafA : palmLeafB);
        frond.name = name + '_frond' + i;
        frond.scale.set(1, 1, 0.14);
        frond.rotation.z = -(Math.PI / 2) - droop;
        frond.position.set(Math.cos(droop) * 0.62 * s, -Math.sin(droop) * 0.62 * s + 0.08 * s, 0);
        frond.castShadow = true;
        fg.add(frond);
        g.add(fg);
      }
      [[0.05, 0.04], [-0.05, -0.04], [0.01, 0.07]].forEach((cp, ci) => {
        g.add(sph(name + '_coco' + ci, 0.05 * s, palmRingM, cp[0] * s, crownY - 0.13 * s, cp[1] * s, 10, 8));
      });
      g.position.set(x, 0.016, z);
      return g;
    };
    scene.add(makePlant('plantA', -10.1, -6.3, 1.2));
    scene.add(makePlant('plantB', 10.2, -6.6, 1.15));
    scene.add(makePlant('plantC', 9.8, 4.9, 1.0));
    scene.add(makePlant('plantD', -6.4, 6.6, 0.9));
    const plantE = makePlant('plantE', -3.6, -6.9, 0.75);
    plantE.position.y = 3.615;
    plantE.position.x = -3.4;
    plantE.position.z = -6.9;
    // keep mezz plant clear of clock: place at mezz left end
    plantE.position.set(-10.5, 3.615, -6.8);
    scene.add(plantE);
    const basket = new THREE.Group(); basket.name = 'toyBasket';
    basket.add(cyl('basketBody', 0.42, 0.34, 0.34, std('rattan', 0xB59468, 0.95), 0, 0.17, 0, 22));
    basket.add(torus('basketRim', 0.42, 0.035, std('rattanRim', 0xA37F50, 0.95), 0, 0.34, 0).rotateX(Math.PI / 2));
    [[0.1, 0.4, 0.05, C.velvetTerra], [-0.13, 0.38, -0.06, C.emeraldLight], [0.02, 0.42, -0.13, 0xD9B45C]].forEach((b, i) => {
      basket.add(sph('toyBall' + i, 0.1, std('toyBall' + i, b[3], 0.7), b[0], b[1], b[2], 14, 10));
    });
    basket.position.set(2.9, 0.016, 5.5);
    scene.add(basket);

    const artM = std('artCanvas', 0xFFFFFF, 0.9, 0, { map: artTexture() });
    new THREE.TextureLoader().load((window.__resources && window.__resources.mascotPortrait) || '/mascot.jpg', (tx) => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; artM.map = tx; artM.needsUpdate = true; });
    const art = new THREE.Group(); art.name = 'wallArt';
    art.add(rbox('artFrame', 0.08, 1.5, 1.2, 0.02, M.brass, 0, 0, 0));
    const artPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 1.36), artM);
    artPlane.name = 'artPlane';
    artPlane.rotation.y = Math.PI / 2;
    artPlane.position.x = 0.05;
    art.add(artPlane);
    art.add(cyl('picArm', 0.015, 0.015, 0.3, M.brassDark, 0.12, 0.86, 0, 8).rotateZ(1.2));
    art.add(cyl('picShade', 0.05, 0.06, 0.34, M.brass, 0.22, 0.92, 0, 14).rotateZ(Math.PI / 2 + 0.35));
    art.add(box('picGlow', 0.26, 0.02, 0.05, coveM, 0.22, 0.88, 0, false, false));
    art.position.set(-11.05, 2.5, 5.2);
    scene.add(art);

    const sconce = (nm, x, z, ry = 0) => {
      const g = new THREE.Group(); g.name = nm;
      g.add(box(nm + '_plate', 0.14, 0.5, 0.05, M.walnutDark, 0, 0, 0));
      g.add(cyl(nm + '_stem', 0.016, 0.016, 0.3, M.brass, 0, 0.05, 0.1, 8));
      const shade = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.brass);
      shade.name = nm + '_shade';
      shade.rotation.x = Math.PI;
      shade.position.set(0, 0.28, 0.12);
      shade.castShadow = true;
      g.add(shade);
      g.add(sph(nm + '_core', 0.07, globeCoreM, 0, 0.24, 0.12, 12, 10));
      g.position.set(x, 2.6, z); g.rotation.y = ry;
      return g;
    };
    scene.add(sconce('sconceA', 1.0, -7.32));
    scene.add(sconce('sconceB', 10.35, -7.32));
    const scC = sconce('sconceC', -10.92, 4.2, Math.PI / 2);
    scC.position.y = 3.0;
    scene.add(scC);

    // ===== zone labels =====
    const labels = new THREE.Group(); labels.name = 'labels';
    [
      ['ARCHIVE · FRONT DESK · ' + LIVE.memory.count + '/' + LIVE.memory.cap, -7.0, 2.75, -5.4],
      ['WORKSHOP · ' + LIVE.skills + ' SKILLS', 7.0, 3.6, -6.6],
      ['CLOCK · NEXT ' + LIVE.next, -3.6, 3.35, -6.6],
      ['SOUL · LV ' + LIVE.soulLv, 0.2, 2.95, 0.6],
      ['QUARTERS · SUITES', -7.0, 5.2, -5.6],
      [LIVE.goals > 0 ? 'STUDY · ' + LIVE.goals + ' GOAL' + (LIVE.goals === 1 ? '' : 'S') + ' · QUEUED' : 'STUDY', 8.7, 2.5, 3.4]
    ].forEach(([t, x, y, z]) => {
      const s = textSprite(t, { fontSize: 36, scale: 0.78 });
      s.position.set(x, y, z);
      labels.add(s);
    });
    scene.add(labels);
    this._labels = labels;
    labels.visible = (this.getAttribute('show-labels') || 'on') !== 'off';

    // ===== pets =====
    const petsG = new THREE.Group(); petsG.name = 'pets';
    scene.add(petsG);

    const V3n = (x2, y2, z2) => new THREE.Vector3(x2, y2, z2).normalize();
    const makePet = ({ name, base, belly, dark, noseCol, earCol, iris, tabby, tux, kerchief }) => {
      const g = new THREE.Group();
      g.name = 'pet_' + name;
      const baseN = parseInt(base.slice(1), 16);
      const bellyN = parseInt(belly.slice(1), 16);
      const darkN = parseInt(dark.slice(1), 16);
      const furM = phys(name + 'Fur', 0xFFFFFF, { map: plushBodyTexture({ base, belly, dark, tabby, tux }), roughness: 1, sheen: 0.55, sheenColor: new THREE.Color(0xFFF6E8), sheenRoughness: 0.62, envMapIntensity: 0.32 });
      const headM = phys(name + 'HeadFur', 0xFFFFFF, { map: plushHeadTexture({ base, belly, dark, tabby }), roughness: 1, sheen: 0.55, sheenColor: new THREE.Color(0xFFF6E8), sheenRoughness: 0.62, envMapIntensity: 0.32 });
      const baseSolidM = phys(name + 'FurSolid', baseN, { roughness: 1, sheen: 0.4, sheenColor: new THREE.Color(bellyN), sheenRoughness: 0.7, envMapIntensity: 0.3 });
      const earM = phys(name + 'EarFur', earCol ? parseInt(earCol.slice(1), 16) : darkN, { roughness: 1, sheen: 0.4, sheenColor: new THREE.Color(bellyN), sheenRoughness: 0.7, envMapIntensity: 0.3 });
      const furLM = phys(name + 'FurLight', bellyN, { roughness: 1, sheen: 0.5, sheenColor: new THREE.Color(0xFFFFFF), sheenRoughness: 0.6, envMapIntensity: 0.3 });
      const darkM = std(name + 'FurDark', darkN, 0.95, 0, { envMapIntensity: 0.26 });
      const pinkM = std(name + 'InnerEar', 0xE0A49A, 0.9);
      const blushM = std(name + 'Blush', 0xE89B8B, 0.95, 0, { transparent: true, opacity: 0.55 });
      const eyeM = phys(name + 'Eye', 0xFFFFFF, { map: eyeTexture(iris || '#C98A2B'), roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.15 });
      const glintM = std(name + 'Glint', 0xFFFFFF, 0.2);
      const whiskerM = std(name + 'Whisker', 0xF8F4E8, 0.7, 0, { transparent: true, opacity: 0.5 });

      // squash/stretch wrapper — all visual parts live here
      const bodyG = new THREE.Group();
      bodyG.name = name + '_bodyG';
      g.add(bodyG);

      // sculpted sitting body: pear silhouette, haunches, chest, flattened seat
      const bodyGeo = sculptSphere(new THREE.SphereGeometry(1, 48, 36), [
        { dir: V3n(-0.62, -0.52, -0.42), amp: 0.32, k: 4.2 },
        { dir: V3n(0.62, -0.52, -0.42), amp: 0.32, k: 4.2 },
        { dir: V3n(0, -0.3, 1), amp: 0.1, k: 3.6 },
        { dir: V3n(0, -0.6, -0.8), amp: 0.13, k: 4 }
      ], (v) => {
        if (v.y > 0) { const s2 = 1 - 0.26 * v.y; v.x *= s2; v.z *= s2; }
        if (v.y < -0.74) { v.y = -0.74 + (v.y + 0.74) * 0.3; }
      });
      bodyGeo.scale(0.27, 0.35, 0.285);
      const body = new THREE.Mesh(bodyGeo, furM);
      body.name = name + '_body';
      body.position.y = 0.29;
      body.castShadow = true; body.receiveShadow = true;
      bodyG.add(body);
      // layered fur shells — fuzzy silhouette
      const addShells = (parentMesh, tex, layers, grow, biasTest) => {
        for (let i = 1; i <= layers; i++) {
          const sm = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, map: tex, alphaMap: FUR_ALPHA, transparent: true, alphaTest: biasTest + i * 0.09, roughness: 1, metalness: 0, depthWrite: false });
          sm.name = parentMesh.name + '_shellM' + i;
          const shl = new THREE.Mesh(parentMesh.geometry, sm);
          shl.name = parentMesh.name + '_shell' + i;
          const k2 = 1 + grow * i;
          shl.scale.set(k2, k2, k2);
          shl.castShadow = false; shl.receiveShadow = false;
          parentMesh.add(shl);
        }
      };


      // sculpted head: chubby cheeks + soft muzzle mound, painted face
      const headG = new THREE.Group();
      headG.name = name + '_headG';
      headG.position.set(0, 0.74, 0.03);
      bodyG.add(headG);
      const headGeo = sculptSphere(new THREE.SphereGeometry(1, 44, 32), [
        { dir: V3n(-0.85, -0.32, 0.4), amp: 0.15, k: 5 },
        { dir: V3n(0.85, -0.32, 0.4), amp: 0.15, k: 5 },
        { dir: V3n(0, -0.38, 0.93), amp: 0.1, k: 6.5 }
      ]);
      headGeo.scale(0.215, 0.19, 0.2);
      const head = new THREE.Mesh(headGeo, headM);
      head.name = name + '_head';
      head.castShadow = true; head.receiveShadow = true;
      headG.add(head);


      const eyeL = sph(name + '_eyeL', 0.052, eyeM, -0.092, 0.032, 0.155, 20, 16);
      eyeL.scale.set(1, 1.12, 0.62);
      eyeL.rotation.y = -0.12;
      const eyeR = eyeL.clone(); eyeR.name = name + '_eyeR'; eyeR.position.x = 0.092; eyeR.rotation.y = 0.12;
      headG.add(eyeL, eyeR);
      headG.add(sph(name + '_glintL1', 0.011, glintM, -0.074, 0.062, 0.198, 8, 6));
      headG.add(sph(name + '_glintR1', 0.011, glintM, 0.11, 0.062, 0.198, 8, 6));
      // triangular pink nose
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.024, 3), std(name + 'Nose', noseCol, 0.4, 0, { envMapIntensity: 0.9 }));
      nose.name = name + '_nose';
      nose.position.set(0, -0.032, 0.222);
      nose.rotation.x = Math.PI;
      nose.rotation.y = Math.PI / 3;
      nose.scale.z = 0.6;
      headG.add(nose);
      const mouthGeo = new THREE.TorusGeometry(0.016, 0.0032, 6, 14, Math.PI);
      const mouthL = new THREE.Mesh(mouthGeo, M.ink);
      mouthL.name = name + '_mouthL';
      mouthL.position.set(-0.016, -0.062, 0.208);
      mouthL.rotation.set(-0.2, 0, Math.PI);
      const mouthR = mouthL.clone(); mouthR.name = name + '_mouthR'; mouthR.position.x = 0.016;
      headG.add(mouthL, mouthR);

      // rounded plush ears (dome shells + pink inner)
      const mkEar = (sgn) => {
        const eg = new THREE.Group();
        eg.name = name + '_ear' + (sgn < 0 ? 'L' : 'R');
        eg.position.set(sgn * 0.132, 0.148, -0.01);
        const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), earM);
        shell.name = eg.name + '_shell';
        shell.scale.set(0.098, 0.125, 0.05);
        shell.castShadow = true;
        eg.add(shell);
        const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), pinkM);
        inner.name = eg.name + '_inner';
        inner.scale.set(0.06, 0.078, 0.028);
        inner.position.set(0, 0.004, 0.03);
        eg.add(inner);
        return eg;
      };
      const earL = mkEar(-1), earR = mkEar(1);
      earL.rotation.z = 0.35; earR.rotation.z = -0.35;
      headG.add(earL, earR);

      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 3; i++) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0007, 0.21, 4), whiskerM);
          wh.name = name + '_whisker' + s + '_' + i;
          wh.position.set(s * 0.165, -0.04 + i * 0.018, 0.15);
          wh.rotation.z = s * (Math.PI / 2 + 0.06 - i * 0.09);
          wh.rotation.y = -s * 0.5;
          wh.castShadow = false;
          headG.add(wh);
        }
      }

      // front paws (light socks)
      const mkPaw = (sgn) => {
        const hip = new THREE.Group();
        hip.name = name + '_paw' + (sgn < 0 ? 'L' : 'R');
        hip.position.set(sgn * 0.1, 0.24, 0.19);
        const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.15, 6, 12), baseSolidM);
        limb.name = hip.name + '_limb';
        limb.position.y = -0.085;
        limb.castShadow = true;
        hip.add(limb);
        hip.add(sph(hip.name + '_tip', 0.048, furLM, 0, -0.2, 0.012, 14, 10));
        return hip;
      };
      const pawL = mkPaw(-1), pawR = mkPaw(1);
      bodyG.add(pawL, pawR);

      // tail wrapped around the seat
      const tailPivot = new THREE.Group();
      tailPivot.name = name + '_tailPivot';
      tailPivot.position.set(0, 0.075, -0.24);
      const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-0.2, 0, 0.04),
        new THREE.Vector3(-0.31, 0.012, 0.25),
        new THREE.Vector3(-0.16, 0.024, 0.46),
        new THREE.Vector3(0.1, 0.04, 0.53)
      ]);
      const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 22, 0.052, 10, false), baseSolidM);
      tail.name = name + '_tail';
      tail.castShadow = true;
      tailPivot.add(tail);
      const tailTip = sph(name + '_tailTip', 0.056, tabby ? darkM : furLM, 0.1, 0.04, 0.53, 14, 10);
      tailPivot.add(tailTip);
      bodyG.add(tailPivot);

      if (kerchief) {
        const kM = phys(name + 'Kerchief', parseInt(kerchief.slice(1), 16), { roughness: 1, sheen: 0.6, sheenColor: new THREE.Color(0xFFFFFF), sheenRoughness: 0.55, envMapIntensity: 0.4 });
        const band = torus(name + '_kerchiefBand', 0.175, 0.028, kM, 0, 0.49, 0.01);
        band.rotation.x = Math.PI / 2.12;
        bodyG.add(band);
        const tri = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.185, 4), kM);
        tri.name = name + '_kerchiefTri';
        tri.position.set(0, 0.4, 0.195);
        tri.rotation.x = Math.PI - 0.15;
        tri.rotation.y = Math.PI / 4;
        tri.scale.z = 0.45;
        tri.castShadow = true;
        bodyG.add(tri);
      } else {
        const collar = torus(name + '_collar', 0.185, 0.02, M.brass, 0, 0.5, 0.005);
        collar.rotation.x = Math.PI / 2.12;
        bodyG.add(collar);
        bodyG.add(sph(name + '_tag', 0.032, M.gold, 0, 0.435, 0.195, 12, 10));
      }

      const csm = new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, opacity: 0.38, depthWrite: false });
      csm.name = 'petContactShadow';
      const cs = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82), csm);
      cs.name = name + '_shadow';
      cs.rotation.x = -Math.PI / 2;
      cs.position.y = 0.015;
      cs.renderOrder = 2;
      g.add(cs);
      const label = textSprite(name.toUpperCase(), { fontSize: 36, scale: 0.5 });
      label.name = name + '_label';
      label.position.set(0, 1.18, 0);
      g.add(label);
      g.scale.setScalar(1.3);
      return { group: g, bodyG, tailPivot, headG, ears: [earL, earR], eyes: [eyeL, eyeR], paws: [pawL, pawR], shadow: cs, label };
    };

    const makeBossPom = () => {
      const name = 'Boss';
      const g = new THREE.Group();
      g.name = 'pet_Boss';
      const furM = phys(name + 'Fur', 0xFFFFFF, { map: plushBodyTexture({ base: '#FBF8F0', belly: '#FFFFFB', dark: '#EAE3D2' }), roughness: 1, sheen: 0.6, sheenColor: new THREE.Color(0xFFFFFF), sheenRoughness: 0.6, envMapIntensity: 0.34 });
      const headM = phys(name + 'HeadFur', 0xFFFFFF, { map: plushHeadTexture({ base: '#FBF8F0', belly: '#FFFFFB', dark: '#EAE3D2' }), roughness: 1, sheen: 0.6, sheenColor: new THREE.Color(0xFFFFFF), sheenRoughness: 0.6, envMapIntensity: 0.34 });
      const whiteM = phys(name + 'FurSolid', 0xFAF6EC, { roughness: 1, sheen: 0.5, sheenColor: new THREE.Color(0xFFFFFF), sheenRoughness: 0.65, envMapIntensity: 0.32 });
      const pinkM = std(name + 'InnerEar', 0xE2A69C, 0.9);
      const eyeM = phys(name + 'Eye', 0x2C3036, { roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3 });
      const glintM = std(name + 'Glint', 0xFFFFFF, 0.15);

      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      const mkSpikes = (n, aMin, aMax, kMin, kMax, damp) => {
        const arr = [];
        for (let i = 0; i < n; i++) {
          const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
          const dir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
          let amp = aMin + rnd() * (aMax - aMin);
          if (damp) { amp *= 1 - Math.pow(Math.max(0, dir.dot(damp)), 2) * 0.93; }
          arr.push({ dir, amp, k: kMin + rnd() * (kMax - kMin) });
        }
        return arr;
      };
      const faceDir = new THREE.Vector3(0, -0.12, 1).normalize();

      const bodyG = new THREE.Group();
      bodyG.name = name + '_bodyG';
      g.add(bodyG);

      // fluffy pear body — silhouette made of fur tufts
      const bodyBumps = [
        { dir: V3n(-0.6, -0.5, -0.4), amp: 0.16, k: 4 },
        { dir: V3n(0.6, -0.5, -0.4), amp: 0.16, k: 4 },
        { dir: V3n(0, -0.25, 1), amp: 0.1, k: 3.4 }
      ].concat(mkSpikes(95, 0.015, 0.05, 14, 45));
      const bodyGeo = sculptSphere(new THREE.SphereGeometry(1, 64, 48), bodyBumps, (v) => {
        if (v.y < -0.72) { v.y = -0.72 + (v.y + 0.72) * 0.32; }
        if (v.y < -0.2) { const f = 1 + (-v.y - 0.2) * 0.14; v.x *= f; if (v.z < 0.05) { v.z *= f; } }
      });
      bodyGeo.scale(0.3, 0.31, 0.3);
      const body = new THREE.Mesh(bodyGeo, furM);
      body.name = name + '_body';
      body.position.y = 0.29;
      body.castShadow = true; body.receiveShadow = true;
      bodyG.add(body);

      // chest ruff tuft
      const ruffBumps = mkSpikes(40, 0.08, 0.22, 6, 22);
      const ruffGeo = sculptSphere(new THREE.SphereGeometry(1, 32, 24), ruffBumps);
      ruffGeo.scale(0.215, 0.15, 0.16);
      const ruffMesh = new THREE.Mesh(ruffGeo, furM);
      ruffMesh.name = name + '_ruff';
      ruffMesh.position.set(0, 0.53, 0.13);
      ruffMesh.castShadow = true;
      bodyG.add(ruffMesh);

      // big fluffy head
      const headG = new THREE.Group();
      headG.name = name + '_headG';
      headG.position.set(0, 0.7, 0.04);
      bodyG.add(headG);
      const headBumps = [
        { dir: V3n(-0.85, -0.28, 0.42), amp: 0.1, k: 5 },
        { dir: V3n(0.85, -0.28, 0.42), amp: 0.1, k: 5 },
        { dir: V3n(0, -0.34, 0.94), amp: 0.09, k: 6.5 }
      ].concat(mkSpikes(85, 0.012, 0.045, 16, 48, faceDir));
      const headGeo = sculptSphere(new THREE.SphereGeometry(1, 56, 40), headBumps);
      headGeo.scale(0.26, 0.24, 0.245);
      const head = new THREE.Mesh(headGeo, headM);
      head.name = name + '_head';
      head.castShadow = true; head.receiveShadow = true;
      headG.add(head);

      // big glossy eyes + anchored glints
      const eyeL = sph(name + '_eyeL', 0.075, eyeM, -0.102, 0.028, 0.228, 22, 18);
      eyeL.scale.set(1, 1.12, 0.55);
      const eyeR = eyeL.clone(); eyeR.name = name + '_eyeR'; eyeR.position.x = 0.102;
      headG.add(eyeL, eyeR);
      headG.add(sph(name + '_glintL1', 0.02, glintM, -0.121, 0.055, 0.283, 10, 8));
      headG.add(sph(name + '_glintR1', 0.02, glintM, 0.083, 0.055, 0.283, 10, 8));
      headG.add(sph(name + '_glintL2', 0.009, glintM, -0.08, -0.006, 0.288, 8, 6));
      headG.add(sph(name + '_glintR2', 0.009, glintM, 0.124, -0.006, 0.288, 8, 6));
      // brown nose + clear smile
      const nose = sph(name + '_nose', 0.032, std(name + 'Nose', 0x453028, 0.4, 0, { envMapIntensity: 0.85 }), 0, -0.052, 0.272, 16, 12);
      nose.scale.set(1.25, 0.82, 0.7);
      headG.add(nose);
      const smile = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.006, 8, 18, Math.PI * 0.8), std(name + 'Smile', 0x3A2C24, 0.6));
      smile.name = name + '_smile';
      smile.position.set(0, -0.078, 0.252);
      smile.rotation.set(-0.16, 0, Math.PI + Math.PI * 0.1);
      headG.add(smile);
      const blushM2 = std(name + 'Blush', 0xEFA895, 0.95, 0, { transparent: true, opacity: 0.5 });
      const blushL = sph(name + '_blushL', 0.045, blushM2, -0.155, -0.045, 0.19, 12, 10);
      blushL.scale.set(1, 0.6, 0.35);
      blushL.rotation.y = -0.55;
      blushL.castShadow = false;
      const blushR = blushL.clone(); blushR.name = name + '_blushR'; blushR.position.x = 0.155; blushR.rotation.y = 0.55;
      headG.add(blushL, blushR);
      const mkCheekTuft = (sgn) => {
        const geo = sculptSphere(new THREE.SphereGeometry(1, 20, 14), mkSpikes(16, 0.12, 0.3, 5, 16));
        geo.scale(0.075, 0.06, 0.055);
        const m = new THREE.Mesh(geo, headM);
        m.name = name + '_cheekTuft' + (sgn < 0 ? 'L' : 'R');
        m.position.set(sgn * 0.21, -0.05, 0.09);
        m.castShadow = false;
        return m;
      };
      headG.add(mkCheekTuft(-1), mkCheekTuft(1));

      // ears peeking out of the fluff
      const mkEar = (sgn) => {
        const eg = new THREE.Group();
        eg.name = name + '_ear' + (sgn < 0 ? 'L' : 'R');
        eg.position.set(sgn * 0.152, 0.2, -0.01);
        const shell = new THREE.Mesh(new THREE.ConeGeometry(0.072, 0.125, 14), whiteM);
        shell.name = eg.name + '_shell';
        shell.castShadow = true;
        eg.add(shell);
        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.075, 10), pinkM);
        inner.name = eg.name + '_inner';
        inner.position.set(0, -0.01, 0.022);
        eg.add(inner);
        return eg;
      };
      const earL = mkEar(-1), earR = mkEar(1);
      earL.rotation.z = 0.35; earR.rotation.z = -0.35;
      headG.add(earL, earR);

      // yellow patterned fedora — bigger, clearly tilted
      const hatC = document.createElement('canvas'); hatC.width = 256; hatC.height = 128;
      const hx = hatC.getContext('2d');
      hx.fillStyle = '#EEB02A'; hx.fillRect(0, 0, 256, 128);
      hx.strokeStyle = '#1E1911'; hx.lineWidth = 9; hx.lineJoin = 'miter';
      const dw = 62;
      for (let row = -1; row < 3; row++) {
        for (let col = -1; col < 6; col++) {
          const cx2 = col * dw + (row % 2 ? dw / 2 : 0), cy2 = row * dw + 26;
          hx.save();
          hx.translate(cx2, cy2);
          hx.rotate(Math.PI / 4);
          hx.strokeRect(-dw * 0.28, -dw * 0.28, dw * 0.56, dw * 0.56);
          hx.restore();
        }
      }
      const hatTex = new THREE.CanvasTexture(hatC);
      hatTex.colorSpace = THREE.SRGBColorSpace;
      hatTex.wrapS = THREE.RepeatWrapping;
      const hatM = phys(name + 'Hat', 0xFFFFFF, { map: hatTex, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.75 });
      const hatG = new THREE.Group();
      hatG.name = name + '_hat';
      hatG.add(cyl(name + '_hatCrown', 0.118, 0.142, 0.125, hatM, 0, 0.07, 0, 26));
      const brim = cyl(name + '_hatBrim', 0.215, 0.222, 0.022, hatM, 0, 0, 0, 30);
      hatG.add(brim);
      const band = cyl(name + '_hatBand', 0.145, 0.147, 0.032, std(name + 'HatBand', 0x1E1911, 0.6), 0, 0.026, 0, 26);
      hatG.add(band);
      hatG.position.set(0.035, 0.212, -0.012);
      hatG.rotation.z = -0.26;
      hatG.rotation.x = -0.12;
      headG.add(hatG);

      // front legs planted on the ground (mascot pose)
      const mkLeg2 = (sgn) => {
        const hip = new THREE.Group();
        hip.name = name + '_paw' + (sgn < 0 ? 'L' : 'R');
        hip.position.set(sgn * 0.1, 0.34, 0.24);
        const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.054, 0.2, 6, 14), whiteM);
        limb.name = hip.name + '_limb';
        limb.position.y = -0.15;
        limb.castShadow = true;
        hip.add(limb);
        const tip = sph(hip.name + '_tip', 0.062, whiteM, 0, -0.28, 0.02, 16, 12);
        tip.scale.set(1, 0.82, 1.15);
        hip.add(tip);
        return hip;
      };
      const pawL = mkLeg2(-1), pawR = mkLeg2(1);
      bodyG.add(pawL, pawR);
      // fluffy haunches + hind feet peeking beside the front legs
      const mkHaunch = (sgn) => {
        const geo = sculptSphere(new THREE.SphereGeometry(1, 26, 20), mkSpikes(26, 0.05, 0.16, 7, 26));
        geo.scale(0.135, 0.125, 0.15);
        const m = new THREE.Mesh(geo, furM);
        m.name = name + '_haunch' + (sgn < 0 ? 'L' : 'R');
        m.position.set(sgn * 0.2, 0.13, 0.02);
        m.castShadow = true;
        return m;
      };
      bodyG.add(mkHaunch(-1), mkHaunch(1));
      const hindL = sph(name + '_hindfootL', 0.052, whiteM, -0.2, 0.055, 0.24, 14, 10);
      hindL.scale.set(1, 0.75, 1.25);
      const hindR = hindL.clone(); hindR.name = name + '_hindfootR'; hindR.position.x = 0.19;
      bodyG.add(hindL, hindR);

      // big plume tail over the back
      const tailPivot = new THREE.Group();
      tailPivot.name = name + '_tailPivot';
      tailPivot.position.set(0, 0.42, -0.25);
      const plume = (nm, r, px2, py2, pz2, nSpk) => {
        const geo = sculptSphere(new THREE.SphereGeometry(1, 28, 20), mkSpikes(nSpk, 0.1, 0.26, 5, 18));
        geo.scale(r, r, r);
        const m = new THREE.Mesh(geo, furM);
        m.name = nm;
        m.position.set(px2, py2, pz2);
        m.castShadow = true;
        return m;
      };
      tailPivot.add(plume(name + '_tail1', 0.125, 0, 0.03, -0.04, 34));
      tailPivot.add(plume(name + '_tail2', 0.105, 0, 0.15, 0.03, 30));
      tailPivot.add(plume(name + '_tail3', 0.085, 0, 0.22, 0.12, 26));
      bodyG.add(tailPivot);

      // brass collar + gold tag under the ruff
      const collar = torus(name + '_collar', 0.18, 0.02, M.brass, 0, 0.47, 0.03);
      collar.rotation.x = Math.PI / 2.12;
      bodyG.add(collar);
      bodyG.add(sph(name + '_tag', 0.04, M.gold, 0, 0.395, 0.27, 12, 10));

      const csm = new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, opacity: 0.38, depthWrite: false });
      csm.name = 'petContactShadow';
      const cs = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), csm);
      cs.name = name + '_shadow';
      cs.rotation.x = -Math.PI / 2;
      cs.position.y = 0.015;
      cs.renderOrder = 2;
      g.add(cs);
      // 24 chars leaves room for provenance suffixes ("NAME · DEMO") from the dashboard
      const label = textSprite((LIVE.pets[0].name || 'Boss').toUpperCase().slice(0, 24), { fontSize: 36, scale: 0.5 });
      label.name = name + '_label';
      label.position.set(0, 1.3, 0);
      g.add(label);
      g.scale.setScalar(1.36);
      return { group: g, bodyG, tailPivot, headG, ears: [earL, earR], eyes: [eyeL, eyeR], paws: [pawL, pawR], shadow: cs, label };
    };
    const catP = makeBossPom();
    catP.tiltBase = 0.09;
    const mimiP = makePet({ name: (LIVE.pets[1].name || 'Mimi · STAFF').slice(0, 24), base: '#E09154', belly: '#F8EDD8', dark: '#B06A32', noseCol: 0xC08573, earCol: '#B06A32', iris: '#3E8A5C', tabby: true, kerchief: '#A8473B' });
    const totoP = makePet({ name: (LIVE.pets[2].name || 'Toto · STAFF').slice(0, 24), base: '#4C4846', belly: '#F0EBE0', dark: '#35312F', noseCol: 0x77655C, earCol: '#35312F', iris: '#D9A441', tux: true, kerchief: '#5F7A52' });
    [catP, mimiP, totoP].forEach((pp) => { toonifyPet(pp.group); });

    const ringGeo = new THREE.TorusGeometry(0.4, 0.03, 10, 36);
    const workRingM = std('workRing', C.brassBright, 0.4, 0.4, { emissive: C.brassBright, emissiveIntensity: 1.1 });
    const mkBubble = (text) => {
      const b = textSprite(text, { fontSize: 40, scale: 0.66, fg: '#3A322A' });
      b.position.set(0, 1.44, 0);
      b.visible = false;
      return b;
    };

    // Cat's royal cushion (mascot home seat by the fountain)
    const throne = new THREE.Group(); throne.name = 'catCushion';
    const cushBlueM = phys('royalCushion', 0x3E5C8A, { roughness: 1, sheen: 1, sheenColor: new THREE.Color(0x9CB8DE), sheenRoughness: 0.45, envMapIntensity: 0.5 });
    const cushTop = rbox('cushTop', 0.86, 0.2, 0.86, 0.09, cushBlueM, 0, 0.17, 0);
    cushTop.rotation.y = Math.PI / 4;
    throne.add(cushTop);
    const cushBase = rbox('cushBase', 0.92, 0.12, 0.92, 0.05, phys('royalCushionBase', 0x32496E, { roughness: 1, sheen: 0.8, sheenColor: new THREE.Color(0x7E99C4), sheenRoughness: 0.5, envMapIntensity: 0.4 }), 0, 0.06, 0);
    cushBase.rotation.y = Math.PI / 4;
    throne.add(cushBase);
    throne.add(torus('cushPiping', 0.58, 0.014, M.gold, 0, 0.13, 0).rotateX(Math.PI / 2));
    [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]].forEach((tp, ti) => {
      throne.add(sph('cushTassel' + ti, 0.045, M.gold, tp[0], 0.1, tp[1], 10, 8));
    });
    throne.position.set(1.0, 0.016, 2.6);
    scene.add(throne);
    mkContact('shThrone', 1.3, 1.3, 0.4, 1.0, 2.6);

    this._pets = [
      {
        ...catP, speed: 1.1,
        bubble: mkBubble((LIVE.pets[0].task || 'IDLE').slice(0, 44)),
        plan: [
          { x: 1.0, z: 2.6, pause: 2.5 },
          { x: -2.6, z: 3.4, pause: 0 },
          { x: -6.4, z: -4.4, pause: 6, work: true },
          { x: -2.6, z: 3.4, pause: 0 },
          { x: 1.0, z: 2.6, pause: 3 }
        ]
      },
      {
        ...mimiP, speed: 1.28,
        bubble: mkBubble((LIVE.pets[1].task || 'IDLE').slice(0, 44)),
        plan: [
          { x: 3.9, z: 5.0, pause: 2.2 },
          { x: -0.4, z: 3.8, pause: 1 },
          { x: 6.3, z: -4.3, pause: 4.5, work: true },
          { x: -6.8, z: 0.4, pause: 1 },
          { x: -8.6, z: 1.8, pause: 2 },
          { x: 3.9, z: 5.0, pause: 3 }
        ]
      },
      {
        ...totoP, speed: 0.92,
        bubble: mkBubble((LIVE.pets[2].task || 'IDLE').slice(0, 44)),
        plan: [
          { x: 0.2, z: 6.2, pause: 1.5 },
          { x: 1.8, z: 2.4, pause: 3, work: true },
          { x: 4.9, z: -1.2, pause: 1 },
          { x: 7.2, z: 3.4, pause: 3.5, work: true },
          { x: 5.9, z: 5.8, pause: 0 },
          { x: 0.2, z: 6.2, pause: 2 }
        ]
      }
    ];

    this._pets.forEach((p, i) => {
      const start = p.plan[0];
      p.group.position.set(start.x, 0, start.z);
      p.seg = 0; p.t = 0; p.pauseLeft = start.pause * (0.5 + i * 0.5); p.yaw = 0;
      p.group.add(p.bubble);
      const wr = new THREE.Mesh(ringGeo, workRingM);
      wr.name = p.group.name + '_workRing';
      wr.rotation.x = Math.PI / 2;
      wr.position.y = 0.05;
      wr.visible = false;
      p.workRing = wr;
      p.group.add(wr);
      petsG.add(p.group);
    });

    // ===== resize + loop =====
    const resize = () => {
      const w = this.clientWidth || 800;
      const h = this.clientHeight || 600;
      renderer.setSize(w, h);
      this._composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(this);

    const clock = new THREE.Clock();
    const rugIn = (x, z) => Math.hypot(x - 0.2, z - 0.6) < 3.0;

    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      this._pets.forEach((p, pi) => {
        const g = p.group;
        const cur = p.plan[p.seg];
        const nxt = p.plan[(p.seg + 1) % p.plan.length];
        let moving = false;
        if (p.pauseLeft > 0) {
          p.pauseLeft -= dt;
          const working = !!cur.work;
          p.bubble.visible = working;
          p.workRing.visible = working;
          if (working) {
            const s = 1 + Math.sin(t * 5 + pi) * 0.12;
            p.workRing.scale.set(s, s, 1);
          }
        } else {
          p.bubble.visible = false;
          p.workRing.visible = false;
          const dx = nxt.x - cur.x, dz = nxt.z - cur.z;
          const len = Math.hypot(dx, dz);
          p.t += (p.speed * dt) / len;
          moving = true;
          if (p.t >= 1) {
            p.t = 0;
            p.seg = (p.seg + 1) % p.plan.length;
            p.pauseLeft = nxt.pause || 0;
          } else {
            g.position.x = cur.x + dx * p.t;
            g.position.z = cur.z + dz * p.t;
            const targetYaw = Math.atan2(dx, dz);
            let d = targetYaw - p.yaw;
            while (d > Math.PI) { d -= Math.PI * 2; }
            while (d < -Math.PI) { d += Math.PI * 2; }
            p.yaw += d * Math.min(1, dt * 8);
            g.rotation.y = p.yaw;
          }
        }
        const onCushion = Math.hypot(g.position.x - 1.0, g.position.z - 2.6) < 0.5;
        const baseY = onCushion ? 0.27 : (rugIn(g.position.x, g.position.z) ? 0.07 : 0.018);
        // hop locomotion with squash & stretch
        let hop = 0, sy = 1;
        if (moving) {
          const hp = Math.sin(t * 8.2 + pi * 2.1);
          hop = Math.max(0, hp) * 0.09;
          sy = hp > 0 ? 1 + hp * 0.06 : 1 - (-hp) * 0.1;
          if (!p.isSprite) {
            p.bodyG.rotation.x = -0.07;
            const tuck = -0.55 * Math.max(0, hp);
            p.paws[0].rotation.x += (tuck - p.paws[0].rotation.x) * Math.min(1, dt * 12);
            p.paws[1].rotation.x = p.paws[0].rotation.x;
          }
        } else {
          sy = 1 + Math.sin(t * 2.1 + pi) * 0.014;
          if (!p.isSprite) {
            p.bodyG.rotation.x = 0;
            p.paws[0].rotation.x *= 0.9;
            p.paws[1].rotation.x *= 0.9;
          }
        }
        const sxz = 1 - (sy - 1) * 0.55;
        if (p.isSprite) {
          p.sprite.scale.set(p.spriteW * sxz, p.spriteH * sy, 1);
        } else {
          p.bodyG.scale.set(sxz, sy, sxz);
        }
        g.position.y += ((baseY + hop) - g.position.y) * Math.min(1, dt * 14);
        g.rotation.z = 0;
        p.shadow.material.opacity = Math.max(0.16, 0.38 - hop * 2.2);
        const shs = 1 + hop * 0.9;
        p.shadow.scale.set(shs, shs, 1);
        if (!p.isSprite) {
          p.tailPivot.rotation.y = Math.sin(t * (moving ? 4.5 : 1.6) + pi) * 0.12;
          p.tailPivot.rotation.x = moving ? hop * 2.4 : Math.sin(t * 2.2 + pi) * 0.04;
          p.headG.rotation.x = moving ? 0.06 : Math.sin(t * 1.6 + pi) * 0.05;
          p.headG.rotation.z = (p.tiltBase || 0) + (moving ? 0 : Math.sin(t * 0.9 + pi * 1.3) * 0.06);
          const tw = (t * 1.1 + pi * 2.3) % 4.6;
          const twL = tw < 0.14 ? Math.sin((tw / 0.14) * Math.PI) * 0.3 : 0;
          const twR = (tw > 2.2 && tw < 2.34) ? Math.sin(((tw - 2.2) / 0.14) * Math.PI) * 0.3 : 0;
          p.ears[0].rotation.z = 0.35 + twL;
          p.ears[1].rotation.z = -0.35 - twR;
          const blink = ((t + pi * 1.37) % 4.2) < 0.13 ? 0.1 : 1;
          p.eyes[0].scale.y = 1.12 * blink;
          p.eyes[1].scale.y = 1.12 * blink;
        }
      });

      this._orb.position.y = 1.88 + Math.sin(t * 1.5) * 0.08;
      this._orb.rotation.y = t * 0.5;
      this._sparks.children.forEach((s, i) => {
        const a = t * 0.85 + (i * Math.PI) / 2;
        s.position.set(Math.cos(a) * 0.72, Math.sin(t * 2 + i) * 0.11, Math.sin(a) * 0.72);
        s.rotation.y = t * 2;
      });
      this._minHand.rotation.z = -((t % 60) / 60) * Math.PI * 2;
      this._pendulum.rotation.z = Math.sin(t * 2.1) * 0.22;
      this._lights.pendantL.intensity = 15 + Math.sin(t * 2.2) * 0.6;
      this._lights.orbL.intensity = 8 + Math.sin(t * 1.5) * 1.1;

      const mpos = this._motes.geometry.attributes.position;
      for (let i = 0; i < mpos.count; i++) {
        let y = mpos.getY(i) + dt * (0.035 + (i % 5) * 0.011);
        if (y > 3.8) { y = 0.15; }
        mpos.setY(i, y);
        mpos.setX(i, mpos.getX(i) + Math.sin(t * 0.6 + i) * dt * 0.018);
      }
      mpos.needsUpdate = true;

      this._controls.update();
      this._composer.render();
      if (!this._readyFired) {
        // first painted frame — lets the React mount swap out its loading plaque
        this._readyFired = true;
        this.dispatchEvent(new CustomEvent('gp-ready', { bubbles: true }));
      }
    };
    tick();
  }

  attributeChangedCallback(nm, _old, val) {
    if (nm === 'auto-rotate' && this._controls) { this._controls.autoRotate = val !== 'off'; }
    if (nm === 'show-labels' && this._labels) { this._labels.visible = val !== 'off'; }
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    if (this._ro) { this._ro.disconnect(); }
    if (this._renderer) { this._renderer.dispose(); }
    this._init = false;
    this._readyFired = false;
  }
}

if (!customElements.get('agent-cafe-3d')) { customElements.define('agent-cafe-3d', AgentCafe3D); }
export {};

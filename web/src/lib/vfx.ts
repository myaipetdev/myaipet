/**
 * Battle VFX Engine
 * Canvas-based particle system + screen effects
 * Scales with skill star level (★1 simple → ★5 fullscreen cutscene)
 */

// ── Particle ──
export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  life: number; maxLife: number;
  color: string;
  alpha: number;
  type: "circle" | "rect" | "spark" | "ring" | "slash" | "star";
  rotation?: number;
  rotSpeed?: number;
  gravity?: number;
  shrink?: boolean;
  glow?: boolean;
}

// ── Screen Effect ──
export interface ScreenEffect {
  type: "shake" | "flash" | "slowmo" | "darken" | "chromatic" | "zoom";
  duration: number;
  elapsed: number;
  intensity: number;
  color?: string;
}

// ── VFX State ──
export interface VFXState {
  particles: Particle[];
  screenEffects: ScreenEffect[];
  cutscene: CutsceneState | null;
}

export interface CutsceneState {
  skillName: string;
  skillEmoji: string;
  element: string;
  starLevel: number;
  phase: number; // 0=zoom-in, 1=name-flash, 2=execute, 3=fade-out
  elapsed: number;
  duration: number;
  attackerName: string;
  colors: string[];
}

export function createVFX(): VFXState {
  return { particles: [], screenEffects: [], cutscene: null };
}

// ── Spawn Particles ──

function rng(min: number, max: number) { return min + Math.random() * (max - min); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// Fire particles — flickering flames, embers rising
export function spawnFire(vfx: VFXState, cx: number, cy: number, intensity: number) {
  const count = 15 + intensity * 20;
  for (let i = 0; i < count; i++) {
    vfx.particles.push({
      x: cx + rng(-30, 30), y: cy + rng(-10, 20),
      vx: rng(-1.5, 1.5), vy: rng(-4, -1),
      size: rng(3, 8 + intensity * 3),
      life: 0, maxLife: rng(20, 40 + intensity * 10),
      color: pick(["#ff4400", "#ff6600", "#ff8800", "#ffaa00", "#ffcc00", "#fff8e0"]),
      alpha: 1, type: "circle",
      gravity: -0.08, shrink: true, glow: true,
    });
  }
  // Embers
  for (let i = 0; i < intensity * 8; i++) {
    vfx.particles.push({
      x: cx + rng(-20, 20), y: cy,
      vx: rng(-3, 3), vy: rng(-6, -2),
      size: rng(1, 3),
      life: 0, maxLife: rng(30, 60),
      color: pick(["#ffcc00", "#ff8800", "#fff"]),
      alpha: 1, type: "spark",
      gravity: -0.05, glow: true,
    });
  }
  vfx.screenEffects.push({ type: "flash", duration: 6, elapsed: 0, intensity: 0.3, color: "#ff440060" });
  if (intensity >= 3) vfx.screenEffects.push({ type: "shake", duration: 15, elapsed: 0, intensity: intensity * 2 });
}

// Water particles — splashes, droplets, waves
export function spawnWater(vfx: VFXState, cx: number, cy: number, intensity: number) {
  const count = 12 + intensity * 15;
  // Central splash
  for (let i = 0; i < count; i++) {
    const angle = rng(0, Math.PI * 2);
    const speed = rng(1, 4 + intensity);
    vfx.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
      size: rng(2, 6 + intensity * 2),
      life: 0, maxLife: rng(20, 45),
      color: pick(["#2288ff", "#44aaff", "#66ccff", "#88ddff", "#aaeeff", "#fff"]),
      alpha: 0.9, type: "circle",
      gravity: 0.12, shrink: true, glow: true,
    });
  }
  // Droplets
  for (let i = 0; i < intensity * 10; i++) {
    vfx.particles.push({
      x: cx + rng(-30, 30), y: cy + rng(-20, 0),
      vx: rng(-2, 2), vy: rng(-5, -1),
      size: rng(1, 3),
      life: 0, maxLife: rng(20, 50),
      color: pick(["#66ccff", "#aaeeff", "#fff"]),
      alpha: 1, type: "circle",
      gravity: 0.15,
    });
  }
  // Wave ring
  if (intensity >= 2) {
    vfx.particles.push({
      x: cx, y: cy,
      vx: 0, vy: 0,
      size: 5, life: 0, maxLife: 30,
      color: "#44aaff",
      alpha: 0.6, type: "ring",
      glow: true,
    });
  }
  vfx.screenEffects.push({ type: "flash", duration: 5, elapsed: 0, intensity: 0.2, color: "#2288ff40" });
  if (intensity >= 3) vfx.screenEffects.push({ type: "shake", duration: 12, elapsed: 0, intensity: intensity * 1.5 });
}

// Electric particles — lightning bolts, sparks
export function spawnElectric(vfx: VFXState, cx: number, cy: number, intensity: number) {
  // Lightning sparks
  for (let i = 0; i < 8 + intensity * 12; i++) {
    const angle = rng(0, Math.PI * 2);
    vfx.particles.push({
      x: cx + rng(-15, 15), y: cy + rng(-15, 15),
      vx: Math.cos(angle) * rng(2, 6), vy: Math.sin(angle) * rng(2, 6),
      size: rng(2, 5 + intensity),
      life: 0, maxLife: rng(5, 15),
      color: pick(["#ffee00", "#ffff44", "#fff", "#ffdd00"]),
      alpha: 1, type: "spark",
      glow: true,
    });
  }
  // Bolt segments
  for (let i = 0; i < 3 + intensity * 2; i++) {
    vfx.particles.push({
      x: cx + rng(-40, 40), y: cy - 60 - rng(0, 40),
      vx: rng(-1, 1), vy: rng(8, 15),
      size: rng(2, 4),
      life: 0, maxLife: rng(8, 16),
      color: "#ffff88",
      alpha: 1, type: "slash",
      rotation: rng(-0.5, 0.5), glow: true,
    });
  }
  vfx.screenEffects.push({ type: "flash", duration: 3, elapsed: 0, intensity: 0.8, color: "#ffff0080" });
  vfx.screenEffects.push({ type: "flash", duration: 3, elapsed: 3, intensity: 0.5, color: "#ffff0060" });
  if (intensity >= 2) vfx.screenEffects.push({ type: "shake", duration: 10, elapsed: 0, intensity: intensity * 3 });
}

// Grass particles — leaves, vines, petals
export function spawnGrass(vfx: VFXState, cx: number, cy: number, intensity: number) {
  for (let i = 0; i < 10 + intensity * 12; i++) {
    vfx.particles.push({
      x: cx + rng(-30, 30), y: cy + rng(-20, 20),
      vx: rng(-2, 2), vy: rng(-3, 0),
      size: rng(3, 8 + intensity),
      life: 0, maxLife: rng(25, 50),
      color: pick(["#22aa22", "#44cc44", "#66ee44", "#88ff66", "#aaff88", "#ccffaa"]),
      alpha: 0.9, type: "rect",
      rotation: rng(0, Math.PI), rotSpeed: rng(-0.1, 0.1),
      gravity: 0.03, glow: intensity >= 3,
    });
  }
  // Petals / sparkles
  for (let i = 0; i < intensity * 5; i++) {
    vfx.particles.push({
      x: cx + rng(-40, 40), y: cy + rng(-30, 10),
      vx: rng(-1, 1), vy: rng(-1, 0.5),
      size: rng(2, 4),
      life: 0, maxLife: rng(30, 60),
      color: pick(["#ff88aa", "#ffaacc", "#ffccdd", "#fff"]),
      alpha: 0.8, type: "star",
      rotation: 0, rotSpeed: rng(-0.05, 0.05),
    });
  }
  vfx.screenEffects.push({ type: "flash", duration: 8, elapsed: 0, intensity: 0.15, color: "#22ff2230" });
}

// Normal / impact — shockwave, impact ring
export function spawnImpact(vfx: VFXState, cx: number, cy: number, intensity: number) {
  // Impact ring
  vfx.particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: 3, life: 0, maxLife: 20,
    color: "#fff",
    alpha: 0.8, type: "ring", glow: true,
  });
  // Debris
  for (let i = 0; i < 6 + intensity * 8; i++) {
    const angle = rng(0, Math.PI * 2);
    const speed = rng(2, 5 + intensity * 2);
    vfx.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rng(2, 5),
      life: 0, maxLife: rng(15, 30),
      color: pick(["#fff", "#ddd", "#ffcc44", "#ff8844"]),
      alpha: 1, type: "rect",
      rotation: rng(0, Math.PI), rotSpeed: rng(-0.2, 0.2),
      gravity: 0.1,
    });
  }
  vfx.screenEffects.push({ type: "shake", duration: 8 + intensity * 3, elapsed: 0, intensity: 3 + intensity * 2 });
  vfx.screenEffects.push({ type: "flash", duration: 4, elapsed: 0, intensity: 0.4, color: "#ffffff80" });
}

// Critical hit — extra burst
export function spawnCritical(vfx: VFXState, cx: number, cy: number) {
  // Big flash
  vfx.screenEffects.push({ type: "flash", duration: 6, elapsed: 0, intensity: 0.7, color: "#ffff0080" });
  vfx.screenEffects.push({ type: "shake", duration: 20, elapsed: 0, intensity: 8 });
  // Stars burst
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    vfx.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * 5, vy: Math.sin(angle) * 5,
      size: rng(4, 8), life: 0, maxLife: 25,
      color: pick(["#ffee00", "#ffcc00", "#fff"]),
      alpha: 1, type: "star",
      rotation: 0, rotSpeed: 0.15, glow: true, shrink: true,
    });
  }
}

// Super effective — screen tint + text
export function spawnSuperEffective(vfx: VFXState) {
  vfx.screenEffects.push({ type: "flash", duration: 15, elapsed: 0, intensity: 0.2, color: "#ff440020" });
  vfx.screenEffects.push({ type: "chromatic", duration: 20, elapsed: 0, intensity: 3 });
}

// ★5 Cutscene — fullscreen cinematic
export function startCutscene(vfx: VFXState, skillName: string, skillEmoji: string, element: string, starLevel: number, attackerName: string) {
  const elementColors: Record<string, string[]> = {
    fire: ["#ff4400", "#ff8800", "#ffcc00", "#fff8e0"],
    water: ["#0044aa", "#2288ff", "#66ccff", "#aaeeff"],
    electric: ["#aa8800", "#ffdd00", "#ffff44", "#fff"],
    grass: ["#005500", "#22aa22", "#66ee44", "#ccffaa"],
    normal: ["#444", "#888", "#ccc", "#fff"],
  };
  vfx.cutscene = {
    skillName, skillEmoji, element, starLevel, attackerName,
    phase: 0, elapsed: 0,
    duration: starLevel >= 5 ? 120 : starLevel >= 4 ? 80 : 50,
    colors: elementColors[element] || elementColors.normal,
  };
}

// ── Spawn by element + star ──
export function spawnSkillEffect(vfx: VFXState, element: string, starLevel: number, targetX: number, targetY: number, skillName: string, skillEmoji: string, attackerName: string, isCrit: boolean) {
  const intensity = starLevel;

  // ★4-5: fullscreen cutscene first
  if (starLevel >= 4) {
    startCutscene(vfx, skillName, skillEmoji, element, starLevel, attackerName);
  }

  switch (element) {
    case "fire": spawnFire(vfx, targetX, targetY, intensity); break;
    case "water": spawnWater(vfx, targetX, targetY, intensity); break;
    case "electric": spawnElectric(vfx, targetX, targetY, intensity); break;
    case "grass": spawnGrass(vfx, targetX, targetY, intensity); break;
    default: spawnImpact(vfx, targetX, targetY, intensity); break;
  }

  if (isCrit) spawnCritical(vfx, targetX, targetY);
}

// ── Update VFX each frame ──
export function updateVFX(vfx: VFXState, dt: number) {
  // Update particles
  for (let i = vfx.particles.length - 1; i >= 0; i--) {
    const p = vfx.particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) { vfx.particles.splice(i, 1); continue; }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity) p.vy += p.gravity * dt;
    if (p.rotSpeed && p.rotation !== undefined) p.rotation += p.rotSpeed * dt;

    const lifeRatio = p.life / p.maxLife;
    p.alpha = 1 - lifeRatio;
    if (p.shrink) p.size *= (1 - dt * 0.02);
  }

  // Update screen effects
  for (let i = vfx.screenEffects.length - 1; i >= 0; i--) {
    vfx.screenEffects[i].elapsed += dt;
    if (vfx.screenEffects[i].elapsed >= vfx.screenEffects[i].duration) {
      vfx.screenEffects.splice(i, 1);
    }
  }

  // Update cutscene
  if (vfx.cutscene) {
    vfx.cutscene.elapsed += dt;
    const t = vfx.cutscene.elapsed / vfx.cutscene.duration;
    if (t < 0.2) vfx.cutscene.phase = 0;
    else if (t < 0.45) vfx.cutscene.phase = 1;
    else if (t < 0.8) vfx.cutscene.phase = 2;
    else vfx.cutscene.phase = 3;
    if (vfx.cutscene.elapsed >= vfx.cutscene.duration) vfx.cutscene = null;
  }
}

// ── Render VFX to canvas ──
export function renderVFX(ctx: CanvasRenderingContext2D, vfx: VFXState, width: number, height: number) {
  ctx.save();

  // Screen effects
  for (const fx of vfx.screenEffects) {
    const t = fx.elapsed / fx.duration;
    const ease = 1 - t;

    switch (fx.type) {
      case "shake": {
        const dx = (Math.random() - 0.5) * fx.intensity * ease;
        const dy = (Math.random() - 0.5) * fx.intensity * ease;
        ctx.translate(dx, dy);
        break;
      }
      case "flash": {
        ctx.fillStyle = fx.color || `rgba(255,255,255,${fx.intensity * ease})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }
      case "darken": {
        ctx.fillStyle = `rgba(0,0,0,${fx.intensity * ease * 0.5})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }
    }
  }

  // Particles
  for (const p of vfx.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);

    if (p.glow) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.size * 2;
    }

    ctx.fillStyle = p.color;
    ctx.translate(p.x, p.y);
    if (p.rotation) ctx.rotate(p.rotation);

    switch (p.type) {
      case "circle":
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.5, p.size), 0, Math.PI * 2);
        ctx.fill();
        break;
      case "rect":
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        break;
      case "spark": {
        // Diamond shape
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.4, 0);
        ctx.lineTo(0, p.size);
        ctx.lineTo(-p.size * 0.4, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "ring": {
        const lifeRatio = p.life / p.maxLife;
        const radius = p.size + lifeRatio * 40;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.5, 3 * (1 - lifeRatio));
        ctx.globalAlpha *= (1 - lifeRatio);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "slash": {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-8, -12);
        ctx.lineTo(8, 12);
        ctx.stroke();
        break;
      }
      case "star": {
        const spikes = 4;
        const outerR = p.size;
        const innerR = p.size * 0.4;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
          const sx = Math.cos(angle) * r;
          const sy = Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  // Cutscene overlay
  if (vfx.cutscene) {
    renderCutscene(ctx, vfx.cutscene, width, height);
  }

  ctx.restore();
}

function renderCutscene(ctx: CanvasRenderingContext2D, cs: CutsceneState, w: number, h: number) {
  const t = cs.elapsed / cs.duration;
  const colors = cs.colors;

  switch (cs.phase) {
    case 0: { // Darken + zoom lines
      const p = cs.elapsed / (cs.duration * 0.2);
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, p * 0.7)})`;
      ctx.fillRect(0, 0, w, h);
      // Speed lines
      ctx.strokeStyle = `rgba(255,255,255,${p * 0.3})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const len = 40 + p * 80;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(angle) * 30, h / 2 + Math.sin(angle) * 20);
        ctx.lineTo(w / 2 + Math.cos(angle) * len, h / 2 + Math.sin(angle) * len * 0.7);
        ctx.stroke();
      }
      break;
    }
    case 1: { // Skill name flash
      const p = (cs.elapsed - cs.duration * 0.2) / (cs.duration * 0.25);
      // Dark overlay
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(0, 0, w, h);
      // Colored band
      const bandY = h * 0.35;
      const bandH = h * 0.3;
      const grad = ctx.createLinearGradient(0, bandY, w, bandY + bandH);
      grad.addColorStop(0, colors[0] + "00");
      grad.addColorStop(0.2, colors[0] + "cc");
      grad.addColorStop(0.5, colors[1] + "ff");
      grad.addColorStop(0.8, colors[0] + "cc");
      grad.addColorStop(1, colors[0] + "00");
      ctx.fillStyle = grad;
      ctx.fillRect(0, bandY, w, bandH);
      // Skill name
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.shadowColor = colors[1];
      ctx.shadowBlur = 20;
      ctx.font = `bold ${Math.min(24, w * 0.07)}px 'Space Grotesk', sans-serif`;
      const slideX = Math.min(1, p * 2);
      ctx.globalAlpha = Math.min(1, p * 3);
      ctx.fillText(cs.skillEmoji + " " + cs.skillName, w / 2 + (1 - slideX) * 100, h * 0.48);
      ctx.shadowBlur = 0;
      // Attacker name
      ctx.font = `${Math.min(12, w * 0.035)}px monospace`;
      ctx.fillStyle = colors[3] || "#ccc";
      ctx.globalAlpha = Math.min(1, p * 2);
      ctx.fillText(cs.attackerName + "'s", w / 2, h * 0.39);
      ctx.globalAlpha = 1;
      // Stars
      ctx.font = `${Math.min(14, w * 0.04)}px serif`;
      ctx.fillStyle = "#ffdd00";
      ctx.fillText("★".repeat(cs.starLevel), w / 2, h * 0.56);
      break;
    }
    case 2: { // Execute — flash out
      const p = (cs.elapsed - cs.duration * 0.45) / (cs.duration * 0.35);
      const flashP = Math.max(0, 1 - p * 2);
      if (flashP > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flashP * 0.8})`;
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }
    case 3: { // Fade out
      const p = (cs.elapsed - cs.duration * 0.8) / (cs.duration * 0.2);
      ctx.fillStyle = `rgba(0,0,0,${(1 - p) * 0.3})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }
  }
}

// ── Damage number popup ──
export interface DamagePopup {
  x: number; y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
  isCrit: boolean;
}

export function spawnDamageNumber(popups: DamagePopup[], x: number, y: number, damage: number, isCrit: boolean, isEffective: number) {
  const color = isCrit ? "#ffee00" : isEffective >= 2 ? "#ff4444" : isEffective <= 0.5 ? "#8888aa" : "#fff";
  const size = isCrit ? 22 : isEffective >= 2 ? 18 : 14;
  popups.push({
    x: x + (Math.random() - 0.5) * 20,
    y: y - 10,
    text: isCrit ? `${damage}!` : `${damage}`,
    color, size, isCrit,
    life: 0, maxLife: 40,
  });
  if (isEffective >= 2) {
    popups.push({
      x, y: y + 10,
      text: "Super Effective!",
      color: "#ff8844", size: 10, isCrit: false,
      life: 0, maxLife: 50,
    });
  }
}

export function updateDamagePopups(popups: DamagePopup[], dt: number) {
  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].life += dt;
    popups[i].y -= 0.8 * dt;
    if (popups[i].life >= popups[i].maxLife) popups.splice(i, 1);
  }
}

export function renderDamagePopups(ctx: CanvasRenderingContext2D, popups: DamagePopup[]) {
  for (const p of popups) {
    const t = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = t < 0.1 ? t * 10 : t > 0.7 ? (1 - t) / 0.3 : 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const scale = p.isCrit ? 1 + Math.sin(p.life * 0.3) * 0.1 : 1;
    ctx.font = `bold ${Math.round(p.size * scale)}px 'Space Grotesk', monospace`;
    // Outline
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 3;
    ctx.strokeText(p.text, p.x, p.y);
    // Fill
    ctx.fillStyle = p.color;
    if (p.isCrit) { ctx.shadowColor = "#ffee00"; ctx.shadowBlur = 10; }
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
  }
}

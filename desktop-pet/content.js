/**
 * MY AI PET — Content Script
 * Pet on supported webpages: walking, chatting, emotions, particles, evolution effects
 */

(async function () {
  const EXTENSION_HOST_ID = "myaipet-petclaw-root";
  const INSTANCE_KEY = "__myaipetPetclawInstanceV230";
  const PAGE_SUMMARY_MAX_CHARS = 1_500;
  const PAGE_SUMMARY_MAX_BYTES = 2_800;
  if (globalThis[INSTANCE_KEY]) return;
  // executeScript() and a newly registered persistent script can race on the
  // same document. The isolated-world marker closes that gap before any await.
  globalThis[INSTANCE_KEY] = true;
  const releaseInstance = () => {
    try { delete globalThis[INSTANCE_KEY]; } catch { globalThis[INSTANCE_KEY] = false; }
  };
  if (document.getElementById(EXTENSION_HOST_ID)) {
    releaseInstance();
    return;
  }

  // Skip on myaipet domains — landing already has its own Sparky companion.
  // Avoid rendering a second pet over the landing page's native companion.
  const host = location.hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "myaipet.ai" || host === "www.myaipet.ai" || host === "app.myaipet.ai") {
    releaseInstance();
    return;
  }

  const sitePolicy = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getSitePolicy", host }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ enabled: false, paused: false });
        return;
      }
      resolve(response || { enabled: false, paused: false });
    });
  });
  if (sitePolicy.enabled === false || sitePolicy.paused === true || sitePolicy.authorized !== true) {
    releaseInstance();
    return;
  }

  // ── State ──
  let config = { petName: "Pet", petEmoji: "\uD83D\uDC3E", avatarUrl: "", level: 1, personality: "playful" };
  let emotions = { happiness: 70, energy: 60, hunger: 30, affection: 60, curiosity: 50 };
  let dominant = { emoji: "\uD83D\uDE0A", name: "Happy" };
  let evolution = { stage: 0, xp: 0 };
  let preferences = { particles: true, autoTalk: false, pageAwareness: false, sound: false };

  // ── Mascot (Dordor the pomeranian) — the default cute companion when there's
  // no paired-pet avatar. Pure SVG, rendered from our own trusted static markup
  // (parsed via DOMParser, never innerHTML of untrusted input), animated by the
  // CSS in styles.css. Expressions swap via the data-mood attribute.
  const MASCOT_SVG = `
<svg class="m-svg" data-mood="happy" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dordor">
  <ellipse cx="60" cy="112" rx="30" ry="6" fill="rgba(33,26,18,.12)"/>
  <g class="m-tail"><path d="M26 74 q-16 -6 -12 -22 q10 8 20 10 q-2 8 -8 12z" fill="#F0E4CB" stroke="#E4D2AC" stroke-width="1.5"/></g>
  <path d="M60 58 q26 0 30 26 q3 24 -30 26 q-33 2 -30 -26 q4 -26 30 -26z" fill="#FDF8EF" stroke="#E4D2AC" stroke-width="2"/>
  <ellipse cx="48" cy="108" rx="8" ry="6" fill="#FDF8EF" stroke="#E4D2AC" stroke-width="1.5"/>
  <ellipse cx="72" cy="108" rx="8" ry="6" fill="#FDF8EF" stroke="#E4D2AC" stroke-width="1.5"/>
  <g class="m-ear"><path d="M34 40 q-6 -20 10 -24 q6 14 4 26z" fill="#F0E4CB" stroke="#E4D2AC" stroke-width="2"/><path d="M40 38 q-2 -12 6 -18 q2 10 1 18z" fill="#E9B08A"/></g>
  <g class="m-ear r"><path d="M86 40 q6 -20 -10 -24 q-6 14 -4 26z" fill="#F0E4CB" stroke="#E4D2AC" stroke-width="2"/><path d="M80 38 q2 -12 -6 -18 q-2 10 -1 18z" fill="#E9B08A"/></g>
  <path d="M60 22 q13 0 18 8 q10 2 12 13 q9 5 6 16 q4 10 -6 15 q-3 11 -15 11 q-8 6 -15 0 q-12 0 -15 -11 q-10 -5 -6 -15 q-3 -11 6 -16 q2 -11 12 -13 q5 -8 18 -8z" fill="#FDF8EF" stroke="#E4D2AC" stroke-width="2.4"/>
  <ellipse cx="60" cy="70" rx="20" ry="15" fill="#FFFDF8"/>
  <path d="M40 30 q20 -12 40 0 q-4 6 -20 6 q-16 0 -20 -6z" fill="#F2C94C" stroke="#D9A82F" stroke-width="1.6"/>
  <rect x="52" y="18" width="16" height="12" rx="4" fill="#F2C94C" stroke="#D9A82F" stroke-width="1.6"/>
  <ellipse class="m-blush" cx="40" cy="66" rx="6" ry="4" fill="#F2A98C" opacity=".6"/>
  <ellipse class="m-blush" cx="80" cy="66" rx="6" ry="4" fill="#F2A98C" opacity=".6"/>
  <g><g class="m-eye-open"><ellipse cx="49" cy="56" rx="6.5" ry="7.5" fill="#241B12"/><circle cx="47" cy="53.5" r="2.2" fill="#fff"/><circle cx="51" cy="58" r="1" fill="#fff" opacity=".7"/></g><rect class="m-lid" x="42" y="48" width="14" height="9" rx="4" fill="#FDF8EF"/></g>
  <g><g class="m-eye-open"><ellipse cx="71" cy="56" rx="6.5" ry="7.5" fill="#241B12"/><circle cx="69" cy="53.5" r="2.2" fill="#fff"/><circle cx="73" cy="58" r="1" fill="#fff" opacity=".7"/></g><rect class="m-lid" x="64" y="48" width="14" height="9" rx="4" fill="#FDF8EF"/></g>
  <ellipse cx="60" cy="66" rx="3.4" ry="2.6" fill="#3A2A20"/>
  <path d="M60 68 q-4 5 -8 3 M60 68 q4 5 8 3" fill="none" stroke="#7A5A44" stroke-width="1.6" stroke-linecap="round"/>
  <path class="m-tongue" d="M56 71 q4 7 8 0 q-1 6 -4 6 q-3 0 -4 -6z" fill="#F27D8A"/>
  <ellipse class="m-mouth-o" cx="60" cy="73" rx="4" ry="3.4" fill="#7A3A34"/>
  <g class="m-spark" fill="#F2C94C"><path d="M92 40 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z"/><path d="M28 34 l1 2.6 2.6 1 -2.6 1 -1 2.6 -1 -2.6 -2.6 -1 2.6 -1z"/></g>
  <text class="m-z" x="90" y="40" fill="#9A7B4E" font-size="12" font-weight="800">z</text>
</svg>`;

  // App emotion name → mascot expression. Defaults to a happy face.
  function mascotMoodFor(name) {
    const n = String(name || "").toLowerCase();
    if (/sleep|tired|drows|rest/.test(n)) return "sleepy";
    if (/excit|play|happy joy|hyper|energ/.test(n)) return "excited";
    if (/listen|think|curio/.test(n)) return "listening";
    return "happy";
  }

  // Build the mascot node from the trusted static markup (SVG parse, not
  // innerHTML of any external string).
  function buildMascotNode(mood) {
    const doc = new DOMParser().parseFromString(MASCOT_SVG.trim(), "image/svg+xml");
    const svg = doc.documentElement;
    if (svg && svg.setAttribute) svg.setAttribute("data-mood", mascotMoodFor(mood) === mood ? mood : (mood || "happy"));
    return document.importNode(svg, true);
  }

  // Flash a temporary expression (reaction), then settle back to the mood
  // derived from the current dominant emotion.
  let mascotReactionTimer = null;
  function reactMascot(mood, ms = 1800) {
    const svg = shadowRoot && shadowRoot.querySelector(".m-svg");
    if (!svg) return;
    svg.setAttribute("data-mood", mood);
    if (mascotReactionTimer) clearTimeout(mascotReactionTimer);
    mascotReactionTimer = setTimeout(() => {
      const s = shadowRoot && shadowRoot.querySelector(".m-svg");
      if (s) s.setAttribute("data-mood", mascotMoodFor(dominant && dominant.name));
    }, ms);
  }

  // 2-D autonomous roaming: pick a target on screen, walk to it, pause, pick another.
  // The previous walk used fixed-duration random shuffles that
  // never covered much ground before flipping direction.
  let posX = window.innerWidth / 2;
  let posY = 0;                     // rendered height above bottom (px)
  let targetX = posX;
  let targetY = 0;                  // desired roam height the pet drifts toward
  let baseY = 0;                    // smoothed roam height (posY = baseY + hop bob)
  let direction = 1;
  let state = "idle";
  let walkSpeed = 2.4;               // base px/frame; modulated by energy
  let walkTimer = 0;
  let idleTimer = 0;
  let nextWalkDelay = randomBetween(1.0, 2.5); // shorter idle pauses
  let isDragging = false;
  let isHovered = false;          // mouse is over the pet → freeze it so you can grab/pet it
  let lastPatAt = 0;              // rate-limit affection so petting can't be farmed
  let lastTreatDropAt = 0;        // gap between treat-finds (delight pacing, not anti-farm — season is server-capped)
  let treatEl = null;             // the one on-screen treat, if any
  let dragOffsetX = 0;
  let bubbleTimeout = null;
  let particles = [];
  let hopPhase = 0;                  // animates a small bob while walking
  let lastActivityAt = Date.now();   // for sleep/wake idle detection
  let isAsleep = false;
  let pageCommented = false;         // page-aware comment shown once per page
  let petStreak = 0;
  let lastPageKey = "";
  let lastActivityReportAt = 0;

  const EVO_AURAS = [
    "", // egg - no aura
    "aipet-aura-baby",
    "aipet-aura-junior",
    "aipet-aura-teen",
    "aipet-aura-adult",
    "aipet-aura-legend",
  ];

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  // ── Build an isolated DOM ──
  // A closed shadow root prevents host-page JavaScript from reading chat input,
  // replies, and controls or dispatching events directly at those controls.
  const extensionHost = document.createElement("div");
  extensionHost.id = EXTENSION_HOST_ID;
  extensionHost.style.setProperty("all", "initial", "important");
  extensionHost.style.setProperty("position", "fixed", "important");
  extensionHost.style.setProperty("inset", "0", "important");
  extensionHost.style.setProperty("width", "0", "important");
  extensionHost.style.setProperty("height", "0", "important");
  extensionHost.style.setProperty("z-index", "2147483647", "important");
  extensionHost.style.setProperty("pointer-events", "none", "important");
  const shadowRoot = extensionHost.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  shadowRoot.appendChild(style);

  const container = document.createElement("div");
  container.id = "aipet-container";
  container.style.visibility = "hidden";

  container.innerHTML = `
    <div id="aipet-particles"></div>
    <div id="aipet-mood">\uD83D\uDE0A</div>
    <div id="aipet-body" role="button" tabindex="0" aria-label="Open PetClaw chat">
      <div id="aipet-emoji">\uD83D\uDC3E</div>
      <div id="aipet-name">Pet</div>
      <div id="aipet-level">Lv.1</div>
      <div id="aipet-evo-badge"></div>
    </div>
    <div id="aipet-emotion-bar">
      <div id="aipet-emotion-fill"></div>
    </div>
    <div id="aipet-bubble" class="hidden" role="status" aria-live="polite"></div>
    <div id="aipet-menu" class="hidden" role="menu" aria-label="PetClaw actions"></div>
  `;

  shadowRoot.appendChild(container);
  (document.body || document.documentElement).appendChild(extensionHost);

  let destroyed = false;
  let animationFrameId = null;
  const scheduledTimeouts = new Set();
  const scheduledIntervals = new Set();
  const eventCleanups = new Set();
  const runtimeListeners = new Set();

  function scheduleTimeout(callback, delay) {
    if (destroyed) return null;
    const id = globalThis.setTimeout(() => {
      scheduledTimeouts.delete(id);
      if (!destroyed) callback();
    }, delay);
    scheduledTimeouts.add(id);
    return id;
  }

  function cancelScheduledTimeout(id) {
    if (id == null) return;
    globalThis.clearTimeout(id);
    scheduledTimeouts.delete(id);
  }

  function scheduleInterval(callback, delay) {
    if (destroyed) return null;
    const id = globalThis.setInterval(() => {
      if (!destroyed) callback();
    }, delay);
    scheduledIntervals.add(id);
    return id;
  }

  function listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    // Descendants disappear with extensionHost. Only global targets need an
    // explicit teardown (and therefore a retained cleanup closure).
    const tracked = target === window || target === document;
    const cleanup = () => {
      target.removeEventListener(type, listener, options);
      if (tracked) eventCleanups.delete(cleanup);
    };
    if (tracked) eventCleanups.add(cleanup);
    return cleanup;
  }

  function listenRuntime(listener) {
    chrome.runtime.onMessage.addListener(listener);
    runtimeListeners.add(listener);
  }

  function scheduleFrame(callback) {
    if (destroyed) return null;
    animationFrameId = globalThis.requestAnimationFrame((now) => {
      animationFrameId = null;
      if (!destroyed) callback(now);
    });
    return animationFrameId;
  }

  function shutdown() {
    if (destroyed) return;
    destroyed = true;
    for (const id of scheduledTimeouts) globalThis.clearTimeout(id);
    for (const id of scheduledIntervals) globalThis.clearInterval(id);
    scheduledTimeouts.clear();
    scheduledIntervals.clear();
    if (animationFrameId != null) globalThis.cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    for (const cleanup of eventCleanups) cleanup();
    eventCleanups.clear();
    for (const listener of runtimeListeners) chrome.runtime.onMessage.removeListener(listener);
    runtimeListeners.clear();
    extensionHost.remove();
    releaseInstance();
  }

  fetch(chrome.runtime.getURL("styles.css"))
    .then((res) => {
      if (!res.ok) throw new Error(`stylesheet ${res.status}`);
      return res.text();
    })
    .then((css) => { if (!destroyed) style.textContent = css; })
    .catch((err) => { if (!destroyed) console.error("[AI Pet] Could not load isolated styles:", err.message); })
    .finally(() => { if (!destroyed) container.style.visibility = ""; });

  const body = shadowRoot.getElementById("aipet-body");
  const bubble = shadowRoot.getElementById("aipet-bubble");
  const menu = shadowRoot.getElementById("aipet-menu");
  const moodEl = shadowRoot.getElementById("aipet-mood");
  const emojiEl = shadowRoot.getElementById("aipet-emoji");
  const nameEl = shadowRoot.getElementById("aipet-name");
  const levelEl = shadowRoot.getElementById("aipet-level");
  const evoBadge = shadowRoot.getElementById("aipet-evo-badge");
  const emotionBarFill = shadowRoot.getElementById("aipet-emotion-fill");
  const particlesContainer = shadowRoot.getElementById("aipet-particles");

  // ── Load full state ──
  chrome.runtime.sendMessage({ type: "getFullState" }, (res) => {
    if (destroyed || !res) return;
    if (res.config) {
      config = res.config;
      preferences = { ...preferences, ...(config.preferences || {}) };
      updateAppearance();
    }
    if (res.emotions) emotions = res.emotions;
    if (res.dominant) {
      dominant = res.dominant;
      moodEl.textContent = dominant.emoji;
      // Keep the mascot face in sync with the pet's dominant emotion.
      const mSvg = shadowRoot.querySelector(".m-svg");
      if (mSvg && !mascotReactionTimer) mSvg.setAttribute("data-mood", mascotMoodFor(dominant.name));
    }
    if (res.evolution) {
      evolution = res.evolution;
      updateEvolutionVisuals();
    }
    // Streak counter for return-trip messages
    chrome.runtime.sendMessage({ type: "tickStreak" }, (sres) => {
      if (sres?.streak) {
        petStreak = sres.streak;
        if (sres.justIncremented && sres.streak >= 2) {
          scheduleTimeout(() => showBubble(`Day ${sres.streak} together! 🔥`, 5500), 800);
        }
      }
    });
    // Page-aware reaction — fires once after state is loaded
    scheduleTimeout(reactToPage, 1500);
  });

  function updateAppearance() {
    // SCRUM-49/53/55: never innerHTML untrusted strings; use DOM API + scheme check
    emojiEl.replaceChildren();
    let safeUrl = "";
    if (config.avatarUrl) {
      if (/^data:image\/(?:jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(config.avatarUrl)) {
        safeUrl = config.avatarUrl;
      } else {
        try {
          const u = new URL(config.avatarUrl);
          if (u.protocol === "https:" || u.protocol === "http:") safeUrl = config.avatarUrl;
        } catch {}
      }
    }
    if (safeUrl) {
      emojiEl.classList.remove("aipet-has-mascot");
      const img = document.createElement("img");
      img.id = "aipet-avatar";
      img.src = safeUrl;
      img.referrerPolicy = "no-referrer";
      img.alt = String(config.petName || "pet");
      emojiEl.appendChild(img);
    } else {
      // No paired-pet avatar → the cute Dordor mascot is the companion.
      emojiEl.classList.add("aipet-has-mascot");
      emojiEl.appendChild(buildMascotNode(mascotMoodFor(dominant && dominant.name)));
    }
    nameEl.textContent = config.petName;
    levelEl.textContent = `Lv.${config.level}`;
    body.setAttribute("aria-label", `Open chat with ${config.petName || "PetClaw"}`);
  }

  function updateEvolutionVisuals() {
    // Remove old auras
    EVO_AURAS.forEach((a) => { if (a) body.classList.remove(a); });

    // Add new aura
    const aura = EVO_AURAS[evolution.stage];
    if (aura) body.classList.add(aura);

    // Badge
    const stageIcons = ["\uD83E\uDD5A", "\uD83D\uDC23", "\uD83D\uDC3E", "\u26A1", "\uD83D\uDD25", "\uD83D\uDC51"];
    evoBadge.textContent = stageIcons[evolution.stage] || "";
    evoBadge.style.display = evolution.stage > 0 ? "block" : "none";
  }

  function updateEmotionBar() {
    const avg = (emotions.happiness + emotions.energy + (100 - emotions.hunger) + emotions.affection) / 4;
    emotionBarFill.style.width = avg + "%";

    if (avg > 70) emotionBarFill.style.background = "linear-gradient(90deg, #E8C77E, #C8932F)";
    else if (avg > 40) emotionBarFill.style.background = "linear-gradient(90deg, #C8932F, #BE4F28)";
    else emotionBarFill.style.background = "linear-gradient(90deg, #BE4F28, #9A3E1E)";
  }

  updateEmotionBar();

  // ── Position ──
  // posY > 0 = hop above the bottom edge.
  function updatePosition() {
    container.style.left = posX + "px";
    container.style.bottom = posY + "px";
    container.style.transform = "translateX(-50%)";
  }
  updatePosition();

  // ── Walking (target-based, autonomous) ──
  function pickTarget() {
    const margin = 60;
    const w = Math.max(200, window.innerWidth - margin * 2);
    // Bias toward distant targets so the pet covers ground, not just shuffles.
    // 70% pick a destination ≥ 25% of screen width away from current spot.
    let dest;
    if (Math.random() < 0.7) {
      const minDist = w * 0.25;
      let tries = 0;
      do {
        dest = margin + Math.random() * w;
        tries++;
      } while (Math.abs(dest - posX) < minDist && tries < 6);
    } else {
      dest = margin + Math.random() * w;
    }
    return Math.round(dest);
  }

  // Vertical roam target — so the pet drifts to varied heights instead of being
  // stuck along the bottom edge. Mostly low-ish, sometimes floats well up.
  function pickTargetY() {
    const maxY = Math.min(Math.round(window.innerHeight * 0.55), 380);
    return Math.random() < 0.4 ? Math.round(Math.random() * 70) : Math.round(Math.random() * maxY);
  }

  function startWalking() {
    if (emotions.energy < 10) return; // too tired
    state = "walking";
    targetX = pickTarget();
    targetY = pickTargetY();
    direction = targetX > posX ? 1 : -1;
    // Faster, more responsive to energy
    walkSpeed = 1.5 + (emotions.energy / 100) * 2.5;
    body.classList.add("walking");
    body.classList.toggle("walking-left", direction === -1);
    // Long enough to plausibly reach the target — fail-safe stop if we overshoot
    walkTimer = randomBetween(4, 9);
    // 30% chance to "explore" with a few hops along the way
    if (Math.random() < 0.3) hopPhase = 0.001; else hopPhase = 0;
  }

  function stopWalking() {
    state = "idle";
    body.classList.remove("walking", "walking-left");
    hopPhase = 0;
    targetY = baseY;   // rest perched at the current roam height (not yanked to the bottom)
    // Short pauses so the pet keeps moving and exploring
    nextWalkDelay = randomBetween(1.0, 2.5);
  }

  // ── Markdown cleaner ──
  function cleanResponse(text) {
    return String(text == null ? "" : text)
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,3}\s/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\n{2,}/g, " ")
      .replace(/- /g, "")
      .trim();
  }

  // ── Particles ──
  function spawnParticle(emoji, x, y) {
    if (!preferences.particles) return;
    const p = document.createElement("div");
    p.className = "aipet-particle";
    p.textContent = emoji;
    p.style.left = (x || 40) + "px";
    p.style.top = (y || 0) + "px";
    p.style.setProperty("--dx", (Math.random() - 0.5) * 60 + "px");
    p.style.setProperty("--dy", -(30 + Math.random() * 40) + "px");
    particlesContainer.appendChild(p);
    scheduleTimeout(() => p.remove(), 1000);
  }

  function burstParticles(emojis, count = 5) {
    for (let i = 0; i < count; i++) {
      scheduleTimeout(() => {
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        spawnParticle(emoji, 30 + Math.random() * 20, -10 - Math.random() * 20);
      }, i * 80);
    }
  }

  // ── Treat find ──
  // Every so often the walking pet notices a little treat on the ground and stops
  // by it. Click it to collect: a warm reaction + a small ambient-care point that
  // (when signed in) syncs to your season score — server-capped, so it can't be
  // farmed by lingering. Low-frequency & optional (respects the particles pref).
  function dropTreat() {
    if (treatEl || !preferences.particles) return;   // one at a time; honor effects pref
    const kind = Math.random() < 0.5 ? "🪙" : "🍪";
    const el = document.createElement("button");
    el.type = "button";
    el.setAttribute("aria-label", `Collect ${kind === "🪙" ? "coin" : "treat"}`);
    el.className = "aipet-treat";
    el.textContent = kind;
    el.style.left = Math.round(posX - 15) + "px";     // posX is the pet's centre
    el.style.bottom = Math.max(4, Math.round(posY)) + "px";
    const collect = (ev) => {
      if (!ev.isTrusted) return;
      ev.stopPropagation();
      if (treatEl !== el) return;
      el.removeEventListener("click", collect);
      el.classList.add("aipet-treat-gone");
      scheduleTimeout(() => el.remove(), 260);
      treatEl = null;
      burstParticles(["✨", kind], 5);
      showBubble("+1 — nice catch! 🐾", 2200);
      chrome.runtime.sendMessage({ type: "treat", reason: "collect_treat" }, () => {});
    };
    listen(el, "click", collect);
    shadowRoot.appendChild(el);
    treatEl = el;
    showBubble("ooh, a treat! 👀", 1800);
    // Uncollected treats don't linger — fade after ~25s.
    scheduleTimeout(() => {
      if (treatEl === el) {
        el.classList.add("aipet-treat-gone");
        scheduleTimeout(() => el.remove(), 260);
        treatEl = null;
      }
    }, 25000);
  }

  // ── Speech Bubble ──
  function showBubble(text, duration = 5000) {
    if (bubbleTimeout) cancelScheduledTimeout(bubbleTimeout);
    bubble.classList.remove("hidden");
    bubble.removeAttribute("aria-label");
    bubble.textContent = cleanResponse(text);
    menu.classList.add("hidden");
    bubbleTimeout = scheduleTimeout(() => {
      bubble.classList.add("hidden");
      state = "idle";
    }, duration);
  }

  // ── Page-aware contextual reactions ──
  // Inspects document.title + h1 LOCALLY (never sent to server) and picks a
  // light comment matching the page topic. Designed to be the "magic moment"
  // that makes general users go "whoa, it noticed".
  const PAGE_REACTIONS = [
    { match: /youtube\.com|video|watch/i,           lines: ["Watch party? 🎬", "Got popcorn? 🍿", "What are we watching?"] },
    { match: /github\.com|gitlab|stackoverflow|coding|programming|javascript|typescript|python/i,
                                                          lines: ["Coding time! 💻", "Push it, ship it 🚀", "Comments are for the weak (kidding!)"] },
    { match: /wikipedia|encyclopedia|wiki/i,             lines: ["Ooh, facts! 🤓", "Teach me too!", "Down the rabbit hole 🐰"] },
    { match: /twitter\.com|x\.com|threads|reddit/i,      lines: ["Don't doomscroll too long 🌊", "Touch grass after? 🌿", "Anything good today?"] },
    { match: /amazon|shopping|cart|store|aliexpress/i, lines: ["Treat yourself 🛒", "Add to cart, you deserve it", "Show me what you got!"] },
    { match: /spotify|music|soundcloud|apple\.com\/music/i, lines: ["Dance with me? 🎵", "What's the vibe?", "Bops only 🔊"] },
    { match: /news|breaking|cnn|nytimes|reuters/i,  lines: ["What's happening out there?", "Heavy stuff... take a breath", "Stay informed, stay sane"] },
    { match: /tutorial|how to|guide|docs|documentation/i, lines: ["Learning something new? 📚", "RTFM mode 👍", "Ooh ooh, what is it?"] },
    { match: /gmail|outlook|mail/i,                       lines: ["Inbox zero? 📬", "One email at a time 🐌"] },
    { match: /linkedin|recruiter|job|career/i,            lines: ["Career mode 💼", "Update that resume!"] },
    { match: /chatgpt|claude|ai|llm/i,                    lines: ["Hi other AI 👋", "Don't replace me okay?", "Are they nice to you?"] },
    { match: /notion|obsidian|note/i,                     lines: ["Brain dumping? 🧠", "Note that down!"] },
    { match: /figma|sketch|design/i,                      lines: ["Design eyes on 👁", "Pixel pushing 🎨"] },
    { match: /\.ai\/|openai|anthropic/i,                  lines: ["AI tools, my favorite 🤖", "What are you building?"] },
  ];

  function getPageTopic() {
    const title = (document.title || "").slice(0, 200);
    const h1 = document.querySelector("h1")?.textContent?.slice(0, 100) || "";
    return (title + " " + h1 + " " + location.hostname).toLowerCase();
  }

  function reactToPage() {
    // Reading even a local title/H1 is opt-in. Page summaries have a separate,
    // per-use consent and preview flow below.
    if (preferences.pageAwareness !== true) return;
    if (pageCommented) return;
    pageCommented = true;
    const topic = getPageTopic();
    for (const r of PAGE_REACTIONS) {
      if (r.match.test(topic)) {
        const phrase = r.lines[Math.floor(Math.random() * r.lines.length)];
        scheduleTimeout(() => showBubble(phrase, 5000), 1800);
        return;
      }
    }
    // Generic greeting if no topic match (subtle, only sometimes)
    if (Math.random() < 0.35) {
      const generics = ["I'm here 🐾", "Hi friend", "Hanging out", "Whatcha doing?"];
      scheduleTimeout(() => showBubble(generics[Math.floor(Math.random() * generics.length)], 4000), 2500);
    }
  }

  // ── Idle / sleep / wake ──
  function recordActivity(event) {
    if (event && event.isTrusted === false) return;
    lastActivityAt = Date.now();
    if (Date.now() - lastActivityReportAt > 60_000) {
      lastActivityReportAt = Date.now();
      chrome.runtime.sendMessage({ type: "userActivity" }, () => {});
    }
    if (isAsleep) {
      isAsleep = false;
      body.classList.remove("aipet-sleeping");
      const streakHint = petStreak > 0 ? ` (day ${petStreak}!)` : "";
      showBubble("Welcome back! ✨" + streakHint, 4000);
    }
  }
  ["mousemove", "keydown", "scroll", "click"].forEach(ev =>
    listen(window, ev, recordActivity, { passive: true })
  );
  // Sleep check every 30s — fall asleep after 5min idle
  scheduleInterval(() => {
    const idleMs = Date.now() - lastActivityAt;
    if (!isAsleep && idleMs > 5 * 60 * 1000) {
      isAsleep = true;
      state = "sleeping";
      body.classList.add("aipet-sleeping");
      showBubble("zzz... 💤", 6000);
    }
  }, 30_000);

  // ── Tab visibility — pet acknowledges return ──
  let __welcomeHiddenAt = 0;
  listen(document, "visibilitychange", (event) => {
    if (!event.isTrusted) return;
    if (document.visibilityState === "hidden") { __welcomeHiddenAt = Date.now(); return; }
    if (document.visibilityState === "visible") {
      recordActivity(event);

      // Daily "welcome back" — a genuine greeting the first time you come back each
      // day, and only after a real absence (>2min) so quick tab-flips don't trigger
      // it. The BACKGROUND worker is the single arbiter of "first return today"
      // (prevents multi-tab double-fire); we celebrate only when it says welcomed.
      // The season grant is server-capped (ext_welcome ≈ once/day) on top of that.
      const awayMs = __welcomeHiddenAt ? Date.now() - __welcomeHiddenAt : 0;
      if (awayMs > 2 * 60 * 1000) {
        chrome.runtime.sendMessage({ type: "welcome", reason: "welcome_back_daily" }, (res) => {
          if (!res || !res.welcomed) return;
          body.classList.add("jumping");
          scheduleTimeout(() => body.classList.remove("jumping"), 600);
          burstParticles([(dominant && dominant.emoji) ? dominant.emoji : "🐾", "❤️"], 5);
          showBubble("welcome back 💕 +1", 2800);
        });
      }

      // Reset page-comment flag so a brand-new SPA navigation can trigger again
      if (preferences.pageAwareness === true) {
        const newKey = document.title;
        if (lastPageKey !== newKey) {
          lastPageKey = newKey;
          pageCommented = false;
          scheduleTimeout(reactToPage, 1200);
        }
      }
    }
  });

  function showTyping() {
    bubble.classList.remove("hidden");
    bubble.innerHTML = '<div class="aipet-typing"><span></span><span></span><span></span></div>';
    bubble.setAttribute("aria-label", "PetClaw is thinking");
  }

  function showChatInput(prefill = "") {
    bubble.classList.remove("hidden");
    bubble.replaceChildren();
    bubble.removeAttribute("aria-label");
    reactMascot("listening", 6000);
    const label = document.createElement("label");
    label.style.cssText = "font-size:11px;color:#999;margin-bottom:4px";
    label.textContent = `${dominant.emoji} ${config.petName} is listening...`;
    label.htmlFor = "aipet-chat-input";
    const input = document.createElement("input");
    input.id = "aipet-chat-input";
    input.type = "text";
    input.placeholder = "Say something...";
    input.maxLength = 1_000;
    input.autocomplete = "off";
    input.spellcheck = true;
    input.value = prefill;
    bubble.appendChild(label);
    bubble.appendChild(input);
    input.focus();
    listen(input, "keydown", (e) => {
      if (!e.isTrusted) return;
      if (e.key === "Enter" && input.value.trim()) {
        const msg = input.value.trim();
        showTyping();
        state = "chatting";
        chrome.runtime.sendMessage({ type: "chat", message: msg }, (res) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            showBubble("PetClaw is unavailable right now. Please try again.", 4000);
            return;
          }
          if (res?.reply) {
            showBubble(res.reply, 6000);
            body.classList.add("jumping");
            scheduleTimeout(() => body.classList.remove("jumping"), 500);
            burstParticles(["\u2728", "\uD83D\uDCAC", "\u2764\uFE0F"], 3);
          } else {
            showBubble("Hmm, I couldn't think of anything... \uD83D\uDE05", 3000);
          }
        });
      }
      if (e.key === "Escape") {
        bubble.classList.add("hidden");
        state = "idle";
      }
    });
  }

  // ── Agentic page action: explicit consent → preview → send ──
  // No title/body is read until Preview, and nothing is transmitted until a
  // second trusted click. The background uses the non-memory summarize-page
  // skill rather than companion-chat.
  function limitPageSummaryText(value) {
    const normalized = String(value || "").replace(/<\/?page_content/gi, "[page tag]").trim();
    const encoder = new TextEncoder();
    let output = "";
    let bytes = 0;
    let chars = 0;
    for (const char of normalized) {
      const charBytes = encoder.encode(char).byteLength;
      if (chars >= PAGE_SUMMARY_MAX_CHARS || bytes + charBytes > PAGE_SUMMARY_MAX_BYTES) break;
      output += char;
      bytes += charBytes;
      chars++;
    }
    return output;
  }

  function extractPageText() {
    const title = (document.title || "").slice(0, 200);
    const main = document.querySelector("main, article, [role='main']") || document.body;
    const text = limitPageSummaryText(((main && main.innerText) || "").replace(/\s+/g, " "));
    return { title, text };
  }

  function bubbleButton(label, secondary, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `aipet-consent-button${secondary ? " secondary" : ""}`;
    btn.textContent = label;
    listen(btn, "click", (event) => {
      if (!event.isTrusted) return;
      event.stopPropagation();
      onClick();
    });
    return btn;
  }

  function showPagePreview() {
    const { title, text } = extractPageText();
    if (!text) { showBubble("I can't quite read this page 😅", 3000); return; }

    bubble.replaceChildren();
    const notice = document.createElement("div");
    notice.className = "aipet-consent-copy";
    notice.textContent = `Preview (${text.length.toLocaleString()} chars): ${title || "Untitled page"}`;
    const preview = document.createElement("div");
    preview.className = "aipet-page-preview";
    preview.textContent = text;
    const actions = document.createElement("div");
    actions.className = "aipet-consent-actions";
    actions.append(
      bubbleButton("Send for summary", false, () => {
        showTyping();
        state = "chatting";
        chrome.runtime.sendMessage({ type: "summarizePage", title, text }, (res) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            showBubble("The summary service is unavailable right now.", 4000);
            return;
          }
          if (res?.reply) {
            showBubble(res.reply, 8000);
            burstParticles(["🔍", "💬", "✨"], 3);
          } else {
            showBubble(res?.error || "I couldn't summarize that page.", 4000);
          }
        });
      }),
      bubbleButton("Cancel", true, () => showBubble("Nothing was sent.", 1800)),
    );
    bubble.append(notice, preview, actions);
  }

  function askAboutPage() {
    if (!config.paired) {
      showBubble("Connect your pet in Settings before sharing a page for summary.", 5000);
      return;
    }
    if (bubbleTimeout) cancelScheduledTimeout(bubbleTimeout);
    state = "chatting";
    bubble.classList.remove("hidden");
    bubble.replaceChildren();
    const notice = document.createElement("div");
    notice.className = "aipet-consent-copy";
    notice.textContent = "Preview up to 1,500 characters from this page? The preview stays here. It is sent only if you approve again, and it is not saved to pet memory.";
    const actions = document.createElement("div");
    actions.className = "aipet-consent-actions";
    actions.append(
      bubbleButton("Preview", false, showPagePreview),
      bubbleButton("Cancel", true, () => showBubble("Nothing was read or sent.", 1800)),
    );
    bubble.append(notice, actions);
  }

  // ── Context Menu ──
  function showMenu() {
    menu.classList.remove("hidden");
    bubble.classList.add("hidden");

    menu.innerHTML = `
      <button type="button" role="menuitem" class="aipet-menu-item" data-action="chat"><span class="icon">\uD83D\uDCAC</span> Chat</button>
      <button type="button" role="menuitem" class="aipet-menu-item" data-action="page"><span class="icon">\uD83D\uDD0D</span> What's this page?</button>
      <button type="button" role="menuitem" class="aipet-menu-item" data-action="mood"><span class="icon">${dominant.emoji}</span> How are you?</button>
      <button type="button" role="menuitem" class="aipet-menu-item" data-action="feed"><span class="icon">\uD83C\uDF56</span> Feed</button>
      <button type="button" role="menuitem" class="aipet-menu-item" data-action="play"><span class="icon">\uD83C\uDFBE</span> Play</button>
      <button type="button" role="menuitem" class="aipet-menu-item" data-action="pet"><span class="icon">\uD83D\uDC95</span> Pet</button>
      <div class="aipet-menu-divider"></div>
      <button type="button" role="menuitem" class="aipet-menu-item" data-action="skills"><span class="icon">\u2728</span> Skills</button>
      <button type="button" role="menuitem" class="aipet-menu-item" data-action="selfie" disabled title="Coming soon"><span class="icon">\uD83D\uDCF8</span> Selfie — Coming soon</button>
      <button type="button" role="menuitem" class="aipet-menu-item" data-action="export"><span class="icon">\uD83D\uDCE6</span> Export SOUL</button>
      <div class="aipet-menu-divider"></div>
      <button type="button" role="menuitem" class="aipet-menu-item" data-action="sleep"><span class="icon">\uD83D\uDCA4</span> Sleep</button>
      <button type="button" role="menuitem" class="aipet-menu-item" data-action="hide"><span class="icon">\u23F8</span> Pause on this site</button>
    `;

    menu.querySelectorAll(".aipet-menu-item").forEach((btn) => {
      listen(btn, "click", (e) => {
        if (!e.isTrusted) return;
        const action = e.currentTarget.dataset.action;
        menu.classList.add("hidden");
        handleMenuAction(action);
      });
    });
    menu.querySelector(".aipet-menu-item:not(:disabled)")?.focus();
  }

  listen(menu, "keydown", (event) => {
    if (!event.isTrusted) return;
    const items = Array.from(menu.querySelectorAll(".aipet-menu-item:not(:disabled)"));
    const current = items.indexOf(shadowRoot.activeElement);
    let next = current;
    if (event.key === "ArrowDown") next = (current + 1 + items.length) % items.length;
    else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape") {
      menu.classList.add("hidden");
      body.focus();
      event.preventDefault();
      return;
    } else return;
    event.preventDefault();
    items[next]?.focus();
  });

  function handleMenuAction(action) {
    switch (action) {
      case "chat":
        showChatInput();
        break;

      case "page":
        askAboutPage();
        break;

      case "mood":
        showBubble(`${dominant.emoji} I'm feeling ${dominant.name.toLowerCase()}!`, 6000);
        burstParticles([dominant.emoji], 3);
        break;

      case "feed":
        chrome.runtime.sendMessage({ type: "emotionAction", action: "feed" }, (res) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError || !res?.emotions) {
            showBubble(res?.error || "I couldn't eat right now. Please try again.", 3000);
            return;
          }
          emotions = res.emotions;
          dominant = res.dominant;
          showBubble("\uD83C\uDF56 Yum yum! That was delicious!", 3000);
          burstParticles(["\uD83C\uDF56", "\uD83E\uDDB4", "\uD83C\uDF1F"], 5);
          reactMascot("excited");
          body.classList.add("jumping");
          scheduleTimeout(() => body.classList.remove("jumping"), 500);
          updateEmotionBar();
        });
        break;

      case "play":
        chrome.runtime.sendMessage({ type: "emotionAction", action: "play" }, (res) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError || !res?.emotions) {
            showBubble(res?.error || "I couldn't play right now. Please try again.", 3000);
            return;
          }
          emotions = res.emotions;
          dominant = res.dominant;
          showBubble("\uD83C\uDFBE Wheee! That was fun!", 3000);
          burstParticles(["\uD83C\uDFBE", "\u2B50", "\uD83C\uDF89"], 6);
          reactMascot("excited");
          body.classList.add("jumping");
          scheduleTimeout(() => body.classList.remove("jumping"), 500);
          updateEmotionBar();
        });
        break;

      case "pet":
        chrome.runtime.sendMessage({ type: "emotionAction", action: "pet" }, (res) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError || !res?.emotions) {
            showBubble(res?.error || "I couldn't respond right now. Please try again.", 3000);
            return;
          }
          emotions = res.emotions;
          dominant = res.dominant;
          showBubble("\uD83D\uDC95 Purrrr... I love you!", 3000);
          burstParticles(["\u2764\uFE0F", "\uD83D\uDC95", "\uD83E\uDE77", "\u2728"], 8);
          reactMascot("excited");
          body.classList.add("jumping");
          scheduleTimeout(() => body.classList.remove("jumping"), 500);
          updateEmotionBar();
        });
        break;

      case "selfie":
        showBubble("\uD83D\uDCF8 Selfies are coming soon.", 3000);
        break;

      case "skills":
        if (!config.paired) {
          showBubble("Pair your pet in extension Settings to load its installed skills.", 4000);
          break;
        }
        chrome.runtime.sendMessage({ type: "fetchSkills" }, (res) => {
          const runtimeError = chrome.runtime.lastError;
          if (Array.isArray(res?.data?.installed)) {
            const skillList = res.data.installed
              .map((s) => s.manifest || s)
              .filter(Boolean)
              .map((s) => `\u2728 ${s.name || s.skillId || s.id}`)
              .join(", ");
            showBubble(`My skills: ${skillList}`, 5000);
          } else {
            showBubble(runtimeError ? "Skills are unavailable right now." : "I couldn't load installed skills. Check your pairing in Settings.", 4000);
          }
        });
        break;

      case "export":
        if (!config.paired) {
          showBubble("Pair your pet in extension Settings before exporting SOUL data.", 4000);
          break;
        }
        showBubble("\uD83D\uDCE6 Exporting SOUL data...", 2000);
        chrome.runtime.sendMessage({ type: "exportSoul" }, (res) => {
          const runtimeError = chrome.runtime.lastError;
          if (res?.data) {
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const safeName = String(config.petName || "pet").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "pet";
            a.download = `${safeName}_SOUL.json`;
            shadowRoot.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showBubble("\u2705 SOUL exported! Your data, your rules.", 4000);
            burstParticles(["\uD83D\uDCE6", "\u2705"], 3);
          } else {
            showBubble(runtimeError ? "\u274C PetClaw is unavailable right now." : "\u274C Export failed. Check your pairing in Settings.", 3500);
          }
        });
        break;

      case "sleep":
        state = "sleeping";
        body.classList.add("sleeping");
        showBubble("Zzz... \uD83D\uDCA4", 3000);
        burstParticles(["\uD83D\uDCA4", "\u2728", "\uD83C\uDF19"], 4);
        scheduleTimeout(() => {
          body.classList.remove("sleeping");
          state = "idle";
          showBubble("*yawn* That was a nice nap! \uD83D\uDE0A", 3000);
        }, 15000);
        break;

      case "hide":
        chrome.runtime.sendMessage({ type: "pauseCurrentSite", host }, (res) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError || !res?.success) {
            showBubble("I couldn't pause this site.", 2500);
            return;
          }
          container.classList.add("aipet-hiding");
          scheduleTimeout(shutdown, 500);
        });
        break;
    }
  }

  // ── Events ──
  listen(body, "click", (e) => {
    if (!e.isTrusted) return;
    if (isDragging) return;
    if (state === "chatting") return;
    showChatInput();
    burstParticles(["\u2728"], 2);
  });

  listen(body, "keydown", (event) => {
    if (!event.isTrusted) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (state !== "chatting") showChatInput();
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      showMenu();
      return;
    }
    if (event.key === "Escape") {
      bubble.classList.add("hidden");
      menu.classList.add("hidden");
      state = "idle";
    }
  });

  listen(body, "contextmenu", (e) => {
    if (!e.isTrusted) return;
    e.preventDefault();
    e.stopPropagation();
    showMenu();
  });

  // Drag
  listen(body, "mousedown", (e) => {
    if (!e.isTrusted) return;
    if (e.button !== 0) return;
    isDragging = false;
    dragOffsetX = e.clientX - posX;
    const startX = e.clientX;
    let removeMove = () => {};
    let removeUp = () => {};

    function onMove(ev) {
      if (!ev.isTrusted) return;
      if (Math.abs(ev.clientX - startX) > 5) isDragging = true;
      posX = ev.clientX - dragOffsetX;
      posX = Math.max(40, Math.min(window.innerWidth - 40, posX));
      updatePosition();
    }

    function onUp(ev) {
      if (!ev.isTrusted) return;
      removeMove();
      removeUp();
      if (isDragging) patAffection(); // a click opens chat; only a real drag counts as a pat
      scheduleTimeout(() => { isDragging = false; }, 50);
    }

    removeMove = listen(document, "mousemove", onMove);
    removeUp = listen(document, "mouseup", onUp);
  });

  // ── Hover = FREEZE so you can actually catch it (it used to walk away too fast
  //    to grab). Cursor turns to a grab hand; a tiny scale says "catchable". ──
  listen(body, "mouseenter", () => {
    isHovered = true;
    body.classList.add("grabbable");
  });
  listen(body, "mouseleave", () => {
    isHovered = false;
    body.classList.remove("grabbable");
  });

  // ── Catch it → earn affection: grabbing the pet (mousedown → release) pats it,
  //    giving a happy reaction + a rate-limited affection point (anti-farm). Fired
  //    from the drag's onUp so it never collides with single-click (=chat). ──
  function patAffection() {
    body.classList.add("jumping");
    scheduleTimeout(() => body.classList.remove("jumping"), 500);
    const now = Date.now();
    // one affection point at most every 90s — the cap keeps it non-farmable
    if (now - lastPatAt > 90000) {
      lastPatAt = now;
      // Mood-aware care: a down pet (Sad / Lonely / low happiness) especially
      // needs you, so petting gives a warmer LOCAL reaction + point. The SEASON
      // grant stays flat + server-capped — the bonus is a feeling, not farming.
      const isDown =
        (dominant && (dominant.name === "Sad" || dominant.name === "Lonely")) ||
        (emotions && (
          (typeof emotions.happiness === "number" && emotions.happiness < 30) ||
          (typeof emotions.affection === "number" && emotions.affection < 25)
        ));
      const moodBonus = isDown ? 1.5 : 1;
      burstParticles(["❤️"], isDown ? 6 : 3);
      showBubble(isDown ? "❤️ thanks — I needed that" : "❤️ +1", 1500);
      // Local points + (when signed in) synced to the account's season score by
      // the background worker — points are non-financial, capped.
      chrome.runtime.sendMessage({ type: "affection", reason: "pet_the_walker", moodBonus }, () => {});
    } else {
      burstParticles(["❤️"], 1);
    }
  }

  // Double-click = pet (full care action)
  listen(body, "dblclick", (event) => {
    if (!event.isTrusted) return;
    handleMenuAction("pet");
  });

  // Click outside
  listen(document, "click", (e) => {
    if (!e.isTrusted) return;
    if (!e.composedPath().includes(extensionHost)) {
      bubble.classList.add("hidden");
      menu.classList.add("hidden");
    }
  });

  // ── Messages from background ──
  listenRuntime((msg) => {
    if (msg.type === "autoTalk" && state !== "chatting" && state !== "sleeping") {
      chrome.runtime.sendMessage({ type: "autonomousMessage" }, (res) => {
        if (res?.message) {
          showBubble(res.message, 6000);
          body.classList.add("jumping");
          scheduleTimeout(() => body.classList.remove("jumping"), 500);
          burstParticles([dominant.emoji, "\uD83D\uDCAC"], 2);
        }
      });
    }

    if (msg.type === "emotionUpdate") {
      if (msg.emotions) emotions = msg.emotions;
      if (msg.dominant) {
        dominant = msg.dominant;
        moodEl.textContent = dominant.emoji;
      }
      updateEmotionBar();
    }

    if (msg.type === "evolved") {
      evolution.stage = msg.stage;
      updateEvolutionVisuals();
      showBubble(`\uD83C\uDF89 I evolved into ${msg.name}! ${msg.icon}`, 8000);
      burstParticles([msg.icon, "\uD83C\uDF89", "\u2728", "\uD83C\uDF1F", "\uD83D\uDCAB"], 15);
      body.classList.add("aipet-evolving");
      scheduleTimeout(() => body.classList.remove("aipet-evolving"), 3000);
    }

    if (msg.type === "prefChange") {
      preferences[msg.key] = msg.value;
    }

    if (msg.type === "disableForSite" && (msg.host === host || msg.all === true)) {
      shutdown();
    }
  });

  // ── Ambient particles ──
  function ambientParticles() {
    if (!preferences.particles) return;
    if (state === "sleeping") return;

    const ambientEmojis = {
      0: [], // egg
      1: ["\u2728"],
      2: ["\u2728", "\uD83C\uDF3F"],
      3: ["\u2728", "\u26A1", "\uD83D\uDCAB"],
      4: ["\u2728", "\uD83D\uDD25", "\uD83D\uDCAB", "\u2B50"],
      5: ["\u2728", "\uD83D\uDC51", "\uD83D\uDCAB", "\uD83C\uDF1F", "\uD83D\uDD25"],
    };

    const emojis = ambientEmojis[evolution.stage] || [];
    if (emojis.length > 0 && Math.random() < 0.3) {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      spawnParticle(emoji, Math.random() * 60 + 10, -Math.random() * 30);
    }
  }

  scheduleInterval(ambientParticles, 2000);

  // ── Main Loop ──
  let lastTime = performance.now();

  function gameLoop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (state === "idle") {
      idleTimer += dt;
      if (idleTimer >= nextWalkDelay) {
        idleTimer = 0;
        startWalking();
      }
    }

    if (state === "walking") {
      // Freeze while the cursor is over it (or you're holding it) so it's catchable.
      if (isHovered || isDragging) { updatePosition(); return scheduleFrame(gameLoop); }
      posX += direction * walkSpeed;

      // Edge bounce — keeps pet on screen if window resized mid-walk
      if (posX <= 50) { posX = 50; direction = 1; body.classList.remove("walking-left"); targetX = pickTarget(); }
      if (posX >= window.innerWidth - 50) { posX = window.innerWidth - 50; direction = -1; body.classList.add("walking-left"); targetX = pickTarget(); }

      // Arrived at target → pick a new one and keep going (rather than stop)
      const arrived = (direction === 1 && posX >= targetX) || (direction === -1 && posX <= targetX);
      if (arrived) {
        // Sometimes the pet spots a treat where it arrives. Paced for delight
        // (≥12min gap, 14% per arrival) — season points from it are server-capped.
        const tnow = Date.now();
        if (!treatEl && Math.random() < 0.14 && (tnow - lastTreatDropAt) > 12 * 60 * 1000) {
          lastTreatDropAt = tnow;
          dropTreat();
        }
        // 60% pick a new target and keep walking, 40% stop and rest
        if (Math.random() < 0.6) {
          targetX = pickTarget();
          targetY = pickTargetY();
          direction = targetX > posX ? 1 : -1;
          body.classList.toggle("walking-left", direction === -1);
        } else {
          stopWalking();
          return scheduleFrame(gameLoop);
        }
      }

      // Vertical roaming: smoothly drift toward the roam height so the pet
      // explores the whole screen, not just the bottom edge — plus a small
      // walk bob on top.
      baseY += (targetY - baseY) * Math.min(1, dt * 1.8);
      let bob = 0;
      if (hopPhase > 0) {
        hopPhase += dt * 4;
        bob = Math.max(0, Math.sin(hopPhase) * 12);
        if (hopPhase > Math.PI * 2 * 4) hopPhase = 0.001;
      }
      posY = Math.max(0, baseY + bob);

      updatePosition();
      walkTimer -= dt;
      if (walkTimer <= 0) stopWalking();
    }

    // Mood updates from emotion state
    moodEl.textContent = dominant.emoji;

    scheduleFrame(gameLoop);
  }

  scheduleFrame(gameLoop);

  // ── Periodic emotion sync ──
  scheduleInterval(() => {
    chrome.runtime.sendMessage({ type: "getEmotions" }, (res) => {
      if (!res) return;
      if (res.emotions) emotions = res.emotions;
      if (res.dominant) dominant = res.dominant;
      updateEmotionBar();
    });
  }, 30000);

  // ── Evolution sync ──
  scheduleInterval(() => {
    chrome.runtime.sendMessage({ type: "getEvolution" }, (res) => {
      if (!res) return;
      const oldStage = evolution.stage;
      evolution = res.evolution || evolution;
      if (evolution.stage !== oldStage) updateEvolutionVisuals();
    });
  }, 60000);

  // ── Quest completion handler ──
  listenRuntime((msg) => {
    if (msg.type === "questComplete") {
      showBubble("✅ Quest complete! Check the popup!", 5000);
      burstParticles(["✅", "🎉", "⭐"], 6);
      body.classList.add("jumping");
      scheduleTimeout(() => body.classList.remove("jumping"), 500);
    }
  });

  // ── Keyboard shortcut: Ctrl+Shift+P = toggle pet visibility ──
  listen(document, "keydown", (e) => {
    if (!e.isTrusted) return;
    if (e.ctrlKey && e.shiftKey && e.key === "P") {
      e.preventDefault();
      if (container.style.display === "none") {
        container.style.display = "";
        showBubble("I'm back! 🐾", 2000);
      } else {
        container.style.display = "none";
      }
    }
  });

})();

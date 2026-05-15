/**
 * MY AI PET v2.0 — Content Script
 * Pet on every webpage: walking, chatting, emotions, particles, evolution effects
 */

(function () {
  if (document.getElementById("aipet-container")) return;

  // Skip on myaipet domains — landing already has its own Sparky companion.
  // "왜 2마리야" report: extension overlapped with landing's native pet.
  const host = location.hostname;
  if (host === "myaipet.ai" || host === "www.myaipet.ai" || host === "app.myaipet.ai") {
    return;
  }

  // ── State ──
  let config = { petName: "Pet", petEmoji: "\uD83D\uDC3E", avatarUrl: "", level: 1, personality: "playful" };
  let emotions = { happiness: 70, energy: 60, hunger: 30, affection: 60, curiosity: 50 };
  let dominant = { emoji: "\uD83D\uDE0A", name: "Happy" };
  let evolution = { stage: 0, xp: 0 };
  let preferences = { particles: true, autoTalk: true, sound: false };

  // 2-D autonomous roaming: pick a target on screen, walk to it, pause, pick another.
  // "주변만 맴도는" report — previous walk used fixed-duration random shuffles that
  // never covered much ground before flipping direction.
  let posX = window.innerWidth / 2;
  let posY = 0;                     // hop height above bottom (px)
  let targetX = posX;
  let targetY = 0;
  let direction = 1;
  let state = "idle";
  let walkSpeed = 2.4;               // base px/frame; modulated by energy
  let walkTimer = 0;
  let idleTimer = 0;
  let nextWalkDelay = randomBetween(1.0, 2.5); // shorter idle pauses
  let isDragging = false;
  let dragOffsetX = 0;
  let bubbleTimeout = null;
  let particles = [];
  let hopPhase = 0;                  // animates a small bob while walking

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

  // ── Build DOM ──
  const container = document.createElement("div");
  container.id = "aipet-container";

  container.innerHTML = `
    <div id="aipet-particles"></div>
    <div id="aipet-mood">\uD83D\uDE0A</div>
    <div id="aipet-body">
      <div id="aipet-emoji">\uD83D\uDC3E</div>
      <div id="aipet-name">Pet</div>
      <div id="aipet-level">Lv.1</div>
      <div id="aipet-evo-badge"></div>
    </div>
    <div id="aipet-emotion-bar">
      <div id="aipet-emotion-fill"></div>
    </div>
    <div id="aipet-bubble" class="hidden"></div>
    <div id="aipet-menu" class="hidden"></div>
  `;

  document.body.appendChild(container);

  const body = document.getElementById("aipet-body");
  const bubble = document.getElementById("aipet-bubble");
  const menu = document.getElementById("aipet-menu");
  const moodEl = document.getElementById("aipet-mood");
  const emojiEl = document.getElementById("aipet-emoji");
  const nameEl = document.getElementById("aipet-name");
  const levelEl = document.getElementById("aipet-level");
  const evoBadge = document.getElementById("aipet-evo-badge");
  const emotionBarFill = document.getElementById("aipet-emotion-fill");
  const particlesContainer = document.getElementById("aipet-particles");

  // ── Load full state ──
  chrome.runtime.sendMessage({ type: "getFullState" }, (res) => {
    if (!res) return;
    if (res.config) {
      config = res.config;
      preferences = config.preferences || preferences;
      updateAppearance();
    }
    if (res.emotions) emotions = res.emotions;
    if (res.dominant) {
      dominant = res.dominant;
      moodEl.textContent = dominant.emoji;
    }
    if (res.evolution) {
      evolution = res.evolution;
      updateEvolutionVisuals();
    }
  });

  function updateAppearance() {
    // SCRUM-49/53/55: never innerHTML untrusted strings; use DOM API + scheme check
    emojiEl.replaceChildren();
    let safeUrl = "";
    if (config.avatarUrl) {
      try {
        const u = new URL(config.avatarUrl);
        if (u.protocol === "https:" || u.protocol === "http:") safeUrl = config.avatarUrl;
      } catch {}
    }
    if (safeUrl) {
      const img = document.createElement("img");
      img.id = "aipet-avatar";
      img.src = safeUrl;
      img.alt = String(config.petName || "pet");
      emojiEl.appendChild(img);
    } else {
      emojiEl.textContent = config.petEmoji;
    }
    nameEl.textContent = config.petName;
    levelEl.textContent = `Lv.${config.level}`;
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

    if (avg > 70) emotionBarFill.style.background = "linear-gradient(90deg, #4ade80, #22c55e)";
    else if (avg > 40) emotionBarFill.style.background = "linear-gradient(90deg, #fbbf24, #f59e0b)";
    else emotionBarFill.style.background = "linear-gradient(90deg, #f87171, #ef4444)";
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

  function startWalking() {
    if (emotions.energy < 10) return; // too tired
    state = "walking";
    targetX = pickTarget();
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
    posY = 0;
    hopPhase = 0;
    container.style.bottom = "0px";
    // Short pauses so the pet keeps moving and exploring
    nextWalkDelay = randomBetween(1.0, 2.5);
  }

  // ── Markdown cleaner ──
  function cleanResponse(text) {
    return text
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
    setTimeout(() => p.remove(), 1000);
  }

  function burstParticles(emojis, count = 5) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        spawnParticle(emoji, 30 + Math.random() * 20, -10 - Math.random() * 20);
      }, i * 80);
    }
  }

  // ── Speech Bubble ──
  function showBubble(text, duration = 5000) {
    if (bubbleTimeout) clearTimeout(bubbleTimeout);
    bubble.classList.remove("hidden");
    bubble.textContent = cleanResponse(text);
    menu.classList.add("hidden");
    bubbleTimeout = setTimeout(() => {
      bubble.classList.add("hidden");
      state = "idle";
    }, duration);
  }

  function showTyping() {
    bubble.classList.remove("hidden");
    bubble.innerHTML = '<div class="aipet-typing"><span></span><span></span><span></span></div>';
  }

  function showChatInput(prefill = "") {
    bubble.classList.remove("hidden");
    bubble.innerHTML = `
      <div style="font-size:11px;color:#999;margin-bottom:4px">${dominant.emoji} ${config.petName} is listening...</div>
      <input id="aipet-chat-input" type="text" placeholder="Say something..." value="${prefill}" />
    `;
    const input = document.getElementById("aipet-chat-input");
    input.focus();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        const msg = input.value.trim();
        showTyping();
        state = "chatting";
        chrome.runtime.sendMessage({ type: "chat", message: msg }, (res) => {
          if (res?.reply) {
            showBubble(res.reply, 6000);
            body.classList.add("jumping");
            setTimeout(() => body.classList.remove("jumping"), 500);
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

  // ── Context Menu ──
  function showMenu() {
    menu.classList.remove("hidden");
    bubble.classList.add("hidden");

    const evoStage = evolution.stage || 0;

    menu.innerHTML = `
      <button class="aipet-menu-item" data-action="chat"><span class="icon">\uD83D\uDCAC</span> Chat</button>
      <button class="aipet-menu-item" data-action="mood"><span class="icon">${dominant.emoji}</span> How are you?</button>
      <button class="aipet-menu-item" data-action="feed"><span class="icon">\uD83C\uDF56</span> Feed</button>
      <button class="aipet-menu-item" data-action="play"><span class="icon">\uD83C\uDFBE</span> Play</button>
      <button class="aipet-menu-item" data-action="pet"><span class="icon">\uD83D\uDC95</span> Pet</button>
      <div class="aipet-menu-divider"></div>
      <button class="aipet-menu-item" data-action="skills"><span class="icon">\u2728</span> Skills</button>
      <button class="aipet-menu-item" data-action="selfie" ${evoStage < 3 ? 'style="opacity:0.4" title="Unlock at Teen stage"' : ""}><span class="icon">\uD83D\uDCF8</span> Take Selfie ${evoStage < 3 ? "\uD83D\uDD12" : ""}</button>
      <button class="aipet-menu-item" data-action="export"><span class="icon">\uD83D\uDCE6</span> Export SOUL</button>
      <div class="aipet-menu-divider"></div>
      <button class="aipet-menu-item" data-action="sleep"><span class="icon">\uD83D\uDCA4</span> Sleep</button>
      <button class="aipet-menu-item" data-action="hide"><span class="icon">\uD83D\uDC4B</span> Hide</button>
    `;

    menu.querySelectorAll(".aipet-menu-item").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const action = e.currentTarget.dataset.action;
        menu.classList.add("hidden");
        handleMenuAction(action);
      });
    });
  }

  function handleMenuAction(action) {
    switch (action) {
      case "chat":
        showChatInput();
        break;

      case "mood":
        showTyping();
        state = "chatting";
        chrome.runtime.sendMessage({ type: "chat", message: "How are you feeling right now?" }, (res) => {
          showBubble(res?.reply || `${dominant.emoji} I'm feeling ${dominant.name.toLowerCase()}!`, 6000);
          burstParticles([dominant.emoji], 3);
        });
        break;

      case "feed":
        chrome.runtime.sendMessage({ type: "emotionAction", action: "feed" }, (res) => {
          if (res?.emotions) { emotions = res.emotions; dominant = res.dominant; }
          showBubble("\uD83C\uDF56 Yum yum! That was delicious!", 3000);
          burstParticles(["\uD83C\uDF56", "\uD83E\uDDB4", "\uD83C\uDF1F"], 5);
          body.classList.add("jumping");
          setTimeout(() => body.classList.remove("jumping"), 500);
          updateEmotionBar();
        });
        break;

      case "play":
        chrome.runtime.sendMessage({ type: "emotionAction", action: "play" }, (res) => {
          if (res?.emotions) { emotions = res.emotions; dominant = res.dominant; }
          showBubble("\uD83C\uDFBE Wheee! That was fun!", 3000);
          burstParticles(["\uD83C\uDFBE", "\u2B50", "\uD83C\uDF89"], 6);
          body.classList.add("jumping");
          setTimeout(() => body.classList.remove("jumping"), 500);
          updateEmotionBar();
        });
        break;

      case "pet":
        chrome.runtime.sendMessage({ type: "emotionAction", action: "pet" }, (res) => {
          if (res?.emotions) { emotions = res.emotions; dominant = res.dominant; }
          showBubble("\uD83D\uDC95 Purrrr... I love you!", 3000);
          burstParticles(["\u2764\uFE0F", "\uD83D\uDC95", "\uD83E\uDE77", "\u2728"], 8);
          body.classList.add("jumping");
          setTimeout(() => body.classList.remove("jumping"), 500);
          updateEmotionBar();
        });
        break;

      case "selfie":
        if (evolution.stage < 3) {
          showBubble("\uD83D\uDD12 Unlock selfies at Teen stage!", 3000);
          return;
        }
        showBubble("\uD83D\uDCF8 Say cheese! *click* Selfie coming soon!", 3000);
        burstParticles(["\uD83D\uDCF8", "\u2728", "\uD83C\uDF1F"], 5);
        // Could integrate with image generation API here
        chrome.runtime.sendMessage({
          type: "executeSkill",
          skillId: "selfie",
          input: { mood: dominant.name },
        }, (res) => {
          if (res?.result?.output?.imageUrl) {
            showBubble("\uD83D\uDCF8 Check out my selfie!", 5000);
          }
        });
        break;

      case "skills":
        chrome.runtime.sendMessage({ type: "fetchSkills" }, (res) => {
          if (res?.data?.skills) {
            const skillList = res.data.skills.map((s) => `${s.emoji || "\u2728"} ${s.name}`).join(", ");
            showBubble(`My skills: ${skillList}`, 5000);
          } else {
            showBubble("\u2728 Skills: Chat, Mood Check, Feed, Play, Pet, Export", 4000);
          }
        });
        break;

      case "export":
        showBubble("\uD83D\uDCE6 Exporting SOUL data...", 2000);
        chrome.runtime.sendMessage({ type: "exportSoul" }, (res) => {
          if (res?.data) {
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${config.petName}_SOUL.json`;
            a.click();
            URL.revokeObjectURL(url);
            showBubble("\u2705 SOUL exported! Your data, your rules.", 4000);
            burstParticles(["\uD83D\uDCE6", "\u2705"], 3);
          } else {
            showBubble("\u274C Export failed. Is the server running?", 3000);
          }
        });
        break;

      case "sleep":
        state = "sleeping";
        body.classList.add("sleeping");
        showBubble("Zzz... \uD83D\uDCA4", 3000);
        burstParticles(["\uD83D\uDCA4", "\u2728", "\uD83C\uDF19"], 4);
        setTimeout(() => {
          body.classList.remove("sleeping");
          state = "idle";
          showBubble("*yawn* That was a nice nap! \uD83D\uDE0A", 3000);
        }, 15000);
        break;

      case "hide":
        container.classList.add("aipet-hiding");
        setTimeout(() => {
          container.style.display = "none";
          container.classList.remove("aipet-hiding");
        }, 500);
        setTimeout(() => {
          container.style.display = "";
          showBubble("I'm back! Did you miss me? \uD83D\uDE0A", 3000);
          burstParticles(["\uD83D\uDC4B", "\u2728"], 3);
        }, 30000);
        break;
    }
  }

  // ── Events ──
  body.addEventListener("click", (e) => {
    if (isDragging) return;
    if (state === "chatting") return;
    showChatInput();
    burstParticles(["\u2728"], 2);
  });

  body.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showMenu();
  });

  // Drag
  body.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    isDragging = false;
    dragOffsetX = e.clientX - posX;
    const startX = e.clientX;

    function onMove(ev) {
      if (Math.abs(ev.clientX - startX) > 5) isDragging = true;
      posX = ev.clientX - dragOffsetX;
      posX = Math.max(40, Math.min(window.innerWidth - 40, posX));
      updatePosition();
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setTimeout(() => { isDragging = false; }, 50);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  // Double-click = pet
  body.addEventListener("dblclick", () => {
    handleMenuAction("pet");
  });

  // Click outside
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      bubble.classList.add("hidden");
      menu.classList.add("hidden");
    }
  });

  // ── Messages from background ──
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "autoTalk" && state !== "chatting" && state !== "sleeping") {
      chrome.runtime.sendMessage({ type: "autonomousMessage" }, (res) => {
        if (res?.message) {
          showBubble(res.message, 6000);
          body.classList.add("jumping");
          setTimeout(() => body.classList.remove("jumping"), 500);
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
      setTimeout(() => body.classList.remove("aipet-evolving"), 3000);
    }

    if (msg.type === "prefChange") {
      preferences[msg.key] = msg.value;
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

  setInterval(ambientParticles, 2000);

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
      posX += direction * walkSpeed;

      // Edge bounce — keeps pet on screen if window resized mid-walk
      if (posX <= 50) { posX = 50; direction = 1; body.classList.remove("walking-left"); targetX = pickTarget(); }
      if (posX >= window.innerWidth - 50) { posX = window.innerWidth - 50; direction = -1; body.classList.add("walking-left"); targetX = pickTarget(); }

      // Arrived at target → pick a new one and keep going (rather than stop)
      const arrived = (direction === 1 && posX >= targetX) || (direction === -1 && posX <= targetX);
      if (arrived) {
        // 60% pick a new target and keep walking, 40% stop and rest
        if (Math.random() < 0.6) {
          targetX = pickTarget();
          direction = targetX > posX ? 1 : -1;
          body.classList.toggle("walking-left", direction === -1);
        } else {
          stopWalking();
          return requestAnimationFrame(gameLoop);
        }
      }

      // Optional hop — small vertical bob during the walk
      if (hopPhase > 0) {
        hopPhase += dt * 4;
        posY = Math.max(0, Math.sin(hopPhase) * 18);
        // Trigger a fresh hop every ~2 seconds while exploring
        if (hopPhase > Math.PI * 2 * 4) hopPhase = 0.001;
      }

      updatePosition();
      walkTimer -= dt;
      if (walkTimer <= 0) stopWalking();
    }

    // Mood updates from emotion state
    moodEl.textContent = dominant.emoji;

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);

  // ── Periodic emotion sync ──
  setInterval(() => {
    chrome.runtime.sendMessage({ type: "getEmotions" }, (res) => {
      if (!res) return;
      if (res.emotions) emotions = res.emotions;
      if (res.dominant) dominant = res.dominant;
      updateEmotionBar();
    });
  }, 30000);

  // ── Evolution sync ──
  setInterval(() => {
    chrome.runtime.sendMessage({ type: "getEvolution" }, (res) => {
      if (!res) return;
      const oldStage = evolution.stage;
      evolution = res.evolution || evolution;
      if (evolution.stage !== oldStage) updateEvolutionVisuals();
    });
  }, 60000);

})();

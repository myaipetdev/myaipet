/**
 * MY AI PET — Content Script
 * Renders pet on every webpage — walking, chatting, reacting
 */

(function () {
  if (document.getElementById("aipet-container")) return; // already injected

  // ── State ──
  let config = { petName: "Pet", petEmoji: "\uD83D\uDC3E", avatarUrl: "", level: 1, personality: "playful" };
  let posX = window.innerWidth / 2;
  let posY = 0; // bottom-anchored
  let direction = 1; // 1 = right, -1 = left
  let state = "idle"; // idle, walking, chatting, sleeping
  let walkSpeed = 1.2;
  let walkTimer = 0;
  let idleTimer = 0;
  let nextWalkDelay = randomBetween(2, 6);
  let nextIdleDelay = randomBetween(3, 8);
  let isDragging = false;
  let dragOffsetX = 0;
  let bubbleTimeout = null;
  let moodEmoji = "\uD83D\uDE0A";

  const moods = { playful: "\uD83D\uDE1C", brave: "\uD83D\uDE24", gentle: "\uD83D\uDE0A", shy: "\uD83D\uDE33", lazy: "\uD83D\uDE34", curious: "\uD83E\uDD14" };

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  // ── Build DOM ──
  const container = document.createElement("div");
  container.id = "aipet-container";

  container.innerHTML = `
    <div id="aipet-mood">${moodEmoji}</div>
    <div id="aipet-body">
      <div id="aipet-emoji">${config.petEmoji}</div>
      <div id="aipet-name">${config.petName}</div>
      <div id="aipet-level">Lv.${config.level}</div>
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

  // ── Load config ──
  chrome.runtime.sendMessage({ type: "getConfig" }, (res) => {
    if (res?.config) {
      config = res.config;
      updateAppearance();
    }
  });

  function updateAppearance() {
    if (config.avatarUrl) {
      emojiEl.innerHTML = `<img id="aipet-avatar" src="${config.avatarUrl}" alt="${config.petName}" />`;
    } else {
      emojiEl.textContent = config.petEmoji;
    }
    nameEl.textContent = config.petName;
    levelEl.textContent = `Lv.${config.level}`;
    moodEmoji = moods[config.personality] || "\uD83D\uDE0A";
    moodEl.textContent = moodEmoji;
  }

  // ── Position update ──
  function updatePosition() {
    container.style.left = posX + "px";
    container.style.transform = "translateX(-50%)";
  }
  updatePosition();

  // ── Walking logic ──
  function startWalking() {
    state = "walking";
    direction = Math.random() > 0.5 ? 1 : -1;
    walkSpeed = 0.8 + Math.random() * 1.5;
    body.classList.add("walking");
    body.classList.toggle("walking-left", direction === -1);
    walkTimer = randomBetween(2, 5);
  }

  function stopWalking() {
    state = "idle";
    body.classList.remove("walking", "walking-left");
    nextWalkDelay = randomBetween(3, 8);
  }

  // ── Clean markdown from LLM responses ──
  function cleanResponse(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, "$1")   // **bold** → bold
      .replace(/\*(.*?)\*/g, "$1")        // *italic* → italic
      .replace(/#{1,3}\s/g, "")           // ### headers
      .replace(/`([^`]+)`/g, "$1")        // `code`
      .replace(/\n{2,}/g, " ")            // multiple newlines → space
      .replace(/- /g, "")                 // bullet points
      .trim();
  }

  // ── Speech bubble ──
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
      <div style="font-size:11px;color:#999;margin-bottom:4px">${config.petName} is listening...</div>
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
            showBubble(res.reply + " (+3 pts)", 6000);
            body.classList.add("jumping");
            setTimeout(() => body.classList.remove("jumping"), 500);
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

  // ── Context menu ──
  function showMenu() {
    menu.classList.remove("hidden");
    bubble.classList.add("hidden");
    menu.innerHTML = `
      <button class="aipet-menu-item" data-action="chat"><span class="icon">\uD83D\uDCAC</span> Chat</button>
      <button class="aipet-menu-item" data-action="mood"><span class="icon">\uD83D\uDE0A</span> How are you?</button>
      <button class="aipet-menu-item" data-action="selfie"><span class="icon">\uD83D\uDCF8</span> Take Selfie</button>
      <div class="aipet-menu-divider"></div>
      <button class="aipet-menu-item" data-action="skills"><span class="icon">\u2728</span> Skills</button>
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
          showBubble(res?.reply || "I'm doing great! \uD83D\uDE0A", 6000);
        });
        break;
      case "selfie":
        showBubble("\uD83D\uDCF8 Generating selfie... (coming soon!)", 3000);
        break;
      case "skills":
        showBubble("\u2728 Skills: Chat, Persona Mirror, Memory Recall, Autonomous Post", 4000);
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
          } else {
            showBubble("\u274C Export failed. Is the server running?", 3000);
          }
        });
        break;
      case "sleep":
        state = "sleeping";
        body.classList.add("sleeping");
        showBubble("Zzz... \uD83D\uDCA4", 3000);
        setTimeout(() => {
          body.classList.remove("sleeping");
          state = "idle";
        }, 15000);
        break;
      case "hide":
        container.style.display = "none";
        setTimeout(() => {
          container.style.display = "";
        }, 30000); // come back after 30s
        break;
    }
  }

  // ── Event handlers ──

  // Click → chat
  body.addEventListener("click", (e) => {
    if (isDragging) return;
    if (state === "chatting") return;
    showChatInput();
  });

  // Right-click → menu
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

  // Click outside → close bubble/menu
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      bubble.classList.add("hidden");
      menu.classList.add("hidden");
    }
  });

  // ── Autonomous messages from background ──
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "autoTalk" && state !== "chatting" && state !== "sleeping") {
      chrome.runtime.sendMessage({ type: "autonomousMessage" }, (res) => {
        if (res?.message) {
          showBubble(res.message, 6000);
          body.classList.add("jumping");
          setTimeout(() => body.classList.remove("jumping"), 500);
        }
      });
    }
  });

  // ── Main loop ──
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

      // Bounce at edges
      if (posX <= 50) { direction = 1; body.classList.remove("walking-left"); }
      if (posX >= window.innerWidth - 50) { direction = -1; body.classList.add("walking-left"); }

      updatePosition();

      walkTimer -= dt;
      if (walkTimer <= 0) {
        stopWalking();
      }
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);

  // ── Periodic mood changes ──
  setInterval(() => {
    const randomMoods = ["\uD83D\uDE0A", "\uD83D\uDE04", "\uD83D\uDE1C", "\u2728", "\uD83C\uDF1F", "\uD83D\uDCAB", "\uD83C\uDF3F", "\uD83D\uDD25", "\uD83D\uDCA7", "\u26A1"];
    moodEl.textContent = randomMoods[Math.floor(Math.random() * randomMoods.length)];
  }, 20000);

})();

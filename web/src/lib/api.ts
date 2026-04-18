/**
 * PETAGEN API Client
 * Centralized fetch wrapper with JWT auth header.
 */

const API_BASE = "";
const IS_DEV = typeof window !== "undefined" && process.env.NODE_ENV === "development";

let _token: string | null = null;

// ── Dev Mock Data ──
const DEV_MOCK_PET = {
  id: 1, user_id: 1, name: "Sparky", species: 7, personality_type: "brave",
  level: 15, experience: 2400, happiness: 85, energy: 90, hunger: 30,
  bond_level: 5, total_interactions: 120, avatar_url: null,
  element: "fire", evolution_stage: 2, evolution_name: "Blaze Fox",
  is_active: true, soul_version: 1, appearance_desc: "A fiery fox with orange fur",
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

const DEV_MOCK_PET2 = {
  id: 2, user_id: 1, name: "Aqua", species: 22, personality_type: "gentle",
  level: 12, experience: 1600, happiness: 90, energy: 80, hunger: 20,
  bond_level: 4, total_interactions: 80, avatar_url: null,
  element: "water", evolution_stage: 2, evolution_name: "Tidal Dolphin",
  is_active: true, soul_version: 1, appearance_desc: "A graceful blue dolphin",
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

const DEV_MOCK_SKILLS = {
  skills: [
    { pet_id: 1, skill_key: "fire_fang", level: 3, slot: 0 },
    { pet_id: 1, skill_key: "ember", level: 4, slot: 1 },
    { pet_id: 1, skill_key: "flame_burst", level: 2, slot: 2 },
    { pet_id: 1, skill_key: "scratch", level: 5, slot: 3 },
  ],
  learned: ["fire_fang", "ember", "flame_burst", "scratch", "body_slam", "dodge"],
};

const DEV_MOCK_SKILLS_WATER = {
  skills: [
    { pet_id: 2, skill_key: "water_gun", level: 3, slot: 0 },
    { pet_id: 2, skill_key: "aqua_jet", level: 2, slot: 1 },
    { pet_id: 2, skill_key: "scratch", level: 4, slot: 2 },
    { pet_id: 2, skill_key: "dodge", level: 2, slot: 3 },
  ],
  learned: ["water_gun", "aqua_jet", "scratch", "dodge"],
};

function devMock(path: string, options: any = {}): any | null {
  if (!IS_DEV) return null;
  const method = (options.method || "GET").toUpperCase();

  if (path === "/api/auth/me") return { wallet_address: "0xDEV1234567890abcdef1234567890abcdef1234", credits: 9999, generation_count: 10, created_at: new Date().toISOString() };
  if (path === "/api/pets" && method === "GET") return { pets: [DEV_MOCK_PET, DEV_MOCK_PET2], pet_slots: 3, slot_prices: [0, 50, 100, 200, 500] };
  if (path.match(/\/api\/pets\/\d+$/) && method === "GET") return DEV_MOCK_PET;
  if (path.match(/\/api\/skills/) && method === "GET") {
    if (path.includes("pet_id=2")) return DEV_MOCK_SKILLS_WATER;
    return DEV_MOCK_SKILLS;
  }
  if (path.match(/\/api\/arena\/pve$/) && method === "GET") return { regions: [], currentStage: 1, totalStars: 0 };
  if (path.match(/\/api\/arena\/pve$/) && method === "POST") return { success: true, exp_gained: 120, credits_gained: 25, airdrop_gained: 5, leveled_up: false, new_level: DEV_MOCK_PET.level };
  if (path.match(/\/api\/arena\/opponent/)) return { opponent: { id: 99, name: "DevBot", species: 10, personality_type: "brave", level: 14, happiness: 80, energy: 80, element: "electric", avatar_url: null } };
  if (path.match(/\/api\/arena\/result/) && method === "POST") return { success: true, exp_gained: 80, credits_gained: 15, new_level: DEV_MOCK_PET.level, points: 10, skill_drop: null };
  if (path === "/api/playtime" && method === "GET") return { today_minutes: 30, rewards_claimed: 0, daily_cap: 120 };
  if (path === "/api/playtime" && method === "POST") return { success: true, rewards: 0 };
  if (path === "/api/credits/balance") return { credits: 9999 };
  if (path.match(/\/api\/analytics/)) return method === "GET" ? {} : {};

  // Soul / Sovereignty
  if (path.match(/\/api\/pets\/\d+\/soul$/) && method === "GET") return {
    soul: {
      token_id: 1, genesis_hash: "0xabc123def456", current_hash: "0xdef789abc012",
      current_version: 3, birth_at: "2026-01-15T00:00:00Z", last_heartbeat: new Date().toISOString(),
      successor_wallet: null, inactivity_days: 0, wallet_address: "0xDEV1234567890abcdef1234567890abcdef1234",
    }
  };
  if (path.match(/\/api\/pets\/\d+\/soul\/checkpoints/) && method === "GET") return {
    checkpoints: [
      { id: 1, version: 1, trigger_event: "adoption", summary: "Pet was born", created_at: "2026-01-15T00:00:00Z", hash: "0xabc1" },
      { id: 2, version: 2, trigger_event: "persona_update", summary: "Personality evolved after 50 conversations", created_at: "2026-02-20T00:00:00Z", hash: "0xabc2" },
      { id: 3, version: 3, trigger_event: "level_up", summary: "Reached level 15", created_at: "2026-03-10T00:00:00Z", hash: "0xabc3" },
    ]
  };
  if (path.match(/\/api\/pets\/\d+\/soul\/successor/) && method === "POST") return { success: true };
  if (path.match(/\/api\/pets\/\d+\/soul\/successor/) && method === "DELETE") return { success: true };

  // Memory NFTs
  if (path.match(/\/api\/pets\/\d+\/memories\/collection/) && method === "GET") return { memories: [] };
  if (path.match(/\/api\/pets\/\d+\/memories\/list/) && method === "GET") return {
    memories: [
      { id: 1, content: "Had a wonderful first conversation with my owner", memory_type: "conversation", importance: 4, created_at: "2026-01-15T12:00:00Z" },
      { id: 2, content: "Reached level 10! Feeling stronger", memory_type: "milestone", importance: 5, created_at: "2026-02-01T00:00:00Z" },
      { id: 3, content: "Owner taught me about blockchain and sovereignty", memory_type: "conversation", importance: 3, created_at: "2026-03-05T00:00:00Z" },
    ]
  };
  if (path.match(/\/api\/pets\/\d+\/memories\/mint/) && method === "POST") return { success: true, token_id: 1000001, tx_hash: "0xmint123" };

  // Agent
  if (path.match(/\/api\/pets\/\d+\/agent\/status/) && method === "GET") return {
    connections: [
      { platform: "telegram", connected: false },
      { platform: "twitter", connected: false },
      { platform: "discord", connected: false },
    ],
    stats: { total_messages: 0, messages_today: 0, credits_used_today: 0 },
  };
  if (path.match(/\/api\/pets\/\d+\/agent\/config/) && method === "GET") return {
    is_enabled: false, daily_credit_limit: 50, posting_frequency: "medium",
    quiet_hours_start: 23, quiet_hours_end: 7,
  };
  if (path.match(/\/api\/pets\/\d+\/agent\/config/) && method === "PUT") return { success: true };
  if (path.match(/\/api\/pets\/\d+\/agent\/connect/) && method === "POST") return { success: true, bot_username: "test_bot" };
  if (path.match(/\/api\/pets\/\d+\/agent\/disconnect/) && method === "POST") return { success: true };
  if (path.match(/\/api\/pets\/\d+\/agent\/messages/) && method === "GET") return { messages: [], total: 0 };

  // Persona
  if (path.match(/\/api\/pets\/\d+\/persona$/) && method === "GET") return {
    owner_speech_style: null, owner_interests: null, owner_tone: null, owner_language: null, owner_bio: null,
  };
  if (path.match(/\/api\/pets\/\d+\/persona$/) && method === "POST") return { success: true };

  // PetClaw export/delete (server-side, not mocked — let it through)

  return null;
}

async function request(path: string, options: any = {}) {
  // Dev mode: return mock data if available
  const mock = devMock(path, options);
  if (mock !== null) return mock;

  const headers: any = {
    ...(options.headers || {}),
  };

  // Add auth token if available (fallback to localStorage)
  const token = _token || (typeof window !== "undefined" ? localStorage.getItem("petagen_jwt") : null);
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    if (!_token) _token = token;
  }

  // If not FormData, set JSON content type
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.error || err.details || `HTTP ${res.status}`);
  }

  return res.json();
}

export function getAuthHeaders(): Record<string, string> {
  const token = _token || (typeof window !== "undefined" ? localStorage.getItem("petagen_jwt") : null);
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

export const api = {
  setToken(token: string | null) {
    _token = token;
  },

  // ── Auth ──
  auth: {
    getNonce: (address: string, chainId?: number) =>
      request(`/api/auth/nonce?address=${address}&chainId=${chainId || 1}`),

    verify: (message: string, signature: string) =>
      request("/api/auth/verify", {
        method: "POST",
        body: { message, signature },
      }),

    getMe: () => request("/api/auth/me"),
  },

  // ── Generate ──
  generate: {
    create: (petId: number, formData: FormData) =>
      request(`/api/pets/${petId}/generate`, {
        method: "POST",
        body: formData, // FormData — no JSON stringify
      }),

    status: (id: string) =>
      request(`/api/generate/${id}/status`),

    history: (page = 1, pageSize = 20) =>
      request(`/api/generate/history?page=${page}&page_size=${pageSize}`),
  },

  // ── Gallery ──
  gallery: {
    list: (params: any = {}) => {
      const qs = new URLSearchParams();
      if (params.page) qs.set("page", params.page);
      if (params.page_size) qs.set("page_size", params.page_size);
      if (params.pet_type !== undefined) qs.set("pet_type", params.pet_type);
      if (params.style !== undefined) qs.set("style", params.style);
      if (params.chain) qs.set("chain", params.chain);
      if (params.sort) qs.set("sort", params.sort);
      return request(`/api/gallery?${qs.toString()}`);
    },
  },

  // ── Adventure ──
  adventure: {
    play: (mode: string, petId: number, options?: { action?: string }) =>
      request("/api/adventure", { method: "POST", body: { mode, pet_id: petId, ...(options || {}) } }),
  },

  // ── Arena ──
  arena: {
    findOpponent: (level: number) => request(`/api/arena/opponent?level=${level}`),
    reportResult: (petId: number, opponentId: number, won: boolean, turns: number, opponentName?: string, hpLeft?: number) =>
      request("/api/arena/result", { method: "POST", body: { pet_id: petId, opponent_id: opponentId, won, turns, opponent_name: opponentName || "Unknown", hp_left: hpLeft || 0 } }),
  },

  // ── PvE ──
  pve: {
    getProgress: (petId?: number) => request(`/api/arena/pve${petId ? `?pet_id=${petId}` : ""}`),
    reportResult: (petId: number, stageId: number, won: boolean, turns: number, hpLeft: number, maxHp: number) =>
      request("/api/arena/pve", { method: "POST", body: { pet_id: petId, stage_id: stageId, won, turns, hp_left: hpLeft, max_hp: maxHp } }),
  },

  // ── Leaderboard ──
  leaderboard: {
    get: (limit = 20) => request(`/api/leaderboard?limit=${limit}`),
  },

  // ── Analytics ──
  analytics: {
    stats: () => request("/api/analytics/stats"),
    daily: (days = 20) => request(`/api/analytics/daily?days=${days}`),
    chains: () => request("/api/analytics/chains"),
    activity: (limit = 20) => request(`/api/analytics/activity?limit=${limit}`),
  },

  // ── Credits ──
  credits: {
    balance: () => request("/api/credits/balance"),
    purchase: (plan: string, paymentTxHash?: string) =>
      request("/api/credits/purchase", {
        method: "POST",
        body: { plan, payment_tx_hash: paymentTxHash },
      }),
  },

  // ── Pets ──
  pets: {
    list: () => request("/api/pets"),
    create: (name: string, species: number, personality?: string, avatar_url?: string, species_name?: string, appearance_desc?: string, custom_traits?: string) =>
      request("/api/pets", {
        method: "POST",
        body: { name, species, personality, avatar_url, species_name, appearance_desc, custom_traits },
      }),
    generateAvatar: (species: number, personality: string, species_name?: string, custom_traits?: string) =>
      request("/api/pets/avatar", {
        method: "POST",
        body: { species, personality, species_name, custom_traits },
      }),
    get: (petId: number) => request(`/api/pets/${petId}`),
    interact: (petId: number, interactionType: string) =>
      request(`/api/pets/${petId}/interact`, {
        method: "POST",
        body: { interaction_type: interactionType },
      }),
    chat: (petId: number, message: string) =>
      request(`/api/pets/${petId}/chat`, {
        method: "POST",
        body: { message },
      }),
    memories: (petId: number, params: any = {}) => {
      const qs = new URLSearchParams();
      if (params.memory_type) qs.set("memory_type", params.memory_type);
      if (params.page) qs.set("page", params.page);
      return request(`/api/pets/${petId}/memories?${qs.toString()}`);
    },
    release: (petId: number) =>
      request(`/api/pets/${petId}`, { method: "DELETE" }),
    unlockSlot: () =>
      request("/api/pets/slots", { method: "POST" }),
    update: (petId: number, data: Record<string, any>) =>
      request(`/api/pets/${petId}`, { method: "PATCH", body: data }),
    updateDesc: (petId: number, appearance_desc: string) =>
      request(`/api/pets/${petId}`, { method: "PATCH", body: { appearance_desc } }),
    generate: (petId: number, data: any) =>
      request(`/api/pets/${petId}/generate`, {
        method: "POST",
        body: data,
      }),
  },

  // ── Evolution ──
  evolution: {
    status: (petId: number) => request(`/api/pets/${petId}/evolve`),
    evolve: (petId: number) =>
      request(`/api/pets/${petId}/evolve`, { method: "POST" }),
  },

  // ── Upload ──
  upload: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/api/upload", { method: "POST", body: formData });
  },

  // ── Shop ──
  shop: {
    list: () => request("/api/shop"),
    purchase: (itemKey: string, petId?: number) =>
      request("/api/shop", {
        method: "POST",
        body: { item_key: itemKey, pet_id: petId },
      }),
    purchasePremium: (itemKey: string, petId?: number, paymentMethod?: string, skillKey?: string, element?: string) =>
      request("/api/shop/premium", {
        method: "POST",
        body: { item_key: itemKey, pet_id: petId, payment_method: paymentMethod || "credits", skill_key: skillKey, element },
      }),
  },

  // ── Social ──
  social: {
    feed: (params: any = {}) => {
      const qs = new URLSearchParams();
      if (params.page) qs.set("page", params.page);
      if (params.page_size) qs.set("page_size", params.page_size);
      if (params.pet_type !== undefined) qs.set("pet_type", params.pet_type);
      if (params.sort) qs.set("sort", params.sort);
      return request(`/api/social/feed?${qs.toString()}`);
    },
    like: (generationId: number) =>
      request(`/api/social/like/${generationId}`, { method: "POST" }),
    comments: (generationId: number, page = 1) =>
      request(`/api/social/comments/${generationId}?page=${page}`),
    addComment: (generationId: number, content: string, parentId?: number) =>
      request(`/api/social/comment/${generationId}`, {
        method: "POST",
        body: { content, parent_id: parentId || null },
      }),
    deleteComment: (commentId: number) =>
      request(`/api/social/comment-delete/${commentId}`, { method: "DELETE" }),
    follow: (userId: number) =>
      request(`/api/social/follow/${userId}`, { method: "POST" }),
    followers: (userId: number) => request(`/api/social/followers/${userId}`),
    following: (userId: number) => request(`/api/social/following/${userId}`),
    profile: (wallet: string) => request(`/api/social/profile/${wallet}`),
    updateProfile: (data: any) =>
      request("/api/social/profile", { method: "PUT", body: data }),
  },

  // ── Skills ──
  skills: {
    get: (petId: number) => request(`/api/skills?pet_id=${petId}`),
    learn: (petId: number, skillKey: string) =>
      request("/api/skills", { method: "POST", body: { action: "learn", pet_id: petId, skill_key: skillKey } }),
    equip: (petId: number, skillKey: string, slot?: number) =>
      request("/api/skills", { method: "POST", body: { action: "equip", pet_id: petId, skill_key: skillKey, slot } }),
    unequip: (petId: number, skillKey: string) =>
      request("/api/skills", { method: "POST", body: { action: "unequip", pet_id: petId, skill_key: skillKey } }),
    upgrade: (petId: number, skillKey: string) =>
      request("/api/skills", { method: "POST", body: { action: "upgrade", pet_id: petId, skill_key: skillKey } }),
  },

  // ── Play Time ──
  playtime: {
    status: () => request("/api/playtime"),
    heartbeat: (minutes: number, petId?: number) =>
      request("/api/playtime", { method: "POST", body: { minutes, pet_id: petId } }),
  },

  // ── Agent ──
  agent: {
    status: (petId: number) => request(`/api/pets/${petId}/agent/status`),
    connect: (petId: number, platform: string, credentials: any) =>
      request(`/api/pets/${petId}/agent/connect`, { method: "POST", body: { platform, ...credentials } }),
    disconnect: (petId: number, platform: string) =>
      request(`/api/pets/${petId}/agent/disconnect`, { method: "POST", body: { platform } }),
    config: (petId: number) => request(`/api/pets/${petId}/agent/config`),
    updateConfig: (petId: number, config: any) =>
      request(`/api/pets/${petId}/agent/config`, { method: "PUT", body: config }),
    messages: (petId: number, platform?: string, limit?: number, offset?: number) =>
      request(`/api/pets/${petId}/agent/messages?${new URLSearchParams({
        ...(platform && { platform }),
        limit: String(limit || 50),
        offset: String(offset || 0),
      })}`),
  },

  // ── Persona ──
  persona: {
    get: (petId: number) => request(`/api/pets/${petId}/persona`),
    save: (petId: number, data: any) =>
      request(`/api/pets/${petId}/persona`, { method: "POST", body: data }),
    analyze: (petId: number, chatText: string) =>
      request(`/api/pets/${petId}/persona/analyze`, {
        method: "POST",
        body: { chat_text: chatText },
      }),
    applyAnalysis: (petId: number, analysis: any) =>
      request(`/api/pets/${petId}/persona/apply`, {
        method: "POST",
        body: analysis,
      }),
    updateLiveLearning: (petId: number, enabled: boolean) =>
      request(`/api/pets/${petId}/persona/live-learning`, {
        method: "PUT",
        body: { enabled },
      }),
  },

  // ── Web4 Soul ──
  soul: {
    get: (petId: number) => request(`/api/pets/${petId}/soul`),
    checkpoints: (petId: number, limit = 20, offset = 0) =>
      request(`/api/pets/${petId}/soul/checkpoints?limit=${limit}&offset=${offset}`),
    setSuccessor: (petId: number, successor_wallet: string) =>
      request(`/api/pets/${petId}/soul/successor`, {
        method: "POST",
        body: { successor_wallet },
      }),
    removeSuccessor: (petId: number) =>
      request(`/api/pets/${petId}/soul/successor`, { method: "DELETE" }),
  },

  // ── Memory NFTs ──
  memoryNfts: {
    list: (petId: number) => request(`/api/pets/${petId}/memories/collection`),
    mint: (petId: number, data: any) =>
      request(`/api/pets/${petId}/memories/mint`, { method: "POST", body: data }),
    mintable: (petId: number) =>
      request(`/api/pets/${petId}/memories/list?mintable=true`),
  },

  // ── PetClaw (Data Sovereignty) ──
  petclaw: {
    manifest: () => request("/api/petclaw"),
    verify: (petId: number, walletAddress: string) =>
      request("/api/petclaw/verify", { method: "POST", body: { petId, walletAddress } }),
    export: (petId: number) => request(`/api/petclaw/export?petId=${petId}`),
    import: (soulData: any) =>
      request("/api/petclaw/import", { method: "POST", body: soulData }),
    delete: (petId: number) =>
      request(`/api/petclaw/delete?petId=${petId}`, { method: "DELETE" }),
    consent: {
      get: (petId: number) => request(`/api/pets/${petId}?fields=consent`),
      update: (petId: number, consent: any) =>
        request(`/api/pets/${petId}`, { method: "PATCH", body: { personality_modifiers: consent } }),
    },
  },

  // ── PetHub (Skills) ──
  pethub: {
    list: (query?: string, category?: string) =>
      request(`/api/petclaw/skills?${new URLSearchParams({ ...(query && { q: query }), ...(category && { category }) })}`),
    get: (skillId: string) => request(`/api/petclaw/skills?id=${skillId}`),
    getSkillMd: (skillId: string) => request(`/api/petclaw/skills?id=${skillId}&format=md`),
    installed: (petId: number) => request(`/api/petclaw/skills?petId=${petId}`),
    install: (petId: number, skillId: string, config?: Record<string, string>) =>
      request("/api/petclaw/skills", { method: "POST", body: { action: "install", petId, skillId, config } }),
    uninstall: (petId: number, skillId: string) =>
      request("/api/petclaw/skills", { method: "POST", body: { action: "uninstall", petId, skillId } }),
    execute: (petId: number, skillId: string, input?: Record<string, unknown>) =>
      request("/api/petclaw/skills", { method: "POST", body: { action: "execute", petId, skillId, input } }),
  },

  // ── Pet Network (A2A) ──
  petNetwork: {
    discover: (filters?: { personality?: string; element?: string; skill?: string; minLevel?: number }) =>
      request(`/api/petclaw/network/discover?${new URLSearchParams(
        Object.fromEntries(Object.entries(filters || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
      )}`),
    invoke: (callerPetId: number, providerPetId: number, skillId: string, input?: Record<string, unknown>) =>
      request("/api/petclaw/network/invoke", {
        method: "POST",
        body: { callerPetId, providerPetId, skillId, input },
      }),
  },

  // ── Battle Sprites ──
  battleSprite: {
    generate: (name: string, species: number, element: string, personality?: string, isBoss?: boolean) =>
      request("/api/battle-sprite", {
        method: "POST",
        body: { name, species, element, personality, isBoss: isBoss || false },
      }),
  },

  // ── Health ──
  health: () => request("/api/health"),
};

/**
 * PETAGEN API Client
 * Centralized fetch wrapper with JWT auth header.
 */

const API_BASE = "";

let _token: string | null = null;

async function request(path: string, options: any = {}) {
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

  // ── Arena ──
  arena: {
    findOpponent: (level: number) => request(`/api/arena/opponent?level=${level}`),
    reportResult: (petId: number, opponentId: number, won: boolean, turns: number) =>
      request("/api/arena/result", { method: "POST", body: { pet_id: petId, opponent_id: opponentId, won, turns } }),
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

  // ── Health ──
  health: () => request("/api/health"),
};

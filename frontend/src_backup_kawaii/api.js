/**
 * PETAGEN API Client
 * Centralized fetch wrapper with JWT auth header.
 */

const API_BASE = import.meta.env.VITE_API_URL || "";

let _token = null;

async function request(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  // Add auth token if available
  if (_token) {
    headers["Authorization"] = `Bearer ${_token}`;
  }

  // If not FormData, set JSON content type
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  setToken(token) {
    _token = token;
  },

  // ── Auth ──
  auth: {
    getNonce: (address) =>
      request(`/api/auth/nonce?address=${address}`),

    verify: (message, signature) =>
      request("/api/auth/verify", {
        method: "POST",
        body: { message, signature },
      }),

    getMe: () => request("/api/auth/me"),
  },

  // ── Generate ──
  generate: {
    create: (formData) =>
      request("/api/generate", {
        method: "POST",
        body: formData, // FormData — no JSON stringify
      }),

    status: (id) =>
      request(`/api/generate/${id}/status`),

    history: (page = 1, pageSize = 20) =>
      request(`/api/generate/history?page=${page}&page_size=${pageSize}`),
  },

  // ── Gallery ──
  gallery: {
    list: (params = {}) => {
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
    purchase: (plan, paymentTxHash) =>
      request("/api/credits/purchase", {
        method: "POST",
        body: { plan, payment_tx_hash: paymentTxHash },
      }),
  },

  // ── Pets ──
  pets: {
    list: () => request("/api/pets"),
    create: (name, species) =>
      request("/api/pets", {
        method: "POST",
        body: { name, species },
      }),
    get: (petId) => request(`/api/pets/${petId}`),
    interact: (petId, interactionType) =>
      request(`/api/pets/${petId}/interact`, {
        method: "POST",
        body: { interaction_type: interactionType },
      }),
    memories: (petId, params = {}) => {
      const qs = new URLSearchParams();
      if (params.memory_type) qs.set("memory_type", params.memory_type);
      if (params.page) qs.set("page", params.page);
      return request(`/api/pets/${petId}/memories?${qs.toString()}`);
    },
    release: (petId) =>
      request(`/api/pets/${petId}`, { method: "DELETE" }),
    generate: (petId, data) =>
      request(`/api/pets/${petId}/generate`, {
        method: "POST",
        body: data,
      }),

    // ── Instincts ──
    instincts: (petId) => request(`/api/pets/${petId}/instincts`),
    notifications: (petId) => request(`/api/pets/${petId}/notifications`),
    readNotifications: (petId, ids) =>
      request(`/api/pets/${petId}/notifications/read`, {
        method: "POST",
        body: { notification_ids: ids || [] },
      }),
    autonomousActions: (petId, params = {}) => {
      const qs = new URLSearchParams();
      if (params.page) qs.set("page", params.page);
      if (params.urge_type) qs.set("urge_type", params.urge_type);
      return request(`/api/pets/${petId}/autonomous-actions?${qs.toString()}`);
    },

    // ── Dreams ──
    dreams: (petId, params = {}) => {
      const qs = new URLSearchParams();
      if (params.page) qs.set("page", params.page);
      return request(`/api/pets/${petId}/dreams?${qs.toString()}`);
    },
    latestDream: (petId) => request(`/api/pets/${petId}/dreams/latest`),
    personalityEvolution: (petId) =>
      request(`/api/pets/${petId}/personality-evolution`),

    // ── Soul ──
    soul: (petId) =>
      fetch(`${API_BASE}/api/pets/${petId}/soul`, {
        headers: _token ? { Authorization: `Bearer ${_token}` } : {},
      }).then((r) => r.text()),
    soulJson: (petId) => request(`/api/pets/${petId}/soul/json`),
    soulExport: (petId) =>
      request(`/api/pets/${petId}/soul/export`, { method: "POST" }),
    soulHistory: (petId) => request(`/api/pets/${petId}/soul/history`),
    soulVerify: (petId) => request(`/api/pets/${petId}/soul/verify`),
    soulImport: (formData) =>
      request("/api/pets/soul/import", {
        method: "POST",
        body: formData,
      }),
  },

  // ── Social ──
  social: {
    feed: (params = {}) => {
      const qs = new URLSearchParams();
      if (params.page) qs.set("page", params.page);
      if (params.page_size) qs.set("page_size", params.page_size);
      if (params.pet_type !== undefined) qs.set("pet_type", params.pet_type);
      if (params.sort) qs.set("sort", params.sort);
      return request(`/api/social/feed?${qs.toString()}`);
    },
    like: (generationId) =>
      request(`/api/social/like/${generationId}`, { method: "POST" }),
    comments: (generationId, page = 1) =>
      request(`/api/social/comments/${generationId}?page=${page}`),
    addComment: (generationId, content, parentId) =>
      request(`/api/social/comment/${generationId}`, {
        method: "POST",
        body: { content, parent_id: parentId || null },
      }),
    deleteComment: (commentId) =>
      request(`/api/social/comment/${commentId}`, { method: "DELETE" }),
    follow: (userId) =>
      request(`/api/social/follow/${userId}`, { method: "POST" }),
    followers: (userId) => request(`/api/social/followers/${userId}`),
    following: (userId) => request(`/api/social/following/${userId}`),
    profile: (wallet) => request(`/api/social/profile/${wallet}`),
    updateProfile: (data) =>
      request("/api/social/profile", { method: "PUT", body: data }),
  },

  // ── X402 ──
  x402: {
    pricing: () => request("/api/x402/pricing"),
    stats: () => request("/api/x402/stats"),
  },

  // ── Health ──
  health: () => request("/api/health"),
};

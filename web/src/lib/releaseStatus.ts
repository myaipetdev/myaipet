/**
 * RELEASE STATUS — single source of truth for public capability claims.
 * Landing (landing-assets/index.html) + docs (public/api-docs/ECOSYSTEM.md)
 * must match these numbers. Run the check below before touching any public
 * copy, and update this file FIRST when a registry changes:
 *
 *   cd web
 *   grep -c requiresToken src/lib/petclaw/connectors/index.ts
 *     # → must equal RELEASE_STATUS.connectors.registry (19)
 *   awk '/export const BUILTIN_SKILLS/,/^\];/' src/lib/petclaw/pethub.ts | grep -c '^    id:'
 *     # → must equal RELEASE_STATUS.skills (18)
 *   grep -ric '19-connector' ../landing-assets/index.html public/api-docs/ECOSYSTEM.md
 *     # → sanity: landing/docs still carry the registry count (each ≥ 1)
 *
 * Counts are literals here rather than imports because both registries
 * (lib/petclaw/connectors/index.ts and lib/petclaw/pethub.ts) transitively
 * import prisma / node built-ins, and this module is consumed by "use client"
 * components (PetClawConsole). The check above keeps the literals honest.
 */
export const RELEASE_STATUS = {
  /** npm latest of @myaipet/petclaw-sdk — the version actually published. */
  sdkVersion: "1.6.1",

  connectors: {
    /** Entries in AVAILABLE_CONNECTORS (lib/petclaw/connectors/index.ts). */
    registry: 19,
    /** Connectors with a working end-to-end path in production today. */
    live: 3,
    liveIds: ["web-search", "wikipedia", "memory"],
  },

  /** BUILTIN_SKILLS in lib/petclaw/pethub.ts — real-handler/endpoint-backed only. */
  skills: 18,

  /** MCP tool definitions shipped in the SDK. */
  mcpTools: 6,

  /**
   * The MCP path in the published SDK 1.6.1 is broken; the fix ships with
   * 1.6.2. Until then MCP clients cannot connect — REST API / CLI only.
   */
  mcp: "ships with SDK 1.6.2",

  /**
   * Messaging channel delivery (Telegram / Discord / X bot delivery) is
   * kill-switched fail-closed for launch: OAUTH_CONNECTIONS_ENABLED /
   * AGENT_CHANNELS_ENABLED gate the routes, which return 503 until an
   * operator opts in (see lib/oauth/availability.ts).
   */
  channels: "launch-paused",
} as const;

/** Canonical public phrasing — "19-connector registry · 3 live · 18 skills". */
export const RELEASE_SUMMARY = `${RELEASE_STATUS.connectors.registry}-connector registry · ${RELEASE_STATUS.connectors.live} live · ${RELEASE_STATUS.skills} skills`;

/**
 * RELEASE STATUS — single source of truth for public capability claims.
 * Landing (landing-assets/index.html) + docs (public/api-docs/ECOSYSTEM.md)
 * must match these numbers. Update this file first when a registry changes.
 *
 * Counts are literals rather than imports because the connector and skill
 * registries transitively import server-only modules while this module is also
 * consumed by client components.
 */
export const RELEASE_STATUS = {
  /** npm latest of @myaipet/petclaw-sdk — the version actually published. */
  sdkVersion: "1.6.1",

  connectors: {
    /** Entries in AVAILABLE_CONNECTORS. */
    registry: 19,
    /** Connectors with a working end-to-end path in production today. */
    live: 3,
    liveIds: ["web-search", "wikipedia", "memory"],
  },

  /** BUILTIN_SKILLS in lib/petclaw/pethub.ts. */
  skills: 18,

  /** Definitions in published 1.6.1 (the runtime path is broken). */
  mcpTools: 6,

  /** Owner-authenticated tools in the reviewed, unpublished 1.6.2 candidate. */
  mcpCandidateTools: 7,

  /** The authenticated MCP fix is not published in SDK 1.6.1. */
  mcp: "7-tool SDK 1.6.2 candidate · not published",

  /** Messaging delivery remains fail-closed behind launch kill-switches. */
  channels: "launch-paused",
} as const;

/** Canonical public phrasing used by product status surfaces. */
export const RELEASE_SUMMARY = `${RELEASE_STATUS.connectors.registry}-connector registry · ${RELEASE_STATUS.connectors.live} live · ${RELEASE_STATUS.skills} skills`;

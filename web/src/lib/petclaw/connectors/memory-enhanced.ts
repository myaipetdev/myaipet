/**
 * Bounded retained-memory connector for PetClaw.
 * Recall uses direct lexical selection; complete owner inspection/export is a
 * separate explicit action and never rides along with search results.
 */

import type { ConnectorResult } from "./index";
import {
  createMemoryManager,
  type MemoryContext,
  type MemoryEntry,
  type UserProfile,
} from "../memory/persistent-memory";

export interface MemorySearchPayload {
  query: string;
  relevant: MemoryEntry[];
  profile: UserProfile[];
  count: number;
  limit: number;
}

export function buildMemorySearchPayload(
  context: MemoryContext,
  query: string,
  limit: number,
): MemorySearchPayload {
  const requestedLimit = Math.trunc(limit);
  const boundedLimit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(10, requestedLimit))
    : 10;
  const relevant = context.relevantMemories.slice(0, boundedLimit);
  const profile = context.relevantUserProfile.slice(0, Math.max(0, boundedLimit - relevant.length));
  return {
    query: query.slice(0, 500),
    relevant,
    profile,
    count: relevant.length + profile.length,
    limit: boundedLimit,
  };
}

export class MemoryConnector {
  private petId: number;

  constructor(petId: number) {
    this.petId = petId;
  }

  // Bounded lexical selection over the capped retained ledgers.
  async search(query: string, limit = 10): Promise<ConnectorResult> {
    try {
      const manager = createMemoryManager(this.petId);
      // No session is supplied for recall, so buildContext deliberately returns
      // no raw conversation turns. The result contains only bounded matching
      // rows, never the formatted/full retained ledgers.
      const context = await manager.buildContext(query, "search");

      return {
        success: true,
        platform: "memory",
        data: buildMemorySearchPayload(context, query, limit),
      };
    } catch (e: any) {
      return { success: false, platform: "memory", data: null, error: e.message };
    }
  }

  // Get memory timeline
  async timeline(limit = 20): Promise<ConnectorResult> {
    try {
      const manager = createMemoryManager(this.petId);
      const messages = await manager.getRecentMessages("all", limit);

      return {
        success: true,
        platform: "memory",
        data: {
          messages,
          total: messages.length,
          platforms: [...new Set(messages.map(m => m.platform))],
        },
      };
    } catch (e: any) {
      return { success: false, platform: "memory", data: null, error: e.message };
    }
  }

  // Export the bounded portable memory set for owner data controls.
  async exportAll(): Promise<ConnectorResult> {
    try {
      const manager = createMemoryManager(this.petId);
      const exported = await manager.exportMemory();

      return {
        success: true,
        platform: "memory",
        data: exported,
      };
    } catch (e: any) {
      return { success: false, platform: "memory", data: null, error: e.message };
    }
  }

  // Clear all memories (sovereignty: right to delete)
  async clear(): Promise<ConnectorResult> {
    try {
      const manager = createMemoryManager(this.petId);
      await manager.clearMemory();

      return {
        success: true,
        platform: "memory",
        data: { cleared: true },
      };
    } catch (e: any) {
      return { success: false, platform: "memory", data: null, error: e.message };
    }
  }
}

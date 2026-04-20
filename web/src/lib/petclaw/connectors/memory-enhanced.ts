/**
 * Enhanced Memory Connector for PetClaw
 * Knowledge graph + semantic search over pet's memories
 * Wraps the persistent memory system with advanced retrieval
 */

import type { ConnectorResult } from "./index";
import { createMemoryManager } from "../memory/persistent-memory";

export class MemoryConnector {
  private petId: number;

  constructor(petId: number) {
    this.petId = petId;
  }

  // Semantic search across all memories
  async search(query: string, limit = 10): Promise<ConnectorResult> {
    try {
      const manager = createMemoryManager(this.petId);
      const context = await manager.buildContext(query, "search");

      return {
        success: true,
        platform: "memory",
        data: {
          query,
          relevant: context.relevantMemories,
          recentMessages: context.recentMessages.slice(-limit),
          memoryMd: context.memoryMd,
          userMd: context.userMd,
        },
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

  // Export full memory for sovereignty
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

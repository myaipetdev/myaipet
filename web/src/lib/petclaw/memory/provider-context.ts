import { isProviderSafeRetainedText } from "./persistent-memory";

export interface ProviderMemoryMoment {
  id: number;
  content: string;
  created_at: Date;
}

export interface ThoughtProviderMemoryMoment extends ProviderMemoryMoment {
  emotion: string;
}

function buildProviderMomentLines(
  rows: ProviderMemoryMoment[],
  label: string,
  maxRows: number,
  maxChars: number,
): string {
  return rows
    .filter((row) => isProviderSafeRetainedText(`${label} ${row.content}`))
    .slice(0, maxRows)
    .map((row) => `- ${row.content}`)
    .join("\n")
    .slice(0, maxChars);
}

export function buildThoughtProviderMemory(recent: ThoughtProviderMemoryMoment[]): string {
  return buildProviderMomentLines(recent, "thought_memory", 3, 600);
}

export function buildDiaryProviderMemory(recent: ProviderMemoryMoment[]): string {
  return buildProviderMomentLines(recent, "diary_memory", 10, 1200);
}

export function providerSafeGreetingMemories<T extends ProviderMemoryMoment>(memories: T[]): T[] {
  return memories
    .filter((entry) => isProviderSafeRetainedText(`greeting_memory ${entry.content}`))
    .slice(0, 3);
}

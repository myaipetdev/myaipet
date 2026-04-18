import { PrismaClient } from "@/generated/prisma/client";

const USE_NEON = process.env.DATABASE_URL?.includes("neon.tech") || false;

function makePrisma() {
  if (USE_NEON) {
    // Neon serverless adapter (WebSocket-based)
    const { PrismaNeon } = require("@prisma/adapter-neon");
    const { neonConfig } = require("@neondatabase/serverless");
    const ws = require("ws");
    if (typeof globalThis.WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
    return new PrismaClient({ adapter } as any);
  }

  // Standard PostgreSQL (local/RDS)
  return new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  } as any);
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof makePrisma> };

export const prisma = globalForPrisma.prisma || makePrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

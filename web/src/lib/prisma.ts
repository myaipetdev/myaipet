import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const USE_NEON = process.env.DATABASE_URL?.includes("neon.tech") || false;

function makePrisma() {
  if (USE_NEON) {
    if (typeof globalThis.WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
    return new PrismaClient({ adapter } as any);
  }

  return new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  } as any);
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof makePrisma> };

export const prisma = globalForPrisma.prisma || makePrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

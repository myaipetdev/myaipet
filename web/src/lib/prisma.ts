import { PrismaClient } from "@/generated/prisma/client";

const IS_NEON = (process.env.DATABASE_URL || "").includes("neon.tech");

function makePrisma(): PrismaClient {
  if (IS_NEON) {
    // Dynamic import to avoid bundling ws at build time
    const { PrismaNeon } = require("@prisma/adapter-neon");
    const { neonConfig } = require("@neondatabase/serverless");
    if (typeof globalThis.WebSocket === "undefined") {
      neonConfig.webSocketConstructor = require("ws");
    }
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
    return new PrismaClient({ adapter } as any);
  }

  // Standard PostgreSQL (local / RDS)
  return new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL! },
    },
  } as any);
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof makePrisma> };

export const prisma = globalForPrisma.prisma || makePrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

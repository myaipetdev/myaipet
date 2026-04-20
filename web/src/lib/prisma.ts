import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const IS_NEON = (process.env.DATABASE_URL || "").includes("neon.tech");

function makePrisma(): any {
  if (IS_NEON) {
    // Neon serverless (WebSocket-based)
    const { PrismaNeon } = require("@prisma/adapter-neon");
    const { neonConfig } = require("@neondatabase/serverless");
    if (typeof globalThis.WebSocket === "undefined") {
      neonConfig.webSocketConstructor = require("ws");
    }
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
    return new PrismaClient({ adapter } as any);
  }

  // Standard PostgreSQL (local / RDS) via pg adapter
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter } as any);
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof makePrisma> };

export const prisma = globalForPrisma.prisma || makePrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

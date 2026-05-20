import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Standard PostgreSQL adapter — works against local Postgres, AWS RDS, or any
// vanilla PG-compatible database. Removed the Neon serverless branch as part
// of the AWS-only consolidation; if you ever need Neon support back, re-install
// `@neondatabase/serverless` + `@prisma/adapter-neon` and gate on the URL host.
function makePrisma(): any {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter } as any);
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof makePrisma> };

export const prisma = globalForPrisma.prisma || makePrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

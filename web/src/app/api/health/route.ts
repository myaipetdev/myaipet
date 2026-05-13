import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// SCRUM-57/71: health endpoint must NOT leak operational data (user count,
// DB driver details). Return a minimal liveness check that load balancers
// and uptime monitors can use without exposing anything sensitive.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}

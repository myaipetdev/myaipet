import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const userCount = await prisma.user.count();
    return NextResponse.json({
      status: "ok",
      db: "connected",
      users: userCount,
    });
  } catch (e: any) {
    return NextResponse.json({
      status: "error",
      db: "failed",
    }, { status: 500 });
  }
}

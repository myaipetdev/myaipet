import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { display_name, bio, avatar_url } = body;

    const profile = await prisma.userProfile.upsert({
      where: { user_id: user.id },
      update: {
        display_name: display_name ?? undefined,
        bio: bio ?? undefined,
        avatar_url: avatar_url ?? undefined,
      },
      create: {
        user_id: user.id,
        display_name: display_name || null,
        bio: bio || null,
        avatar_url: avatar_url || null,
      },
    });

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeName, sanitizeText, safeUrlOrEmpty } from "@/lib/sanitize";
import { applicationMediaKey, userCanAssignApplicationMedia } from "@/lib/mediaOwnership";

export async function PUT(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { display_name, bio, avatar_url } = body;
    const hasDisplayName = Object.prototype.hasOwnProperty.call(body, "display_name");
    const hasBio = Object.prototype.hasOwnProperty.call(body, "bio");
    const hasAvatar = Object.prototype.hasOwnProperty.call(body, "avatar_url");
    const cleanDisplayName = hasDisplayName ? (display_name == null ? null : sanitizeName(display_name, 50)) : undefined;
    const cleanBio = hasBio ? (bio == null ? null : sanitizeText(bio, 500)) : undefined;
    const cleanAvatar = hasAvatar
      ? (avatar_url == null || avatar_url === "" ? null : safeUrlOrEmpty(avatar_url))
      : undefined;
    if (avatar_url && !cleanAvatar) {
      return NextResponse.json({ error: "Invalid avatar URL" }, { status: 400 });
    }
    if (cleanAvatar && applicationMediaKey(cleanAvatar) && !await userCanAssignApplicationMedia(user.id, cleanAvatar)) {
      return NextResponse.json({ error: "Avatar media is not owned by this account" }, { status: 403 });
    }
    if (!hasDisplayName && !hasBio && !hasAvatar) {
      return NextResponse.json({ error: "No profile fields supplied" }, { status: 400 });
    }

    const updateData: {
      display_name?: string | null;
      bio?: string | null;
      avatar_url?: string | null;
    } = {};
    if (hasDisplayName) updateData.display_name = cleanDisplayName || null;
    if (hasBio) updateData.bio = cleanBio || null;
    if (hasAvatar) updateData.avatar_url = cleanAvatar || null;

    const profile = await prisma.userProfile.upsert({
      where: { user_id: user.id },
      update: updateData,
      create: {
        user_id: user.id,
        display_name: cleanDisplayName || null,
        bio: cleanBio || null,
        avatar_url: cleanAvatar || null,
      },
    });

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

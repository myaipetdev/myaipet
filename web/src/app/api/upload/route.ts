import { getUser } from "@/lib/auth";
import { uploadFile } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large. Max 5MB" },
      { status: 400 }
    );
  }

  try {
    const timestamp = Date.now();
    const ext = file.name.split(".").pop() || "png";
    const filename = `avatars/${user.id}/${timestamp}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await uploadFile(filename, buffer, file.type);

    return NextResponse.json({ url: result.url });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "Upload failed", details: err.message },
      { status: 500 }
    );
  }
}

import { getUser } from "@/lib/auth";
import { uploadFile } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function isPetPhoto(base64: string, mimeType: string): Promise<{ ok: boolean; reason?: string }> {
  const key = process.env.GROK_API_KEY;
  if (!key) return { ok: true }; // skip check if no key

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "grok-4-1-fast-non-reasoning",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            { type: "text", text: 'Does this image contain an animal or pet? Reply with ONLY "YES" or "NO".' },
          ],
        }],
        max_tokens: 5,
      }),
    });
    if (!res.ok) return { ok: true }; // fail-open
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content?.trim().toUpperCase() || "";
    if (answer.startsWith("NO")) return { ok: false, reason: "This doesn't look like a pet photo. Please upload a photo of an animal." };
    return { ok: true };
  } catch {
    return { ok: true }; // fail-open on error
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const skipPetCheck = formData.get("skipPetCheck") === "true"; // for non-pet uploads

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

  const buffer = Buffer.from(await file.arrayBuffer());

  // Pet photo validation (only for avatar uploads)
  if (!skipPetCheck) {
    const base64 = buffer.toString("base64");
    const check = await isPetPhoto(base64, file.type);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
  }

  try {
    const timestamp = Date.now();
    const ext = file.name.split(".").pop() || "png";
    const filename = `avatars/${user.id}/${timestamp}.${ext}`;

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

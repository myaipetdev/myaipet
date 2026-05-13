import { getUser } from "@/lib/auth";
import { uploadFile } from "@/lib/storage";
import { detectImageMime } from "@/lib/sanitize";
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

  // SCRUM-67: limit uploads to 10/min per user
  const { rateLimit } = await import("@/lib/rateLimit");
  const rl = rateLimit(req, { key: "upload", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

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

  // SCRUM-54: verify actual file bytes — client-supplied MIME / extension is
  // untrusted (attacker can label a .exe as image/png). Use magic bytes.
  const realMime = detectImageMime(buffer);
  if (!realMime) {
    return NextResponse.json(
      { error: "File is not a valid image. Allowed: JPEG, PNG, WebP, GIF" },
      { status: 400 }
    );
  }
  // Also reject if claimed MIME disagrees with sniffed MIME (defense in depth)
  if (file.type && file.type !== realMime) {
    return NextResponse.json(
      { error: "File contents do not match declared type" },
      { status: 400 }
    );
  }

  // Pet photo validation (only for avatar uploads)
  if (!skipPetCheck) {
    const base64 = buffer.toString("base64");
    const check = await isPetPhoto(base64, realMime);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
  }

  try {
    const timestamp = Date.now();
    // Force extension to match the sniffed MIME, never trust client filename
    const extByMime: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    };
    const ext = extByMime[realMime] || "png";
    const filename = `avatars/${user.id}/${timestamp}.${ext}`;

    const result = await uploadFile(filename, buffer, realMime);

    return NextResponse.json({ url: result.url });
  } catch (err: any) {
    console.error("Upload error:", err?.message);
    // SCRUM-39/61: do NOT echo err.message — strip details to client
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}

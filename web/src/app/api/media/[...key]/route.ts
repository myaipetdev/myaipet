import { getUser, getUserFromSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicGenerationWhere } from "@/lib/publicFeed";
import { publicPetWhere } from "@/lib/publicPet";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { userCanAssignApplicationMedia, userOwnsApplicationMedia } from "@/lib/mediaOwnership";

export const dynamic = "force-dynamic";

const LOCAL_UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || "/opt/petclaw/uploads";
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "local";
const S3_BUCKET = process.env.AWS_S3_BUCKET || "";
const S3_REGION = process.env.AWS_S3_REGION || "ap-northeast-2";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", avif: "image/avif", mp4: "video/mp4", webm: "video/webm",
  zip: "application/zip", json: "application/json",
};

function safeKey(parts: string[]): string | null {
  let key: string;
  try {
    key = parts.map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  if (!key || key.length > 600 || key.includes("\0")) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(key)) return null;
  if (key.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return key;
}

function referencesFor(key: string, req: NextRequest): string[] {
  const relative = `/uploads/${key}`;
  return Array.from(new Set([
    relative,
    `/api/media/${key}`,
    `${req.nextUrl.origin}${relative}`,
    `https://app.myaipet.ai${relative}`,
    `https://www.app.myaipet.ai${relative}`,
  ]));
}

function jsonContainsReference(value: unknown, references: Set<string>): boolean {
  if (typeof value === "string") return references.has(value);
  if (Array.isArray(value)) return value.some((item) => jsonContainsReference(item, references));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) => jsonContainsReference(item, references));
  }
  return false;
}

async function mediaAccess(key: string, req: NextRequest): Promise<"public" | "owner" | null> {
  const references = referencesFor(key, req);
  const pathWhere = {
    OR: [
      { photo_path: { in: references } },
      { video_path: { in: references } },
    ],
  };

  const [publicGeneration, publicPet, publicProfile, publicCaught] = await Promise.all([
    prisma.generation.findFirst({
      where: await publicGenerationWhere(pathWhere),
      select: { id: true, user_id: true },
    }),
    prisma.pet.findFirst({
      where: publicPetWhere({
        OR: [{ avatar_url: { in: references } }, { codex_url: { in: references } }],
      }),
      select: { id: true, user_id: true },
    }),
    prisma.userProfile.findFirst({
      where: { avatar_url: { in: references } },
      select: { id: true, user_id: true },
    }),
    prisma.caughtCat.findFirst({
      where: {
        source: "camera",
        map_public: true,
        photo_path: { in: references },
      },
      select: { id: true, owner_user_id: true },
    }),
  ]);
  const relative = `/uploads/${key}`;
  const publicPetOwnsObject = publicPet
    ? await userOwnsApplicationMedia(publicPet.user_id, relative)
    : false;
  const publicProfileOwnsObject = publicProfile
    ? await userOwnsApplicationMedia(publicProfile.user_id, relative)
    : false;
  const publicCaughtOwnsObject = publicCaught
    ? await userOwnsApplicationMedia(publicCaught.owner_user_id, relative)
    : false;
  if (publicGeneration || publicPetOwnsObject || publicProfileOwnsObject || publicCaughtOwnsObject) return "public";

  // Browser media elements authenticate with the HttpOnly session cookie.
  // Trusted clients such as the extension may instead fetch the object with a
  // route-scoped owner token and convert it to an isolated data URL.
  const user = await getUser(req) || await getUserFromSessionCookie(req);
  if (!user) return null;

  const [generation, pet, profile, caught] = await Promise.all([
    prisma.generation.findFirst({ where: { user_id: user.id, ...pathWhere }, select: { id: true } }),
    prisma.pet.findFirst({
      where: {
        user_id: user.id,
        OR: [{ avatar_url: { in: references } }, { codex_url: { in: references } }],
      },
      select: { id: true },
    }),
    prisma.userProfile.findFirst({
      where: { user_id: user.id, avatar_url: { in: references } },
      select: { id: true },
    }),
    prisma.caughtCat.findFirst({
      where: { owner_user_id: user.id, photo_path: { in: references } },
      select: { id: true },
    }),
  ]);
  if (generation || caught) return "owner";
  if ((pet || profile) && await userOwnsApplicationMedia(user.id, relative)) return "owner";

  // Fresh avatar/catch uploads are previewable before a DB reference is saved,
  // but never after a deletion tombstone commits.
  if (
    (key.startsWith(`avatars/${user.id}/`) || key.startsWith(`catches/${user.id}-`))
    && await userCanAssignApplicationMedia(user.id, relative)
  ) return "owner";

  const ownerPets = await prisma.pet.findMany({
    where: { user_id: user.id },
    select: {
      id: true,
      loras: { select: { lora_url: true, training_archive_ref: true, images_used: true } },
    },
  });
  const referenceSet = new Set(references);
  for (const ownerPet of ownerPets) {
    if (ownerPet.loras.some((lora) =>
      jsonContainsReference(lora.lora_url, referenceSet)
      || jsonContainsReference(lora.training_archive_ref, referenceSet)
      || jsonContainsReference(lora.images_used, referenceSet)
    )) return "owner";
  }
  return null;
}

function responseHeaders(key: string, _access: "public" | "owner") {
  const ext = key.split(".").pop()?.toLowerCase() || "";
  return new Headers({
    "Content-Type": MIME_BY_EXT[ext] || "application/octet-stream",
    // Public consent can be revoked at any moment. Never let a browser/CDN keep
    // serving bytes after the authorization row becomes private.
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  });
}

function parseRange(value: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return "invalid";
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}

async function serveLocal(key: string, req: NextRequest, access: "public" | "owner") {
  const path = await import("node:path");
  const { stat } = await import("node:fs/promises");
  const { createReadStream } = await import("node:fs");
  const root = path.resolve(LOCAL_UPLOAD_DIR);
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let file;
  try { file = await stat(target); } catch { return NextResponse.json({ error: "Not found" }, { status: 404 }); }
  if (!file.isFile()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const range = parseRange(req.headers.get("range"), file.size);
  const headers = responseHeaders(key, access);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${file.size}`);
    return new NextResponse(null, { status: 416, headers });
  }
  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    const body = Readable.toWeb(createReadStream(target, range)) as ReadableStream;
    return new NextResponse(body, { status: 206, headers });
  }
  headers.set("Content-Length", String(file.size));
  const body = Readable.toWeb(createReadStream(target)) as ReadableStream;
  return new NextResponse(body, { status: 200, headers });
}

async function serveS3(key: string, req: NextRequest, access: "public" | "owner") {
  if (!S3_BUCKET) return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region: S3_REGION });
  try {
    const object = await client.send(new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: `uploads/${key}`,
      ...(req.headers.get("range") ? { Range: req.headers.get("range")! } : {}),
    }));
    if (!object.Body) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const headers = responseHeaders(key, access);
    if (object.ContentLength != null) headers.set("Content-Length", String(object.ContentLength));
    if (object.ContentRange) headers.set("Content-Range", object.ContentRange);
    if (object.ETag) headers.set("ETag", object.ETag);
    const body = object.Body.transformToWebStream();
    return new NextResponse(body, { status: object.ContentRange ? 206 : 200, headers });
  } catch (error: any) {
    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = safeKey(parts || []);
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const access = await mediaAccess(key, req);
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return STORAGE_PROVIDER === "s3"
      ? serveS3(key, req, access)
      : serveLocal(key, req, access);
  } catch (error) {
    console.error("Protected media read failed:", error);
    return NextResponse.json({ error: "Media unavailable" }, { status: 500 });
  }
}

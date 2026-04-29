/**
 * Storage Abstraction Layer
 * Supports: S3 (AWS) | Vercel Blob (fallback)
 *
 * Set STORAGE_PROVIDER=s3 + AWS credentials for S3
 * Falls back to Vercel Blob if S3 not configured
 */

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "local"; // "s3" | "vercel" | "local"
const LOCAL_UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || "/opt/petclaw/uploads";
const LOCAL_UPLOAD_URL = process.env.LOCAL_UPLOAD_URL || "/uploads";
const S3_BUCKET = process.env.AWS_S3_BUCKET || "";
const S3_REGION = process.env.AWS_S3_REGION || "ap-northeast-2";
const S3_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID || "";
const S3_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY || "";

export interface UploadResult {
  url: string;
  key: string;
}

// ── S3 Upload (using native fetch + AWS Signature V4) ──
async function uploadToS3(filename: string, data: Blob | Buffer, contentType: string): Promise<UploadResult> {
  // Use @aws-sdk/client-s3 if available, otherwise basic PUT
  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

    const client = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
    });

    const buffer = data instanceof Blob ? Buffer.from(await data.arrayBuffer()) : data;
    const key = `uploads/${filename}`;

    await client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read",
    }));

    const url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
    return { url, key };
  } catch (e: any) {
    console.error("[Storage] S3 upload failed:", e.message);
    throw new Error(`S3 upload failed: ${e.message}`);
  }
}

// ── Local Disk Upload ──
async function uploadToLocal(filename: string, data: Blob | Buffer, _contentType: string): Promise<UploadResult> {
  const { writeFile, mkdir } = await import("fs/promises");
  const path = await import("path");
  const fullPath = path.join(LOCAL_UPLOAD_DIR, filename);
  await mkdir(path.dirname(fullPath), { recursive: true });
  const buffer = data instanceof Blob ? Buffer.from(await data.arrayBuffer()) : data;
  await writeFile(fullPath, buffer);
  const url = `${LOCAL_UPLOAD_URL}/${filename}`;
  return { url, key: filename };
}

// ── Vercel Blob Upload ──
async function uploadToVercel(filename: string, data: Blob | Buffer, _contentType: string): Promise<UploadResult> {
  const { put } = await import("@vercel/blob");
  const result = await put(filename, data, { access: "public", addRandomSuffix: false });
  return { url: result.url, key: filename };
}

// ── Public API ──

export async function uploadFile(filename: string, data: Blob | Buffer, contentType: string = "image/jpeg"): Promise<UploadResult> {
  if (STORAGE_PROVIDER === "s3" && S3_BUCKET && S3_ACCESS_KEY) {
    return uploadToS3(filename, data, contentType);
  }
  if (STORAGE_PROVIDER === "local") {
    return uploadToLocal(filename, data, contentType);
  }
  return uploadToVercel(filename, data, contentType);
}

export async function saveRemoteFile(remoteUrl: string, prefix = "generations"): Promise<string> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(remoteUrl);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const blob = await res.blob();
      const contentType = blob.type || "image/jpeg";
      const ext = contentType.includes("mp4") ? "mp4"
        : contentType.includes("webm") ? "webm"
        : contentType.includes("png") ? "png"
        : "jpg";
      const filename = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const result = await uploadFile(filename, blob, contentType);
      return result.url;
    } catch (e) {
      console.error(`saveRemoteFile attempt ${attempt + 1} failed:`, e);
      if (attempt === maxRetries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error("saveRemoteFile unreachable");
}

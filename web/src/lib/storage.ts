/**
 * Storage Abstraction Layer
 * Supports: S3 (AWS) | local disk
 *
 * Set STORAGE_PROVIDER=s3 + AWS credentials for S3 (production)
 * Defaults to local disk (dev / single-box EC2 deploys with nginx).
 */

import { randomBytes } from "node:crypto";
import { detectImageMime, isFetchableImageUrl } from "@/lib/sanitize";

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "local"; // "s3" | "local"
const LOCAL_UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || "/opt/petclaw/uploads";
const LOCAL_UPLOAD_URL = process.env.LOCAL_UPLOAD_URL || "/uploads";
const S3_BUCKET = process.env.AWS_S3_BUCKET || "";
const S3_REGION = process.env.AWS_S3_REGION || "ap-northeast-2";
const S3_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID || "";
const S3_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY || "";
const DEFAULT_LOCAL_MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB launch floor
const ABSOLUTE_LOCAL_MIN_FREE_BYTES = 64 * 1024 * 1024; // cannot be disabled accidentally
const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_REMOTE_VIDEO_BYTES = 100 * 1024 * 1024;
const REMOTE_FETCH_TIMEOUT_MS = 60_000;
const MAX_REMOTE_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SUPPORTED_MP4_BRANDS = new Set([
  "isom", "iso2", "iso3", "iso4", "iso5", "iso6",
  "mp41", "mp42", "avc1", "dash", "M4V ", "MSNV",
]);

export type RemoteMediaKind = "image" | "video";
export type RemoteMediaMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "video/mp4"
  | "video/webm";

export interface DownloadedRemoteMedia {
  buffer: Buffer;
  contentType: RemoteMediaMime;
  extension: "jpg" | "png" | "webp" | "gif" | "mp4" | "webm";
  kind: RemoteMediaKind;
}

export interface RemoteMediaDownloadRuntime {
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  urlGuard: (url: string) => Promise<boolean>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

class RemoteMediaDownloadError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
    this.name = "RemoteMediaDownloadError";
  }
}

export interface UploadResult {
  url: string;
  key: string;
}

export class StorageCapacityError extends Error {
  readonly code = "storage_capacity_floor";

  constructor() {
    super("Local storage free-space floor would be breached");
    this.name = "StorageCapacityError";
  }
}

function localMinFreeBytes(): number {
  const configured = Number(process.env.LOCAL_STORAGE_MIN_FREE_BYTES);
  if (!Number.isSafeInteger(configured) || configured <= 0) {
    return DEFAULT_LOCAL_MIN_FREE_BYTES;
  }
  return Math.max(configured, ABSOLUTE_LOCAL_MIN_FREE_BYTES);
}

export function localUploadPreservesFreeSpaceFloor(
  availableBytes: bigint,
  incomingBytes: number,
  floorBytes = localMinFreeBytes(),
): boolean {
  if (availableBytes < BigInt(0) || !Number.isSafeInteger(incomingBytes) || incomingBytes < 0
    || !Number.isSafeInteger(floorBytes) || floorBytes < 0) return false;
  return availableBytes - BigInt(incomingBytes) >= BigInt(floorBytes);
}

function allowedStorageOrigins(): Set<string> {
  const origins = new Set([
    "https://app.myaipet.ai",
    "https://www.app.myaipet.ai",
    "http://app.myaipet.ai", // legacy rows are canonicalised during migration
    "http://www.app.myaipet.ai",
  ]);
  for (const candidate of [
    process.env.AWS_S3_PUBLIC_URL,
    ...String(process.env.STORAGE_ALLOWED_ORIGINS || "").split(","),
    /^https?:\/\//i.test(LOCAL_UPLOAD_URL) ? LOCAL_UPLOAD_URL : "",
  ]) {
    if (!candidate) continue;
    try { origins.add(new URL(candidate.trim()).origin.toLowerCase()); } catch {}
  }
  if (S3_BUCKET) {
    origins.add(`https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`.toLowerCase());
    origins.add(`https://${S3_BUCKET}.s3.amazonaws.com`.toLowerCase());
  }
  return origins;
}

function keyFromPath(pathname: string, requireUploadPrefix = false): string | null {
  // Generated object names never need URL encoding. Rejecting it outright also
  // closes encoded slash/dot traversal and double-decoding ambiguity.
  if (!pathname || pathname.includes("%") || pathname.includes("\\") || pathname.includes("\0")) return null;
  const localPath = /^https?:\/\//i.test(LOCAL_UPLOAD_URL)
    ? new URL(LOCAL_UPLOAD_URL).pathname
    : LOCAL_UPLOAD_URL;
  const localPrefix = localPath.replace(/^\/+|\/+$/g, "") || "uploads";
  const relative = pathname.replace(/^\/+/, "");
  const hasUploadPrefix = relative.startsWith(`${localPrefix}/`) || relative.startsWith("uploads/");
  if (requireUploadPrefix && !hasUploadPrefix) return null;
  const key = relative.startsWith(`${localPrefix}/`)
    ? relative.slice(localPrefix.length + 1)
    : relative.startsWith("uploads/")
      ? relative.slice("uploads/".length)
      : relative;
  if (!key || key.length > 600 || !/^[A-Za-z0-9._/-]+$/.test(key)) return null;
  if (key.split("/").some((part) => !part || part.length > 255 || part === "." || part === "..")) return null;
  return key;
}

export function storageKey(value: string): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input || input.length > 2048 || input.includes("?") || input.includes("#")) return null;
  const rawPath = input.replace(/^https?:\/\/[^/]+/i, "");
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath)) return null;

  // Absolute URLs are ownership-bearing references: only the exact first-party
  // or explicitly configured bucket/CDN origin may resolve to an internal key.
  if (/^https?:\/\//i.test(input)) {
    try {
      const parsed = new URL(input);
      if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
      if (!allowedStorageOrigins().has(parsed.origin.toLowerCase())) return null;
      return keyFromPath(parsed.pathname, true);
    } catch {
      return null;
    }
  }

  // Relative values are produced by trusted storage code and still receive the
  // same traversal/canonical-form validation.
  return keyFromPath(input);
}

function assertStorageFilename(filename: string): void {
  if (
    typeof filename !== "string" ||
    filename.length === 0 ||
    filename.length > 600 ||
    filename.startsWith("/") ||
    filename.includes("%") ||
    filename.includes("\\") ||
    filename.includes("\0") ||
    !/^[A-Za-z0-9._/-]+$/.test(filename) ||
    filename.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Invalid storage filename");
  }
}

// ── S3 Upload (using native fetch + AWS Signature V4) ──
async function uploadToS3(filename: string, data: Blob | Buffer, contentType: string): Promise<UploadResult> {
  // Use @aws-sdk/client-s3 if available, otherwise basic PUT
  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

    if (!S3_BUCKET) throw new Error("AWS_S3_BUCKET is required");
    if (Boolean(S3_ACCESS_KEY) !== Boolean(S3_SECRET_KEY)) {
      throw new Error("Both AWS access-key variables must be set, or both omitted for an IAM role");
    }
    const client = new S3Client({
      region: S3_REGION,
      ...(S3_ACCESS_KEY ? {
        credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
      } : {}),
    });

    const buffer = data instanceof Blob ? Buffer.from(await data.arrayBuffer()) : data;
    const key = `uploads/${filename}`;

    await client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    }));

    // Store a stable app URL, never a bucket URL. /uploads/* is mediated by the
    // authenticated/public-consent media route in every storage mode.
    const url = `${LOCAL_UPLOAD_URL}/${filename}`;
    return { url, key };
  } catch (e: any) {
    console.error("[Storage] S3 upload failed:", e.message);
    throw new Error(`S3 upload failed: ${e.message}`);
  }
}

// ── Local Disk Upload ──
async function uploadToLocal(filename: string, data: Blob | Buffer, _contentType: string): Promise<UploadResult> {
  const { writeFile, mkdir, rename, unlink, chmod, statfs } = await import("fs/promises");
  const path = await import("path");
  const root = path.resolve(LOCAL_UPLOAD_DIR);
  const fullPath = path.resolve(root, filename);
  if (!fullPath.startsWith(`${root}${path.sep}`)) throw new Error("Storage filename escaped root");
  const parent = path.dirname(fullPath);
  const buffer = data instanceof Blob ? Buffer.from(await data.arrayBuffer()) : data;
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await chmod(parent, 0o700);
  // statfs is checked immediately before the private temporary write. Include
  // the full incoming object so a successful write still leaves the configured
  // emergency floor available for the database, logs, and cleanup worker.
  const filesystem = await statfs(parent, { bigint: true });
  const availableBytes = filesystem.bavail * filesystem.bsize;
  if (!localUploadPreservesFreeSpaceFloor(availableBytes, buffer.byteLength)) {
    throw new StorageCapacityError();
  }
  // Never stream into the authoritative path. A failed disk write leaves only a
  // private temporary file, and rename atomically replaces an older stable-name
  // object after the new bytes are complete.
  const tempPath = `${fullPath}.partial-${process.pid}-${randomBytes(8).toString("hex")}`;
  try {
    await writeFile(tempPath, buffer, { flag: "wx", mode: 0o600 });
    await rename(tempPath, fullPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
  const url = `${LOCAL_UPLOAD_URL}/${filename}`;
  return { url, key: filename };
}

// ── Public API ──

export async function uploadFile(filename: string, data: Blob | Buffer, contentType: string = "image/jpeg"): Promise<UploadResult> {
  assertStorageFilename(filename);
  if (STORAGE_PROVIDER === "s3") return uploadToS3(filename, data, contentType);
  if (STORAGE_PROVIDER === "local") return uploadToLocal(filename, data, contentType);
  throw new Error(`Unsupported STORAGE_PROVIDER '${STORAGE_PROVIDER}'`);
}

/** Read a stored object from trusted server-side code (never exposed directly). */
export async function readStoredFile(value: string): Promise<Buffer> {
  const key = storageKey(value);
  if (!key) throw new Error("Unrecognised storage path");
  const s3Key = key.startsWith("uploads/") ? key : `uploads/${key}`;

  if (STORAGE_PROVIDER === "s3" && S3_BUCKET) {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({ region: S3_REGION });
    const object = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }));
    if (!object.Body) throw new Error("Stored object has no body");
    return Buffer.from(await object.Body.transformToByteArray());
  }

  const { readFile } = await import("fs/promises");
  const path = await import("path");
  const relative = s3Key.slice("uploads/".length);
  const root = path.resolve(LOCAL_UPLOAD_DIR);
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Storage path escaped root");
  return readFile(target);
}

/** Check object existence without loading private media into application memory. */
export async function storedFileExists(value: string): Promise<boolean> {
  const key = storageKey(value);
  if (!key) return false;
  const s3Key = key.startsWith("uploads/") ? key : `uploads/${key}`;

  if (STORAGE_PROVIDER === "s3" && S3_BUCKET) {
    const { S3Client, HeadObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const client = new S3Client({ region: S3_REGION });
      await client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }));
      return true;
    } catch (error: any) {
      const status = Number(error?.$metadata?.httpStatusCode || 0);
      if (status === 404 || error?.name === "NotFound" || error?.name === "NoSuchKey") return false;
      throw error;
    }
  }

  const { stat } = await import("fs/promises");
  const path = await import("path");
  const relative = s3Key.slice("uploads/".length);
  const root = path.resolve(LOCAL_UPLOAD_DIR);
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`)) return false;
  try {
    return (await stat(target)).isFile();
  } catch (error: any) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw error;
  }
}

export interface StoredPrefixListing {
  references: string[];
  truncated: boolean;
}

/**
 * Bounded inventory for server-owned legacy objects that predate DB metadata.
 * The prefix is an internal key prefix, never user input. Callers must treat a
 * truncated result as fail-closed so deletion intent cannot silently lose the
 * unlisted tail.
 */
export async function listStoredFileReferencesByPrefix(
  prefix: string,
  limit = 500,
): Promise<StoredPrefixListing> {
  if (
    typeof prefix !== "string" ||
    prefix.length === 0 ||
    prefix.length > 500 ||
    prefix.startsWith("/") ||
    !/^[A-Za-z0-9._/-]+$/.test(prefix) ||
    prefix.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Invalid storage inventory prefix");
  }
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 500);

  if (STORAGE_PROVIDER === "s3") {
    if (!S3_BUCKET) throw new Error("AWS_S3_BUCKET is required");
    const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: S3_REGION,
      ...(S3_ACCESS_KEY ? {
        credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
      } : {}),
    });
    const storagePrefix = `uploads/${prefix}`;
    const result = await client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: storagePrefix,
      MaxKeys: boundedLimit + 1,
    }));
    const keys = (result.Contents || [])
      .map((entry) => entry.Key || "")
      .filter((key) => key.startsWith(storagePrefix) && key.length > "uploads/".length)
      .map((key) => `/uploads/${key.slice("uploads/".length)}`)
      .sort();
    return {
      references: keys.slice(0, boundedLimit),
      truncated: Boolean(result.IsTruncated) || keys.length > boundedLimit,
    };
  }
  if (STORAGE_PROVIDER !== "local") {
    throw new Error(`Unsupported STORAGE_PROVIDER '${STORAGE_PROVIDER}'`);
  }

  const path = await import("path");
  const { readdir } = await import("fs/promises");
  const root = path.resolve(LOCAL_UPLOAD_DIR);
  const slash = prefix.lastIndexOf("/");
  const relativeDir = slash >= 0 ? prefix.slice(0, slash) : "";
  const filenamePrefix = slash >= 0 ? prefix.slice(slash + 1) : prefix;
  const directory = path.resolve(root, relativeDir);
  if (directory !== root && !directory.startsWith(`${root}${path.sep}`)) {
    throw new Error("Storage inventory prefix escaped root");
  }
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return { references: [], truncated: false };
    }
    throw error;
  }
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(filenamePrefix))
    .map((entry) => entry.name)
    .sort();
  return {
    references: names.slice(0, boundedLimit).map((name) =>
      `/uploads/${relativeDir ? `${relativeDir}/` : ""}${name}`
    ),
    truncated: names.length > boundedLimit,
  };
}

/** Short-lived provider download URL for a private S3 object. */
export async function temporaryStoredFileUrl(value: string, expiresIn = 3600): Promise<string> {
  const key = storageKey(value);
  if (!key) throw new Error("Unrecognised storage path");
  if (STORAGE_PROVIDER !== "s3" || !S3_BUCKET) {
    throw new Error("Temporary external URLs require private S3 storage");
  }
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = new S3Client({ region: S3_REGION });
  const s3Key = key.startsWith("uploads/") ? key : `uploads/${key}`;
  return getSignedUrl(client, new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }), { expiresIn });
}

/**
 * Delete an object previously returned by this module.
 *
 * The path checks deliberately reject arbitrary filesystem paths. Deletion is
 * idempotent so a partially-completed privacy request can be retried safely.
 */
export async function deleteStoredFile(value: string | null | undefined): Promise<void> {
  if (!value) return;
  const key = storageKey(value);
  if (!key) throw new Error("Refusing to delete an unrecognised storage path");

  if (STORAGE_PROVIDER === "s3") {
    if (!S3_BUCKET) throw new Error("AWS_S3_BUCKET is required");
    if (Boolean(S3_ACCESS_KEY) !== Boolean(S3_SECRET_KEY)) {
      throw new Error("Both AWS access-key variables must be set, or both omitted for an IAM role");
    }
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: S3_REGION,
      ...(S3_ACCESS_KEY ? {
        credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
      } : {}),
    });
    const s3Key = key.startsWith("uploads/") ? key : `uploads/${key}`;
    await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }));
    return;
  }

  const { unlink } = await import("fs/promises");
  const path = await import("path");
  const relative = key.startsWith("uploads/") ? key.slice("uploads/".length) : key;
  const root = path.resolve(LOCAL_UPLOAD_DIR);
  const target = path.resolve(root, relative);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Refusing to delete outside the upload directory");
  }
  try {
    await unlink(target);
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function canonicalRemoteHttpUrl(value: string): string {
  const input = String(value || "").trim();
  if (!input || input.length > 2048) throw new RemoteMediaDownloadError("Remote media URL is invalid");
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new RemoteMediaDownloadError("Remote media URL is invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new RemoteMediaDownloadError("Remote media URL is invalid");
  }
  return parsed.toString();
}

function normalizedDeclaredMediaMime(value: string | null): RemoteMediaMime | null {
  const mime = (value || "").split(";", 1)[0].trim().toLowerCase();
  if (!mime || mime === "application/octet-stream" || mime === "binary/octet-stream") return null;
  const aliases: Record<string, RemoteMediaMime> = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/png": "image/png",
    "image/webp": "image/webp",
    "image/gif": "image/gif",
    "video/mp4": "video/mp4",
    "application/mp4": "video/mp4",
    "video/x-m4v": "video/mp4",
    "video/webm": "video/webm",
  };
  const normalized = aliases[mime];
  if (!normalized) throw new RemoteMediaDownloadError("Remote media Content-Type is not supported");
  return normalized;
}

function detectVideoMime(buffer: Buffer): "video/mp4" | "video/webm" | null {
  if (buffer.length >= 16 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const boxSize = buffer.readUInt32BE(0);
    if (boxSize >= 16 && boxSize <= buffer.length) {
      const majorBrand = buffer.subarray(8, 12).toString("ascii");
      if (SUPPORTED_MP4_BRANDS.has(majorBrand)) return "video/mp4";
      for (let offset = 16; offset + 4 <= Math.min(boxSize, 128); offset += 4) {
        if (SUPPORTED_MP4_BRANDS.has(buffer.subarray(offset, offset + 4).toString("ascii"))) {
          return "video/mp4";
        }
      }
    }
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3 &&
    buffer.subarray(4, Math.min(buffer.length, 4096)).indexOf(Buffer.from("webm", "ascii")) !== -1
  ) {
    return "video/webm";
  }
  return null;
}

function validateRemoteMediaBytes(
  buffer: Buffer,
  declaredMime: RemoteMediaMime | null,
  expectedKind: RemoteMediaKind,
): DownloadedRemoteMedia {
  const detectedMime = detectImageMime(buffer) || detectVideoMime(buffer);
  if (!detectedMime) {
    throw new RemoteMediaDownloadError("Remote media bytes are not a supported image or video");
  }
  const kind: RemoteMediaKind = detectedMime.startsWith("image/") ? "image" : "video";
  if (kind !== expectedKind) {
    throw new RemoteMediaDownloadError(`Remote media is not the expected ${expectedKind} type`);
  }
  if (declaredMime && declaredMime !== detectedMime) {
    throw new RemoteMediaDownloadError("Remote media MIME does not match its file bytes");
  }
  const extensions: Record<RemoteMediaMime, DownloadedRemoteMedia["extension"]> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return { buffer, contentType: detectedMime, extension: extensions[detectedMime], kind };
}

function waitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new RemoteMediaDownloadError("Remote media fetch timed out", true));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new RemoteMediaDownloadError("Remote media fetch timed out", true));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function readBoundedRemoteBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const rawLength = response.headers.get("content-length")?.trim();
  let declaredLength: number | null = null;
  if (rawLength) {
    if (!/^(?:0|[1-9]\d*)$/.test(rawLength)) {
      throw new RemoteMediaDownloadError("Remote media Content-Length is invalid");
    }
    declaredLength = Number(rawLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > maxBytes) {
      throw new RemoteMediaDownloadError("Remote media exceeds the size limit");
    }
  }
  if (!response.body) throw new RemoteMediaDownloadError("Remote media has no response body");

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await waitWithAbort(reader.read(), signal);
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RemoteMediaDownloadError("Remote media exceeds the size limit");
      }
      chunks.push(Buffer.from(value));
      // Prevent a hostile one-byte-chunk response from growing an unbounded
      // metadata array while remaining below the byte ceiling.
      if (chunks.length >= 1024) {
        const compacted = Buffer.concat(chunks);
        chunks.length = 0;
        chunks.push(compacted);
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof RemoteMediaDownloadError) throw error;
    throw new RemoteMediaDownloadError("Remote media stream failed", true);
  } finally {
    reader.releaseLock();
  }

  if (total === 0) throw new RemoteMediaDownloadError("Remote media is empty");
  const encoding = (response.headers.get("content-encoding") || "identity").trim().toLowerCase();
  if (declaredLength !== null && encoding === "identity" && declaredLength !== total) {
    throw new RemoteMediaDownloadError("Remote media body length does not match Content-Length");
  }
  return Buffer.concat(chunks, total);
}

const defaultRemoteMediaRuntime: RemoteMediaDownloadRuntime = {
  fetchImpl: (url, init) => fetch(url, init),
  urlGuard: (url) => isFetchableImageUrl(url),
};

/**
 * Download one provider result without following an unvalidated redirect.
 * Runtime injection exists solely for deterministic contract tests; production
 * callers use the DNS/IP guard above and the hard byte/redirect ceilings here.
 */
export async function downloadRemoteMediaForStorage(
  remoteUrl: string,
  expectedKind: RemoteMediaKind,
  runtime: RemoteMediaDownloadRuntime = defaultRemoteMediaRuntime,
): Promise<DownloadedRemoteMedia> {
  if (expectedKind !== "image" && expectedKind !== "video") {
    throw new RemoteMediaDownloadError("Remote media kind is invalid");
  }
  const hardMaxBytes = expectedKind === "video" ? MAX_REMOTE_VIDEO_BYTES : MAX_REMOTE_IMAGE_BYTES;
  if (runtime.maxBytes !== undefined && (!Number.isFinite(runtime.maxBytes) || runtime.maxBytes <= 0)) {
    throw new RemoteMediaDownloadError("Remote media byte limit is invalid");
  }
  if (runtime.timeoutMs !== undefined && (!Number.isFinite(runtime.timeoutMs) || runtime.timeoutMs <= 0)) {
    throw new RemoteMediaDownloadError("Remote media timeout is invalid");
  }
  if (runtime.maxRedirects !== undefined && (!Number.isFinite(runtime.maxRedirects) || runtime.maxRedirects < 0)) {
    throw new RemoteMediaDownloadError("Remote media redirect limit is invalid");
  }
  const maxBytes = runtime.maxBytes === undefined
    ? hardMaxBytes
    : Math.min(Math.max(1, Math.floor(runtime.maxBytes)), hardMaxBytes);
  const timeoutMs = runtime.timeoutMs === undefined
    ? REMOTE_FETCH_TIMEOUT_MS
    : Math.min(Math.max(1, Math.floor(runtime.timeoutMs)), REMOTE_FETCH_TIMEOUT_MS);
  const maxRedirects = runtime.maxRedirects === undefined
    ? MAX_REMOTE_REDIRECTS
    : Math.min(Math.max(0, Math.floor(runtime.maxRedirects)), MAX_REMOTE_REDIRECTS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let current = canonicalRemoteHttpUrl(remoteUrl);

  try {
    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
      // Re-run URL syntax, DNS, and private/link-local/metadata IP checks before
      // every network hop. fetch() is forced into manual redirect mode so it can
      // never bypass this gate on our behalf.
      current = canonicalRemoteHttpUrl(current);
      const allowed = await waitWithAbort(runtime.urlGuard(current), controller.signal);
      if (!allowed) throw new RemoteMediaDownloadError("Remote media URL is not allowed");

      let response: Response;
      try {
        response = await waitWithAbort(runtime.fetchImpl(current, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
          headers: {
            Accept: "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/octet-stream;q=0.5",
            "Accept-Encoding": "identity",
          },
        }), controller.signal);
      } catch (error) {
        if (error instanceof RemoteMediaDownloadError) throw error;
        throw new RemoteMediaDownloadError("Remote media fetch failed", true);
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get("location");
        if (!location || redirects === maxRedirects) {
          throw new RemoteMediaDownloadError("Remote media redirected too many times");
        }
        try {
          current = canonicalRemoteHttpUrl(new URL(location, current).toString());
        } catch (error) {
          if (error instanceof RemoteMediaDownloadError) throw error;
          throw new RemoteMediaDownloadError("Remote media redirect URL is invalid");
        }
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        const retryable = response.status === 408 || response.status === 425 ||
          response.status === 429 || response.status >= 500;
        throw new RemoteMediaDownloadError(`Remote media returned HTTP ${response.status}`, retryable);
      }

      try {
        const declaredMime = normalizedDeclaredMediaMime(response.headers.get("content-type"));
        const buffer = await readBoundedRemoteBody(response, maxBytes, controller.signal);
        return validateRemoteMediaBytes(buffer, declaredMime, expectedKind);
      } catch (error) {
        // Release the socket/body for MIME and Content-Length failures that occur
        // before a reader is established. readBoundedRemoteBody also cancels its
        // own reader on streaming failures.
        await response.body?.cancel().catch(() => undefined);
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof RemoteMediaDownloadError) throw error;
    if (controller.signal.aborted) {
      throw new RemoteMediaDownloadError("Remote media fetch timed out", true);
    }
    throw new RemoteMediaDownloadError("Remote media download failed", true);
  } finally {
    clearTimeout(timer);
  }
  throw new RemoteMediaDownloadError("Remote media download failed");
}

/**
 * Persist a provider URL inside the application privacy boundary.
 * `stableBasename` is used by generation settlement so a retry after an app
 * crash atomically overwrites the same logical object instead of leaking a
 * second partially-written file.
 */
export async function saveRemoteFile(
  remoteUrl: string,
  prefix = "generations",
  stableBasename?: string,
  expectedKind?: RemoteMediaKind,
  runtime: RemoteMediaDownloadRuntime = defaultRemoteMediaRuntime,
): Promise<string> {
  if (stableBasename && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(stableBasename)) {
    throw new Error("Invalid stable storage basename");
  }
  // Validate the fixed portion before making a paid/provider network request.
  assertStorageFilename(`${prefix}/remote-media.bin`);
  const kind = expectedKind || (prefix === "videos" || prefix.startsWith("videos/") ? "video" : "image");
  const maxRetries = 2;
  let media: DownloadedRemoteMedia | undefined;

  for (let attempt = 0; attempt <= maxRetries && !media; attempt++) {
    try {
      media = await downloadRemoteMediaForStorage(remoteUrl, kind, runtime);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown remote media error";
      console.error(`saveRemoteFile download attempt ${attempt + 1} failed: ${message}`);
      const retryable = error instanceof RemoteMediaDownloadError && error.retryable;
      if (!retryable || attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  if (!media) throw new Error("Remote media download failed");

  const basename = stableBasename || `${Date.now()}-${randomBytes(6).toString("hex")}`;
  const filename = `${prefix}/${basename}.${media.extension}`;
  let lastUploadError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await uploadFile(filename, media.buffer, media.contentType);
      return result.url;
    } catch (error) {
      lastUploadError = error;
      const message = error instanceof Error ? error.message : "unknown storage error";
      console.error(`saveRemoteFile storage attempt ${attempt + 1} failed: ${message}`);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastUploadError instanceof Error ? lastUploadError : new Error("Remote media storage failed");
}

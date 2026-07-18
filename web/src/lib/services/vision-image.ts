/**
 * Convert an owner-controlled image reference into a provider-safe vision
 * input. Private /uploads objects become bounded, magic-byte-verified data
 * URLs; external URLs must pass the fetch-time SSRF guard; arbitrary schemes,
 * localhost/metadata targets, SVG, and MIME spoofing fail closed.
 */

import { detectImageMime, isFetchableImageUrl } from "@/lib/sanitize";
import { readStoredFile } from "@/lib/storage";

const MAX_VISION_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_VISION_IMAGE_BYTES / 3) * 4 + 4;
const MAX_EXTERNAL_REDIRECTS = 3;
const EXTERNAL_FETCH_TIMEOUT_MS = 15_000;
const STORED_IMAGE = /^\/uploads\/[A-Za-z0-9._/-]+$/;
const DATA_IMAGE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/i;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function verifiedDataUrl(buffer: Buffer, declaredMime?: string): string {
  if (buffer.length === 0 || buffer.length > MAX_VISION_IMAGE_BYTES) {
    throw new Error("Vision image is empty or exceeds the 8MB limit");
  }
  const detectedMime = detectImageMime(buffer);
  if (!detectedMime) throw new Error("Vision image must be JPEG, PNG, WebP, or GIF");
  if (declaredMime) {
    const normalized = declaredMime.toLowerCase() === "image/jpg" ? "image/jpeg" : declaredMime.toLowerCase();
    if (normalized !== detectedMime) throw new Error("Vision image MIME does not match its file bytes");
  }
  return `data:${detectedMime};base64,${buffer.toString("base64")}`;
}

async function readBoundedResponseBody(response: Response): Promise<Buffer> {
  const rawLength = response.headers.get("content-length");
  if (rawLength) {
    if (!/^\d+$/.test(rawLength) || Number(rawLength) > MAX_VISION_IMAGE_BYTES) {
      throw new Error("External vision image exceeds the 8MB limit");
    }
  }
  if (!response.body) throw new Error("External vision image has no response body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_VISION_IMAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("External vision image exceeds the 8MB limit");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

async function materializeExternalImage(input: string): Promise<string> {
  let current = input;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_FETCH_TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= MAX_EXTERNAL_REDIRECTS; redirects++) {
      // Re-run the DNS/IP guard for the original URL and every redirect target.
      if (!(await isFetchableImageUrl(current))) throw new Error("External vision image URL is not allowed");
      const response = await fetch(current, { redirect: "manual", signal: controller.signal });
      if (REDIRECT_STATUS.has(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get("location");
        if (!location || redirects === MAX_EXTERNAL_REDIRECTS) {
          throw new Error("External vision image redirected too many times");
        }
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) throw new Error(`External vision image returned HTTP ${response.status}`);

      const buffer = await readBoundedResponseBody(response);
      const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
      const declaredMime = /^image\/(?:jpeg|jpg|png|webp|gif)$/.test(contentType) ? contentType : undefined;
      return verifiedDataUrl(buffer, declaredMime);
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("External vision image fetch timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
  throw new Error("External vision image could not be loaded");
}

export async function prepareVisionImageInput(
  value: string,
  options: { materializeExternal?: boolean } = {},
): Promise<string> {
  const input = String(value || "").trim();
  if (!input) throw new Error("Vision image is required");

  if (input.startsWith("/uploads/")) {
    if (!STORED_IMAGE.test(input) || input.slice("/uploads/".length).split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("Invalid stored vision image path");
    }
    return verifiedDataUrl(await readStoredFile(input));
  }

  if (input.startsWith("data:")) {
    if (input.length > MAX_BASE64_CHARS + 64) throw new Error("Vision data URL exceeds the 8MB limit");
    const match = DATA_IMAGE.exec(input);
    if (!match || match[2].length > MAX_BASE64_CHARS) {
      throw new Error("Vision data URL must contain a base64 JPEG, PNG, WebP, or GIF");
    }
    const payload = match[2].replace(/[\r\n]/g, "");
    return verifiedDataUrl(Buffer.from(payload, "base64"), `image/${match[1]}`);
  }

  if (!/^https?:\/\//i.test(input) || !(await isFetchableImageUrl(input))) {
    throw new Error("External vision image URL is not allowed");
  }
  return options.materializeExternal ? materializeExternalImage(input) : input;
}

export const VISION_IMAGE_MAX_BYTES = MAX_VISION_IMAGE_BYTES;

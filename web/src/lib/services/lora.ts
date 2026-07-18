/**
 * Pet-LoRA fine-tuning pipeline (fal.ai flux-lora-fast-training).
 *
 * Gives each pet a real identity model instead of prompt-only anchoring:
 *   1. Collect training images — the pet's avatar + its owner's completed
 *      generations of the same species (the best identity set we have today).
 *   2. Pack them into a STORE-only zip (no deps) and upload via our storage
 *      layer — fal downloads the zip from that URL, so it must be public
 *      (S3 in production; localhost storage can't train).
 *   3. Submit to fal's queue, persist a PetLora row, poll lazily on GET.
 *   4. Once ready, image generation swaps to fal-ai/flux-lora with the pet's
 *      trigger word (see falLoraImage), falling back to the Grok path on any
 *      failure.
 *
 * Env: FAL_API_KEY (existing) + PET_LORA_ENABLED=true to expose the routes.
 */

import { prisma } from "@/lib/prisma";
import { deleteStoredFile, readStoredFile, temporaryStoredFileUrl, uploadFile } from "@/lib/storage";
import { isFetchableImageUrl } from "@/lib/sanitize";
import { consumeImageBudget } from "@/lib/llm/router";

const TRAINER_MODEL = "fal-ai/flux-lora-fast-training";
const LORA_GEN_MODEL = "fal-ai/flux-lora";
const MIN_IMAGES = 4;          // below this, identity training just memorizes noise
const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const GEN_POLL_TIMEOUT_MS = 45_000;
const GEN_POLL_INTERVAL_MS = 2_500;

export function loraEnabled(): boolean {
  return process.env.PET_LORA_ENABLED === "true" && !!process.env.FAL_API_KEY;
}

export function triggerWordFor(petId: number): string {
  // Rare token the model binds the identity to — never a real English word.
  return `p3tx${petId}`;
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function absolutize(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${appBaseUrl()}${url}`;
  return url;
}

// ── Minimal STORE-only ZIP writer (JPEG/PNG don't recompress anyway) ──

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function buildStoreZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);  // local file header signature
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(0, 8);           // method: STORE
    local.writeUInt16LE(0, 10);          // mod time
    local.writeUInt16LE(0x21, 12);       // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size (= raw for STORE)
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);          // extra length
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central dir signature
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(0, 8);          // flags
    central.writeUInt16LE(0, 10);         // method
    central.writeUInt16LE(0, 12);         // mod time
    central.writeUInt16LE(0x21, 14);      // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);         // extra
    central.writeUInt16LE(0, 32);         // comment
    central.writeUInt16LE(0, 34);         // disk start
    central.writeUInt16LE(0, 36);         // internal attrs
    central.writeUInt32LE(0, 38);         // external attrs
    central.writeUInt32LE(offset, 42);    // local header offset
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);              // disk number
  eocd.writeUInt16LE(0, 6);              // central dir start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);        // central dir offset
  eocd.writeUInt16LE(0, 20);             // comment length

  return Buffer.concat([...locals, ...centrals, eocd]);
}

// ── Training image collection ──

export async function collectTrainingImages(pet: {
  id: number; user_id: number; species: number; avatar_url: string | null;
}): Promise<string[]> {
  const urls: string[] = [];
  if (pet.avatar_url) urls.push(absolutize(pet.avatar_url));

  // Exact identity set: only generations explicitly linked to this pet.
  const gens = await prisma.generation.findMany({
    where: {
      pet_id: pet.id,
      status: "completed",
      photo_path: { not: "" },
      credits_charged: { gt: 0 }, // styled generations only — skips raw avatar copies
    },
    orderBy: { created_at: "desc" },
    take: MAX_IMAGES * 2,
    select: { photo_path: true },
  });
  for (const g of gens) urls.push(absolutize(g.photo_path));

  // Dedupe, keep http(s) only, cap.
  return [...new Set(urls)].filter(u => /^https?:\/\//i.test(u)).slice(0, MAX_IMAGES);
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith(`${appBaseUrl()}/uploads/`) || url.startsWith("/uploads/")) {
      const buffer = await readStoredFile(url);
      return buffer.length > 0 && buffer.length <= MAX_IMAGE_BYTES ? buffer : null;
    }
    if (!(await isFetchableImageUrl(url))) {
      // Allow our own app-served uploads (localhost in dev) — isFetchableImageUrl
      // rejects loopback, but these are our files, fetched by us.
      if (!url.startsWith(appBaseUrl())) return null;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

// ── fal queue helpers ──

function falKey(): string {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY not configured");
  return key;
}

async function falQueueSubmit(model: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${falKey()}` },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.error || `fal submit ${res.status}`);
  if (!data.request_id) throw new Error("fal returned no request_id");
  return data.request_id;
}

async function falQueueStatus(model: string, requestId: string): Promise<{ status: string; result?: any; error?: string }> {
  const res = await fetch(`https://queue.fal.run/${model}/requests/${requestId}/status`, {
    headers: { Authorization: `Key ${falKey()}` },
  });
  const s: any = await res.json().catch(() => ({}));
  if (s.status === "COMPLETED") {
    const rRes = await fetch(`https://queue.fal.run/${model}/requests/${requestId}`, {
      headers: { Authorization: `Key ${falKey()}` },
    });
    const result = await rRes.json().catch(() => null);
    return { status: "completed", result };
  }
  if (s.status === "FAILED" || s.status === "ERROR") {
    return { status: "failed", error: s?.error || "fal job failed" };
  }
  return { status: "running" };
}

// ── Pipeline ──

export async function submitPetLoraTraining(pet: {
  id: number; user_id: number; species: number; avatar_url: string | null;
}): Promise<{ loraId: number; imagesUsed: string[] }> {
  const urls = await collectTrainingImages(pet);
  if (urls.length < MIN_IMAGES) {
    throw new Error(
      `Need at least ${MIN_IMAGES} images to train (have ${urls.length}). ` +
      `Generate a few more styled images of this pet first.`
    );
  }

  const downloads = await Promise.all(urls.map(downloadImage));
  const entries: Array<{ name: string; data: Buffer }> = [];
  const used: string[] = [];
  downloads.forEach((buf, i) => {
    if (buf) {
      entries.push({ name: `img_${String(i).padStart(2, "0")}.jpg`, data: buf });
      used.push(urls[i]);
    }
  });
  if (entries.length < MIN_IMAGES) {
    throw new Error(`Only ${entries.length} of ${urls.length} training images were downloadable.`);
  }

  const zip = buildStoreZip(entries);
  let trainingArchiveRef: string | null = null;
  try {
    const uploaded = await uploadFile(
      `lora-train/pet-${pet.id}-${Date.now()}.zip`,
      zip,
      "application/zip"
    );
    trainingArchiveRef = uploaded.url;
    const zipUrl = await temporaryStoredFileUrl(uploaded.url, 3600);

    const trigger = triggerWordFor(pet.id);
    const requestId = await falQueueSubmit(TRAINER_MODEL, {
      images_data_url: zipUrl,
      trigger_word: trigger,
      is_style: false,
    });

    const row = await prisma.petLora.create({
      data: {
        pet_id: pet.id,
        status: "training",
        fal_request_id: requestId,
        training_archive_ref: trainingArchiveRef,
        trigger_word: trigger,
        images_used: used,
      },
    });

    return { loraId: row.id, imagesUsed: used };
  } catch (error) {
    // Upload succeeded but provider/DB persistence did not. Delete immediately;
    // if storage is unavailable, retain durable deletion intent. The strict
    // server-issued pet-id filename also lets a later pet deletion inventory
    // pre-metadata archives without trusting user-controlled paths.
    if (trainingArchiveRef) {
      try {
        await deleteStoredFile(trainingArchiveRef);
      } catch (cleanupError) {
        await prisma.mediaDeletionTask.upsert({
          where: { object_ref: trainingArchiveRef },
          create: {
            object_ref: trainingArchiveRef,
            owner_user_id: pet.user_id,
            source_pet_id: pet.id,
            attempts: 1,
            last_error: "LoRA training archive immediate cleanup failed",
          },
          update: {
            attempts: { increment: 1 },
            last_error: "LoRA training archive immediate cleanup failed",
          },
        }).catch(() => {
          console.error("[lora] archive cleanup and durable cleanup enqueue both failed", cleanupError instanceof Error ? cleanupError.name : "unknown");
        });
      }
    }
    throw error;
  }
}

/** Lazy poll — called from the GET route while a training run is in flight. */
export async function pollPetLora(loraId: number) {
  const row = await prisma.petLora.findUnique({ where: { id: loraId } });
  if (!row || row.status !== "training" || !row.fal_request_id) return row;

  const st = await falQueueStatus(TRAINER_MODEL, row.fal_request_id);
  if (st.status === "completed") {
    const loraUrl: string | undefined =
      st.result?.diffusers_lora_file?.url || st.result?.lora_file?.url;
    if (loraUrl) {
      return prisma.petLora.update({
        where: { id: loraId },
        data: { status: "ready", lora_url: loraUrl.slice(0, 512), completed_at: new Date() },
      });
    }
    return prisma.petLora.update({
      where: { id: loraId },
      data: { status: "failed", error_message: "Training completed but no LoRA file in result" },
    });
  }
  if (st.status === "failed") {
    return prisma.petLora.update({
      where: { id: loraId },
      data: { status: "failed", error_message: (st.error || "training failed").slice(0, 500) },
    });
  }
  return row;
}

export async function getReadyPetLora(petId: number) {
  return prisma.petLora.findFirst({
    where: { pet_id: petId, status: "ready", lora_url: { not: null } },
    orderBy: { created_at: "desc" },
  });
}

/**
 * Generate an image with the pet's trained LoRA (fal-ai/flux-lora). Polls
 * inline up to ~45s (flux is typically 5–15s). Returns the ephemeral provider
 * URL; the owning route persists it exactly once. Throws on timeout/failure —
 * callers may fall back to the Grok path.
 */
export async function falLoraImage(
  prompt: string,
  loraUrl: string,
  triggerWord: string,
  userId: number,
): Promise<string> {
  falKey(); // configuration failures are not provider attempts
  await consumeImageBudget(userId, "fal");
  const requestId = await falQueueSubmit(LORA_GEN_MODEL, {
    prompt: `${triggerWord}, ${prompt}`,
    loras: [{ path: loraUrl, scale: 1 }],
    image_size: "landscape_4_3",
    num_images: 1,
  });

  const deadline = Date.now() + GEN_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, GEN_POLL_INTERVAL_MS));
    const st = await falQueueStatus(LORA_GEN_MODEL, requestId);
    if (st.status === "completed") {
      const url = st.result?.images?.[0]?.url;
      if (!url) throw new Error("flux-lora returned no image URL");
      return url;
    }
    if (st.status === "failed") throw new Error(st.error || "flux-lora generation failed");
  }
  throw new Error("flux-lora generation timed out");
}

/**
 * Backend dispatch for Studio generations.
 *
 * Each backend (`fal` | `grok`) exposes the same submit(model, prompt, refUrl)
 * → returns { jobId, status }. The /api/studio/generate route stores the job
 * row, polls status via /api/studio/generate/[jobId], and surfaces the final
 * URL once ready.
 *
 * Why an abstraction: lets us add Replicate / direct provider APIs later
 * without changing the gen endpoint or UI. Also makes per-provider cost
 * tracking simple — `pricedUsd` is logged on every submit.
 */

import type { StudioModel } from "./providers";

export interface SubmitResult {
  ok: boolean;
  jobId?: string;        // upstream request id (e.g. fal_request_id)
  immediateUrl?: string; // some providers return synchronously
  error?: string;
}

export interface PollResult {
  status: "pending" | "running" | "completed" | "failed";
  url?: string;          // final asset URL when completed
  error?: string;
  progress?: number;     // 0..1
}

// ── FAL backend ──
async function falSubmit(model: StudioModel, prompt: string, refUrl?: string): Promise<SubmitResult> {
  const key = process.env.FAL_API_KEY;
  if (!key) return { ok: false, error: "FAL_API_KEY not configured" };

  // FAL's queue API — same envelope across all models. Each model has its own
  // input shape but all accept `prompt`, image-to-video models also `image_url`.
  const url = `https://queue.fal.run/${model.backendModel}`;
  const body: any = { prompt };
  if (model.supportsImageRef && refUrl) {
    body.image_url = refUrl;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${key}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.detail || data?.error || `FAL submit ${res.status}` };
    }
    // FAL returns { request_id, status_url, response_url }
    return { ok: true, jobId: data.request_id };
  } catch (e: any) {
    return { ok: false, error: e?.message || "FAL submit threw" };
  }
}

async function falPoll(model: StudioModel, jobId: string): Promise<PollResult> {
  const key = process.env.FAL_API_KEY;
  if (!key) return { status: "failed", error: "FAL_API_KEY not configured" };

  try {
    const statusUrl = `https://queue.fal.run/${model.backendModel}/requests/${jobId}/status`;
    const sRes = await fetch(statusUrl, { headers: { Authorization: `Key ${key}` } });
    const s = await sRes.json();

    if (s.status === "COMPLETED") {
      const resultUrl = `https://queue.fal.run/${model.backendModel}/requests/${jobId}`;
      const rRes = await fetch(resultUrl, { headers: { Authorization: `Key ${key}` } });
      const r = await rRes.json();
      // FAL response shapes vary by model; common extractors:
      const finalUrl =
        r?.video?.url ||
        r?.images?.[0]?.url ||
        r?.image?.url ||
        r?.url ||
        null;
      if (!finalUrl) return { status: "failed", error: "No output URL in FAL response" };
      return { status: "completed", url: finalUrl };
    }
    if (s.status === "FAILED" || s.status === "ERROR") {
      return { status: "failed", error: s?.error || "FAL job failed" };
    }
    // IN_QUEUE / IN_PROGRESS
    return { status: "running", progress: 0.5 };
  } catch (e: any) {
    return { status: "failed", error: e?.message || "FAL poll threw" };
  }
}

// ── Grok backend (existing video.ts wraps this; we keep the call shape local) ──
async function grokSubmit(model: StudioModel, prompt: string, refUrl?: string): Promise<SubmitResult> {
  const key = process.env.GROK_API_KEY;
  if (!key) return { ok: false, error: "GROK_API_KEY not configured" };

  // Image: synchronous return
  if (model.kind === "image") {
    try {
      const res = await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: model.backendModel,
          prompt,
          n: 1,
          response_format: "url",
          ...(refUrl ? { reference_image_url: refUrl } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data?.error?.message || `Grok ${res.status}` };
      const url = data?.data?.[0]?.url;
      if (!url) return { ok: false, error: "No URL in Grok image response" };
      return { ok: true, immediateUrl: url };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Grok image submit threw" };
    }
  }

  // Video: queued
  try {
    const res = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: model.backendModel,
        prompt,
        duration: `${model.maxDurationSec}s`,
        ...(refUrl ? { reference_image_url: refUrl } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message || `Grok ${res.status}` };
    return { ok: true, jobId: data?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Grok video submit threw" };
  }
}

async function grokPoll(_model: StudioModel, jobId: string): Promise<PollResult> {
  const key = process.env.GROK_API_KEY;
  if (!key) return { status: "failed", error: "GROK_API_KEY not configured" };
  try {
    const res = await fetch(`https://api.x.ai/v1/videos/generations/${jobId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json();
    if (!res.ok) return { status: "failed", error: data?.error?.message || `Grok poll ${res.status}` };
    if (data.status === "completed" && data.url) return { status: "completed", url: data.url };
    if (data.status === "failed") return { status: "failed", error: data?.error || "Grok job failed" };
    return { status: "running", progress: 0.5 };
  } catch (e: any) {
    return { status: "failed", error: e?.message || "Grok poll threw" };
  }
}

// ── Public dispatch ──
export async function submitToBackend(model: StudioModel, prompt: string, refUrl?: string): Promise<SubmitResult> {
  if (model.backend === "fal") return falSubmit(model, prompt, refUrl);
  if (model.backend === "grok") return grokSubmit(model, prompt, refUrl);
  return { ok: false, error: `Unknown backend: ${model.backend}` };
}

export async function pollBackend(model: StudioModel, jobId: string): Promise<PollResult> {
  if (model.backend === "fal") return falPoll(model, jobId);
  if (model.backend === "grok") return grokPoll(model, jobId);
  return { status: "failed", error: `Unknown backend: ${model.backend}` };
}

export type BoundedJsonBodyResult =
  | { ok: true; value: unknown; bytesRead: number }
  | { ok: false; reason: "too_large" | "invalid_json" };

/**
 * Read JSON with an enforced byte ceiling even when Content-Length is absent or
 * false. Authentication should happen before calling this helper on protected
 * routes, so unauthenticated callers cannot make the server parse request data.
 */
export async function readBoundedJsonBody(
  request: Pick<Request, "body" | "headers">,
  maxBytes: number,
): Promise<BoundedJsonBodyResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: "too_large" };
  }
  if (!request.body) return { ok: false, reason: "invalid_json" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let raw = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  try {
    return { ok: true, value: JSON.parse(raw), bytesRead };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

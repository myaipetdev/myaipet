import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { importSoulData } from "@/lib/petclaw/data-sovereignty";
import { readSoulImportJson, validateSoulExport } from "@/lib/petclaw/soul-schema";
import type { SoulExport } from "@/lib/petclaw/petclaw";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(body, { ...init, headers });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }

  // Enforce the shared cap against actual streamed UTF-8 bytes. A missing or
  // forged Content-Length header cannot bypass this check.
  const parsedBody = await readSoulImportJson(req);
  if (parsedBody.ok === false) {
    return privateJson(
      { error: parsedBody.error },
      { status: parsedBody.kind === "too_large" ? 413 : 400 },
    );
  }
  const raw = parsedBody.data;

  // Schema validation (zod) — covers types, lengths, ranges, allowed enums, regex,
  // forbidden control chars, and rejects unknown keys via .strict()
  const validation = validateSoulExport(raw);
  if (validation.ok === false) {
    return privateJson({ error: validation.error }, { status: 400 });
  }
  const body = validation.data as unknown as SoulExport;

  try {
    const result = await importSoulData(user.id, body);
    return privateJson({
      success: true,
      ...result,
      message: `Pet "${body.pet.name}" imported successfully`,
    });
  } catch (e: any) {
    return privateJson({ error: e.message }, { status: 400 });
  }
}

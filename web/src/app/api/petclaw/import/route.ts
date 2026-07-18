import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { importSoulData } from "@/lib/petclaw/data-sovereignty";
import { readSoulImportJson, validateSoulExport } from "@/lib/petclaw/soul-schema";
import type { SoulExport } from "@/lib/petclaw/petclaw";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Enforce the shared cap against actual streamed UTF-8 bytes. A missing or
  // forged Content-Length header cannot bypass this check.
  const parsedBody = await readSoulImportJson(req);
  if (parsedBody.ok === false) {
    return NextResponse.json(
      { error: parsedBody.error },
      { status: parsedBody.kind === "too_large" ? 413 : 400 },
    );
  }
  const raw = parsedBody.data;

  // Schema validation (zod) — covers types, lengths, ranges, allowed enums, regex,
  // forbidden control chars, and rejects unknown keys via .strict()
  const validation = validateSoulExport(raw);
  if (validation.ok === false) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const body = validation.data as unknown as SoulExport;

  try {
    const result = await importSoulData(user.id, body);
    return NextResponse.json({
      success: true,
      ...result,
      message: `Pet "${body.pet.name}" imported successfully`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

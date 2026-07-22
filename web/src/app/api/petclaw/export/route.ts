import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { exportPetData } from "@/lib/petclaw/data-sovereignty";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";
import {
  getSoulExportByteLength,
  SOUL_IMPORT_MAX_BYTES,
  SOUL_IMPORT_MAX_MIB,
} from "@/lib/petclaw/soul-schema";

export async function GET(req: NextRequest) {
  // SCRUM-36: authentication is REQUIRED. Previously a "dev/extension fallback"
  // resolved the pet's actual owner from the DB, letting anyone export any pet.
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const petId = req.nextUrl.searchParams.get("petId");
  if (!petId || !/^\d+$/.test(petId)) {
    return NextResponse.json({ error: "petId required" }, { status: 400 });
  }

  try {
    // exportPetData internally verifies ownership against userId
    const soulExport = await exportPetData(Number(petId), user.id);
    const exportBytes = getSoulExportByteLength(soulExport);
    if (exportBytes > SOUL_IMPORT_MAX_BYTES) {
      // Never award the sovereignty mission for a bundle that the documented
      // importer and SDK/CLI/MCP clients cannot safely receive and restore.
      return NextResponse.json({
        error: `SOUL export exceeds the ${SOUL_IMPORT_MAX_MIB} MiB portable-format limit`,
        code: "soul_export_too_large",
        bytes: exportBytes,
        maxBytes: SOUL_IMPORT_MAX_BYTES,
      }, { status: 422 });
    }
    // Exercising data sovereignty (SOUL export) feeds the season (capped).
    await awardPointsCapped(user.id, "petclaw", 10, DAILY_POINT_CAPS.petclaw).catch(() => {});
    return NextResponse.json(soulExport);
  } catch (e: any) {
    // Generic 403 — don't leak whether the pet exists
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

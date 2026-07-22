import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { deletePetData } from "@/lib/petclaw/data-sovereignty";
import { PetAgentRunActiveError } from "@/lib/petclaw/agent/run-ledger";

export async function DELETE(req: NextRequest) {
  // SCRUM-37: authentication is REQUIRED. Same IDOR fallback removed.
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const petId = req.nextUrl.searchParams.get("petId");
  if (!petId || !/^\d+$/.test(petId)) {
    return NextResponse.json({ error: "petId required" }, { status: 400 });
  }

  try {
    const result = await deletePetData(Number(petId), user.id);
    return NextResponse.json({
      success: true,
      ...result,
      message: "Pet-scoped data and owned media were removed from active systems. Minimal terminal paid-run receipts were retained after private run content was scrubbed. Backup copies expire under the published retention schedule; public on-chain records cannot be erased.",
    });
  } catch (e: any) {
    if (e instanceof PetAgentRunActiveError) {
      const statusUrl = `/api/pets/${e.petId}/agent/runs/${e.runId}`;
      return NextResponse.json({
        error: e.message,
        code: e.code,
        runId: e.runId,
        state: e.state,
        statusUrl,
        guidance: "Reconcile this run until it has a terminal receipt, then retry pet deletion.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

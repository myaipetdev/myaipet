/**
 * List + disconnect OAuth connections for a pet.
 *
 *   GET    /api/petclaw/connections?petId=N    → safe profile-only list
 *   DELETE /api/petclaw/connections?petId=N&platform=discord → revoke
 *
 * Tokens are NEVER returned to the client — only the profile snapshot
 * (id/username/displayName/avatar) so UI can render "Connected as @foo".
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listConnections, disconnect } from "@/lib/oauth/store";
import { listProviders } from "@/lib/oauth/providers";
import { oauthConnectionsEnabled, oauthUnavailableResponse } from "@/lib/oauth/availability";

type GuardOk = { ok: true; petId: number; userId: number };
type GuardErr = { ok: false; res: NextResponse };

async function ownsPet(req: NextRequest): Promise<GuardOk | GuardErr> {
  const user = await getUser(req);
  if (!user) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const petId = Number(req.nextUrl.searchParams.get("petId"));
  if (!Number.isInteger(petId) || petId <= 0) {
    return { ok: false, res: NextResponse.json({ error: "Invalid petId" }, { status: 400 }) };
  }
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id, is_active: true } });
  if (!pet) return { ok: false, res: NextResponse.json({ error: "Pet not found" }, { status: 404 }) };
  return { ok: true, petId, userId: user.id };
}

export async function GET(req: NextRequest) {
  if (!oauthConnectionsEnabled()) return oauthUnavailableResponse();

  const guard = await ownsPet(req);
  if (guard.ok !== true) return guard.res;

  const connections = await listConnections(guard.petId);
  const available = listProviders(); // [{ id, displayName, configured, flavor }]

  const byPlatform = new Map(connections.map(c => [c.platform, c]));
  const merged = available.map(p => ({
    ...p,
    connected: byPlatform.has(p.id),
    connection: byPlatform.get(p.id) || null,
  }));

  return NextResponse.json({ providers: merged });
}

export async function DELETE(req: NextRequest) {
  const guard = await ownsPet(req);
  if (guard.ok !== true) return guard.res;

  const platform = req.nextUrl.searchParams.get("platform");
  if (!platform) return NextResponse.json({ error: "platform required" }, { status: 400 });

  await disconnect(guard.petId, platform);
  return NextResponse.json({ ok: true });
}

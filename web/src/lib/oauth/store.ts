/**
 * Per-pet OAuth credential storage.
 * Schema: pet_platform_connections.credentials (Text) stores JSON.
 *
 * Tokens are encrypted-at-rest by the DB layer. Future hardening:
 * wrap with AGENT_ENCRYPTION_KEY before persisting.
 */

import { prisma } from "@/lib/prisma";

export interface StoredCredentials {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;       // unix epoch ms
  scope?: string;
  token_type?: string;
  profile?: {
    id?: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

export async function saveConnection(petId: number, platform: string, creds: StoredCredentials, config?: Record<string, any>) {
  return prisma.petPlatformConnection.upsert({
    where: { pet_id_platform: { pet_id: petId, platform } },
    create: {
      pet_id: petId,
      platform,
      is_active: true,
      credentials: JSON.stringify(creds),
      config: (config || {}) as any,
      connected_at: new Date(),
      last_active_at: new Date(),
    },
    update: {
      is_active: true,
      credentials: JSON.stringify(creds),
      config: (config || {}) as any,
      last_active_at: new Date(),
    },
  });
}

export async function listConnections(petId: number) {
  const rows = await prisma.petPlatformConnection.findMany({
    where: { pet_id: petId, is_active: true },
    select: {
      platform: true,
      connected_at: true,
      last_active_at: true,
      credentials: true,    // we'll strip to profile only before returning
      config: true,
    },
    orderBy: { connected_at: "desc" },
  });

  return rows.map(r => {
    let profile: StoredCredentials["profile"] | undefined;
    try {
      const c = JSON.parse(r.credentials || "{}") as StoredCredentials;
      profile = c.profile;
    } catch {}
    return {
      platform: r.platform,
      connectedAt: r.connected_at,
      lastActiveAt: r.last_active_at,
      profile,                              // ← only profile, NEVER tokens
      config: r.config,
    };
  });
}

export async function disconnect(petId: number, platform: string) {
  return prisma.petPlatformConnection.updateMany({
    where: { pet_id: petId, platform },
    data: { is_active: false, credentials: null },   // wipe the token
  });
}

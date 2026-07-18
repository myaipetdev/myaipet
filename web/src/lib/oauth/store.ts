/**
 * Per-pet OAuth credential storage.
 * Schema: pet_platform_connections.credentials stores an AES-256-GCM OAuth
 * envelope. Raw JSON is rejected by the database credential-format guard.
 */

import { prisma } from "@/lib/prisma";
import {
  decodeOAuthCredentials,
  encodeOAuthCredentials,
} from "@/lib/oauth/credentials";
import type { OAuthCredentials } from "@/lib/oauth/credentials";

export type StoredCredentials = OAuthCredentials;

export async function saveConnection(petId: number, platform: string, creds: StoredCredentials, config?: Record<string, any>) {
  const encryptedCredentials = encodeOAuthCredentials(creds);
  return prisma.petPlatformConnection.upsert({
    where: { pet_id_platform: { pet_id: petId, platform } },
    create: {
      pet_id: petId,
      platform,
      is_active: true,
      credentials: encryptedCredentials,
      config: (config || {}) as any,
      connected_at: new Date(),
      last_active_at: new Date(),
    },
    update: {
      is_active: true,
      credentials: encryptedCredentials,
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
      credentials: true,    // decrypted server-side; only profile is returned
      config: true,
    },
    orderBy: { connected_at: "desc" },
  });

  return rows.map(r => {
    const c = decodeOAuthCredentials(r.credentials);
    const profile: StoredCredentials["profile"] | undefined = c?.profile;
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

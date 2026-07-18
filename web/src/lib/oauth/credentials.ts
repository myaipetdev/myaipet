import { decrypt, encrypt } from "@/lib/crypto";

export interface OAuthCredentialProfile {
  id?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface OAuthCredentials {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
  token_type?: string;
  profile?: OAuthCredentialProfile;
}

interface OAuthCredentialEnvelope {
  format: "petclaw-oauth-v1";
  credentials: OAuthCredentials;
}

export function encodeOAuthCredentials(credentials: OAuthCredentials): string {
  if (!credentials.access_token) throw new Error("OAuth access token is required");
  const envelope: OAuthCredentialEnvelope = {
    format: "petclaw-oauth-v1",
    credentials,
  };
  return encrypt(JSON.stringify(envelope));
}

/**
 * Decode only the explicit encrypted OAuth envelope. Plain JSON and the
 * legacy encrypted agent credential shape intentionally fail closed.
 */
export function decodeOAuthCredentials(value: string | null | undefined): OAuthCredentials | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decrypt(value)) as Partial<OAuthCredentialEnvelope>;
    if (parsed.format !== "petclaw-oauth-v1") return null;
    if (!parsed.credentials || typeof parsed.credentials.access_token !== "string" || !parsed.credentials.access_token) {
      return null;
    }
    return parsed.credentials;
  } catch {
    return null;
  }
}

export const ENCRYPTED_CREDENTIAL_PATTERN =
  "^[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]+={0,2}$";

import { decrypt, encrypt } from "@/lib/crypto";

type AgentCredentialEnvelope =
  | {
      format: "petclaw-agent-v1";
      platform: "telegram";
      credentials: { bot_token: string };
    }
  | {
      format: "petclaw-agent-v1";
      platform: "twitter";
      credentials: { api_key: string };
    };

function validSecret(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 512;
}

export function encodeTelegramAgentCredentials(botToken: string): string {
  if (!validSecret(botToken)) throw new Error("Invalid Telegram bot credential");
  const envelope: AgentCredentialEnvelope = {
    format: "petclaw-agent-v1",
    platform: "telegram",
    credentials: { bot_token: botToken },
  };
  return encrypt(JSON.stringify(envelope));
}

export function encodeTwitterAgentCredentials(apiKey: string): string {
  if (!validSecret(apiKey)) throw new Error("Invalid Twitter agent credential");
  const envelope: AgentCredentialEnvelope = {
    format: "petclaw-agent-v1",
    platform: "twitter",
    credentials: { api_key: apiKey },
  };
  return encrypt(JSON.stringify(envelope));
}

/**
 * Read the purpose-bound v1 envelope. A narrowly scoped legacy decoder keeps
 * already-encrypted bot rows disconnectable during migration; OAuth envelopes,
 * raw JSON, and cross-platform agent credentials always fail closed.
 */
export function decodeTelegramAgentBotToken(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decrypt(value)) as Record<string, unknown>;
    if (parsed.format === "petclaw-agent-v1") {
      if (parsed.platform !== "telegram" || !parsed.credentials || typeof parsed.credentials !== "object") return null;
      const token = (parsed.credentials as Record<string, unknown>).bot_token;
      return validSecret(token) ? token : null;
    }

    // Legacy encrypted agent shape: { bot_token }. Reject any mixed-purpose row.
    const keys = Object.keys(parsed);
    if (keys.length === 1 && keys[0] === "bot_token" && validSecret(parsed.bot_token)) {
      return parsed.bot_token;
    }
    return null;
  } catch {
    return null;
  }
}

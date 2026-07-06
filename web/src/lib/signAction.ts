/**
 * Wallet Signature Utilities
 *
 * Provides off-chain message signing for action authorization.
 * Uses wagmi hooks for client-side signing and ethers for server-side verification.
 * Signatures are free (no gas) but provide cryptographic proof of user intent.
 */

import { getAccount, signMessage, type Config } from "@wagmi/core";

/**
 * Build a human-readable message for the user to sign.
 */
export function buildSignMessage(
  action: string,
  data: Record<string, string>
): string {
  const entries = Object.entries(data);
  const lines = entries.length > 0
    ? entries.map(([key, value]) => `${key}: ${value}`).join("\n") + "\n"
    : "";
  return `${action}\n${lines}Timestamp: ${Math.floor(Date.now() / 1000)}`;
}

function getWalletErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return "Wallet signature failed. Please try again.";
  const e = err as { name?: string; code?: number; message?: string };
  if (
    e.name === "UserRejectedRequestError" ||
    e.code === 4001 ||
    e.message?.includes("rejected") ||
    e.message?.includes("denied")
  ) {
    return "Signature required. Please sign the message to continue.";
  }
  return e.message || "Wallet signature failed. Please try again.";
}

/**
 * Request a wallet signature for an action.
 * Throws if the user rejects the signature request.
 *
 * @param config - wagmi config object (from useConfig())
 * @param action - action description (e.g., "Adopt pet: Luna (Dragon)")
 * @param data - key-value pairs to include in the signed message
 * @returns { message, signature } to send to the API
 */
export async function signAction(
  config: Config,
  action: string,
  data: Record<string, string> = {}
): Promise<{ message: string; signature: string }> {
  const message = buildSignMessage(action, data);

  try {
    const account = getAccount(config).address;
    if (!account) {
      throw new Error("Wallet is not connected. Connect your wallet and try again.");
    }
    const signature = await signMessage(config, { account, message });
    return { message, signature };
  } catch (err: unknown) {
    throw new Error(getWalletErrorMessage(err));
  }
}

/**
 * Server-side: verify a signed message matches the expected wallet address.
 * Uses ethers.verifyMessage() to recover the signer.
 *
 * @param message - the original message that was signed
 * @param signature - the hex signature
 * @param expectedAddress - the wallet address that should have signed
 * @returns true if valid
 */
export async function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string
): Promise<boolean> {
  const { ethers } = await import("ethers");
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

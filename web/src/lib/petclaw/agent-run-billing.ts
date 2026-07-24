export type ValidPaidAgentRunBilling = {
  outcome: "charged" | "refunded";
  creditsCharged: 0 | 5;
  usageKnown: boolean;
  modelCalls: number | null;
  [key: string]: unknown;
};

/**
 * Shared financial receipt invariant for browser reconciliation and server
 * projections. Never coerce a malformed receipt into a charge or refund.
 */
export function isValidTerminalPaidAgentRunBilling(
  billing: unknown,
): billing is ValidPaidAgentRunBilling {
  if (!billing || typeof billing !== "object" || Array.isArray(billing)) return false;
  const value = billing as Record<string, unknown>;
  const charged = value.outcome === "charged";
  const refunded = value.outcome === "refunded";
  if (!charged && !refunded) return false;
  if (
    !Number.isSafeInteger(value.creditsCharged)
    || (charged ? value.creditsCharged !== 5 : value.creditsCharged !== 0)
    || typeof value.usageKnown !== "boolean"
  ) return false;
  if (value.usageKnown === false) {
    return refunded && value.creditsCharged === 0 && value.modelCalls === null;
  }
  return Number.isSafeInteger(value.modelCalls)
    && (value.modelCalls as number) >= 0;
}

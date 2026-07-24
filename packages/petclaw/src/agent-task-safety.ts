export const PETCLAW_AGENT_TASK_KINDS = Object.freeze([
  "recall",
  "summarize",
  "review",
  "draft",
] as const);

export type PetClawAgentTaskKind = typeof PETCLAW_AGENT_TASK_KINDS[number];

export const PETCLAW_AGENT_GOAL_MAX_LENGTH = 2_000;

export const PETCLAW_AGENT_TASK_MIN_LENGTHS: Readonly<
  Record<PetClawAgentTaskKind, number>
> = Object.freeze({
  recall: 8,
  summarize: 40,
  review: 12,
  draft: 20,
});

const STRONG_AGENT_SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN\s+(?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED|PGP)\s+)?PRIVATE\s+KEY(?:\s+BLOCK)?-----/i,
  // Signed JWTs encode JSON header and payload segments, which conventionally
  // begin `eyJ`. Requiring those prefixes preserves ordinary dotted developer
  // identifiers such as Microsoft.Extensions.Configuration.
  /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{12,}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{4,}\b/i,
  /\b(?:npm_|sk-|sk_live_|sk_test_|xai-|gh[pousr]_|github_pat_|glpat-|hf_|pk_live_|rk_live_|pck_|pex_|xox[baprs]-|AKIA|ASIA|AIza|ya29\.)[A-Za-z0-9._~+/=-]{12,}\b/,
  /\b(?:api[\s_-]*key|access[\s_-]*token|auth(?:entication)?[\s_-]*token|client[\s_-]*secret|password|private[\s_-]*key|refresh[\s_-]*token|seed[\s_-]*phrase|session[\s_-]*(?:token|secret)|secret[\s_-]*key|stripe[\s_-]*secret[\s_-]*key|mnemonic)\b\s*(?:=|:|\bis\b)\s*["']?[^\s"'<>;,]{8,}/i,
  /\b(?:aws[\s_-]*(?:secret[\s_-]*access[\s_-]*key|session[\s_-]*token)|database[\s_-]*url|recovery[\s_-]*code|session[\s_-]*cookie)\b\s*(?:=|:|\bis\b)\s*["']?[^\s"'<>;,]{8,}/i,
  /\b(?:otp|totp|mfa[\s_-]*code|one[\s_-]*time[\s_-]*(?:password|code))\b(?:\s*(?:=|:|\bis\b))?\s*["']?\d{6,8}\b/i,
  /\b(?:(?:recovery|backup|security|2fa)[\s_-]*code|passcode)\b(?:\s*(?:=|:|\bis\b))?\s*["']?\d{6,8}\b/i,
  /(?:\uC778\uC99D\uCF54\uB4DC|\uC77C\uD68C\uC6A9\s*\uCF54\uB4DC)\s*["']?\d{6,8}\b/u,
  /(?:\uBCF5\uAD6C\s*\uCF54\uB4DC|\uBC31\uC5C5\s*\uCF54\uB4DC|\uBCF4\uC548\s*\uCF54\uB4DC)\s*["']?\d{6,8}\b/u,
  /\b(?:Set-Cookie|Cookie)\s*:\s*[^\r\n]{4,}/i,
  /\b(?:seed[\s_-]*phrase|mnemonic)\b\s*(?:=|:|\bis\b)\s*(?:[A-Za-z]+\s+){11,23}[A-Za-z]+\b/i,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\/:\s"'<>]+:[^\/@\s"'<>]+@/i,
  /[?&](?:x-amz-signature|x-amz-credential|x-amz-security-token|x-goog-signature|x-goog-credential|signature|sig|access_token|refresh_token|api[_-]?key|token)=[^&#\s"'<>]{8,}/i,
];

/** Normalize only for local validation; the server remains authoritative. */
export function normalizePetClawAgentTaskInput(value: string): string {
  return value
    // Keep tabs/newlines, but remove other C0 controls and DEL.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/** Reject concrete secret signatures without blocking ordinary discussion. */
export function containsStrongPetClawAgentSecret(value: string): boolean {
  return STRONG_AGENT_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export interface PetClawAgentTaskInputIssue {
  code: "agent_task_secret_rejected" | "agent_task_input_invalid";
  message: string;
  taskKind: PetClawAgentTaskKind;
  minLength: number;
  maxLength: number;
}

export function getPetClawAgentTaskInputIssue(
  taskKind: PetClawAgentTaskKind,
  ownerInput: unknown,
): PetClawAgentTaskInputIssue | null {
  const minLength = PETCLAW_AGENT_TASK_MIN_LENGTHS[taskKind];
  const issue = (
    code: PetClawAgentTaskInputIssue["code"],
    message: string,
  ): PetClawAgentTaskInputIssue => ({
    code,
    message,
    taskKind,
    minLength,
    maxLength: PETCLAW_AGENT_GOAL_MAX_LENGTH,
  });
  if (typeof ownerInput !== "string") {
    return issue("agent_task_input_invalid", "Task input must be a string");
  }
  const value = normalizePetClawAgentTaskInput(ownerInput);
  if (containsStrongPetClawAgentSecret(value)) {
    return issue(
      "agent_task_secret_rejected",
      "Remove API keys, tokens, passwords, private keys, or recovery secrets before running this task",
    );
  }
  if (ownerInput.length > PETCLAW_AGENT_GOAL_MAX_LENGTH) {
    return issue(
      "agent_task_input_invalid",
      `Task input must be ${PETCLAW_AGENT_GOAL_MAX_LENGTH} characters or fewer`,
    );
  }
  if (value.length < minLength) {
    return issue(
      "agent_task_input_invalid",
      `${taskKind} needs at least ${minLength} characters of real input`,
    );
  }
  if (
    /^\[[^\]]+\]$/.test(value)
    || /\[(?:paste|add|insert|describe)[^\]]*\]/i.test(value)
  ) {
    return issue(
      "agent_task_input_invalid",
      "Replace the example placeholder with real input",
    );
  }
  return null;
}

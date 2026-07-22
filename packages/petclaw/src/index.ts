/**
 * @myaipet/petclaw-sdk — PetClaw Protocol SDK
 * Companion AI with Data Sovereignty
 *
 * Install: npm install @myaipet/petclaw-sdk
 * Docs: https://app.myaipet.ai/api-docs
 */

export { PETCLAW_PROTOCOL, PETCLAW_VERSION } from "./protocol";
export type {
  PetClawManifest,
  PetClawSkill,
  PetIdentity,
  ConsentSettings,
  SoulExport,
  SoulImportSkipDetail,
  SoulImportReport,
  SoulImportResult,
} from "./protocol";
export {
  buildPetDID,
  computeIntegrityHash,
  verifySoulExport,
  buildManifest,
  DEFAULT_SKILLS,
} from "./protocol";

export * from "./client";

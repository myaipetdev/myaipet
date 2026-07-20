import { NextRequest, NextResponse } from "next/server";
import { ONCHAIN } from "@/lib/onchain";

const PETCLAW_PROTOCOL = "petclaw-v1";
const PETCLAW_VERSION = "1.0.0";

export async function GET(req: NextRequest) {
  // req.nextUrl.origin resolves to the internal listen host (http://0.0.0.0:3000)
  // behind the standalone server / proxy, which breaks external auto-discovery.
  // Prefer an explicit public origin, then the forwarded host, then origin.
  const fwdHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const fwdProto = req.headers.get("x-forwarded-proto") || "https";
  const baseUrl = (
    process.env.APP_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (fwdHost ? `${fwdProto}://${fwdHost}` : req.nextUrl.origin)
  ).replace(/\/$/, "");

  const card = {
    protocol: PETCLAW_PROTOCOL,
    version: PETCLAW_VERSION,
    name: "MY AI PET",
    description: "Companion AI with data sovereignty — your pet, your data, your rules",
    url: baseUrl,
    provider: {
      name: "MY AI PET",
      url: baseUrl,
    },

    capabilities: {
      companionAI: true,
      dataSovereignty: true,
      // Preserve legacy Soul state in exports, but do not advertise live NFT
      // capability while on-chain minting is paused.
      soulNFT: false,
      memoryExport: true,
      consentManagement: true,
      // MCP is not advertised while the SDK's MCP path is broken; it returns
      // with SDK 1.6.2.
      protocols: ["petclaw-v1"],
      multimodal: ["text", "image"],
    },

    endpoints: {
      manifest: `${baseUrl}/api/petclaw`,
      export: `${baseUrl}/api/petclaw/export`,
      import: `${baseUrl}/api/petclaw/import`,
      delete: `${baseUrl}/api/petclaw/delete`,
      verify: `${baseUrl}/api/petclaw/verify`,
      chat: `${baseUrl}/api/pets/{petId}/chat`,
      memories: `${baseUrl}/api/pets/{petId}/memories`,
    },

    authentication: {
      methods: ["wallet-signature", "jwt-bearer"],
      // Advertised chain follows the single on-chain config (BSC today → Base
      // via CHAIN_NAME/CHAIN_ID), so discovery never points at a chain we left.
      chain: ONCHAIN.chainName.toLowerCase(),
      chainId: ONCHAIN.chainId,
    },

    skills: [
      { id: "companion-chat", name: "Companion Chat", description: "Personality-driven conversation with persistent memory", category: "emotional" },
      { id: "persona-mirror", name: "Persona Mirror", description: "Mirror owner's speech patterns and tone", category: "social" },
      { id: "memory-recall", name: "Memory Recall", description: "Retrieve and reason over past conversations", category: "knowledge" },
      { id: "soul-export", name: "Soul Export", description: "Export complete pet identity as portable data", category: "utility" },
    ],

    sovereignty: {
      dataOwnership: "user",
      exportFormat: "petclaw-soul-v1",
      // Deletion returns a SHA-256 receipt of the deletion-request metadata —
      // it is NOT a signed proof and NOT a hash of the deleted content, so
      // this field must stay false. `deletionReceipt` describes what exists.
      deletionProof: false,
      deletionReceipt: "sha256-metadata",
      consentRequired: true,
      portability: true,
      // Successor designation exists in the API, but the automated transfer
      // job is not scheduled in this release — do not advertise inheritance
      // as an operating protocol guarantee.
      inheritance: false,
    },
  };

  return NextResponse.json(card, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

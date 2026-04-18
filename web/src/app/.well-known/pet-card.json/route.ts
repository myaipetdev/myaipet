import { NextRequest, NextResponse } from "next/server";

const PETCLAW_PROTOCOL = "petclaw-v1";
const PETCLAW_VERSION = "1.0.0";

export async function GET(req: NextRequest) {
  const baseUrl = req.nextUrl.origin;

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
      soulNFT: true,
      memoryExport: true,
      consentManagement: true,
      protocols: ["petclaw-v1", "mcp"],
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
      chain: "bsc",
    },

    skills: [
      { id: "companion-chat", name: "Companion Chat", description: "Personality-driven conversation with persistent memory", category: "emotional" },
      { id: "persona-mirror", name: "Persona Mirror", description: "Mirror owner's speech patterns and tone", category: "social" },
      { id: "memory-recall", name: "Memory Recall", description: "Retrieve and reason over past conversations", category: "knowledge" },
      { id: "autonomous-post", name: "Autonomous Post", description: "Generate and publish content on social platforms", category: "creative" },
      { id: "soul-export", name: "Soul Export", description: "Export complete pet identity as portable data", category: "utility" },
    ],

    sovereignty: {
      dataOwnership: "user",
      exportFormat: "petclaw-soul-v1",
      deletionProof: true,
      consentRequired: true,
      portability: true,
      inheritance: true,
    },
  };

  return NextResponse.json(card, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

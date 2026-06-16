import { NextRequest, NextResponse } from "next/server";
import { invokePet } from "@/lib/petclaw/pet-network";
import { requirePetOwner } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { callerPetId, providerPetId, skillId, input } = body;

  if (!callerPetId || !providerPetId || !skillId) {
    return NextResponse.json(
      { error: "callerPetId, providerPetId, and skillId are required" },
      { status: 400 }
    );
  }

  // SECURITY (audit C2): invokePet() debits callerPetId's wallet and burns LLM
  // budget. The caller MUST be authenticated and own callerPetId — otherwise
  // anyone could drain any pet's wallet by passing it as callerPetId.
  const auth = await requirePetOwner(req, Number(callerPetId));
  if (auth.error) return auth.error;

  const rl = rateLimit(req, { key: "petclaw-invoke", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  if (callerPetId === providerPetId) {
    return NextResponse.json(
      { error: "A pet cannot invoke itself" },
      { status: 400 }
    );
  }

  const result = await invokePet({
    callerPetId: Number(callerPetId),
    providerPetId: Number(providerPetId),
    skillId,
    input: input || {},
  });

  return NextResponse.json(result);
}

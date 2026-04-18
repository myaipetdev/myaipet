import { NextRequest, NextResponse } from "next/server";
import { invokePet } from "@/lib/petclaw/pet-network";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { callerPetId, providerPetId, skillId, input } = body;

  if (!callerPetId || !providerPetId || !skillId) {
    return NextResponse.json(
      { error: "callerPetId, providerPetId, and skillId are required" },
      { status: 400 }
    );
  }

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

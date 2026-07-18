import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { generatedEnglishOrFallback } from "@/lib/generatedLanguage";

const LEGACY_MEMORY_FALLBACK =
  "A previous generated memory is unavailable in this English-only release.";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { petId } = await params;
  const { searchParams } = new URL(req.url);
  const memoryType = searchParams.get("memory_type");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("page_size")) || 20));

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id },
  });

  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  const where: { pet_id: number; memory_type?: string } = { pet_id: pet.id };
  if (memoryType) {
    where.memory_type = memoryType;
  }

  const [items, total] = await Promise.all([
    prisma.petMemory.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.petMemory.count({ where }),
  ]);

  const visibleItems = items.map((item) => {
    const content = String(item.content || "");
    const ownerAuthored = /^\[user(?::[^\]]+)?\]\s*/.test(content);
    return ownerAuthored
      ? item
      : { ...item, content: generatedEnglishOrFallback(content, LEGACY_MEMORY_FALLBACK) };
  });

  return NextResponse.json({ items: visibleItems, total, page, page_size: pageSize });
}

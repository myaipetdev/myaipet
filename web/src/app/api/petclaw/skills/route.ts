import { NextRequest, NextResponse } from "next/server";
import {
  getAllSkills, getSkill, searchSkills, generateSkillMd,
  installSkill, uninstallSkill, getInstalledSkills, executeSkill,
} from "@/lib/petclaw/pethub";

// GET /api/petclaw/skills — List or search skills
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "";
  const category = req.nextUrl.searchParams.get("category") || undefined;
  const skillId = req.nextUrl.searchParams.get("id");
  const petId = req.nextUrl.searchParams.get("petId");
  const format = req.nextUrl.searchParams.get("format"); // "md" for SKILL.md

  // Single skill detail
  if (skillId) {
    const skill = getSkill(skillId);
    if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

    if (format === "md") {
      const md = generateSkillMd(skill);
      return new NextResponse(md, {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    return NextResponse.json({ skill });
  }

  // List installed skills for a pet
  if (petId) {
    const installed = await getInstalledSkills(Number(petId));
    const skills = installed.map(i => ({
      ...i,
      manifest: getSkill(i.skillId),
    }));
    return NextResponse.json({ installed: skills });
  }

  // Search/list all skills
  const skills = query || category ? searchSkills(query, category) : getAllSkills();
  return NextResponse.json({ total: skills.length, skills });
}

// POST /api/petclaw/skills — Install, uninstall, or execute
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, petId, skillId, input, config } = body;

  if (!action || !petId) {
    return NextResponse.json({ error: "action and petId required" }, { status: 400 });
  }

  try {
    switch (action) {
      case "install": {
        if (!skillId) return NextResponse.json({ error: "skillId required" }, { status: 400 });
        const result = await installSkill(Number(petId), skillId, config);
        return NextResponse.json({ success: true, installed: result });
      }

      case "uninstall": {
        if (!skillId) return NextResponse.json({ error: "skillId required" }, { status: 400 });
        await uninstallSkill(Number(petId), skillId);
        return NextResponse.json({ success: true, message: `Skill ${skillId} uninstalled` });
      }

      case "execute": {
        if (!skillId) return NextResponse.json({ error: "skillId required" }, { status: 400 });
        const result = await executeSkill(Number(petId), skillId, input || {});
        return NextResponse.json(result);
      }

      case "list": {
        const installed = await getInstalledSkills(Number(petId));
        return NextResponse.json({ installed });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

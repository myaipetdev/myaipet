import { NextRequest, NextResponse } from "next/server";
import {
  getAllSkills, getSkill, searchSkills, generateSkillMd,
  installSkill, uninstallSkill, getInstalledSkills, executeSkill,
} from "@/lib/petclaw/pethub";
import { getUser } from "@/lib/auth";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";
import { consumeDailyQuota, llmSkillDailyCap } from "@/lib/economyGuards";
import { prisma } from "@/lib/prisma";

const PUBLIC_DEMO_PET_ID = 1; // Sparky — the landing-page playground pet

async function ownsPet(req: NextRequest, petId: number): Promise<boolean> {
  const user = await getUser(req).catch(() => null);
  if (!user) return false;
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id } });
  return !!pet;
}

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

  // List installed skills for a pet — ownership required (audit L5), except the
  // public demo pet whose skills are shown on the landing page.
  if (petId) {
    const pid = Number(petId);
    if (pid !== PUBLIC_DEMO_PET_ID && !(await ownsPet(req, pid))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const installed = await getInstalledSkills(pid);
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

  const pid = Number(petId);
  if (!Number.isInteger(pid) || pid <= 0) {
    return NextResponse.json({ error: "Invalid petId" }, { status: 400 });
  }

  // Mutating actions require ownership. Execute on the demo pet is public so
  // the landing-page chat keeps working; execute on any other pet requires auth.
  const needsOwnership =
    action === "install" || action === "uninstall" ||
    (action === "execute" && pid !== PUBLIC_DEMO_PET_ID) ||
    action === "list";

  if (needsOwnership) {
    const ok = await ownsPet(req, pid);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (action === "execute" && pid === PUBLIC_DEMO_PET_ID) {
    // Tight per-IP rate limit on the unauthed demo execute path so a single
    // attacker can't drain Grok/FAL budget via the public demo.
    // (DD report #4 flagged unauthed demo as a cost-abuse surface.)
    const { rateLimit } = await import("@/lib/rateLimit");
    const rl = rateLimit(req, { key: "demo-skill-exec", limit: 6, windowMs: 60_000 });
    if (!rl.ok) return rl.response;
    // Also block expensive non-chat skills from anon demo callers.
    const FREE_DEMO_SKILLS = new Set(["companion-chat", "persona-mirror"]);
    if (skillId && !FREE_DEMO_SKILLS.has(String(skillId))) {
      return NextResponse.json({ error: "Sign in to run this skill" }, { status: 401 });
    }
  }

  try {
    switch (action) {
      case "install": {
        if (!skillId) return NextResponse.json({ error: "skillId required" }, { status: 400 });
        const result = await installSkill(pid, skillId, config);
        return NextResponse.json({ success: true, installed: result });
      }

      case "uninstall": {
        if (!skillId) return NextResponse.json({ error: "skillId required" }, { status: 400 });
        await uninstallSkill(pid, skillId);
        return NextResponse.json({ success: true, message: `Skill ${skillId} uninstalled` });
      }

      case "execute": {
        if (!skillId) return NextResponse.json({ error: "skillId required" }, { status: 400 });

        // POINTS-ECONOMY §2.3 knob #5: the authed skill-execute path was the one
        // LLM-backed surface with NO rate limit — an owner could run llm-prompt
        // skills as unbounded free Grok. Cap LLM-backed skill runs at
        // LLM_SKILL_DAILY_CAP (default 50) per day per pet. The call itself
        // already routes through callLLM (executeLLMSkill), so it also counts
        // against the LLM_DAILY_CALL_CAP / LLM_USER_DAILY_CAP budget.
        const owner = pid !== PUBLIC_DEMO_PET_ID ? await getUser(req).catch(() => null) : null;
        const skillDef = getSkill(String(skillId));
        if (owner && skillDef?.handler === "llm-prompt") {
          const q = await consumeDailyQuota(owner.id, `llm:skill:${pid}`, llmSkillDailyCap());
          if (!q.ok) {
            return NextResponse.json(
              { error: `Daily skill limit reached (${q.cap}/day for this pet) — try again tomorrow.` },
              { status: 429 },
            );
          }
        }

        const result = await executeSkill(pid, skillId, input || {});
        // Running a PetClaw skill as the owner feeds the season (capped; the
        // public demo pet doesn't earn).
        if (owner) await awardPointsCapped(owner.id, "petclaw", 5, DAILY_POINT_CAPS.petclaw).catch(() => {});
        return NextResponse.json(result);
      }

      case "list": {
        const installed = await getInstalledSkills(pid);
        return NextResponse.json({ installed });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    // Don't leak internal errors
    console.error("skills POST error:", e?.message);
    return NextResponse.json({ error: "Action failed" }, { status: 400 });
  }
}

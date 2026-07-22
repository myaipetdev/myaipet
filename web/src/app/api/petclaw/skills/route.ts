import { NextRequest, NextResponse } from "next/server";
import {
  getAllSkills, getSkill, searchSkills, generateSkillMd,
  installSkill, uninstallSkill, getInstalledSkills, executeSkill,
  assertSkillExecutableForPet, isSkillPolicyError, validateSkillConfig,
  validateSkillInput, CORE_RUNTIME_SKILL_IDS,
} from "@/lib/petclaw/pethub";
import { getAuthContext, getUser } from "@/lib/auth";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";
import { consumeDailyQuota, llmSkillDailyCap } from "@/lib/economyGuards";
import { prisma } from "@/lib/prisma";
import { readBoundedJsonBody } from "@/lib/petclaw/bounded-json-body";

async function ownsPet(userId: number, petId: number): Promise<boolean> {
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: userId } });
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

  // Installed-skill state belongs to a real pet and is always owner-only.
  if (petId) {
    const pid = Number(petId);
    const user = await getUser(req).catch(() => null);
    if (!user || !Number.isInteger(pid) || pid <= 0 || !(await ownsPet(user.id, pid))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const installed = await getInstalledSkills(pid);
    const skills = installed.map(i => ({
      ...i,
      manifest: getSkill(i.skillId),
    }));
    const installedIds = new Set(installed.map((entry) => entry.skillId));
    const runtime = getAllSkills().map((manifest) => ({
      skillId: manifest.id,
      runtimeStatus: CORE_RUNTIME_SKILL_IDS.has(manifest.id)
        ? "core"
        : installedIds.has(manifest.id)
          ? "installed"
          : "available",
      core: CORE_RUNTIME_SKILL_IDS.has(manifest.id),
      hasInstallRecord: installedIds.has(manifest.id),
    }));
    return NextResponse.json({ installed: skills, runtime });
  }

  // Search/list all skills
  const skills = query || category ? searchSkills(query, category) : getAllSkills();
  return NextResponse.json({ total: skills.length, skills });
}

// POST /api/petclaw/skills — Install, uninstall, or execute
export async function POST(req: NextRequest) {
  // Authenticate before reading/parsing caller-controlled bytes. The bounded
  // reader enforces the same limit when Content-Length is missing or false.
  const auth = await getAuthContext(req).catch(() => null);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsedBody = await readBoundedJsonBody(req, 16 * 1024);
  if (parsedBody.ok === false) {
    return NextResponse.json(
      { error: parsedBody.reason === "too_large" ? "Request body too large" : "Invalid JSON body" },
      { status: parsedBody.reason === "too_large" ? 413 : 400 },
    );
  }
  const body = parsedBody.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const fields = body as Record<string, unknown>;
  const action = typeof fields.action === "string" ? fields.action : "";
  const skillId = typeof fields.skillId === "string" ? fields.skillId : "";
  const { petId, input, config } = fields;
  if (auth.credential === "extension") {
    const extensionSkills = new Set(["companion-chat", "summarize-page", "image-gen"]);
    if (action !== "execute" || !extensionSkills.has(String(skillId || ""))) {
      return NextResponse.json({ error: "Extension token scope does not allow this action" }, { status: 403 });
    }
  }

  if (!action || !petId) {
    return NextResponse.json({ error: "action and petId required" }, { status: 400 });
  }

  const pid = Number(petId);
  if (!Number.isInteger(pid) || pid <= 0) {
    return NextResponse.json({ error: "Invalid petId" }, { status: 400 });
  }

  // Every action targets stored pet state or can spend model budget. Anonymous
  // previews use /api/petclaw/demo-chat, which has no pet, DB, LLM or memory.
  if (!(await ownsPet(auth.user.id, pid))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    switch (action) {
      case "install": {
        if (!skillId) return NextResponse.json({ error: "skillId required" }, { status: 400 });
        const configValidation = validateSkillConfig(String(skillId), config);
        if ("error" in configValidation) {
          return NextResponse.json(
            { error: configValidation.error, code: "skill_config_rejected" },
            { status: 400 },
          );
        }
        const result = await installSkill(pid, String(skillId), configValidation.config);
        const core = CORE_RUNTIME_SKILL_IDS.has(String(skillId));
        return NextResponse.json({
          success: true,
          installed: result,
          runtimeStatus: core ? "core" : "installed",
          ...(core ? { note: "This core skill was already executable; the install record stores its version and optional preferences." } : {}),
        });
      }

      case "uninstall": {
        if (!skillId) return NextResponse.json({ error: "skillId required" }, { status: 400 });
        await uninstallSkill(pid, skillId);
        const core = CORE_RUNTIME_SKILL_IDS.has(skillId);
        return NextResponse.json({
          success: true,
          runtimeStatus: core ? "core" : "available",
          message: core
            ? `Saved ${skillId} install preferences removed; the core runtime capability remains available`
            : `Skill ${skillId} uninstalled`,
        });
      }

      case "execute": {
        if (!skillId) return NextResponse.json({ error: "skillId required" }, { status: 400 });
        if (input !== undefined && (!input || typeof input !== "object" || Array.isArray(input))) {
          return NextResponse.json({ error: "input must be an object" }, { status: 400 });
        }
        const safeInput = (input || {}) as Record<string, unknown>;
        if (Object.keys(safeInput).length > 20) {
          return NextResponse.json({ error: "Too many input fields" }, { status: 400 });
        }
        let inputJson: string;
        try { inputJson = JSON.stringify(safeInput); }
        catch { return NextResponse.json({ error: "input must be JSON-serializable" }, { status: 400 }); }
        if (Buffer.byteLength(inputJson, "utf8") > 4 * 1024
          || Object.values(safeInput).some((value) => typeof value === "string" && value.length > 2_000)) {
          return NextResponse.json({ error: "Skill input is too large" }, { status: 413 });
        }

        const skillDef = getSkill(String(skillId));
        if (!skillDef) {
          return NextResponse.json(
            { error: `Skill not found: ${String(skillId)}`, code: "skill_not_found" },
            { status: 404 },
          );
        }
        // Validate the exact manifest contract before policy preflight, quota
        // reservation, or any LLM/provider work. executeSkill repeats this at
        // its direct-call boundary for agent/channel callers.
        const inputValidation = validateSkillInput(skillDef, safeInput);
        if (inputValidation.ok === false) {
          return NextResponse.json(
            { error: inputValidation.error, code: "skill_input_invalid" },
            { status: 400 },
          );
        }

        // POINTS-ECONOMY §2.3 knob #5: the authed skill-execute path was the one
        // LLM-backed surface with NO rate limit — an owner could run llm-prompt
        // skills as unbounded free Grok. Cap LLM-backed skill runs at
        // LLM_SKILL_DAILY_CAP (default 50) per day per pet. The call itself
        // already routes through callLLM (executeLLMSkill), so it also counts
        // against the LLM_DAILY_CALL_CAP / LLM_USER_DAILY_CAP budget.
        const owner = auth.user;
        // Check install + level + personality before burning the owner's daily
        // LLM quota. executeSkill repeats this at the actual execution boundary.
        await assertSkillExecutableForPet(pid, String(skillId));
        if (owner && skillDef?.handler === "llm-prompt") {
          const q = await consumeDailyQuota(owner.id, `llm:skill:${pid}`, llmSkillDailyCap());
          if (!q.ok) {
            return NextResponse.json(
              { error: `Daily skill limit reached (${q.cap}/day for this pet) — try again tomorrow.` },
              { status: 429 },
            );
          }
        }

        const result = await executeSkill(pid, skillId, inputValidation.input);
        // A resolver-only api-call result did not run its endpoint. Award only
        // after this invocation confirms a durable committed side effect.
        if (owner && result.success && result.sideEffectCommitted) {
          await awardPointsCapped(owner.id, "petclaw", 5, DAILY_POINT_CAPS.petclaw).catch(() => {});
        }
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
    if (isSkillPolicyError(e)) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    // Don't leak internal errors.
    console.error("skills POST error:", e?.message);
    return NextResponse.json({ error: "Action failed" }, { status: 400 });
  }
}

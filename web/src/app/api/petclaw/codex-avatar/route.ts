/**
 * Codex Avatar export — converts a PetClaw pet into a Codex Desktop avatar bundle.
 *
 * Reference spec: ~/.codex/avatars/<id>/avatar.json + spritesheet.webp
 * - Spritesheet: 1536×1872, 8 columns × 9 rows, 192×208 per frame
 * - Rows map to states: idle / running-right / running-left / waving / jumping
 *                       / failed / waiting / running / review
 *
 * GET ?petId=N&format=json  → avatar.json metadata only
 *                  format=md    → install instructions Markdown
 *                  format=manifest → bundle manifest (JSON describing files)
 */

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const PETCLAW_STATES = [
  { row: 0, state: "idle",         frames: 6, desc: "Pet is calm, waiting on you" },
  { row: 1, state: "running-right",frames: 8, desc: "Forward execution / generating content" },
  { row: 2, state: "running-left", frames: 8, desc: "Looking back / inspecting memory" },
  { row: 3, state: "waving",       frames: 4, desc: "Greeting, ready, request fulfilled" },
  { row: 4, state: "jumping",      frames: 5, desc: "Level up / evolution / milestone" },
  { row: 5, state: "failed",       frames: 8, desc: "Action blocked, attention needed" },
  { row: 6, state: "waiting",      frames: 6, desc: "Waiting on user, external event, rate limit" },
  { row: 7, state: "running",      frames: 6, desc: "24/7 background loop active" },
  { row: 8, state: "review",       frames: 6, desc: "Reviewing context, preparing report" },
];

function petToAvatarJson(pet: any) {
  const slug = (pet.name || "claw").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "claw";
  return {
    id: slug,
    displayName: pet.name,
    description: `${pet.personality_type || "friendly"} ${pet.element || "normal"} pet from MY AI PET (PetClaw protocol). Level ${pet.level}.`,
    spritesheetPath: "spritesheet.webp",
    metadata: {
      protocol: "petclaw-v1",
      petId: pet.id,
      species: pet.species,
      personalityType: pet.personality_type,
      element: pet.element,
      level: pet.level,
      evolutionStage: pet.evolution_stage,
      avatarSourceUrl: pet.avatar_url || null,
      exportedAt: new Date().toISOString(),
    },
    states: PETCLAW_STATES,
    spritesheet: {
      width: 1536,
      height: 1872,
      columns: 8,
      rows: 9,
      frameWidth: 192,
      frameHeight: 208,
      format: "webp",
      transparent: true,
    },
  };
}

function installInstructionsMd(pet: any, slug: string): string {
  return `# Install ${pet.name} as your Codex Avatar

This bundle turns your PetClaw pet into a Codex Desktop avatar — a floating
companion that lives next to your editor and reflects what your 24/7 agent
is doing.

## Quick install (macOS / Linux)

\`\`\`bash
# 1. Create the avatar folder
mkdir -p ~/.codex/avatars/${slug}

# 2. Save the avatar.json next to this file
curl -o ~/.codex/avatars/${slug}/avatar.json \\
  "https://app.myaipet.ai/api/petclaw/codex-avatar?petId=${pet.id}&format=json"

# 3. Drop your spritesheet (1536×1872 webp, 8×9 grid) into the folder
#    cp ~/Downloads/spritesheet.webp ~/.codex/avatars/${slug}/spritesheet.webp

# 4. Open Codex Desktop → Settings → Avatar → Refresh
\`\`\`

## Spritesheet spec

| Property | Value |
|----------|-------|
| Total size | 1536 × 1872 |
| Grid | 8 columns × 9 rows |
| Frame size | 192 × 208 |
| Format | WebP (PNG fine too) |
| Background | Transparent |
| Style | Pixel art or clean vector |

## State → row map

| Row | State | Frames | When PetClaw uses it |
|-----|-------|-------:|----------------------|
${PETCLAW_STATES.map(s => `| ${s.row} | \`${s.state}\` | ${s.frames} | ${s.desc} |`).join("\n")}

## Status protocol

If you also run the *Claw 24/7 agent, write its current state to
\`~/.claw/status.json\` and any avatar overlay that reads it (or our
upcoming overlay-bridge) will animate the matching row.

\`\`\`json
{
  "state": "review",
  "summary": "Verifying overnight test runs",
  "updatedAt": "2026-05-06T15:30:00+09:00"
}
\`\`\`

Allowed \`state\` values: ${PETCLAW_STATES.map(s => `\`${s.state}\``).join(", ")}

## Source

- Web export: <https://app.myaipet.ai/codex>
- API: \`GET /api/petclaw/codex-avatar?petId=${pet.id}&format=json\`
- Architecture: <https://app.myaipet.ai/architecture>
`;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const petId = Number(sp.get("petId"));
  const format = sp.get("format") || "json";
  if (!petId) return NextResponse.json({ error: "petId required" }, { status: 400 });

  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id, is_active: true } });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const avatarJson = petToAvatarJson(pet);
  const slug = avatarJson.id;

  if (format === "json") {
    return new NextResponse(JSON.stringify(avatarJson, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="avatar.json"`,
      },
    });
  }

  if (format === "md") {
    return new NextResponse(installInstructionsMd(pet, slug), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-INSTALL.md"`,
      },
    });
  }

  // manifest: describes both files + how to fetch them
  return NextResponse.json({
    pet: { id: pet.id, name: pet.name, slug },
    avatar: avatarJson,
    files: {
      avatar_json: `https://app.myaipet.ai/api/petclaw/codex-avatar?petId=${pet.id}&format=json`,
      install_md:  `https://app.myaipet.ai/api/petclaw/codex-avatar?petId=${pet.id}&format=md`,
      // Spritesheet generation is intentionally manual for v1; users provide their own art.
      // A pre-baked default spritesheet placeholder can be served from /public/codex-default-spritesheet.webp later.
      spritesheet_default: `https://app.myaipet.ai/codex-default-spritesheet.webp`,
    },
    quickInstall: {
      shell: [
        `mkdir -p ~/.codex/avatars/${slug}`,
        `curl -o ~/.codex/avatars/${slug}/avatar.json "https://app.myaipet.ai/api/petclaw/codex-avatar?petId=${pet.id}&format=json"`,
        `# place your 1536×1872 spritesheet at ~/.codex/avatars/${slug}/spritesheet.webp`,
        `# Codex Desktop → Settings → Avatar → Refresh`,
      ],
    },
  });
}
